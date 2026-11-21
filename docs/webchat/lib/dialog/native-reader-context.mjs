// Actual native observations and an authored projection provide reader context.
import {str} from '../vendor/sopworld/sopworld.mjs?v=935d4d1757';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=646e795567';
import {contextClass,readerContextPolicy} from './reader-context-policy.mjs?v=481ea39c59';
export const REPLAY_CONTEXT_PROFILE='psys2.native-reader-context/1';

/** Caller supplies actual native observation, actual selected area and sent history. */
export function observedReaderContext(area,observation,previous=null,options={}){
 if(typeof area!=='string'||!area||!(previous===null||typeof previous==='string'))throw Error('invalid-native-context-input');
 const o=copyHostData(observation,{maxBytes:1000000});
 if(!o||o.complete!==true||typeof o.scope!=='string'||typeof o.instanceId!=='string'||typeof o.version!=='string'||!Array.isArray(o.objects)||o.objects.length>1000)throw Error('incomplete-native-context');
 const {display}=readerContextPolicy();
 const sources=new Set(),existing=[];
 for(const object of o.objects){
  if(!(typeof object.id==='string'||Number.isSafeInteger(object.id))||typeof object.version!=='string'||typeof object.source!=='string'||sources.has(object.source)||typeof object.sourceType!=='string'||typeof object.kind!=='string'||!Array.isArray(object.inputs))throw Error('invalid-native-context-object');
  sources.add(object.source);
  const binding=display.get(object.sourceType),inputs=binding?object.inputs.filter(input=>input.binding===binding):[];
  if(inputs.length>1||inputs.length===1&&(!Array.isArray(inputs[0].values)||inputs[0].values.length>1))throw Error('ambiguous-native-display-name');
  const name=inputs[0]?.values.length?str(inputs[0].values[0]):null;
  if(name!==null&&typeof name!=='string')throw Error('invalid-native-display-name');
  existing.push({kind:object.kind,...(name!==null?{name}:{})});
 }
 if(!options.compact)return {area,context:{existing,previous}};
 const compact=hierarchicalReaderContext(o,existing,{text:options.text,focus:options.focus??[]});
 options.onSummary?.(compact.summary);
 return {area,context:{existing:compact.existing,previous}};
}

const alphanumeric=char=>char!==undefined&&/[\p{L}\p{N}]/u.test(char);
function exactMentions(text){
 const source=typeof text==='string'?Array.from(text.toLowerCase()):[];
 const known=new Map();
 return value=>{
  if(typeof value!=='string'||!value)return false;
  if(known.has(value))return known.get(value);
  const label=Array.from(value.toLowerCase());
  let found=false;
  for(let at=0;at+label.length<=source.length;at++){
   if(label.every((char,index)=>source[at+index]===char)&&!alphanumeric(source[at-1])&&!alphanumeric(source[at+label.length])){
    found=true;
    break;
   }
  }
  known.set(value,found);
  return found;
 };
}

function observedParents(objects,relations){
 const available=new Set(objects.map(object=>String(object.id))),parented=new Set();
 for(const object of objects){
  const here=String(object.id);
  for(const {path,parent} of relations){
   const value=path.reduce((current,key)=>current?.[key],object);
   if(value===undefined)continue;
   for(const id of Array.isArray(value)?value:[value]){
    const other=String(id);
    if(here!==other&&available.has(other))parented.add(parent?here:other);
   }
  }
 }
 return parented;
}

/** Apply the compiled evidence classes. The full native observation remains authoritative. */
export function hierarchicalReaderContext(observation,existing,{text='',focus=[]}={}){
 const {relations,buckets,reverse,fallback,focus:selection,mention}=readerContextPolicy();
 const objects=observation.objects,owned=observedParents(objects,relations),focused=new Set(focus.map(String));
 const contains=exactMentions(text),groups=Array.from({length:buckets.size},()=>[]);
 for(const [index,object] of objects.entries()){
  let row=existing[index];
  if(!row.name){
   const label=object.inputs?.find(input=>fallback.inputs.has(input.key)&&input.values?.length===1);
   const value=label?str(label.values[0]):object[fallback.field];
   if(typeof value==='string'&&value)row={...row,name:value};
  }
  const id=String(object.id),selected=focused.has(id)||object.inputs?.some(input=>input.key===selection.key&&input.values?.[0]===selection.token);
  const mentioned=mention.row.some(key=>contains(row[key]))||mention.object.some(key=>contains(object[key]));
  const rank=buckets.get(contextClass(mentioned,selected===true,owned.has(id)));
  if(rank!==undefined)groups[rank].push({row,id:object.id});
 }
 const rows=groups.flatMap(group=>reverse?group.reverse():group);
 return {existing:rows.map(value=>value.row),summary:{profile:'hierarchical-native-context/1',observed:objects.length,included:rows.length,
  omittedDescendants:objects.length-rows.length,rankedIds:rows.map(value=>value.id),
  policy:'Declared display roles, exact mentions, observed focus and parent relations; full observation retained.'}};
}
