#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Derives the open-lexicon part of the w.lang.ro hand-over (handover/w.lang.ro/dictionary/*.tsv) from the translator's lexicon, for the lemmas the app needs
 * (every Romanian word of training/eval/ro-en-meaning/rows.jsonl that the translator analyses), and prints the paradigm-class statistics the
 * morphology shard is written against. Romanian words are DATA here (the language world), never identifiers.
 *
 *   node scripts/build-handover-lang-ro.mjs <knowledge catalog folder>      (writes handover/w.lang.ro/dictionary/ and handover/w.lang.ro/STATS.json)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, foldKey } from '../src/translate/normalize.mjs';
import { analyze } from '../src/translate/morphology.ro.mjs';
import * as lex from '../src/translate/lexicon.ro-en.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAT = process.argv[2];
const OUT = join(REPO, 'handover/w.lang.ro');
mkdirSync(join(OUT, 'dictionary'), { recursive: true });

// ---- the catalog's sense ids -----------------------------------------------------------------------------------------------------------------
const ids = new Set(), verbActs = new Map();
const shards = (k) => { const d = join(CAT, 'docs/worlds', k, 'shards'); return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.sop')).map((f) => readFileSync(join(d, f), 'utf8')) : []; };
for (const k of ['k.words', 'k.colours']) for (const src of shards(k)) for (const m of src.matchAll(/^@(k\.words\.[^ ]+\.(?:noun|adj|verb)\.1|k\.colours\.psys2\.[^ ]+) /gm)) ids.add(m[1]);
for (const src of shards('k.actions')) for (const m of src.matchAll(/^@k\.actions\.verb\.([a-z_]+)\.([a-z_]+) /gm)) { const t = m[2]; (verbActs.get(t) ?? verbActs.set(t, []).get(t)).push(m[1]); }
const under = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const nounSense = (en) => { const id = `k.words.${under(en)}.noun.1`; return ids.has(id) ? id : ''; };
const adjSense = (en) => { const c = `k.colours.psys2.${under(en)}`; if (ids.has(c)) return c; const id = `k.words.${under(en)}.adj.1`; return ids.has(id) ? id : ''; };
const verbSense = (en) => { const acts = verbActs.get(under(en)); if (acts) return `k.actions.verb.${acts[0]}.${under(en)}`; const id = `k.words.${under(en)}.verb.1`; return ids.has(id) ? id : ''; };

// ---- the lemmas the app needs --------------------------------------------------------------------------------------------------------------
const rows = readFileSync(join(REPO, 'training/eval/ro-en-meaning/rows.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const wanted = { noun: new Map(), verb: new Map(), adj: new Map() };
let tokens = 0, analysed = 0;
for (const r of rows) for (const t of tokenize(r.ro)) {
  if (t.kind !== 'word') continue;
  tokens++;
  const as = analyze(t.key);
  if (as.length) analysed++;
  for (const a of as) if (wanted[a.pos]) wanted[a.pos].set(a.entry.ro ?? a.entry.inf, a.entry);
}
const lcp = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

// ---- classes -------------------------------------------------------------------------------------------------------------------------------
const nounClass = (e) => { if (e.g === 'f' && /ie$/.test(e.ro) && /ii$/.test(e.rop ?? '')) return 'n.f.ie-ii'; const k = lcp(e.ro, e.rop ?? e.ro); return `n.${e.g}.${e.ro.slice(k) || '_'}-${(e.rop ?? e.ro).slice(k) || '_'}`; };
const adjClass = (e) => { const f = e.forms; if (!f.fs) return 'a.invariant'; const k = Math.min(lcp(f.ms, f.fs), lcp(f.ms, f.mp), lcp(f.ms, f.fp)); const suf = (x) => x.slice(k) || '_'; return `a.${suf(f.ms)}-${suf(f.fs)}-${suf(f.mp)}-${suf(f.fp)}`; };
const verbClass = (e) => { const m = /^(a|az|is|i|ii):(.*)$/.exec(e.pres ?? ''); return m ? `v.${m[1]}` : 'v.irregular'; };
const stats = { nouns: {}, verbs: {}, adjs: {} };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const lines = [];
for (const e of wanted.noun.values()) { const c = nounClass(e); bump(stats.nouns, c); lines.push({ lemma: e.ro, cls: c, g: e.g, sense: nounSense(e.en), en: e.en, pos: 'noun', pl: e.rop }); }
for (const e of wanted.verb.values()) { const c = verbClass(e); bump(stats.verbs, c); lines.push({ lemma: e.inf, cls: c, g: '', sense: verbSense(e.en), en: e.en, pos: 'verb', pres: e.pres }); }
for (const e of wanted.adj.values()) { const c = adjClass(e); bump(stats.adjs, c); lines.push({ lemma: e.ro, cls: c, g: '', sense: adjSense(e.en), en: e.en, pos: 'adj', forms: e.forms }); }
// a class with fewer than 4 lemmas is not a paradigm: its lemmas carry their forms (irregular rows), as in the library's notation
const MIN = 4;
const isParadigm = (pos, c) => (stats[pos + 's'][c] ?? 0) >= MIN && !c.endsWith('irregular');
for (const l of lines) l.paradigm = isParadigm(l.pos, l.cls);
const byLetter = {};
for (const l of lines.sort((a, b) => foldKey(a.lemma).localeCompare(foldKey(b.lemma)))) (byLetter[foldKey(l.lemma)[0]] ??= []).push(l);
const header = (letter) => `# w.lang.ro dictionary, lemmas starting with ${letter}: lemma<TAB>pos:class<TAB>gender<TAB>sense<TAB>forms-if-listed (irregular: the forms no paradigm covers)\n# source: PSys2 src/translate/lexicon.ro-en.mjs (hand-written for the app; CC0-1.0), lemmas the app's Romanian sets need\n# sense: a k.words / k.colours sense id or a k.actions verb id; empty = no sense in the catalog yet (the English gloss in the last column)\n`;
for (const [letter, ls] of Object.entries(byLetter)) {
  writeFileSync(join(OUT, 'dictionary', `${letter}.tsv`), header(letter) + ls.map((l) => [l.lemma, `${l.pos}:${l.paradigm ? l.cls : 'irregular'}`, l.g, l.sense, l.paradigm ? '' : (l.pos === 'noun' ? `pl=${l.pl}` : l.pos === 'verb' ? `pres=${l.pres}` : `forms=${Object.values(l.forms ?? {}).join(',')}`), l.en].join('\t')).join('\n') + '\n');
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const inPar = (pos) => Object.entries(stats[pos]).filter(([c, n]) => n >= MIN && !c.endsWith('irregular')).reduce((a, [, n]) => a + n, 0);
const summary = {
  tokensInSets: tokens, tokensAnalysedByTranslator: analysed,
  lemmas: { nouns: wanted.noun.size, verbs: wanted.verb.size, adjectives: wanted.adj.size },
  paradigmClasses: { nouns: Object.entries(stats.nouns).filter(([, n]) => n >= MIN).length, verbs: Object.entries(stats.verbs).filter(([, n]) => n >= MIN).length, adjectives: Object.entries(stats.adjs).filter(([, n]) => n >= MIN).length },
  lemmasCoveredByParadigm: { nouns: inPar('nouns'), verbs: inPar('verbs'), adjectives: inPar('adjs') },
  sensesLinked: lines.filter((l) => l.sense).length, lemmasTotal: lines.length,
  topNounClasses: Object.entries(stats.nouns).sort((a, b) => b[1] - a[1]).slice(0, 14), verbClasses: stats.verbs, adjClasses: Object.entries(stats.adjs).sort((a, b) => b[1] - a[1]).slice(0, 8),
};
writeFileSync(join(OUT, 'STATS.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
