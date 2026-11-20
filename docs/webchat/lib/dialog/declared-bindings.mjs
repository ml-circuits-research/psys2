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
//     A family whose class was published after the export (no kind row) reads as the class a declared kind binding
//     makes, takes that binding's operation as its family binding, and its keys left unbound for want of a source type
//     bind to the parameters of their names on that source type (3b, 4b, 4c);
//  7. a family picked by its members' place (execution-policy.sop app.execution.position: "the third bar") gets its
//     position key, bound to the observed place of its source type, with the ordinal words of k.values as its values;
//  6. a kind named by the modifier of its compound lemmas ("a pie" for "pie chart", "pie graph": the compound's last
//     word a lemma of its family's own class) is that kind, when every such compound names the same kind.
//  8. a value of the closed discriminator of a family's make operation (the constructor policy's `kind`, or the parameter
//     a declared kind binding sets: a chart's `layout`) that no kind row names is a kind of that family: named by the
//     value itself and by the catalog words of the catalog value it is (core.word means=<value> of=<a slot listing it>),
//     the declared kind the binding gives it, else the native value itself, drawn by that operation with that value.
import {parse,str} from '../vendor/sopworld/sopworld.mjs?v=4cf6e60057';
import {interpretationPolicy} from './interpretation-policy.mjs?v=95c5ac8e35';
import {executionPolicyWorld} from './execution-policy.mjs?v=fc7a8e4440';
import {declaredValueRows} from './declared-value-readings.mjs?v=205fb4987d';
import {numberWords,numberInfo} from '../knowledge/values.mjs?v=2a29aaa4d2';
import EXECUTION_POLICY from '../../worlds/app.project/execution-policy-source.mjs?v=84cd6c1b73';
import DRAW from '../../worlds/art.draw/native-interface-source.mjs?v=afabeecb4f';
import DIAGRAM from '../../worlds/diagram.sketch/native-interface-source.mjs?v=595d3de650';
import CHARTS from '../../worlds/data.charts/native-interface-source.mjs?v=6c0dc1d746';
import CONSTRUCTORS from '../../worlds/app.project/constructor-policy-source.mjs?v=91bc3b4d74';
import {BUNDLED_DIAGRAMS} from '../knowledge/bundled-diagrams.mjs?v=9d762feed9';
import DOCUMENT from '../../worlds/docs.editor/native-interface-source.mjs?v=e247358200';
import CALENDAR from '../../worlds/time.calendar/native-interface-source.mjs?v=3945d7d8fa';
import AVATAR from '../../worlds/ui.avatar/native-interface-source.mjs?v=488ad9f49d';

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
  // The coordinate unit an operation declares (metadata coordinates={dimension, unit, frame}): its numeric parameters
  // are lengths in that unit.
  const byId=new Map(wires.map(w=>[w.id,w])),deref=v=>typeof v==='string'&&v.startsWith('$')?byId.get(v.slice(1)):null;
  for(const m of wires.filter(w=>w.type==='app.native.metadata')){
   const op=ops.get(String(m.attrs.operation?.[0]??'').slice(1));if(!op)continue;
   for(const f of (m.attrs.field??[]).map(deref).filter(Boolean)){
    if(one(f,'name')!=='coordinates')continue;
    const record=deref(f.attrs.value?.[0]);
    for(const e of (record?.attrs.entry??[]).map(deref).filter(Boolean))if(one(e,'name')==='unit')op.unit=one(e,'value');
   }
  }
  for(const w of wires){
   if(w.type!=='std.capability.parameter')continue;
   const op=ops.get(String(w.attrs.operation?.[0]??'').slice(1));if(!op)continue;
   const values=(w.attrs.enum??[]).map(str);
   rows.push({world,sourceSha256:sha,wire:w.id,operation:op.name,sourceType:op.on,parameter:one(w,'name'),kind:one(w,'kind'),unit:op.unit,enum:one(w,'enumClosed')==='true'&&values.length?values:null});
  }
 }
 return parameters=rows;
}

let kindOperations;
const declaredKindOperations=()=>kindOperations??=executionPolicyWorld().ofType('app.execution.kindBinding').map(row=>({id:row.id,area:one(row,'area'),kind:one(row,'kind'),operation:one(row,'operation'),parameter:one(row,'parameter'),value:one(row,'value')}));

