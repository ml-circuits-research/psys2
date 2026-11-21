// SPDX-License-Identifier: AGPL-3.0-only
// Transport for the declared raw re-readings (worlds/app.project/raw-reading-policy.sop, specs/semantic-frame.md §5):
// a raw reader proposal and the deployed binding table's rows are told to the policy world as facts; what its rules
// conclude (a target re-read as a joining line's or a container's members, the end a population phrase fills, a
// population reference) is applied here field by field. Nothing here decides: no act, key, kind or word is named.
import {World,serialize,quote,str} from '../vendor/sopworld/sopworld.mjs';
import SCHEMA from '../../worlds/app.project/raw-reading-schema-source.mjs';
import POLICY from '../../worlds/app.project/raw-reading-policy-source.mjs';
import {executionPolicyWorld} from './execution-policy.mjs';
import {identityParameters} from './capability-plan-adapter.mjs';
import {en} from '../lang/en.mjs';
import {referenceProjection} from './reference-projection.mjs';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs';
import {parse} from '../vendor/sopworld/sopworld.mjs';

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
   facts.push(record(`c${index}_${ci}`,'constraint',{request:index,index:ci,key,keyType:key?.split('.')[0],phase:c?.phase,valueSpan:typeof c?.value_span==='string'?c.value_span:undefined}));
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
 // A family's own word said in a request (by its forms), and whether a definite determiner says it just before.
 const definite=new Set(referenceProjection().definite.map(w=>String(w).toLowerCase())),types=new Set((bindings.families??[]).filter(f=>f.area===area).map(f=>f.type));
 for(const [index,request] of raw.requests.entries()){
  const words=wordsOf(request?.span??raw.source?.text);
  for(const type of types){
   const forms=new Set([type,en.plural(type)].map(w=>String(w).toLowerCase()));
   for(const [i,w] of words.entries())if(forms.has(w))facts.push(record(`m${facts.length}`,'mention',{request:index,type,definite:definite.has(words[i-1])?'yes':'no'}));
  }
 }
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
 const restated=world.ofType('app.reading.restated').map(row=>[num(row,'request'),num(row,'index')]);
 if(!retargets.size&&!restated.length)return raw;
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
  // A constraint that names the object takes the naming key of the family re-read (app.reading.renamed).
  for(const renamed of world.ofType('app.reading.renamed').filter(x=>num(x,'request')===index)){const c=r.constraints?.[num(renamed,'index')];if(c)c.key=one(renamed,'key');}
 }
 // A selector that restates the target's name by a key of another family's objects is dropped (app.reading.restated).
 return dropConstraints(out,restated);
}

/** Whether the rules read request `index`'s kind by the singular of its kind phrase (app.reading.bySingular). */
export function readsBySingular(raw,index=0){
 const request=raw?.requests?.[index];
 if(!request)return false;
 const world=policyWorld().fork();
 return world.tell(serialize(requestFacts(0,request)),{factsOnly:true}).ok&&world.ofType('app.reading.bySingular').length>0;
}

// The words of a text, lower-cased.
const wordsOf=text=>[...String(text??'').toLowerCase().matchAll(/[\p{L}]+/gu)].map(m=>m[0]);
// Whether `words` say `text` (every word of it): one of its forms (w.lang.en plural and verb forms), or a word of four
// letters or more with two neighbouring letters swapped ("blod", "italci").
function says(words,text){
 const swapped=w=>{const out=[];for(let i=1;i<w.length;i++)out.push(w.slice(0,i-1)+w[i]+w[i-1]+w.slice(i+1));return out;};
 const heard=new Set(words);for(const w of words)if(w.length>=4)for(const t of swapped(w))heard.add(t);
 return wordsOf(text).every(word=>[word,en.plural(word),...en.verbForms(word)].some(form=>heard.has(String(form).toLowerCase())));
}

/** The declared span rules applied to a raw reading: one value, one role (app.reading.drop) and a value word of another
 * key (app.reading.rekey); the constraints they drop are removed, the ones they re-key take the declared key and value. */
