import {World,parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=915a9d5c18';
import SCHEMA from '../../worlds/app.project/request-routing-schema-source.mjs?v=1d66248bf7';
import POLICY from '../../worlds/app.project/request-routing-policy-source.mjs?v=89ae1f392c';
import {historyPolicy} from './history-policy.mjs?v=31a600236e';

const schema='app.request.route';
const selectedType=schema+'.selection';
let base;

function routeWorld(){
 if(!base){
  const world=new World({library:{[schema]:SCHEMA}});
  world.load(POLICY);
  // The exact methods owned by the history compiler determine which acts it accepts.
  const methods=historyPolicy().ofType('std.compile.rule');
  if(!world.tell(serialize(methods),{factsOnly:true}).ok)throw Error('invalid-request-routing-history-methods');
  base=world;
 }
 return base;
}

export const inspectRequestRoutingPolicy=()=>({loaded:!!base,policy:POLICY,schema:SCHEMA});

export function resolveRequestRoute(candidate){
 if(typeof candidate?.wires!=='string'||candidate.wires.length>65536)return {reason:'invalid-routing-request'};
 let wires;
 try{wires=parse(candidate.wires);}catch{return {reason:'invalid-routing-request'};}
 const parent=routeWorld();
 const requests=wires.filter(wire=>wire.type==='std.request');
 const ids=new Map(wires.map((wire,index)=>[wire.id,'route_input_'+index]));
 if(requests.length!==1||requests[0].id!==candidate.request||ids.size!==wires.length||
    wires.some(wire=>wire.pattern||!(wire.type==='std.request'||wire.type.startsWith('std.request.'))||!parent.schema(wire.type)?.closed||
     Object.values(wire.attrs).some(values=>values.some(token=>token.startsWith('?')||token.startsWith('$')&&!ids.has(token.slice(1)))))){
  return {reason:'invalid-routing-request'};
 }
 // Scope the caller's local ids apart from the policy and imported method declarations.
 const observed=wires.map(wire=>({...wire,id:ids.get(wire.id),attrs:Object.fromEntries(Object.entries(wire.attrs).map(([key,values])=>
  [key,values.map(token=>token.startsWith('$')?'$'+ids.get(token.slice(1)):token)]))}));
 const world=parent.fork();
 const admitted=world.tell(serialize(observed),{factsOnly:true});
 if(!admitted.ok)return {reason:'invalid-routing-request',diagnostics:admitted.violations};
 const selections=world.ofType(selectedType).filter(wire=>wire.attrs.request[0]==='$'+ids.get(candidate.request));
 if(selections.length!==1)return {reason:'no-unique-execution-route'};
 const [selected]=selections, proof=world.explain(selected.id);
 return {method:str(selected.attrs.method[0]),reason:str(selected.attrs.reason?.[0]),
  rule:proof.via,proof,wires:serialize([...observed,...world.ofType(schema+'.spatial'),selected])};
}

export function describeRouteComparison(routes,assessed,selected){
 const alternatives=routes.map(({method},index)=>({id:'route.comparison.option.'+index,type:schema+'.alternative',attrs:{
  index:[String(index)],assessed:[String(assessed.has(index))],...(method?{method:[method]}:{}),
 }}));
 const result={id:'route.comparison',type:schema+'.comparison',attrs:{
  reason:['no-common-interpreter-comparison'],alternative:alternatives.map(row=>'$'+row.id),
  ...(selected===undefined?{}:{selected:[String(selected)]}),
 }};
 return serialize([result,...alternatives]);
}
