// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation setup only. No reader annotations, sentence matching or domain defaults.
import {copyHostData} from '../worlds/native-tool-host.mjs';
const own=(value,key)=>Object.hasOwn(value,key);
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const text=value=>typeof value==='string'&&value.length>0;
/** A reviewed mapping names one exact context kind and declared native operations.
 * arguments: {parameter: {from:'name'|'kind'|'field',key?}}; kind uses nativeKind.
 * Setters may additionally use {from:'createdIds'} or {from:'createdId'}.
 * Failed setup is explicit and may be partial; callers must exclude that row. */
export async function seedFunctionalContext({context={},host,kindMappings=[],invocationPrefix='functional-setup'}={}){
 const failures=[],receipts=[],items=[],counters={requested:0,seeded:0,failed:0,calls:0,partialItems:0},reasons={};
 let input,mappings,operations,observation=null;
 const fail=(index,reason,detail={})=>{failures.push({index,reason,...detail});reasons[reason]=(reasons[reason]||0)+1;};
 const result=()=>({ok:failures.length===0,existingComplete:failures.length===0,partial:receipts.some(r=>r.status==='changed')&&failures.length>0,counters:{...counters,failuresByReason:{...reasons}},failures,items,receipts,observation});
 try{input=copyHostData(context);mappings=copyHostData(kindMappings);}catch{fail(null,'invalid-setup-data');return result();}
 if(!plain(input)||!Array.isArray(mappings)||!text(invocationPrefix)||!Array.isArray(input.existing??[])){fail(null,'invalid-setup-data');return result();}
 for(const key of Object.keys(input))if(!['existing','previous'].includes(key))fail(null,'unsupported-context-field',{field:key});
 if(input.previous)fail(null,'previous-context-not-replayed');
 const existing=input.existing??[];counters.requested=existing.length;
 if(!existing.length)return result();
 for(const mapping of mappings)if(mapping.singleton===true&&existing.filter(item=>item?.kind===mapping.kind).length>1){fail(null,'multiple-singleton-context-objects',{kind:mapping.kind});counters.failed=existing.length;return result();}
 if(!host||typeof host.bindings!=='function'||typeof host.invoke!=='function'||typeof host.observe!=='function'){for(let i=0;i<existing.length;i++)fail(i,'missing-native-create-host');counters.failed=existing.length;return result();}
 try{operations=copyHostData(await host.bindings());observation=copyHostData(await host.observe());}catch{fail(null,'native-setup-observation-failed');counters.failed=existing.length;return result();}
 const validObservation=value=>plain(value)&&value.complete===true&&text(value.version)&&Array.isArray(value.objects)&&value.objects.every(o=>plain(o)&&text(o.id)&&text(o.source)&&text(o.sourceType));
 if(!Array.isArray(operations)||!validObservation(observation)){fail(null,'incomplete-native-setup-observation');counters.failed=existing.length;return result();}
 for(const [index,item]of existing.entries()){
  const start=failures.length,callStart=receipts.length;let created=[];
  if(!plain(item)||!text(item.kind)||!text(item.name)){fail(index,'invalid-context-item');counters.failed++;continue;}
  const choices=mappings.filter(row=>row.kind===item.kind);
  if(choices.length!==1){fail(index,choices.length?'ambiguous-kind-mapping':'missing-kind-mapping',{kind:item.kind});counters.failed++;continue;}
  const mapping=choices[0],consumed=new Set(['kind']);
  const prepare=(plan,isMake)=>{
   if(!plain(plan)||!text(plan.operation)||!plain(plan.arguments)){fail(index,'invalid-setup-mapping');return null;}
   const choices=operations.filter(op=>op.id===plan.operation),op=choices[0];
   if(choices.length!==1||!plain(op?.params)||isMake&&op.act!=='make'||!isMake&&op.act!=='change'){fail(index,'undeclared-setup-operation',{operation:plan.operation});return null;}
   const args={},deferred=[];
   for(const [parameter,descriptor]of Object.entries(plan.arguments)){
    if(!own(op.params,parameter)||!plain(descriptor)){fail(index,'undeclared-setup-argument',{operation:op.id,parameter});continue;}
    let value,field;
    if(descriptor.from==='name'){field='name';value=item.name;}
    else if(descriptor.from==='field'&&text(descriptor.key)){field=descriptor.key;value=item[field];}
    else if(descriptor.from==='kind'){field='kind';value=mapping.nativeKind??item.kind;}
    else if(descriptor.from==='contextObject'&&text(descriptor.key)&&text(descriptor.sourceType)){
     field=descriptor.key;const matches=items.filter(previous=>previous.name===item[field]&&previous.native.sourceType===descriptor.sourceType&&observation.objects.some(o=>o.source===previous.native.source));
     if(matches.length!==1){fail(index,'unresolved-context-object',{field,sourceType:descriptor.sourceType});continue;}value=matches[0].native.id;
    }
    else if(own(descriptor,'literal')&&text(mapping.nativeKind)&&descriptor.literal===mapping.nativeKind){field='kind';value=descriptor.literal;}
    else if(!isMake&&['createdIds','createdId'].includes(descriptor.from)){deferred.push([parameter,descriptor.from]);continue;}
    else{fail(index,'unsupported-setup-argument-source',{operation:op.id,parameter});continue;}
    if(!own(item,field)){fail(index,'missing-context-attribute',{field,operation:op.id,parameter});continue;}
    consumed.add(field);args[parameter]=value;
   }
   for(const [parameter,spec]of Object.entries(op.params)){
    if(deferred.some(([key])=>key===parameter))continue;
    if(!own(args,parameter)){if(own(spec,'default'))args[parameter]=spec.default;else if(spec.required)fail(index,'missing-native-argument',{operation:op.id,parameter});continue;}
    const value=args[parameter],valid=value===null?spec.nullable===true:spec.type==='array'?Array.isArray(value):spec.type==='object'?plain(value):spec.type==='integer'?Number.isSafeInteger(value):typeof value===spec.type;
    if(!valid||spec.enum&&!spec.enum.includes(value)||spec.min!==undefined&&value<spec.min||spec.max!==undefined&&value>spec.max)fail(index,'invalid-native-argument',{operation:op.id,parameter});
   }
   return {op,args,deferred};
  };
  const make=prepare(mapping,true),setters=Array.isArray(mapping.setters??[])?(mapping.setters??[]).map(plan=>prepare(plan,false)):[];
  if(!Array.isArray(mapping.setters??[]))fail(index,'invalid-setup-mapping');
  for(const field of Object.keys(item))if(!consumed.has(field))fail(index,'unmapped-context-attribute',{field});
  if(failures.length!==start){counters.failed++;continue;}
  const invoke=async(plan,sequence)=>{
   try{
    counters.calls++;const before=observation,receipt=copyHostData(await host.invoke({invocation:`${invocationPrefix}:${index}:${sequence}`,expectedVersion:before.version,operation:plan.op.id,args:plan.args}));receipts.push(receipt);
    observation=copyHostData(await host.observe());
    if(!validObservation(observation)){fail(index,'incomplete-native-setup-observation');return false;}
    if(!['changed','unchanged'].includes(receipt.status)){fail(index,'native-setup-refused',{operation:plan.op.id,nativeReason:receipt.reason??receipt.code??'unknown'});return false;}
    if(sequence===0){
     const known=new Set(before.objects.map(o=>o.source));created=observation.objects.filter(o=>!known.has(o.source)&&o.sourceType===plan.op.on);
     if(created.length!==1||!Array.isArray(receipt.changed)||!receipt.changed.includes(created[0].id)){fail(index,'uncorrelated-native-create',{operation:plan.op.id,createdCount:created.length});return false;}
    }
    return true;
   }catch{fail(index,'native-setup-call-failed',{operation:plan.op.id});return false;}
  };
  let success=await invoke(make,0);
  if(success)for(const [setterIndex,setter]of setters.entries()){
   for(const [parameter,source]of setter.deferred)setter.args[parameter]=source==='createdIds'?created.map(o=>o.id):created[0].id;
   if(!await invoke(setter,setterIndex+1)){success=false;break;}
  }
  if(success){counters.seeded++;items.push({index,name:item.name,kind:item.kind,mapping:mapping.id??null,native:{id:created[0].id,source:created[0].source,sourceType:created[0].sourceType},calls:receipts.length-callStart});}
  else{counters.failed++;if(receipts.slice(callStart).some(r=>r.status==='changed'))counters.partialItems++;}
 }
 for(const item of items)if(!observation?.objects.some(o=>o.source===item.native.source&&o.id===item.native.id&&o.sourceType===item.native.sourceType))fail(item.index,'seeded-object-no-longer-present');
 return result();
}
