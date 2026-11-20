// Source-only neural cutter computation. Loading, calibration and admission are separate.
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=fc9d28ffde';
import {selectedProbability} from './model-selection-score.mjs?v=ac3ac10191';

export const CUTTER_CODEC=Object.freeze({
 format:'sop.request-cutter-codec/1',labels:Object.freeze(['O','B','I']),input:'source-only',
 unit:'unicode-scalar',transitionPolicy:'illegal-I-after-O-unresolved',spanEnd:'exclusive',
 truncation:'unresolved',specialAndPadding:'ignored'
});
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonicalCodec=x=>JSON.stringify(Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])));
const digest=async x=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
const scalar=x=>typeof x==='string'&&!Array.from(x).some(c=>{const n=c.codePointAt(0);return n>=0xd800&&n<=0xdfff;});
function row(tensor,limit,tick){
 if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length!==2||tensor.dims[0]!==1||!Number.isSafeInteger(tensor.dims[1])||tensor.dims[1]<1||tensor.dims[1]>limit||tensor.data?.length!==tensor.dims[1])throw Error('invalid-tokenizer-tensor');
 const result=[];for(const value of tensor.data){tick();const number=Number(value);if(!['number','bigint'].includes(typeof value)||!Number.isSafeInteger(number)||number<0)throw Error('invalid-tokenizer-value');result.push(number);}return result;
}
function padding(mask){
 let zeros=false,active=0;
 for(const n of mask){if(n!==0&&n!==1)throw Error('invalid-attention-mask');if(n===0)zeros=true;else{if(zeros)throw Error('non-right-padding');active++;}}
 if(active<2)throw Error('missing-single-template-specials');
 return active;
}
function checkAuthority(input,text,ids,mask,active,manifest,tick){
 if(!object(input))throw Error('exact-source-offsets-unavailable');
 const a=copyHostData(input),chars=Array.from(text),length=ids.length;
 if(a.unit!=='unicode-scalar'||!same(a.tokenIds,ids)||!same(a.attentionMask,mask)||!object(a.provenance)||a.provenance.tokenizerSha256!==manifest.tokenizerSha256||!hash(a.provenance.profileSha256)||typeof a.provenance.id!=='string'||!a.provenance.id||!Number.isSafeInteger(a.provenance.version)||a.provenance.version<1||!['sequenceIds','specialTokensMask','offsets'].every(k=>Array.isArray(a[k])&&a[k].length===length))throw Error('exact-source-offsets-unavailable');
 let previous=0;
 for(let i=0;i<length;i++){
  tick();const seq=a.sequenceIds[i],special=a.specialTokensMask[i],range=a.offsets[i];
  if(special!==0&&special!==1)throw Error('invalid-special-token-authority');
  if(i>=active){if(seq!==null||range!==null)throw Error('padding-has-source-evidence');continue;}
  if(i===0||i===active-1){if(seq!==null||special!==1||range!==null)throw Error('invalid-single-template-authority');continue;}
  if(seq!==0||special!==0)throw Error('nonsource-token-in-single-template');
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<previous||range[0]<0||range[0]>=range[1]||range[1]>chars.length)throw Error('invalid-source-offset');
  previous=range[1];
 }
 return a;
}
function bioValues(output,length,tick){
 const value=output?.bio_logits;
 if(!value||!same(value.dims,[1,length,3])||value.data?.length!==length*3)throw Error('invalid-cutter-output-shape');
 const result=[];for(const n of value.data){tick();if(typeof n!=='number'||!Number.isFinite(n))throw Error('nonfinite-cutter-logit');result.push(n);}return result;
}
function choose(values){
 let best=-Infinity,label=null,ties=0;
 for(let i=0;i<3;i++){if(values[i]>best){best=values[i];label=i;ties=1;}else if(values[i]===best)ties++;}
 return ties===1?label:null;
}

/** Inject actual tokenizer/model calls and verified single-template offset authority.
 * Construction performs no model/file I/O. Fixture artifacts always remain incomplete. */
