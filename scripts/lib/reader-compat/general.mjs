import { createEnglishFrameBinder } from './frames.mjs';
import { ENGLISH_OVERLAY_TYPES, ENGLISH_READER_FACTS } from './overlay.mjs';

export const ENGLISH_PHRASE_FACTS = {...ENGLISH_READER_FACTS,'w.reader.en':[], 'w.reader.en.phrases':Object.values(ENGLISH_OVERLAY_TYPES)};
const get=(...path)=>({$get:['node','value',...path]});
const token=(kind,value)=>({kind,value});
const atom=value=>token('literal',value),string=value=>token('string',value),ref=value=>token('ref',value);

/** Consumer graph policy: source-validated frames plus explicit semantic mappings.
 * No inference from verb text or act names. The standard graph bridge remains the
 * authority for coverage, lexical origins, scalar spans and request validation. */
export function createGeneralEnglishReader(api){
 const retained=new WeakMap();
 const compile=({phraseWorld,frameWorld,mappings},{budget=400000,maxProfiles=1024}={})=>{
  let steps=0;const fail=reason=>{throw {reader:true,reason};},tick=()=>{if(++steps>budget)fail('budget');};
  try{
   if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(maxProfiles)||maxProfiles<1)fail('invalid-budget');
   const copied=api.projectTemplates([{template:'copy',context:{value:mappings}}],{templates:{copy:{$get:['value']}},budget});
   if(copied.truncated||copied.failures.length)fail('invalid-mappings');const declarations=copied.candidates[0]?.value;if(!Array.isArray(declarations))fail('invalid-mappings');
   const binder=createEnglishFrameBinder(api),frames=binder.compile(frameWorld,{budget});if(!frames.ok)fail('invalid-frame-contracts');
   const grammar=api.compileGrammarOverlay(phraseWorld,{types:ENGLISH_OVERLAY_TYPES,budget});if(!grammar.ok)fail('invalid-phrase-contracts');
   const one=(w,k)=>{tick();const v=w?.attrs[k];if(!v||v.length!==1)fail('missing-source-field');return api.valueText(v[0]);};
   const roleRows=[...frameWorld.wires.values()].filter(w=>w.type==='w.reader.en.frames.role');
   const nodes=new Map([...frameWorld.wires.values()].filter(w=>w.type==='w.reader.en.node').map(w=>[one(w,'name'),w]));
   const pathFor=role=>{const name=one(role,'path_root');if(!nodes.has(name))fail('missing-source-path');return [...frameWorld.wires.values()].filter(w=>w.type==='w.reader.en.step'&&one(w,'of')===name).sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at'))).map(w=>w.attrs.key?one(w,'key'):Number(one(w,'index')));};
   const rules={},guards={},mapped=new Set(),mappingSources=[];
   const shape=(v,keys)=>{tick();if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('invalid-mapping-shape');};
   for(const mapping of declarations){
    tick();shape(mapping,['licence','components','source','metadata','relations']);if(typeof mapping.source!=='string'||!mapping.source)fail('missing-mapping-source');if(mapped.has(mapping.licence))fail('duplicate-licence-mapping');
    const licence=frames.licences.find(l=>l.name===mapping.licence);if(!licence)fail('unlicensed-mapping');mapped.add(mapping.licence);mappingSources.push(mapping.source);
    const roles=roleRows.filter(r=>one(r,'licence')===mapping.licence),byRole=new Map(roles.map(r=>[one(r,'frame_role'),r]));
    const rolePath=name=>{const row=byRole.get(name);if(!row)fail('unknown-frame-role');const path=pathFor(row);if(path.some(k=>typeof k!=='string'||!k||['__proto__','constructor','prototype'].includes(k)))fail('unsupported-role-path');return ['context',...path];};
    // Source joins were validated by binder.compile; frame act is authoritative.
    const licenceWire=frameWorld.get(licence.id),frameName=one(licenceWire,'frame_name');
    const frame=[...frameWorld.wires.values()].find(w=>w.type==='w.lang.en.frame'&&one(w,'name')===frameName);const act=one(frame,'act');
    if(!Array.isArray(mapping.components)||!mapping.components.length)fail('empty-mapping');
    const targets=mapping.components.filter(c=>c.kind==='target'),used=new Set(),ids=new Set(['r','source']);
    for(const component of mapping.components){tick();if(!component||typeof component.id!=='string'||!component.id||ids.has(component.id))fail('duplicate-node-id');ids.add(component.id);}
    const variants=3**targets.length*2**targets.length;if(!Number.isSafeInteger(variants)||variants>maxProfiles||Object.keys(rules).length+variants>maxProfiles)fail('profile-budget');
    // Each NP has three determiner states and two qualifier states. These are
    // semantic data alternatives, not lexical/sentence dispatch.
    for(let variant=0;variant<variants;variant++){
     tick();let choice=variant;const ns=[{id:'source',type:'std.request.source',attrs:{text:[string({$get:['node','source','text']})]}},{id:'r',type:'std.request',attrs:{act:[atom(act)],mood:[atom(get('mood'))],source:[ref('source')]}}],anchors=[],gs=[{left:get('verb'),right:licence.verb},{left:get('valency'),right:licence.valency}],targetIds=new Map();
     const semanticContext={};
     const setPath=(path,value)=>{let at=semanticContext;for(let i=0;i<path.length-1;i++){if(!Object.hasOwn(at,path[i]))at[path[i]]={};at=at[path[i]];}at[path.at(-1)]=value;};
     for(const role of roles){const path=pathFor(role);setPath(path,get('context',...path));}
     for(const path of mapping.metadata){if(!Array.isArray(path)||!path.length||path.some(k=>typeof k!=='string'||!k||['__proto__','constructor','prototype'].includes(k)))fail('invalid-metadata-path');setPath(path,get('context',...path));}
     gs.push({left:get(),right:{verb:licence.verb,valency:licence.valency,mood:get('mood'),context:semanticContext,provenance:{ranges:get('provenance','ranges'),verb:get('provenance','verb')}}});
     const predicate=(id,path,target,character)=>{const p=Object.fromEntries(['concept','operator','value','character','polarity','evidence','origin'].map(k=>[k,get(...path,k)]));gs.push({left:get(...path),right:p});if(character)gs.push({left:p.character,right:'requirement'});ns.push({id,type:'std.request.constraint',attrs:{request:[ref('r')],target:[ref(target)],concept:[atom(p.concept)],operator:[atom(p.operator)],value:[string(p.value)],character:[atom(character||p.character)],polarity:[atom(p.polarity)]}});anchors.push({id,source:'source',ranges:p.evidence});};
     for(const target of targets){
      shape(target,['kind','id','role']);used.add(target.role);const path=rolePath(target.role),row=byRole.get(target.role),mode=one(row,'target_mode');if(!['new','existing'].includes(mode))fail('unresolved-target-mode');
      const determiner=[null,'definite','indefinite'][choice%3];choice=Math.floor(choice/3);const qualified=choice%2===1;choice=Math.floor(choice/2);
      const qualifier=qualified?Object.fromEntries(['concept','operator','value','character','polarity','evidence','origin'].map(k=>[k,get(...path,'qualifier',k)])):null;
      const expected={kind:get(...path,'kind'),origin:get(...path,'origin'),evidence:get(...path,'evidence'),qualifier,determiner};gs.push({left:get(...path),right:expected});
      const attrs={request:[ref('r')],mode:[atom(mode)],kind:[atom(expected.kind)],...(determiner?{determiner:[atom(determiner)]}:{})};
      if(qualified){const id=target.id+'.qualifier';if(ids.has(id))fail('duplicate-node-id');predicate(id,[...path,'qualifier'],target.id,mode==='existing'?'assumption':null);if(mode==='existing')attrs.selector=[ref(id)];}
      ns.push({id:target.id,type:'std.request.target',attrs});anchors.push({id:target.id,source:'source',ranges:expected.evidence});targetIds.set(target.role,target.id);
     }
     for(const component of mapping.components){
      if(component.kind==='target')continue;tick();const target=targetIds.get(component.target);if(!target)fail('missing-mapping-target');
      if(component.kind==='predicate'){shape(component,['kind','id','role','target']);used.add(component.role);predicate(component.id,rolePath(component.role),target,null);}
      else if(component.kind==='relation'){
       shape(component,['kind','id','role','target','goal','concept','character','polarity']);used.add(component.role);const path=rolePath(component.role),goal=targetIds.get(component.goal);if(!goal)fail('missing-relation-goal');
       if(!mapping.relations.length||mapping.relations.some(v=>!v||typeof v.value!=='string'||typeof v.source!=='string'))fail('missing-relation-admission');
       const marker=Object.fromEntries(['marker','relation','evidence','origin'].map(k=>[k,get(...path,k)]));gs.push({left:get(...path),right:marker});
       ns.push({id:component.id,type:'std.request.constraint',attrs:{request:[ref('r')],target:[ref(target)],concept:[atom(component.concept)],operator:[atom('relation')],relation:[atom(marker.relation)],goal:[ref(goal)],character:[atom(component.character)],polarity:[atom(component.polarity)]}});anchors.push({id:component.id,source:'source',ranges:marker.evidence});
      }else fail('unsupported-mapping-component');
     }
     const key=mapping.licence+'.'+variant;rules[key]={request:'r',source:'source',nodes:ns,evidence:{command:get('provenance','ranges'),nodes:anchors}};guards[key]=gs;
    }
    if(roles.some(r=>!used.has(one(r,'frame_role'))))fail('unmapped-frame-role');
   }
   if(!Object.keys(rules).length)fail('no-graph-mappings');
   const result={ok:true,licences:[...mapped],unresolved:frames.licences.filter(l=>!mapped.has(l.name)).map(l=>({licence:l.name,reason:'missing-request-mapping'})),mappingSources};
   retained.set(result,{phraseWorld,frameWorld,phraseStamp:phraseWorld.stamp,frameStamp:frameWorld.stamp,grammar,binder,frames,declarations,profile:{rules,guards}});return result;
  }catch(error){return {ok:false,issues:[{reason:error?.reader?error.reason:'invalid-reader-data'}]};}
 };
 const read=(compiled,text,options={})=>{
  const refused=(reason,detail)=>({candidates:[],failures:[{reason,...(detail?{detail}:{})}],coverage:{complete:false}});
  if(Object.keys(options).some(k=>!['max','budget','sourceBudget','compositionBudget','bridgeBudget'].includes(k)))return refused('unsupported-reader-option');
  const s=retained.get(compiled);if(!s||s.phraseWorld.stamp!==s.phraseStamp||s.frameWorld.stamp!==s.frameStamp)return refused('stale-or-foreign-reader');
  const limits={max:32,budget:20000,sourceBudget:20000,compositionBudget:200000,bridgeBudget:200000,...options};
  if(typeof text!=='string'||Object.values(limits).some(n=>!Number.isSafeInteger(n)||n<1)||text.length>limits.bridgeBudget)return refused('invalid-input');
  const parsed=api.parseText(s.phraseWorld,text,{...s.grammar.grammar,start:'Message',max:limits.max,budget:limits.budget,sourceSpans:true,sourceBudget:limits.sourceBudget,reportLimits:true});
  if(parsed.truncated||parsed.limits.pruned)return refused('parse-incomplete');
  if(parsed.source.status!=='exact')return refused('source-unavailable');
  const composed=api.composeParses(parsed,{...s.grammar.composition,budget:limits.compositionBudget});
  if(composed.truncated||composed.failures.some(f=>f.reason!=='guard-rejected'))return refused('composition-incomplete');
  if(!composed.candidates.length)return refused('no-reading');
  const projected=s.binder.project(s.frameWorld,composed.candidates.map(c=>c.value),{compiled:s.frames,budget:limits.bridgeBudget,projectionBudget:limits.compositionBudget});
  if(projected.truncated||projected.failures.length)return refused('unresolved-frame-binding',projected.failures);
  const active=new Set();
  for(const candidate of projected.candidates){const mapping=s.declarations.find(m=>m.licence===candidate.value.licence);if(!mapping)return refused('missing-request-mapping');active.add(mapping.licence);
   for(const component of mapping.components.filter(c=>c.kind==='relation')){const role=candidate.value.roles.find(r=>r.frame_role===component.role);if(!role||!mapping.relations.some(r=>r.value===role.value?.relation&&r.source===s.grammar.provenance[role.value?.origin]?.wire))return refused('unlicensed-spatial-relation');}
  }
  const profile={rules:{},guards:{}};
  for(const [key,value]of Object.entries(s.profile.rules))if([...active].some(name=>key.startsWith(name+'.'))){profile.rules[key]=value;profile.guards[key]=s.profile.guards[key];}
  if(s.phraseWorld.stamp!==s.phraseStamp||s.frameWorld.stamp!==s.frameStamp)return refused('source-changed-during-read');
  const result=api.readGrammarRequests(s.phraseWorld,text,{compiled:s.grammar,profile,start:'Message',terminalPunctuation:['.'],...limits});
  return {...result,interpretations:projected.candidates,mappingSources:s.declarations.filter(m=>active.has(m.licence)).map(m=>m.source)};
 };
 return {compile,read};
}

