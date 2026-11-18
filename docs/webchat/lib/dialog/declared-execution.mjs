import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=05e67389b5';
import { compareNativeReadings } from './capability-plan-adapter.mjs?v=92901bed0e';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=5b662d9ad0';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=b09758ffd7';
import { executionValueSource } from './execution-policy.mjs?v=fa9237583c';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=cabff52624';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=d762ac1a79';
import SOURCE from './new-engine-source.mjs?v=10c56a9044';
let knowledge;
const source = () => knowledge ??= World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
export const inspectDeclaredExecutionSourceWorld = (options) => inspectCachedExecutionSource(knowledge, options);
export function declaredPropertyValues(concept) {
  const config = executionValueSource(concept);
  return config ? source().ofType(config.valueType).map((wire) => str(wire.attrs[config.nameKey]?.[0]))
    .filter((value) => typeof value === 'string') : [];
}
export async function executeDeclaredRequest(session, candidate, _text, { bindings, view, unapplied = [],compiledPlan } = {}) {
  if (requestsSpatialPlacement(candidate)) return executeSpatialPlacement(session, candidate, { bindings, view });
  return executeNativeCapability(session, candidate, { bindings, view, unapplied, readKnowledge: source,compiledPlan });
}

export async function compareDeclaredReadings(session,candidates,{view,bindings}){
  const area=NATIVE_AREAS[view],state=session.isession.state[area?.world];
  if(!state||!bindings)return null;
  const host=await createAreaHost(area,{state:structuredClone(state),instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
  return compareNativeReadings(candidates,{area,view,bindings,host,observation:host.observe(),focus:session.newEngineFocus?.[view],unapplied:[],readKnowledge:source});
}
