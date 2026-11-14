#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Measures the word index of lazy loading (specs/06 "Lazy loading", worker-log "LAZY-LOAD"): for every message of the owner logs, the operational set, the Talk questions and the catalog
 * lookup set, which worlds would the index load, and does a session that has ONLY those worlds (plus the always-loaded ones and the open tab's) read and answer exactly like one with every world?
 *
 *   node scripts/eval-word-index.mjs [--every N] [--designs A,B] [--T 2,3,4,6] [--json out.json] [--set owner|op|talk|kl|all]
 *
 * Designs: A (a Bloom filter per world, about 10 bits per word: no list of words, so no spelling candidates), B (exact index cut by the first two letters; the words it lists give the spelling
 * candidates of words nobody knows). T: a word that belongs to more than T worlds says nothing (`the`, `draw`): it never makes a world load by itself.
 * Per variant: false negatives (the reading or the state differs from the full set; and, stricter, the world that acted was not loaded), false positives (worlds loaded that nothing used),
 * worlds and bytes (gzip) loaded per message, bytes of index buckets touched, spelling needs.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { buildWorldIndex, ALWAYS as ALWAYS0 } from './lib/world-index-build.mjs';
const ALWAYS = [...ALWAYS0, ...(process.env.WI_ALWAYS_PLUS ? process.env.WI_ALWAYS_PLUS.split(',') : [])];   // experiment: more always-loaded worlds
import { invert } from './lib/world-words.mjs';
import { messageBag } from '../src/formalizer/rules/index.mjs';
import { queryWords, bloomHas, spellingCandidates, bucketOf, readingIncomplete } from '../src/worlds/word-index.mjs';
import { visibleState } from './lib/visible-state.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const every = Number(arg('every', 1)), designs = arg('designs', 'A,B').split(','), Ts = arg('T', '2,3,4').split(',').map(Number), which = arg('set', 'all');
const rd = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ---------- the corpus ----------
const BUILTIN_TAB = { robot: 'ui.avatar', editor: 'docs.editor', tictactoe: 'games.tictactoe', guess: 'games.guess', hangman: 'games.hangman' };
const cases = [];
if (which === 'all' || which === 'op') for (const f of ['operational', 'operational-long']) for (const c of rd(`training/eval/${f}.jsonl`)) cases.push({ src: 'op', id: c.id, tab: c.tab, setup: c.setup ?? [], message: c.message, init: c.init });
if (which === 'all' || which === 'owner') {
  for (const f of ['2026-11-13', '2026-11-13b', '2026-11-13c']) for (const r of rd(`training/eval/owner-log-${f}.jsonl`)) {
    const text = r.english ?? (r.lang === 'en' ? r.text : null);
    if (text) cases.push({ src: 'owner', id: `owner-${f}-${r.n ?? cases.length}`, tab: r.tab, setup: [], message: text });
  }
}
if (which === 'all' || which === 'talk') {
  const chips = ['What does a lighthouse look like?', 'What are the parts of a bicycle?', 'How many legs does a spider have?', 'Which is bigger, Jupiter or Mars?', 'What are the planets in order?', 'What comes after March?'];
  const inputs = [...readFileSync(join(REPO, 'worlds/talk/tests.sop'), 'utf8').matchAll(/input="([^"]+)"/g)].map((m) => m[1]);
  for (const t of [...chips, ...inputs]) cases.push({ src: 'talk', id: `talk-${cases.length}`, tab: 'talk', setup: [], message: t });
}
if (which === 'all' || which === 'kl') for (const c of rd('training/eval/knowledge-lookup-2026-11-13.jsonl')) cases.push({ src: 'kl', id: c.id, tab: c.tab, setup: [], message: c.message });
const sample = cases.filter((_, i) => i % every === 0);

// ---------- engines ----------
const loader = createFsLoader(DEFAULT_ROOT);
const allIds = await loader.listWorlds();
const full = await createEngine({ loader });
const tabWorld = new Map(Object.entries(BUILTIN_TAB));
for (const w of full.set.list()) if (w.tab) tabWorld.set(w.tab.id, w.id);
const worldOfTab = (t) => (!t ? null : tabWorld.get(t) ?? (full.set.get(t) ? t : null));
const tabIdOf = (t) => (!t ? null : tabWorld.has(t) ? t : full.set.list().find((w) => w.id === t)?.tab?.id ?? [...Object.entries(BUILTIN_TAB)].find(([, v]) => v === t)?.[0] ?? t);
const engines = new Map();
const subsetEngine = async (ids) => {
  const key = [...ids].sort().join('|');
  if (!engines.has(key)) { if (engines.size >= 24) engines.delete(engines.keys().next().value); const keep = new Set(ids); engines.set(key, createEngine({ loader: { ...loader, listWorlds: async () => (await loader.listWorlds()).filter((i) => keep.has(i)) } })); }
  return engines.get(key);
};
const actionOwner = new Map(full.set.list().flatMap((w) => (w.operations ?? []).filter((o) => o.semantics === 'action' && o.action).map((o) => [o.action, w.id])));   // action -> world: a turn that asked for an action nobody loaded is read again (lazy loading)
const closure = (set, ids) => { const out = new Set(); for (const id of ids) for (const x of set.available(id)) out.add(x); for (const id of [...out]) { const w = set.get(id); for (const x of w?.reads ?? []) if (set.get(x)) for (const y of set.available(x)) out.add(y); } return out; };

const useKeys = process.argv.includes('--keys');   // the index of the patterns' prefilter keys (sound, but it loads almost every world); default: the words of the worlds, a word of more than T worlds says nothing
const ix = buildWorldIndex(full.set, { mode: useKeys ? 'keys' : 'vocab' });
const gz = (s) => gzipSync(s).length;
const worldBytes = new Map();
for (const id of allIds) {
  const dir = join(DEFAULT_ROOT, id); let b = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(sop|mjs)$/.test(e.name) && !/^(tests\.sop|describe\.sop)$/.test(e.name) && !/^datagen|^coverage/.test(e.name)) b += gz(readFileSync(p)); } };
  walk(dir); worldBytes.set(id, b);
}
const sizeOf = (ids) => [...ids].reduce((a, i) => a + (worldBytes.get(i) ?? 0), 0);
const bucketBytes = new Map(Object.entries(ix.buckets).map(([k, v]) => [k, gz(JSON.stringify(v))]));
const bloomBytes = gz(JSON.stringify(ix.bloom)), bloomRaw = JSON.stringify(ix.bloom).length;
const bucketsTotalGz = [...bucketBytes.values()].reduce((a, b) => a + b, 0), bucketsRaw = JSON.stringify(ix.buckets).length;
console.log(`corpus ${sample.length} messages; worlds ${allIds.length}; words ${ix.inv.size}; bloom ${bloomRaw} B (gz ${bloomBytes}); buckets ${Object.keys(ix.buckets).length} files, ${bucketsRaw} B (gz ${bucketsTotalGz}), largest ${Math.max(...bucketBytes.values())} B gz`);

