import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=6323944f41';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=40d04d6af6';
import { executionValueSource } from './execution-policy.mjs?v=fc08ac9b87';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=47c57a583e';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=f5d53a8da9';
import SOURCE from './new-engine-source.mjs?v=7b47872052';
let knowledge;
const source = () => knowledge ??= World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
export const inspectDeclaredExecutionSourceWorld = (options) => inspectCachedExecutionSource(knowledge, options);
export function declaredPropertyValues(concept) {
  const config = executionValueSource(concept);
  return config ? source().ofType(config.valueType).map((wire) => str(wire.attrs[config.nameKey]?.[0]))
    .filter((value) => typeof value === 'string') : [];
}
export async function executeDeclaredRequest(session, candidate, _text, { bindings, view, unapplied = [] } = {}) {
  if (requestsSpatialPlacement(candidate)) return executeSpatialPlacement(session, candidate, { bindings, view });
  return executeNativeCapability(session, candidate, { bindings, view, unapplied, readKnowledge: source });
}
