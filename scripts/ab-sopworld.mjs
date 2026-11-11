#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SOPWORLD-1b item 6: the full A/B experiment, ops against matrix (spec 15), in ONE process with two engines (an explicit `options.reasoner` wins over the flag).
 *
 *   node scripts/ab-sopworld.mjs [--limit N] [--sets a,b,c] [--out training/results/sopworld-ab-<date>.json] [--classes <file.json>] [--no-write]
 *
 * Every set is turned into sessions (setup + messages, tab, initial state). Each session runs in both engines, alternating which goes first, and every turn keeps the
 * reply text, the statuses, the state (ui.help dropped) and the time. Sets that carry expectations (operational, operational-long, operational-ro, dialogues) also go
 * through eval-operational's runCase / eval-dialogues' runDialogue in both engines, so an outcome (right / partly / not_understood / wrong) is known for each side.
 * Every session whose reply or statuses differ between the modes is kept as a transcript. Classification:
 *   - expectation sets: the better outcome wins (right > partly > not_understood > wrong); equal outcomes with different replies are "neutral" unless --classes says otherwise;
 *   - replay sets (no expectation): "unjudged" until a reviewer's --classes file (id -> [class, note]) is given.
 * Sets: operational, operational-long, operational-ro, dialogues, loose-words, typos, real-09c/d/e, real-dialogue (txt), mobile (phone export), gold (pilot-300), coherence, tests-sop (worlds' own tests are run by test-world).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { runCase } from './eval-operational.mjs';
import { runDialogue } from './eval-dialogues.mjs';
import { groupOf } from './lib/world-groups.mjs';
import { loadLogRecords, sessionsOf } from './lib/learn-logs.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const LIMIT = Number(arg('limit', 0)) || 0;
const DATE = new Date().toISOString().slice(0, 10);
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const E = (f) => join(REPO, 'training/eval', f);
const FOUR = new Set(['kids.shop', 'kids.arith', 'kids.tasks', 'games.tictactoe']);
const RANK = { right: 3, partly: 2, not_understood: 1, wrong: 0 };

const settings = settingsForMode('rules');
const mk = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
const engines = { ops: await mk('ops'), matrix: await mk('matrix') };
for (const k of Object.keys(engines)) if (engines[k].reasonerMode !== k) throw new Error(`engine ${k} runs ${engines[k].reasonerMode}`);

// ---- sessions from every set ---------------------------------------------------------------------------------------------------
const ss = [];   // { set, id, world, lang, tab, init, turns: [{ message, tab?, mode?, lang? }], exp?: 'case' | 'dialogue', src }
const step = (m) => (typeof m === 'string' ? { message: m } : { message: m.message ?? m.text });
function addCases(set, file, ro = false) {
  let rows = jsonl(E(file)); if (LIMIT) rows = rows.slice(0, LIMIT);
  for (const c of rows) ss.push({ set, id: c.id, world: c.world, lang: ro ? 'ro' : 'en', tab: c.tab, init: c.init, turns: [...(c.setup ?? []).map(step), step(c.message)], exp: 'case', src: c });
}
function addDialogues() {
  let rows = jsonl(E('dialogues.jsonl')); if (LIMIT) rows = rows.slice(0, LIMIT);
  for (const d of rows) ss.push({ set: 'dialogues', id: d.id, world: d.world, lang: 'en', tab: d.tab, init: d.init, turns: d.turns.map((t) => ({ message: t.message, tab: t.tab, mode: t.mode })), exp: 'dialogue', src: d });
}
function addSingles(set, rows, mapper) { for (const r of (LIMIT ? rows.slice(0, LIMIT) : rows)) ss.push({ set, ...mapper(r) }); }
function addLogs(set, file) {
  const recs = loadLogRecords(file);
  sessionsOf(recs).forEach((sess, k) => ss.push({ set, id: `${set}#s${k}`, world: sess.find((r) => r.worlds?.[0])?.worlds?.[0] ?? 'session', lang: 'auto', tab: null, turns: (LIMIT ? sess.slice(0, LIMIT) : sess).map((r) => ({ message: r.text, tab: r.tab ?? undefined, mode: r.mode === 'voice' ? 'voice' : undefined, lang: r.lang })), replay: true }));
}
const want = (arg('sets') ?? 'operational,operational-long,operational-ro,dialogues,loose-words,typos,real-09c,real-09d,real-09e,real-dialogue,mobile,gold,coherence').split(',');
if (want.includes('operational')) addCases('operational', 'operational.jsonl');
if (want.includes('operational-long')) addCases('operational-long', 'operational-long.jsonl');
if (want.includes('operational-ro')) addCases('operational-ro', 'operational-ro.jsonl', true);
if (want.includes('dialogues')) addDialogues();
if (want.includes('loose-words')) addSingles('loose-words', jsonl(E('loose-words.jsonl')), (r) => ({ id: `lw#${r.message}`, world: r.world, lang: 'en', tab: r.tab, turns: [...(r.setup ?? []).map(step), step(r.message)] }));
if (want.includes('typos')) {
  for (const f of readdirSync(E('typos')).filter((x) => x.endsWith('.jsonl'))) addSingles('typos', jsonl(E(`typos/${f}`)), (r) => ({ id: `ty#${r.world}#${r.typo}`, world: r.world, lang: 'en', tab: r.tab, turns: [...(r.setup ?? []).map(step), step(r.typo)] }));
}
for (const k of ['09c', '09d', '09e']) if (want.includes(`real-${k}`)) addLogs(`real-${k}`, E(`real-phrases-2026-11-${k}.jsonl`));
if (want.includes('mobile')) addLogs('mobile', E('real-phrases-2026-11-09f-mobile.json'));
if (want.includes('real-dialogue')) {
  for (const f of ['real-dialogue-2026-11-09.txt', 'real-dialogue-2026-11-09b.txt']) {
    const lines = readFileSync(E(f), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    ss.push({ set: 'real-dialogue', id: `rd#${f}`, world: 'session', lang: 'en', tab: 'robot', turns: lines.map(step), replay: true });
  }
}
if (want.includes('gold')) {
  addSingles('gold', jsonl(join(REPO, 'training/nx/gold/pilot-300.jsonl')), (g) => ({ id: g.id, world: g.world, lang: 'en', tab: g.tab && g.tab !== 'none' ? g.tab : null, turns: [...(g.context ?? []).map(step), step(g.text)], gold: g.subset }));
}
if (want.includes('coherence')) addSingles('coherence', jsonl(E('coherence-2026-11-10.jsonl')), (c) => ({ id: c.id, world: c.world, lang: 'en', tab: c.tab, turns: c.turns.map(step), kind: c.kind }));

// ---- running ---------------------------------------------------------------------------------------------------------------------
const strip = (st) => { const { 'ui.help': _h, ...rest } = st; return rest; };
function newSession(engine, x) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (x.tab) s.setWorldState('ui.shell', { activeTab: x.tab });
  for (const [w, patch] of Object.entries(x.init ?? {})) s.setWorldState(w, patch);
  return s;
}
async function transcript(engine, x) {
  const s = newSession(engine, x);
  const turns = [];
  for (const t of x.turns) {
    if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab });
    const ro = x.lang === 'ro' || (x.lang === 'auto' && t.lang === 'ro');
    const opts = { ...(ro ? { language: 'auto' } : {}), ...(t.mode ? { mode: t.mode } : {}) };
    const t0 = performance.now();
    let r, error = null;
    try { r = await s.send(t.message, Object.keys(opts).length ? opts : undefined); } catch (e) { error = e.message; }
    const ms = performance.now() - t0;
    turns.push({ message: t.message, reply: r ? r.text : `ERROR ${error}`, statuses: r?.statuses ?? [], ms, state: JSON.stringify(strip(s.state())) });
  }
  return turns;
}
function stateDiff(a, b) {   // short summary of what differs between two JSON states
  const out = [];
  const walk = (p, x, y) => {
    if (out.length >= 8 || JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(p ? `${p}.${k}` : k, x[k], y[k]); return; }
    const c = (v) => (v === undefined ? 'absent' : JSON.stringify(v).slice(0, 70));
    out.push(`${p}: ops ${c(x)} | matrix ${c(y)}`);
  };
  walk('', JSON.parse(a), JSON.parse(b));
  return out;
}
const dropEmpty = (v) => { if (Array.isArray(v)) return v.map(dropEmpty); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropEmpty(x)]).filter(([, x]) => !(x === null || (Array.isArray(x) && !x.length) || (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length)))); return v; };
const normState = (st) => JSON.stringify(dropEmpty(JSON.parse(st))).replace(/task_\d+/g, 'task_#');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10 : null; };

