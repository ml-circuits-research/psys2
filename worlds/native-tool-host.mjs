// SPDX-License-Identifier: AGPL-3.0-only
// Native data transaction boundary. No request interpretation or reply claims.
export function copyHostData(value,{maxNodes=100000,maxBytes=4000000}={}) {
 let nodes=0,bytes=0;const stack=new Set();
 const copy=(v,depth)=>{
  if(++nodes>maxNodes||depth>48||bytes>maxBytes)throw new RangeError('host-data-budget');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){bytes+=v.length;if(bytes>maxBytes)throw new RangeError('host-data-budget');return v;}
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(!v||typeof v!=='object'||stack.has(v))throw new TypeError('host-data-not-json');
  const array=Array.isArray(v);if(Object.getPrototypeOf(v)!==(array?Array.prototype:Object.prototype))throw new TypeError('host-data-prototype');
  const keys=Reflect.ownKeys(v),out=array?[]:{};if(array&&keys.length!==v.length+1)throw new TypeError('host-data-sparse-array');
  stack.add(v);
  for(const key of keys){if(array&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('host-data-property');bytes+=key.length;if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=v.length))throw new TypeError('host-data-array-key');Object.defineProperty(out,key,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}
  if(array)for(let i=0;i<v.length;i++)if(!Object.hasOwn(out,i))throw new TypeError('host-data-sparse-array');
  stack.delete(v);return out;
 };return copy(value,0);
}
const text=v=>typeof v==='string'&&v.length>0&&v.length<=4096;
export const nativeToken=value=>typeof value==='string'?JSON.stringify(value):String(value);

const TYPES=new Set(['string','boolean','number','integer','array','object']);
const matchesType=(p,value)=>value===null?p.nullable===true:p.type==='array'?Array.isArray(value):p.type==='object'?!!value&&Object.getPrototypeOf(value)===Object.prototype:p.type==='integer'?Number.isSafeInteger(value):p.type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===p.type;
const matchesBounds=(p,value)=>value===null&&p.nullable===true||(!p.enum||p.enum.includes(value))&&(p.min===undefined||value>=p.min)&&(p.max===undefined||value<=p.max);
function checkOperation(op){
 if(!op||typeof op!=='object'||Array.isArray(op)||!text(op.id)||!op.params||Object.getPrototypeOf(op.params)!==Object.prototype)throw new TypeError('invalid-tool-declaration');
 for(const key of ['act','on'])if(Object.hasOwn(op,key)&&!text(op[key]))throw new TypeError('invalid-tool-declaration');
 if(Object.hasOwn(op,'requires')&&(!Array.isArray(op.requires)||op.requires.some(value=>!text(value))))throw new TypeError('invalid-tool-declaration');
 for(const [name,p] of Object.entries(op.params)){
  if(!text(name)||!p||Object.getPrototypeOf(p)!==Object.prototype||!TYPES.has(p.type)||Object.keys(p).some(key=>!['type','required','nullable','enum','min','max','default'].includes(key)))throw new TypeError('invalid-parameter-declaration');
  for(const key of ['required','nullable'])if(Object.hasOwn(p,key)&&typeof p[key]!=='boolean')throw new TypeError('invalid-parameter-flag');
  if(Object.hasOwn(p,'enum')&&(!Array.isArray(p.enum)||['array','object'].includes(p.type)||p.enum.some(value=>!matchesType(p,value))))throw new TypeError('invalid-parameter-enum');
  for(const key of ['min','max'])if(Object.hasOwn(p,key)&&(!['number','integer'].includes(p.type)||!Number.isFinite(p[key])||(p.type==='integer'&&!Number.isSafeInteger(p[key]))))throw new TypeError('invalid-parameter-bound');
  if(p.min!==undefined&&p.max!==undefined&&p.min>p.max)throw new TypeError('invalid-parameter-bound');
  if(p.enum&&p.enum.some(value=>!matchesBounds({...p,enum:undefined},value)))throw new TypeError('invalid-parameter-enum');
  if(Object.hasOwn(p,'default')&&(!matchesType(p,p.default)||!matchesBounds(p,p.default)))throw new TypeError('invalid-parameter-default');
 }
}

