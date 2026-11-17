// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {executeRequestCandidate} from './new-engine.mjs';
import {invokeNativeControl} from './native-tool-controls.mjs';
import {executeDeclaredRequest} from './declared-execution.mjs';
import {projectContextAction} from './project-context-action.mjs';
import {projectCreateAction} from './project-create-action.mjs';
import {parse,str} from '../vendor/sopworld/sopworld.mjs';
import {assessReaderProposal} from './reader-admission.mjs';
const unavailable=reason=>({candidates:[],coverage:{complete:false,executable:false,graphProposal:false},failures:[{reason}]});
/** The model only sees utterance text. No expected annotations or grammar graphs. */
export async function routeNewEngine(session,text,options={}){
 const provider=session.engine?.requestReader;
 let proposal,provenance=null;
 if(typeof text!=='string'||!text.trim()||text.length>65536||(options.language&&options.language!=='en'))proposal=unavailable('invalid-reader-input');
 else if(!provider||typeof provider.propose!=='function')proposal=unavailable('model-provider-unavailable');
 else{
  try{provenance=typeof provider.provenance==='function'?provider.provenance():null;proposal=await provider.propose(text);}
  catch{proposal=unavailable('model-proposal-failed');}
 }
 const context={area:options.view??session.isession.state['ui.shell']?.activeTab};
 let contextProjection=null,bindings=null,registry=null;
 try{bindings=provider?.bindings?.();registry=provider?.registry?.();contextProjection=await projectContextAction(proposal,session,{bindings,registry,view:context.area});if(contextProjection)proposal=contextProjection.proposal;else{const creation=await projectCreateAction(proposal,session,{bindings,registry,view:context.area});if(creation)proposal=creation;}}catch{}
 const decision=assessReaderProposal({proposal,text,provenance,admission:session.engine?.requestReaderAdmission,area:context.area});
 const candidate=decision.candidate,eligible=decision.admitted,reason=decision.reason;
 // No grammar fallback exists in the application. Unavailable or unapproved
 // structural models yield an explicit no-effect answer.
 const message='I could not identify an action to apply. Nothing changed.';
 let result;
 if(eligible){
  const act=str(parse(candidate.wires).find(w=>w.id===candidate.request)?.attrs.act?.[0]),area=context.area;
  if(act==='undo'||act==='redo'){
   const history=await invokeNativeControl(session,{view:area,operation:act});
   result={text:history.message,parts:[{text:history.message,translate:false}],statuses:[history.ok?'supported':'unsupported'],answers:[],segments:[],state:history.ok?structuredClone(session.isession.state):{},effects:history.ok?[{operation:act}]:[],trace:{legacy:false,engine:'new',assessment:history.ok?act:'history-refused'}};
  }else{
   const before=structuredClone(session.isession.state);
   if(contextProjection){if(contextProjection.rewind)Object.assign(session.isession.state,structuredClone(contextProjection.rewind));session.newEngineFocus={...session.newEngineFocus,[area]:contextProjection.focus};}
   result=await executeDeclaredRequest(session,candidate,text,{bindings,view:area,unapplied:proposal.interpretation?.unapplied??[]})??executeRequestCandidate(session,candidate,text,options);
   if(!result.statuses?.includes('supported')&&contextProjection?.rewind)session.isession.state=before;
   if(result.statuses?.includes('supported')){session.newEngineLastAction={...session.newEngineLastAction,[area]:candidate};if(contextProjection){result.text+=' '+proposal.interpretation.note;result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation:proposal.interpretation};}}
   const changed=Object.keys(session.isession.state).filter(key=>JSON.stringify(before[key])!==JSON.stringify(session.isession.state[key]));
   if(changed.length)session.newEngineUndo=[...(session.newEngineUndo??[]).slice(-31),{area,before:Object.fromEntries(changed.map(key=>[key,before[key]])),after:Object.fromEntries(changed.map(key=>[key,structuredClone(session.isession.state[key])])),reading:candidate,alternatives:decision.alternatives}];
  }
  if(result?.statuses?.includes('supported')&&proposal.interpretation?.profile==='declared-creation/1'&&proposal.interpretation.note){result.text+=' '+proposal.interpretation.note;result.parts=[{text:result.text,translate:false}];result.trace={...result.trace,interpretation:proposal.interpretation};}
  if(result&&decision.uncertain&&result.statuses?.includes('supported')){
   const note=result.trace?.uncertainty?.length||result.trace?.interpretation?'':'I used the most likely reading; you can correct it or undo.';
   if(note){result.text+=' '+note;result.parts=[{text:result.text,translate:false}];}
  }
 }
 result??={text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  admission:{mode:decision.mode??null,uncertain:decision.uncertain??false,alternatives:decision.alternatives??[],scoreDefinition:decision.scoreDefinition,score:decision.score,proposalEligible:decision.eligible,assessment:decision.assessment},
  interpretation:proposal?.interpretation??null,unresolved:proposal?.failures??[],rawReading:proposal?.raw?.requests??null,model:{provenance,coverage:proposal?.coverage??null,candidates:Array.isArray(proposal?.candidates)?proposal.candidates.length:0,eligible:!!eligible}}}};
}