// ---------- policy ----------
const vinv = invert(ix.vocab);   // the looser index (every word of a world's patterns and lexicons), for the variants with T > 0
const idsOf = (design, w) => (design === 'B' ? (ix.inv.get(w) ?? null) : (() => { const out = ix.ids.filter((id, i) => bloomHas(ix.bloom.filters[i], w)); return out.length ? out : null; })());
function plan(design, T, text, spell) {
  const qs = queryWords(text), bag = new Set([...messageBag(text), ...qs]);
  const touched = new Set(), need = new Set(); let spellUsed = false, unknown = 0;
  for (const w of bag) {
    touched.add(bucketOf(w));
    const ids = idsOf(design, w) ?? [];
    if (useKeys || ids.length <= T) for (const i of ids) need.add(i);
    for (const i of ix.strong.get(w) ?? []) need.add(i);   // the names a user opens a world's tab by
  }
  if (spell && design === 'B') {   // B lists its words: a word nobody knows is tried with its spelling candidates
    for (const w of qs) {
      if (ix.inv.has(w) || !/^[a-z]{4,}$/.test(w)) continue;
      unknown++;
      for (const c of spellingCandidates(w)) {
        if (c[0] !== w[0]) continue;
        const ids = ix.inv.get(c);
        if (ids && (useKeys || ids.length <= T)) { spellUsed = true; touched.add(bucketOf(c)); ids.forEach((i) => need.add(i)); }
      }
    }
  }
  return { need: new Set([...need].map((i) => (typeof i === 'number' ? ix.ids[i] : i))), touched, spellUsed, unknown };
}

