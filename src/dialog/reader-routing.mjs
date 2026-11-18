import {isAuthoredRequest,readAuthoredRequest} from './authored-request-tool.mjs';
// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {requestCompositionPolicy}from './request-composition-policy.mjs';
import {executeDeclaredRequest,compareDeclaredReadings} from './declared-execution.mjs';
import {projectContextAction} from './project-context-action.mjs';
import {projectCreateAction} from './project-create-action.mjs';
import {assessReaderProposal} from './reader-admission.mjs';
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
 if(result.trace?.history)return result;
 if(result.statuses?.includes('supported')){session.newEngineLastAction={...session.newEngineLastAction,[area]:candidate};if(contextProjection){result.text+=' '+interpretation.note;result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation};}}
 const changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
 if(changed.length){session.newEngineRedo=(session.newEngineRedo??[]).filter(r=>r.area!==area);session.newEngineUndo=[...(session.newEngineUndo??[]).slice(-31),{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:candidate,alternatives}];}
 return result;
}

/** The model only sees utterance text. No expected annotations or grammar graphs. */
async function routeReaderProposal(session,text,options={},suppliedProposal){
 const provider=session.engine?.requestReader;
 let proposal,provenance=null;
 if(typeof text!=='string'||!text.trim()||text.length>65536||(options.language&&options.language!=='en'))proposal=unavailable('invalid-reader-input');
 else if(!provider||typeof provider.propose!=='function')proposal=unavailable('model-provider-unavailable');
 else{
  try{provenance=typeof provider.provenance==='function'?provider.provenance():null;proposal=suppliedProposal??await provider.propose(text);}
  catch{proposal=unavailable('model-proposal-failed');}
 }
 const providerCandidates=Array.isArray(proposal?.candidates)?structuredClone(proposal.candidates):[];
 const context={area:options.view??session.isession.state['ui.shell']?.activeTab};
 let contextProjection=null,bindings=null,registry=null;
 try{bindings=provider?.bindings?.();registry=provider?.registry?.();contextProjection=await projectContextAction(proposal,session,{bindings,registry,view:context.area});if(contextProjection)proposal=contextProjection.proposal;else{const creation=await projectCreateAction(proposal,session,{bindings,registry,view:context.area});if(creation)proposal=creation;}}catch{}
 const decision=assessReaderProposal({proposal,text,provenance,admission:session.engine?.requestReaderAdmission,area:context.area});
 if(decision.decisionSop){
  try{session.engine?.onWorldActivity?.({nodeIds:['component:request-admission','knowledge:reader-admission-policy','component:library'],phase:'stage',operation:'app.reader.admission',label:'Evaluate reader admission policy',wires:decision.decisionSop});}catch{/* Observation cannot change admission. */}
 }
 const choice=proposal?.interpretation?.decision;
 if(choice)try{session.engine?.onWorldActivity?.({nodeIds:['component:library','execution:creation-policy'],phase:'stage',operation:'std.choice',label:'Compare grounded creation readings',
  text,wires:choice.input+'\n'+choice.sop});}catch{/* Trace subscribers cannot change interpretation. */}
 let candidate=decision.candidate,comparison=null;
 const eligible=decision.admitted,reason=decision.reason;
 const interpretations=proposal?.interpretation?.profile==='declared-creation/1'?proposal.candidates:providerCandidates;
 if(eligible && decision.mode==='uncalibrated-best-effort' && !contextProjection && interpretations.length>1 && interpretations.length<=16){
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
 const message='I could not identify an action to apply. Nothing changed.';
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
  if(result&&decision.uncertain&&result.statuses?.includes('supported')){
   const note=result.trace?.uncertainty?.length||result.trace?.interpretation?'':'I used the most likely reading; you can correct it or undo.';
   if(note){result.text+=' '+note;result.parts=[{text:result.text,translate:false}];}
  }
 }
 result??={text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,...(eligible?{reading:candidate}:{}),...(comparison?{readingComparison:comparison.sop}:{}),readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  admission:{mode:decision.mode??null,uncertain:decision.uncertain??false,alternatives:decision.alternatives??[],scoreDefinition:decision.scoreDefinition,score:decision.score,proposalEligible:decision.eligible,assessment:decision.assessment,decisionSop:decision.decisionSop??null},
  interpretation:proposal?.interpretation??null,unresolved:proposal?.failures??[],proposalCandidates:providerCandidates,rawReading:proposal?.raw?.requests??null,model:{provenance,coverage:proposal?.coverage??null,candidates:Array.isArray(proposal?.candidates)?proposal.candidates.length:0,eligible:!!eligible}}}};
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
 const policy=requestCompositionPolicy();
 try{session.engine?.onWorldActivity?.({nodeIds:['execution:composition-policy'],phase:'stage',label:'Read request scheduling policy',operation:'policy.request-composition',policy:structuredClone(policy)});}catch{/* Observation cannot change request scheduling. */}
 if(!policy.enabled||typeof provider?.proposeRequests!=='function')return routeReaderProposal(session,text,options);
 const before=structuredClone(session.isession.state),undoBefore=session.newEngineUndo??[],steps=[];
 for await(const proposal of provider.proposeRequests(text)){
  const result=await routeReaderProposal(session,text,options,proposal);
  if(!proposal.composition)return result;
  steps.push({source:proposal.composition,reply:result});
 }
 if(!steps.length)return routeReaderProposal(session,text,options);
 const area=options.view??session.isession.state['ui.shell']?.activeTab,changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
 const grouped=changed.length>0&&!steps.some(step=>step.reply.trace?.history&&step.reply.statuses.includes('supported'));
 if(grouped)session.newEngineUndo=[...undoBefore.slice(-31),{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:steps.at(-1).reply.trace?.reading,readings:steps.map(step=>step.reply.trace?.reading).filter(Boolean),alternatives:steps.flatMap(step=>step.reply.trace?.readerRouting?.admission?.alternatives??[])}];
 const supported=steps.filter(step=>step.reply.statuses?.includes('supported'));
 const mixed=supported.length>0&&supported.length<steps.length;
 const scalars=Array.from(text);
 const textReply=steps.map(({source,reply})=>{
  if(!mixed||reply.statuses.includes('supported'))return reply.text;
  const excerpt=JSON.stringify(scalars.slice(...source.range).join(''));
  if(reply.trace?.reason==='reading'||reply.trace?.reason==='no-declared-action')return 'I could not apply '+excerpt+'.';
  return 'For '+excerpt+': '+reply.text;
 }).join(' ');
 const last=steps.at(-1).reply;
 return {...last,state:changed.length?structuredClone(session.isession.state):last.state,text:textReply,parts:[{text:textReply,translate:false}],statuses:steps.flatMap(step=>step.reply.statuses??[]),effects:steps.flatMap(step=>step.reply.effects??[]),trace:{...last.trace,readerRouting:{...last.trace?.readerRouting,rawReading:steps.flatMap(step=>step.reply.trace?.readerRouting?.rawReading??[]),unresolved:steps.flatMap(step=>step.reply.trace?.readerRouting?.unresolved??[]),proposalCandidates:steps.flatMap(step=>[step.reply.trace?.reading,...(step.reply.trace?.readerRouting?.proposalCandidates??[])]).filter(Boolean)},partial:supported.length!==steps.length||steps.some(step=>step.reply.trace?.partial),composition:{policy,sourceCuts:steps[0].source.sourceCuts,steps:steps.map(step=>({source:step.source,statuses:step.reply.statuses,trace:step.reply.trace,text:step.reply.text})),supported:supported.length,total:steps.length,undoGroup:grouped?1:0}}};
}
