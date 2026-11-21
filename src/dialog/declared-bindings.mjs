// SPDX-License-Identifier: AGPL-3.0-only
// The deployed binding table completed from the live declarations (specs/semantic-frame.md §5, partial admission).
// The table is exported once with the reader; the authored native interfaces and interpretation policy keep changing.
// The completion rules are the sopworld library's (completeStructuralBindings: parameters by name, closed value lists,
// numbers and units, the binding a family's kind rows share, compound modifiers, closed native values as kinds). This
// module only reads the declarations those rules take, never deciding a binding itself:
//  - the std.capability operations and parameters of every native interface (with each operation's act and the
//    coordinate unit its app.native.metadata declares);
//  - the parameters a key never binds to by name: the identity seeds of capability-policy.sop (source=target.list|
//    target.id) and the coordinate keys of the interfaces' spatial ports (xKey, yKey);
//  - interpretation-policy.sop: app.interpret.family, familyOperation, relation, parameterAct;
//  - execution-policy.sop: app.execution.kindBinding, keyBinding/keyValue, position, canvasUnit, lengthUnit;
//  - the constructor policy's discriminator, the catalog words of catalog values, the ordinal words of k.values.
import {parse,str,completeStructuralBindings} from '../vendor/sopworld/sopworld.mjs';
import {interpretationPolicy} from './interpretation-policy.mjs';
import {executionPolicyWorld} from './execution-policy.mjs';
import {declaredValueRows} from './declared-value-readings.mjs';
import {numberWords,numberInfo} from '../knowledge/values.mjs';
import EXECUTION_POLICY from '../../worlds/app.project/execution-policy-source.mjs';
import CAPABILITY_POLICY from '../../worlds/app.project/capability-policy.mjs';
import DRAW from '../../worlds/art.draw/native-interface-source.mjs';
import DIAGRAM from '../../worlds/diagram.sketch/native-interface-source.mjs';
import CHARTS from '../../worlds/data.charts/native-interface-source.mjs';
import CONSTRUCTORS from '../../worlds/app.project/constructor-policy-source.mjs';
import {BUNDLED_DIAGRAMS} from '../knowledge/bundled-diagrams.mjs';
import DOCUMENT from '../../worlds/docs.editor/native-interface-source.mjs';
import CALENDAR from '../../worlds/time.calendar/native-interface-source.mjs';
import AVATAR from '../../worlds/ui.avatar/native-interface-source.mjs';

const INTERFACES=[['art.draw',DRAW],['diagram.sketch',DIAGRAM],['data.charts',CHARTS],['docs.editor',DOCUMENT],['time.calendar',CALENDAR],['ui.avatar',AVATAR]];
const digest=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const one=(row,key)=>row.attrs[key]?.length?str(row.attrs[key][0]):undefined;
const EXECUTION_PATH='worlds/app.project/execution-policy.sop';
const NUMERIC_KINDS=new Set(['integer','number','quantity']);

let interfaces=null;
/** Every std.capability parameter of the native interfaces, and the coordinate keys of their spatial ports. */
async function nativeInterfaces(){
 if(interfaces)return interfaces;
 const rows=[],coordinates=new Set();
 for(const [world,source] of INTERFACES){
  const wires=parse(source),sha=await digest(source),ops=new Map();
  for(const w of wires)if(w.type==='std.capability.operation')ops.set(w.id,{name:one(w,'name'),on:one(w,'on'),act:one(w,'act')});
  for(const w of wires)if(w.type==='std.capability.arg'&&['xKey','yKey'].includes(one(w,'name'))&&one(w,'value'))coordinates.add(one(w,'value'));
  // The coordinate unit an operation declares (metadata coordinates={dimension, unit, frame}).
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
   rows.push({world,sourceSha256:sha,wire:w.id,operation:op.name,act:op.act,sourceType:op.on,parameter:one(w,'name'),kind:one(w,'kind'),unit:op.unit,enum:one(w,'enumClosed')==='true'&&values.length?values:null});
  }
 }
 // The concepts the interfaces count with: a family's repeat concept (std.capability.repeat: the call made N times)
 // and a concept an interface binds to a numeric parameter (std.capability.property concept on parameter).
 const counted=new Set();
 for(const [,source] of INTERFACES)for(const w of parse(source)){
  if(w.type==='std.capability.repeat'&&one(w,'concept'))counted.add(one(w,'concept'));
  if(w.type==='std.capability.property'&&one(w,'concept')&&rows.some(r=>r.sourceType===one(w,'on')&&r.parameter===one(w,'parameter')&&NUMERIC_KINDS.has(r.kind)))counted.add(one(w,'concept'));
 }
 return interfaces={parameters:rows,coordinates:[...coordinates],counted:[...counted]};
}

