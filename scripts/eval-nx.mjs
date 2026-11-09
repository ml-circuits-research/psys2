#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NX5: one system (rules | A-only | Aplus-only | A-first | Aplus-first | A-hybrid | Aplus-hybrid, see scripts/lib/nx-runtime.mjs) over every evaluation
 * set, through the real dialog engine (same sessions, interpreter and checks as eval-operational / eval-dialogues / eval-diagram). One row per item is
 * written to training/results/nx5/<system>.json; scripts/nx5-report.mjs merges the systems into the tables.
 *
 *   node scripts/eval-nx.mjs --system A-only --ort <onnxruntime-node entry> [--sets operational,dialogues,gold,nxtest,real,mobile,diagram] [--jobs N] [--limit N]
 *
 * Sets and what "correct" means:
 *   operational, operational-long   the expectation of the case holds (state / answer / effects), outcome right | partly | wrong | not_understood
 *   dialogues                       every turn's expectation (turn right; dialogue right = all turns right)
 *   gold                            training/nx/gold/pilot-300.jsonl, record level: the first reading's operation and every (key, value) equal the gold reading
 *                                   (subsets: rules = rules-verified, para = rules-fail / rules-differ paraphrases, real = real phrases)
 *   nxtest                          NX1 records of the dev/test splits, record level: rules-fail (+ rules-differ), generator-disagrees, and a sample of the others
 *   real                            real phrases 09c, d, e: the world of the expectation line ("ui.avatar: ...") reads the phrase (world level only: the
 *                                   expectation lines are prose); phrases whose expectation names no world only count answered / abstained
 *   mobile                          the mobile export (108 Romanian voice fragments, English translation as logged): answered / abstained, and agreement of the
 *                                   world with the logged rules reading when that one was supported
 *   diagram                         the diagram bench (imports/diagram-vss-demo/data/bench) with the source scorer (bench-canon.js): right act and right args
 *                                   (the args come from the diagram world's reader, as in scripts/eval-diagram.mjs, so the model's part is the act)
 * correct / wrong / abstain: abstain = no segment was understood (nothing executed), wrong = a reading that differs from the gold / a failed expectation,
 * correct = the gold holds.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { sessionOptions } from '../src/dialog/runtime-config.mjs';
import { buildSystem } from './lib/nx-runtime.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';
import { wireToRec } from './lib/nx-read.mjs';
import { groupOf } from './lib/world-groups.mjs';
import { score, canon, canonWant } from '../imports/diagram-vss-demo/reference/bench-canon.js';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const MAIN = '/home/salboaie/work/psys2/';   // untracked data lives in the main checkout
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const normVal = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : String(v).replace(/^\$(e\.)?/, '').toLowerCase().replace(/_/g, ' ').trim().replace(/^(-?\d+)\.0+$/, '$1'));
const strip = (st) => { const { 'ui.help': _h, ...rest } = st; return JSON.stringify(rest); };

// ---- items -------------------------------------------------------------------------------------------------------------------------
const nxToPilot = (r) => {
  const op = r.op.startsWith('request:') ? r.op.slice(8) : r.op.startsWith('question:') ? '?' + r.op.split(':')[1] : r.op;
  const type = r.op.startsWith('question:') ? r.op.split(':')[1] : null;
  const slots = [];
  for (const s of r.slots) {
    let key = s.key.replace(/^core\.request\./, '');
    if (key.startsWith('core.question.where.')) key = `${type}.${key.slice('core.question.where.'.length)}`;
    else if (key.startsWith('core.question.')) continue;
    slots.push({ key, value: s.value });
  }
  if (type) slots.push({ key: 'seek', value: r.op.split(':')[2] });
  return { op, slots };
};

