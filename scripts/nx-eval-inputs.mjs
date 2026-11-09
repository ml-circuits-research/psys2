#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX5-lite input: the operational set (1296 messages, protected: used for evaluation only) with the rules' reading (operation per segment)
// and the rules' verified outcome (training/results/operational/rules-nomodel-*.json: right / partly / wrong / not understood).
//   node scripts/nx-eval-inputs.mjs [--out /home/salboaie/work/psys2/training/results/nx5-inputs.jsonl]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { formalize, FormSession } from '../src/formalizer/rules/index.mjs';
import { opOfWire } from './lib/nx-format.mjs';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/home/salboaie/work/psys2/training/results/nx5-inputs.jsonl';
const evalDir = '/home/salboaie/work/psys2/training/eval';
const resDir = '/home/salboaie/work/psys2/training/results/operational';
const resFile = readdirSync(resDir).filter((f) => f.startsWith('rules-nomodel')).sort().pop();
const outcome = new Map(JSON.parse(readFileSync(`${resDir}/${resFile}`, 'utf8')).cases.map((c) => [c.id, c.outcome]));
const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const tabOf = new Map(set.list().map((w) => [w.id, w.tab?.id ?? w.id]));
const rows = [];
for (const f of ['operational.jsonl', 'operational-long.jsonl']) {
  for (const l of readFileSync(`${evalDir}/${f}`, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const c = JSON.parse(l);
    const setup = c.setup ?? [];
    const form = new FormSession(); form.initDefaults();
    let res = null;
    try { [...setup.map((s) => (typeof s === 'string' ? s : s.message ?? s.text)), c.message].filter(Boolean).forEach((m, i, a) => { res = formalize(m, { worlds: set, session: form, source: `msg${i + 1}` }); }); } catch { res = null; }
    const segs = (res?.segments ?? []).filter((s) => s.match).map((s) => ({ text: s.text, op: s.wires.map(opOfWire).filter(Boolean)[0] ?? 'none', world: s.match.worldId }));
    rows.push({ id: c.id, set: f.replace('.jsonl', ''), world: c.world, tab: c.tab ?? tabOf.get(c.world) ?? 'none', message: c.message, setup: setup.length, outcome: outcome.get(c.id) ?? null, rules: segs });
  }
}
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} cases -> ${out}; outcomes ${JSON.stringify(rows.reduce((o, r) => ((o[r.outcome] = (o[r.outcome] ?? 0) + 1), o), {}))}`);
