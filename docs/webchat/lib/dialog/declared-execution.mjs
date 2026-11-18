import { executeSpatialPlacement } from './spatial-placement-execution.mjs?v=d8cdb90319';
import { compareNativeReadings } from './capability-plan-adapter.mjs?v=dad67b1272';
import { NATIVE_AREAS,createAreaHost } from './app-reader-context.mjs?v=f4c8d09581';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { describeRouteComparison,resolveRequestRoute } from './request-routing-policy.mjs?v=fa7c52f7e7';
import { executeHistoryRequest } from './history-execution.mjs?v=d5c9d08711';
import { executeNativeCapability } from './capability-plan-execution.mjs?v=1a42340aaa';
import { executionValueSource } from './execution-policy.mjs?v=9ad12c3289';
import { inspectCachedExecutionSource } from './execution-world-inspection.mjs?v=90df3024fa';
import { World, str } from '../vendor/sopworld/sopworld.mjs?v=b7d50d9480';
import SOURCE from './new-engine-source.mjs?v=97321241ce';
let knowledge;
const source = () => knowledge ??= World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
export const inspectDeclaredExecutionSourceWorld = (options) => inspectCachedExecutionSource(knowledge, options);
export function declaredPropertyValues(concept) {
  const config = executionValueSource(concept);
  return config ? source().ofType(config.valueType).map((wire) => str(wire.attrs[config.nameKey]?.[0]))
    .filter((value) => typeof value === 'string') : [];
}
const unavailable=(text,reason)=>({text,parts:[{text,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],
  trace:{legacy:false,engine:'new',reason}});
const interpreters=new Map([
  ['history',{run:({session,candidate,options})=>executeHistoryRequest(session,candidate,options.view)}],
  ['spatial',{run:({session,candidate,options})=>executeSpatialPlacement(session,candidate,options)}],
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
    result=compare(indices.map(index=>candidates[index]),{area,view,bindings,host,observation:host.observe(),focus:session.newEngineFocus?.[view],unapplied,readKnowledge:source});
  }
  if(!limited)return result??null;
  const index=result?.index===undefined?undefined:indices[result.index];
  return {sop:(result?.sop??'')+'\n'+describeRouteComparison(routes,new Set(result?indices:[]),index),index,plan:result?.plan};
}