export function declaredSpanRoles(raw,bindings){
 if(!raw||!bindings||!Array.isArray(raw.requests)||!raw.requests.length)return raw;
 const source=String(raw.source?.text??''),scalars=Array.from(source).join('').toLowerCase();
 const words=new Set(wordsOf(scalars));
 const said=word=>[word,en.plural(word),...en.verbForms(word)].some(form=>words.has(String(form).toLowerCase()));
 const concept=key=>(bindings.properties??[]).find(p=>p.area===raw.area&&p.key===key)?.rawDescriptor?.concept;
 const policy=policyWorld(),declaredTexts=[...new Set([...policy.ofType('app.reading.word'),...policy.ofType('app.reading.valueWord')].map(row=>one(row,'text')))];
 const facts=[];
 for(const [index,request] of raw.requests.entries())for(const [ci,c] of (request?.constraints??[]).entries()){
  const range=(raw.ranges??[]).find(x=>x.path?.join('.')===['requests',index,'constraints',ci,'value_span'].join('.'))?.range;
  if(!text(c?.key)||!Array.isArray(range))continue;
  const value=c.value===undefined||c.value===null?undefined:String(c.value);
  facts.push(record(`s${index}_${ci}`,'span',{request:index,index:ci,key:c.key,keyType:c.key.split('.')[0],start:range[0],end:range[1],value}));
  const word=concept(c.key);
  const declared=policy.ofType('app.reading.word').filter(row=>one(row,'key')===c.key).map(row=>one(row,'text'));
  if(text(word)&&String(word).split(/[._\s]+/).filter(Boolean).every(said)||declared.some(said))facts.push(record(`e${index}_${ci}`,'evidence',{request:index,key:c.key}));
  // The declared words (and the constraint's own value) its value span says.
  const spanWords=wordsOf(source.slice(range[0],range[1])||c.value_span);
  for(const t of new Set([...declaredTexts,...(text(value)?[value]:[])]))if(says(spanWords,t))facts.push(record(`w${facts.length}`,'spanSays',{request:index,index:ci,text:t}));
 }
 if(!facts.length)return raw;
 const world=policy.fork();
 if(!world.tell(serialize(facts),{factsOnly:true}).ok)return raw;
 const drops=world.ofType('app.reading.drop').map(row=>[num(row,'request'),num(row,'index')]);
 const rekeys=world.ofType('app.reading.rekey').map(row=>[num(row,'request'),num(row,'index'),one(row,'key'),one(row,'value')]);
 if(!drops.length&&!rekeys.length)return raw;
 const out=structuredClone(raw);
 for(const [index,ci,key,value] of rekeys){
  const c=out.requests[index]?.constraints?.[ci];if(!c||c.__rekeyed)continue;
  Object.assign(c,{key,value,__rekeyed:true});
  out.ranges=(out.ranges??[]).filter(x=>!(String(x.path?.[0])==='requests'&&Number(x.path[1])===index&&x.path[2]==='constraints'&&Number(x.path[3])===ci&&x.path[4]==='value'));
 }
 for(const request of out.requests)for(const c of request?.constraints??[])delete c.__rekeyed;
 return dropConstraints(out,drops);
}

/** The constraints [request, index] removed from a raw reading (in place), the ranges renumbered. */
function dropConstraints(out,drops){
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

// The pronouns of w.lang.en (text, number, what they refer to: thing or any), read once from the language facts.
let pronouns=null;
const pronounRows=()=>pronouns??=parse(LANG_EN_FACTS.pronouns??'').filter(w=>w.type==='w.lang.en.pron').map(w=>{const refers=(w.attrs.refers??[]).map(str);
 return {text:String(str(w.attrs.text?.[0])??'').toLowerCase(),number:w.attrs.number?.length?str(w.attrs.number[0]):undefined,refers:refers.includes('thing')?'thing':refers.includes('any')?'any':refers[0]};}).filter(p=>p.text);
/** Whether a request refers to several things by a plural pronoun (app.reading.plural), and the keys whose said
 * lists are distributed over them (app.reading.distributes). */
export function pluralReference(request){
 const words=new Set(wordsOf(request?.span));
 const facts=pronounRows().filter(p=>words.has(p.text)).map((p,i)=>record(`pron${i}`,'pronoun',{request:0,text:p.text,number:p.number,refers:p.refers}));
 const world=policyWorld().fork();
 const plural=facts.length>0&&world.tell(serialize(facts),{factsOnly:true}).ok&&world.ofType('app.reading.plural').length>0;
 return {plural,distributes:new Set(world.ofType('app.reading.distributes').map(row=>one(row,'key')))};
}

/** The reader heads a code replaces (app.reading.codeHead); a key is an identity key when its parameter (the key's last
 * segment) is one the capability policy seeds from the target's identity (capability-policy.sop target.id / target.list). */
let codeReference=null;
export function codeReferencePolicy(){
 if(codeReference)return codeReference;
 const heads=new Set(policyWorld().ofType('app.reading.codeHead').map(row=>one(row,'key'))),identity=identityParameters();
 return codeReference={identityKey:key=>typeof key==='string'&&identity.has(key.split('.').at(-1)),replacedHead:key=>heads.has(key)};
}

/**
 * The implicit counts the rules conclude for request `index` of a raw reading (raw-reading-policy.sop, implicit counts):
 * `words` the words of its noun phrase before the kind; `amounts` the named amounts of the execution knowledge;
 * `kinds` the area's kind rows; `count` the words of the count the reading gives the new target (null: none).
 * Answers { amount: { name, count, amount, how } | null, kind: canonical | null }.
 */
export function declaredQuantities(raw,{index=0,words=[],amounts=[],kinds=[],count=null}={}){
 const request=raw?.requests?.[index];
 if(!request)return {amount:null,kind:null};
 const facts=requestFacts(0,request),form=facts.find(f=>f.type==='app.reading.form'),singular=form?str(form.attrs.singular[0]):undefined;
 words.forEach((word,i)=>facts.push(record(`qw${i}`,'quantityWord',{request:0,word})));
 amounts.forEach((a,i)=>facts.push(record(`am${i}`,'amount',{name:a.name,typical:a.typical,amount:a.id})));
 if(singular)kinds.filter(k=>k.lemma===singular&&text(k.canonical)).forEach((k,i)=>facts.push(record(`kl${i}`,'kindLemma',{lemma:k.lemma,canonical:k.canonical})));
 if(count){facts.push(record('cs','countSaid',{request:0}));count.forEach((word,i)=>facts.push(record(`cs${i}`,'countSaid',{request:0,word})));}
 const world=policyWorld().fork();
 if(!world.tell(serialize(facts),{factsOnly:true}).ok)return {amount:null,kind:null};
 const a=world.ofType('app.reading.amountCount')[0],k=world.ofType('app.reading.retargetKind')[0];
 return {amount:a?{name:one(a,'name'),count:num(a,'count'),amount:one(a,'amount'),how:one(a,'how')}:null,kind:k?one(k,'canonical'):null};
}

