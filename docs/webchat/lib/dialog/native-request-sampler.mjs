import { captureHistory, restoreHistory } from './history-journal.mjs?v=73602fda44';
// Native capability/state adapter for the existing std.sample and language-world realiser.
import * as lib from '../vendor/sopworld/sopworld.mjs?v=3a48344175';
import {createSampler} from './sampler.mjs?v=7860124cef';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=f6d6f43960';
import {declaredPropertyValues} from './declared-execution.mjs?v=3af18c716b';
import {routeNewEngine} from './reader-routing.mjs?v=dd936c581b';
const word = x => typeof x==='string' && /^[a-z]+$/.test(x);

export function samplingSchema({area,operations,observation,bindings}) {
 const kinds={},attrs={},families=new Map();
 for(const row of nativeKindCandidates(bindings).filter(r=>r.area===area&&word(r.lemma))) {
  const make=operations.find(op=>op.id===row.nativeFamilyBinding?.operation&&op.act==='make');
  if(!make||make.params.kind?.enum&&!make.params.kind.enum.includes(row.lemma))continue;
  const same=operations.filter(op=>op.on===make.on&&!op.requires?.length);
  const acts=[...new Set(same.map(op=>op.act).filter(act=>['make','change'].includes(act)))];
  kinds[row.lemma]={name:row.lemma,acts};families.set(row.lemma,make.on);
 }
 for(const property of bindings.properties??[]) {
  if(property.area!==area||!word(property.canonical)||!property.hostBinding)continue;
  const operation=operations.find(op=>op.id===property.hostBinding.operation&&op.act==='change');
  const descriptor=operation?.params[property.hostBinding.parameter];if(!descriptor)continue;
  const values=descriptor.enum??declaredPropertyValues(property.canonical);
  const bounded=['number','integer'].includes(descriptor.type)&&Number.isFinite(descriptor.min)&&Number.isFinite(descriptor.max);
  if(!values.length&&!bounded)continue;
  attrs[property.canonical]={name:property.canonical,of:[...families].filter(([,type])=>type===operation.on).map(([name])=>name),type:values.length?'enum':'number',values,min:descriptor.min,max:descriptor.max};
 }
 const things=observation.objects.map(object=>({id:object.id,kind:object.kind,noun:object.kind,attrs:Object.fromEntries((object.inputs??[]).flatMap(input=>{
  const property=(bindings.properties??[]).find(p=>p.area===area&&p.hostBinding?.id===input.binding);
  return property?[[property.canonical,lib.str(input.values?.[0])]]:[];
 }))}));
 return {schema:{id:area,acts:new Set(Object.values(kinds).flatMap(k=>k.acts)),kinds,attrs,flags:{name:true}},things};
}

/** No probe mutates the real session. Only normal neural reads with a matching effect are offered. */
export function createNativeRequestSampler() {
 let current=null;
 const sampler=createSampler(lib,{worldOf:()=>current?{schema:current.schema}:null,thingsOf:()=>current?.things??[],historyOf:()=>0});
 return {async sample({session,area,view,world,host,createHost,bindings,mode='one',count=1,maxProbes=8}) {
  const baseline=JSON.stringify(session.isession.state),observation=host.observe();
  current=samplingSchema({area,operations:host.bindings(),observation,bindings});
  const proposals=sampler.sample(mode,{worldId:area,count:Math.min(maxProbes,Math.max(count,8))});
  const items=[];let probes=0;
  for(const proposal of proposals) {
   if(probes++>=maxProbes||items.length>=count)break;
   const fork={engine:session.engine,isession:{state:structuredClone(session.isession.state)},
    newEngineFocus:structuredClone(session.newEngineFocus??{}),newEngineLastAction:structuredClone(session.newEngineLastAction??{})};
   if(session.historyJournal)restoreHistory(fork,captureHistory(session));
   else if(session.newEngineUndo?.length||session.newEngineRedo?.length)restoreHistory(fork,undefined,session);
   let result;
   try {result=await routeNewEngine(fork,proposal.text,{language:'en',view});}catch{continue;}
   // Effects must match the sampled act and the requested kind/observed target.
   const operation=host.bindings().find(op=>op.id===result.effects?.[0]?.operation);
   if(!result.effects?.length||operation?.act!==proposal.frame.action)continue;
   if(proposal.frame.action==='make') {
    const after=(await createHost({state:fork.isession.state[world],instanceId:'sample-'+globalThis.crypto.randomUUID()})).observe();
    if(!after.objects.some(o=>!observation.objects.some(b=>b.id===o.id)&&o.kind===proposal.frame.args.kind))continue;
   }
   if(proposal.frame.action==='change'&&!result.trace?.receipt?.changed?.includes(proposal.frame.args.thing))continue;
   if(JSON.stringify(session.isession.state)!==baseline)break; // stale suggestions are discarded.
   items.push({...proposal,tab:view,world,verifiedEffect:true});
  }
  return {items,available:true,probes,reason:items.length?null:'no-changing-neural-proposal'};
 }};
}
