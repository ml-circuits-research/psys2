import { readSceneDefaults } from './scene-placement-defaults.mjs?v=b16bbeacf7';
import { executeSpatialPlacement } from './spatial-placement-execution.mjs?v=6f682d11df';
import { compareNativeReadings, compileNativeCapability } from './capability-plan-adapter.mjs?v=1d8aaf2bfe';
import { readDegreeBases } from './degree-bases.mjs?v=eaec18197f';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=b3122fd944';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { describeRouteComparison,resolveRequestRoute } from './request-routing-policy.mjs?v=dcc7f61e81';
import { executeHistoryRequest } from './history-execution.mjs?v=7f1b90d630';
import { executeNativeQuery } from './native-query-execution.mjs?v=b0f2e4a9ce';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=d0d3961a22';
import { executionValueSource } from './execution-policy.mjs?v=f1ae82cb42';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=b00606d8cc';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=4cf6e60057';
import SOURCE from './new-engine-source.mjs?v=03fd524c69';
let knowledge;
const source = () => knowledge ??= World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
export const inspectDeclaredExecutionSourceWorld = (options) => inspectCachedExecutionSource(knowledge, options);
export function declaredPropertyValues(concept) {
  const config = executionValueSource(concept);
  return config ? source().ofType(config.valueType).map((wire) => str(wire.attrs[config.nameKey]?.[0]))
    .filter((value) => typeof value === 'string') : [];
}
/** The rows of one type of the execution knowledge (the catalog modules the build pins: k.expect amounts, ...). */
export const declaredKnowledge = (type) => source().ofType(type);
/** The execution knowledge world itself (what a capability compilation reads values from). */
export const executionKnowledge = () => source();
const unavailable=(text,reason)=>({text,parts:[{text,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],
  trace:{legacy:false,engine:'new',reason}});
const interpreters=new Map([
  ['query',{run:({session,candidate,options})=>executeNativeQuery(session,candidate.wires,{...options,readKnowledge:source})}],
  ['history',{run:({session,candidate,options})=>executeHistoryRequest(session,candidate,options.view)}],
  ['spatial',{run:({session,candidate,options})=>executeSpatialPlacement(session,candidate,{...options,readKnowledge:source})}],
  ['capability',{run:({session,candidate,options})=>executeNativeCapability(session,candidate,{...options,readKnowledge:source}),compare:compareNativeReadings}],
  ['reject',{run:({route})=>unavailable('I could not apply the requested placement. Nothing changed.',route.reason)}],
]);

export async function executeDeclaredRequest(session,candidate,text,options={}){
  const route=resolveRequestRoute(candidate);
  const interpret=interpreters.get(route.method)?.run;
  if(route.rule){
    try{session.engine?.onWorldActivity?.({nodeIds:['execution:routing-policy','component:library'],phase:'stage',
      operation:'app.request.route',label:'Select request interpreter',method:route.method,rule:route.rule,wires:route.wires,proof:route.proof});}
    catch{/* Inspection does not affect execution. */}
  }
  const result=await interpret?.({session,candidate,route,options:{...options,text}});
  const reply=result??unavailable('I could not identify an action to apply. Nothing changed.',route.reason??'no-declared-action');
  return {...reply,trace:{...reply.trace,executionRoute:route}};
}

export async function compareDeclaredReadings(session,candidates,{view,bindings,unapplied=[]}){
  const routes=candidates.map(resolveRequestRoute);
  const comparable=routes.map(route=>interpreters.get(route.method)?.compare);
  const comparators=new Set(comparable.filter(Boolean));
  const [compare]=comparators;
  const indices=comparators.size===1?comparable.flatMap((fn,index)=>fn===compare?[index]:[]):[];
  const limited=indices.length!==routes.length;
  const area=NATIVE_AREAS[view],state=session.isession.state[area?.world];
  let result;
  if(indices.length&&state&&bindings){
    const host=await createAreaHost(area,{state:structuredClone(state),instanceId:instanceIdFor(session,area.world),loader:session.engine?.loader,knowledge:session.engine?.knowledge});
    const alternatives=indices.map(index=>candidates[index]),observation=host.observe();
    const declared={area,view,bindings,host,observation,focus:session.newEngineFocus?.[view],unapplied,readKnowledge:source};
    const previews=await readDegreeBases({candidates:alternatives,preflight:candidate=>compileNativeCapability(candidate,declared),
      prepare:args=>createAreaHost(area,{args,state:structuredClone(state),instanceId:observation.instanceId,loader:session.engine?.loader,knowledge:session.engine?.knowledge})});
    const context=previews?{...declared,previews}:declared;
    const sceneDefaults=await readSceneDefaults({host,knowledge:session.engine?.knowledge,candidates:alternatives,
      preflight:candidate=>compileNativeCapability(candidate,context)});
    result=compare(alternatives,{...context,sceneDefaults});
  }
  if(!limited)return result??null;
  const index=result?.index===undefined?undefined:indices[result.index];
  return {sop:(result?.sop??'')+'\n'+describeRouteComparison(routes,new Set(result?indices:[]),index),index,plan:result?.plan};
}