const classes = arg('classes') && existsSync(arg('classes')) ? JSON.parse(readFileSync(arg('classes'), 'utf8')) : {};
const coh = { ops: {}, matrix: {} };   // coherence passed flags of the latest eval-reasoner run per strategy (written by it)
for (const m of ['ops', 'matrix']) {
  const f = readdirSync(join(REPO, 'training/results')).filter((x) => x.startsWith(`sopworld1-${m}-`)).sort().at(-1);
  if (f) for (const r of JSON.parse(readFileSync(join(REPO, 'training/results', f), 'utf8')).coherence?.rows ?? []) coh[m][r.id] = r.passed;
}
const diffs = [];
const outcomes = {};   // set -> mode -> { right, partly, not_understood, wrong, n } (expectation sets, per world group four / others)
const times = { ops: {}, matrix: {} };   // group -> [ms]
const counts = {};     // set -> { sessions, turns, differing }
const t0 = performance.now();
for (const [i, x] of ss.entries()) {
  const order = i % 2 ? ['matrix', 'ops'] : ['ops', 'matrix'];
  const tr = {}, oc = {};
  for (const m of order) {
    tr[m] = await transcript(engines[m], x);
    if (x.exp === 'case') { const r = await runCase(engines[m], settings, x.src); oc[m] = r.outcome; }
    else if (x.exp === 'dialogue') { const r = await runDialogue(engines[m], settings, x.src); oc[m] = r.turns.map((t) => t.outcome); }
  }
  const c = (counts[x.set] ??= { sessions: 0, turns: 0, differing: 0 });
  c.sessions++; c.turns += x.turns.length;
  const grp = FOUR.has(x.world) ? 'four' : groupOf(x.world) === 'kids' ? 'kids-other' : groupOf(x.world);
  for (const m of ['ops', 'matrix']) for (const t of tr[m]) (times[m][grp] ??= []).push(t.ms);
  if (x.exp) for (const m of ['ops', 'matrix']) {
    const g = FOUR.has(x.world) ? 'four' : 'others';
    const o = ((outcomes[x.set] ??= {})[`${m}:${g}`] ??= { n: 0, right: 0, partly: 0, not_understood: 0, wrong: 0 });
    if (x.exp === 'case') { o.n++; o[oc[m]]++; } else for (const t of oc[m]) { o.n++; o[t]++; }
  }
  // a difference is a reply or a status that differs. The state view (what session.state() shows) differs by representation: a matrix world mirrors the library's
  // facts into it (kids.shop.money, kids.arith.holdings), ops keeps them in wires; absent against empty and task ids are normalized away, the rest is counted apart.
  const replyDiff = [], viewDiff = [];
  x.turns.forEach((t, k) => {
    const a = tr.ops[k], b = tr.matrix[k];
    if (a.reply !== b.reply || JSON.stringify(a.statuses) !== JSON.stringify(b.statuses)) replyDiff.push(k);
    else if (normState(a.state) !== normState(b.state)) viewDiff.push(k);
  });
  if (viewDiff.length && !replyDiff.length) c.view_only = (c.view_only ?? 0) + 1;
  // a turn whose outcome (right / partly / not_understood / wrong against the expectation) differs counts too, even when the reply text is the same (the expectation looks at the state)
  const outDiff = x.exp === 'case' ? (oc.ops !== oc.matrix ? [x.turns.length - 1] : []) : x.exp === 'dialogue' ? oc.ops.flatMap((o, k) => (o !== oc.matrix[k] ? [k] : [])) : [];
  for (const k of outDiff) if (!replyDiff.includes(k)) replyDiff.push(k);
  replyDiff.sort((p, q2) => p - q2);
  if (!replyDiff.length) continue;
  c.differing++;
  // random output (a random song, a random look) differs between two runs of the SAME mode: such a turn is noise, not the reasoner
  let random = false;
  if (replyDiff.length) {
    const again = await transcript(engines.ops, x);
    random = !outDiff.length && replyDiff.some((k) => again[k].reply !== tr.ops[k].reply);
  }
  let cls = 'unjudged', note = '';
  const key = `${x.set}:${x.id}`;
  if (random) { cls = 'neutral wording'; note = 'random output (differs between two runs of ops)'; }
  else if (x.exp === 'case' && RANK[oc.ops] !== RANK[oc.matrix]) cls = RANK[oc.matrix] > RANK[oc.ops] ? 'matrix better' : 'ops better';
  else if (x.exp === 'dialogue' && oc.ops.join() !== oc.matrix.join()) { const sm = (a) => a.reduce((n, o) => n + RANK[o], 0); cls = sm(oc.matrix) === sm(oc.ops) ? 'unjudged' : sm(oc.matrix) > sm(oc.ops) ? 'matrix better' : 'ops better'; }
  else if (x.set === 'coherence' && coh.ops[x.id] !== undefined && coh.ops[x.id] !== coh.matrix[x.id]) cls = coh.matrix[x.id] ? 'matrix better' : 'ops better';
  else if (x.exp || x.set === 'coherence') cls = 'unjudged';
  if (classes[key]) [cls, note] = classes[key];
  diffs.push({
    key, set: x.set, id: x.id, world: x.world, group: groupOf(x.world), four: FOUR.has(x.world), tab: x.tab ?? null, class: cls, note, random,
    outcome: oc.ops === undefined ? (x.set === 'coherence' ? { ops: coh.ops[x.id] ? 'passed' : 'failed', matrix: coh.matrix[x.id] ? 'passed' : 'failed' } : null) : { ops: oc.ops, matrix: oc.matrix },
    first_diff_turn: replyDiff[0], turns_differing: replyDiff.length,
    turns: x.turns.map((t, k) => ({ message: t.message, differs: replyDiff.includes(k), ops: tr.ops[k].reply, matrix: tr.matrix[k].reply, statuses: [tr.ops[k].statuses.join(','), tr.matrix[k].statuses.join(',')], state_diff: replyDiff.includes(k) ? stateDiff(normState(tr.ops[k].state), normState(tr.matrix[k].state)) : [], ...(outDiff.includes(k) && x.exp === 'dialogue' ? { outcome: [oc.ops[k], oc.matrix[k]] } : {}) })),
  });
  if (i % 200 === 0) console.error(`${i}/${ss.length} sessions, ${diffs.length} differing`);
}
const timing = Object.fromEntries(['ops', 'matrix'].map((m) => [m, Object.fromEntries(Object.entries(times[m]).map(([g, a]) => [g, { n: a.length, p50: q(a, 0.5), p95: q(a, 0.95) }]))]));
const sz = (f) => { const p = join(REPO, f); if (!existsSync(p)) return null; const b = readFileSync(p); return { raw: b.length, gzip: gzipSync(b, { level: 9 }).length }; };
const bundle = { library: sz('docs/webchat/lib/vendor/sopworld/sopworld.mjs'), host_layer: sz('docs/webchat/lib/reasoner/index.mjs') };
const byClass = {};
for (const d of diffs) (byClass[d.class] ??= {})[d.set] = (byClass[d.class][d.set] ?? 0) + 1;
const result = { date: DATE, limit: LIMIT || null, sessions: ss.length, elapsed_s: Math.round((performance.now() - t0) / 1000), counts, outcomes, timing, bundle, by_class: byClass, differing: diffs.length, differences_in_other_worlds: diffs.filter((d) => !d.four).map((d) => `${d.key} (${d.world})`), diffs };
if (!flag('no-write')) writeFileSync(join(REPO, arg('out', `training/results/sopworld-ab-${DATE}.json`)), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ sessions: ss.length, differing: diffs.length, by_class: byClass, other_world_diffs: result.differences_in_other_worlds.length, counts, timing, bundle, elapsed_s: result.elapsed_s }, null, 1));
