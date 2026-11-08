#!/usr/bin/env node
/**
 * Builds training/eval/operational.jsonl (the fixed operational set) from the authored case modules training/eval/cases/*.mjs.
 * Deterministic: the modules use seeded generators only. The jsonl is committed; rebuild it only on purpose (it is the fixed yardstick).
 *   node scripts/build-operational.mjs [--check]     --check: report the composition and exit without writing
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeBuilder } from '../training/eval/cases/lib.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(REPO, 'training/eval/cases');
const b = makeBuilder();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs') && x !== 'lib.mjs').sort()) {
  const mod = await import(pathToFileURL(join(dir, f)).href);
  mod.default(b);
}
const problems = [];
const seen = new Set();
for (const c of b.cases) {
  const e = c.expect ?? {};
  if (!e.none && !(e.state?.length || e.answer?.length || e.answer_any?.length || e.effects?.length || e.status)) problems.push(`${c.id}: no expectation`);
  const key = JSON.stringify([c.world, c.tab, c.setup, c.message]);
  if (seen.has(key)) problems.push(`${c.id}: duplicate of an earlier case ("${c.message}")`);
  seen.add(key);
  if (/[^\x00-\x7F]/.test(c.message)) problems.push(`${c.id}: non-ASCII message`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const per = {};
for (const c of b.cases) (per[c.world] ??= []).push(c);
console.log(`${b.cases.length} cases`);
for (const g of GROUP_ORDER) for (const w of Object.keys(per).sort().filter((x) => groupOf(x) === g)) console.log(`  ${g.padEnd(24)} ${w.padEnd(15)} ${String(per[w].length).padStart(4)}  gaps ${per[w].filter((c) => c.known_gap).length}`);
const fam = {};
for (const c of b.cases) for (const f of c.families) fam[f] = (fam[f] ?? 0) + 1;
console.log('families:', Object.entries(fam).sort().map(([k, v]) => `${k}=${v}`).join(' '));
if (!process.argv.includes('--check')) writeFileSync(join(REPO, 'training/eval/operational.jsonl'), `${b.cases.map((c) => JSON.stringify(c)).join('\n')}\n`);
