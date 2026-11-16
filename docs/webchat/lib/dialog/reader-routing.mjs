// Model-first proposal routing. Calibration authority belongs to host configuration,
// never to a model output, evaluation annotation or grammar proposal.
import {executeRequestCandidate} from './new-engine.mjs?v=528e2a511e';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const unavailable=reason=>({candidates:[],coverage:{complete:false,executable:false,graphProposal:false},failures:[{reason}]});
function approved(gate,provenance,candidate,context){
 if(!gate||gate.status!=='approved'||gate.wrong!==0||gate.better!==true||!Number.isSafeInteger(gate.compared)||gate.compared<1
  ||!hash(gate.reportSha256)||!hash(gate.modelSha256)||gate.modelSha256!==provenance?.modelSha256
  ||gate.decoderVersion!==provenance?.decoderVersion||typeof gate.accepts!=='function')return false;
 try{return gate.accepts(candidate,context)===true;}catch{return false;}
}
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
 const candidate=proposal?.candidates?.length===1?proposal.candidates[0]:null;
 const complete=proposal?.coverage?.complete===true&&proposal?.coverage?.executable===true&&proposal?.coverage?.graphProposal===true;
 const context={area:options.view??session.isession.state['ui.shell']?.activeTab};
 const eligible=complete&&candidate&&approved(session.engine?.requestReaderGate,provenance,candidate,context);
 const reason=eligible?'approved-model-proposal':!complete?(proposal?.failures?.[0]?.reason??'incomplete-model-proposal'):!candidate?'ambiguous-model-proposal':'model-calibration-gate-closed';
 // No grammar fallback exists in the application. Unavailable or unapproved
 // structural models yield an explicit no-effect answer.
 const message='I could not understand this request with SOP-BERT. A complete, approved request graph is not available. Nothing changed.';
 const result=eligible?executeRequestCandidate(session,candidate,text,options):{text:message,parts:[{text:message,translate:false}],statuses:['unsupported'],answers:[],segments:[],state:{},effects:[],newEngine:true,trace:{legacy:false,engine:'new',reason:options.language&&options.language!=='en'?'language':'reading'}};
 return {...result,trace:{...result.trace,readerRouting:{primary:'sop-bert',selected:eligible?'sop-bert':null,reason,
  model:{provenance,coverage:proposal?.coverage??null,candidates:Array.isArray(proposal?.candidates)?proposal.candidates.length:0,eligible:!!eligible}}}};
}