export const ENGLISH_REQUEST_MAPPING_FACTS = {'w.reader.en.requests':['w.reader.en.requests.mapping','w.reader.en.requests.component','w.reader.en.requests.metadata','w.reader.en.requests.relation']};
/** Decode data-only mapping records and verify their exact published sources. */
export function englishRequestMappings(api,world,{budget=50000}={}){
 let steps=0;const tick=()=>{if(++steps>budget)throw Error('mapping-budget');};
 try{
  if(!Number.isSafeInteger(budget)||budget<1)throw Error('invalid-budget');
  if(!world.modules().some(m=>m.name==='w.reader.en.requests'&&m.version==='1'))throw Error('unsupported-mapping-module');
  const one=(w,k)=>{tick();if(w?.attrs[k]?.length!==1)throw Error('missing-or-repeated-mapping-field');return api.valueText(w.attrs[k][0]);};
  const groups=Object.fromEntries(['mapping','component','metadata','relation'].map(kind=>[kind,[...world.wires.values()].filter(w=>{tick();return w.type==='w.reader.en.requests.'+kind;})]));
  const mapped=new Map();for(const m of groups.mapping){const name=one(m,'name');if(mapped.has(name))throw Error('duplicate-mapping');mapped.set(name,m);}
  for(const kind of ['component','metadata','relation'])for(const row of groups[kind])if(!mapped.has(one(row,'mapping')))throw Error('orphan-mapping-declaration');
  const source=w=>{if(!w.attrs.grounded_by?.length)throw Error('ungrounded-mapping');for(const raw of w.attrs.grounded_by){tick();const id=api.valueText(raw);if(!world.get(id))throw Error('missing-mapping-source');}};
  const declarations=[];
  for(const [name,mapping] of mapped){
   source(mapping);const licence=one(mapping,'licence'),components=[];
   if(!mapping.attrs.grounded_by.some(raw=>{const w=world.get(api.valueText(raw));return w.type==='w.reader.en.frames.licence'&&one(w,'name')===licence;}))throw Error('mapping-licence-source-mismatch');
   for(const row of groups.component.filter(c=>one(c,'mapping')===name)){
    source(row);const kind=one(row,'kind'),role=one(row,'role'),grounded=row.attrs.grounded_by.map(raw=>world.get(api.valueText(raw)));
    const roleSource=grounded.find(w=>w.type==='w.reader.en.frames.role'&&one(w,'licence')===licence&&one(w,'frame_role')===role);if(!roleSource)throw Error('mapping-role-source-mismatch');
    const keys=kind==='target'?['kind','id','role']:kind==='predicate'?['kind','id','role','target']:kind==='relation'?['kind','id','role','target','goal','concept','character','polarity']:null;if(!keys)throw Error('unsupported-mapping-component');
    if(Object.keys(row.attrs).some(k=>!keys.includes(k)&&!['name','mapping','grounded_by'].includes(k)&&!k.startsWith('core.')))throw Error('unknown-mapping-field');
    const component=Object.fromEntries(keys.map(k=>[k,one(row,k)]));
    if(kind==='target'&&!['new','existing'].includes(one(roleSource,'target_mode')))throw Error('unresolved-target-mode');
    if(kind==='relation'&&!grounded.some(w=>w.type==='k.attributes.attribute'&&one(w,'name')===component.concept&&one(w,'aspect')==='spatial'))throw Error('ungrounded-spatial-concept');
    components.push(component);
   }
   const metadata=groups.metadata.filter(w=>one(w,'mapping')===name).map(w=>{tick();if(!w.attrs.segment?.length)throw Error('missing-metadata-path');return w.attrs.segment.map(api.valueText);});
   const relations=[];for(const row of groups.relation.filter(w=>one(w,'mapping')===name)){const source=world.get(one(row,'source_id')),basis=world.get(one(row,'basis_id')),relation=one(row,'value');if(source?.type!=='w.lang.en.prep'||basis?.type!=='w.lang.en.prep'||!['static','direction'].includes(one(basis,'space'))||one(basis,'rel')!==relation||one(source,'rel')!==relation)throw Error('ungrounded-spatial-relation');relations.push({value:relation,source:source.id});}
   declarations.push({licence,components,source:mapping.id,metadata,relations});
  }
  return {ok:true,mappings:declarations};
 }catch(error){return {ok:false,issues:[{reason:error.message}]};}
}
