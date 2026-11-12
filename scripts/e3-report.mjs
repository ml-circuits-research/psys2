#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3: merge the outputs of e3-compare (add and only runs) and e3-inventory into training/results/e3-generated-patterns-<date>.json.
 *   node scripts/e3-report.mjs --only cmp-only.json --add cmp-add.json --inv inv.json --out training/results/e3-generated-patterns-2026-11-12.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const only = J(arg('only')), add = J(arg('add')), inv = J(arg('inv'));
const W = new Set(only.worlds);
const strictWrong = (c) => c.to === 'wrong';
const summarize = (cmp) => {
  const changes = cmp.changes;
  const count = (f) => changes.filter(f).length;
  return {
    sets: cmp.sets,
    changeCounts: cmp.changeCounts,
    audited: {
      right_to_wrong: count((c) => W.has(c.world) && c.from === 'right' && c.to === 'wrong'),
      right_to_partly: count((c) => W.has(c.world) && c.from === 'right' && c.to === 'partly'),
      right_to_not_understood: count((c) => W.has(c.world) && c.from === 'right' && c.to === 'not_understood'),
      gained_wrong_to_right: count((c) => W.has(c.world) && c.from === 'wrong' && c.to === 'right'),
      gained_not_understood_to_right: count((c) => W.has(c.world) && c.from === 'not_understood' && c.to === 'right'),
      new_wrong_total: count((c) => strictWrong(c) && c.from !== 'wrong'),
    },
    outsideAudited: changes.filter((c) => !W.has(c.world)).map((c) => ({ set: c.set, id: c.id, world: c.world, from: c.from, to: c.to })),
    newWrong: changes.filter((c) => strictWrong(c) && c.from !== 'wrong').map((c) => ({ set: c.set, world: c.world, message: c.message, from: c.from, patBase: c.patBase, patGen: c.patGen })),
    lost: changes.filter((c) => c.from === 'right' && c.to !== 'right' && c.set !== 'operational-ro').map((c) => ({ set: c.set, world: c.world, message: c.message, to: c.to, patBase: c.patBase, patGen: c.patGen })),
    gained: changes.filter((c) => c.to === 'right' && c.from !== 'right').map((c) => ({ set: c.set, world: c.world, message: c.message, from: c.from, patBase: c.patBase, patGen: c.patGen })),
  };
};
const out = { date: '2026-11-12', task: 'E3', mode: 'rules (no model); hand-written patterns vs patterns generated from core.describe wires', worlds: [...W], only: summarize(only), add: summarize(add), inventory: inv.worlds };
writeFileSync(arg('out'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ only: out.only.audited, add: out.add.audited, newWrongOnly: out.only.newWrong.length, newWrongAdd: out.add.newWrong.length }, null, 1));
