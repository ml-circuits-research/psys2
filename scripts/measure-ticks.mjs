#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Ticks per compute-budget site over the operational sets and the dialogues (spec 06 "Compute budgets").
 * Every turn runs with an unlimited counting budget; the script reports, per site, in how many turns it ticked, and p50 / p99 / max ticks per turn,
 * plus the same for the per-turn total. The default limits in src/dialog/budget-limits.mjs are 10x the p99 printed here (rounded up).
 *
 *   node scripts/measure-ticks.mjs [--mode rules|encoder|encoder+n1] [--ort <onnxruntime-node index.js>] [--only operational,long,ro,dialogues] [--limit N] [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { createBudget } from '../src/dialog/budget.mjs';
import { sessionOptions } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const load = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const SETS = { operational: 'training/eval/operational.jsonl', long: 'training/eval/operational-long.jsonl', ro: 'training/eval/operational-ro.jsonl', dialogues: 'training/eval/dialogues.jsonl' };

const mode = arg('mode', 'rules');
const only = arg('only', 'operational,long,ro,dialogues').split(',');
const limit = Number(arg('limit', 0)) || Infinity;
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const rt = await openNodeRuntime({ engine, mode, ortPath: arg('ort'), dispatcherDir: join(REPO, 'docs/webchat/models/dispatcher'), normalizerDir: join(REPO, 'docs/webchat/models/normalizer'), ortThreads: 0, overrides: {} });
const unlimited = () => createBudget({ perTurn: Infinity, perSite: Infinity });
const newSession = (c) => {
  const s = engine.createSession(sessionOptions(rt.settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  return s;
};
const turns = [];   // { set, ticks, bySite }
const run = async (set, s, msg, opts = {}) => {
  const b = unlimited();
  try { await s.send(msg, { ...opts, budget: b }); } catch { /* aborted turns still count */ }
  turns.push({ set, ticks: b.ticks, bySite: { ...b.bySite } });
};
for (const set of only) {
  const cases = load(SETS[set]).slice(0, limit);
  for (const c of cases) {
    if (set === 'dialogues') {
      const s = newSession(c);
      for (const t of c.turns) { if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab }); await run(set, s, t.message, t.mode ? { mode: t.mode } : {}); }
    } else {
      const s = newSession(c);
      for (const m of c.setup ?? []) await run(set, s, m);
      await run(set, s, c.message, c.lang === 'ro' ? { language: 'auto' } : {});
    }
  }
  process.stderr.write(`${set}: ${cases.length} cases\n`);
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const sites = [...new Set(turns.flatMap((t) => Object.keys(t.bySite)))].sort();
const rows = sites.map((site) => { const v = turns.map((t) => t.bySite[site] ?? 0); const nz = v.filter(Boolean); return { site, turns: nz.length, p50: q(v, 0.5), p99: q(v, 0.99), max: Math.max(...v), total: v.reduce((a, b) => a + b, 0) }; });
const all = turns.map((t) => t.ticks);
const total = { site: '(per turn)', turns: turns.length, p50: q(all, 0.5), p99: q(all, 0.99), max: Math.max(...all), total: all.reduce((a, b) => a + b, 0) };
const out = { mode, sets: only, turns: turns.length, total, sites: rows };
console.log(`| site | turns ticked | p50 | p99 | max | 10x p99 |\n|---|---|---|---|---|---|`);
for (const r of [...rows.sort((a, b) => b.p99 - a.p99), total]) console.log(`| ${r.site} | ${r.turns} | ${r.p50} | ${r.p99} | ${r.max} | ${r.p99 * 10} |`);
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