const norm = (r) => JSON.stringify({ t: r.text, s: visibleState_(r) });
const visibleState_ = (r) => { try { return visibleState(r.state ?? {}); } catch { return null; } };

async function play(engine, c, only = null) {
  const s = engine.createSession({ language: 'en' });
  const tabId = tabIdOf(c.tab);
  if (tabId && engine.set.get('ui.shell')) s.setWorldState('ui.shell', { activeTab: tabId });
  for (const [w, patch] of Object.entries(c.init ?? {})) if (engine.set.get(w)) s.setWorldState(w, patch);
  const outs = [], used = new Set(), considered = new Set(); let esc = false;
  const vis = () => { const v = visibleState(s.state()); return Object.fromEntries(Object.entries(v).filter(([k]) => !only || only.has(k)).map(([k, x]) => [k, JSON.stringify(x)])); };
  let prev = vis();
  for (const m of [...c.setup, c.message]) {
    let r; try { r = await s.send(m); } catch (e) { outs.push({ t: `ERR ${e.message}`, st: {}, ch: [], eff: '' }); continue; }
    if (only) for (const a of s.takeMissed()) if (a === '*worlds' ? only.size < allIds.length : actionOwner.get(a) && !only.has(actionOwner.get(a))) esc = true;
    const now = vis(), changed = Object.keys(now).filter((k) => now[k] !== prev[k]).sort(); prev = now;
    outs.push({ t: r.text, st: now, ch: changed, eff: (r.effects ?? []).map((e) => e.name).join(',') });
    if (readingIncomplete(r) || (process.env.WI_CONTESTED && r.segments?.some((x) => x.routing?.contested || (process.env.WI_CONTESTED === '2' && x.routing?.runnerUp)))) esc = true;
    for (const sg of r.trace?.segments ?? []) {
      if (sg.match?.worldId) used.add(sg.match.worldId);
      if (sg.routing?.winner?.worldId) used.add(sg.routing.winner.worldId);
      for (const x of sg.worlds ?? []) considered.add(x.id);
    }
  }
  return { outs, used, considered, esc };
}

