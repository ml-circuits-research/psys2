#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Host held-out check on top of the library's admission (sopworld 0.97): an admitted form operator is kept only when its own held-out applications pass at a rate >= --min-rate (default 0.8)
 * over >= --min-of applications (default 3). Learns on the training two thirds (`learn` of scripts/lib/formops-host.mjs), writes `{ operators }` for PSYS2_FORMOPS_FILE.
 *   node scripts/strict-operators.mjs --out file.json [--min-rate 0.8] [--min-of 3] [--all-admitted-out file.json]
 */
import { writeFileSync } from 'node:fs';
import { loadPairs, typedWorld, learn } from './lib/formops-host.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const world = typedWorld(lib);
const { result } = learn(lib, world, loadPairs());
const admitted = result.operators.filter((o) => o.admitted);
const rate = Number(arg('min-rate', 0.8)), minOf = Number(arg('min-of', 3));
const keep = admitted.filter((o) => o.heldOut && o.heldOut.of >= minOf && o.heldOut.pass / o.heldOut.of >= rate);
const ser = (o) => ({ name: o.name, from: o.from, to: o.to, support: o.support.length, heldOut: o.heldOut, admitted: true });
console.log(JSON.stringify({ operators: result.operators.length, admittedByLibrary: admitted.length, keptByHost: keep.length, dropped: admitted.filter((o) => !keep.includes(o)).map((o) => ({ from: o.from, to: o.to, heldOut: o.heldOut })) }, null, 1));
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ operators: keep.map(ser) }, null, 1));
if (arg('all-admitted-out')) writeFileSync(arg('all-admitted-out'), JSON.stringify({ operators: admitted.map(ser) }, null, 1));
