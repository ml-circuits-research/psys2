// Interpret declared execution defaults and knowledge-property joins. No domain names or text parsing.
import{World,str,serialize}from'../vendor/sopworld/sopworld.mjs';
import SOURCE from'../../worlds/app.project/execution-policy-source.mjs';
let operational;
export function inspectExecutionPolicyWorld(){return {loaded:!!operational,wires:operational?serialize([...operational.matrix.values(),...operational.wires.values()]):SOURCE,functions:operational?.functions()??[],source:'worlds/app.project/execution-policy.sop'};}
export function executionPolicyWorld(){
 if(!operational){operational=new World({fns:{'clock.now':Date.now}});if(!operational.load(SOURCE).ok)throw Error('invalid-execution-policy');}
 return operational;
}
const scalar=raw=>{if(typeof raw!=='string'||raw.startsWith('$')||raw.startsWith('?'))throw Error('invalid-policy-literal');const value=JSON.parse(raw);if(value!==null&&!['string','number','boolean'].includes(typeof value))throw Error('invalid-policy-literal');return value;};
export function executionValueSource(concept,world=executionPolicyWorld()){
 const rows=world.ofType('app.execution.values').filter(row=>str(row.attrs.concept?.[0])===concept);
 if(rows.length>1)throw Error('ambiguous-policy-value-source');if(!rows.length)return null;
 return Object.fromEntries(['valueType','nameKey','valueKey'].map(key=>[key,str(rows[0].attrs[key][0])]));
}
export function executionDefaults(operation,args,{world=executionPolicyWorld(),now=Date.now}={}){
 const values={},notices=[],evidence=[],seen=new Set();
 for(const row of world.ofType('app.execution.default').filter(row=>str(row.attrs.operation?.[0])===operation)){
  const parameter=str(row.attrs.parameter?.[0]);if(seen.has(parameter))throw Error('duplicate-policy-default');seen.add(parameter);
  if(Object.hasOwn(args,parameter))continue;
  const source=row.attrs.source?.[0],tokens=row.attrs.value;
  if((source!==undefined)===(tokens!==undefined))throw Error('invalid-policy-default-source');
  let value;
  if(source!==undefined){if(str(source)!=='clock.now'||!world.functions().some(fn=>fn.name==='clock.now'&&fn.out.kind==='number'&&!fn.pure))throw Error('undeclared-policy-function');value=now();if(!Number.isFinite(value))throw Error('invalid-clock-value');}
  else{if(tokens.length!==1)throw Error('invalid-policy-default-value');const token=tokens[0];if(token[0]==='$'){const list=world.wires.get(token.slice(1));if(list?.type!=='app.execution.list')throw Error('invalid-policy-list');value=(list.attrs.item??[]).map(scalar);}else value=scalar(token);}
  Object.defineProperty(values,parameter,{value,enumerable:true});if(row.attrs.notice)notices.push(str(row.attrs.notice[0]));evidence.push(row.id);
 }
 return {values,notices,evidence};
}
