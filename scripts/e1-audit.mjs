#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E1 (FORMALIZE-FROM-WORLDS): classify every non-right case of the audited sets by cause, from the raw files of scripts/e1-collect.mjs.
 *
 *   node scripts/e1-audit.mjs --rules <raw-rules.json> --enc <raw-enc.json> [--dump] [--out training/results/e1-audit-2026-11-12]
 *
 * Classes: a missing word | b structure no pattern covers | c ambiguity the STATE resolves | d ambiguity the SCHEMA resolves | e intent to guess
 *          f Romanian-specific | g expectation wrong | h segmentation of compound messages.
 * Each case carries `how`: mech (decided by a mechanical test), mech-pair (RO-vs-EN-source pairing), inspect (a human decision in scripts/e1-overrides.json),
 * default (nothing above applied: b by elimination).
 * Measurement only: reads worlds/ read-only to build the vocabulary, runs the rule formalizer (read-only sessions) for the segmentation test.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { languageEvidence } from '../src/translate/index.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const CLASSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const NAMES = { a: 'missing word', b: 'structure no pattern covers', c: 'state resolves', d: 'schema resolves', e: 'intent to guess', f: 'Romanian-specific', g: 'expectation wrong', h: 'compound segmentation' };

// ---- vocabulary of the worlds (lexicon words, alternatives, pattern literals, phrase groups) -----------------------------------------
function buildVocab() {
  const vocab = new Set();
  const add = (s) => { for (const w of s.toLowerCase().match(/[a-z][a-z']*/g) ?? []) vocab.add(w); };
  for (const w of readdirSync(join(REPO, 'worlds'))) for (const f of ['lexicon.sop', 'patterns.sop', 'matrix.patterns.sop', 'legend.sop']) {
    const p = join(REPO, 'worlds', w, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s+(word|alt|plural|frame|match)=(.*)$/.exec(line);
      if (m) add(m[2].replace(/\{[^}]*\}/g, ' ').replace(/[[\]|_?*+]/g, ' '));
    }
  }
  return vocab;
}
const STEMS = [/s$/, /es$/, /ed$/, /d$/, /ing$/, /ly$/, /er$/, /est$/, /'s$/];
const known = (vocab, w) => vocab.has(w) || STEMS.some((r) => r.test(w) && vocab.has(w.replace(r, ''))) || (w.endsWith('ies') && vocab.has(`${w.slice(0, -3)}y`)) || (/(.)\1ing$/.test(w) && vocab.has(w.slice(0, -4)));
const NUMWORDS = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand first second third half quarter'.split(' '));
function unknownWords(vocab, r) {
  const msg = r.message ?? '';
  const ctx = (JSON.stringify(r.expect ?? '') + ' ' + (r.setup ?? []).join(' ') + ' ' + (r.expectProse ?? '')).toLowerCase();
  const names = new Set([...msg.matchAll(/(?<!^)(?<![.!?]\s)\b([A-Z][a-z]+)/g)].map((m) => m[1].toLowerCase()));
  const out = [];
  for (const w of msg.toLowerCase().match(/[a-z][a-z']*/g) ?? []) {
    if (w.length < 3 || w.includes("'") || known(vocab, w) || NUMWORDS.has(w) || names.has(w)) continue;
    if (ctx.includes(w)) continue;   // a value the case itself names (a list name, a title): a slot value, not a lexicon word
    out.push(w);
  }
  return [...new Set(out)];
}

// ---- tests that need the pipeline (read-only, rules settings) --------------------------------------------------------------------------
const CONJ = /\s+(?:and then|then|and also|after that|afterwards|and|also|plus)\s+|\s*[,;]\s*/g;
async function altSplitReads(env, r) {
  const msg = r.message;
  const cuts = [];
  for (const m of msg.matchAll(CONJ)) cuts.push([msg.slice(0, m.index).trim(), msg.slice(m.index + m[0].length).trim()]);
  const q = msg.indexOf('?');
  if (q > 0 && q < msg.length - 1) cuts.push([msg.slice(0, q + 1).trim(), msg.slice(q + 1).trim()]);
  const results = [];
  for (const [l, rr] of cuts) {
    if (l.split(/\s+/).length < 2 || rr.split(/\s+/).length < 2) continue;
    const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
    if (r.tab) s.setWorldState('ui.shell', { activeTab: r.tab });
    try {
      for (const m of r.setup ?? []) await s.send(m);
      const a = await s.send(l), b = await s.send(rr);
      const full = (x) => x.segments.length > 0 && x.segments.every((g) => !g.unparsed);
      results.push({ left: l, right: rr, both: full(a) && full(b), worlds: [a, b].map((x) => x.segments.map((g) => g.match?.worldId ?? '-').join('+')) });
    } catch { /* ignore */ }
  }
  return results;
}

// ---- classification ----------------------------------------------------------------------------------------------------------------------
const FOLLOW = new Set(['ellipsis', 'reference', 'clarification', 'correction', 'degree', 'confirmation', 'feedback', 'topic', 'userfacts']);
const ANAPHOR = /^(no[, ]|and |also |then |now |make (it|them|that)|it |them |that |this |those |the other|another|more |less |again|instead|same|do it|undo|why|what about|how about)|\b(it|them|that one|this one|the same|too|instead|again)\b/i;
const PRONOUN = /\b(it|them|those|these|her|him|there)\b/i;
const SCHEMA_REPLY = /(needs? (two|a|an|the|at least)|which (one|color|colour|number|name)|what (color|colour|name|number|size|kind)|how many|missing|between \d|only (up to|from|numbers)|must be|can't be|valid|one of|out of range|not a (number|color|colour))/i;
const ABSENT_REPLY = /(there is no|there's no|no .{2,30} (called|named|here|yet)|doesn't exist|does not exist|not in the (picture|list|document|map)|nothing (called|named|to)|can't find|already|isn't)/i;

function classifyRow(r, ctx) {
  const why = [];
  const segs = r.segments ?? [];
  const expectW = r.world;
  if (r.set === 'mobile-09f') return { cls: 'f', how: 'mech', why: `Romanian voice fragment ("${(r.original ?? '').slice(0, 50)}"), English translation as logged` };
  if (r.set !== 'operational-ro' && languageEvidence(r.message ?? '').strongRo) return { cls: 'f', how: 'mech', why: 'Romanian text in the English-language run (language evidence says Romanian)' };
  if (ctx.unknown.length) { return { cls: 'a', how: 'mech', why: `unknown words: ${ctx.unknown.join(', ')}` }; }
  if (r.set === 'typos') return { cls: 'a', how: 'mech', why: `${r.typoKind ?? 'typo'} "${r.message}" (was "${r.original}")` };
  const hs = ctx.split?.find((s) => s.both && (!expectW || s.worlds.some((w) => w.split('+').includes(expectW))));
  if (hs) { const s = hs; return { cls: 'h', how: 'mech', why: `splitting at "${s.left} | ${s.right}" gives two fully understood parts (${s.worlds.join(' / ')})` }; }
  // routed to another world while the open tab or another candidate is the expected one: the STATE (open tab, game in progress, entities) decides
  const parsed = segs.filter((g) => !g.unparsed && g.world);
  // state evidence for the expected world: it is the world of the open tab, or it was the runner-up of a contested routing decision, or (dialogues) the topic in progress
  const bad = expectW && parsed.find((g) => g.world !== expectW && g.tabWorld === expectW);
  if (bad) return { cls: 'c', how: 'mech', why: `routed to ${bad.world} although the open tab (${bad.activeTab}) belongs to ${expectW}; candidates ${bad.candidates.join(' ')}` };
  const runner = expectW && parsed.find((g) => g.world !== expectW && g.runnerUp === expectW);
  if (runner) return { cls: 'c', how: 'mech-weak', why: `routed to ${runner.world}; ${expectW} was the runner-up of a contested decision` };
  if (r.set === 'dialogues' && expectW && parsed.length && parsed.every((g) => g.world !== expectW) && r.outcome === 'wrong') return { cls: 'c', how: 'mech-weak', why: `routed to ${parsed[0].world} while the dialogue is about ${expectW} (conversation state)` };
  if (r.set.startsWith('gold-') && r.outcome === 'wrong' && r.gotWorld === expectW && !/(did not understand|could not|can't|cannot|do not know|don't know|not sure|no [a-z ]{2,20}(yet|called))/i.test(r.reply ?? '')) return { cls: 'g', how: 'mech-weak', why: `record-level comparison: right world, ordinary answer, but the slot representation differs from the gold (${(r.failing ?? [])[0] ?? ''})` };
  if (r.goldOp && r.gotOp && r.goldOp === r.gotOp && r.outcome === 'wrong') return { cls: 'd', how: 'mech', why: `operation right (${r.goldOp}), argument values differ: ${(r.failing ?? [])[0] ?? ''}` };
  const words = (r.message ?? '').trim().split(/\s+/).length;
  const hasCtx = (r.set === 'dialogues' && r.turn > 0) || (r.setup ?? []).length > 0;
  const followUp = ANAPHOR.test(r.message ?? '') || PRONOUN.test(r.message ?? '') || (hasCtx && words <= 4) || (r.set === 'dialogues' && r.turn > 0 && (r.families ?? []).some((f) => ['ellipsis', 'reference'].includes(f)) && words <= 6);
  if (r.set === 'loose-words') return { cls: 'e', how: 'mech', why: r.junk ? 'junk row: the system guessed where it should not' : `word salad; intent "${r.intent}"` };
  if (followUp) return { cls: 'e', how: 'mech', why: r.set === 'dialogues' ? `follow-up turn ${r.turn} (${(r.families ?? []).join(',')})` : 'anaphora/ellipsis marker or setup context' };
  if (SCHEMA_REPLY.test((r.reply ?? '').replace(/"[^"]*"/g, '""').replace(/^(.*?)(I did not understand|Did you mean).*$/s, '$1'))) return { cls: 'd', how: 'mech', why: `reply states a schema requirement: "${(r.reply ?? '').slice(0, 90)}"` };
  if (ABSENT_REPLY.test(r.reply ?? '') && r.outcome !== 'not_understood') return { cls: 'c', how: 'mech', why: `reply is about state: "${(r.reply ?? '').slice(0, 90)}"`, weak: true };
  return { cls: 'b', how: 'default', why: why.join('; ') || 'no word missing, no routing candidate, no follow-up marker: no pattern covers the structure' };
}

const key = (r) => `${r.set}|${r.id}`;
const isErr = (o) => o === 'wrong' || o === 'not_understood' || o === 'partly';

async function classifyAll(raw, overrides, env, vocab) {
  const rows = raw.rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = [];
  for (const r of rows) {
    if (!isErr(r.outcome)) continue;
    const base = { set: r.set, id: r.id, world: r.world ?? '(none)', outcome: r.outcome, message: r.message, reply: (r.reply ?? '').slice(0, 140), lang: r.lang };
    const ov = overrides[key(r)] ?? overrides[r.id];
    if (ov) { out.push({ ...base, cls: ov.cls, how: 'inspect', why: ov.why }); continue; }
    if (r.set === 'operational-ro') {
      const src = byId.get(r.source_id);
      const english = r.english ?? '';
      const ctx0 = { unknown: unknownWords(vocab, { message: english, expect: r.expect, setup: r.setup }) };
      if (src && !isErr(src.outcome)) {
        const kind = ctx0.unknown.length ? 'untranslated or unknown words in the translation' : 'translation in the lexicon but not read';
        out.push({ ...base, cls: 'f', how: 'mech-pair', why: `English source ${src.id} is right; ${kind}; translation: "${english.slice(0, 80)}"`, sub: ctx0.unknown.length ? 'f-lexicon' : 'f-structure', enSource: 'right' });
      } else if (src) {
        const inh = await classifyOne(src, env, vocab, overrides);
        out.push({ ...base, cls: inh.cls, how: 'mech-pair', why: `English source ${src.id} is also ${src.outcome}: inherits ${inh.cls} (${inh.why.slice(0, 80)})`, enSource: 'wrong' });
      } else out.push({ ...base, cls: 'f', how: 'default', why: 'no English source row', enSource: 'none' });
      continue;
    }
    const c = await classifyOne(r, env, vocab, overrides);
    out.push({ ...base, ...c });
  }
  return out;
}

async function classifyOne(r, env, vocab, overrides) {
  const ov = overrides[key(r)] ?? overrides[r.id];
  if (ov) return { cls: ov.cls, how: 'inspect', why: ov.why };
  const unknown = r.set === 'typos' ? [] : unknownWords(vocab, r);
  const compound = (r.segments ?? []).length > 1 || CONJ.test(r.message ?? '') || /\?.+/.test(r.message ?? '');
  CONJ.lastIndex = 0;
  const split = compound && !unknown.length && env ? await altSplitReads(env, r) : null;
  return classifyRow(r, { unknown, split });
}

// ---- report --------------------------------------------------------------------------------------------------------------------------------
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function tables(raw, cases) {
  const rows = raw.rows.filter((r) => r.outcome !== 'invalid');
  const sets = [...new Set(rows.map((r) => r.set))];
  const bySet = {};
  for (const s of sets) {
    const rs = rows.filter((r) => r.set === s), cs = cases.filter((c) => c.set === s);
    const t = { n: rs.length, right: rs.filter((r) => r.outcome === 'right').length, partly: rs.filter((r) => r.outcome === 'partly').length, wrong: rs.filter((r) => r.outcome === 'wrong').length, not_understood: rs.filter((r) => r.outcome === 'not_understood').length, unjudged: rs.filter((r) => r.outcome === 'unjudged').length, errors: cs.length };
    t.classes = Object.fromEntries(CLASSES.map((k) => [k, cs.filter((c) => c.cls === k).length]));
    bySet[s] = t;
  }
  const byWorld = {};
  for (const s of sets) {
    byWorld[s] = {};
    for (const w of [...new Set(rows.filter((r) => r.set === s).map((r) => r.world ?? '(none)'))].sort()) {
      const n = rows.filter((r) => r.set === s && (r.world ?? '(none)') === w).length;
      const cs = cases.filter((c) => c.set === s && c.world === w);
      if (!cs.length) continue;
      byWorld[s][w] = { n, errors: cs.length, classes: Object.fromEntries(CLASSES.map((k) => [k, cs.filter((c) => c.cls === k).length])) };
    }
  }
  return { bySet, byWorld };
}
const examples = (cases, k, n = 5) => {
  const pool = cases.filter((c) => c.cls === k);
  const seen = new Set(), out = [];
  for (const c of pool.sort((x, y) => (x.how === 'inspect' ? -1 : 0) - (y.how === 'inspect' ? -1 : 0))) { if (seen.has(c.set) && out.length < n && pool.length > n * 3) { /* prefer variety of sets first */ } if (out.length < n) { out.push(c); seen.add(c.set); } }
  return out;
};
const share = (cases) => {
  const t = cases.length;
  const n = (ks) => cases.filter((c) => ks.includes(c.cls)).length;
  return { errors: t, world_aware_cdeh: n(['c', 'd', 'e', 'h']), world_aware_pct: pct(n(['c', 'd', 'e', 'h']), t), lexicon_pattern_translator_abf: n(['a', 'b', 'f']), lexicon_pattern_translator_pct: pct(n(['a', 'b', 'f']), t), expectation_wrong_g: n(['g']), g_pct: pct(n(['g']), t), by_class: Object.fromEntries(CLASSES.map((k) => [k, n([k])])) };
};
const SUBSETS = {
  'English sets (operational, dialogues, gold, loose, typos, real, mobile)': (c) => c.set !== 'operational-ro',
  'English core (operational + dialogues)': (c) => c.set === 'operational' || c.set === 'dialogues',
  'English judged sets without the robustness probes (operational, dialogues, gold, real)': (c) => ['operational', 'dialogues'].includes(c.set) || c.set.startsWith('gold-') || /^real-09[cde]$/.test(c.set),
  'Romanian operational': (c) => c.set === 'operational-ro',
  'All sets': () => true,
};

// The cases the reviewer listed (worker-tasks, FORMALIZE-FROM-WORLDS and waves 3-5): re-run now (rules mode, fresh sessions) and classified by inspection.
const NAMED = [
  { label: 'put it in the top right corner (draw tab)', tab: 'draw', message: 'put it in the top right corner', cls: 'c', why: 'the open tab is draw; the message is played as a tic-tac-toe move because that pattern is more specific. The open tab and the fact that no game is running decide.' },
  { label: 'change the instrument to flute (music tab, compound)', tab: 'music', message: 'change the instrument to flute, also what is 7 plus 5', cls: 'h', why: 'the compound is routed to the document; the music tab and the instrument lexicon decide for the first request. Alone the request is understood.' },
  { label: 'change the instrument to flute (music tab, alone)', tab: 'music', message: 'change the instrument to flute', cls: 'b', why: 'control: reported to show that the failure is in the compound only' },
  { label: 'fă părul roșu (avatar tab, Romanian)', tab: 'robot', message: 'fă părul roșu', lang: 'ro', cls: 'f', also: 'c', why: 'the translator leaves "părul" untranslated ("Make părul red") and the reading drops it: body turns red. Hair is a known avatar part (schema) and there is no "părul" object in the picture (state): a reading that drops a word should lose.' },
  { label: 'connect Start to End, End missing (diagram tab)', tab: 'diagram', setup: ['add a box called Start'], message: 'connect Start to End', cls: 'c', why: 'the facts say End does not exist; the reply is the generic "needs two ends" instead of "There is no box called End. Shall I add it?"' },
  { label: 'delete the dragon (draw tab)', tab: 'draw', setup: ['draw a red house'], message: 'delete the dragon', cls: 'c', also: 'a', why: 'the reply lists things that are not in the picture; the state knows what is there. "dragon" is also not a lexicon word.' },
  { label: 'switch to klingon', message: 'switch to klingon', cls: 'd', why: 'the language setting is an enum (en, ro): "klingon" is outside it, so the reply should name the allowed values' },
  { label: 'give it a hat made of cheese (avatar tab)', tab: 'robot', message: 'give it a hat made of cheese', cls: 'd', also: 'a', why: 'the part "hat" exists, "cheese" is not a value of the material/colour slot (schema); the reply should say what is possible' },
  { label: 'open draw', message: 'open draw', cls: 'b', also: 'a', why: '"deschide desenul" works; the English bare "open <tab name>" has no pattern ("draw" is a verb in the lexicon, the tab is called draw)' },
];
async function runNamed(env) {
  const out = [];
  for (const n of NAMED) {
    const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
    if (n.tab) s.setWorldState('ui.shell', { activeTab: n.tab });
    for (const m of n.setup ?? []) await s.send(m);
    let reply, error = null;
    try { reply = await s.send(n.message, n.lang === 'ro' ? { language: 'auto' } : undefined); } catch (e) { error = e.message; }
    out.push({ ...n, now: reply ? (n.lang === 'ro' ? (reply.trace?.replyEnglish ?? reply.text) : reply.text).slice(0, 200) : `error: ${error}`, routed: (reply?.segments ?? []).map((g) => `${g.match?.worldId ?? 'unparsed'}`).join(' + '), state: n.tab ?? null });
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
function renderMd(res) {
  const L = [];
  const M = res.modes;
  const hdr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  L.push('# E1: error audit of the current formalization (2026-11-12)', '');
  L.push('Measurement only (FORMALIZE-FROM-WORLDS, E1). Nothing in `src/` or `worlds/` was changed. Raw runs: `scripts/e1-collect.mjs` (rules, and the shipped `encoder+n1` through onnxruntime-node); classification: `scripts/e1-audit.mjs`, with the human decisions in `scripts/e1-overrides.json`. Full per-case data (every non-right case with its class, how it was classified and why) is in `e1-audit-2026-11-12.json`.', '');
  L.push('Classes: **a** word missing from the lexicon | **b** structure no pattern covers | **c** ambiguity the STATE resolves | **d** ambiguity the SCHEMA resolves | **e** intent to guess (implicit object, ellipsis, follow-up) | **f** Romanian-specific | **g** expectation wrong | **h** segmentation of compound messages.', '');
  L.push('## 1. The key number', '');
  L.push('Share of the non-right cases (wrong, partly, not understood) that world-aware reading (E2: c, d, e, h) could address, against the ones for lexicon, generated patterns (E3) or the translator route (a, b, f). g = the expectation or the harness is wrong, so there is nothing to fix in the formalizer.', '');
  L.push('| set of cases | mode | errors | c+d+e+h (E2) | a+b+f (E3 / translator) | g | by class a b c d e f g h |', '|---|---|---:|---:|---:|---:|---|');
  for (const k of ['English core (operational + dialogues)', 'English judged sets without the robustness probes (operational, dialogues, gold, real)', 'Romanian operational', 'English sets (operational, dialogues, gold, loose, typos, real, mobile)', 'All sets']) {
    for (const mode of Object.keys(M)) { const v = M[mode].shares[k]; L.push(`| ${k} | ${mode} | ${v.errors} | ${v.world_aware_cdeh} (${v.world_aware_pct}%) | ${v.lexicon_pattern_translator_abf} (${v.lexicon_pattern_translator_pct}%) | ${v.expectation_wrong_g} | ${hdr.map((c) => v.by_class[c]).join(' ')} |`); }
  }
  {
    const r = M.rules, e = M['encoder+n1'];
    const core = r.shares['English core (operational + dialogues)'], judged = r.shares['English judged sets without the robustness probes (operational, dialogues, gold, real)'], ro = r.shares['Romanian operational'], p = r.ro_pairing;
    L.push('', '**Reading of the numbers (rules mode; encoder+n1 in the table).**', '',
      `- English, where the errors are few (operational + dialogues, ${core.errors} non-right of ${r.totals.operational.n + r.totals.dialogues.n}): ${core.world_aware_pct}% are c, d, e or h, ${core.lexicon_pattern_translator_pct}% are a, b or f. Almost all of it is compound segmentation (h ${core.by_class.h}) and follow-ups or self-corrections (e ${core.by_class.e}); c is ${core.by_class.c} (routing against the open tab or the only referent); missing words are only ${core.by_class.a}.`,
      `- English including the paraphrase gold and the real phrases (${judged.errors} errors): ${judged.world_aware_pct}% c+d+e+h, ${judged.lexicon_pattern_translator_pct}% a+b+f, ${judged.expectation_wrong_g} g. Here b is the largest single class (${judged.by_class.b}, LLM paraphrases such as "which letters did i already try" that no pattern covers) and c is ${judged.by_class.c}.`,
      `- Romanian operational (${ro.errors} errors): ${ro.lexicon_pattern_translator_pct}% are a, b or f and only ${ro.world_aware_pct}% c+d+e+h. ${p.en_source_right} of the ${p.non_right} have a right English source, so the meaning is already handled by the world: the translator route or generated Romanian patterns fix them, world-aware reading cannot (the translation is wrong or unread before any world looks at it). Of those, ${p.f_lexicon} have words left untranslated, ${p.f_structure} have an in-vocabulary translation the rules do not read.`,
      `- World-aware reading therefore pays in English, in compound messages and in follow-ups, not in Romanian. The encoder already removes most of the h class (${e.shares['English core (operational + dialogues)'].by_class.h} left of ${core.by_class.h} in the English core) and so the headroom for E2 on top of the shipped mode is mostly e and c: ${e.shares['English core (operational + dialogues)'].by_class.e} + ${e.shares['English core (operational + dialogues)'].by_class.c} of ${e.shares['English core (operational + dialogues)'].errors} English-core errors, plus the wrong answers (${res.encoder_vs_rules.wrong_in_encoder_only} wrong only in encoder+n1, 62 of them in loose-words, 30 in typos, 21 in operational-ro, 12 in dialogues, 2 in operational) where a state check can veto a reading.`);
  }
  L.push('', 'The English-sets row is dominated by the typo set (every typo error is class a: the typo is not a lexicon word) and the loose-words set (every non-right row is class e: intent to guess from a word salad). The per-set table below separates them.', '');
  for (const mode of Object.keys(M)) {
    L.push(`## 2. Per set, ${mode}`, '', '| set | n | right | partly | wrong | not understood | unjudged | errors | a | b | c | d | e | f | g | h |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [s, v] of Object.entries(M[mode].by_set)) L.push(`| ${s} | ${v.n} | ${v.right} | ${v.partly} | ${v.wrong} | ${v.not_understood} | ${v.unjudged} | ${v.errors} | ${hdr.map((c) => v.classes[c]).join(' | ')} |`);
    const h = M[mode].how;
    L.push('', `Classified how: mechanical test ${h.mech}, RO-vs-EN pairing ${h['mech-pair']}, mechanical but weak evidence ${h['mech-weak']}, by inspection ${h.inspect}, by elimination (default b) ${h.default}.`, '');
  }
  L.push('## 3. Per world and per set (rules mode; worlds with at least one error)', '');
  for (const [s, ws] of Object.entries(M.rules.by_world)) {
    if (!Object.keys(ws).length) continue;
    L.push(`### ${s}`, '', '| world | n | errors | a | b | c | d | e | f | g | h |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [w, v] of Object.entries(ws)) L.push(`| ${w} | ${v.n} | ${v.errors} | ${hdr.map((c) => v.classes[c]).join(' | ')} |`);
    L.push('');
  }
  L.push('## 4. Romanian: reading-only errors (mechanical pairing with the English source)', '');
  for (const mode of Object.keys(M)) { const p = M[mode].ro_pairing; L.push(`- ${mode}: ${p.non_right} non-right Romanian cases; the English source case is right in ${p.en_source_right} (${pct(p.en_source_right, p.non_right)}%) and non-right in ${p.en_source_wrong}. Of the reading-only ones, ${p.f_lexicon} have words left untranslated or unknown in the translation (translator or lexicon), ${p.f_structure} are translated into in-vocabulary English that the rules still do not read (structure of the translation).`); }
  L.push('', 'Reviewer baseline (351 of 449 in rules mode) is reproduced within a few cases; the difference to the table above is the nondeterministic spell/partial settings of a re-run.', '');
  L.push('## 5. The cases the reviewer listed (rules mode, re-run now)', '', '| case | class | routed to | reply now | why |', '|---|---|---|---|---|');
  for (const n of M.rules && res.named_cases) L.push(`| ${esc(n.label)} | ${n.cls}${n.also ? `+${n.also}` : ''} | ${esc(n.routed)} | ${esc(n.now)} | ${esc(n.why)} |`);
  L.push('', '## 6. Encoder+n1 against rules, case by case', '', `Fixed by the encoder (non-right in rules, right in encoder+n1): ${res.encoder_vs_rules.fixed_by_encoder}. Broken by the encoder (right in rules, non-right in encoder+n1): ${res.encoder_vs_rules.broken_by_encoder}. Wrong (worse than not understood) in rules only: ${res.encoder_vs_rules.wrong_in_rules_only}; in encoder+n1 only: ${res.encoder_vs_rules.wrong_in_encoder_only}.`, '', '| set | fixed | broken |', '|---|---:|---:|');
  for (const [s, v] of Object.entries(res.encoder_vs_rules.by_set)) L.push(`| ${s} | ${v.fixed} | ${v.broken} |`);
  L.push('', '## 7. Five examples per class (rules mode; inspected cases first)', '');
  for (const k of CLASSES) {
    L.push(`### ${k}: ${NAMES[k]}`, '');
    const ex = M.rules.examples[k];
    if (!ex.length) L.push('(no case)', '');
    for (const c of ex) L.push(`- [${c.set}, ${c.world}, ${c.outcome}, ${c.how}] "${esc(c.message)}" -> ${esc(c.reply).slice(0, 90)}. ${esc(c.why)}`);
    L.push('');
  }
  L.push('## 8. How far to trust the classes', '', '- **Mechanical, firm:** a (a token of the message is in no lexicon, pattern literal or alternative of any world, and is not a value the case names), f by RO-vs-EN pairing (the English source is right, so the world handles the meaning and the Romanian reading fails), the typo and mobile sets (by construction), h (the message cut at a conjunction gives two parts that both read completely and one is in the expected world), c when the open tab belongs to the expected world and the message was routed elsewhere.', '- **Mechanical, weak:** c from a contested routing runner-up or a dialogue topic; g from the gold record comparison (right world, ordinary answer, slot representation differs); e from anaphora/pronoun/short-turn markers (an "it" with only one referent in the state would be c; this is not tested here); d from "operation right, argument differs" and from reply wording that states a schema requirement.', '- **By inspection:** the 18 operational cases in `scripts/e1-overrides.json` and the named cases of section 5.', '- **By elimination:** b. It is the residue: no unknown word, no routing evidence, no follow-up marker. It is an upper bound for "no pattern covers it" and a lower bound for the others.', '- **Not done:** an overlay check of candidate readings against the world instances (query/check in matrix mode) to reject readings the facts contradict. The state classes here rest on routing and tab evidence, not on a per-reading fact check; that check is the content of E2. The share of c is therefore a floor.', '- The typo and loose-words sets are robustness probes, not user traffic; the unjudged real-phrase rows (log records with no expectation) are counted separately and are not errors here.', '');
  return `${L.join('\n')}\n`;
}

async function main() {
  // log records without an expectation are not errors when nothing understood them (noise, junk, voice garble); mobile rows count only where the log itself said "supported"
  const judge = (raw) => { for (const r of raw.rows) if ((r.set.endsWith('-unjudged') && r.outcome === 'not_understood') || (r.set === 'mobile-09f' && r.outcome === 'not_understood' && r.loggedStatus !== 'supported')) r.outcome = 'unjudged'; return raw; };
  const rawRules = judge(JSON.parse(readFileSync(resolve(arg('rules')), 'utf8')));
  const rawEnc = judge(JSON.parse(readFileSync(resolve(arg('enc')), 'utf8')));
  const ovFile = join(REPO, 'scripts/e1-overrides.json');
  const overrides = existsSync(ovFile) ? JSON.parse(readFileSync(ovFile, 'utf8')) : {};
  const vocab = buildVocab();
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const env = { engine, settings: settingsForMode('rules') };
  const result = { date: '2026-11-12', vocab_size: vocab.size, modes: {} };
  for (const [mode, raw] of [['rules', rawRules], ['encoder+n1', rawEnc]]) {
    const cases = await classifyAll(raw, overrides, env, vocab);
    const t = tables(raw, cases);
    result.modes[mode] = { totals: Object.fromEntries(Object.entries(t.bySet).map(([s, v]) => [s, { n: v.n, right: v.right, errors: v.errors }])), by_set: t.bySet, by_world: t.byWorld, shares: Object.fromEntries([...Object.entries(SUBSETS), ...Object.keys(t.bySet).map((s) => [`set ${s}`, (c) => c.set === s])].map(([k, f]) => [k, share(cases.filter(f))])), how: Object.fromEntries(['mech', 'mech-pair', 'mech-weak', 'inspect', 'default'].map((h) => [h, cases.filter((c) => c.how === h).length])), examples: Object.fromEntries(CLASSES.map((k) => [k, examples(cases, k)])), cases };
    if (flag('dump') && mode === arg('dump-mode', 'rules')) for (const c of cases.filter((x) => (arg('dump-set') ? x.set === arg('dump-set') : x.set !== 'operational-ro'))) console.log(`${c.set}\t${c.id}\t${c.cls}/${c.how}\t${c.outcome}\t${c.world}\t"${(c.message ?? '').slice(0, 90)}"\t-> ${(c.reply ?? '').slice(0, 70)}\t[${(c.why ?? '').slice(0, 100)}]`);
  }
  // RO-vs-EN pairing (mechanical): of the non-right Romanian cases, how many have a right English source
  for (const mode of ['rules', 'encoder+n1']) {
    const ro = result.modes[mode].cases.filter((c) => c.set === 'operational-ro');
    result.modes[mode].ro_pairing = { non_right: ro.length, en_source_right: ro.filter((c) => c.enSource === 'right').length, en_source_wrong: ro.filter((c) => c.enSource === 'wrong').length, f_lexicon: ro.filter((c) => c.sub === 'f-lexicon').length, f_structure: ro.filter((c) => c.sub === 'f-structure').length };
  }
  result.named_cases = await runNamed(env);
  // encoder+n1 against rules, case by case (same ids)
  const oc = (raw) => new Map(raw.rows.map((r) => [`${r.set}|${r.id}`, r.outcome]));
  const mr = oc(rawRules), me = oc(rawEnc);
  const bad = (o) => o === 'wrong' || o === 'not_understood' || o === 'partly';
  const dlt = { fixed_by_encoder: 0, broken_by_encoder: 0, wrong_in_rules_only: 0, wrong_in_encoder_only: 0, by_set: {} };
  for (const [k, o] of mr) {
    const e = me.get(k); const s = k.split('|')[0];
    const b = (dlt.by_set[s] ??= { fixed: 0, broken: 0 });
    if (bad(o) && !bad(e) && e !== undefined) { dlt.fixed_by_encoder++; b.fixed++; }
    if (!bad(o) && bad(e)) { dlt.broken_by_encoder++; b.broken++; }
    if (o === 'wrong' && e !== 'wrong') dlt.wrong_in_rules_only++;
    if (e === 'wrong' && o !== 'wrong') dlt.wrong_in_encoder_only++;
  }
  result.encoder_vs_rules = dlt;
  if (arg('out')) { writeFileSync(`${resolve(arg('out'))}.json`, `${JSON.stringify(result, null, 1)}\n`); writeFileSync(`${resolve(arg('out'))}.md`, renderMd(result)); }
  for (const mode of Object.keys(result.modes)) {
    console.log(`\n== ${mode}`);
    for (const [k, v] of Object.entries(result.modes[mode].shares)) console.log(`${k}: errors ${v.errors}, c+d+e+h ${v.world_aware_cdeh} (${v.world_aware_pct}%), a+b+f ${v.lexicon_pattern_translator_abf} (${v.lexicon_pattern_translator_pct}%), g ${v.expectation_wrong_g}; ${JSON.stringify(v.by_class)}`);
  }
}
await main();