export function createNativeToolHost({state,instanceId,scope,operations,handlers,view,validate=null,maxObjects=10000,maxBytes=4000000}={}) {
 if(validate!==null&&typeof validate!=='function')throw new TypeError('invalid-policy-validator');
 if(!Number.isSafeInteger(maxObjects)||maxObjects<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('invalid-host-budget');
 if(!text(instanceId)||!text(scope)||!state||Object.getPrototypeOf(state)!==Object.prototype)throw new TypeError('host-identity-required');
 const copy=value=>copyHostData(value,{maxBytes});const declared=copy(operations),byId=new Map();
 if(!Array.isArray(declared)||!handlers||typeof handlers!=='object'||typeof view!=='function')throw new TypeError('invalid-tool-declaration');
 for(const op of declared){checkOperation(op);if(!text(op.id)||byId.has(op.id)||!handlers[op.id]||typeof handlers[op.id]!=='function')throw new TypeError('invalid-tool-declaration');byId.set(op.id,op);}
 let fingerprint,revision=0,sequence=0;const live=new Map(),receipts=new Map();
 const snapshot=()=>{
  const data=copy(state),mark=JSON.stringify(data);if(mark.length>maxBytes)throw new RangeError('host-data-budget');
  const records=copy(view(data));if(!Array.isArray(records)||records.length>maxObjects)throw new TypeError('host-population-budget');
  const ids=new Set();for(const row of records){if(!text(row.id)||!text(row.kind)||!text(row.sourceType)||ids.has(row.id)||(row.inputs!==undefined&&!Array.isArray(row.inputs)))throw new TypeError('invalid-host-identity');ids.add(row.id);}
  if(fingerprint!==undefined&&fingerprint!==mark)revision++;fingerprint=mark;
  for(const id of live.keys())if(!ids.has(id))live.delete(id);
  const version=String(revision),objects=records.map(row=>{if(!live.has(row.id))live.set(row.id,++sequence);const source=JSON.stringify([instanceId,scope,row.id,live.get(row.id)]);return {...row,source,version,inputs:(row.inputs||[]).map(input=>({...input,source,sourceType:row.sourceType,version}))};});
  return {instanceId,version,scope,complete:true,objects};
 };
 const invoke=packet=>{
  const refuse=reason=>({status:'refused',reason,verification:'unverified'});let call;
  try{call=copy(packet);}catch{return refuse('invalid-arguments');}
  if(!call||Array.isArray(call)||Object.keys(call).length!==4||!['invocation','expectedVersion','operation','args'].every(k=>Object.hasOwn(call,k))||!text(call.invocation)||!text(call.expectedVersion)||!text(call.operation)||!call.args||Array.isArray(call.args)||typeof call.args!=='object')return refuse('invalid-arguments');
  const payload=JSON.stringify(call),previous=receipts.get(call.invocation);if(previous)return previous.payload===payload?{...copy(previous.receipt),replayed:true}:refuse('invocation-reused');
  if(receipts.size>=10000)return refuse('receipt-budget');const op=byId.get(call.operation);if(!op)return refuse('undeclared-operation');
  const args=call.args;
  for(const key of Object.keys(args))if(!Object.hasOwn(op.params,key))return refuse('unknown-argument');
  for(const [key,p] of Object.entries(op.params)){
   if(!Object.hasOwn(args,key)){if(Object.hasOwn(p,'default'))args[key]=copy(p.default);else if(p.required)return refuse('missing-argument');else continue;}
   const value=args[key];if(!matchesType(p,value))return refuse('invalid-argument-type');
   if(!matchesBounds(p,value))return refuse('invalid-argument-value');
  }
  let before,staged,result,validation=null,effects=[];
  try{before=snapshot();if(before.version!==call.expectedVersion)return refuse('stale-observation');staged=copy(state);result=handlers[call.operation]({state:staged,request:(name,args)=>effects.push({name,args}),effect:(name,args)=>effects.push({name,args})},args,call.invocation);if(!result||result.status!=='supported')return refuse(result?.code||result?.reason||'native-refusal');copy(staged);if(validate){validation=copy(validate(copy(staged)));if(typeof validation?.ok!=='boolean')return refuse('invalid-policy-result');if(!validation.ok)return {...refuse(validation.code||'policy-denied'),validation};}if(JSON.stringify(staged).length>maxBytes)return refuse('host-data-budget');const projected=view(copy(staged));if(!Array.isArray(projected)||projected.length>maxObjects)return refuse('host-population-budget');const ids=new Set();for(const row of projected){if(!text(row.id)||!text(row.kind)||!text(row.sourceType)||ids.has(row.id)||(row.inputs!==undefined&&!Array.isArray(row.inputs)))return refuse('invalid-host-identity');ids.add(row.id);}copy(projected);copy(effects);copy(result.changed||[]);copy(result.data??null);}
  catch{return refuse('native-error');}
  const changed=JSON.stringify(staged)!==fingerprint;
  if(changed){
   for(const key of Reflect.ownKeys(state)){const d=Object.getOwnPropertyDescriptor(state,key);if(!Object.hasOwn(staged,key)?!d.configurable:!d.writable)return refuse('immutable-state');}
   if(!Object.isExtensible(state)&&Object.keys(staged).some(k=>!Object.hasOwn(state,k)))return refuse('immutable-state');
   for(const key of Object.keys(state))if(!Object.hasOwn(staged,key))delete state[key];
   for(const [key,value] of Object.entries(staged)){const d=Object.getOwnPropertyDescriptor(state,key);Object.defineProperty(state,key,{value,enumerable:true,writable:true,configurable:d?d.configurable:true});}
  }
  const after=snapshot(),receipt={status:changed?'changed':'unchanged',verification:'unverified',invocation:call.invocation,operation:call.operation,instanceId,beforeVersion:before.version,afterVersion:after.version,before,after,validation,changed:copy(result.changed||[]),effects:copy(effects),data:copy(result.data??null)};
  receipts.set(call.invocation,{payload,receipt});return copy(receipt);
 };
 snapshot();return Object.freeze({observe:()=>copy(snapshot()),invoke,bindings:()=>copy(declared)});
}
