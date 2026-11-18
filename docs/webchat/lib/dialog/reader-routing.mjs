import {isScopedRemoval} from './capability-plan-execution.mjs?v=b83d8b3839';
import {projectRemovalAction} from './project-removal-action.mjs?v=55086ac794';
import { captureHistory, recordHistory, restoreHistory } from './history-journal.mjs?v=c7afd454fd';
import {projectReaderHeadAlternative} from './reader-head-alternative.mjs?v=637b6dff44';
import {parse} from '../vendor/sopworld/sopworld.mjs?v=8186c36d14';
import {writeReaderSource} from './reader-source.mjs?v=f615c37c90';
import {isAuthoredRequest,readAuthoredRequest} from './authored-request-tool.mjs?v=669290a7ca';
// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {requestCompositionPolicy,scheduleFollowingCut}from './request-composition-policy.mjs?v=73ae480f31';
import {executeDeclaredRequest,compareDeclaredReadings} from './declared-execution.mjs?v=9182a6cadd';
import {projectQueryAction,recoverQueryProjection} from './project-query-action.mjs?v=46ad2e952e';
import {projectContextAction} from './project-context-action.mjs?v=3ef0fa920f';
import {projectCreateAction} from './project-create-action.mjs?v=d390db15a0';
import {assessReaderProposal} from './reader-admission.mjs?v=583f4541a9';
const unavailable=reason=>({candidates:[],coverage:{complete:false,executable:false,graphProposal:false},failures:[{reason}]});
const noDeclaredAction = () => {
 const text='I could not identify an action to apply. Nothing changed.';
 return {text,parts:[{text,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],
  trace:{legacy:false,engine:'new',reason:'no-declared-action'}};
};
async function dispatchRequest(session,candidate,text,options,bindings,contextProjection,interpretation,alternatives=[],compiledPlan) {
 let result;
 const area=options.view??session.isession.state['ui.shell']?.activeTab;
 const before=structuredClone(session.isession.state);
 const rewind=contextProjection?.rewind;
 const originals=rewind&&Object.fromEntries(Object.keys(rewind).map(key=>[key,session.isession.state[key]]));
 if(rewind)Object.assign(session.isession.state,structuredClone(rewind));
 try{
  result=await executeDeclaredRequest(session,candidate,text,{bindings,view:area,compiledPlan,focus:contextProjection?.focus,unapplied:interpretation?.unapplied??[]})??noDeclaredAction();
 }finally{
  if(originals&&!result?.statuses?.includes('supported'))Object.assign(session.isession.state,originals);
 }
 if(result.trace?.history||result.trace?.readOnly)return result;
 if(result.statuses?.includes('supported')){session.newEngineLastAction={...session.newEngineLastAction,[area]:candidate};if(contextProjection){result.text+=' '+interpretation.note;result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation};}}
 const changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
 if(changed.length)recordHistory(session,{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),
  after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:candidate,alternatives});
 return result;
}

