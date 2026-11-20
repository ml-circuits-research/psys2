// SPDX-License-Identifier: AGPL-3.0-only
// Transport for the declared raw re-readings (worlds/app.project/raw-reading-policy.sop, specs/semantic-frame.md §5):
// a raw reader proposal and the deployed binding table's rows are told to the policy world as facts; what its rules
// conclude (a target re-read as a joining line's or a container's members, the end a population phrase fills, a
// population reference) is applied here field by field. Nothing here decides: no act, key, kind or word is named.
import {World,serialize,quote,str} from '../vendor/sopworld/sopworld.mjs';
import SCHEMA from '../../worlds/app.project/raw-reading-schema-source.mjs';
import POLICY from '../../worlds/app.project/raw-reading-policy-source.mjs';
import {executionPolicyWorld} from './execution-policy.mjs';
import {en} from '../lang/en.mjs';

let base=null;
function policyWorld(){
 if(base)return base;
 const world=new World({library:{'app.reading':SCHEMA}});
 const told=world.tell(POLICY);
 if(!told.ok)throw Error('invalid-raw-reading-policy: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 return base=world;
}
export const inspectRawReadingPolicy=()=>({source:'worlds/app.project/raw-reading-policy.sop',schema:SCHEMA,wires:POLICY,loaded:!!base});

const text=v=>typeof v==='string'&&v.length>0;
function record(id,type,values){
 const attrs={};
 for(const [key,value] of Object.entries(values))if(Number.isSafeInteger(value))attrs[key]=[String(value)];else if(text(value))attrs[key]=[quote(value)];
 return {id,type:'app.reading.'+type,attrs};
}
const one=(row,key)=>row.attrs[key]?.length?str(row.attrs[key][0]):undefined;
const num=(row,key)=>Number(one(row,key));

function requestFacts(index,request){
 const facts=[record(`r${index}`,'request',{request:index,act:request?.act})];
 const t=request?.target;
 if(t&&typeof t==='object')facts.push(record(`t${index}`,'target',{request:index,type:t.type,mode:t.mode,fill:t.fill,quantifier:t.quantifier,kind:t.kind,
  kindSpan:t.kind_span,descriptionSpan:t.description_span,nameSpan:t.name_span?String(t.name_span):undefined,determiner:t.determiner}));
 // The kind phrase's singular (w.lang.en morphology of its last word), for the number-agreement rules.
 if(text(t?.kind_span)){const words=t.kind_span.split(/\s+/),head=words.at(-1).toLowerCase(),singular=en.singular(head,'lemma');if(text(singular))facts.push(record(`form${index}`,'form',{text:t.kind_span,singular:[...words.slice(0,-1),singular].join(' ')}));}
 return facts;
}

/** The reading's facts with the area's binding rows and the execution policy's act forms and line patterns. */
function readingFacts(raw,bindings){
 const area=raw.area,facts=[],keys=new Set(),concepts=new Set();
 for(const [index,request] of raw.requests.entries()){
  facts.push(...requestFacts(index,request));
  for(const [ci,c] of (request?.constraints??[]).entries()){
   // The binding table's key is <type>.<parameter>: the type it belongs to is its first segment.
   const key=typeof c?.key==='string'?c.key:undefined;if(key)keys.add(key);
   facts.push(record(`c${index}_${ci}`,'constraint',{request:index,index:ci,key,keyType:key?.split('.')[0]}));
  }
 }
 const pol=executionPolicyWorld();
 for(const row of pol.ofType('app.execution.actForm'))for(const of of (row.attrs.of??[]).map(str))
  facts.push(record(`form.${facts.length}`,'actForm',{act:one(row,'act'),as:one(row,'as'),of}));
 for(const row of pol.ofType('app.execution.linkPattern')){
  facts.push(record(`pattern.${facts.length}`,'linkPattern',{pattern:row.id,from:one(row,'from'),to:one(row,'to'),patternConcept:one(row,'patternConcept')}));
  for(const k of ['from','to','patternConcept'])if(one(row,k))concepts.add(one(row,k));
 }
 const props=(bindings.properties??[]).filter(p=>p.area===area),told=new Set();
 const tellProperty=p=>{if(!p||told.has(p))return;told.add(p);facts.push(record(`p${facts.length}`,'property',{key:p.key,canonical:p.canonical,host:p.hostBinding?.sourceType}));};
 for(const key of keys)tellProperty(props.find(p=>p.key===key));
 for(const concept of concepts)tellProperty(props.find(p=>p.canonical===concept));
 for(const f of bindings.families??[])if(f.area===area)facts.push(record(`f${facts.length}`,'family',{type:f.type,canonical:f.canonical,sourceType:f.nativeFamilyBinding?.sourceType}));
 for(const c of bindings.containment??[])if(c.area===area)facts.push(record(`k${facts.length}`,'containment',{type:c.type,container:c.containerType}));
 return facts;
}

// The first retarget the rules conclude for each request of a raw reading.
function concludedRetargets(raw,bindings){
 const world=policyWorld().fork(),retargets=new Map();
 if(!world.tell(serialize(readingFacts(raw,bindings)),{factsOnly:true}).ok)return {world,retargets};
 for(const row of world.ofType('app.reading.retarget')){const r=num(row,'request');if(!retargets.has(r))retargets.set(r,row);}
 return {world,retargets};
}
/** Which declared re-reading (population | container) the rules conclude for one request of a raw reading, or null. */
export function retargetRule(raw,bindings,index=0){
 if(!raw||!bindings||!Array.isArray(raw.requests)||!raw.requests[index])return null;
 const row=concludedRetargets(raw,bindings).retargets.get(index);
 return row?one(row,'rule'):null;
}
/** The declared re-readings (a population joined by lines, a container's property) applied to a raw reading. */
export function declaredRetargets(raw,bindings){
 if(!raw||!bindings||!Array.isArray(raw.requests)||!raw.requests.length)return raw;
 const {world,retargets}=concludedRetargets(raw,bindings);
 if(!retargets.size)return raw;
 const ends=world.ofType('app.reading.addEnd');
 const out=structuredClone(raw);
 for(const [index,row] of retargets){
  const r=out.requests[index],old=raw.requests[index].target,at=String(index);
  const end=ends.find(e=>num(e,'request')===index);
  const span=end?(raw.ranges??[]).find(x=>JSON.stringify(x.path)===JSON.stringify(['requests',at,'target',one(end,'from')])):null;
  if(end){
   const ci=r.constraints?.length??0,phrase=old[one(end,'from')];
   r.constraints=[...(r.constraints??[]),{key:one(end,'key'),value:phrase,value_span:phrase,operator:one(end,'operator'),phase:one(end,'phase'),polarity:one(end,'polarity'),character:one(end,'character')}];
   out.ranges=(out.ranges??[]).filter(x=>!(x.path[0]==='requests'&&x.path[1]===at&&x.path[2]==='target'));
   if(span)for(const field of ['value','value_span'])out.ranges.push({path:['requests',at,'constraints',String(ci),field],range:[...span.range]});
  }else out.ranges=(out.ranges??[]).filter(x=>!(x.path[0]==='requests'&&x.path[1]===at&&x.path[2]==='target'));
  r.target={type:one(row,'type'),mode:one(row,'mode'),determiner:one(row,'determiner'),...(one(row,'fill')?{fill:one(row,'fill')}:{})};
 }
 return out;
}

/** Whether the rules read request `index`'s kind by the singular of its kind phrase (app.reading.bySingular). */
export function readsBySingular(raw,index=0){
 const request=raw?.requests?.[index];
 if(!request)return false;
 const world=policyWorld().fork();
 return world.tell(serialize(requestFacts(0,request)),{factsOnly:true}).ok&&world.ofType('app.reading.bySingular').length>0;
}

/** The declared one-value-one-role rule (app.reading.drop) applied to a raw reading: the constraints it drops are removed. */
export function declaredSpanRoles(raw,bindings){
 if(!raw||!bindings||!Array.isArray(raw.requests)||!raw.requests.length)return raw;
 const source=String(raw.source?.text??''),scalars=Array.from(source).join('').toLowerCase();
 const words=new Set([...scalars.matchAll(/[\p{L}]+/gu)].map(m=>m[0]));
 const said=word=>[word,en.plural(word),...en.verbForms(word)].some(form=>words.has(String(form).toLowerCase()));
 const concept=key=>(bindings.properties??[]).find(p=>p.area===raw.area&&p.key===key)?.rawDescriptor?.concept;
 const facts=[];
 for(const [index,request] of raw.requests.entries())for(const [ci,c] of (request?.constraints??[]).entries()){
  const range=(raw.ranges??[]).find(x=>x.path?.join('.')===['requests',index,'constraints',ci,'value_span'].join('.'))?.range;
  if(!text(c?.key)||!Array.isArray(range))continue;
  facts.push(record(`s${index}_${ci}`,'span',{request:index,index:ci,key:c.key,start:range[0],end:range[1]}));
  const word=concept(c.key);
  if(text(word)&&String(word).split(/[._\s]+/).filter(Boolean).every(said))facts.push(record(`e${index}_${ci}`,'evidence',{request:index,key:c.key}));
 }
 if(facts.length<2)return raw;
 const world=policyWorld().fork();
 if(!world.tell(serialize(facts),{factsOnly:true}).ok)return raw;
 const drops=world.ofType('app.reading.drop').map(row=>[num(row,'request'),num(row,'index')]);
 if(!drops.length)return raw;
 const out=structuredClone(raw);
 for(const [index,request] of out.requests.entries()){
  const gone=new Set(drops.filter(([r])=>r===index).map(([,ci])=>ci));
  if(!gone.size)continue;
  const keep=(request.constraints??[]).map((c,ci)=>[c,ci]).filter(([,ci])=>!gone.has(ci)),renumber=new Map(keep.map(([,ci],n)=>[ci,n]));
  request.constraints=keep.map(([c])=>c);
  out.ranges=(out.ranges??[]).flatMap(x=>{
   if(String(x.path?.[0])!=='requests'||Number(x.path[1])!==index||x.path[2]!=='constraints')return [x];
   const ci=Number(x.path[3]);if(gone.has(ci))return [];
   const path=[...x.path];path[3]=typeof x.path[3]==='string'?String(renumber.get(ci)):renumber.get(ci);return [{...x,path}];
  });
 }
 return out;
}

const populations=new Map();
/** Whether a request's target is a population reference (app.reading.population); one answer per target shape. */
export function populationReference(request){
 const t=request?.target,key=JSON.stringify([request?.act,t?.mode,t?.fill,t?.quantifier]);
 if(populations.has(key))return populations.get(key);
 const world=policyWorld().fork(),probe={act:request?.act,target:{mode:t?.mode,fill:t?.fill,quantifier:t?.quantifier}};
 const answer=world.tell(serialize(requestFacts(0,probe)),{factsOnly:true}).ok&&world.ofType('app.reading.population').length>0;
 if(populations.size<256)populations.set(key,answer);
 return answer;
}
