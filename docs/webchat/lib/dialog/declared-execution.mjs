import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=80a8073bcf';
import { compareNativeReadings } from './capability-plan-adapter.mjs?v=2026344bab';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=22bf86d30c';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { executeHistoryRequest } from './history-execution.mjs?v=02a0d68ac1';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=14744145b0';
import { executionValueSource } from './execution-policy.mjs?v=52e745ed26';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=f2296ae50f';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=7950b62b94';
import SOURCE from './new-engine-source.mjs?v=bbd94cc4be';
let knowledge;
const source = () => knowledge ??= World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
export const inspectDeclaredExecutionSourceWorld = (options) => inspectCachedExecutionSource(knowledge, options);
export function declaredPropertyValues(concept) {
  const config = executionValueSource(concept);
  return config ? source().ofType(config.valueType).map((wire) => str(wire.attrs[config.nameKey]?.[0]))
    .filter((value) => typeof value === 'string') : [];
}
export async function executeDeclaredRequest(session, candidate, text, { bindings, view, focus, targetUnique, invocation, unapplied = [],compiledPlan } = {}) {
  const history = await executeHistoryRequest(session, candidate, view);
  if (history) return history;
  if (requestsSpatialPlacement(candidate)) return executeSpatialPlacement(session, candidate, { bindings, view });
  return executeNativeCapability(session, candidate, { bindings, view, focus, text, targetUnique, invocation, unapplied, readKnowledge: source,compiledPlan });
}

export async function compareDeclaredReadings(session,candidates,{view,bindings,unapplied=[]}){
  const area=NATIVE_AREAS[view],state=session.isession.state[area?.world];
  if(!state||!bindings)return null;
  const host=await createAreaHost(area,{state:structuredClone(state),instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
  return compareNativeReadings(candidates,{area,view,bindings,host,observation:host.observe(),focus:session.newEngineFocus?.[view],unapplied,readKnowledge:source});
}
