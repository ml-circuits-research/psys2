import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs';
import { executeNativeCapability } from './capability-plan-execution.mjs';
import { executionValueSource } from './execution-policy.mjs';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs';
import { World, str } from '../vendor/sopworld/sopworld.mjs';
import SOURCE from './new-engine-source.mjs';
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
