// Explicit offline/runtime packet boundary; no model loading or execution admission.
import {validateKeyReaderLayout} from './key-reader-layout.mjs?v=13da6b9284';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=cf38a0ae11';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const digest=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const closed=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const modelKeys=['sha256','tokenizerSha256','codecSha256','decoderVersion'];
function identity(value){
 if(!closed(value,modelKeys)||!modelKeys.slice(0,3).every(key=>hash(value[key]))||!Number.isSafeInteger(value.decoderVersion)||value.decoderVersion<1)throw Error('invalid-model-identity');
 return Object.fromEntries(modelKeys.map(key=>[key,value[key]]));
}
export async function createKeyReaderPacketAdapter({configJSON,configSha256,model,maxBytes=4000000,maxText=16384,maxRanges=4096,budget=200000}={}){
 if(typeof configJSON!=='string'||!hash(configSha256)||![maxBytes,maxText,maxRanges,budget].every(n=>Number.isSafeInteger(n)&&n>0)||maxBytes>4000000||new TextEncoder().encode(configJSON).length>maxBytes)throw Error('invalid-adapter-options');
 if(await digest(configJSON)!==configSha256)throw Error('config-hash-mismatch');
 const config=copyHostData(JSON.parse(configJSON),{maxBytes}),expectedModel=identity(model);
 const {keys}=validateKeyReaderLayout(config),registry=config.registry,banks=config.banks;
 const expectedSupport=keys.map(key=>({key,presence:registry[key].role==='derived'?'untrained':'learned-uncalibrated',value:registry[key].role==='derived'?'untrained':registry[key].role==='metadata'&&!Object.hasOwn(banks,key)?'unsupported':Object.hasOwn(banks,key)?'declared-class':'source-copy-normalization-unresolved'}));
 const provenance={format:'sop.key-reader-packet-adapter/1',configSha256,model:expectedModel,calibration:null,executable:false};
 return {provenance:()=>copyHostData(provenance),adapt(input){
  let raw=null,steps=0;const tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('adapter-budget');};
  try{
   raw=copyHostData(input,{maxBytes});
   if(!closed(raw,['source','request','ranges','coverage','unresolved','model'])||!closed(raw.source,['text','unit'])||typeof raw.source.text!=='string'||raw.source.unit!=='unicode-scalar'||!object(raw.request)||!Array.isArray(raw.ranges)||!Array.isArray(raw.unresolved))throw Error('invalid-predictor-envelope');
   const chars=Array.from(raw.source.text);tick(chars.length);if(chars.length>maxText)throw Error('source-size');
   const actualModel=identity(raw.model);if(modelKeys.some(key=>actualModel[key]!==expectedModel[key]))throw Error('model-provenance-mismatch');
   if(!closed(raw.coverage,['complete','truncated','support'])||typeof raw.coverage.complete!=='boolean'||typeof raw.coverage.truncated!=='boolean'||raw.coverage.complete&&(raw.coverage.truncated||raw.unresolved.length))throw Error('inconsistent-predictor-coverage');
   const support=raw.coverage.support;if(!Array.isArray(support)||support.length!==expectedSupport.length)throw Error('support-layout-mismatch');
   for(let i=0;i<support.length;i++){tick();if(!closed(support[i],['key','presence','value'])||['key','presence','value'].some(key=>support[i][key]!==expectedSupport[i][key]))throw Error('support-layout-mismatch');}
   if(Object.hasOwn(raw.request,'span')&&raw.request.span!==raw.source.text)throw Error('request-source-mismatch');
   if(raw.ranges.length>maxRanges)throw Error('source-range-budget');const seen=new Set();
   for(const metadata of raw.ranges){
    tick();if(!closed(metadata,['path','range'])||!Array.isArray(metadata.path)||!metadata.path.length||metadata.path.length>48||metadata.path.some(part=>typeof part!=='string'||!part||['__proto__','prototype','constructor'].includes(part))||!Array.isArray(metadata.range)||metadata.range.length!==2||!metadata.range.every(Number.isSafeInteger)||metadata.range[0]<0||metadata.range[0]>=metadata.range[1]||metadata.range[1]>chars.length)throw Error('invalid-source-range');
    const pathKey=JSON.stringify(metadata.path);if(seen.has(pathKey))throw Error('duplicate-source-range');seen.add(pathKey);let value=raw.request;
    for(const part of metadata.path){tick();if(!object(value)&&!Array.isArray(value)||!Object.hasOwn(value,part))throw Error('unowned-source-range');value=value[part];}
    tick(metadata.range[1]-metadata.range[0]);if(typeof value!=='string'||chars.slice(...metadata.range).join('')!==value)throw Error('source-range-value-mismatch');
   }
   const packet=copyHostData({...raw,coverage:{complete:raw.coverage.complete,truncated:raw.coverage.truncated}},{maxBytes});
   return {ok:true,packet,diagnostics:{support:copyHostData(support),rawPacket:raw},provenance:copyHostData(provenance),steps};
  }catch(error){return {ok:false,packet:null,diagnostics:{issues:[{reason:String(error?.message??'packet-adaptation-failed')}],rawPacket:raw},provenance:copyHostData(provenance),steps};}
 }};
}
