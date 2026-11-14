#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * "Meaning kept" of every Romanian -> English path on training/eval/ro-en-meaning/rows.jsonl: the English a path makes of the Romanian is read by the rules reader
 * in the row's tab and state and the reading is compared with the reading of the reference English (not the strings; fluency is not scored).
 *   kept       the same reading (world, act and every role)
 *   act        the same act, a role differs
 *   other      a complete reading of another act
 *   unread     the reader does not read the English completely
 * Paths: rules (the rules translator), model (Bergamot ro-en, raw), m4 (candidates: rules + repaired rules, chosen by understanding), m4+model (the shipped chain with the on-device
 * model: model, rules, repaired), grammar (the flagged grammar prototype, src/translate/grammar-ro.mjs). The browser Translator does not exist in Node: it is not measured here.
 *
 *   node scripts/measure-ro-en-meaning.mjs --bergamot <cacheDir> [--paths rules,model,m4,m4+model,grammar] [--source operational,canon] [--limit N] [--json out.json] [--rows out.jsonl]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openReader } from './lib/meaning.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { analyze as analyzeTr } from '../src/translate/morphology.ro.mjs';
import { foldKey as foldKeyTr } from '../src/translate/normalize.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { gatherCandidates, chooseCandidate, englishTest } from '../src/translate/candidates.mjs';
import { spellVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const paths = (arg('paths', 'rules,model,m4,m4+model')).split(',');
const sources = arg('source') ? new Set(arg('source').split(',')) : null;
let rows = readFileSync(join(REPO, 'training/eval/ro-en-meaning/rows.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
rows = rows.filter((r) => r.ref.complete && (!sources || sources.has(r.source)));
if (arg('limit')) rows = rows.slice(0, Number(arg('limit')));

const rulesT = createTranslator();
// the on-device model: one translation per distinct Romanian text, cached on disk
const mapFile = arg('map', join(arg('cache-dir', '/tmp'), 'ro-en-bergamot-map.json'));
let mtMap = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
if (paths.some((p) => p === 'model' || p === 'm4+model')) {
  const need = [...new Set(rows.map((r) => r.ro))].filter((t) => !(t in mtMap));
  if (need.length) {
    const { createNodeMt } = await import('./lib/mt-node.mjs');
    const mt = await createNodeMt({ cacheDir: arg('bergamot') });
    await mt.ensure('ro');
    let n = 0;
    for (const t of need) { mtMap[t] = await mt.translate(t, 'ro', 'en').catch(() => ''); if (++n % 1000 === 0) console.error('model', n, '/', need.length); }
    mt.reset();
    writeFileSync(mapFile, JSON.stringify(mtMap));
  }
}
const modelBackend = { translatorKind: () => 'mt', detectorKind: () => null, supports: () => true, sources: async () => ['model'], translate: async (t) => mtMap[t] ?? '', detect: async () => { throw new Error('none'); } };
const noBackend = { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); } };
const sw = { rules: createSwitchTranslator({ rules: rulesT, getStrategy: () => 'auto', backend: noBackend }), model: createSwitchTranslator({ rules: rulesT, getStrategy: () => 'auto', backend: modelBackend }) };
const reader = await openReader({ translator: rulesT });
const vocab = spellVocabulary(reader.engine.set);
const isEnglish = englishTest((w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!rulesT.knownEnglish(w));
let grammar = null, libLex = null, libLex0 = null, libLex1 = null;
// the English of a lemma the large (UniMorph) dictionary has no sense for: the translator's own lexicon, a stand-in until the dictionary has k.words senses
const translatorGloss = (lemma, pos) => { const a = analyzeTr(foldKeyTr(lemma)).find((x) => x.pos === pos && (x.entry.ro === lemma || x.entry.inf === lemma)); return a?.entry.en ?? null; };
if (paths.some((p) => p.startsWith('grammar'))) grammar = (await import('../src/translate/grammar-ro.mjs')).grammarRoEn;
if (paths.some((p) => p.startsWith('grammar-lib'))) { const { openLangRo } = await import('../src/lang/ro.mjs'); libLex = await openLangRo(); libLex0 = await openLangRo({ unimorph: true }); libLex1 = await openLangRo({ unimorph: true, gloss: translatorGloss }); }

async function englishOf(path, r) {
  if (path === 'rules') return (await rulesT.translate(r.ro, { from: 'ro', to: 'en' })).text;
  if (path === 'model') return mtMap[r.ro] ?? '';
  if (path === 'grammar') return grammar(r.ro).text;
  if (path === 'grammar-lib') return grammar(r.ro, { lexicon: libLex }).text;   // frames of the prototype, words from w.lang.ro through std.morph (+ the Q51 workaround)
  if (path === 'grammar-um') return grammar(r.ro, { lexicon: libLex0 }).text;   // + the UniMorph dictionary (no senses: it adds words to the analysis only where a sense exists)
  if (path === 'grammar-um+gl') return grammar(r.ro, { lexicon: libLex1 }).text;   // + the translator's English for the UniMorph lemmas
  if (path === 'grammar+rules') return grammar(r.ro).text || (await rulesT.translate(r.ro, { from: 'ro', to: 'en' })).text;
  if (path === 'grammar+m4') { const g = grammar(r.ro).text; if (g) return g; return englishOf('m4', r); }
  const t = path === 'm4' ? sw.rules : sw.model;
  const s = await reader.session(r);
  const cands = await gatherCandidates(r.ro, { from: 'ro', to: 'en', translator: t });
  const pick = await chooseCandidate(cands, r.ro, { understand: (e) => s._understands(e), isEnglish });
  return pick.chosen?.text ?? (await rulesT.translate(r.ro, { from: 'ro', to: 'en' })).text;
}
const judge = (ref, got, en) => !en ? 'abstain' : (got.key === ref.key && got.complete ? 'kept' : !got.complete ? 'unread' : got.world === ref.world && got.action === ref.action ? 'act' : 'other');

const out = [], tally = {};
const bump = (path, dim, val, res) => { const t = ((tally[path] ??= {})[`${dim}:${val}`] ??= { n: 0, kept: 0, act: 0, other: 0, unread: 0, abstain: 0 }); t.n++; t[res]++; };
let n = 0;
for (const r of rows) {
  const row = { id: r.id };
  for (const p of paths) {
    let en = '';
    try { en = await englishOf(p, r); } catch (e) { en = ''; }
    const got = en ? await reader.read(en, r) : { complete: false, key: '' };
    const res = judge(r.ref, got, en);
    row[p] = { en, res };
    for (const [dim, val] of [['all', 'all'], ['source', r.source], ['kind', r.kind], ['group', r.group], ['variant', r.ro_variant], ['source+kind', `${r.source}/${r.kind}`]]) bump(p, dim, val, res);
  }
  out.push(row);
  if (++n % 1000 === 0) console.error(n, '/', rows.length);
}
if (arg('rows')) writeFileSync(arg('rows'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ paths, rows: rows.length, tally }, null, 1));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1).padStart(5) : '    -');
for (const dim of ['all', 'source', 'kind', 'group', 'variant', 'source+kind']) {
  const keys = [...new Set(paths.flatMap((p) => Object.keys(tally[p]).filter((k) => k.startsWith(dim + ':'))))].sort();
  console.log(`\n== by ${dim}   (kept % / act-only % ; n)`);
  for (const k of keys) console.log(`${k.slice(dim.length + 1).padEnd(34)} n=${String(tally[paths[0]][k]?.n ?? 0).padStart(5)}  ` + paths.map((p) => { const t = tally[p][k]; return t ? `${p} ${pct(t.kept, t.n)}/${pct(t.act, t.n)}${t.abstain ? ` (att ${pct(t.n - t.abstain, t.n)}, prec ${pct(t.kept, t.n - t.abstain)})` : ''}` : ''; }).join('   '));
}
