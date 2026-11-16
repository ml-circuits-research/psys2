// SPDX-License-Identifier: AGPL-3.0-only
// Learned raw slots only. No gold field queries, grammar or canonical bindings.
export const STRUCTURAL_RAW_FORMAT='psys2.raw-structural-predictions/1';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
function copyData(value,{budget=4000000,maxBytes=16000000}={}){let nodes=0,bytes=0;const ancestors=new Set();function copy(v,depth){if(++nodes>budget||depth>48||bytes>maxBytes)throw Error('data-budget');if(v===null||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v))throw Error('nonfinite-data');return v;}if(typeof v==='string'){bytes+=v.length;if(bytes>maxBytes)throw Error('data-budget');return v;}if(!v||typeof v!=='object'||ancestors.has(v)||!Array.isArray(v)&&!plain(v))throw Error('non-json-data');const out=Array.isArray(v)?[]:{};ancestors.add(v);for(const key of Reflect.ownKeys(v)){if(Array.isArray(v)&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key))throw Error('unsafe-data');bytes+=key.length;Object.defineProperty(out,key,{value:copy(d.value,depth+1),enumerable:true});}if(Array.isArray(v)&&Object.keys(out).length!==v.length)throw Error('sparse-data');ancestors.delete(v);return Object.freeze(out);}return copy(value,0);}
const safePath=path=>typeof path==='string'&&path.split('.').every(key=>key&&!['__proto__','constructor','prototype'].includes(key));
export function structuralOutputLayout(config){
 if(config?.format!=='psys2.raw-structural-model/1'||config.reservedIndices?.absent!==0||config.reservedIndices?.unknown!==1||JSON.stringify(config.spanStates)!==JSON.stringify(['absent','present','unresolved']))throw Error('unsupported-structural-config');
 const R=config.maxRequests,C=config.maxConstraints;if(![R,C].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=128))throw Error('invalid-slot-capacity');
 const out={count:[1,R+2],presence:[1,2],conditionCount:[1,R,C+2]},expected=[];
 for(const [prefix,fields]of [['r',config.requestFields],['c',config.constraintFields]]){if(!Array.isArray(fields))throw Error('missing-fields');for(const field of fields){if(!safePath(field))throw Error('unsafe-field-path');const key=prefix+':'+field,bank=config.banks?.[key];expected.push(key);if(!Array.isArray(bank)||bank.length<2||JSON.stringify(bank[0])!==JSON.stringify({kind:'absent'})||JSON.stringify(bank[1])!==JSON.stringify({kind:'unknown'})||bank.slice(2).some(row=>!row||row.kind!=='value'||!Object.hasOwn(row,'value')||Object.keys(row).length!==2))throw Error('invalid-typed-bank');out[key]=[1,R,...(prefix==='c'?[C]:[]),bank.length];}}
 if(Object.keys(config.banks).length!==expected.length||new Set(expected).size!==expected.length)throw Error('bank-field-layout-mismatch');
 for(const [prefix,fields]of [['r',config.requestSpans],['c',config.constraintSpans]])for(const field of fields){if(!safePath(field))throw Error('unsafe-span-path');for(const suffix of ['state','start','end']){const key=prefix+':'+field+':'+suffix;if(Object.hasOwn(out,key))throw Error('duplicate-output');out[key]=[1,R,...(prefix==='c'?[C]:[]),suffix==='state'?3:'sequence'];}}
 if(Object.keys(out).length!==59)throw Error('all-59-heads-required');return out;
}
const packet=(text,area,manifest)=>({format:STRUCTURAL_RAW_FORMAT,source:{text,unit:'unicode-scalar'},area,model:{kind:'structural-graph',sha256:manifest.modelSha256,decoderVersion:1},coverage:{complete:false,truncated:false},requestCount:null,requests:[],unresolved:[],ranges:[]});
function setPath(object,path,value){const keys=path.split('.');let at=object;for(const key of keys.slice(0,-1)){if(!Object.hasOwn(at,key))at[key]={};at=at[key];}at[keys.at(-1)]=value;}
/** Pure tensor normalization for Python/JS fixture parity. Offset metadata is a
 * trusted exact tokenizer authority, additionally checked against actual inputs. */
