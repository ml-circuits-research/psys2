#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE FRESH PROBE SET OF THE REQUEST PROPOSER (Q48; training/eval/request-probe-2026-11-15.jsonl, test only, never trained on), two columns: rules alone / rules + proposer.
 * Each row runs in a fresh session on its tab through Session.send; a row with a `canonical` phrasing is judged against the canonical's own turn (also a fresh session):
 *   right   the turn's reading (act, target, facts, reaction) equals the canonical's and the visible state after it is the same;
 *   honest  nothing was done (the state did not change) and the reply did not claim a result;
 *   wrong   anything else that changed the state (an execution of another reading).
 * A control (`canonical: null`) is right when nothing changes (honest refusal), wrong when anything does.
 *
 *   node scripts/proposer-probe.mjs --ort <onnxruntime-node entry> [--dir <proposer export>] [--set <jsonl>] [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { openProposer } from './lib/proposer-node.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rows = readFileSync(arg('set', 'training/eval/request-probe-2026-11-15.jsonl'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l));
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const proposer = await openProposer({ dir: arg('dir', undefined), ortPath: arg('ort', process.env.PSYS2_ORT) });
const TABWORLD = { draw: 'art.draw', diagram: 'diagram.sketch', editor: 'docs.editor' };
const view = (s, tab) => JSON.stringify(s.state()[TABWORLD[tab]] ?? null, (k, v) => (['id', 'seed', 'log', 'history', 'lastAct', 'updated', 'time', 'x', 'y', 'w', 'h', 'rotation'].includes(k) ? undefined : v));
const sig = (q) => (q ? JSON.stringify([q.act ?? null, q.target ?? null, q.reaction ?? null, [...(q.facts ?? [])].map((f) => JSON.stringify(f)).sort()]) : 'none');
async function turn(text, tab, withP) {
  engine.proposer = withP ? proposer : null;
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab });
  const before = view(s, tab);
  let r;
  try { r = await s.send(text, { language: 'en' }); } catch (e) { r = { text: `ERROR ${e.message}`, trace: {} }; }
  const after = view(s, tab);
  return { reply: String(r.text ?? ''), q: r.trace?.request ?? null, changed: before !== after, view: after, proposer: r.trace?.request?.proposer ?? null, source: r.trace?.request?.source ?? null };
}
const out = [];
const tally = { rules: { right: 0, honest: 0, wrong: 0 }, proposer: { right: 0, honest: 0, wrong: 0 } };
for (const row of rows) {
  const gold = row.canonical ? await turn(row.canonical, row.tab, false) : null;
  const res = {};
  for (const [col, withP] of [['rules', false], ['proposer', true]]) {
    const t = await turn(row.text, row.tab, withP);
    let v;
    if (!gold) v = t.changed ? 'wrong' : 'right';
    else if (sig(t.q) === sig(gold.q) && t.view === gold.view && (t.q?.unread ?? []).length === 0) v = 'right';
    else if (!t.changed) v = 'honest';
    else v = 'wrong';
    tally[col][v]++;
    res[col] = { verdict: v, reply: t.reply.slice(0, 160), source: t.source, proposer: t.proposer };
  }
  out.push({ id: row.id, tab: row.tab, text: row.text, canonical: row.canonical, gold: gold ? sig(gold.q) : null, ...res });
  const ch = res.rules.verdict !== res.proposer.verdict ? `  <-- ${res.rules.verdict} -> ${res.proposer.verdict}` : '';
  console.log(`${row.id} [${row.tab}] ${row.text} | rules ${res.rules.verdict} | +proposer ${res.proposer.verdict}${ch}${res.proposer.proposer ? ` | ${res.proposer.proposer.why}${res.proposer.proposer.render ? ` "${res.proposer.proposer.render}"` : ''}` : ''}`);
}
const lat = out.map((r) => r.proposer.proposer?.ms).filter((x) => x != null).sort((a, b) => a - b);
const summary = { n: rows.length, ...tally, consulted: lat.length, accepted: out.filter((r) => r.proposer.source === 'proposer').length, model_ms_p50: lat[Math.floor(lat.length / 2)] ?? null, model_ms_p95: lat[Math.floor(lat.length * 0.95)] ?? null, won: out.filter((r) => r.rules.verdict !== 'right' && r.proposer.verdict === 'right').map((r) => r.id), lost: out.filter((r) => r.rules.verdict === 'right' && r.proposer.verdict !== 'right').map((r) => r.id), wrong_added: out.filter((r) => r.rules.verdict !== 'wrong' && r.proposer.verdict === 'wrong').map((r) => r.id) };
console.log(JSON.stringify(summary));
if (arg('json', null)) writeFileSync(arg('json'), JSON.stringify({ summary, rows: out }, null, 1));
