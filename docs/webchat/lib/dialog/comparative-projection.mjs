// SPDX-License-Identifier: AGPL-3.0-only
// The factors of comparative steps ("bigger", "smaller"): derived once by the declared projection
// (worlds/app.project/comparative-projection.sop) from the execution policy's value sources and the catalog's scale
// in the execution knowledge context. The raw-structure bridge reads the table; nothing here names a word, a
// concept or a tool.
import { World, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=5221d62911';
import RULES from '../../worlds/app.project/comparative-projection-source.mjs?v=89a6c6106f';
import SOURCE from './new-engine-source.mjs?v=ff3610e673';
import { executionPolicyWorld } from './execution-policy.mjs?v=99cfae12cb';

let table;

/** [{concept, step, factor, declaration}] — frozen; empty when the knowledge has no scale for any concept. */
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
  Object.freeze(result);
  if (!knowledge) table = result;
  return result;
}