function buildItems(sets, limit) {
  const items = [];
  const push = (it) => items.push(it);
  const want = (s) => sets.includes(s);
  if (want('operational')) for (const [f, set] of [['operational.jsonl', 'operational'], ['operational-long.jsonl', 'operational-long']]) for (const c of jl(MAIN + 'training/eval/' + f)) push({ kind: 'op', set, c });
  if (want('dialogues')) for (const d of jl(MAIN + 'training/eval/dialogues.jsonl')) push({ kind: 'dlg', set: 'dialogues', d });
  if (want('gold')) for (const g of jl(join(REPO, 'training/nx/gold/pilot-300.jsonl'))) push({ kind: 'rec', set: `gold-${g.subset}`, id: g.id, world: g.world, tab: g.tab, setup: g.context ?? [], text: g.text, gold: { op: g.op, slots: g.slots.map((s) => ({ key: s.key, value: s.value })) } });
  if (want('nxtest')) {
    const recs = jl(MAIN + 'training/dataset/nx/free-rules.jsonl');
    const ok = (r) => r.status !== 'filler' && r.lang === 'en' && r.text === r.message && r.op !== 'none' && r.slots.every((s) => s.value != null);
    const fail = recs.filter((r) => ok(r) && ['rules-fail', 'rules-differ'].includes(r.label_source) && r.split !== 'train');
    const dis = recs.filter((r) => ok(r) && r.label_source === 'generator-disagrees' && r.split === 'test');
    let rest = recs.filter((r) => ok(r) && ['generator-backed', 'rule-derived', 'rules-agree', 'canonical-ok'].includes(r.label_source) && r.split === 'test');
    let h = 12345; const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    rest = rest.map((r) => [rnd(), r]).sort((a, b) => a[0] - b[0]).slice(0, 700).map((x) => x[1]);
    for (const [name, list] of [['nxtest-rules-fail', fail], ['nxtest-gen-disagrees', dis], ['nxtest-sample', rest]]) for (const r of list) push({ kind: 'rec', set: name, id: r.id, world: r.world, tab: r.context?.tab ?? null, setup: r.context?.prev ?? [], text: r.text, gold: nxToPilot(r) });
  }
  if (want('real')) {
    const worlds = new Set(readdirSync(join(REPO, 'worlds')));
    for (const t of ['c', 'd', 'e']) {
      const ex = new Map(jl(MAIN + `training/eval/expectations-2026-11-09${t}.jsonl`).map((e) => [e.id, e]));
      for (const e of ex.values()) { const w = /^([a-z][\w.]*):/.exec(e.expect)?.[1]; push({ kind: 'real', set: `real-09${t}`, id: e.id, tab: e.tab, setup: e.context ?? [], text: e.text, lang: e.lang ?? 'en', expectWorld: w && worlds.has(w) ? w : null, expect: e.expect.slice(0, 120) }); }
    }
  }
  if (want('mobile')) {
    const d = JSON.parse(readFileSync(MAIN + 'training/eval/real-phrases-2026-11-09f-mobile.json', 'utf8'));
    d.records.forEach((r, i) => push({ kind: 'mobile', set: 'mobile', id: `mob${i}`, tab: r.tab, text: r.english, loggedStatus: r.status, loggedWorld: r.worlds?.[0] ?? null }));
  }
  if (want('diagram')) {
    const DATA = join(REPO, 'imports/diagram-vss-demo/data');
    for (const id of ['hand', 'blind', 'broad', 'seen', 'new_identities', 'heldout_formulations']) {
      for (const [i, r] of JSON.parse(readFileSync(join(DATA, 'bench', `${id}.json`), 'utf8')).entries()) {
        push({ kind: 'diag', set: `diagram/${id}`, row: r.wires ? { set: `bench/${id}`, id: `${id}#${i}`, text: r.text, names: r.names ?? [], groups: {}, wires: r.wires.filter((w) => w.args ?? w.gold).map((w) => ({ ...w, args: w.args ?? w.gold })) } : { set: `bench/${id}`, id: `${id}#${i}`, text: r.text, names: r.names ?? [], groups: {}, type: r.type, gold: r.gold } });
      }
    }
  }
  return limit ? items.filter((it, i) => items.filter((x) => x.set === it.set).indexOf(it) < limit) : items;
}

// ---- runners -----------------------------------------------------------------------------------------------------------------------
const newSession = (env, c) => {
  const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  return s;
};

