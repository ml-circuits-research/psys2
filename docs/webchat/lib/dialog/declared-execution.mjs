import { executeSpatialPlacement, requestsSpatialPlacement } from './spatial-placement-execution.mjs?v=feea6e000b';
import { compareNativeReadings } from './capability-plan-adapter.mjs?v=da2a8c539c';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=aab30ccd46';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=752da2c548';
import { executionValueSource } from './execution-policy.mjs?v=719611440c';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=57594b9287';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=14e619cf45';
import SOURCE from './new-engine-source.mjs?v=840316d8d9';
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