/** The model only sees utterance text. No expected annotations or grammar graphs. */
async function routeReaderProposal(session,text,options={},suppliedProposal){
 const provider=session.engine?.requestReader;
 let proposal,provenance=null;
 if(typeof text!=='string'||!text.trim()||text.length>65536||(options.language&&options.language!=='en'))proposal=unavailable('invalid-reader-input');
 else if(!provider||typeof provider.propose!=='function')proposal=unavailable('model-provider-unavailable');
 else{
  try{provenance=typeof provider.provenance==='function'?provider.provenance():null;proposal=suppliedProposal??await provider.propose(writeReaderSource(text));}
  catch{proposal=unavailable('model-proposal-failed');}
 }
 const providerCoverage=proposal?.coverage;
 const providerCandidates=Array.isArray(proposal?.candidates)?structuredClone(proposal.candidates):[];
 const context={area:options.view??session.isession.state['ui.shell']?.activeTab};
 let contextProjection=null,bindings=null,registry=null;
 try{
  bindings=provider?.bindings?.();
  registry=provider?.registry?.();
  const projectionOptions={bindings,registry,view:context.area};
  contextProjection=await projectContextAction(proposal,session,projectionOptions);
  if(contextProjection)proposal=contextProjection.proposal;
  else{
   const query=await projectQueryAction(proposal,session,projectionOptions);
   if(query){
    proposal=query;
    proposal=await recoverQueryProjection(query,session,{...projectionOptions,provider});
   }else proposal=await projectCreateAction(proposal,session,projectionOptions)??proposal;
  }
 }catch{/* A failed projection preserves the available model observations. */}
 let provenAlternative=null;
 if(!proposal.coverage?.complete&&bindings&&provenance?.bindingsSha256){
  try{
   const {candidate,proof}=projectReaderHeadAlternative(proposal.raw,{bindings,bindingSha256:provenance.bindingsSha256,
    cutStart:proposal.sourceCut?.spans?.[0]?.[0]})??{};
   const comparison=candidate&&await compareDeclaredReadings(session,[candidate],{view:context.area,bindings});
   if(comparison?.plan?.status==='compiled'&&comparison.plan.skipped.length===0&&comparison.plan.id&&comparison.plan.source){
    const unresolved=proposal.failures;
    provenAlternative=comparison;
    proposal={...proposal,candidates:[candidate],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
     interpretation:{profile:'grounded-head-alternative/1',note:'I used the property reading that matched this editor. The reader also suggested the same property in another editor.',
      proof,unresolved}};
    session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:reader-head-policy'],phase:'stage',
     operation:'app.reader.head',label:'Prove a grounded property reading',wires:proof.input+'\n'+proof.sop+'\n'+comparison.sop});
   }
  }catch{/* An unproved alternative leaves the original diagnostics in force. */}
 }
 let removalComparison=null;
 if(bindings){
  try{
   const projection=projectRemovalAction(proposal,session,{bindings,view:context.area});
   const pending=projection?.candidates??proposal.candidates;
   if(pending?.length&&pending.length<=16&&pending.every(candidate=>parse(candidate.wires).some(wire=>wire.type==='std.request'&&wire.id===candidate.request&&wire.attrs.act?.[0]==='remove'))){
    const compared=await compareDeclaredReadings(session,pending,{view:context.area,bindings});
    if(isScopedRemoval(compared?.plan)){
     removalComparison=compared;
     if(projection)proposal={...proposal,candidates:[pending[compared.index]],coverage:{complete:true,graphProposal:true,executable:false},failures:[],
      interpretation:{profile:'grounded-removal/1',mention:projection.mention,range:projection.range,unresolved:proposal.failures,
       alternatives:pending}};
     else if(compared.index!==0)proposal={...proposal,candidates:[pending[compared.index],...pending.filter((_,index)=>index!==compared.index)]};
    }
   }
  }catch{/* A request with unproved removal remains subject to normal admission. */}
 }
 const preservedProviderTrace=!!provenAlternative||proposal.interpretation?.profile==='grounded-removal/1'||!!proposal.interpretation?.retry;
 const decision=assessReaderProposal({proposal,text,provenance,admission:session.engine?.requestReaderAdmission,area:context.area,scopedRemoval:!!removalComparison});
 if(decision.decisionSop){
  try{session.engine?.onWorldActivity?.({nodeIds:['component:request-admission','knowledge:reader-admission-policy','component:library'],phase:'stage',operation:'app.reader.admission',label:'Evaluate reader admission policy',wires:decision.decisionSop});}catch{/* Observation cannot change admission. */}
 }
 const choice=proposal?.interpretation?.decision;
 if(choice&&proposal.interpretation.profile==='declared-creation/1')try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:creation-policy'],phase:'stage',operation:'std.choice',label:'Compare grounded creation readings',
  text,wires:choice.input+'\n'+choice.sop});}catch{/* Trace subscribers cannot change interpretation. */}
 let candidate=decision.candidate,comparison=removalComparison??provenAlternative;
 const eligible=decision.admitted,reason=decision.reason;
 const interpretations=proposal?.interpretation?.profile==='declared-creation/1'?proposal.candidates:providerCandidates;
 if(eligible && decision.mode==='uncalibrated-best-effort' && !contextProjection && !removalComparison && interpretations.length>1 && interpretations.length<=16){
  const admitted=interpretations.filter(option=>assessReaderProposal({proposal:{...proposal,candidates:[option]},text,provenance,area:context.area}).admitted);
  if(admitted.length>1){
   comparison=await compareDeclaredReadings(session,admitted,{view:context.area,bindings,unapplied:proposal.interpretation?.unapplied});
   if(comparison){
    session.engine?.onWorldActivity?.({nodeIds:['component:library'],phase:'stage',operation:'std.interpret',label:'Compare proposed readings',
     text,wires:comparison.sop,proposals:admitted.length});
    if(comparison.index!==undefined)candidate=admitted[comparison.index];
   }
  }
 }
 // No grammar fallback exists in the application. Unavailable or unapproved
 // structural models yield an explicit no-effect answer.
 const limitations=proposal?.interpretation?.limitation??[];
 const message=limitations.includes('filter-span-missing')?'I could not ground a filter in the question. I have no complete answer.':
  limitations.includes('target-span-missing')?'I could not ground the kind of object the question refers to. I have no complete answer.':
  'I could not identify an action to apply. Nothing changed.';
 let result;
 if(eligible){
  result=await dispatchRequest(session,candidate,text,options,bindings,contextProjection,proposal.interpretation,decision.alternatives,comparison?.plan);
  if(result?.statuses?.includes('supported')&&proposal.interpretation?.profile==='declared-creation/1'){
   const {requestedName}=proposal.interpretation,notes=[];
   const note=candidate.creationNote??proposal.interpretation.note;
   if(requestedName&&result.trace.effectVerification?.checks?.some(check=>check.parameter==='name'&&check.status==='met'&&check.actual===requestedName))notes.push('I named it '+JSON.stringify(requestedName)+'.');
   if(note)notes.push(note);
   if(notes.length){result.text+=' '+notes.join(' ');result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation:proposal.interpretation};}
  }
  if(result?.statuses?.includes('supported')&&provenAlternative){
   result.text+=' '+proposal.interpretation.note;
   result.parts=[{text:result.text,translate:false}];
   result.trace={...result.trace,interpretation:proposal.interpretation};
  }
  if(result?.statuses?.includes('supported')&&proposal.interpretation?.profile==='declared-query/1'&&proposal.interpretation.note){
   result.text+=' '+proposal.interpretation.note;result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation:proposal.interpretation};
  }
  if(result?.statuses?.includes('supported')&&proposal.interpretation?.profile==='grounded-removal/1'){
   result.text+=' I read '+JSON.stringify(proposal.interpretation.mention)+' as that object. You can undo this.';
   result.parts=[{text:result.text,translate:false}];
   result.trace={...result.trace,interpretation:proposal.interpretation};
  }
  if(result&&decision.uncertain&&result.statuses?.includes('supported')){
   const note=result.trace?.uncertainty?.length||result.trace?.interpretation?'':'I used the most likely reading; you can correct it or undo.';
   if(note){result.text+=' '+note;result.parts=[{text:result.text,translate:false}];}
  }
 }
 result??={text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,...(eligible?{reading:candidate}:{}),...(comparison?{readingComparison:comparison.sop}:{}),readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  admission:{mode:decision.mode??null,uncertain:!!provenAlternative||(decision.uncertain??false),alternatives:decision.alternatives??[],scoreDefinition:decision.scoreDefinition,score:decision.score,proposalEligible:decision.eligible,assessment:decision.assessment,decisionSop:decision.decisionSop??null},
  interpretation:proposal?.interpretation??null,unresolved:preservedProviderTrace?proposal.interpretation.unresolved:(proposal?.failures??[]),proposalCandidates:providerCandidates,rawReading:proposal?.raw?.requests??null,model:{provenance,coverage:(preservedProviderTrace?providerCoverage:proposal?.coverage)??null,candidates:preservedProviderTrace?providerCandidates.length:(proposal?.candidates?.length??0),eligible:!!eligible}}}};
}

