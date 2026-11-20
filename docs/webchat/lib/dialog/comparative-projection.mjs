// SPDX-License-Identifier: AGPL-3.0-only
// The factors of comparative steps ("bigger", "smaller"): derived once by the declared projection
// (worlds/app.project/comparative-projection.sop) from the execution policy's value sources and the catalog's scale
// in the execution knowledge context. The raw-structure bridge reads the table; nothing here names a word, a
// concept or a tool.
import { World, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b665fdbe3d';
import RULES from '../../worlds/app.project/comparative-projection-source.mjs?v=918ab2d391';
import SOURCE from './new-engine-source.mjs?v=6f84387b01';
import { executionPolicyWorld } from './execution-policy.mjs?v=839e38c58f';

let table;

/** [{concept, step, factor, declaration}] and, for an ordinal concept (its values are the steps of an ordered scale),
 * [{concept, step, ordinal: true, declaration}] — frozen; empty when no concept has a scale. */
export function comparativeSteps({ knowledge } = {}) {
  if (!knowledge && table) return table;
  const world = executionPolicyWorld().fork();
  // Only the scales whose values a degree takes (codec=degree) can carry a comparative step.
  const valueTypes = new Set(world.ofType('app.execution.values').filter((row) => row.attrs.codec?.[0] === 'degree')
    .map((row) => str(row.attrs.valueType[0])));
  const source = knowledge ?? World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
  const rows = [...valueTypes].flatMap((type) => source.ofType(type));
  if (rows.length && !world.tell(serialize(rows), { factsOnly: true }).ok) throw Error('invalid-comparative-knowledge');
  if (!world.load(RULES).ok) throw Error('invalid-comparative-projection');
  const steps = new Map(world.ofType('app.execution.comparative').map((row) => [row.attrs.step[0], row.id]));
  const result = world.ofType('app.execution.comparativeFactor').map((row) => Object.freeze({
    concept: str(row.attrs.concept[0]), step: row.attrs.step[0], factor: Number(row.attrs.factor[0]),
    declaration: steps.get(row.attrs.step[0]),
  })).filter((row) => Number.isFinite(row.factor) && row.factor > 0 && row.declaration);
  for (const row of world.ofType('app.execution.comparativeStep')) {
    const step = row.attrs.step[0], declaration = steps.get(step);
    if (declaration) result.push(Object.freeze({ concept: str(row.attrs.concept[0]), step, ordinal: true, declaration }));
  }
  Object.freeze(result);
  if (!knowledge) table = result;
  return result;
}
