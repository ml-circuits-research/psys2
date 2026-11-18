import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs';
import { compareNativeReadings } from './capability-plan-adapter.mjs';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs';
import { instanceIdFor } from './instance-identity.mjs';
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
export async function executeDeclaredRequest(session, candidate, text, { bindings, view, targetUnique, invocation, unapplied = [],compiledPlan } = {}) {
  if (requestsSpatialPlacement(candidate)) return executeSpatialPlacement(session, candidate, { bindings, view });
  return executeNativeCapability(session, candidate, { bindings, view, text, targetUnique, invocation, unapplied, readKnowledge: source,compiledPlan });
}

export async function compareDeclaredReadings(session,candidates,{view,bindings}){
  const area=NATIVE_AREAS[view],state=session.isession.state[area?.world];
  if(!state||!bindings)return null;
  const host=await createAreaHost(area,{state:structuredClone(state),instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
  return compareNativeReadings(candidates,{area,view,bindings,host,observation:host.observe(),focus:session.newEngineFocus?.[view],unapplied:[],readKnowledge:source});
}
