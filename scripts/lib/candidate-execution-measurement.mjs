// C1 only: detached native execution evidence. Never imported by the application route.
import {executeRequestCandidate} from '../../src/dialog/new-engine.mjs';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export const MEASUREMENT_FORMAT='psys2.candidate-execution-measurement/1';
/** No semantic correctness label is inferred from schema validity or a native receipt. */
export async function measureCandidateExecution({state,candidate,text,view,identity,expectation=null,maxBytes=4000000,maxNodes=100000}={}){
 const unknown={status:'unknown',correct:null,reason:'intent-and-effect-checker-unavailable'};
 let before,reading,declared,expected;
 try{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxNodes)||maxNodes<1||typeof text!=='string'||typeof view!=='string'||!view)throw Error('invalid-measurement-input');
  const input=copyHostData({state,candidate,text,view,identity,expectation},{maxBytes,maxNodes});
  if(!input.state||Array.isArray(input.state)||!input.candidate||Array.isArray(input.candidate)||!input.identity||Array.isArray(input.identity))throw Error('invalid-measurement-input');
  before=input.state;reading=input.candidate;declared=input.identity;expected=input.expectation;
 }catch(error){return {format:MEASUREMENT_FORMAT,status:'invalid',executed:false,error:String(error.message),intent:unknown};}
 const session={isession:{state:copyHostData(before,{maxBytes,maxNodes})},newEngineJournal:[]};
 let reply=null,error=null,after=null,journal=null,originalUnchanged=false,captureError=null;
 try{reply=await executeRequestCandidate(session,reading,text,{view,language:'en',invocation:globalThis.crypto.randomUUID()});}
 catch(failure){error={name:String(failure?.name??'Error'),message:String(failure?.message??failure)};}
 // Capture state even when the actual executor throws; do not replace it with its reply projection.
 try{after=copyHostData(session.isession.state,{maxBytes,maxNodes});journal=structuredClone(session.newEngineJournal);reply=structuredClone(reply);}
 catch(failure){captureError=String(failure?.message??failure);}
 try{originalUnchanged=JSON.stringify(copyHostData(state,{maxBytes,maxNodes}))===JSON.stringify(before);}catch{originalUnchanged=false;}
 return {format:MEASUREMENT_FORMAT,status:captureError||!originalUnchanged?'invalid':error?'executor-error':'observed',executed:true,
  identity:{declared,platform:'caller-host',scope:'detached native state; no browser/backend equivalence asserted'},
  input:{text,view,candidate:copyHostData(reading,{maxBytes,maxNodes}),expectation:expected},
  before,after,originalUnchanged,stateChanged:after===null?null:JSON.stringify(before)!==JSON.stringify(after),reply,
  receipt:structuredClone(reply?.trace?.journal?.receipt??reply?.trace?.receipt??reply?.trace?.historicalReceipt??null),journal,error,captureError,
  intent:unknown,admission:{eligible:false,reason:'C1-evidence-only'}};
}
