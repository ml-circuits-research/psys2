#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Turn-time benchmark of the two reasoner strategies (spec 15), same inputs, interleaved order, warmed up.
 *
 *   node scripts/bench-reasoner.mjs [--reps 5] [--limit N] [--instrument] [--out file.json]
 *
 * Inputs: the operational and dialogue sets (training/eval), one session per case, every turn timed. The engines are two instances in one process (an explicit
 * `options.reasoner` wins over the flag). Per world group (four = the matrix worlds, kids-other, ...) and mode: n, p50, p95, mean in ms; repetitions alternate
 * which mode goes first. With --instrument the ReasonerSession methods and the library calls are timed (inclusive, with call counts, per world group of the
 * session) in the matrix engine: the groups other than `four` show the work done for a non-matrix world in matrix mode.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { ReasonerSession } from '../src/reasoner/index.mjs';
import { groupOf } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const REPS = Number(arg('reps', 5)), LIMIT = Number(arg('limit', 0)) || 0, INSTR = process.argv.includes('--instrument');
const STRIDE = Number(arg('stride', 1)) || 1, NO_DIALOGUES = process.argv.includes('--no-dialogues');   // --stride 13 --no-dialogues: every 13th operational case (about 100), no dialogues
const jsonl = (f) => readFileSync(join(REPO, 'training/eval', f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const FOUR = new Set(['kids.shop', 'kids.arith', 'kids.tasks', 'games.tictactoe']);
const settings = settingsForMode('rules');
const mk = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
const engines = { ops: await mk('ops'), matrix: await mk('matrix') };

const step = (m) => (typeof m === 'string' ? m : m.message ?? m.text);
const sess = [];
let cases = jsonl('operational.jsonl'); if (STRIDE > 1) cases = cases.filter((_, i) => i % STRIDE === 0); if (LIMIT) cases = cases.slice(0, LIMIT);
for (const c of cases) sess.push({ world: c.world, tab: c.tab, init: c.init, turns: [...(c.setup ?? []).map(step), c.message] });
let dl = NO_DIALOGUES ? [] : jsonl('dialogues.jsonl'); if (LIMIT) dl = dl.slice(0, LIMIT);
for (const d of dl) sess.push({ world: d.world, tab: d.tab, init: d.init, turns: d.turns.map((t) => t.message) });
const grp = (w) => (FOUR.has(w) ? 'four' : groupOf(w) === 'kids' ? 'kids-other' : groupOf(w));

// ---- instrumentation (matrix engine only) ----------------------------------------------------------------------------------------------
const stage = {};   // name -> { n, ms, g: group -> { n, ms } }
let curGroup = null;
function wrap(obj, name, label) {
  const f = obj[name];
  obj[name] = function (...a) {
    const t = performance.now();
    try { return f.apply(this, a); } finally {
      const d = performance.now() - t;
      const s = (stage[label] ??= { n: 0, ms: 0, g: {} }); s.n++; s.ms += d;
      const g = (s.g[curGroup] ??= { n: 0, ms: 0 }); g.n++; g.ms += d;
    }
  };
}
if (INSTR) {
  for (const m of ['tell', '_defaults', 'beginTurn', 'commitTurn', 'refuseFacts', '_state', 'syncTo', 'resolve', 'request', 'fork', 'leaves', 'rewind', '_charge']) wrap(ReasonerSession.prototype, m, `rs.${m}`);
  const proto = Object.getPrototypeOf(engines.matrix.reasoner.session().of('kids.shop'));
  for (const m of ['mark', 'rewind', 'tell', 'complete', 'query', 'act', 'explain', 'ofType', 'fork', 'stats', 'check']) if (typeof proto[m] === 'function') wrap(proto, m, `lib.${m}`);
}
async function run(mode, x) {
  const t0 = performance.now();
  const s = engines[mode].createSession(sessionOptions(settings, { language: 'en' }));
  const createMs = performance.now() - t0;
  if (x.tab) s.setWorldState('ui.shell', { activeTab: x.tab });
  for (const [w, patch] of Object.entries(x.init ?? {})) s.setWorldState(w, patch);
  const ms = [];
  curGroup = grp(x.world);
  for (const m of x.turns) { const t = performance.now(); try { await s.send(m); } catch { /* counted anyway */ } ms.push(performance.now() - t); }
  return { ms, createMs };
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const rows = { ops: {}, matrix: {} }, create = { ops: [], matrix: [] };
for (const x of sess) for (const m of ['ops', 'matrix']) await run(m, x);   // warm-up, discarded
for (const k of Object.keys(stage)) delete stage[k];
for (let rep = 0; rep < REPS; rep++) {
  for (const [i, x] of sess.entries()) {
    const order = (i + rep) % 2 ? ['matrix', 'ops'] : ['ops', 'matrix'];
    for (const m of order) { const r = await run(m, x); (rows[m][grp(x.world)] ??= []).push(...r.ms); create[m].push(r.createMs); }
  }
}
const out = { date: new Date().toISOString().slice(0, 10), reps: REPS, sessions: sess.length, groups: {}, create_ms: {} };
for (const g of [...Object.keys(rows.ops), 'all']) {
  const pick = (m) => (g === 'all' ? Object.values(rows[m]).flat() : rows[m][g]);
  const o = pick('ops'), x = pick('matrix');
  out.groups[g] = { n: o.length, ops: { p50: r3(q(o, 0.5)), p95: r3(q(o, 0.95)), mean: r3(mean(o)) }, matrix: { p50: r3(q(x, 0.5)), p95: r3(q(x, 0.95)), mean: r3(mean(x)) }, p50_ratio: r3(q(x, 0.5) / q(o, 0.5)), mean_ratio: r3(mean(x) / mean(o)) };
}
for (const m of ['ops', 'matrix']) out.create_ms[m] = { p50: r3(q(create[m], 0.5)), mean: r3(mean(create[m])) };
if (INSTR) out.stages = Object.fromEntries(Object.entries(stage).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, { calls: v.n, total_ms: r3(v.ms), per_group: Object.fromEntries(Object.entries(v.g).map(([g, s]) => [g, { calls: s.n, ms: r3(s.ms) }])) }]));
if (arg('out')) writeFileSync(arg('out'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
