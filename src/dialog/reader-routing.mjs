// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {executeRequestCandidate} from './new-engine.mjs';
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
 const decision=assessReaderProposal({proposal,text,provenance,admission:session.engine?.requestReaderAdmission,area:context.area});
 const candidate=decision.candidate,eligible=decision.admitted,reason=decision.reason;
 // No grammar fallback exists in the application. Unavailable or unapproved
 // structural models yield an explicit no-effect answer.
 const message='I could not understand this request with SOP-BERT. A complete, approved request graph is not available. Nothing changed.';
 const result=eligible?executeRequestCandidate(session,candidate,text,options):{text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  admission:{scoreDefinition:decision.scoreDefinition,score:decision.score,proposalEligible:decision.eligible,assessment:decision.assessment},
  model:{provenance,coverage:proposal?.coverage??null,candidates:Array.isArray(proposal?.candidates)?proposal.candidates.length:0,eligible:!!eligible}}}};
}
