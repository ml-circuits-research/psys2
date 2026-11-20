// SPDX-License-Identifier: AGPL-3.0-only
// The deployed binding table completed from the live declarations (specs/semantic-frame.md §5, partial admission).
// The table is exported once with the reader; the authored native interfaces and interpretation policy keep changing.
// Four completions, each by a rule the export itself uses or by a declared row, never by a word or a key name:
//  1. a key the table left unbound for want of a native parameter ("no-native-parameter") binds to the parameter of
//     the same name that its family's source type now declares (the export's own native-parameter rule);
//  2. a property bound to a native parameter with a closed value list takes the reader's class value from that list,
//     the mention being its evidence (classValues, read by the bridge);
//  3. a family the table leaves unresolved reads as the class declared for it (interpretation-policy.sop
//     app.interpret.family), with the provenance of that class's own kind row.
//  4. a family without a native family binding takes the one its own kind rows share (a target named without a kind word).
import {parse,str} from '../vendor/sopworld/sopworld.mjs';
import {interpretationPolicy} from './interpretation-policy.mjs';
import DRAW from '../../worlds/art.draw/native-interface-source.mjs';
import DIAGRAM from '../../worlds/diagram.sketch/native-interface-source.mjs';
import CHARTS from '../../worlds/data.charts/native-interface-source.mjs';
import DOCUMENT from '../../worlds/docs.editor/native-interface-source.mjs';
import CALENDAR from '../../worlds/time.calendar/native-interface-source.mjs';
import AVATAR from '../../worlds/ui.avatar/native-interface-source.mjs';

const INTERFACES=[['art.draw',DRAW],['diagram.sketch',DIAGRAM],['data.charts',CHARTS],['docs.editor',DOCUMENT],['time.calendar',CALENDAR],['ui.avatar',AVATAR]];
const digest=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const one=(row,key)=>row.attrs[key]?.length?str(row.attrs[key][0]):undefined;

let parameters=null;
async function nativeParameters(){
 if(parameters)return parameters;
 const rows=[];
 for(const [world,source] of INTERFACES){
  const wires=parse(source),sha=await digest(source),ops=new Map();
  for(const w of wires)if(w.type==='std.capability.operation')ops.set(w.id,{name:one(w,'name'),on:one(w,'on')});
  for(const w of wires){
   if(w.type!=='std.capability.parameter')continue;
   const op=ops.get(String(w.attrs.operation?.[0]??'').slice(1));if(!op)continue;
   const values=(w.attrs.enum??[]).map(str);
   rows.push({world,sourceSha256:sha,wire:w.id,operation:op.name,sourceType:op.on,parameter:one(w,'name'),enum:one(w,'enumClosed')==='true'&&values.length?values:null});
  }
 }
 return parameters=rows;
}

const completed=new WeakMap();
/** The binding table completed from the live declarations; the same object when nothing is added. Memoized per table. */
export async function completeBindings(bindings){
 if(!bindings||typeof bindings!=='object')return bindings;
 if(completed.has(bindings))return completed.get(bindings);
 const params=await nativeParameters();
 const enumOf=(sourceType,parameter)=>params.find(p=>p.sourceType===sourceType&&p.parameter===parameter&&p.enum)?.enum??null;
 const properties=(bindings.properties??[]).map(row=>{
  const values=row.hostBinding&&!row.classValues?enumOf(row.hostBinding.sourceType,row.hostBinding.parameter):null;
  return values?{...row,classValues:values}:row;
 });
 // 1. Unbound keys whose family's source type now declares a parameter of the key's own name.
 for(const gap of bindings.coverage??[]){
  if(gap.status!=='unbound'||gap.reason!=='no-native-parameter'||typeof gap.key!=='string'||!gap.key.includes('.'))continue;
  if(properties.some(row=>row.area===gap.area&&row.key===gap.key))continue;
  const [type,parameter]=gap.key.split('.');
  const types=new Set((bindings.properties??[]).filter(row=>row.area===gap.area&&row.key.startsWith(type+'.')&&row.hostBinding?.sourceType).map(row=>row.hostBinding.sourceType));
  if(types.size!==1)continue;
  const [sourceType]=types,found=params.filter(p=>p.sourceType===sourceType&&p.parameter===parameter);
  if(!found.length)continue;
  const p=found[0];
  properties.push({area:gap.area,key:gap.key,valueKind:'string',canonical:sourceType+'.'+parameter,sourceWire:p.wire,sourceSnapshotSHA:p.sourceSha256,sourceWorld:p.world,moduleVersion:'1',
   hostBinding:{id:p.operation,sourceType,key:parameter,operation:p.operation,parameter},...(p.enum?{classValues:p.enum}:{}),
   alignment:{kind:'native-parameter-by-name',authority:'declared-bindings.mjs: the export rule over the live native interface'}});
 }
 // 3. Declared family readings.
 const families=[...(bindings.families??[])];
 for(const f of interpretationPolicy().partial.families){
  if(families.some(row=>row.area===f.area&&row.type===f.type))continue;
  const kind=(bindings.kinds??[]).find(row=>row.area===f.area&&row.canonical===f.kind);
  if(!kind)continue;
  families.push({area:f.area,type:f.type,canonical:kind.canonical,sourceWire:kind.sourceWire,sourceWorld:kind.sourceWorld,moduleVersion:kind.moduleVersion,sourceSnapshotSHA:kind.sourceSnapshotSHA,
   alignment:{kind:'explicit-raw-family-identity',authority:'interpretation-policy.sop app.interpret.family'}});
 }
 // 4. A family named without a kind word ("make the flower green", "rename Start") denotes any object of its source
 // type: a family without a native family binding takes the one binding its own kind rows share (the export's family
 // rule, applied to families that also have kind words), so an existing target matches by name or label.
 for(const [index,f] of families.entries()){
  if(f.nativeFamilyBinding)continue;
  const shared=new Map();
  for(const k of bindings.kinds??[])if(k.area===f.area&&k.type===f.type&&k.nativeFamilyBinding?.operation&&k.nativeFamilyBinding.sourceType&&!k.nativeFamilyBinding.arguments)
   shared.set(k.nativeFamilyBinding.sourceType+'\0'+k.nativeFamilyBinding.operation,k.nativeFamilyBinding);
  if(shared.size!==1)continue;
  const [b]=shared.values();
  families[index]={...f,nativeFamilyBinding:{operation:b.operation,sourceType:b.sourceType,exportName:b.exportName,sourcePath:b.sourcePath,sourceSha256:b.sourceSha256,
   boundary:'Family eligibility only (declared-bindings.mjs: the binding its kind rows share).'}};
 }
 const table=Object.freeze({...bindings,properties,families});
 completed.set(bindings,table);
 return table;
}