async function runOp(env, c) {
  const s = newSession(env, c);
  for (const m of c.setup ?? []) await s.send(m);
  const before = s.state();
  let reply, error = null;
  try { reply = await s.send(c.message); } catch (e) { error = e.message; }
  if (!reply) return { id: c.id, world: c.world, outcome: 'wrong', error };
  const after = s.state();
  const last = reply.answers.at(-1); void last;
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const items = evaluateCase(c, { before, after, replyText: reply.text, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged: strip(before) !== strip(after), effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
  return { id: c.id, world: c.world, outcome, reply: reply.text.slice(0, 120), failing: items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`).slice(0, 3) };
}

async function runDialogue(env, d) {
  const s = newSession(env, d);
  const turns = [];
  for (const [i, t] of d.turns.entries()) {
    if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab });
    const c = { world: d.world, expect: t.expect };
    const before = s.state();
    let reply, error = null;
    try { reply = await s.send(t.message, t.mode ? { mode: t.mode } : undefined); } catch (e) { error = e.message; }
    if (!reply) { turns.push({ i, outcome: 'wrong', error }); continue; }
    const after = s.state();
    const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
    const items = evaluateCase(c, { before, after, replyText: reply.text, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
    turns.push({ i, outcome: classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged: strip(before) !== strip(after), effects: reply.effects.filter((e) => e.name !== 'chat.suggest') }) });
  }
  return { id: d.id, world: d.world, turns, right: turns.every((t) => t.outcome === 'right') };
}

const parsedSegs = (reply) => (reply?.segments ?? []).filter((x) => !x.unparsed && x.wires?.length);

async function runRec(env, it) {
  const s = newSession(env, it);
  for (const m of it.setup ?? []) await s.send(m);
  let reply, error = null;
  try { reply = await s.send(it.text); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const base = { id: it.id, world: it.world, goldOp: it.gold.op };
  if (!segs.length) return { ...base, outcome: 'abstain', error };
  const seg = segs[0];
  const main = seg.wires.find((w) => w.type !== 'core.agent');
  if (!main) return { ...base, outcome: 'abstain' };
  let got; try { got = wireToRec(env.engine.set, main); } catch { return { ...base, outcome: 'wrong', gotOp: '?' }; }
  const key = (x) => `${x.key.replace(/^core\.request\./, '')}=${normVal(x.value)}`;
  const g = new Set(it.gold.slots.map(key)), a = new Set(got.slots.map(key));
  const opOk = got.op === it.gold.op;
  const slotsOk = g.size === a.size && [...g].every((x) => a.has(x));
  const goldHit = [...g].filter((x) => a.has(x)).length;
  return { ...base, outcome: opOk && slotsOk ? 'correct' : 'wrong', opOk, gotOp: got.op, worldOk: seg.match?.worldId === it.world, goldSlots: g.size, gotSlots: a.size, slotHit: goldHit, from: seg.nxFrom ?? null };
}

async function runReal(env, it) {
  const s = newSession(env, it);
  for (const m of it.setup ?? []) await s.send(m);
  let reply, error = null;
  try { reply = await s.send(it.text, it.lang === 'ro' ? { language: 'auto' } : undefined); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const base = { id: it.id, set: it.set, expectWorld: it.expectWorld };
  if (!segs.length) return { ...base, outcome: 'abstain', error };
  const worlds = segs.map((x) => x.match?.worldId).filter(Boolean);
  if (!it.expectWorld) return { ...base, outcome: 'answered-unjudged', worlds };
  return { ...base, outcome: worlds.includes(it.expectWorld) ? 'correct' : 'wrong', worlds };
}

async function runMobile(env, it) {
  const s = newSession(env, it);
  let reply, error = null;
  try { reply = await s.send(it.text, { language: 'en' }); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const worlds = segs.map((x) => x.match?.worldId).filter(Boolean);
  return { id: it.id, outcome: segs.length ? 'answered' : 'abstain', worlds, loggedStatus: it.loggedStatus, loggedWorld: it.loggedWorld, agrees: it.loggedStatus === 'supported' ? worlds.includes(it.loggedWorld) : null, error };
}

const actOfWire = (w0) => { const w = { type: w0.type, args: w0.args ?? w0.gold }; return (w.type === 'question' ? `diagram.ask.${w.args.ask}` : w.type === 'fact' ? 'diagram.fact' : w.type === 'rule' ? 'diagram.rule' : `diagram.${w.args.action}`).toLowerCase(); };
const stateOf = (row) => ({
  shapes: (row.names ?? []).map((name, i) => ({ name, shape: 'circle', x: 80 + 100 * (i % 6), y: 80 + 100 * Math.floor(i / 6), size: 62, color: 'white', order: i + 1 })),
  groups: Object.entries(row.groups ?? {}).map(([name, members]) => ({ name, members })), seq: {}, edgeSeq: 0, order: (row.names ?? []).length,
});
let diagOps = null;
async function runDiag(env, it) {
  const row = it.row;
  diagOps ??= await import('../worlds/diagram.sketch/ops.mjs');
  const allActs = (env.allActs ??= new Map(env.engine.set.list().flatMap((w) => w.patterns.map((p) => [p.id, /action=([\w.]+)/.exec(p.emit ?? '')?.[1] ?? null]))));
  const nodes = diagOps.read(row.text, stateOf(row))?.nodes ?? [];
  const goldRow = row.wires ? { wires: row.wires, text: row.text } : { type: row.type, gold: row.gold };
  const s0 = score(nodes, goldRow);
  const sess = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
  sess.setWorldState('ui.shell', { activeTab: 'diagram' });
  sess.setWorldState('diagram.sketch', stateOf(row));
  let r; try { r = await sess.send(row.text, { language: 'en' }); } catch (e) { return { id: row.id, outcome: 'wrong', error: String(e?.message ?? e) }; }
  const segs = (r.segments ?? []).filter((x) => x.match);
  const acts = (x) => (allActs.get(x.match.patternId) ?? '').toLowerCase() || null;
  const golds = row.wires ? row.wires.map(actOfWire) : [actOfWire({ type: row.type, gold: row.gold })];
  if (!segs.length) return { id: row.id, outcome: 'abstain', argsOk: s0.ok };
  if (!row.wires) {
    const mine = segs.find((x) => x.match.worldId === 'diagram.sketch' && acts(x) === golds[0]) ?? segs[0];
    const actRight = mine.match.worldId === 'diagram.sketch' && acts(mine) === golds[0];
    return { id: row.id, outcome: actRight ? (s0.ok ? 'correct' : 'act-right-args-wrong') : 'wrong', actRight, argsOk: s0.ok, gold: golds[0], got: acts(mine) };
  }
  // messages in the bench (broad multi-clause rows): every gold act must be covered by a segment of diagram.sketch
  const have = segs.filter((x) => x.match.worldId === 'diagram.sketch').map(acts);
  const all = golds.every((g) => have.includes(g));
  return { id: row.id, outcome: all ? (s0.ok ? 'correct' : 'act-right-args-wrong') : 'wrong', actRight: all, argsOk: s0.ok };
}

const RUN = { op: (e, it) => runOp(e, it.c), dlg: (e, it) => runDialogue(e, it.d), rec: runRec, real: runReal, mobile: runMobile, diag: runDiag };

if (!isMainThread) {
  serveShard(async (wd) => {
    const env = await buildSystem({ system: wd.system, ortPath: wd.ort });
    return async (it) => {
      const t0 = performance.now();
      let r;
      try { r = await RUN[it.kind](env, it); } catch (e) { r = { id: it.id ?? it.c?.id ?? it.d?.id ?? it.row?.id, outcome: 'wrong', error: `crash: ${String(e?.message ?? e).slice(0, 100)}` }; }
      return { kind: it.kind, set: it.set, ms: Math.round(performance.now() - t0), ...r, ...(it.kind === 'dlg' ? { turns: r.turns } : {}), nxStats: env.stats };
    };
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const system = arg('system');
  if (!system) throw new Error('--system is required');
  const sets = (arg('sets', 'operational,dialogues,gold,nxtest,real,mobile,diagram')).split(',');
  const items = buildItems(sets, arg('limit') ? Number(arg('limit')) : 0);
  const jobs = Math.max(1, Math.min(parseJobs(), items.length));
  const t0 = Date.now();
  const rows = await runSharded({ file: SELF, items, jobs, workerData: { system, ort: arg('ort') }, chunk: 6 });
  const bySet = {};
  for (const r of rows) { const b = (bySet[r.set] ??= { n: 0 }); b.n++; b[r.outcome ?? (r.right ? 'right' : 'wrong')] = (b[r.outcome ?? (r.right ? 'right' : 'wrong')] ?? 0) + 1; }
  const dir = join(REPO, 'training/results/nx5');
  mkdirSync(dir, { recursive: true });
  const slim = rows.map(({ nxStats, ...r }) => r);
  // per-worker counters are cumulative: keep the largest of each per worker only roughly (the max seen across rows)
  const stats = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.nxStats ?? {})) stats[k] = Math.max(stats[k] ?? 0, v);
  const name = `${system}${arg('name') ? '-' + arg('name') : ''}`;
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ system, date: new Date().toISOString(), sets, seconds: Math.round((Date.now() - t0) / 1000), command: process.argv.slice(1).join(' '), summary: bySet, nxStatsMaxPerWorker: stats, rows: slim }));
  console.log(system, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(bySet));
}
