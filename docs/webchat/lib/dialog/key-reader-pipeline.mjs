// Source-only two-model proposals. No parser fallback or execution admission.
import {readReaderSource} from './reader-source.mjs?v=a41a7be6a2';
import {copyHostData,freezeHostData} from '../../worlds/native-tool-host.mjs?v=646e795567';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT,BINDING_NODES} from './raw-structural-bridge.mjs?v=05e816ce7e';
import {comparativeSteps} from './comparative-projection.mjs?v=55f3f4579e';
import {referenceProjection} from './reference-projection.mjs?v=fb387ab994';
import {completeBindings} from './declared-bindings.mjs?v=3e9b75e479';
import {declaredRawReadings} from './partial-admission.mjs?v=d8fce8f8d2';
import {declaredValueReadings} from './declared-value-readings.mjs?v=97dfd03d0f';
import {en} from '../lang/en.mjs?v=d028d63371';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const digest=async x=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const modelFields=['sha256','tokenizerSha256','codecSha256','decoderVersion'];
const modelIdentity=x=>{if(!x||Object.keys(x).some(k=>!modelFields.includes(k))||!modelFields.slice(0,3).every(k=>hash(x[k]))||!Number.isSafeInteger(x.decoderVersion)||x.decoderVersion<1)throw Error('invalid-model-provenance');return Object.fromEntries(modelFields.map(k=>[k,x[k]]));};
export async function createKeyReaderPipeline({cutter,reader,getContext,cutterModel,readerModel,bindingsJSON,bindingsSha256,maxText=16384,maxRequests=32,maxBytes=4000000,budget=200000,decoderBudget=200000}={}){
 if(typeof getContext!=='function'||typeof bindingsJSON!=='string'||bindingsJSON.length>8000000||!hash(bindingsSha256)||![maxText,maxRequests,maxBytes,budget,decoderBudget].every(n=>Number.isSafeInteger(n)&&n>0)||maxRequests>32||maxBytes>4000000)throw Error('invalid-pipeline-options');
 const identities={cutter:modelIdentity(cutterModel),reader:modelIdentity(readerModel)};
 if(await digest(bindingsJSON)!==bindingsSha256)throw Error('binding-hash-mismatch');
 const bindings=freezeHostData(JSON.parse(bindingsJSON),{maxBytes,maxNodes:BINDING_NODES});
 // The bridge reads the deployed table completed from the live declarations (declared-bindings.mjs), as the partial
 // reading does; the provenance keeps the deployed table's identity.
 let live=bindings;try{live=await completeBindings(bindings);}catch{/* the deployed table stays in force */}
 const pipelineSha256=await digest(JSON.stringify({format:'psys2.key-reader-pipeline/1',...identities,bindingsSha256}));
 const provenance={modelSha256:pipelineSha256,decoderVersion:1,models:identities,bindingsSha256,architecture:'source-cutter/request-key-heads',calibration:null};
 let independentInput=null;
 async function propose(sourceSop,knownCut=null,cutOnly=false,recordedContext=null){
  if(!recordedContext)independentInput=null;
  const failures=[],requests=[],ranges=[];let raw=null,sourceCut=null,steps=0;
  const tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('pipeline-budget');};
  const fail=(reason,path=[])=>failures.push({reason,path});
  const copy=x=>copyHostData(x,{maxBytes});
  const closed=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))throw Error('invalid-provider-envelope');};
  const source=(x,expected)=>{closed(x,['text','unit']);if(x.unit!=='unicode-scalar'||x.text!==expected)throw Error('source-snapshot-mismatch');};
  // A bank value the classifier chose for a span that does not spell it is not refused by the provider: the bridge
  // admits such a value only through a declared normalization of the binding table (a relation's value table, a
  // declared value normalization) and reports it as unresolved otherwise.
  const deferred=issue=>issue?.reason==='normalization-requires-declared-proof';
  const status=(x,path)=>{closed(x.coverage,['complete','truncated']);if(!Array.isArray(x.unresolved))throw Error('missing-unresolved-status');const own=x.unresolved.filter(issue=>!deferred(issue));
   if(x.coverage.complete!==true&&(own.length||!x.unresolved.length)||x.coverage.truncated!==false)fail('incomplete-provider-coverage',path);for(const issue of own){tick();failures.push({reason:'provider-unresolved',path,detail:copy(issue)});}};
  try{
   const text=readReaderSource(sourceSop);
   if(text.length>maxText*2)throw Error('invalid-source-text');const chars=Array.from(text);tick(chars.length);if(chars.length>maxText)throw Error('source-size');
   if(typeof cutter?.cut!=='function'||typeof reader?.read!=='function')throw Error('model-unavailable');
   const cut=copy(knownCut??await cutter.cut(text));closed(cut,['source','spans','coverage','unresolved','model']);source(cut.source,text);if(!same(modelIdentity(cut.model),identities.cutter))throw Error('cutter-provenance-mismatch');status(cut,['cutter']);
   if(!Array.isArray(cut.spans)||cut.spans.length>maxRequests)throw Error('request-count-overflow');let previous=0;
   for(const span of cut.spans){tick();if(!Array.isArray(span)||span.length!==2||!span.every(Number.isSafeInteger)||span[0]<previous||span[0]<0||span[0]>=span[1]||span[1]>chars.length)throw Error('invalid-cut-span');previous=span[1];}
   sourceCut=copy(cut);
   // Validate the entire cut before any request-local provider call.
   if(failures.length)throw Error('incomplete-request-cut');
   if(cutOnly)return {sourceCut,candidates:[],coverage:{complete:true,graphProposal:false,executable:false},failures,provenance:copy(provenance),graphConfidence:null,steps};
   const context=copy(recordedContext??await getContext(text));closed(context,['area','context','observation']);if(typeof context.area!=='string'||!context.area||!Object.hasOwn(context,'context'))throw Error('invalid-host-context');
   const observation=context.observation;
   if(observation!==undefined){
    closed(observation,['scope','instance','revision']);
    if(!['scope','instance','revision'].every(key=>typeof observation[key]==='string'&&observation[key]))throw Error('invalid-context-observation');
   }
   for(let index=0;index<cut.spans.length;index++){
    const [start,end]=cut.spans[index],localChars=chars.slice(start,end),substring=localChars.join('');tick(end-start);
    const result=copy(await reader.read(substring,copy({area:context.area,context:context.context})));closed(result,['source','request','ranges','coverage','unresolved','model']);source(result.source,substring);if(!same(modelIdentity(result.model),identities.reader))throw Error('reader-provenance-mismatch');status(result,['requests',index]);
    if(!result.request||typeof result.request!=='object'||Array.isArray(result.request)||!Array.isArray(result.ranges))throw Error('invalid-request-output');
    const request=copy(result.request);if(Object.hasOwn(request,'span')&&request.span!==substring)throw Error('request-span-mismatch');request.span=substring;requests.push(request);
    const seen=new Set();let suppliedSpan=false;
    for(const metadata of result.ranges){tick();closed(metadata,['path','range']);const path=metadata.path,range=metadata.range;
     if(!Array.isArray(path)||!path.length||path.length>48||path.some(k=>typeof k!=='string'||!k||['__proto__','prototype','constructor'].includes(k))||!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<0||range[0]>=range[1]||range[1]>end-start)throw Error('invalid-relative-source-range');
     const key=JSON.stringify(path);if(seen.has(key))throw Error('duplicate-source-range');seen.add(key);let value=request;
     for(const part of path){tick();if(!value||typeof value!=='object'||!Object.hasOwn(value,part))throw Error('unowned-source-range');value=value[part];}
     tick(range[1]-range[0]);if(typeof value!=='string'||localChars.slice(...range).join('')!==value)throw Error('source-range-value-mismatch');
     if(path.length===1&&path[0]==='span'){if(range[0]!==0||range[1]!==end-start)throw Error('request-source-range-mismatch');suppliedSpan=true;}
     ranges.push({path:['requests',String(index),...path],range:[start+range[0],start+range[1]]});
    }
    if(!suppliedSpan)ranges.push({path:['requests',String(index),'span'],range:[start,end]});
   }
   raw={format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area:context.area,model:{kind:'structural-graph',sha256:pipelineSha256,decoderVersion:1},requestCount:cut.spans.length,requests,ranges,coverage:{complete:failures.length===0,truncated:false},unresolved:copy(failures)};
   // Both priors (the previous message, the observed objects) leave a re-reading hypothesis without them, also on a first turn.
   if(!recordedContext&&cut.spans.length===1&&(context.context?.previous!=null||context.context?.existing?.length>0))independentInput={sourceSop,cut,context,profiles:new Set()};
   // The declared raw readings (partial-admission.mjs: a container's property, a population joined by lines) hold for a
   // complete reading too.
   // The declared readings of said values (declared-value-readings.mjs: amounts, ranges, positions) likewise.
   raw=declaredValueReadings(declaredRawReadings(raw,live));
   const bridge=bridgeRawStructure(raw,{bindings:live,bindingSha256:bindingsSha256,comparatives:comparativeSteps(),references:referenceProjection(),budget,decoderBudget,maxBytes});
   failures.push(...bridge.diagnostics.map(issue=>({reason:issue.reason,path:issue.path})));const decoded=bridge.decoded;failures.push(...(decoded?.issues??[]));
   return {candidates:failures.length?[]:(decoded?.candidates??[]),coverage:{complete:failures.length===0&&decoded?.coverage?.complete===true,graphProposal:decoded?.coverage?.graphProposal===true,executable:false},failures,raw,provenance:copy(provenance),graphConfidence:null,sourceCut,steps,...(observation?{sourceObservation:copy(observation)}:{})};
  }catch(error){fail(String(error?.message??'pipeline-failed'));return {candidates:[],coverage:{complete:false,graphProposal:false,executable:false},failures,raw,provenance:copy(provenance),graphConfidence:null,sourceCut,steps};}
 }
 async function repeat(sourceSop,profile){
  const input=independentInput;
  if(input?.sourceSop!==sourceSop){independentInput=null;return null;}
  if(input.profiles.has(profile))return null;
  // A re-reading identical to one already made (no previous message to drop; no observed objects to drop) is not repeated.
  if(profile==='independent'?input.context.context.previous==null:!(input.context.context.existing?.length>0))return null;
  input.profiles.add(profile);
  const context={...input.context.context,previous:null};
  if(profile==='literal')context.existing=[];
  return propose(sourceSop,input.cut,false,{...input.context,context});
 }
 return {provenance:()=>copyHostData(provenance),propose:sourceSop=>propose(sourceSop),
  proposeIndependent:sourceSop=>repeat(sourceSop,'independent'),
  proposeLiteral:sourceSop=>repeat(sourceSop,'literal'),async *proposeRequests(sourceSop){
  const initial=await propose(sourceSop,null,true);let cut=initial.sourceCut;
  // A cut that holds only the clause joiners of w.lang.en ("and", "then", ",") says no request of its own.
  if(cut&&cut.spans.length>1){const chars=Array.from(readReaderSource(sourceSop)),joiners=en.cutWords();
   const spans=cut.spans.filter(([a,b])=>{const words=[...chars.slice(a,b).join('').toLowerCase().matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)].map(m=>m[0]);return !words.length||!words.every(w=>joiners.has(w));});
   if(spans.length&&spans.length<cut.spans.length)cut={...cut,spans};}
  if(!cut||cut.coverage.complete!==true||cut.coverage.truncated||cut.unresolved.length||cut.spans.length<2){yield cut?await propose(sourceSop,cut):initial;return;}
  for(const [index,range]of cut.spans.entries()){
   const proposal=await propose(sourceSop,{...cut,spans:[range]});
   yield {...proposal,composition:{index,total:cut.spans.length,range:[...range],sourceCuts:cut.spans.map(span=>[...span]),policy:'source-order-independent-cuts',explicitDependencies:[]}};
  }
 }};
}