// ---------- ground truth: the full world set ----------
const t0 = Date.now();
const truth = new Map();
for (const c of sample) truth.set(c.id, await play(full, c));
console.log(`full set played in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const results = [];
for (const design of designs) for (const T of Ts) for (const spell of design === 'B' ? (process.argv.includes('--nospell') ? [false] : [true, false]) : [false]) {
  const name = `${design}${spell ? '+spell' : ''} T=${T}`;
  const row = { name, n: 0, fnBehaviour: 0, fnRaw: 0, escalated: 0, escBytes: 0, fnSuggestOnly: 0, fnStrict: 0, fnStrictOnlyUsed: 0, worlds: 0, bytes: 0, fp: 0, spellMsgs: 0, unknownWords: 0, bucketBytesPerMsg: 0, fnBySrc: {}, escBySrc: {}, nBySrc: {}, fnExamples: [] };
  const seenBuckets = new Set(); let sessionBucketBytes = 0;
  for (const c of sample) {
    const p = plan(design, T, [...c.setup, c.message].join(' . '), spell);
    const tw = worldOfTab(c.tab);
    const ids = closure(full.set, [...ALWAYS, ...(tw ? [tw] : []), ...p.need]);
    const eng = await subsetEngine([...ids]);
    const got = await play(eng, c, ids), want = truth.get(c.id);
    row.n++; row.nBySrc[c.src] = (row.nBySrc[c.src] ?? 0) + 1;
    const loadedExtra = [...ids].filter((i) => !ALWAYS.includes(i) && i !== tw);
    row.worlds += loadedExtra.length; row.bytes += sizeOf(loadedExtra);
    const sg = (s) => s.replace(/ ?Did you mean [^?]*\?\??/g, ' ~').replace(/ ?For example: "[^"]*"( or "[^"]*")?/g, ' ~').replace(/\s+/g, ' ').trim();
    const diffOf = (strip) => got.outs.length !== want.outs.length || got.outs.some((g, i) => { const w = want.outs[i]; return (strip ? sg(g.t) !== sg(w.t) : g.t !== w.t) || g.eff !== w.eff || g.ch.join() !== w.ch.filter((k) => ids.has(k)).join() || Object.keys(g.st).some((k) => g.st[k] !== w.st[k]); });
    const diffRaw = diffOf(false); const diffS = diffOf(true);
    const escalated = got.esc;   // two-pass: a first reading that is not complete is read again with every world (so it is the full reading)
    if (escalated) { row.escBySrc[c.src] = (row.escBySrc[c.src] ?? 0) + 1; row.escalated++; row.escBytes += sizeOf(allIds) - sizeOf(loadedExtra); }
    if (diffS) row.fnRaw++;
    const diff = diffS && !escalated;
    if (diffRaw && !diffS) row.fnSuggestOnly++;
    if (diff && process.env.WI_DEBUG) console.log('DIFF', `[${c.src}/${c.tab ?? ''}]`, c.message, '\n   got ', got.outs.map((o) => o.t).join(' // ').slice(0, 300), '\n   want', want.outs.map((o) => o.t).join(' // ').slice(0, 300), '\n   loaded', [...ids].filter((i) => !ALWAYS.includes(i)).join(','), '| need', [...want.used].join(','), '| eff', got.outs.map((o) => o.eff).join(';'), '/', want.outs.map((o) => o.eff).join(';'), '| changed', got.outs.map((o) => o.ch.join()).join(';'), '/', want.outs.map((o) => o.ch.join()).join(';'));
    if (diff) { row.fnBehaviour++; row.fnBySrc[c.src] = (row.fnBySrc[c.src] ?? 0) + 1; if (row.fnExamples.length < 12) row.fnExamples.push(`${c.src} [${c.tab ?? ''}] ${c.message}  | need ${[...want.used].join(',')}`); }
    const miss = [...want.used].filter((u) => !ids.has(u) && full.set.get(u));
    const missC = [...want.considered].filter((u) => !ids.has(u) && full.set.get(u));
    if (miss.length) row.fnStrictOnlyUsed++;
    if (miss.length || missC.length) row.fnStrict++;
    const needed = new Set([...want.used, ...want.considered]);
    row.fp += loadedExtra.filter((i) => !needed.has(i) && ![...needed].some((n) => full.set.available(n).includes(i))).length;
    if (p.spellUsed) row.spellMsgs++;
    row.unknownWords += p.unknown;
    for (const b of p.touched) if (!seenBuckets.has(b)) { seenBuckets.add(b); sessionBucketBytes += bucketBytes.get(b) ?? 0; }
    row.bucketBytesPerMsg += [...p.touched].reduce((a, b) => a + (bucketBytes.get(b) ?? 0), 0);
  }
  row.escKbPerMsg = +(row.escBytes / row.n / 1024).toFixed(1); delete row.escBytes; row.worldsPerMsg = +(row.worlds / row.n).toFixed(2); row.kbPerMsg = +(row.bytes / row.n / 1024).toFixed(1); row.fpPerMsg = +(row.fp / row.n).toFixed(2);
  row.bucketKbPerMsg = design === 'B' ? +(row.bucketBytesPerMsg / row.n / 1024).toFixed(1) : 0; row.bucketKbSession = design === 'B' ? +(sessionBucketBytes / 1024).toFixed(1) : 0;
  delete row.worlds; delete row.bytes; delete row.fp; delete row.bucketBytesPerMsg;
  results.push(row);
  console.log(JSON.stringify({ ...row, fnExamples: undefined }));
}
console.log('\nbaseline for scale: every world = ' + (sizeOf(allIds) / 1024).toFixed(0) + ' KB gz; always-loaded = ' + (sizeOf(ALWAYS) / 1024).toFixed(0) + ' KB gz');
const out = arg('json', null);
if (out) writeFileSync(out, JSON.stringify({ corpus: sample.length, bloom: { raw: bloomRaw, gz: bloomBytes }, buckets: { files: Object.keys(ix.buckets).length, raw: bucketsRaw, gz: bucketsTotalGz }, results }, null, 1));
