#!/usr/bin/env node
/**
 * NX3 deterministic gate CLI.
 *   node scripts/nx-validate.mjs <in.jsonl> [--out accepted.jsonl] [--dropped dropped.jsonl] [--report report.json]
 * Reads candidate records, writes the ones that pass (with span offsets), the dropped ones with their reason, and prints counts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSet } from './lib/nx-read.mjs';
import { makeGateContext, gateOne } from './lib/nx-gate.mjs';

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const file = process.argv[2];
if (file && !file.startsWith('--')) {
  const gc = makeGateContext(await loadSet());
  const acc = []; const drop = []; const reasons = {};
  for (const l of readFileSync(file, 'utf8').split('\n').filter((x) => x.trim())) {
    let r; try { r = JSON.parse(l); } catch { reasons['not-an-object'] = (reasons['not-an-object'] ?? 0) + 1; continue; }
    const g = gateOne(gc, r);
    if (g.ok) acc.push(g.rec); else { reasons[g.reason] = (reasons[g.reason] ?? 0) + 1; drop.push({ ...r, gate_reason: g.reason }); }
  }
  if (arg('out')) writeFileSync(arg('out'), acc.map((x) => JSON.stringify(x)).join('\n') + (acc.length ? '\n' : ''));
  if (arg('dropped')) writeFileSync(arg('dropped'), drop.map((x) => JSON.stringify(x)).join('\n') + (drop.length ? '\n' : ''));
  const rep = { input: acc.length + drop.length, accepted: acc.length, dropped: drop.length, reasons };
  if (arg('report')) writeFileSync(arg('report'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify(rep));
}