let keyAlignments;
const declaredKeyAlignments=()=>keyAlignments??=(()=>{
 const world=executionPolicyWorld(),values=world.ofType('app.execution.keyValue').map(row=>({area:one(row,'area'),key:one(row,'key'),said:one(row,'said'),value:one(row,'value')}));
 return world.ofType('app.execution.keyBinding').map(row=>({area:one(row,'area'),key:one(row,'key'),operation:one(row,'operation'),parameter:one(row,'parameter'),codec:one(row,'codec')}))
  .map(d=>({...d,values:values.filter(v=>v.area===d.area&&v.key===d.key)}));
})();
// A declared parameter value typed as the parameter takes it (a boolean, a number, else the string itself).
const typed=(kind,value)=>kind==='boolean'?value==='true':['number','integer'].includes(kind)&&Number.isFinite(Number(value))?Number(value):value;

// The constructor policy's discriminator of a make operation's kinds (constructor-policy.sop: discriminator="kind").
let discriminator;
const constructorDiscriminator=()=>discriminator??=(()=>{const row=parse(CONSTRUCTORS).find(w=>w.type==='app.constructor.policy'&&w.attrs.discriminator?.length&&!String(w.attrs.discriminator[0]).startsWith('?'));return row?one(row,'discriminator'):undefined;})();
// The catalog's words of its values (bundled vocabularies: core.word text=... means=<value> of=<slot>), for a value of a
// slot whose declaration lists it (core.slot enum=<value>): value -> words.
let valueWords;
const catalogValueWords=()=>valueWords??=(()=>{
 const slots=new Map(),words=new Map();
 for(const text of Object.values(BUNDLED_DIAGRAMS.schemas??{}))for(const w of parse(text))if(w.type==='core.slot'&&w.attrs.enum?.length)slots.set(w.id,new Set(w.attrs.enum.map(str)));
 for(const text of Object.values(BUNDLED_DIAGRAMS.vocabularies??{}))for(const w of parse(text)){
  if(w.type!=='core.word'||!w.attrs.of?.length||!w.attrs.means?.length)continue;
  const value=one(w,'means'),slot=one(w,'of');
  if(!slots.get(slot)?.has(value))continue;
  if(!words.has(value))words.set(value,new Set());
  for(const t of (w.attrs.text??[]).map(str))words.get(value).add(t.toLowerCase());
 }
 return words;
})();
function nativeValueKinds(kinds,params){
 const own=constructorDiscriminator(),declared=declaredKindOperations(),out=[];
 // Each family's make operations and their discriminators: its rows' own bindings (the constructor's discriminator) and
 // the declared kind bindings of its rows (their parameter).
 const families=new Map();
 for(const k of kinds){
  const key=k.area+'\0'+k.type;if(!families.has(key))families.set(key,{area:k.area,type:k.type,lemmas:new Set(),canonicals:new Set(),ops:new Map()});
  const f=families.get(key);f.lemmas.add(String(k.lemma).toLowerCase());f.canonicals.add(k.canonical);
  if(k.nativeFamilyBinding?.operation&&own)f.ops.set(k.nativeFamilyBinding.operation+'\0'+own,{operation:k.nativeFamilyBinding.operation,parameter:own});
  for(const d of declared)if(d.area===k.area&&d.kind===k.canonical&&d.parameter)f.ops.set(d.operation+'\0'+d.parameter,{operation:d.operation,parameter:d.parameter});
 }
 const words=catalogValueWords();
 for(const f of families.values())for(const {operation,parameter} of f.ops.values()){
  const p=params.find(x=>x.operation===operation&&x.parameter===parameter&&x.enum);
  if(!p)continue;
  for(const value of p.enum){
   const spaced=value.replace(/_/g,' ');
   if(f.lemmas.has(value)||f.lemmas.has(spaced))continue;
   const d=declared.find(x=>x.area===f.area&&x.operation===operation&&x.parameter===parameter&&x.value===value);
   // A value whose declared kind the family already names ("line chart") is that kind's (a modifier is completion 6's).
   if(declared.some(x=>x.area===f.area&&x.operation===operation&&x.parameter===parameter&&x.value===value&&f.canonicals.has(x.kind)))continue;
   const canonical=d?d.kind:p.sourceType+'.'+parameter+'.'+value;
   const base={area:f.area,type:f.type,canonical,sourceWire:d?d.id:p.wire,sourceSnapshotSHA:p.sourceSha256,sourceWorld:d?'app.project':p.world,moduleVersion:'1',
    alignment:{kind:'native-enum-value',authority:'declared-bindings.mjs completion 8',operation,parameter,value},
    ...(d?{}:{nativeFamilyBinding:{operation,sourceType:p.sourceType,arguments:{[parameter]:value},boundary:'Declared native value: the kind is drawn by this operation with this value.'}})};
   for(const lemma of new Set([value,spaced,...(words.get(value)??[])])){
    if(f.lemmas.has(lemma))continue;
    f.lemmas.add(lemma);
    out.push({...base,lemma,rawDescriptor:{area:f.area,type:f.type,kind:lemma}});
   }
  }
 }
 return out;
}

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
 // The length unit of a numeric parameter (its operation's declared coordinate unit), for a value said with a unit.
 const unitOf=(sourceType,parameter)=>params.find(p=>p.sourceType===sourceType&&p.parameter===parameter&&['number','integer'].includes(p.kind)&&p.unit)?.unit;
 const properties=(bindings.properties??[]).map(row=>{
  const values=row.hostBinding&&!row.classValues?enumOf(row.hostBinding.sourceType,row.hostBinding.parameter):null;
  const numeric=row.hostBinding&&!values&&!row.classValues&&row.numeric===undefined&&numericOf(row.hostBinding.sourceType,row.hostBinding.parameter);
  const unit=numeric&&unitOf(row.hostBinding.sourceType,row.hostBinding.parameter);
  return values||numeric?{...row,...(values?{classValues:values}:{}),...(numeric?{numeric:true}:{}),...(unit?{unit}:{})}:row;
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
   // A key the table already pairs keeps its row; the declaration adds relation values it lacks.
   else if(properties[at].projection.kind==='relation'&&row.projection.kind==='relation')
    properties[at]={...properties[at],projection:{...properties[at].projection,values:{...row.projection.values,...properties[at].projection.values}}};
  }
 }
 // 3. Declared family readings.
 const families=[...(bindings.families??[])];
 for(const f of interpretationPolicy().partial.families){
  if(families.some(row=>row.area===f.area&&row.type===f.type))continue;
  const kind=(bindings.kinds??[]).find(row=>row.area===f.area&&row.canonical===f.kind);
  if(kind){families.push({area:f.area,type:f.type,canonical:kind.canonical,sourceWire:kind.sourceWire,sourceWorld:kind.sourceWorld,moduleVersion:kind.moduleVersion,sourceSnapshotSHA:kind.sourceSnapshotSHA,
   alignment:{kind:'explicit-raw-family-identity',authority:'interpretation-policy.sop app.interpret.family'}});continue;}
  // 3b. A class published after the table was exported (no kind row) is read when a kind binding declares the
  // operation that makes it (execution-policy.sop app.execution.kindBinding): that declaration is its provenance.
  const declared=declaredKindOperations().find(d=>d.area===f.area&&d.kind===f.kind);
  if(declared)families.push({area:f.area,type:f.type,canonical:f.kind,sourceWire:declared.id,sourceWorld:'app.project',moduleVersion:'1',sourceSnapshotSHA:await digest(EXECUTION_POLICY),
   alignment:{kind:'explicit-raw-family-identity',authority:'interpretation-policy.sop app.interpret.family; execution-policy.sop app.execution.kindBinding'}});
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
   const args=k.canonical===f.canonical?(own?.arguments??(declared?.length===1&&declared[0].parameter?{[declared[0].parameter]:declared[0].value}:undefined)):undefined;
   if(args){shared.clear();shared.set('own',{...(own??{operation,sourceType,sourcePath:'worlds/app.project/execution-policy.sop'}),arguments:args});break;}
   shared.set(sourceType+'\0'+operation,own??{operation,sourceType,sourcePath:'worlds/app.project/execution-policy.sop'});
  }
  // 4b. A family with no kind rows of its own (a class published after the export) takes the operation its class's
  // declared kind binding names, with that operation's source type.
  if(!shared.size&&!(bindings.kinds??[]).some(k=>k.area===f.area&&k.type===f.type)){
   const declared=declaredKindOperations().filter(d=>d.area===f.area&&d.kind===f.canonical);
   const sourceType=declared.length===1?params.find(p=>p.operation===declared[0].operation)?.sourceType:undefined;
   if(sourceType)shared.set(sourceType+'\0'+declared[0].operation,{operation:declared[0].operation,sourceType,sourcePath:'worlds/app.project/execution-policy.sop'});
  }
  if(shared.size!==1)continue;
  const [b]=shared.values();
  const binding={operation:b.operation,sourceType:b.sourceType,exportName:b.exportName,sourcePath:b.sourcePath,sourceSha256:b.sourceSha256,arguments:b.arguments,
   boundary:'Family eligibility only (declared-bindings.mjs: the binding its kind rows share).'};
  families[index]={...f,nativeFamilyBinding:Object.fromEntries(Object.entries(binding).filter(([,value])=>value!==undefined))};
 }
 // 4c. A key the table left unbound for want of a native source type ("no-native-source-type": series.label before
 // series were published) binds, once its family has a native family binding, to the parameter of the key's own name
 // on that source type (the export's native-parameter rule).
 for(const gap of bindings.coverage??[]){
  if(gap.status!=='unbound'||gap.reason!=='no-native-source-type'||typeof gap.key!=='string'||!gap.key.includes('.'))continue;
  if(properties.some(row=>row.area===gap.area&&row.key===gap.key))continue;
  const [type,parameter]=gap.key.split('.'),family=families.find(f=>f.area===gap.area&&f.type===type&&f.nativeFamilyBinding?.sourceType);
  if(!family)continue;
  const sourceType=family.nativeFamilyBinding.sourceType,p=params.find(x=>x.sourceType===sourceType&&x.parameter===parameter);
  if(!p)continue;
  properties.push({area:gap.area,key:gap.key,valueKind:'string',canonical:sourceType+'.'+parameter,sourceWire:p.wire,sourceSnapshotSHA:p.sourceSha256,sourceWorld:p.world,moduleVersion:'1',
   hostBinding:{id:p.operation,sourceType,key:parameter,operation:p.operation,parameter},...(p.enum?{classValues:p.enum}:{}),...(!p.enum&&numericOf(sourceType,parameter)?{numeric:true}:{}),
   alignment:{kind:'native-parameter-by-name',authority:'declared-bindings.mjs: the export rule over the live native interface and the declared family'}});
 }
 // 7. Declared positions: the key of a member's place, observed on its source type, takes the ordinal numbers.
 const valueNormalizations=[...(bindings.valueNormalizations??[])];
 const policySha=await digest(EXECUTION_POLICY);
 for(const row of declaredValueRows().positions){
  if(properties.some(p=>p.area===row.area&&p.key===row.key&&p.alignment?.kind!=='declared-position'))continue;
  const parameter=row.binding.split('.').at(-1),canonical=row.sourceType+'.'+parameter;
  const provenance={sourceWire:'app.execution.position:'+row.key,sourceSnapshotSHA:policySha,sourceWorld:'app.project',moduleVersion:'1'};
  properties.push({area:row.area,key:row.key,valueKind:'string',canonical,...provenance,numeric:true,
   hostBinding:{id:row.binding,sourceType:row.sourceType,key:parameter,parameter},
   alignment:{kind:'declared-position',authority:'execution-policy.sop app.execution.position'}});
  numberInfo('first','ordinal');   // loads k.values before its words are listed
  for(const word of numberWords('ordinal')){
   const n=numberInfo(word,'ordinal')?.value;if(!Number.isSafeInteger(n)||n<1)continue;
   valueNormalizations.push({area:row.area,key:row.key,canonical,source:word,value:String(n),valueKind:'string',...provenance});
  }
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
 // 8. Kinds for the closed native values of a family's make operation that no kind row names.
 const enumKinds=nativeValueKinds(kinds,params);
 if(enumKinds.length)kinds=[...kinds,...enumKinds];
 // Declared length units (execution-policy.sop app.execution.canvasUnit / lengthUnit) for values said with a unit.
 const pol=executionPolicyWorld(),all=(r,k)=>(r.attrs[k]??[]).map(str);
 const lengthUnits=[...pol.ofType('app.execution.canvasUnit').map(r=>({unit:one(r,'unit'),words:all(r,'word'),factor:1})),
  ...pol.ofType('app.execution.lengthUnit').map(r=>({canonical:one(r,'unit'),unit:one(r,'to'),factor:Number(one(r,'factor'))}))];
 const table=Object.freeze({...bindings,properties,families,kinds,lengthUnits,valueNormalizations});
 completed.set(bindings,table);
 return table;
}