/** Apply the declared source-order schedule to actual model cuts, never source words. */
export async function routeNewEngine(session,text,options={}){
 if(isAuthoredRequest(text)){
  const input=readAuthoredRequest(text);
  if(!input.candidate){const message='The SOP request could not be read ('+input.reason+').';return {text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],trace:{authored:true,reason:input.reason}};}
  const bindings=session.engine?.nativeBindings??session.engine?.requestReader?.bindings?.();
  const result=await dispatchRequest(session,input.candidate,text,options,bindings);
  return {...result,trace:{...result.trace,authored:true,reading:input.candidate}};
 }
 const provider=session.engine?.requestReader;
 if(typeof text!=='string'||!text.trim()||text.length>65536||options.language&&options.language!=='en')return routeReaderProposal(session,text,options);
 const policySource=session.engine?.requestCompositionPolicySource;
 const policy=requestCompositionPolicy(policySource);
 try{session.engine?.onWorldActivity?.({nodeIds:['execution:composition-policy'],phase:'stage',label:'Read request scheduling policy',operation:'policy.request-composition',policy:structuredClone(policy)});}catch{/* Observation cannot change request scheduling. */}
 if(!policy.enabled||typeof provider?.proposeRequests!=='function')return routeReaderProposal(session,text,options);
 const before=structuredClone(session.isession.state),journalBefore=captureHistory(session,false),steps=[];
 let deferred=[];
 let sourceSop;
 try{sourceSop=writeReaderSource(text);}catch{return routeReaderProposal(session,text,options);}
 for await(const proposal of provider.proposeRequests(sourceSop)){
  const result=await routeReaderProposal(session,text,options,proposal);
  if(!proposal.composition)return result;
  const source=proposal.composition;
  const following=Array.isArray(source.sourceCuts)&&Number.isSafeInteger(source.index)?source.sourceCuts.slice(source.index+1):[];
  const next=following.length?scheduleFollowingCut(result,following.length,policySource):null;
  steps.push({source,reply:result,next:next?.sop});
  if(next){
   try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:composition-policy'],phase:'stage',
    label:'Schedule remaining request cuts',operation:'app.request.composition.decision',wires:next.sop});}catch{/* Observation cannot change scheduling. */}
   if(next.action==='stop'){deferred=following;break;}
  }
 }
 if(!steps.length)return routeReaderProposal(session,text,options);
 const area=options.view??session.isession.state['ui.shell']?.activeTab,changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
 const grouped=changed.length>0&&!steps.some(step=>step.reply.trace?.history&&step.reply.statuses.includes('supported'));
 if(grouped){
  if(!restoreHistory(session,journalBefore,{},false))throw Error('invalid-group-history-checkpoint');
  recordHistory(session,{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),
   after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:steps.at(-1).reply.trace?.reading,
   readings:steps.map(step=>step.reply.trace?.reading).filter(Boolean),
   alternatives:steps.flatMap(step=>step.reply.trace?.readerRouting?.admission?.alternatives??[])});
 }
 const supported=steps.filter(step=>step.reply.statuses?.includes('supported'));
 const mixed=supported.length>0&&supported.length<steps.length;
 const scalars=Array.from(text);
 const textReply=steps.map(({source,reply})=>{
  if(!mixed||reply.statuses.includes('supported'))return reply.text;
  const excerpt=JSON.stringify(scalars.slice(...source.range).join(''));
  if(reply.trace?.reason==='reading'||reply.trace?.reason==='no-declared-action')return 'I could not apply '+excerpt+'.';
  return 'For '+excerpt+': '+reply.text;
 }).join(' ')+(deferred.length?' I stopped before '+deferred.map(range=>JSON.stringify(scalars.slice(...range).join(''))).join(', ')+'.':'');
 const last=steps.at(-1).reply;
 return {...last,state:changed.length?structuredClone(session.isession.state):last.state,text:textReply,parts:[{text:textReply,translate:false}],statuses:steps.flatMap(step=>step.reply.statuses??[]),effects:steps.flatMap(step=>step.reply.effects??[]),trace:{...last.trace,readerRouting:{...last.trace?.readerRouting,rawReading:steps.flatMap(step=>step.reply.trace?.readerRouting?.rawReading??[]),unresolved:steps.flatMap(step=>step.reply.trace?.readerRouting?.unresolved??[]),proposalCandidates:steps.flatMap(step=>[step.reply.trace?.reading,...(step.reply.trace?.readerRouting?.proposalCandidates??[])]).filter(Boolean)},partial:deferred.length>0||supported.length!==steps.length||steps.some(step=>step.reply.trace?.partial),composition:{policy,sourceCuts:steps[0].source.sourceCuts,steps:steps.map(step=>({source:step.source,statuses:step.reply.statuses,trace:step.reply.trace,text:step.reply.text,...(step.next?{schedule:step.next}:{})})),supported:supported.length,total:steps.length+deferred.length,deferred,undoGroup:grouped?1:0}}};
}
