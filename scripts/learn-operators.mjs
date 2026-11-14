#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FORM OPERATORS learnt from the aligned pairs of training/eval/form-pairs.jsonl by the vendored library's `learnFormOperators` (spec 16, "Learned reading rules" and section 11).
 *
 *   node scripts/learn-operators.mjs [--facts k.animals] [--catalog <dir>] [--source paraphrases-rt|owner-log|cousins|all] [--untyped] [--all] [--out file.json] [--ops-out file.json]
 *
 * Pairs: `same_meaning` rows (a variant and its canonical). A third (stable hash of the variant) is held out: never used to learn (unless `--all`), only to check that an operator brings the
 * variant back to its canonical sentence. By default the pairs are lifted through the typed world (0.89 `liftTokens`: a thing becomes <its type>, so "cow" and "dog" give one operator);
 * `--untyped` learns on the words (the 0.84 behaviour). Output: how many operators cover 80 % / 95 % of the aligned pairs, the inventory with examples, and a reading check in the script:
 * a held-out variant is rewritten by the admitted operators (src/dialog/form-operators.mjs, the same code as the runtime step) and read by `readByTypes`; judged against the frame of its
 * canonical, with and without the operators. `--ops-out` writes the admitted operators for the runtime step (PSYS2_FORMOPS=on, PSYS2_FORMOPS_FILE).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { READ } from './lib/cousins-host.mjs';
import { formOperatorTexts } from '../src/dialog/form-operators.mjs';
import { loadPairs, typedWorld, learn, isHeldOut } from './lib/formops-host.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
if (!lib.learnFormOperators || !lib.liftTokens) throw new Error('the vendored sopworld has no typed form operators (needs 0.89)');
const world = typedWorld(lib, { catalog: arg('catalog', undefined), facts: arg('facts', 'k.animals') });
const src = arg('source', 'all');
const pairs = loadPairs({ source: src });
const { result: res, train, held } = learn(lib, flag('untyped') ? null : world, pairs, { all: flag('all') });
const admitted = res.operators.filter((o) => o.admitted);

// the reading check, in the script
const frameOf = (t) => { const b = lib.readByTypes(world, t, READ).best; return b?.is === 'ask' ? b : null; };
const sameF = (a, b) => a && b && a.key === b.key && a.of?.id === b.of?.id;
const fo = { lib, world, operators: admitted };
let cases = 0, plain = 0, withOps = 0, onlyOps = 0;
for (const p of pairs.filter((x) => isHeldOut(x.variant))) {
  const want = frameOf(p.canonical);
  if (!want) continue;
  cases++;
  const a = sameF(frameOf(p.variant), want);
  const viaOps = formOperatorTexts(fo, p.variant).some((t) => sameF(frameOf(t), want));
  if (a) plain++;
  if (a || viaOps) withOps++;
  if (!a && viaOps) onlyOps++;
}
const out = {
  typed: !flag('untyped'), pairs: pairs.length, train: train.length, heldOut: held.length, source: src, learntOnAll: flag('all'),
  coverage: res.coverage, unaligned: res.unaligned,
  operators: res.operators.map((o) => ({ name: o.name, from: o.from, to: o.to, support: o.support.length, heldOut: o.heldOut, admitted: o.admitted, examples: o.support.slice(0, 2) })),
  admitted: admitted.length,
  supportedAtLeast2: res.operators.filter((o) => o.support.length >= 2).length,
  step: { heldOutPairsWithAskFrame: cases, readAlone: plain, readWithOperators: withOps, readOnlyThroughOperators: onlyOps },
};
console.log(JSON.stringify({ ...out, operators: out.operators.slice(0, 25) }, null, 1));
if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify(out, null, 1));
if (arg('ops-out', null)) writeFileSync(resolve(arg('ops-out')), JSON.stringify({ operators: admitted.map((o) => ({ name: o.name, from: o.from, to: o.to, support: o.support.length, heldOut: o.heldOut, admitted: true })), typed: !flag('untyped'), coverage: res.coverage }, null, 1));
