// Admit owned default and value-lookup policy facts for the request compiler.
import{World,parse,str,serialize}from'../vendor/sopworld/sopworld.mjs?v=f5d53a8da9';
import SOURCE from'../../worlds/app.project/execution-policy-source.mjs?v=83dffdfb88';
import SCHEMA from'../../worlds/app.project/execution-policy-schema-source.mjs?v=1876a81f20';
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
 const context=new World({fns:{'clock.now':Date.now},library:{[schemaModule]:SCHEMA}});
 const schema=wires.filter(wire=>wire.type==='core.use');
 if(!context.tell(schema).ok)throw Error('invalid-execution-policy-schema');
 const policy=context.fork(),rows=wires.filter(wire=>wire.type!=='core.use');
 if(!policy.tell(rows,{factsOnly:true}).ok)throw Error('invalid-execution-policy');
 const literal=token=>{
  const value=JSON.parse(token);
  if(value!==null&&!['string','boolean'].includes(typeof value)&&!Number.isFinite(value))throw Error('invalid-policy-literal');
 };
 const seen=new Map();
 for(const row of policy.ofType('app.execution.default')){
  const operation=str(row.attrs.operation[0]),parameter=str(row.attrs.parameter[0]);
  if(!seen.has(operation))seen.set(operation,new Set());
  const parameters=seen.get(operation);
  if(parameters.has(parameter))throw Error('duplicate-policy-default');
  parameters.add(parameter);
  const source=row.attrs.source?.[0],values=row.attrs.value;
  if((source!==undefined)===(values!==undefined))throw Error('invalid-policy-default-source');
  if(source!==undefined){
   if(str(source)!=='clock.now'||!policy.functions().some(fn=>fn.name==='clock.now'&&fn.out.kind==='number'&&!fn.pure))throw Error('undeclared-policy-function');
  }else{
   if(values.length!==1)throw Error('invalid-policy-default-value');
   const [token]=values;
   if(token.startsWith('$')){
    const list=policy.get(token.slice(1));
    if(list?.type!=='app.execution.list')throw Error('invalid-policy-list');
    (list.attrs.item??[]).forEach(literal);
   }else literal(token);
  }
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
