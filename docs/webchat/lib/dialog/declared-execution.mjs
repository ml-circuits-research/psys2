import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=0e8f9da3a1';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=07eae84c79';
import { executionValueSource } from './execution-policy.mjs?v=5900e84cec';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=27786193d4';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=b88e6c95e3';
import SOURCE from './new-engine-source.mjs?v=3af7eedb03';
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
