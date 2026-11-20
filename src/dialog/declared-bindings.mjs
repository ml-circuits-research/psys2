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
//  4. a family without a native family binding takes the one its own kind rows share, own or declared (a target named
//     without a kind word);
//  5. a key declared aligned with a native parameter of another name (execution-policy.sop app.execution.keyBinding:
//     the reader's chart.grid is the chart group's gridlines) binds to that parameter of the operation's source type,
//     replacing the table's row; its declared said values (app.execution.keyValue) are its class values, each given to
//     the tool as its declared parameter value (valueMap, a lookup the request compiler resolves);
//  6. a kind named by the modifier of its compound lemmas ("a pie" for "pie chart", "pie graph": the compound's last
//     word a lemma of its family's own class) is that kind, when every such compound names the same kind.
import {parse,str} from '../vendor/sopworld/sopworld.mjs';
import {interpretationPolicy} from './interpretation-policy.mjs';
import {executionPolicyWorld} from './execution-policy.mjs';
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
   rows.push({world,sourceSha256:sha,wire:w.id,operation:op.name,sourceType:op.on,parameter:one(w,'name'),kind:one(w,'kind'),enum:one(w,'enumClosed')==='true'&&values.length?values:null});
  }
 }
 return parameters=rows;
}

let kindOperations;
const declaredKindOperations=()=>kindOperations??=executionPolicyWorld().ofType('app.execution.kindBinding').map(row=>({area:one(row,'area'),kind:one(row,'kind'),operation:one(row,'operation'),parameter:one(row,'parameter'),value:one(row,'value')}));

let keyAlignments;
const declaredKeyAlignments=()=>keyAlignments??=(()=>{
 const world=executionPolicyWorld(),values=world.ofType('app.execution.keyValue').map(row=>({area:one(row,'area'),key:one(row,'key'),said:one(row,'said'),value:one(row,'value')}));
 return world.ofType('app.execution.keyBinding').map(row=>({area:one(row,'area'),key:one(row,'key'),operation:one(row,'operation'),parameter:one(row,'parameter'),codec:one(row,'codec')}))
  .map(d=>({...d,values:values.filter(v=>v.area===d.area&&v.key===d.key)}));
})();
// A declared parameter value typed as the parameter takes it (a boolean, a number, else the string itself).
const typed=(kind,value)=>kind==='boolean'?value==='true':['number','integer'].includes(kind)&&Number.isFinite(Number(value))?Number(value):value;