// The constructor policy's discriminator of a make operation's kinds (constructor-policy.sop: discriminator="kind").
const constructorDiscriminator=()=>{const row=parse(CONSTRUCTORS).find(w=>w.type==='app.constructor.policy'&&w.attrs.discriminator?.length&&!String(w.attrs.discriminator[0]).startsWith('?'));return row?one(row,'discriminator'):undefined;};
// The catalog's words of its values (core.word text=... means=<value> of=<slot>), for a value its slot lists (core.slot enum=).
function catalogValueWords(){
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
}
// The identity parameters the capability policy seeds with the target itself (std.capability.seed source=target.list|target.id).
const identitySeeds=()=>parse(CAPABILITY_POLICY).filter(w=>w.type==='std.capability.seed'&&['target.list','target.id'].includes(one(w,'source'))).map(w=>one(w,'parameter'));

let declared=null;
async function declarations(){
 if(declared)return declared;
 const {parameters,coordinates}=await nativeInterfaces(),policy=interpretationPolicy().partial,pol=executionPolicyWorld(),all=(r,k)=>(r.attrs[k]??[]).map(str);
 const policySha=await digest(EXECUTION_POLICY);
 const kindOperations=pol.ofType('app.execution.kindBinding').map(row=>({id:row.id,area:one(row,'area'),kind:one(row,'kind'),operation:one(row,'operation'),parameter:one(row,'parameter'),value:one(row,'value'),
  sourceWorld:'app.project',sourcePath:EXECUTION_PATH,sourceSnapshotSHA:policySha,authority:'execution-policy.sop app.execution.kindBinding'}));
 const keyValues=pol.ofType('app.execution.keyValue').map(row=>({area:one(row,'area'),key:one(row,'key'),said:one(row,'said'),value:one(row,'value')}));
 numberInfo('first','ordinal');   // loads k.values before its words are listed
 return declared={
  parameters,unboundParameters:[...identitySeeds(),...coordinates],preferActs:policy.parameterActs??[],
  families:policy.families.map(f=>({...f,authority:'interpretation-policy.sop app.interpret.family'})),
  familyOperations:(policy.familyOperations??[]).map(d=>({...d,sourcePath:'worlds/app.project/interpretation-policy.sop'})),
  kindOperations,
  keyAlignments:pol.ofType('app.execution.keyBinding').map(row=>({area:one(row,'area'),key:one(row,'key'),operation:one(row,'operation'),parameter:one(row,'parameter'),codec:one(row,'codec'),authority:'execution-policy.sop app.execution.keyBinding'}))
   .map(d=>({...d,values:keyValues.filter(v=>v.area===d.area&&v.key===d.key)})),
  relations:(policy.relations??[]).map(r=>({...r,sourceWorld:'app.project',authority:'interpretation-policy.sop app.interpret.relation'})),
  positions:declaredValueRows().positions.map(row=>({...row,sourceWire:'app.execution.position:'+row.key,sourceWorld:'app.project',sourceSnapshotSHA:policySha,authority:'execution-policy.sop app.execution.position'})),
  ordinals:numberWords('ordinal').map(word=>({word,value:numberInfo(word,'ordinal')?.value})),
  discriminator:constructorDiscriminator(),valueWords:catalogValueWords(),
  // Declared length units (app.execution.canvasUnit / lengthUnit) for values said with a unit.
  extra:{lengthUnits:[...pol.ofType('app.execution.canvasUnit').map(r=>({unit:one(r,'unit'),words:all(r,'word'),factor:1})),
   ...pol.ofType('app.execution.lengthUnit').map(r=>({canonical:one(r,'unit'),unit:one(r,'to'),factor:Number(one(r,'factor'))}))]},
 };
}

const completed=new WeakMap();
/** The binding table completed from the live declarations. Memoized per table. */
export async function completeBindings(bindings){
 if(!bindings||typeof bindings!=='object')return bindings;
 if(completed.has(bindings))return completed.get(bindings);
 const completedTable=completeStructuralBindings(bindings,await declarations());
 // A property whose concept the interfaces count with (nativeInterfaces: counted) takes the one number its span spells
 // ("two cats", "a dozen boxes"), like a property bound to a numeric parameter.
 const {counted}=await nativeInterfaces(),countedSet=new Set(counted);
 const table=countedSet.size?{...completedTable,properties:(completedTable.properties??[]).map(row=>countedSet.has(row.canonical)&&row.numeric===undefined&&!row.classValues?{...row,numeric:true}:row)}:completedTable;
 // Frozen: a derived table never changes, so what is derived from it (constructor pairs) is reused for it.
 Object.freeze(table);
 completed.set(bindings,table);
 return table;
}
