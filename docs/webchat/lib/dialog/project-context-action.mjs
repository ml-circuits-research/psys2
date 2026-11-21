import { historyHeads } from './history-journal.mjs?v=0d3803bc7e';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=0f46640ed0';
// Bind model-declared context references to actual native objects; never inspect source words.
import {quote,str} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=cfc87f8ce5';
import {executionPolicyWorld} from './execution-policy.mjs?v=88bdf143f7';
import {readReferenceTurn,resolveObservedReference,referencePolicyWorld} from './reference-policy.mjs?v=35a0db82fe';
import {observeGroundedProjection,projectGroundedRequest} from './grounded-projection.mjs?v=5dca2227e3';
import {flatRequestProjection} from './request-projection.mjs?v=d4f2dd977c';
import {bridgeRawStructure} from './raw-structural-bridge.mjs?v=5f0a2fa41e';
import {retargetRule,pluralReference} from './raw-reading-policy.mjs?v=ccbbb332c0';
import {en} from '../lang/en.mjs?v=911f0ab5a1';
import {comparativeSteps} from './comparative-projection.mjs?v=e13afbcbfb';
import {referenceProjection} from './reference-projection.mjs?v=cfb59bc4a2';
import {interpretationPolicy} from './interpretation-policy.mjs?v=79c1776d10';
// What an act on the referent that says nothing more does (reference-policy.sop app.reference.bare: none | grounded).
const bareUse=act=>{const row=referencePolicyWorld().ofType('app.reference.bare').find(r=>str(r.attrs.act?.[0])===act);return row?str(row.attrs.use[0]):undefined;};
export async function projectContextAction(proposal,session,{bindings,registry,view}={}) {
 const raw=proposal?.raw,r=raw?.requests?.[0],area=NATIVE_AREAS[view],readerArea=bindings?.readerAreaByView?.[view]??area?.area;
 if(!area||!bindings||!registry||proposal.coverage?.complete||raw?.requestCount!==1||raw.coverage?.truncated||!r?.target||r.target.kind||r.target.name)return null;
 const route=readReferenceTurn(r);if(!route)return null;
 // Properties of a container said of a reference ("make it pastel") are read as the container's members by the partial
 // reading (raw-reading-policy.sop: the rules conclude app.reading.retarget rule=container), not as one observed object.
 if(retargetRule({...raw,area:readerArea},bindings,0)==='container')return null;
 const native=session.isession.state[area.world];if(!native)return null;
 const host=await area.create({state:native,instanceId:'context-'+globalThis.crypto.randomUUID()});
 const mappings=nativeKindCandidates(bindings).filter(mapping=>mapping.area===readerArea&&mapping.type===r.target.type);
 const resolution=resolveObservedReference(route,host.observe().objects,mappings,session.newEngineFocus?.[view]);
 if(!resolution)return null;
 const {selected,options,choice}=resolution,other=resolution.values==='previous';
 try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:reference-policy','instance:'+area.world],
  phase:'stage',label:'Rank contextual references',operation:'std.choice',sop:choice.sop,input:choice.input,
  candidates:options.map(({object,canonical})=>({id:object.id,canonical}))});}catch{/* Trace subscribers cannot change interpretation. */}
 const previous=session.newEngineLastAction?.[view];
 let inherited=null,rewind=null;
 if(other){
  const last=historyHeads(session,view).find(row=>row.direction==='undo')?.entry;
  if(!previous||!last||!Object.keys(last.after).every(key=>JSON.stringify(session.isession.state[key])===JSON.stringify(last.after[key])))return null;
  const prior=flatRequestProjection(previous);if(!prior.ok||prior.request.act!==r.act||prior.targets.length!==1||!prior.results.length)return null;
  inherited=prior.results;rewind=last.before;
 }else if(!Array.isArray(r.constraints)||!r.constraints.length&&bareUse(r.act)==='none')return null;   // an act on the referent may say nothing more ("improve the layout", "trash it", "copy this one")
 const canonical=selected.canonical,values=[];
 // A plural reference with a said list ("call them Tom and Jerry") names the things the last action of this view made,
 // each taking its value of the list in order (raw-reading-policy.sop app.reading.plural / app.reading.distributes).
 if(!other){const distributed=await distributedProjection({proposal,raw,r,session,area,host,options,selected,bindings,readerArea,registry,view});if(distributed)return distributed;}
 // A reading beyond plain stated values (a comparative step, several results, a class value its span only evidences:
 // legend "hide" said as "get rid of the legend"; a selector that picks among the family: "the May value", "the third
 // bar") is projected by the same bridge as any other reading, with the context target bound to the kind the observed
 // reference resolution chose.
 if(!other&&(!r.constraints.length&&bareUse(r.act)!=='grounded'||r.constraints.some(c=>c.operator!=='eq'||c.phase==='selector'||typeof c.value==='string'&&typeof c.value_span==='string'&&c.value!==c.value_span))){
  const bindingSha256=proposal.provenance?.bindingsSha256;
  const bridgeOptions={bindings,bindingSha256,comparatives:comparativeSteps(),references:referenceProjection(),contextTarget:{kind:canonical,declaration:selected.object.source}};
  const usable=b=>b&&!b.diagnostics.length&&b.decoded?.candidates?.length===1&&!b.decoded.issues?.length;
  let bridged=bindingSha256?bridgeRawStructure(raw,bridgeOptions):null;
  // A reading the strict bridge refuses only for what the declared partial defaults supply (an act without its own
  // trigger words is anchored on the request: "bars narrower") is bridged with those defaults, when nothing is dropped.
  if(bindingSha256&&!usable(bridged)){const lenient=bridgeRawStructure(raw,{...bridgeOptions,partial:{defaults:interpretationPolicy().partial.defaults}});if(usable(lenient)&&!lenient.disclosed?.length)bridged=lenient;}
  if(!usable(bridged))return null;
  const note='I took the reference as the '+selected.object.kind+'.';
  return {proposal:{...proposal,candidates:bridged.decoded.candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],
   interpretation:{profile:'native-context/1',note,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind:null};
 }
 if(inherited)for(const c of inherited){if(c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||c.value===null)return null;if(c.tokens.length!==1)return null;values.push({concept:c.concept,token:c.tokens[0],witness:previous.request+':'+c.id});}
 else for(const [index,c]of r.constraints.entries()) {
  if(c.phase!=='result'||c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'||c.value!==c.value_span||Object.keys(c).some(k=>!['key','value','value_span','phase','operator','polarity','character'].includes(k)))return null;
  const evidence=raw.ranges?.filter(a=>JSON.stringify(a.path)===JSON.stringify(['requests','0','constraints',String(index),'value_span']))??[];
  if(evidence.length!==1||Array.from(raw.source.text).slice(...evidence[0].range).join('')!==c.value)return null;
  let concept=bindings.properties.find(p=>p.area===readerArea&&p.key===c.key)?.canonical;
  if(!concept){const spec=registry[readerArea+'.'+c.key];const row=executionPolicyWorld().ofType('app.execution.observedProperty').find(p=>str(p.attrs.sourceType?.[0])===selected.object.sourceType&&str(p.attrs.concept?.[0])===spec?.concept);concept=row&&str(row.attrs.concept[0]);}
  if(!concept)return null;values.push({concept,token:quote(c.value),range:evidence[0].range,witness:c.key});
 }
 const graph=projectGroundedRequest({profile:'context',act:r.act,mood:r.mood,kind:canonical,text:raw.source.text,
  values,witness:selected.object.source});
 if(!graph)return null;
 observeGroundedProjection(session,graph.projection);
 const note=other?'I applied the previous change to the other '+selected.object.kind+'.':'I took the reference as the '+selected.object.kind+'.';
 return {proposal:{...proposal,candidates:[graph],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-context/1',note,projection:graph.projection,chosen:{id:selected.object.id,kind:selected.object.kind,canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},focus:selected.object.id,rewind};
}

// The things the last undoable action of this view made, in the order observed, among the reference's options of the
// selected canonical kind.
async function lastMade(session,view,area,host,options,canonical){
 const last=historyHeads(session,view).find(row=>row.direction==='undo')?.entry;
 const before=last?.before?.[area.world];if(!before)return [];
 const earlier=new Set((await area.create({state:before,instanceId:'context-'+globalThis.crypto.randomUUID()})).observe().objects.map(o=>o.id));
 const ofKind=new Map(options.filter(o=>o.canonical===canonical).map(o=>[o.object.id,o]));
 return host.observe().objects.filter(o=>!earlier.has(o.id)&&ofKind.has(o.id)).map(o=>ofKind.get(o.id));
}
async function distributedProjection({proposal,raw,r,session,area,host,options,selected,bindings,readerArea,registry,view}){
 const {plural,distributes}=pluralReference(r);
 if(!plural||!Array.isArray(r.constraints)||!r.constraints.length)return null;
 // The list said for a distributed key: its constraints' values in order (the reader may give one per item or one
 // coordinated span), each cut at the w.lang.en coordinators.
 if(r.constraints.some(c=>c.phase!=='result'||c.operator!=='eq'||c.polarity!=='positive'||c.character!=='requirement'||typeof c.value!=='string'))return null;
 const keys=[...new Set(r.constraints.map(c=>c.key))];
 const said=keys.map(key=>{const values=r.constraints.filter(c=>c.key===key).map(c=>c.value);return {key,parts:distributes.has(key)?values.flatMap(v=>en.splitList(v)):values};});
 const lists=said.filter(x=>distributes.has(x.key)&&x.parts.length>1);
 if(!lists.length||said.some(x=>!distributes.has(x.key)&&x.parts.length>1))return null;
 const group=await lastMade(session,view,area,host,options,selected.canonical);
 if(group.length<2||lists.some(x=>x.parts.length!==group.length))return null;
 const members=[];
 for(const [i,member] of group.entries()){
  const values=[];
  for(const {key,parts} of said){
   let concept=bindings.properties.find(p=>p.area===readerArea&&p.key===key)?.canonical;
   if(!concept){const spec=registry[readerArea+'.'+key];const row=executionPolicyWorld().ofType('app.execution.observedProperty').find(p=>str(p.attrs.sourceType?.[0])===member.object.sourceType&&str(p.attrs.concept?.[0])===spec?.concept);concept=row&&str(row.attrs.concept[0]);}
   if(!concept)return null;
   values.push({concept,token:quote(parts.length===group.length?parts[i]:parts[0]),witness:key});
  }
  const graph=projectGroundedRequest({profile:'context',act:r.act,mood:r.mood,kind:member.canonical,text:raw.source.text,values,witness:member.object.source});
  if(!graph)return null;
  members.push({candidate:graph,focus:member.object.id});
 }
 observeGroundedProjection(session,members[0].candidate.projection);
 const kind=selected.object.kind,note='I took the reference as the '+group.length+' '+(en.plural(kind)??kind)+' just made, in order.';
 return {proposal:{...proposal,candidates:[members[0].candidate],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'native-context/1',note,distributed:members.map(m=>m.focus),chosen:{id:members[0].focus,kind,canonical:selected.canonical},alternatives:options.map(o=>({id:o.object.id,kind:o.object.kind,canonical:o.canonical})),unresolved:proposal.failures}},
  focus:members[0].focus,members,rewind:null};
}
