import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=9cd6d80e0e';
import { compareNativeReadings } from './capability-plan-adapter.mjs?v=9686961b1b';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=b953840f3e';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=23b2bf19f0';
import { executionValueSource } from './execution-policy.mjs?v=df376f0b69';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=d4985ee166';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=327fb3cf41';
import SOURCE from './new-engine-source.mjs?v=3690001255';
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
