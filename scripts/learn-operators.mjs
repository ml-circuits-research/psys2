#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FORM OPERATORS learnt from the aligned pairs of training/eval/form-pairs.jsonl by the vendored library's `learnFormOperators` (spec 16, "Learned reading rules"). Measurement only.
 *
 *   node scripts/learn-operators.mjs [--facts k.animals] [--catalog <dir>] [--source paraphrases-rt|owner-log|cousins|all] [--out file.json]
 *
 * Pairs: `same_meaning` rows (a variant and its canonical). A third (stable hash of the variant) is held out: never used to learn, only to check that an operator brings the variant
 * back to its canonical sentence. Output: how many operators cover 80 % / 95 % of the aligned pairs, the inventory with examples, and the reading step in the script: a variant is
 * normalised by the admitted operators (the first that matches and gives a text the typed reader reads as an `ask`) and read by `readByTypes`; judged against the frame of its canonical,
 * on the held-out pairs, with and without the operators. Nothing reaches the runtime: an operator is a proposal, the world decides.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from './cousins.mjs';
import { READ } from './lib/cousins-host.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const third = (t) => parseInt(createHash('sha1').update(t).digest('hex').slice(0, 6), 16) % 3 === 0;
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
if (!lib.learnFormOperators) throw new Error('the vendored sopworld has no learnFormOperators (needs 0.84)');
const world = buildWorld(lib, { catalog: resolve(arg('catalog', join(REPO, 'tests/fixtures/catalog'))), facts: arg('facts', 'k.animals') });
const src = arg('source', 'all');
const pairs = readFileSync(join(REPO, 'training/eval/form-pairs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.same_meaning && (src === 'all' || r.source === src));
const train = pairs.filter((p) => !third(p.variant)), held = pairs.filter((p) => third(p.variant));

const res = lib.learnFormOperators(train, { heldOut: held });
const admitted = res.operators.filter((o) => o.admitted);

// the reading step, in the script
const frameOf = (t) => { const b = lib.readByTypes(world, t, READ).best; return b?.is === 'ask' ? b : null; };
const sameF = (a, b) => a && b && a.key === b.key && a.of?.id === b.of?.id;
const norms = (text) => {
  const out = [];
  for (const o of admitted) { try { const toks = text.toLowerCase().match(/[\p{L}\p{N}_'-]+/gu) ?? []; const t = applyOp(o, toks); if (t && t !== toks.join(' ')) out.push(t); } catch { /* does not match */ } }
  return out;
};
function applyOp(rule, toks) {
  const pat = rule.from.split(' ');
  const go = (i, k, env) => {
    if (k === pat.length) return i === toks.length ? env : null;
    const m = /^\{(x\d+)\}$/.exec(pat[k]);
    if (m) { for (let j = i + 1; j <= toks.length; j++) { const r = go(j, k + 1, { ...env, [m[1]]: toks.slice(i, j) }); if (r) return r; } return null; }
    return toks[i] === pat[k] ? go(i + 1, k + 1, env) : null;
  };
  const env = go(0, 0, {});
  return env ? rule.to.split(' ').flatMap((t) => { const m = /^\{(x\d+)\}$/.exec(t); return m ? env[m[1]] : [t]; }).join(' ') : null;
}
let cases = 0, plain = 0, withOps = 0, onlyOps = 0;
for (const p of held) {
  const want = frameOf(p.canonical);
  if (!want) continue;
  cases++;
  const a = sameF(frameOf(p.variant), want);
  const viaOps = norms(p.variant).some((t) => sameF(frameOf(t), want));
  if (a) plain++;
  if (a || viaOps) withOps++;
  if (!a && viaOps) onlyOps++;
}
const out = {
  pairs: pairs.length, train: train.length, heldOut: held.length, source: src,
  coverage: res.coverage, unaligned: res.unaligned,
  operators: res.operators.map((o) => ({ name: o.name, from: o.from, to: o.to, support: o.support.length, heldOut: o.heldOut, admitted: o.admitted, examples: o.support.slice(0, 2) })),
  admitted: admitted.length,
  step: { heldOutPairsWithAskFrame: cases, readAlone: plain, readWithOperators: withOps, readOnlyThroughOperators: onlyOps },
};
console.log(JSON.stringify({ ...out, operators: out.operators.slice(0, 25) }, null, 1));
if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify(out, null, 1));
