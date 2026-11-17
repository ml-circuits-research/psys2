import {projectJournalAction} from './project-journal-action.mjs?v=2ec216545c';
import {combineModelScores} from './model-selection-score.mjs?v=ac3ac10191';
// Verify artifact bytes, then assemble actual injected neural sessions. No admission.
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=463e762442';
import {createCutterInference} from './cutter-inference.mjs?v=e3ef21b269';
import {createKeyReaderInference} from './key-reader-inference.mjs?v=37b7c1826e';
import {createBertSourceOffsetAuthority} from './bert-source-offsets.mjs?v=9b7b99f458';
import {createKeyReaderPipeline} from './key-reader-pipeline.mjs?v=43d7c2a85c';

const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const scalar=x=>typeof x==='string'&&!Array.from(x).some(c=>{const n=c.codePointAt(0);return n>=0xd800&&n<=0xdfff;});
const utf8=x=>new TextEncoder().encode(x);
const digest=async bytes=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function stable(value,depth=0){
 if(depth>32)throw Error('runtime-identity-depth');
 return Array.isArray(value)?value.map(v=>stable(v,depth+1)):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k],depth+1)])):value;
}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function path(value){
 if(typeof value!=='string'||!value||value.length>4096||value.includes('\0')||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..')||/^[a-z][a-z0-9+.-]*:/i.test(value))throw Error('invalid-artifact-path');
 return value;
}
function descriptor(value,requiredHash,graph=false){
 if(!object(value)||Object.keys(value).some(k=>!['path','sha256','bytes'].includes(k))||!hash(value.sha256)||requiredHash!==undefined&&value.sha256!==requiredHash||graph&&!Number.isSafeInteger(value.bytes)||value.bytes!==undefined&&(!Number.isSafeInteger(value.bytes)||value.bytes<1))throw Error('invalid-artifact-descriptor');
 return {path:path(value.path),sha256:value.sha256,...(value.bytes===undefined?{}:{bytes:value.bytes})};
}
function ownedBytes(input,maxBytes){
 let view;
 if(input instanceof Uint8Array)view=input;
 else if(input instanceof ArrayBuffer)view=new Uint8Array(input);
 else throw Error('artifact-bytes-required');
 if(!view.byteLength||view.byteLength>maxBytes)throw Error('artifact-byte-budget');
 return new Uint8Array(view); // Buffer.slice() would retain mutable caller storage.
}
function text(bytes,maxBytes){
 if(bytes.byteLength>maxBytes)throw Error('json-byte-budget');
 const value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 if(!scalar(value))throw Error('invalid-artifact-unicode');
 return value;
}
const GRAPH_INTERFACE={
 cutter:{input:['input_ids','attention_mask'],output:['bio_logits']},
 encoder:{input:['input_ids','attention_mask'],output:['hidden','bio_logits','presence_logits']},
 heads:{input:['hidden','spans','key_indices'],output:['class_logits']}
};

/** verifyHostRuntime is an externally trusted host attestation, not cryptographic
 * proof about callbacks. This factory locally authenticates only supplied bytes.
 * No models, tokenizer, context reads or sessions are invoked before verification. */
export async function createVerifiedReaderProvider({
 manifestJSON,manifestSha256,tokenizerArtifact,bindingsArtifact,readArtifact,backend,
 createTokenizer,getContext,recordDiagnostics,runtimeIdentity,verifyHostRuntime,
 maxTotalBytes=268435456,maxJSONBytes=4000000
}={}){
 if(!scalar(manifestJSON)||!hash(manifestSha256)||![readArtifact,createTokenizer,getContext,recordDiagnostics,verifyHostRuntime].every(f=>typeof f==='function')||!object(backend)||typeof backend.createSession!=='function'||typeof backend.makeTensor!=='function'||!object(runtimeIdentity)||!Object.keys(runtimeIdentity).length||![maxTotalBytes,maxJSONBytes].every(n=>Number.isSafeInteger(n)&&n>0)||maxTotalBytes>1073741824||maxJSONBytes>4000000)throw Error('invalid-verified-provider-options');
 const manifestBytes=utf8(manifestJSON);
 if(manifestBytes.byteLength>maxJSONBytes||await digest(manifestBytes)!==manifestSha256)throw Error('manifest-hash-mismatch');
 const m=copyHostData(JSON.parse(manifestJSON),{maxBytes:maxJSONBytes});
 if(m.format!=='sop.key-reader-runtime/1'||!['fixture','trained-unverified'].includes(m.artifactRole)||m.executionEligible!==false||m.graphConfidence!==null||m.dtype!=='fp32'||!['fp32','q8-dynamic'].includes(m.weightRepresentation)||!object(m.files)||!([['cutter','encoder','heads'],['bindings','cutter','encoder','heads','tokenizer']].some(names=>same(Object.keys(m.files).sort(),names)))||!['cutterSha256','encoderSha256','headsSha256','configSha256','cutterConfigSha256','tokenizerSha256'].every(k=>hash(m[k])))throw Error('invalid-reader-bundle-profile');
 for(const [field,expected]of [['configJSON',m.configSha256],['cutterConfigJSON',m.cutterConfigSha256]]){
  if(!scalar(m[field])||utf8(m[field]).byteLength>maxJSONBytes||await digest(utf8(m[field]))!==expected)throw Error('embedded-config-hash-mismatch');
  copyHostData(JSON.parse(m[field]),{maxBytes:maxJSONBytes});
 }
 const descriptors={
  cutter:descriptor(m.files.cutter,m.cutterSha256,true),
  encoder:descriptor(m.files.encoder,m.encoderSha256,true),
  heads:descriptor(m.files.heads,m.headsSha256,true),
  tokenizer:descriptor(tokenizerArtifact,m.tokenizerSha256),
  bindings:descriptor(bindingsArtifact)
 };
 if(Object.keys(m.files).length===5){
  for(const kind of ['tokenizer','bindings']){
   const persisted=descriptor(m.files[kind],descriptors[kind].sha256,true);
   if(!same(persisted,descriptors[kind]))throw Error('manifest-external-artifact-mismatch:'+kind);
  }
 }
 const paths=Object.values(descriptors).map(d=>d.path);
 if(new Set(paths).size!==paths.length)throw Error('duplicate-artifact-path');
 if(manifestBytes.byteLength+Object.values(descriptors).reduce((n,d)=>n+(d.bytes??maxJSONBytes),0)>maxTotalBytes)throw Error('declared-artifact-byte-budget');
 if(['tokenizer','bindings'].some(kind=>descriptors[kind].bytes!==undefined&&descriptors[kind].bytes>maxJSONBytes))throw Error('json-byte-budget');
 let remainingBytes=maxTotalBytes-manifestBytes.byteLength;
 const files=Object.fromEntries(await Promise.all(Object.entries(descriptors).map(async([kind,d])=>{
  const supplied=await readArtifact(d.path,{sha256:d.sha256,...(d.bytes===undefined?{}:{bytes:d.bytes})});
  if(!(supplied instanceof Uint8Array)&&!(supplied instanceof ArrayBuffer))throw Error('artifact-bytes-required');
  const size=supplied.byteLength,limit=Math.min(d.bytes??maxJSONBytes,remainingBytes);
  if(size>limit||!size)throw Error('artifact-byte-budget:'+kind);
  if(d.bytes!==undefined&&size!==d.bytes)throw Error('artifact-size-mismatch:'+kind);
  const bytes=ownedBytes(supplied,limit);remainingBytes-=bytes.byteLength;
  if(await digest(bytes)!==d.sha256)throw Error('artifact-hash-mismatch:'+kind);
  return [kind,bytes];
 })));
 const total=manifestBytes.byteLength+Object.values(files).reduce((n,b)=>n+b.byteLength,0);
 if(total>maxTotalBytes)throw Error('artifact-byte-budget');
 const tokenizerJSON=text(files.tokenizer,maxJSONBytes),bindingsJSON=text(files.bindings,maxJSONBytes);
 copyHostData(JSON.parse(tokenizerJSON),{maxBytes:maxJSONBytes});
 copyHostData(JSON.parse(bindingsJSON),{maxBytes:maxJSONBytes});
 const hostIdentity=copyHostData(runtimeIdentity,{maxBytes:maxJSONBytes}),sessionConstructor=backend.createSession,tensorConstructor=backend.makeTensor;
 // Actual function references are supplied to the host verifier. A caller hash
 // alone never authenticates the implementation, tokenizer factory or context.
 const receipt=copyHostData(await verifyHostRuntime({backend,createTokenizer,getContext,runtimeIdentity:copyHostData(hostIdentity)}),{maxBytes:maxJSONBytes});
 if(backend.createSession!==sessionConstructor||backend.makeTensor!==tensorConstructor)throw Error('host-runtime-mutated-during-attestation');
 if(!object(receipt)||Object.keys(receipt).length!==3||receipt.verified!==true||typeof receipt.authority!=='string'||!receipt.authority||!same(receipt.identity,hostIdentity))throw Error('host-runtime-not-attested');
 const tokenizer=await createTokenizer({tokenizerJSON,tokenizerBytes:new Uint8Array(files.tokenizer),
  tokenizerSha256:m.tokenizerSha256,configJSON:m.configJSON,cutterConfigJSON:m.cutterConfigJSON});
 if(typeof tokenizer!=='function')throw Error('invalid-constructed-tokenizer');
 const authority=await createBertSourceOffsetAuthority({tokenizer,tokenizerJSON,tokenizerSha256:m.tokenizerSha256});
 const sessions={};
 const call=kind=>async feeds=>{
  const session=sessions[kind];if(!session)throw Error('reader-session-not-ready');
  if(kind==='heads')return session.run(feeds);
  const converted={};
  for(const name of GRAPH_INTERFACE[kind].input){
   const value=feeds[name];
   if(!value||!Array.isArray(value.dims)||!value.data)throw Error('invalid-neural-input');
   converted[name]=tensorConstructor.call(backend,'int64',BigInt64Array.from(value.data,BigInt),[...value.dims]);
  }
  return session.run(converted);
 };
 let decisionScores=[];const componentScores={};
 const diagnostics=component=>async result=>{decisionScores.push(result.auxiliary?.minimumProbability);componentScores[component]=result.auxiliary?.minimumProbability;return recordDiagnostics(copyHostData({component,result}));};
 // Constructors verify their profiles without calling these deferred sessions.
 const cutter=await createCutterInference({manifest:m,tokenizer,model:call('cutter'),offsetAuthority:authority,recordDiagnostics:diagnostics('cutter')});
 const reader=await createKeyReaderInference({manifest:m,tokenizer,encoder:call('encoder'),heads:call('heads'),
  makeTensor:(type,data,dims)=>tensorConstructor.call(backend,type,data,dims),offsetAuthority:authority,recordDiagnostics:diagnostics('key-reader')});
 const provider=await createKeyReaderPipeline({cutter,reader,getContext,cutterModel:cutter.provenance().model,
  readerModel:reader.provenance().model,bindingsJSON,bindingsSha256:descriptors.bindings.sha256});
 try{
  for(const kind of ['cutter','encoder','heads']){
   const d=descriptors[kind],session=await sessionConstructor.call(backend,new Uint8Array(files[kind]),{kind,path:d.path,sha256:d.sha256});
   sessions[kind]=session;
   if(!session||typeof session.run!=='function'||!same(session.inputNames,GRAPH_INTERFACE[kind].input)||!same(session.outputNames,GRAPH_INTERFACE[kind].output))throw Error('invalid-session-interface:'+kind);
  }
 }catch(error){
  for(const session of Object.values(sessions))try{await session?.release?.();}catch{/* retain original construction failure */}
  throw error;
 }
 const verified={
  format:'psys2.verified-reader-provider/1',manifestSha256,
  artifactRole:m.artifactRole,weightRepresentation:m.weightRepresentation,dtype:m.dtype,
  files:Object.fromEntries(Object.entries(descriptors).map(([kind,d])=>[kind,{...d,bytes:files[kind].byteLength}])),
  configSha256:m.configSha256,cutterConfigSha256:m.cutterConfigSha256,
  tokenizerSha256:m.tokenizerSha256,bindingsSha256:descriptors.bindings.sha256,totalAuthenticatedBytes:total,
  models:{cutter:cutter.provenance(),reader:reader.provenance()},pipeline:provider.provenance(),
  offsetAuthority:{protocol:'bert-component-trace/1',tokenizerSha256:m.tokenizerSha256,verification:'per-input ID/mask/offset parity'},
  hostRuntimeAttestation:receipt,implementationTrust:'external host attestation; not proven by artifact hashes',
  calibration:null,executionEligible:false
 };
 verified.assemblySha256=await digest(utf8(JSON.stringify(stable(verified))));
 const scoreProposal=proposal=>({...projectJournalAction(proposal),selectionScore:combineModelScores(decisionScores)});
 const scoredProvider={...provider,registry:()=>copyHostData(JSON.parse(m.configJSON).registry),bindings:()=>copyHostData(JSON.parse(bindingsJSON)),async propose(text){decisionScores=[];const proposal=await provider.propose(text);return scoreProposal(proposal);},async *proposeRequests(text){const sequence=provider.proposeRequests(text);delete componentScores.cutter;while(true){decisionScores=[];delete componentScores['key-reader'];const step=await sequence.next();if(step.done)return;const proposal=scoreProposal(step.value);proposal.selectionScore=combineModelScores([componentScores.cutter,componentScores['key-reader']]);yield proposal;}}};
 return {provider:scoredProvider,verified:copyHostData(verified),provenance:()=>copyHostData(verified)};
}
