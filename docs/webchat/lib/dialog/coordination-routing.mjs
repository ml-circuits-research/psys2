// SPDX-License-Identifier: AGPL-3.0-only
// Route a coordinated make request ("draw a cat and 2 dogs") as its noun phrases (coordination-split.mjs), executed
// together: new objects without a place of their own are compiled one plan each and placed in one placement problem
// (executeNativeGroup); noun phrases that share a relation ("a house and two trees near the lake") become one
// request with several subjects, placed by the library in one std.problem. Every noun phrase that could not be read
// or made is named in the reply.
import {parse,serialize,quote} from '../vendor/sopworld/sopworld.mjs?v=a37e1846b3';
import {writeReaderSource} from './reader-source.mjs?v=dd456294b1';
import {coordinationParts} from './coordination-split.mjs?v=7c2d3d1c47';
import {resolveRequestRoute} from './request-routing-policy.mjs?v=162ba0e305';
import {compileNativePlan,executeNativeGroup} from './capability-plan-execution.mjs?v=45009cadd9';
import {executionKnowledge} from './declared-execution.mjs?v=b25c7000c1';
import {recordHistory} from './history-journal.mjs?v=99bcb89726';
import {quantityNote} from './quantity-projection.mjs?v=cbd5eee513';

const reply=(text,supported,trace={})=>({text,parts:[{text,translate:false}],statuses:[supported?'supported':'unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',...trace}});
const attr=(wire,key)=>wire?.attrs[key]?.[0];

/** One request with every conjunct's subjects (renamed apart), one anchor per anchor kind, the original source text. */
export function mergeConjuncts(candidates,text){
 const out=[],anchors=new Map();
 const source={id:'coordination.source',type:'std.request.source',attrs:{text:[quote(text)]},pattern:false};
 let root;
 candidates.forEach((candidate,c)=>{
  const nodes=parse(candidate.wires),ids=new Map(nodes.map(w=>[w.id,'c'+c+'.'+w.id]));
  const request=nodes.find(w=>w.type==='std.request'&&w.id===candidate.request);
  for(const w of nodes){
   if(w.type==='std.request.source'){ids.set(w.id,source.id);continue;}
   if(w.type==='std.request'){if(w!==request)return;if(!root){root={...w,id:'coordination.request',attrs:{...w.attrs,source:['$'+source.id]}};delete root.attrs.root;}ids.set(w.id,root.id);continue;}
   if(w.type==='std.request.target'&&attr(w,'mode')==='existing'){
    const key=attr(w,'kind')+'|'+(attr(w,'name')??'');
    if(anchors.has(key)){ids.set(w.id,anchors.get(key));continue;}
    anchors.set(key,ids.get(w.id));
   }
  }
  for(const w of nodes){
   if(w.type==='std.request.source'||w.type==='std.request')continue;
   if(w.type==='std.request.target'&&attr(w,'mode')==='existing'&&ids.get(w.id)!=='c'+c+'.'+w.id)continue;
   const attrs=Object.fromEntries(Object.entries(w.attrs).filter(([k])=>!['source','source.start','source.end'].includes(k))
    .map(([k,v])=>[k,v.map(t=>t.startsWith('$')&&ids.has(t.slice(1))?'$'+ids.get(t.slice(1)):t)]));
   out.push({...w,id:ids.get(w.id),attrs});
  }
 });
 if(!root)return null;
 return {request:root.id,wires:serialize([source,root,...out])};
}

/**
 * The reply to a coordinated make reading, or null when `read` is not one (or none of its noun phrases reads).
 * deps: { provider, project(read) -> {proposal}, admit(proposal, text) -> decision, dispatch(candidate) -> reply }.
 */
export async function routeCoordination(session,text,read,{provider,project,admit,dispatch,bindings,view}){
 const parts=coordinationParts(text,read);
 if(!parts||typeof provider?.propose!=='function')return null;
 const members=[],dropped=[],readings=[];
 for(const part of parts){
  let proposal=null;
  try{proposal=(await project(await provider.propose(writeReaderSource(part.text)))).proposal;}catch{/* An unreadable part is dropped and named. */}
  const decision=proposal&&admit(proposal,part.text);
  readings.push({said:part.said,text:part.text,admitted:!!decision?.admitted,failures:proposal?.failures??[]});
  if(decision?.admitted)members.push({part,candidate:decision.candidate});else dropped.push(part.said);
 }
 try{session.engine?.onWorldActivity?.({nodeIds:['component:reader','component:library'],phase:'stage',operation:'app.reader.coordination',label:'Read each coordinated noun phrase',text,parts:readings});}catch{/* Observation cannot change the reading. */}
 if(!members.length)return null;
 const trace={coordination:{parts:readings,dropped}};
 const notes=members.map(({part,candidate})=>{const note=quantityNote(candidate);return note?note.replace(/\.$/,'')+' in '+JSON.stringify(part.said)+'.':'';}).filter(Boolean);
 const finish=result=>{
  const extra=[...notes,...(dropped.length&&!result.text.includes('could not read')?['I could not read '+dropped.map(d=>JSON.stringify(d)).join(', ')+'.']:[])];
  if(extra.length){result.text+=' '+extra.join(' ');result.parts=[{text:result.text,translate:false}];}
  return {...result,trace:{...result.trace,...trace,partial:result.trace?.partial||dropped.length>0}};
 };
 const routes=members.map(({candidate})=>resolveRequestRoute(candidate).method);
 if(routes.every(r=>r==='spatial')){
  const merged=mergeConjuncts(members.map(m=>m.candidate),text);
  if(merged)return finish(await dispatch(merged));
 }
 if(routes.every(r=>r==='capability')){
  const area=view,before=structuredClone(session.isession.state),compiled=[],refused=[];
  for(const member of members){
   const plan=(await compileNativePlan(session,member.candidate,{bindings,view,readKnowledge:executionKnowledge}))?.plan;
   if(plan?.status==='compiled'&&plan.act==='make')compiled.push({candidate:member.candidate,plan});
   else refused.push({said:member.part.said,reason:plan?.message??plan?.reason??'not-applicable'});
  }
  for(const r of refused)dropped.push(r.said);
  trace.coordination.refused=refused;
  if(!compiled.length)return finish(reply('I could not make '+refused.map(r=>JSON.stringify(r.said)).join(' or ')+'. Nothing changed.',false,{reason:'coordination-refused'}));
  const result=await executeNativeGroup(session,compiled,{view});
  if(!result)return null;
  if(refused.length){result.text+=' I could not make '+refused.map(r=>JSON.stringify(r.said)).join(', ')+'.';result.parts=[{text:result.text,translate:false}];}
  const changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
  if(changed.length&&result.statuses.includes('supported'))recordHistory(session,{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),
   after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:compiled[0].candidate,readings:compiled.map(m=>m.candidate),alternatives:[]});
  const dropOnlyUnread=dropped.filter(d=>!refused.some(r=>r.said===d));
  if(dropOnlyUnread.length){result.text+=' I could not read '+dropOnlyUnread.map(d=>JSON.stringify(d)).join(', ')+'.';result.parts=[{text:result.text,translate:false}];}
  return finish(result);
 }
 // Mixed: each noun phrase on its own route, in source order.
 const results=[];
 for(const {candidate} of members)results.push(await dispatch(candidate));
 const textOut=results.map(r=>r.text).join(' ');
 const last=results.at(-1);
 return finish({...last,text:textOut,parts:[{text:textOut,translate:false}],statuses:results.flatMap(r=>r.statuses),effects:results.flatMap(r=>r.effects??[])});
}
