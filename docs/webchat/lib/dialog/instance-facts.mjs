// SPDX-License-Identifier: AGPL-3.0-only
// Lossless native facts adapter: references require explicit protocol declarations.
import {createBudget} from './budget.mjs?v=00bce6e369';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=fc9d28ffde';
const text=v=>typeof v==='string'&&v.length>0;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function ordered(value,budget=createBudget({perTurn:100000,perSite:100000}),depth=0){
 budget.tick('instance-facts.order');if(depth>48)throw new RangeError('instance-facts-depth');
 return Array.isArray(value)?value.map(v=>ordered(v,budget,depth+1)):record(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k],budget,depth+1)])):value;
}
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const fail=reason=>{throw new TypeError(reason);};
function literal(token){
 if(typeof token!=='string')fail('unsupported-native-value');
 try{return copyHostData(JSON.parse(token));}catch{fail('unsupported-native-value');}
}
/** Complete observations only; neither scalar values nor domain names imply references. */
export function nativeObservationObjects(observation){
 const o=copyHostData(observation);
 if(!o||o.complete!==true||!text(o.instanceId)||!text(o.scope)||!text(o.version)||!Array.isArray(o.objects))fail('incomplete-native-observation');
 const ids=new Set();
 for(const row of o.objects){if(!text(row.id)||!text(row.sourceType)||!text(row.kind)||!text(row.source)||row.version!==o.version||!Array.isArray(row.inputs)||ids.has(row.id))fail('invalid-native-object');ids.add(row.id);}
 return o.objects.map(row=>{
  const attributes={kind:[row.kind]},relations={},inputKeys=new Set();
  for(const input of row.inputs){
   if(!record(input)||!text(input.key)||!text(input.binding)||!Array.isArray(input.values)||input.source!==row.source||input.sourceType!==row.sourceType||input.version!==o.version)fail('unsupported-native-input');
   if(inputKeys.has(input.key))fail('duplicate-native-input');inputKeys.add(input.key);
   const values=input.values.map(literal);
   // The protocol kind is authoritative. Binding declarations are not object state.
   if(input.key!=='kind')attributes[input.key]=values;
  }
  for(const key of Object.keys(row).sort())if(!['id','sourceType','kind','inputs','source','version','relations','in','parent','members'].includes(key)){
   const values=[row[key]];
   if(Object.hasOwn(attributes,key)&&!same(attributes[key],values))fail('conflicting-native-attribute');
   attributes[key]=values;
  }
  if(row.relations!==undefined&&!record(row.relations))fail('invalid-native-relations');
  const refs={...(row.relations??{})};
  for(const key of ['in','parent','members'])if(Object.hasOwn(row,key)&&row[key]!==null){
   const value=Array.isArray(row[key])?row[key]:[row[key]];
   if(Object.hasOwn(refs,key)&&!same(refs[key],value))fail('conflicting-native-relation');refs[key]=value;
  }
  for(const key of Object.keys(refs).sort()){
   if(!text(key)||!Array.isArray(refs[key])||refs[key].some(id=>!text(id)||!ids.has(id)))fail('dangling-native-relation');
   relations[key]=refs[key];delete attributes[key];
  }
  return {id:row.id,type:row.sourceType,attributes:ordered(attributes),relations:ordered(relations)};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
/** Recompute semantic facts, allowing only transient observation identities to vary. */
export function compareInstanceObjects(expectedObjects,observation){
 try{
  if(!Array.isArray(expectedObjects))return {ok:false,reason:'invalid-expected-objects'};
  const expected=copyHostData(expectedObjects).map(object=>{if(record(object.metadata)){delete object.metadata.inputs;if(Object.keys(object.metadata).length===0)delete object.metadata;}return object;}).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
  return same(expected,nativeObservationObjects(observation))?{ok:true}:{ok:false,reason:'instance-facts-mismatch'};
 }catch(error){return {ok:false,reason:error.message};}
}
