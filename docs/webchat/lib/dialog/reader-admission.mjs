// One versioned eligibility/score protocol shared by C1 measurement and C2 routing.
// The score selects the entire complete/unique cohort; it is not confidence.
import {prepareRequestBatch,parse,str,assessSelectiveCalibration} from '../vendor/sopworld/sopworld.mjs?v=327fb3cf41';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=7abe128286';
import {MODEL_SELECTION_SCORE} from './model-selection-score.mjs?v=ac3ac10191';
import {READER_POLICY,destructiveRequest} from './reader-policy.mjs?v=8e0e20b854';
export const READER_SCORE_DEFINITION=MODEL_SELECTION_SCORE;
export const READER_RUNTIME_IDENTITY_FIELDS=Object.freeze(['appBuildSha256','readerSha256','pipelineSha256','packetAdapterSha256','graphDecoderSha256','bindingsSha256','executorSha256','backendSha256','contextSerializationSha256']);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function scoreReaderProposal(proposal,text){
 const refused=reason=>({eligible:false,score:0,candidate:null,reason,scoreDefinition:READER_SCORE_DEFINITION});
 try{
  const p=copyHostData(proposal,{maxBytes:4000000});
  if(p?.coverage?.complete!==true||p?.coverage?.graphProposal!==true)return refused(p?.failures?.[0]?.reason??'incomplete-model-proposal');
  if(!Array.isArray(p.candidates)||!p.candidates.length||p.candidates.length>32)return refused('invalid-model-candidates');
  if(!Array.isArray(p.failures)||p.failures.length||p.coverage.truncated===true||(p.unresolved!==undefined&&(!Array.isArray(p.unresolved)||p.unresolved.length)))return refused('model-proposal-diagnostics');
  const candidate=p.candidates[0];
  if(typeof text!=='string'||typeof candidate?.wires!=='string'||candidate.wires.length>65536)return refused('invalid-model-graph');
  const checked=prepareRequestBatch({entries:[{id:'proposal',request:candidate.request,wires:candidate.wires,after:[]}]});
  if(!checked.ok)return refused('invalid-model-graph');
  const sources=parse(candidate.wires).filter(w=>w.type==='std.request.source');
  if(sources.length!==1||sources[0].attrs.text?.length!==1||str(sources[0].attrs.text[0])!==text)return refused('model-source-mismatch');
  const score=p.selectionScore?.definition===READER_SCORE_DEFINITION&&Number.isFinite(p.selectionScore.value)&&p.selectionScore.value>=0&&p.selectionScore.value<=1?p.selectionScore.value:null;
  return {eligible:true,score:score??0,scoreAvailable:score!==null,candidate,alternatives:p.candidates,uncertain:p.candidates.length>1,destructive:destructiveRequest(candidate,parse,str),reason:'complete-unique-proposal',scoreDefinition:READER_SCORE_DEFINITION};
 }catch{return refused('invalid-model-proposal');}
}
/** runtimeIdentity is loader-verified host configuration, never model authority.
 * C1 must retain reports under this exact identity and runtime-derived area scope. */
export function readerCalibrationIdentity(provenance,runtimeIdentity){
 const p=copyHostData(provenance),r=copyHostData(runtimeIdentity);
 if(!p||!hash(p.modelSha256)||!Number.isSafeInteger(p.decoderVersion)||p.decoderVersion<1||!r||Object.keys(r).length!==READER_RUNTIME_IDENTITY_FIELDS.length||!READER_RUNTIME_IDENTITY_FIELDS.every(k=>hash(r[k])))throw Error('incomplete-runtime-identity');
 if(p.bindingsSha256!==undefined&&p.bindingsSha256!==r.bindingsSha256)throw Error('binding-identity-mismatch');
 return {provider:p,runtime:r,scoreDefinition:READER_SCORE_DEFINITION};
}
export function readerCalibrationScope(area){if(typeof area!=='string'||!area)throw Error('invalid-runtime-area');return JSON.stringify({protocol:'psys2.reader-area/1',area});}
export function assessReaderProposal({proposal,text,provenance,admission,area}){
 const scored=scoreReaderProposal(proposal,text);
 if(!scored.eligible)return {...scored,admitted:false,assessment:null};
 const limit=scored.destructive?READER_POLICY.destructiveMaxErrorRate:READER_POLICY.maxErrorRate;
 let assessment=null;
 try{
  if(!admission||typeof area!=='string'||!area||typeof admission.reference?.owner!=='string'||typeof admission.reference?.revision!=='string')throw Error('missing-calibration');
  const identity=readerCalibrationIdentity(provenance,admission.runtimeIdentity);
  assessment=assessSelectiveCalibration(admission.world,admission.reference,{identity,scope:readerCalibrationScope(area),score:scored.score,eligible:scored.eligible});
  const admitted=assessment.admitted===true&&assessment.policy?.maxErrorRate<=limit;
  if(admitted)return {...scored,admitted:true,assessment,uncertain:scored.uncertain,mode:'calibrated',reason:'approved-model-proposal'};
 }catch(error){assessment={admitted:false,reason:String(error?.message??'invalid-calibration')};}
 // The owner explicitly accepts reversible best-effort actions before a cohort is calibrated.
 // This is not an empirical error-rate claim. Destructive actions retain their stricter admission.
 const bestEffort=READER_POLICY.uncalibratedAction==='reversible-best-effort'&&!admission&&!scored.destructive&&scored.scoreAvailable&&hash(provenance?.modelSha256);
 return {...scored,admitted:bestEffort,assessment,uncertain:bestEffort,mode:bestEffort?'uncalibrated-best-effort':'closed',
  reason:bestEffort?'best-effort-model-proposal':'model-calibration-gate-closed'};
}
