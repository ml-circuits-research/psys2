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
// A frozen owned snapshot is copied once at the boundary and then shared read-only:
// readers that only need an owned, unchanging view take it without another deep copy.
const frozenHostData=new WeakMap();
export function freezeHostData(value,{maxNodes=100000,maxBytes=4000000}={}) {
 const out=copyHostData(value,{maxNodes,maxBytes});
 const freeze=(v,depth)=>{if(depth>48)throw new RangeError('host-data-budget');if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const key of Object.keys(v))freeze(v[key],depth+1);Object.freeze(v);}};
 freeze(out,0);if(out&&typeof out==='object')frozenHostData.set(out,{maxNodes,maxBytes});return out;
}
/** Read-only owned view: a frozen snapshot made within the same limits is returned as is; anything else is copied. */
export function snapshotHostData(value,{maxNodes=100000,maxBytes=4000000}={}) {
 const limits=value&&typeof value==='object'?frozenHostData.get(value):undefined;
 return limits&&limits.maxNodes<=maxNodes&&limits.maxBytes<=maxBytes?value:copyHostData(value,{maxNodes,maxBytes});
}
export const validHostId=v=>typeof v==='string'&&v.length>0&&v.length<=4096;
export const nativeToken=value=>typeof value==='string'?JSON.stringify(value):String(value);

const TYPES=new Set(['string','boolean','number','integer','array','object']);
const matchesType=(p,value)=>value===null?p.nullable===true:p.type==='array'?Array.isArray(value):p.type==='object'?!!value&&Object.getPrototypeOf(value)===Object.prototype:p.type==='integer'?Number.isSafeInteger(value):p.type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===p.type;
const matchesBounds=(p,value)=>value===null&&p.nullable===true||(!p.enum||p.enum.includes(value))&&(p.min===undefined||value>=p.min)&&(p.max===undefined||value<=p.max);
export function checkOperation(op){
 if(!op||typeof op!=='object'||Array.isArray(op)||!validHostId(op.id)||!op.params||Object.getPrototypeOf(op.params)!==Object.prototype)throw new TypeError('invalid-tool-declaration');
 for(const key of ['act','on'])if(Object.hasOwn(op,key)&&!validHostId(op[key]))throw new TypeError('invalid-tool-declaration');
 if(Object.hasOwn(op,'requires')&&(!Array.isArray(op.requires)||op.requires.some(value=>!validHostId(value))))throw new TypeError('invalid-tool-declaration');
 for(const [name,p] of Object.entries(op.params)){
  if(!validHostId(name)||!p||Object.getPrototypeOf(p)!==Object.prototype||!TYPES.has(p.type)||Object.keys(p).some(key=>!['type','required','nullable','enum','min','max','default'].includes(key)))throw new TypeError('invalid-parameter-declaration');
  for(const key of ['required','nullable'])if(Object.hasOwn(p,key)&&typeof p[key]!=='boolean')throw new TypeError('invalid-parameter-flag');
  if(Object.hasOwn(p,'enum')&&(!Array.isArray(p.enum)||['array','object'].includes(p.type)||p.enum.some(value=>!matchesType(p,value))))throw new TypeError('invalid-parameter-enum');
  for(const key of ['min','max'])if(Object.hasOwn(p,key)&&(!['number','integer'].includes(p.type)||!Number.isFinite(p[key])||(p.type==='integer'&&!Number.isSafeInteger(p[key]))))throw new TypeError('invalid-parameter-bound');
  if(p.min!==undefined&&p.max!==undefined&&p.min>p.max)throw new TypeError('invalid-parameter-bound');
  if(p.enum&&p.enum.some(value=>!matchesBounds({...p,enum:undefined},value)))throw new TypeError('invalid-parameter-enum');
  if(Object.hasOwn(p,'default')&&(!matchesType(p,p.default)||!matchesBounds(p,p.default)))throw new TypeError('invalid-parameter-default');
 }
}


/** Pure native parameter admission; policies and handlers are never called. */
export function validateNativeArguments(operation,input,{maxBytes=4000000}={}) {
 const fail=reason=>({ok:false,reason,args:null,defaults:[]});
 try {
  const op=copyHostData(operation,{maxBytes}),args=copyHostData(input,{maxBytes});checkOperation(op);
  if(!args||Array.isArray(args)||typeof args!=='object')return fail('invalid-arguments');
  const defaults=[];
  for(const key of Object.keys(args))if(!Object.hasOwn(op.params,key))return fail('unknown-argument');
  for(const [key,p]of Object.entries(op.params)){
   if(!Object.hasOwn(args,key)){if(Object.hasOwn(p,'default')){args[key]=copyHostData(p.default,{maxBytes});defaults.push({parameter:key,value:copyHostData(p.default,{maxBytes}),operation:op.id});}else if(p.required)return fail('missing-argument');else continue;}
   if(!matchesType(p,args[key]))return fail('invalid-argument-type');
   if(!matchesBounds(p,args[key]))return fail('invalid-argument-value');
  }
  return {ok:true,args,defaults,policy:'not-evaluated'};
 }catch{return fail('invalid-native-declaration-or-data');}
}