export async function createCutterInference({manifest,tokenizer,model,offsetAuthority,recordDiagnostics,
 maxText=16384,budget=1000000}={}){
 const m=copyHostData(manifest);
 if(m?.format!=='sop.key-reader-runtime/1'||!['trained-unverified','fixture'].includes(m.artifactRole)||m.dtype!=='fp32'||!['fp32','q8-dynamic'].includes(m.weightRepresentation)||m.executionEligible!==false||m.graphConfidence!==null||typeof m.cutterConfigJSON!=='string'||new TextEncoder().encode(m.cutterConfigJSON).length>4000000||!['cutterConfigSha256','cutterSha256','cutterCheckpointSha256','cutterTrainerSha256','cutterCodecSha256','tokenizerSha256'].every(k=>hash(m[k]))||![tokenizer,model,offsetAuthority,recordDiagnostics].every(f=>typeof f==='function')||!Number.isSafeInteger(maxText)||maxText<1||maxText>16384||!Number.isSafeInteger(budget)||budget<1)throw Error('invalid-cutter-runtime-profile');
 if(await digest(m.cutterConfigJSON)!==m.cutterConfigSha256)throw Error('cutter-config-hash-mismatch');
 const config=copyHostData(JSON.parse(m.cutterConfigJSON));
 const inputPadding=config.inputPadding??'max_length';
 if(!['max_length','dynamic'].includes(inputPadding)||!Number.isSafeInteger(config.maxLength)||config.maxLength<2||config.maxLength>4096)throw Error('invalid-cutter-input-layout');
 if(config.format!=='sop.request-cutter-model/1'||m.artifactRole==='trained-unverified'&&config.artifactRole!=='trained'||config.executionEligible!==false||config.graphConfidence!==null||config.trainerSha256!==m.cutterTrainerSha256||config.codecSha256!==m.cutterCodecSha256||config.encoderFiles?.['tokenizer.json']!==m.tokenizerSha256||!object(config.codec)||canonicalCodec(config.codec)!==canonicalCodec(CUTTER_CODEC)||await digest(canonicalCodec(config.codec))!==m.cutterCodecSha256)throw Error('incompatible-frozen-cutter-config');
 const composite=await digest(JSON.stringify({
  format:'sop.request-cutter-computation/1',config:m.cutterConfigSha256,checkpoint:m.cutterCheckpointSha256,
  graph:m.cutterSha256,tokenizer:m.tokenizerSha256,trainer:m.cutterTrainerSha256,codec:m.cutterCodecSha256,
  dtype:m.dtype,weightRepresentation:m.weightRepresentation
 }));
 const identity={sha256:composite,tokenizerSha256:m.tokenizerSha256,codecSha256:m.cutterCodecSha256,decoderVersion:1};
 const provenance={format:'sop.request-cutter-computation/1',artifactRole:m.artifactRole,model:identity,
  configSha256:m.cutterConfigSha256,checkpointSha256:m.cutterCheckpointSha256,graphSha256:m.cutterSha256,
  tokenizerSha256:m.tokenizerSha256,trainerSha256:m.cutterTrainerSha256,codecSha256:m.cutterCodecSha256,
  dtype:m.dtype,weightRepresentation:m.weightRepresentation,calibration:null,executionEligible:false};
 const cutLogits=new Map();
 async function infer(text){
  let steps=0;const tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('cutter-runtime-budget');};
  const packet={source:{text:typeof text==='string'?text:'',unit:'unicode-scalar'},spans:[],
   coverage:{complete:false,truncated:false},unresolved:[],model:copyHostData(identity)};
  const auxiliary={sourceDecisions:[],minimumProbability:null};let offsetProvenance=null;
  try{
   if(!scalar(text))throw Error('invalid-source-scalar');const chars=Array.from(text);tick(chars.length);
   if(chars.length>maxText)throw Error('source-size');
   // Omitting text_pair is essential: paired empty context adds another SEP.
   const full=await tokenizer([text],{padding:false,truncation:false});
   const encoded=await tokenizer([text],{padding:inputPadding==='dynamic'?false:'max_length',truncation:true,max_length:config.maxLength});
   const ids=row(encoded.input_ids,config.maxLength,tick),mask=row(encoded.attention_mask,config.maxLength,tick),
    fullIds=row(full.input_ids,maxText*2+8,tick),fullMask=row(full.attention_mask,maxText*2+8,tick);
   if((inputPadding==='max_length'&&ids.length!==config.maxLength)||mask.length!==ids.length||fullIds.length!==fullMask.length||fullMask.some(n=>n!==1))throw Error('invalid-cutter-tokenizer-shape');
   const active=padding(mask);
   packet.coverage.truncated=fullIds.length>active;
   if(packet.coverage.truncated)throw Error('source-truncated');
   if(fullIds.length!==active)throw Error('invalid-full-token-coverage');
   if(!same(ids.slice(0,active),fullIds))throw Error('full-vs-padded-token-mismatch');
   const authority=checkAuthority(await offsetAuthority({text,tokenIds:ids,attentionMask:mask,
    fullTokenIds:fullIds,fullAttentionMask:fullMask,maxLength:config.maxLength}),text,ids,mask,active,m,tick);
   offsetProvenance=authority.provenance;
   // The cut depends on the text alone: a repeated text (a background probe, then the same text sent) reuses the validated logits.
   let logits=cutLogits.get(text);
   if(logits)tick(logits.length);
   else{logits=bioValues(await model({input_ids:encoded.input_ids,attention_mask:encoded.attention_mask}),ids.length,tick);cutLogits.set(text,logits);if(cutLogits.size>8)cutLogits.delete(cutLogits.keys().next().value);}
   let current=null;
   for(let i=1;i<active-1;i++){
    tick();const values=logits.slice(i*3,i*3+3),label=choose(values),range=authority.offsets[i];
    auxiliary.sourceDecisions.push({token:i,range:[...range],label,logits:values});
    if(label===null)throw Error('unknown-BIO-label');
    const probability=selectedProbability(values,label);auxiliary.minimumProbability=Math.min(auxiliary.minimumProbability??1,probability);
    if(label===2&&current===null)throw Error('illegal-I-after-O');
    if(label!==2&&current!==null){packet.spans.push(current);current=null;}
    if(label===1)current=[...range];else if(label===2)current[1]=range[1];
   }
   if(current!==null)packet.spans.push(current);
   if(m.artifactRole==='fixture')packet.unresolved.push({reason:'fixture-model-untrained'});
   packet.coverage.complete=packet.unresolved.length===0;
  }catch(error){packet.spans=[];packet.coverage.complete=false;packet.unresolved.push({reason:String(error?.message??'cutter-inference-failed')});}
  return {packet,auxiliary,offsetProvenance,provenance:copyHostData(provenance),graphConfidence:null,steps};
 }
 return {provenance:()=>copyHostData(provenance),infer,async cut(text){
  const result=await infer(text),packet=copyHostData(result.packet);await recordDiagnostics(result);return packet;
 }};
}
