import {isScopedRemoval} from './capability-plan-execution.mjs';
import {projectRemovalAction} from './project-removal-action.mjs';
import { captureHistory, recordHistory, restoreHistory } from './history-journal.mjs';
import {projectReaderHeadAlternative} from './reader-head-alternative.mjs';
import {parse} from '../vendor/sopworld/sopworld.mjs';
import {writeReaderSource} from './reader-source.mjs';
import {isAuthoredRequest,readAuthoredRequest} from './authored-request-tool.mjs';
// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {requestCompositionPolicy,scheduleFollowingCut}from './request-composition-policy.mjs';
import {executeDeclaredRequest,compareDeclaredReadings} from './declared-execution.mjs';
import {projectQueryAction,recoverQueryProjection} from './project-query-action.mjs';
import {projectContextAction} from './project-context-action.mjs';
import {projectCodeReference} from './project-code-reference.mjs';
import {projectCreateAction} from './project-create-action.mjs';
import {assessReaderProposal} from './reader-admission.mjs';
import {projectQuantities,amountsOf,quantityNote} from './quantity-projection.mjs';
import {routeCoordination} from './coordination-routing.mjs';
import {declaredKnowledge} from './declared-execution.mjs';
import {interpretationPolicy,coordinationEligible,comparisonBounds,retryNote} from './interpretation-policy.mjs';
let amounts;
// The named amounts of the execution knowledge (k.expect.amount), read once.
const knownAmounts=()=>amounts??=amountsOf(declaredKnowledge('k.expect.amount'));
const unavailable=reason=>({candidates:[],coverage:{complete:false,executable:false,graphProposal:false},failures:[{reason}]});
const noDeclaredAction = () => {
 const text='I could not identify an action to apply. Nothing changed.';
 return {text,parts:[{text,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],
  trace:{legacy:false,engine:'new',reason:'no-declared-action'}};
};
// World-activity events never change a reading; a failing subscriber is ignored.
const observe=(session,event)=>{try{session.engine?.onWorldActivity?.(event);}catch{/* Observation cannot change the reading. */}};
// The source ranges a reading anchored: every span it emitted, and the several mentions it saw for
// one key it could not hold ("draw a cat and 2 dogs": "cat" and "dogs" for the one target kind).
function readMentions(read){
 const out=[];
 for(const {path,range} of read?.raw?.ranges??[])if(path?.at(-1)!=='span'&&Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger))out.push({range,trigger:path?.at(-1)==='trigger'});
 for(const range of severalMentions(read))out.push({range,trigger:false});
 return out;
}
function severalMentions(read){
 return (read?.failures??[]).flatMap(failure=>failure.detail?.reason==='ambiguous-global-mention'&&Array.isArray(failure.detail.head?.ranges)?
  failure.detail.head.ranges.filter(range=>Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)):[]);
}
const overlaps=(a,b)=>a[0]<b[1]&&b[0]<a[1];
// What other readings of the same text saw that the used reading leaves out: those mentions were
// read and not applied, and the reply says so instead of dropping them silently.
function droppedMentions(text,used,others){
 const kept=readMentions(used).map(mention=>mention.range),scalars=Array.from(text),out=new Map();
 for(const read of others)for(const {range,trigger} of readMentions(read)){
  if(trigger||kept.some(own=>overlaps(own,range))||[...out.values()].some(seen=>overlaps(seen.range,range)))continue;
  const mention=scalars.slice(...range).join('').trim();
  if(mention)out.set(range.join(':'),{range,text:mention});
 }
 return [...out.values()].sort((a,b)=>a.range[0]-b.range[0]).map(mention=>mention.text);
}
const quoted=list=>list.map(item=>JSON.stringify(item)).join(list.length===2?' and ':', ');
const asksQuestion=read=>(read?.raw?.requests??[]).some(request=>request.mood==='ask'||request.act==='answer');
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
 const context={area:options.view??session.isession.state['ui.shell']?.activeTab};
 let contextProjection=null,bindings=null,registry=null;
 try{bindings=provider?.bindings?.();registry=provider?.registry?.();}catch{/* Missing bindings leave the model observations unprojected. */}
 const projectionOptions={bindings,registry,view:context.area},projectionErrors=[];
 const project=async(read)=>{
  try{
   const coded=await projectCodeReference(read,session,projectionOptions);
   if(coded)return {proposal:coded.proposal,contextProjection:coded};
   const contextual=await projectContextAction(read,session,projectionOptions);
   if(contextual)return {proposal:contextual.proposal,contextProjection:contextual};
   const query=await projectQueryAction(read,session,projectionOptions);
   if(query)return {proposal:await recoverQueryProjection(query,session,{...projectionOptions,provider}),contextProjection:null};
   const created=await projectCreateAction(read,session,projectionOptions)??read;
   const counted=projectQuantities(created,{amounts:knownAmounts(),bindings,view:context.area});
   // An implicit count or a kind read by its singular is a projection of the reading: it lights the map and is traced.
   if(counted!==created)observe(session,{nodeIds:['component:reader'],phase:'stage',operation:'app.reader.quantity',label:'Read implicit counts and plural kinds',text,
    quantities:(counted.candidates??[]).map(candidate=>candidate.quantities).filter(Boolean)});
   return {proposal:counted,contextProjection:null};
  }catch(error){
   // A failed projection preserves the available model observations; the failure is traced, not hidden.
   const projectionError=String(error?.message??error);
   projectionErrors.push(projectionError);
   observe(session,{nodeIds:['component:reader'],phase:'error',operation:'app.reader.projection',label:'Project the reading onto the editor',text,error:projectionError});
   return {proposal:read,contextProjection:null};
  }
 };
 // A make reading that saw several kinds for its one target, or left a list after its kind unread, is a
 // coordination of noun phrases: each is read and made, together (coordination-routing.mjs), before any re-reading
 // drops one of them.
 // Which readings go there first is declared (interpretation-policy.sop app.interpret.coordination).
 let coordinationError=null;
 const coordinationRule=coordinationEligible(proposal);
 if(coordinationRule){
  const grouped=await routeCoordination(session,text,proposal,{provider,project,bindings,view:context.area,
   admit:(read,partText)=>assessReaderProposal({proposal:read,text:partText,provenance,admission:session.engine?.requestReaderAdmission,area:context.area}),
   dispatch:candidate=>dispatchRequest(session,candidate,text,options,bindings)}).catch(error=>{
    coordinationError=String(error?.message??error);
    observe(session,{nodeIds:['component:reader'],phase:'error',operation:'app.reader.coordination',label:'Read the request as a coordination',text,rule:coordinationRule.id,error:coordinationError});
    return null;
   });
  if(grouped)return grouped;
 }
 let projected=await project(proposal),contextRetry=null;
 // The previous utterance and the observed objects are priors for the reader. While the reading
 // conditioned on them stays incomplete, the declared re-readings (interpretation-policy.sop
 // app.interpret.retry, in their order) are the next hypotheses; the first complete one is routed
 // and every attempt, also an unavailable or failed one, stays in the trace and lights the map.
 const readings=[];
 for(const {profile,method,label,when} of interpretationPolicy().retries){
  if(when==='incomplete'&&projected.proposal.coverage?.complete)break;
  if(typeof provider?.[method]!=='function'){((contextRetry??={attempts:[]}).unavailable??=[]).push({profile,reason:'provider-has-no-'+method});break;}
  let alternate=null,failure=null;
  try{alternate=await provider[method](writeReaderSource(text));}catch(error){failure=String(error?.message??error);}
  observe(session,{nodeIds:['component:reader'],phase:alternate?'stage':'end',operation:'app.reader.retry',label,text,profile,available:!!alternate,...(failure?{error:failure}:{})});
  if(!alternate){((contextRetry??={attempts:[]}).unavailable??=[]).push({profile,reason:failure?'failed':'no-reading',...(failure?{error:failure}:{})});continue;}
  const retried=await project(alternate),complete=!!retried.proposal.coverage?.complete;
  // A question read without part of what the first reading saw ("who is eyes a cat?" read as "how
  // many cats") is a different question: it is not answered. A request keeps its applied part and
  // the reply names what it left out.
  const dropped=complete?droppedMentions(text,alternate,[proposal,...readings]):[];
  const used=complete&&!(dropped.length&&asksQuestion(alternate));
  readings.push(alternate);
  (contextRetry??={attempts:[]}).attempts.push({profile,used,rawReading:alternate.raw?.requests??null,failures:alternate.failures??[],...(dropped.length?{dropped}:{})});
  if(complete&&!used)(contextRetry.unanswered??=[]).push(...dropped.filter(mention=>!contextRetry.unanswered.includes(mention)));
  if(used){
   contextRetry.used=profile;contextRetry.primary={rawReading:proposal?.raw?.requests??null,failures:proposal?.failures??[]};
   if(dropped.length)contextRetry.dropped=dropped;
   proposal=alternate;projected=retried;
   observe(session,{nodeIds:['component:reader'],phase:'end',operation:'app.reader.retry',label,text,profile,used:true});
  }
 }
 const providerCoverage=proposal?.coverage;
 const providerCandidates=Array.isArray(proposal?.candidates)?structuredClone(proposal.candidates):[];
 ({proposal,contextProjection}=projected);
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
 // Comparison bounds per admission mode are declared (interpretation-policy.sop app.interpret.compare).
 const bounds=comparisonBounds(decision.mode);
 if(eligible && bounds && !contextProjection && !removalComparison && interpretations.length>=bounds.min && interpretations.length<=bounds.max){
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
 const scalars=Array.from(typeof text==='string'?text:''),unreadQuestion=[...new Set(readMentions(proposal).filter(mention=>!mention.trigger).map(({range})=>scalars.slice(...range).join('').trim()).filter(Boolean))],unknownKind=(proposal?.raw?.requests?.length===1&&proposal.raw.requests[0].act==='make'&&proposal.raw.requests[0].target?.mode==='new'&&
  proposal.failures?.some(failure=>failure.reason==='unresolved-canonical-kind-binding'))?proposal.raw.requests[0].target.kind_span:undefined,several=[...new Set(severalMentions(proposal).map(range=>scalars.slice(...range).join('').trim()).filter(Boolean))];
 const message=limitations.includes('filter-span-missing')?'I could not ground a filter in the question. I have no complete answer.':
  limitations.includes('target-span-missing')?'I could not ground the kind of object the question refers to. I have no complete answer.':
  contextRetry?.unanswered?.length?'I did not understand '+quoted(contextRetry.unanswered)+' in this question, so I have no answer.':
  asksQuestion(proposal)&&unreadQuestion.length?'I did not understand '+quoted(unreadQuestion)+' in this question, so I have no answer.':
  unknownKind?'I could not find a kind of object to make for '+JSON.stringify(unknownKind)+'. Nothing changed.':
  several.length>1?'I read '+quoted(several)+' as separate things in one request and cannot apply them together yet, so nothing changed. You can ask for them one at a time.':
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
  const quantity=quantityNote(candidate);
  if(candidate?.quantities&&result)result.trace={...result.trace,quantities:candidate.quantities};
  if(quantity&&result?.statuses?.includes('supported')){result.text+=' '+quantity;result.parts=[{text:result.text,translate:false}];}
  if(result&&decision.uncertain&&result.statuses?.includes('supported')){
   const note=result.trace?.uncertainty?.length||result.trace?.interpretation?'':'I used the most likely reading; you can correct it or undo.';
   if(note){result.text+=' '+note;result.parts=[{text:result.text,translate:false}];}
  }
 }
 if(result&&contextRetry?.used&&result.statuses?.includes('supported')){
  if(contextRetry.dropped?.length)result.text+=' I did not apply '+quoted(contextRetry.dropped)+'.';
  const note=retryNote(contextRetry.used,new Set(contextRetry.attempts.map(attempt=>attempt.profile)));
  if(note)result.text+=' '+note;result.parts=[{text:result.text,translate:false}];
 }
 result??={text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,...(eligible?{reading:candidate}:{}),...(comparison?{readingComparison:comparison.sop}:{}),readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  admission:{mode:decision.mode??null,uncertain:!!provenAlternative||(decision.uncertain??false),alternatives:decision.alternatives??[],scoreDefinition:decision.scoreDefinition,score:decision.score,proposalEligible:decision.eligible,assessment:decision.assessment,decisionSop:decision.decisionSop??null},
  interpretation:proposal?.interpretation??null,unresolved:preservedProviderTrace?proposal.interpretation.unresolved:(proposal?.failures??[]),...(contextRetry?{contextRetry}:{}),...(projectionErrors.length?{projectionErrors}:{}),...(coordinationError?{coordinationError}:{}),proposalCandidates:providerCandidates,rawReading:proposal?.raw?.requests??null,model:{provenance,coverage:(preservedProviderTrace?providerCoverage:proposal?.coverage)??null,candidates:preservedProviderTrace?providerCandidates.length:(proposal?.candidates?.length??0),eligible:!!eligible}}}};
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
