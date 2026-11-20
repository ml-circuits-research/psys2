import { captureHistory, restoreHistory } from './history-journal.mjs?v=368943b3c7';
// Native capability/state adapter for the existing std.sample and language-world realiser.
import * as lib from '../vendor/sopworld/sopworld.mjs?v=ebb9691a80';
import {createSampler} from './sampler.mjs?v=5fd0035f20';
import {nativeKindCandidates} from './native-binding-candidates.mjs?v=ac13984c43';
import {declaredPropertyValues} from './declared-execution.mjs?v=077be3e2bf';
import {routeNewEngine} from './reader-routing.mjs?v=e52cb9f995';
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

// A probe is a background reading: its awaits settle as microtasks, so a host message (the user's next
// turn) is only seen after a task boundary. Every reader call first yields one task and gives the probe up
// when the host asked for the engine; a turn then waits at most for one model call, not for whole probes.
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
export class SampleYielded extends Error { constructor() { super('sample-yielded'); this.name = 'SampleYielded'; } }
export function preemptibleEngine(engine, shouldYield) {
 const reader = engine?.requestReader;
 if (!reader) return engine;
 const gate = async () => { await nextTask(); if (shouldYield()) throw new SampleYielded(); };
 const wrapped = Object.create(reader);
 for (const method of ['propose', 'proposeIndependent', 'proposeLiteral']) if (typeof reader[method] === 'function') wrapped[method] = async (...args) => { await gate(); return reader[method](...args); };
 if (typeof reader.proposeRequests === 'function') wrapped.proposeRequests = async function* (...args) { await gate(); const sequence = reader.proposeRequests(...args); while (true) { const step = await sequence.next(); if (step.done) return; yield step.value; await gate(); } };
 return Object.create(engine, { requestReader: { value: wrapped, enumerable: true, writable: true, configurable: true } });
}

/** No probe mutates the real session. Only normal neural reads with a matching effect are offered. */
export function createNativeRequestSampler() {
 let current=null;
 const sampler=createSampler(lib,{worldOf:()=>current?{schema:current.schema}:null,thingsOf:()=>current?.things??[],historyOf:()=>0});
 return {async sample({session,area,view,world,host,createHost,bindings,mode='one',count=1,maxProbes=8,shouldYield=()=>false}) {
  const baseline=JSON.stringify(session.isession.state),observation=host.observe();
  current=samplingSchema({area,operations:host.bindings(),observation,bindings});
  const proposals=sampler.sample(mode,{worldId:area,count:Math.min(maxProbes,Math.max(count,8))});
  const items=[];let probes=0;
  const engine=preemptibleEngine(session.engine,shouldYield);
  for(const proposal of proposals) {
   await nextTask();
   if(shouldYield()||probes>=maxProbes||items.length>=count)break;
   probes++;
   const fork={engine,isession:{state:structuredClone(session.isession.state)},
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
