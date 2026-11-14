// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FORM OPERATORS AT READ TIME (spec 16 section 11; sopworld 0.89 `liftTokens`, `learnFormOperators({ world })`).
 * An operator is a rule `from => to` over the TYPED tokens of a sentence (a thing becomes `<its type>`, a number `<num>`, function words stay) with variables `{x1}..` for the
 * shared runs. Learnt from aligned pairs (a variant and its canonical sentence), admitted by the library only when it brings held-out variants back to their canonical sentences.
 * Here an admitted operator is APPLIED: the clause is lifted, the rule matches the lifted tokens, and the output is written with the clause's own words (a variable is the original
 * words of the run it bound), so a candidate is a plain sentence, never a generated one. The candidates are only proposals: `withVariants` reads each through the rules and the world
 * decides. Browser-safe: no `node:*`; the typed world and the library are given by the host (`engine.setFormOperators`).
 */
const toksOf = (t) => String(t).toLowerCase().replace(/[?!.,]+/g, ' ').match(/[\p{L}\p{N}_'-]+/gu) || [];   // the library's own tokenisation
const VAR = /^\{(x\d+)\}$/;
import { budget } from './budget.mjs';
const MAX_CANDIDATES = 8, MAX_STEPS = 20000;

/** Every way one operator rewrites the lifted tokens `lt`, written with the original tokens `ot`; [] when it does not match or its output has a type placeholder it cannot fill. */
export function applyOperator(op, lt, ot) {
  const pat = op.from.split(' '), to = op.to.split(' ');
  if (to.some((t) => t.startsWith('<') && !VAR.test(t))) return [];   // a type placeholder as a constant has no word to stand for it
  const outs = [];
  let steps = 0;
  const go = (i, k, env) => {
    budget.tick('formops.apply');
    if (++steps > MAX_STEPS || outs.length >= MAX_CANDIDATES) return;
    if (k === pat.length) { if (i === lt.length) outs.push(to.flatMap((t) => { const m = VAR.exec(t); return m ? ot.slice(env[m[1]][0], env[m[1]][1]) : [t]; }).join(' ')); return; }
    const m = VAR.exec(pat[k]);
    if (m) { for (let j = i + 1; j <= lt.length; j++) go(j, k + 1, { ...env, [m[1]]: [i, j] }); return; }
    if (lt[i] === pat[k]) go(i + 1, k + 1, env);
  };
  go(0, 0, {});
  return outs;
}

/**
 * The candidate texts for `text`: the outputs of the admitted operators of `fo = { lib, world, operators }` that differ from the clause itself. Deduplicated, at most MAX_CANDIDATES.
 * An operator whose output is the clause's own words again is no candidate.
 */
export function formOperatorTexts(fo, text) {
  if (!fo?.lib?.liftTokens || !fo.world || !fo.operators?.length) return [];
  const ot = toksOf(text), lt = fo.lib.liftTokens(fo.world, text);
  if (!ot.length || lt.length !== ot.length) return [];
  const own = ot.join(' '), out = new Set();
  for (const op of fo.operators) {
    if (op.admitted === false) continue;
    for (const t of applyOperator(op, lt, ot)) if (t !== own) out.add(t);
    if (out.size >= MAX_CANDIDATES) break;
  }
  return [...out].slice(0, MAX_CANDIDATES);
}