export function decodeStructuralOutputs({manifest,outputs,text,area,tokenIds,attentionMask,offsets=null,truncated=false,budget=4000000}){
 const result=packet(text,area,manifest),auxiliary=[];let steps=0;const tick=()=>{if(++steps>budget)throw Error('decode-budget');},issue=(path,reason,detail={})=>result.unresolved.push({path,reason,...detail});
 try{
  result.coverage.truncated=truncated;if(truncated)issue(['source'],'source-or-context-truncated');if(manifest.artifactRole==='fixture')issue(['model'],'fixture-artifact-untrained');
  const config=manifest.config,layout=structuralOutputLayout(config),length=tokenIds.length,R=config.maxRequests,C=config.maxConstraints,chars=Array.from(text);
  if(!length||length>config.maxLength||attentionMask.length!==length||attentionMask.some(n=>n!==0&&n!==1)||!attentionMask.some(n=>n===1))throw Error('invalid-model-input');
  const tensors={};if(!outputs||Object.keys(outputs).length!==59)throw Error('all-59-outputs-required');
  for(const [key,shape]of Object.entries(layout)){tick();const dims=shape.map(n=>n==='sequence'?length:n),tensor=outputs[key];if(!tensor||JSON.stringify(tensor.dims)!==JSON.stringify(dims)||!tensor.data||tensor.data.length!==dims.reduce((a,b)=>a*b,1))throw Error('invalid-output-shape:'+key);const values=[];for(const value of tensor.data){tick();if(typeof value!=='number'||!Number.isFinite(value))throw Error('nonfinite-output');values.push(value);}tensors[key]={dims,values};}
  let authority=null;
  if(offsets){
   const a=copyData(offsets);let valid=a.unit==='unicode-scalar'&&a.provenance&&typeof a.provenance.id==='string'&&a.provenance.id.length>0&&Number.isSafeInteger(a.provenance.version)&&a.provenance.version>=1&&hash(a.provenance.profileSha256)&&a.provenance.tokenizerSha256===manifest.tokenizerSha256;
   for(const [name,actual]of [['tokenIds',tokenIds],['attentionMask',attentionMask]])valid&&=Array.isArray(a[name])&&a[name].length===actual.length&&a[name].every((n,i)=>{tick();return n===actual[i];});
   for(const name of ['sequenceIds','specialTokensMask','offsets'])valid&&=Array.isArray(a[name])&&a[name].length===length;
   let last=0,sawContext=false;
   if(valid)for(let i=0;i<length;i++){tick();const sequence=a.sequenceIds[i],range=a.offsets[i],special=a.specialTokensMask[i];if(![null,0,1].includes(sequence)||![0,1].includes(special)||attentionMask[i]===0&&(sequence!==null||range!==null)){valid=false;break;}if(sequence===1)sawContext=true;if(sequence===0){if(sawContext||special!==0||!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<last||range[1]<=range[0]||range[1]>chars.length){valid=false;break;}last=range[1];}else if(range!==null){valid=false;break;}}
   if(valid)authority=a;else issue(['source'],'invalid-offset-authority');
  }
  const choose=(key,indices,path)=>{tick();const t=tensors[key],width=t.dims.at(-1);let row=0;for(let i=0;i<indices.length;i++)row=row*t.dims[i+1]+indices[i];const start=row*width;let best=-Infinity,index=null,tie=false;for(let j=0;j<width;j++){tick();const value=t.values[start+j];if(value>best){best=value;index=j;tie=false;}else if(value===best)tie=true;}auxiliary.push({head:key,slot:indices,index:tie?null:index,logit:best});if(tie){issue(path,'ambiguous-head-maximum',{head:key});return null;}return index;};
  const category=(prefix,field,indices,object,path)=>{const key=prefix+':'+field,index=choose(key,indices,path);if(index===null)return;const record=config.banks[key][index];if(record.kind==='absent')return;if(record.kind==='unknown'){issue(path,'unknown-field',{head:key,index});return;}setPath(object,field,copyData(record.value));};
  const span=(prefix,field,indices,path,requestRange=null,required=false)=>{
   const key=prefix+':'+field,state=choose(key+':state',indices,path);if(state===null)return null;if(state===0){if(required)issue(path,'absent-required-span');return null;}if(state===2){issue(path,'unresolved-span');return null;}
   const start=choose(key+':start',indices,path),end=choose(key+':end',indices,path);if(start===null||end===null)return null;if(!authority){issue(path,'exact-source-offsets-unavailable');return null;}
   if(end<start||authority.sequenceIds[start]!==0||authority.sequenceIds[end]!==0||authority.specialTokensMask[start]!==0||authority.specialTokensMask[end]!==0||attentionMask[start]!==1||attentionMask[end]!==1){issue(path,'pointer-not-source-token',{start,end});return null;}
   const range=[authority.offsets[start][0],authority.offsets[end][1]];if(!(prefix==='r'&&field==='span')&&(!requestRange||range[0]<requestRange[0]||range[1]>requestRange[1])){issue(path,'anchor-outside-request');return null;}
   result.ranges.push({path,range});return range;
  };
  const count=choose('count',[],['requestCount']),presence=choose('presence',[],['requestCount']);
  if(count===null||presence===null)return {prediction:result,auxiliary,steps};
  if(count===R+1){issue(['requestCount'],'request-count-overflow');return {prediction:result,auxiliary,steps};}
  if(Number(count>0)!==presence){issue(['requestCount'],'presence-count-disagreement',{count,presence});return {prediction:result,auxiliary,steps};}
  result.requestCount=count;
  for(let ri=0;ri<count;ri++){
   tick();const request={},root=['requests',String(ri)];for(const field of config.requestFields)category('r',field,[ri],request,[...root,...field.split('.')]);
   const requestRange=span('r','span',[ri],[...root,'span'],null,true);if(requestRange)request.span=chars.slice(...requestRange).join('');
   for(const field of config.requestSpans.filter(field=>field!=='span')){const range=span('r',field,[ri],[...root,...field.split('.')],requestRange);if(range)setPath(request,field,chars.slice(...range).join(''));}
   for(const field of ['act','mood'])if(!Object.hasOwn(request,field))issue([...root,field],'absent-required-field');
   const conditionCount=choose('conditionCount',[ri],[...root,'constraints']);
   if(conditionCount===C+1)issue([...root,'constraints'],'condition-count-overflow');
   else if(conditionCount!==null){request.constraints=[];for(let ci=0;ci<conditionCount;ci++){tick();const condition={},path=[...root,'constraints',String(ci)];for(const field of config.constraintFields)category('c',field,[ri,ci],condition,[...path,...field.split('.')]);for(const field of config.constraintSpans){const range=span('c',field,[ri,ci],[...path,...field.split('.')],requestRange);if(range)setPath(condition,field,chars.slice(...range).join(''));}for(const field of ['key','operator','phase','polarity','character'])if(!Object.hasOwn(condition,field))issue([...path,field],'absent-required-field');request.constraints.push(condition);}}
   result.requests.push(request);
  }
  result.coverage.complete=result.unresolved.length===0;
  return {prediction:result,auxiliary,steps,offsetProvenance:authority?.provenance??null};
 }catch(error){issue([],String(error?.message??'invalid-model-output'));result.coverage.complete=false;result.requests=[];result.requestCount=null;result.ranges=[];return {prediction:result,auxiliary,steps};}
}
function canonicalContext(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonicalContext).join(',')+']';const compare=(a,b)=>{const x=Array.from(a),y=Array.from(b);for(let i=0;i<Math.min(x.length,y.length);i++){const delta=x[i].codePointAt(0)-y[i].codePointAt(0);if(delta)return delta;}return x.length-y.length;};return '{'+Object.keys(value).sort(compare).map(key=>JSON.stringify(key)+':'+canonicalContext(value[key])).join(',')+'}';}
export function createStructuralInference({tokenizer,model,manifest,offsetAuthority=null,maxText=16384,maxContextBytes=65536,budget=4000000}={}){
 const data=copyData(manifest),layout=structuralOutputLayout(data.config);if(typeof tokenizer!=='function'||typeof model!=='function'||offsetAuthority!==null&&typeof offsetAuthority!=='function'||data.format!=='psys2.structural-onnx/1'||data.version!==1||data.rawPredictionFormat!==STRUCTURAL_RAW_FORMAT||!['fixture','trained-unverified'].includes(data.artifactRole)||data.executionEligible!==false||data.graphConfidence!==null||data.dtype!=='fp32'||data.outputCount!==59||!['modelSha256','tokenizerSha256','tokenizerConfigSha256','checkpointSha256','modelConfigSha256','trainerSha256'].every(key=>hash(data[key]))||!Number.isSafeInteger(data.config.maxLength)||data.config.maxLength<4||data.config.maxLength>512||Object.keys(data.outputs??{}).length!==Object.keys(layout).length)throw TypeError('invalid-structural-provider');
 for(const [key,shape]of Object.entries(layout))if(JSON.stringify(data.outputs[key])!==JSON.stringify(shape.map((n,i)=>i===0?'batch':n)))throw TypeError('invalid-output-metadata');
 if(![maxText,maxContextBytes,budget].every(n=>Number.isSafeInteger(n)&&n>0))throw TypeError('invalid-provider-budget');
 async function infer(text,{area,context=null}={}){
  const bad=reason=>{const prediction=packet(typeof text==='string'?text:'',area,data);prediction.unresolved.push({path:[],reason});return {prediction,auxiliary:[]};};
  try{
   if(typeof text!=='string'||!text||text.length>maxText||Array.from(text).some(c=>{const cp=c.codePointAt(0);return cp>=0xd800&&cp<=0xdfff;})||typeof area!=='string'||!area)return bad('invalid-source-input');
   const supplied=copyData({area,context},{maxBytes:maxContextBytes}),contextJson=canonicalContext(supplied),common={text_pair:[contextJson]},full=await tokenizer([text],{...common,padding:false,truncation:false}),encoded=await tokenizer([text],{...common,padding:'max_length',truncation:true,max_length:data.config.maxLength});
   if(encoded?.input_ids?.dims?.length!==2||encoded.input_ids.dims[0]!==1||full?.input_ids?.dims?.length!==2||full.input_ids.dims[0]!==1)return bad('invalid-tokenizer-output');
   if(encoded.input_ids.data.length!==encoded.input_ids.dims[1]||JSON.stringify(encoded.attention_mask?.dims)!==JSON.stringify(encoded.input_ids.dims)||encoded.attention_mask.data.length!==encoded.input_ids.data.length||full.input_ids.data.length!==full.input_ids.dims[1]||JSON.stringify(full.attention_mask?.dims)!==JSON.stringify(full.input_ids.dims))return bad('invalid-tokenizer-output');
   const tokenIds=Array.from(encoded.input_ids.data,Number),attentionMask=Array.from(encoded.attention_mask.data,Number),fullTokenIds=Array.from(full.input_ids.data,Number),fullAttentionMask=Array.from(full.attention_mask.data,Number),truncated=fullAttentionMask.filter(n=>n===1).length>attentionMask.filter(n=>n===1).length;
   let offsets=null,offsetError=false;if(offsetAuthority)try{offsets=await offsetAuthority(copyData({text,contextJson,tokenIds,attentionMask,fullTokenIds,fullAttentionMask,maxLength:data.config.maxLength}));}catch{offsetError=true;}
   const outputs=await model({input_ids:encoded.input_ids,attention_mask:encoded.attention_mask}),result=decodeStructuralOutputs({manifest:data,outputs,text,area,tokenIds,attentionMask,offsets,truncated,budget});
   if(offsetError){result.prediction.unresolved.push({path:['source'],reason:'offset-authority-failed'});result.prediction.coverage.complete=false;}
   result.artifactRole=data.artifactRole;result.graphConfidence=null;result.truncation={pair:truncated,source:truncated?'unknown':false,context:truncated?'unknown':false};return result;
  }catch(error){return bad(String(error?.message??'structural-inference-failed'));}
 }
 return Object.freeze({infer,propose:async(text,options)=>((await infer(text,options)).prediction)});
}
