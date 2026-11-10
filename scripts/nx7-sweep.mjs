#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX7: offline tau sweep on the dev records only. Inputs: training/results/nx5/enc-n1-dev.json (shipped mode), <model>-dng-dev.json and <model>-dcovng-dev.json
// (D with the gate off, which record the features of each model reading). For a gate (tauOp, tauFrame, spans) the D outcome of an item is the
// model run's outcome when its model reading passes the gate, otherwise the shipped mode's outcome.
//   node scripts/nx7-sweep.mjs --model A3 [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const load = (n) => JSON.parse(readFileSync(join(REPO, 'training/results/nx5', n + '.json'), 'utf8')).rows;
const model = arg('model', 'A3');
const base = new Map(load('enc-n1-dev').map((r) => [r.id + '|' + r.set, r]));
const OPS = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99995], FR = [0, 0.34, 0.5, 0.67, 0.8, 0.9, 1];
const out = { model, variants: {} };
for (const variant of ['dng', 'dcovng']) {
  const rows = load(`${model}-${variant}-dev`);
  const used = rows.filter((r) => r.feat && r.from === 'model');
  const grid = [];
  for (const noNeg of [false, true]) for (const spans of [true, false]) for (const tauOp of OPS) for (const tauFrame of FR) {
    let gain = 0, gainFail = 0, added = 0, addedFiller = 0, addedRegress = 0, used_ = 0;
    for (const r of rows) {
      const b = base.get(r.id + '|' + r.set);
      const pass = r.feat && r.from === 'model' && r.feat.op >= tauOp && r.feat.frame >= tauFrame && (!spans || r.feat.inFrame) && !(noNeg && r.feat.neg);
      if (!pass) continue;
      used_++;
      if (b.outcome !== 'correct' && r.outcome === 'correct') { gain++; if ((r.set === 'nxdev-fail' || r.set === 'nxdev-nx3')) gainFail++; }
      if (b.outcome !== 'wrong' && r.outcome === 'wrong') { added++; if (r.set === 'nxdev-filler') addedFiller++; if (b.outcome === 'correct' && r.set !== 'nxdev-filler') addedRegress++; }
    }
    grid.push({ noNeg, spans, tauOp, tauFrame, used: used_, gain, gainFail, added, addedFiller, addedRegress });
  }
  const zero = grid.filter((g) => g.added === 0);
  zero.sort((a, b) => b.gain - a.gain || b.tauOp - a.tauOp || b.tauFrame - a.tauFrame || (b.spans ? 1 : 0) - (a.spans ? 1 : 0));
  out.variants[variant] = { modelReadings: used.length, ungated: grid.find((g) => !g.noNeg && !g.spans && g.tauOp === 0 && g.tauFrame === 0), best: zero[0] ?? null, bestNoNeg: zero.find((g) => g.noNeg) ?? null, grid };
}
if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify(out, null, 1));
for (const [v, d] of Object.entries(out.variants)) {
  console.log(`\n${model} ${v}: ${d.modelReadings} model readings on dev; ungated`, JSON.stringify(d.ungated), '\nbest with 0 added wrong:', JSON.stringify(d.best), '\nbest with the negation guard:', JSON.stringify(d.bestNoNeg));
  console.log('tauOp x tauFrame (spans on): gain/added-wrong');
  console.log('        ' + FR.map((f) => String(f).padStart(9)).join(''));
  for (const o of OPS) console.log(String(o).padEnd(8) + FR.map((f) => { const g = d.grid.find((x) => !x.noNeg && x.spans && x.tauOp === o && x.tauFrame === f); return `${g.gain}/${g.added}`.padStart(9); }).join(''));
}
