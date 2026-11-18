// Source-only two-model proposals. No parser fallback or execution admission.
import {readReaderSource} from './reader-source.mjs?v=0497d78933';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=62cdd97cd1';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from './raw-structural-bridge.mjs?v=c272289f6a';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const digest=async x=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const modelFields=['sha256','tokenizerSha256','codecSha256','decoderVersion'];
const modelIdentity=x=>{if(!x||Object.keys(x).some(k=>!modelFields.includes(k))||!modelFields.slice(0,3).every(k=>hash(x[k]))||!Number.isSafeInteger(x.decoderVersion)||x.decoderVersion<1)throw Error('invalid-model-provenance');return Object.fromEntries(modelFields.map(k=>[k,x[k]]));};
export async function createKeyReaderPipeline({cutter,reader,getContext,cutterModel,readerModel,bindingsJSON,bindingsSha256,maxText=16384,maxRequests=32,maxBytes=4000000,budget=200000,decoderBudget=200000}={}){
 if(typeof getContext!=='function'||typeof bindingsJSON!=='string'||bindingsJSON.length>4000000||!hash(bindingsSha256)||![maxText,maxRequests,maxBytes,budget,decoderBudget].every(n=>Number.isSafeInteger(n)&&n>0)||maxRequests>32||maxBytes>4000000)throw Error('invalid-pipeline-options');
 const identities={cutter:modelIdentity(cutterModel),reader:modelIdentity(readerModel)};
 if(await digest(bindingsJSON)!==bindingsSha256)throw Error('binding-hash-mismatch');
 const bindings=copyHostData(JSON.parse(bindingsJSON),{maxBytes});
 const pipelineSha256=await digest(JSON.stringify({format:'psys2.key-reader-pipeline/1',...identities,bindingsSha256}));
 const provenance={modelSha256:pipelineSha256,decoderVersion:1,models:identities,bindingsSha256,architecture:'source-cutter/request-key-heads',calibration:null};
 async function propose(sourceSop,knownCut=null,cutOnly=false){
  const failures=[],requests=[],ranges=[];let raw=null,sourceCut=null,steps=0;
  const tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('pipeline-budget');};
  const fail=(reason,path=[])=>failures.push({reason,path});
  const copy=x=>copyHostData(x,{maxBytes});
  const closed=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))throw Error('invalid-provider-envelope');};
  const source=(x,expected)=>{closed(x,['text','unit']);if(x.unit!=='unicode-scalar'||x.text!==expected)throw Error('source-snapshot-mismatch');};
  const status=(x,path)=>{closed(x.coverage,['complete','truncated']);if(x.coverage.complete!==true||x.coverage.truncated!==false)fail('incomplete-provider-coverage',path);if(!Array.isArray(x.unresolved))throw Error('missing-unresolved-status');for(const issue of x.unresolved){tick();failures.push({reason:'provider-unresolved',path,detail:copy(issue)});}};
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
   const context=copy(await getContext(text));closed(context,['area','context']);if(typeof context.area!=='string'||!context.area||!Object.hasOwn(context,'context'))throw Error('invalid-host-context');
   for(let index=0;index<cut.spans.length;index++){
    const [start,end]=cut.spans[index],localChars=chars.slice(start,end),substring=localChars.join('');tick(end-start);
    const result=copy(await reader.read(substring,copy(context)));closed(result,['source','request','ranges','coverage','unresolved','model']);source(result.source,substring);if(!same(modelIdentity(result.model),identities.reader))throw Error('reader-provenance-mismatch');status(result,['requests',index]);
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
   const bridge=bridgeRawStructure(raw,{bindings,bindingSha256:bindingsSha256,budget,decoderBudget,maxBytes});
   failures.push(...bridge.diagnostics.map(issue=>({reason:issue.reason,path:issue.path})));const decoded=bridge.decoded;failures.push(...(decoded?.issues??[]));
   return {candidates:failures.length?[]:(decoded?.candidates??[]),coverage:{complete:failures.length===0&&decoded?.coverage?.complete===true,graphProposal:decoded?.coverage?.graphProposal===true,executable:false},failures,raw,provenance:copy(provenance),graphConfidence:null,sourceCut,steps};
  }catch(error){fail(String(error?.message??'pipeline-failed'));return {candidates:[],coverage:{complete:false,graphProposal:false,executable:false},failures,raw,provenance:copy(provenance),graphConfidence:null,sourceCut,steps};}
 }
 return {provenance:()=>copyHostData(provenance),propose:sourceSop=>propose(sourceSop),async *proposeRequests(sourceSop){
  const initial=await propose(sourceSop,null,true),cut=initial.sourceCut;
  if(!cut||cut.coverage.complete!==true||cut.coverage.truncated||cut.unresolved.length||cut.spans.length<2){yield cut?await propose(sourceSop,cut):initial;return;}
  for(const [index,range]of cut.spans.entries()){
   const proposal=await propose(sourceSop,{...cut,spans:[range]});
   yield {...proposal,composition:{index,total:cut.spans.length,range:[...range],sourceCuts:cut.spans.map(span=>[...span]),policy:'source-order-independent-cuts',explicitDependencies:[]}};
  }
 }};
}
