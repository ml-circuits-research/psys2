#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3b report: merges (1) the Romanian run of scripts/e3b-ro.mjs, (2) E3 on the gold-para class-b cases of E1 by name (three e1-collect runs of the gold set:
 * hand-written patterns, PSYS_GEN_PATTERNS=add, PSYS_GEN_PATTERNS=only), (3) what core.word could and could not carry, into training/results/e3b-2026-11-12.{json,md}.
 *
 *   node scripts/e3b-report.mjs <e3b-ro.json> <gold-base.json> <gold-add.json> <gold-only.json> [--out training/results/e3b-2026-11-12]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [roFile, baseFile, addFile, onlyFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outBase = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'training/results/e3b-2026-11-12';
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const ro = J(roFile);
const audit = J(join(REPO, 'training/results/e1-audit-2026-11-12.json'));
const rowsOf = (f) => { const d = J(f); return new Map((d.rows ?? d).map((r) => [`${r.set}|${r.id}`, r])); };
const base = rowsOf(baseFile), add = rowsOf(addFile), only = rowsOf(onlyFile);
const bCases = audit.modes.rules.cases.filter((x) => x.set === 'gold-para' && x.cls === 'b');
const gold = bCases.map((x) => {
  const k = `gold-para|${x.id}`;
  return { id: x.id, world: x.world, message: x.message, base: base.get(k)?.outcome, add: add.get(k)?.outcome, only: only.get(k)?.outcome, patternOnly: only.get(k)?.segments?.[0]?.pattern ?? null };
});
const gTally = (k) => { const t = { n: gold.length, right: 0, wrong: 0, not_understood: 0 }; for (const g of gold) t[g[k] === 'right' ? 'right' : g[k] === 'not_understood' ? 'not_understood' : 'wrong']++; return t; };
const paraAll = (m) => { const t = { n: 0, right: 0, wrong: 0, not_understood: 0 }; for (const [k, r] of m) if (k.startsWith('gold-para|')) { t.n++; t[r.outcome === 'right' ? 'right' : r.outcome === 'not_understood' ? 'not_understood' : 'wrong']++; } return t; };

// core.word: what it carried and what it could not
const WORLDS = ['kids.shop', 'geo.map', 'docs.editor'];
const wordStats = {};
for (const w of WORLDS) {
  const text = readFileSync(join(REPO, 'worlds', w, 'describe.sop'), 'utf8');
  const matrix = readFileSync(join(REPO, 'worlds', w, 'matrix.sop'), 'utf8');
  const means = [...text.matchAll(/^@\S+ core\.word .*?means=(\S+)/gm)].map((m) => m[1]);
  const uniq = [...new Set(means)];
  const inMatrix = (m) => new RegExp(`(?<![\\w.])${m.replace(/\./g, '\\.')}(?![\\w.])`).test(matrix);
  const argLevel = uniq.filter((m) => /\.[a-z]\d?$|\.(item|amt|ord|kind|ordinal|w|t|p|q|a|b|c|d|e|l|n|m|i1|i2|role)$/.test(m) && !inMatrix(m));
  wordStats[w] = { wires: means.length, distinctMeans: uniq.length, meansNamedInMatrix: uniq.filter(inMatrix).length, meansNotInMatrix: uniq.filter((m) => !inMatrix(m)).length };
}

const out = { date: new Date().toISOString(), reasoner: ro.reasoner, romanian: { pack: ro.pack, cases: ro.cases, fCases: ro.fCases, all: ro.all, perWorld: ro.perWorld, fCasesTally: ro.fCasesTally, fCasesPerWorld: ro.fCasesPerWorld, newlyWrong: ro.newlyWrong, gainedGuard: ro.gainedGuard, lostRight: ro.lostRight, english: ro.english },
  gold: { classB: gold.length, tally: { base: gTally('base'), add: gTally('add'), only: gTally('only') }, paraAll: { base: paraAll(base), add: paraAll(add), only: paraAll(only) }, cases: gold },
  coreWord: wordStats, rows: ro.rows };
writeFileSync(`${outBase}.json`, JSON.stringify(out, null, 1));

const T = (t) => `${t.right} / ${t.wrong} / ${t.not_understood}`;
const md = [];
md.push('# E3b: corrections to E3 and Romanian from descriptions (2026-11-12)', '');
md.push('Measurement and proposal. English behaviour and defaults are unchanged; the Romanian pack is opt-in (`PSYS_GEN_LANG=ro`, `lang/ro/`, outside the worlds). Raw data: `e3b-2026-11-12.json`; scripts: `scripts/e3b-ro.mjs`, `scripts/e3b-report.mjs`.', '');
md.push('## 1. One language: no notation inside values', '', 'Descriptions are wires and keys now (spec 03 section 2c): `core.describe`, one `core.describe.arg` per argument (`of`, `name`, `class`, `optional=true`, `qty`), one `core.describe.words` per language with repeated keys. `arg="i2:lex.kids.shop.items?*n2;prep=and|plus"` became `name=i2 class=lex.kids.shop.items optional=true qty=n2` plus `prep.i2=$w.en.and...` and `prep.i2=$w.en.plus...`. Lists (`verb="a|b"`), `frames="a,b"` and `sample="a=b;c=d"` are repeated keys (`sample.i1=ball`). **The generated patterns of kids.shop, geo.map and docs.editor are byte-identical before and after** (`node scripts/gen-from-descriptions.mjs <world>` compared with `cmp`, 1367 / 911 / 558 lines).', '');
md.push('## 2. The library\'s words: `core.word`', '', 'Every word of a description is a `core.word lang=en text=... means=...` wire, referred to by the role keys of `core.describe.words`; the loader checks that a word means what its role needs.', '');
md.push('| world | word wires | distinct `means` | named in the matrix | not in the matrix |', '|---|---:|---:|---:|---:|');
for (const w of WORLDS) md.push(`| ${w} | ${wordStats[w].wires} | ${wordStats[w].distinctMeans} | ${wordStats[w].meansNamedInMatrix} | ${wordStats[w].meansNotInMatrix} |`);
md.push('', '**What `core.word` cannot carry** (kept by the description, not host-only keys on the word):', '',
  '1. **The role of the word in a sentence** (verb, noun, question opener, trailing verb, rest, introducer of an argument). `core.word` has `lang text means of` only; the role is the key of the `core.describe.words` wire that refers to the word.',
  '2. **Order and alternatives.** The generator writes its example sentence from the first alternative and keeps the order of the references; the library says "one wire, one meaning" and has no order.',
  '3. **Several descriptions of one operation with different words** (geo.zoom in / out, doc.addHeading with heading / title / role): the words are per description, so they are reached through the description, not through `means` alone.',
  '4. **Arguments are not matrix keys.** `means=<op>.<argument>` (the words that introduce an argument, its determiners, its units) names a role of the description (`kids.shop.purchase.i2`), which is not a slot of the matrix; the library would warn `unknown-word` for those unless the description\'s argument names are matrix keys. Operation-level words (`means=kids.shop.purchase`) resolve when the operation is a type of the matrix (the "named in the matrix" column).',
  '5. **Multi-word words** are one `text` with spaces (the library tokenizes in the host); inflection is the host\'s (the library\'s own limit): every form is a word (Romanian: `capitala`, `capitală`).',
  '6. **Slot values in another language** need a canonical value: `core.word lang=ro text=zmeu means=kite of=lex.kids.shop.items` carries it, but the engine\'s lexicons and `{slot:lex.x}` capture only the surface word, so today a host pre-pass rewrites the words (see 3).', '');
md.push('## 3. Romanian from descriptions (a measured proposal for the user)', '');
md.push('**What was built** (all opt-in, no world file and no AGENTS.md rule changed):', '',
  `- \`lang/ro/frames.sop\`: the Romanian grammar for the same frame table (word order, \`un|o\`, \`vreau să\`, \`pot\`, \`cât costă\`, \`care este\`, \`unde e\`, lead-ins and "te rog"), as \`core.describe.frame\` wires.`,
  `- \`lang/ro/<world>.sop\`: \`core.describe.words lang=ro\` and \`core.word lang=ro\` wires for ${Object.entries(ro.pack.perWorld).map(([w, n]) => `${w} (${n} generated patterns)`).join(', ')}: kids.shop 11 of 11 descriptions, geo.map 9 of 27, docs.editor 6 of 25. ${ro.pack.roPatterns} Romanian patterns in all, 0 load errors.`,
  `- \`lang/ro/<world>.entities.sop\`: ${ro.pack.entityWords} words for slot values (places from the translator's place table, shop items, document kinds), \`means\` = the canonical value.`,
  '- Reading: the pack\'s patterns read the Romanian text directly; a pre-pass (`entityReader`) folds diacritics and rewrites entity words to their canonical value (nothing else is translated). Free text (titles, paragraphs, list items) is kept as the user wrote it.', '');
md.push(`**Routes** (the same ${ro.cases} Romanian cases of the three worlds, \`operational-ro.jsonl\`, the same checker; right / wrong / not understood, partly counted as wrong):`, '',
  '- T: the rules translator (current); F: the webchat switch translator with the fake on-device Translator as an ORACLE (returns the English source: a perfect translator, an upper bound);',
  '- P: generated Romanian patterns only, no English pattern reads the text (isolation mode, `PSYS_GEN_LANG_ONLY`, measurement only);',
  '- C: pack first (accepted when every segment was read and the engine did not say "I understood only part of that"), else T; CJ: also send every message with a Romanian joiner (`și`, `apoi`, `iar`, `după`) to T. The L variants count a case right when its only failing items compare the text of a block (the pack keeps the user\'s own text, the case expects the English text of its source: `Cumpărături` against `Shopping`).', '');
md.push('| cases | route | right / wrong / not understood |', '|---|---|---|');
for (const [name, tab] of [[`E1 f-cases (${ro.fCases})`, ro.fCasesTally], [`all Romanian cases of the three worlds (${ro.cases})`, ro.all]]) for (const k of ['T', 'F', 'P', 'C', 'CL', 'CJ', 'CJL']) md.push(`| ${name} | ${k} | ${T(tab[k])} |`);
md.push('', '**Per world** (right / wrong / not understood):', '', '| world | f-cases T | f-cases CJL | all T | all CJL |', '|---|---|---|---|---|');
for (const w of WORLDS) md.push(`| ${w} | ${T(ro.fCasesPerWorld[w].T)} (of ${ro.fCasesPerWorld[w].T.n}) | ${T(ro.fCasesPerWorld[w].CJL)} | ${T(ro.perWorld[w].T)} | ${T(ro.perWorld[w].CJL)} |`);
md.push('', `**Gate: no new wrong answers** (a case that is right or not understood on T and wrong on the pack route). Strict: C ${ro.newlyWrong.C.length}, CJ ${ro.newlyWrong.CJ.length}. Lenient (free text kept in Romanian): C ${ro.newlyWrong.CL.length}, **CJ ${ro.newlyWrong.CJL.length}**. P alone, with no fallback: ${ro.newlyWrong.P.length}. F (oracle): ${ro.newlyWrong.F.length}. English cases of the three worlds with the pack added to everything else: ${ro.english.changed.length} of ${ro.english.cases} changed.`, '');
md.push('Findings:', '',
  `1. The strict gate is **not met** (CJ ${ro.newlyWrong.CJ.length}); with the user's own text kept in Romanian it is met (CJL ${ro.newlyWrong.CJL.length}). Every strict miss is a block text compared with the English text of the source ("Cumparaturi" against "Shopping"); the translator route turns the user's words into English, which is what the cases were built from. Whether a Romanian user wants "Cumpărături" or "Shopping" in the document is the user's call; the pack keeps what was typed.`,
  '2. **Joiners.** The clause splitter and the list-item splitter know English joiners only: `și` inside a free-text slot is swallowed ("adaugă un titlu A, un titlu B și un titlu C" reads one title; "listă cu lapte și ouă" one item). Without the joiner guard (C) there are 8 such new wrong answers; with it none. The cure is a per-language joiner list in the engine (a language-pack input), not more patterns.',
  '3. **Entity words that are also role words** (`titlu`, `listă`, `paragraf`, `ultimul`) cannot be rewritten by a pre-pass without breaking the patterns that expect them: they are left alone, so "șterge ultimul paragraf" (kind slot) stays uncovered. A per-language surface form in the engine\'s lexicons removes both this and the pre-pass.',
  '4. **What is not described is not covered**: geo.map goto-coordinates, country count, "du-mă la", hexagon sides; docs.editor convert / bold / move; compound requests. These cases stay not understood on P and fall to T; the description gap is the same as in English (E3).',
  '5. **Isolation matters.** With English hand-written patterns allowed to read the Romanian text, wrong readings appear ("Câte liste sunt?" read as "is Cate on my sunt list"); the pack route is only safe when a Romanian message is read by Romanian patterns (or by the translator route), never by the English ones.', '');
md.push(`**f-cases gained by the pack route (CJL, right where T was not):** ${ro.gainedGuard.length} of ${ro.fCases}: ${ro.gainedGuard.join(', ')}.`, '');
md.push('## 4. E3 on gold-para, the class-b cases of E1, by name', '',
  `E1 class b (a structure no pattern covers) in gold-para, rules mode: ${gold.length} cases. Three runs of the gold set: hand-written patterns (base), \`PSYS_GEN_PATTERNS=add\`, \`PSYS_GEN_PATTERNS=only\`. Right / wrong / not understood on these ${gold.length}: base ${T(out.gold.tally.base)}, add ${T(out.gold.tally.add)}, only ${T(out.gold.tally.only)}. Whole gold-para (100): base ${T(out.gold.paraAll.base)}, add ${T(out.gold.paraAll.add)}, only ${T(out.gold.paraAll.only)}.`, '',
  `Only ${gold.filter((g) => WORLDS.includes(g.world)).length} of the ${gold.length} are in a world that has descriptions (kids.shop, docs.editor); the others (ui.shell, kids.animals, hangman, ...) have none, so generation cannot touch them. Generated patterns cover none of the class-b cases that the hand-written ones miss: they hold the same words and the same frames, so the paraphrases that no pattern covers stay uncovered. This is the E3 result restated on the named cases; closing class b needs new frames and words in the descriptions (or encoder + n1), not the generator.`, '',
  '| case | world | base | add | only | message |', '|---|---|---|---|---|---|');
for (const g of gold) md.push(`| ${g.id} | ${g.world} | ${g.base} | ${g.add} | ${g.only} | ${String(g.message).replace(/\|/g, '/').slice(0, 90)} |`);
md.push('', '## 5. The question for the user', '', 'May a Romanian language pack (`lang/ro/`, outside the worlds) hold Romanian words? Worlds stay English-only either way; the pack is language-boundary data like the translator tables, it is opt-in (`PSYS_GEN_LANG=ro`), and AGENTS.md is unchanged until you decide.', '');
writeFileSync(`${outBase}.md`, md.join('\n'));
console.log(`wrote ${outBase}.json and ${outBase}.md`);