const completed=new WeakMap();
/** The binding table completed from the live declarations; the same object when nothing is added. Memoized per table. */
export async function completeBindings(bindings){
 if(!bindings||typeof bindings!=='object')return bindings;
 if(completed.has(bindings))return completed.get(bindings);
 const params=await nativeParameters();
 const enumOf=(sourceType,parameter)=>params.find(p=>p.sourceType===sourceType&&p.parameter===parameter&&p.enum)?.enum??null;
 // 2b. A property whose native parameter is a number on its source type (kind=number|integer) is numeric: the bridge
 // reads the one number its value span spells ("size 45", "two hundred sixty"; specs/semantic-frame.md §5).
 const numericOf=(sourceType,parameter)=>params.some(p=>p.sourceType===sourceType&&p.parameter===parameter&&['number','integer'].includes(p.kind));
 const properties=(bindings.properties??[]).map(row=>{
  const values=row.hostBinding&&!row.classValues?enumOf(row.hostBinding.sourceType,row.hostBinding.parameter):null;
  const numeric=row.hostBinding&&!values&&!row.classValues&&row.numeric===undefined&&numericOf(row.hostBinding.sourceType,row.hostBinding.parameter);
  return values||numeric?{...row,...(values?{classValues:values}:{}),...(numeric?{numeric:true}:{})}:row;
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
   hostBinding:{id:p.operation,sourceType,key:parameter,operation:p.operation,parameter},...(p.enum?{classValues:p.enum}:{}),...(!p.enum&&numericOf(sourceType,parameter)?{numeric:true}:{}),
   alignment:{kind:'native-parameter-by-name',authority:'declared-bindings.mjs: the export rule over the live native interface'}});
 }
 // 5. Declared key alignments replace the table's row for their key (a retired source type, a parameter of another name).
 for(const d of declaredKeyAlignments()){
  const p=params.find(x=>x.operation===d.operation&&x.parameter===d.parameter);
  if(!p)continue;
  const sourceType=p.sourceType,valueMap=d.values.length?d.values.map(v=>({said:v.said,value:typed(p.kind,v.value)})):null;
  const row={area:d.area,key:d.key,valueKind:'string',canonical:sourceType+'.'+d.parameter,sourceWire:p.wire,sourceSnapshotSHA:p.sourceSha256,sourceWorld:p.world,moduleVersion:'1',
   hostBinding:{id:p.operation,sourceType,key:d.parameter,operation:p.operation,parameter:d.parameter,...(d.codec?{codec:d.codec}:{})},
   ...(valueMap?{classValues:valueMap.map(v=>v.said),valueMap}:p.enum?{classValues:p.enum}:numericOf(sourceType,d.parameter)?{numeric:true}:{}),
   alignment:{kind:'declared-key-parameter',authority:'execution-policy.sop app.execution.keyBinding'}};
  const at=properties.findIndex(r=>r.area===d.area&&r.key===d.key);
  if(at>=0)properties[at]=row;else properties.push(row);
 }
 // 1b. Declared relation pairs (interpretation-policy.sop app.interpret.relation): a relation key and its anchor key take
 // the projection roles of the named like= key (its canonical relation concept), with the declared value names.
 for(const r of interpretationPolicy().partial.relations??[]){
  const like=properties.find(row=>row.key===r.like&&row.projection?.kind==='relation');
  const likeAnchor=like&&properties.find(row=>row.area===like.area&&row.projection?.kind==='relation-anchor');
  if(!like||!likeAnchor)continue;
  const provenance={sourceWire:r.id,sourceWorld:'app.project',moduleVersion:'1',sourceSnapshotSHA:like.sourceSnapshotSHA,
   alignment:{kind:'declared-relation-pair',authority:'interpretation-policy.sop app.interpret.relation'}};
  for(const row of [{key:r.key,canonical:like.canonical,valueKind:like.valueKind,projection:{kind:'relation',values:r.values}},{key:r.anchor,canonical:likeAnchor.canonical,valueKind:likeAnchor.valueKind,projection:{kind:'relation-anchor'}}]){
   const at=properties.findIndex(p=>p.area===r.area&&p.key===row.key);
   const declared={area:r.area,...row,...provenance};
   if(at<0)properties.push(declared);else if(!properties[at].projection)properties[at]=declared;
  }
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
  for(const k of bindings.kinds??[]){
   if(k.area!==f.area||k.type!==f.type)continue;
   // A kind's own binding, or the operation a declared kind binding gives it (execution-policy.sop app.execution.kindBinding),
   // without the arguments that tell its kinds apart: the family takes the operation and its source type only.
   const own=k.nativeFamilyBinding?.operation&&k.nativeFamilyBinding.sourceType?k.nativeFamilyBinding:null;
   const declared=own?null:declaredKindOperations().filter(d=>d.area===k.area&&d.kind===k.canonical);
   const operation=own?.operation??(declared?.length===1?declared[0].operation:undefined);
   const sourceType=own?.sourceType??params.find(p=>p.operation===operation)?.sourceType;
   if(!operation||!sourceType)continue;
   // The family's own class as a kind ("a chart": w.chart.chart, drawn as a bar chart) keeps that kind's arguments.
   const args=k.canonical===f.canonical?(own?.arguments??(declared?.length===1?{[declared[0].parameter]:declared[0].value}:undefined)):undefined;
   if(args){shared.clear();shared.set('own',{...(own??{operation,sourceType,sourcePath:'worlds/app.project/execution-policy.sop'}),arguments:args});break;}
   shared.set(sourceType+'\0'+operation,own??{operation,sourceType,sourcePath:'worlds/app.project/execution-policy.sop'});
  }
  // A declared family with no kind rows of its own (a chart point, read as a diagram node) takes the binding the kind
  // rows of its class share.
  if(!shared.size&&!(bindings.kinds??[]).some(k=>k.area===f.area&&k.type===f.type))
   for(const k of bindings.kinds??[])if(k.area===f.area&&k.canonical===f.canonical&&k.nativeFamilyBinding?.operation&&k.nativeFamilyBinding.sourceType)
    shared.set(k.nativeFamilyBinding.sourceType+'\0'+k.nativeFamilyBinding.operation,k.nativeFamilyBinding);
  if(shared.size!==1)continue;
  const [b]=shared.values();
  const binding={operation:b.operation,sourceType:b.sourceType,exportName:b.exportName,sourcePath:b.sourcePath,sourceSha256:b.sourceSha256,arguments:b.arguments,
   boundary:'Family eligibility only (declared-bindings.mjs: the binding its kind rows share).'};
  families[index]={...f,nativeFamilyBinding:Object.fromEntries(Object.entries(binding).filter(([,value])=>value!==undefined))};
 }
 // 6. Kind modifiers of compound lemmas ("pie" of "pie chart" where "chart" names the family's own class).
 let kinds=bindings.kinds??[];
 const modifiers=new Map();
 for(const f of families){
  const heads=new Set(kinds.filter(k=>k.area===f.area&&k.type===f.type&&k.canonical===f.canonical).map(k=>k.lemma));
  if(!heads.size)continue;
  for(const k of kinds){
   if(k.area!==f.area||k.type!==f.type||k.canonical===f.canonical||typeof k.lemma!=='string')continue;
   const words=k.lemma.split(' ');if(words.length<2||!heads.has(words.at(-1)))continue;
   const lemma=words.slice(0,-1).join(' '),key=f.area+'\0'+f.type+'\0'+lemma;
   if(!modifiers.has(key))modifiers.set(key,{lemma,rows:[]});
   modifiers.get(key).rows.push(k);
  }
 }
 const added=[];
 for(const [key,{lemma,rows}] of modifiers){
  const [area,type]=key.split('\0');
  if(new Set(rows.map(r=>r.canonical)).size!==1||kinds.some(k=>k.area===area&&k.type===type&&k.lemma===lemma))continue;
  added.push({...rows[0],lemma,alignment:{kind:'compound-lemma-modifier',authority:'declared-bindings.mjs completion 6',compound:rows[0].lemma}});
 }
 if(added.length)kinds=[...kinds,...added];
 const table=Object.freeze({...bindings,properties,families,kinds});
 completed.set(bindings,table);
 return table;
}
