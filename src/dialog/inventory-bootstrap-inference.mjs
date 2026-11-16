// SPDX-License-Identifier: AGPL-3.0-only
// Auxiliary learned field scorer. The caller supplies field instances and symbols;
// this model has no head for request count, target identity or graph topology.
export const INVENTORY_BOOTSTRAP_DECODER_VERSION = 1;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=4096;
function tensor(value,dims){
 if(!value||!Array.isArray(value.dims)||value.dims.length!==dims.length||value.dims.some((n,i)=>n!==dims[i])||!value.data||value.data.length!==dims.reduce((a,b)=>a*b,1))throw Error('invalid-model-output');
 const data=Array.from(value.data);if(data.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error('invalid-model-output');return data;
}
/** Inject Transformers.js AutoTokenizer and AutoModel callables. No package import,
 * router switch or graph reconstruction is hidden in this browser-safe adapter. */
export function createInventoryBootstrapInference({tokenizer,model,manifest,maxCandidates=64,maxText=16384}={}){
 if(typeof tokenizer!=='function'||typeof model!=='function'||!plain(manifest)||manifest.format!=='sop.inventory-bootstrap.browser'||manifest.version!==1||manifest.executable!==false||manifest.graphProposal!==false||!['checkpointSha256','modelSha256','tokenizerSha256','calibrationSha256'].every(key=>hash(manifest[key]))||!Number.isSafeInteger(manifest.maxLength)||manifest.maxLength<4||manifest.maxLength>512||!Number.isSafeInteger(maxCandidates)||maxCandidates<1||!Number.isSafeInteger(maxText)||maxText<1)throw TypeError('invalid-bootstrap-provider');
 const maxLength=manifest.maxLength;
 const provenance=Object.freeze({provider:'inventory-bootstrap',checkpointSha256:manifest.checkpointSha256,modelSha256:manifest.modelSha256,tokenizerSha256:manifest.tokenizerSha256,calibrationSha256:manifest.calibrationSha256,decoderVersion:INVENTORY_BOOTSTRAP_DECODER_VERSION,conditioning:'caller-supplied concept, key, phase, field instance and candidate',quantizedCalibration:manifest.quantizedCalibration===true});
 const unresolved=reason=>({candidates:[],failures:[{reason}],coverage:{complete:false,executable:false,graphProposal:false,fieldInstances:'caller-supplied',topology:'unresolved'},providers:[{...provenance}]});
 async function scoreFields(source,fields){
  const refuse=reason=>({...unresolved(reason),scores:[]});
  if(typeof source!=='string'||!source||source.length>maxText||!Array.isArray(fields)||!fields.length||fields.length>maxCandidates)return refuse('invalid-scoring-input');
  // Copy only exact scalar conditioning fields before the first async boundary.
  const keys=['concept','key','phase','instance','candidate'];let rows;
  try{rows=fields.map(row=>{if(!plain(row)||Reflect.ownKeys(row).length!==keys.length)throw Error();const out={};for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(row,key);if(!descriptor||!Object.hasOwn(descriptor,'value')||!text(descriptor.value))throw Error();out[key]=descriptor.value;}return out;});}catch{return refuse('invalid-field-conditioning');}
  try{
   const queries=rows.map(r=>`concept=${r.concept} key=${r.key} phase=${r.phase} instance=${r.instance} candidate=${r.candidate}`);
   // Refuse oversized encoded input rather than silently truncating source/query.
   const encoded=await tokenizer(rows.map(()=>source),{text_pair:queries,padding:true,truncation:false});
   const dims=encoded?.input_ids?.dims;
   if(!Array.isArray(dims)||dims.length!==2||dims[0]!==rows.length||!Number.isSafeInteger(dims[1])||dims[1]<1||dims[1]>maxLength)return refuse('encoded-input-over-budget');
   if(!encoded.attention_mask||JSON.stringify(encoded.attention_mask.dims)!==JSON.stringify(dims))return refuse('invalid-tokenizer-output');
   const output=await model({input_ids:encoded.input_ids,attention_mask:encoded.attention_mask});
   const scores=tensor(output.candidate_logits,[rows.length]),spans=tensor(output.span_logits,[rows.length,dims[1],2]);
   return {...unresolved('graph-proposal-unavailable'),scores:rows.map((conditioning,i)=>({conditioning,logit:scores[i],spanLogits:Array.from({length:dims[1]},(_,j)=>spans.slice((i*dims[1]+j)*2,(i*dims[1]+j+1)*2)),spanStatus:'token-logits-only; source alignment unresolved'}))};
  }catch{return refuse('auxiliary-inference-failed');}
 }
 return Object.freeze({scoreFields,propose:async()=>unresolved('graph-proposal-unavailable'),provenance:()=>({...provenance})});
}
