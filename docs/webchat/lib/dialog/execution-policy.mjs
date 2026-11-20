// Admit owned default and value-lookup policy facts for the request compiler.
import{World,parse,str,serialize}from'../vendor/sopworld/sopworld.mjs?v=ebb9691a80';
import SOURCE from'../../worlds/app.project/execution-policy-source.mjs?v=52313fa4f9';
import SCHEMA from'../../worlds/app.project/execution-policy-schema-source.mjs?v=e5b0fbbd46';
import SCENE_SCHEMA from'../../worlds/app.project/scene-default-schema-source.mjs?v=cde8a3092d';
const schemaModule='app.execution';
const declarations=parse(SOURCE);
const imports=declarations.filter(wire=>wire.type==='core.use');
const facts=declarations.filter(wire=>wire.type!=='core.use');
let operational;
export function inspectExecutionPolicyWorld(){
 return {
  loaded:!!operational,
  wires:operational?serialize([...operational.matrix.values(),...operational.wires.values()]):SOURCE,
  functions:operational?.functions()??[],
  source:'worlds/app.project/execution-policy.sop',
  facts:serialize(facts),
  schema:{module:schemaModule,source:'worlds/app.project/execution-policy-schema.sop',wires:SCHEMA,loaded:!!operational},
  dependencies:imports.map(wire=>str(wire.attrs.world[0])),
 };
}
function admitExecutionPolicy(wires){
 const context=new World({library:{[schemaModule]:SCHEMA,'app.sceneDefault':SCENE_SCHEMA}});
 const schema=wires.filter(wire=>wire.type==='core.use');
 if(!context.tell(serialize(schema)).ok)throw Error('invalid-execution-policy-schema');
 const policy=context.fork(),rows=wires.filter(wire=>wire.type!=='core.use');
 if(!policy.tell(serialize(rows),{factsOnly:true}).ok)throw Error('invalid-execution-policy');
 const seen=new Set();
 for(const row of policy.ofType('std.capability.seed')){
  const key=JSON.stringify([row.attrs.operation[0],row.attrs.parameter[0]]);
  if(seen.has(key))throw Error('duplicate-policy-default');
  seen.add(key);
  if((row.attrs.source[0]==='value')!==Object.hasOwn(row.attrs,'value'))throw Error('invalid-policy-default-source');
 }
 return policy;
}
export function executionPolicyWorld(source=SOURCE){
 return source===SOURCE?(operational??=admitExecutionPolicy(declarations)):admitExecutionPolicy(parse(source));
}
export function executionValueSource(concept,world=executionPolicyWorld()){
 const rows=world.ofType('app.execution.values').filter(row=>str(row.attrs.concept?.[0])===concept);
 if(rows.length>1)throw Error('ambiguous-policy-value-source');if(!rows.length)return null;
 return Object.fromEntries(['valueType','nameKey','valueKey'].map(key=>[key,str(rows[0].attrs[key][0])]));
}
