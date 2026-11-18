// Actual two-stage neural computation. Artifact loading and empirical admission are separate.
import {validateKeyReaderLayout} from './key-reader-layout.mjs?v=13da6b9284';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=ca9bb682f6';
import {canonicalLiteralProof,positiveIntegerLiteralProof} from './key-reader-value-proof.mjs?v=dfe8bef1f0';
import {selectedProbability,binaryDecisionProbability} from './model-selection-score.mjs?v=ac3ac10191';
import {createKeyReaderPacketAdapter} from './key-reader-packet.mjs?v=c346ee255c';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safePath=x=>typeof x==='string'&&x.split('.').every(k=>k&&!['__proto__','constructor','prototype'].includes(k))&&x.split('.').length<=4;
function scalarString(x){return typeof x==='string'&&!Array.from(x).some(c=>{const n=c.codePointAt(0);return n>=0xd800&&n<=0xdfff;});}
// Exact Python json.dumps(sort_keys=True,ensure_ascii=False) subset. Floating
// context spellings cannot be reconstructed from untyped JS numbers: refuse.
export function keyReaderContextJSON(value,depth=0){
 if(depth>32)throw Error('context-depth');
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='string'){if(!scalarString(value))throw Error('invalid-context-scalar');return JSON.stringify(value);}
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))throw Error('unsupported-context-number');return String(value);}
 if(Array.isArray(value))return '['+value.map(v=>keyReaderContextJSON(v,depth+1)).join(', ')+']';
 if(!object(value))throw Error('invalid-context-value');
 const compare=(a,b)=>{const x=Array.from(a),y=Array.from(b);for(let i=0;i<Math.min(x.length,y.length);i++){const d=x[i].codePointAt(0)-y[i].codePointAt(0);if(d)return d;}return x.length-y.length;};
 return '{'+Object.keys(value).sort(compare).map(k=>keyReaderContextJSON(k,depth+1)+': '+keyReaderContextJSON(value[k],depth+1)).join(', ')+'}';
}
/** Fit context to the actual artifact budget; never shorten the utterance. */
export async function fitKeyReaderContext(tokenizer,text,area,context,maxLength){
 const copy=value=>copyHostData(value,{maxBytes:4000000});
 const measure=async value=>{const json=keyReaderContextJSON({area,context:value}),full=await tokenizer([text],{text_pair:[json],padding:false,truncation:false});return {context:value,json,full,tokens:tokenRow(full.attention_mask).reduce((sum,value)=>sum+value,0)};};
 const original=await measure(context),summary={profile:'utterance-first-context/1',originalTokens:original.tokens,maxLength,originalExisting:Array.isArray(context?.existing)?context.existing.length:0,includedExisting:Array.isArray(context?.existing)?context.existing.length:0,omittedNames:[],omittedPrevious:false};
 if(original.tokens<=maxLength)return {...original,summary:{...summary,fittedTokens:original.tokens}};
 if(!object(context)||!Array.isArray(context.existing))return {...original,summary:{...summary,fittedTokens:original.tokens}};
 const base={...copy(context),existing:[],...(Object.hasOwn(context,'previous')?{previous:null}:{})},empty=await measure(base);
 if(empty.tokens>maxLength)return {...empty,summary:{...summary,includedExisting:0,omittedPrevious:context.previous!==null&&context.previous!==undefined,fittedTokens:empty.tokens}};
 const rows=[];
 for(const [index,item]of context.existing.entries()){
  let row=copy(item);
  // Keep the entity's declared kind when a long display label alone exhausts context.
  if(typeof row.name==='string'&&row.name.length>maxLength){const single=await measure({...base,existing:[row]});if(single.tokens>maxLength){delete row.name;summary.omittedNames.push(index);}}
  rows.push(row);
 }
 let low=0,high=rows.length,best=empty;
 while(low<=high){const count=Math.floor((low+high)/2),candidate=await measure({...base,existing:rows.slice(0,count)});if(candidate.tokens<=maxLength){best=candidate;low=count+1;}else high=count-1;}
 if(context.previous!==null&&context.previous!==undefined){const previous=await measure({...best.context,previous:context.previous});if(previous.tokens<=maxLength)best=previous;else summary.omittedPrevious=true;}
 return {...best,summary:{...summary,includedExisting:best.context.existing.length,fittedTokens:best.tokens}};
}
function choice(values){let max=-Infinity,index=-1,tied=false;for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v))throw Error('nonfinite-logit');if(v>max){max=v;index=i;tied=false;}else if(v===max)tied=true;}return tied||index<0?null:index;}
function setPath(row,path,value){const parts=path.split('.');let at=row;for(const part of parts.slice(0,-1)){if(!Object.hasOwn(at,part))at[part]={};if(!object(at[part]))throw Error('conflicting-raw-route');at=at[part];}at[parts.at(-1)]=value;}
function support(config){return config.keys.map(key=>({key,presence:config.registry[key].role==='derived'?'untrained':'learned-uncalibrated',value:config.registry[key].role==='derived'?'untrained':config.registry[key].role==='metadata'&&!Object.hasOwn(config.banks,key)?'unsupported':Object.hasOwn(config.banks,key)?'declared-class':'source-copy-normalization-unresolved'}));}
function tensorValues(value,dims,tick){
 if(!value||!same(value.dims,dims)||!value.data||value.data.length!==dims.reduce((a,b)=>a*b,1))throw Error('invalid-neural-output-shape');
 const out=[];for(const item of value.data){tick();if(typeof item!=='number'||!Number.isFinite(item))throw Error('nonfinite-neural-output');out.push(item);}return out;
}
function tokenRow(value){if(!value||value.dims?.length!==2||value.dims[0]!==1||!Number.isSafeInteger(value.dims[1])||value.dims[1]<1||value.data?.length!==value.dims[1])throw Error('invalid-tokenizer-tensor');const result=Array.from(value.data,Number);if(result.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('invalid-tokenizer-value');return result;}
function checkOffsets(authority,text,tokenIds,mask,manifest,tick){
 const a=copyHostData(authority),n=tokenIds.length,chars=Array.from(text);
 if(!object(a)||a.unit!=='unicode-scalar'||!same(a.tokenIds,tokenIds)||!same(a.attentionMask,mask)||!a.provenance||a.provenance.tokenizerSha256!==manifest.tokenizerSha256||!hash(a.provenance.profileSha256)||typeof a.provenance.id!=='string'||!Number.isSafeInteger(a.provenance.version)||a.provenance.version<1||!['offsets','sequenceIds','specialTokensMask'].every(k=>Array.isArray(a[k])&&a[k].length===n))throw Error('exact-source-offsets-unavailable');
 let last=0,context=false;
 for(let i=0;i<n;i++){tick();const seq=a.sequenceIds[i],range=a.offsets[i],special=a.specialTokensMask[i];if(![null,0,1].includes(seq)||![0,1].includes(special)||mask[i]===0&&(seq!==null||range!==null))throw Error('invalid-offset-authority');if(seq===1)context=true;if(seq!==0||special||mask[i]===0){if(range!==null)throw Error('nonsource-offset');continue;}if(context||!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<last||range[0]>=range[1]||range[1]>chars.length)throw Error('invalid-source-offset');last=range[1];}
 if(a.specialTokensMask[0]!==1||a.sequenceIds[0]!==null)throw Error('missing-cls-authority');return a;
}
function spansFor(values,keyIndex,length,authority,mask,tick){
 const spans=[];let active=null;
 for(let i=0;i<length;i++){tick();if(authority.sequenceIds[i]!==0||authority.specialTokensMask[i]||mask[i]===0){if(active){spans.push(active);active=null;}continue;}const base=(keyIndex*length+i)*3,tag=choice(values.slice(base,base+3));if(tag===null)return {spans:[],reason:'ambiguous-BIO-label'};if(tag===2&&!active)return {spans:[],reason:'illegal-I-after-O'};if(tag!==2&&active){spans.push(active);active=null;}if(tag===1)active={tokens:[i,i+1],range:[...authority.offsets[i]]};else if(tag===2){active.tokens[1]=i+1;active.range[1]=authority.offsets[i][1];}}
 if(active)spans.push(active);return {spans,reason:null};
}
/** Host supplies verified loaded ONNX sessions/tensor constructor and exact offset
 * authority. No file/model I/O or inference runs occur during construction. */
export async function createKeyReaderInference({manifest,tokenizer,encoder,heads,makeTensor,offsetAuthority,recordDiagnostics,maxText=16384,maxContextBytes=65536,maxQueries=4096,budget=4000000}={}){
 const m=copyHostData(manifest),configJSON=m?.configJSON;
 if(m?.format!=='sop.key-reader-runtime/1'||!['trained-unverified','fixture'].includes(m.artifactRole)||m.dtype!=='fp32'||!['fp32','q8-dynamic'].includes(m.weightRepresentation)||m.executionEligible!==false||m.graphConfidence!==null||typeof configJSON!=='string'||!['configSha256','checkpointSha256','encoderSha256','headsSha256','tokenizerSha256','preparerSha256','trainerSha256','codecSha256'].every(k=>hash(m[k]))||typeof tokenizer!=='function'||typeof encoder!=='function'||typeof heads!=='function'||typeof makeTensor!=='function'||typeof offsetAuthority!=='function'||typeof recordDiagnostics!=='function'||![maxText,maxContextBytes,maxQueries,budget].every(n=>Number.isSafeInteger(n)&&n>0)||maxQueries>4096)throw Error('invalid-key-runtime-profile');
 if(await digest(configJSON)!==m.configSha256)throw Error('config-hash-mismatch');const config=copyHostData(JSON.parse(configJSON));
 const layout=validateKeyReaderLayout(config);
 const inputPadding=config.inputPadding??'max_length';
 if(!['max_length','dynamic'].includes(inputPadding))throw Error('invalid-input-padding');
 let preparerValid=config.preparerSha256===m.preparerSha256;
 if(!config.preparerSha256&&typeof m.dataManifestJSON==='string'&&new TextEncoder().encode(m.dataManifestJSON).length<=4000000&&hash(config.dataManifestSha256)&&await digest(m.dataManifestJSON)===config.dataManifestSha256)preparerValid=JSON.parse(m.dataManifestJSON).scriptSha256===m.preparerSha256;
 if(!Number.isSafeInteger(m.hiddenWidth)||m.hiddenWidth<1||m.hiddenWidth>4096||!object(m.rawRoutes)||!object(m.rawRoutes.globals)||!object(m.rawRoutes.metadata)||config.trainerSha256!==m.trainerSha256||!preparerValid||config.encoderFiles?.['tokenizer.json']!==m.tokenizerSha256)throw Error('incompatible-key-runtime-layout');
 const globals=config.keys.filter(k=>config.registry[k].role==='global'),metadata=config.keys.filter(k=>config.registry[k].role==='metadata');
 for(const [map,keys]of [[m.rawRoutes.globals,globals],[m.rawRoutes.metadata,metadata]]){
  if(Object.keys(map).length!==keys.length||keys.some(k=>!Object.hasOwn(map,k)||!safePath(map[k])))throw Error('incomplete-raw-route-map');
  const paths=Object.values(map);if(new Set(paths).size!==paths.length||paths.some(p=>paths.some(q=>p!==q&&p.startsWith(q+'.'))))throw Error('conflicting-raw-route-map');
 }
 const decoderVersion=4,literalProofContract='sop.key-literal-proof/1',contextPolicy='utterance-first-context/1';
 const composite=await digest(JSON.stringify({decoderVersion,literalProofContract,contextPolicy,config:m.configSha256,checkpoint:m.checkpointSha256,encoder:m.encoderSha256,heads:m.headsSha256,tokenizer:m.tokenizerSha256,preparer:m.preparerSha256,trainer:m.trainerSha256,codec:m.codecSha256,dtype:m.dtype,weightRepresentation:m.weightRepresentation,rawRoutes:m.rawRoutes}));
 const model={sha256:composite,tokenizerSha256:m.tokenizerSha256,codecSha256:m.codecSha256,decoderVersion};
 const adapter=await createKeyReaderPacketAdapter({configJSON,configSha256:m.configSha256,model});
 const banks=[],bankMap=new Map();let width=0;
 for(const key of config.keys)if(Object.hasOwn(config.banks,key)){const row={key,start:width,end:width+config.banks[key].length};banks.push(row);bankMap.set(key,row);width=row.end;}
 if(width>65536)throw Error('class-output-layout-budget');
 const provenance={format:m.format,artifactRole:m.artifactRole,model,configSha256:m.configSha256,encoderSha256:m.encoderSha256,headsSha256:m.headsSha256,checkpointSha256:m.checkpointSha256,weightRepresentation:m.weightRepresentation,calibration:null,executionEligible:false};
 async function infer(text,{area,context=null}={}){
  let steps=0;const tick=(n=1)=>{steps+=n;if(steps>budget)throw Error('key-runtime-budget');};
  const raw={source:{text:typeof text==='string'?text:'',unit:'unicode-scalar'},request:{span:typeof text==='string'?text:'',target:{},constraints:[]},ranges:[],coverage:{complete:false,truncated:false,support:support(config)},unresolved:[],model};
  const auxiliary={queryCount:0,selectedLogits:[],minimumProbability:null,valueProofs:[]};
  const probability=value=>{auxiliary.minimumProbability=Math.min(auxiliary.minimumProbability??1,value);};let offsetProvenance=null;
  const issue=(reason,key=null)=>raw.unresolved.push({reason,...(key?{key}:{})});
  try{
   if(!scalarString(text)||!text||Array.from(text).length>maxText||typeof area!=='string'||!area)throw Error('invalid-source-input');
   const chars=Array.from(text),fitted=await fitKeyReaderContext(tokenizer,text,area,copyHostData(context,{maxBytes:maxContextBytes}),config.maxLength),contextJSON=fitted.json,pair={text_pair:[contextJSON]};auxiliary.contextSelection=fitted.summary;
   const full=fitted.full,encoded=await tokenizer([text],{...pair,padding:inputPadding==='dynamic'?false:'max_length',truncation:true,max_length:config.maxLength});
   const ids=tokenRow(encoded.input_ids),mask=tokenRow(encoded.attention_mask),fullIds=tokenRow(full.input_ids),fullMask=tokenRow(full.attention_mask),length=ids.length;
   if(length>config.maxLength||(inputPadding==='max_length'&&length!==config.maxLength)||mask.length!==length||fullMask.length!==fullIds.length||[...mask,...fullMask].some(n=>n!==0&&n!==1))throw Error('invalid-tokenizer-shape');
   raw.coverage.truncated=fullMask.reduce((a,b)=>a+b,0)>mask.reduce((a,b)=>a+b,0);if(raw.coverage.truncated)throw Error('source-or-context-truncated');
   const authority=checkOffsets(await offsetAuthority({text,contextJson:contextJSON,tokenIds:ids,attentionMask:mask,fullTokenIds:fullIds,fullAttentionMask:fullMask,maxLength:config.maxLength}),text,ids,mask,m,tick);offsetProvenance=authority.provenance;
   const output=await encoder({input_ids:encoded.input_ids,attention_mask:encoded.attention_mask});
   const hidden=tensorValues(output.hidden,[1,length,m.hiddenWidth],tick),bio=tensorValues(output.bio_logits,[1,config.bioKeys.length,length,3],tick),presence=tensorValues(output.presence_logits,[1,config.keys.length],tick);
   for(let i=0;i<presence.length;i++)if(config.registry[config.keys[i]].role!=='derived')probability(binaryDecisionProbability(presence[i]));
   const byKey=new Map();for(let i=0;i<config.bioKeys.length;i++){tick();const value=spansFor(bio,i,length,authority,mask,tick);byKey.set(config.bioKeys[i],value.spans);if(value.reason)issue(value.reason,config.bioKeys[i]);}
   const queries=[{kind:'global',span:[0,1],index:-1}],queryMap=new Map();
   for(const key of config.keys){tick();if(config.registry[key].role!=='domain')continue;for(const span of byKey.get(key)??[]){tick();if(queries.length>=maxQueries)throw Error('mention-query-overflow');queryMap.set(key+':'+span.tokens.join(':'),queries.length);queries.push({kind:'domain',key,span:span.tokens,index:config.keys.indexOf(key)});}}
   if(queries.length*width>4194304)throw Error('class-output-budget');auxiliary.queryCount=queries.length;
   const result=await heads({hidden:makeTensor('float32',Float32Array.from(hidden),[length,m.hiddenWidth]),spans:makeTensor('int64',BigInt64Array.from(queries.flatMap(q=>q.span),BigInt),[queries.length,2]),key_indices:makeTensor('int64',BigInt64Array.from(queries.map(q=>q.index),BigInt),[queries.length])});
   const logits=tensorValues(result.class_logits,[queries.length,width],tick),emitted=new Set();
   const field=(key,row)=>{const layout=bankMap.get(key);if(!layout)throw Error('missing-class-layout');const values=logits.slice(row*width+layout.start,row*width+layout.end),index=choice(values);tick(values.length);if(index===null){issue('invalid-or-ambiguous-class',key);return {exists:false};}probability(selectedProbability(values,index));const entry=config.banks[key][index];auxiliary.selectedLogits.push({key,query:row,index,logit:values[index]});if(entry.state==='absent')return {exists:false};if(entry.state!=='value'){issue('unknown-class',key);return {exists:false};}return {exists:true,value:copyHostData(entry.value)};};
   for(let ki=0;ki<config.keys.length;ki++){
    tick();const key=config.keys[ki],spec=config.registry[key],spans=byKey.get(key)??[],present=presence[ki]===0?null:presence[ki]>0;if(present===null)issue('unknown-presence',key);if(spec.role==='derived')continue;
    if(spec.role==='global'){
     const path=m.rawRoutes.globals[key];
     if(bankMap.has(key)){const f=field(key,0);if(present!==null&&present!==f.exists)issue('presence-class-inconsistent',key);if(f.exists){setPath(raw.request,path,f.value);emitted.add(key);}}
     else{
      if(present!==null&&present!==Boolean(spans.length))issue('presence-span-inconsistent',key);if(spans.length>1)issue('ambiguous-global-mention',key);
      if(spans.length===1){const range=spans[0].range,value=chars.slice(...range).join('');setPath(raw.request,path,value);emitted.add(key);let anchor=path.endsWith('_span')?path:path+'_span';if(['target.count','turn.repeat_count'].includes(path)){const [a,b]=path.split('.');const proof=positiveIntegerLiteralProof(value);if(proof){raw.request[a][b]=proof.value;auxiliary.valueProofs.push({key,range:[...range],...proof});}else{delete raw.request[a][b];issue('unresolved-numeric-normalization',key);}}if(path==='question.asked_key'){issue('unsupported-question-key-copy',key);}else{setPath(raw.request,anchor,value);raw.ranges.push({path:anchor.split('.'),range:[...range]});}}
     }
     if(path==='act'){if(spans.length===1){const range=spans[0].range;raw.request.trigger=chars.slice(...range).join('');raw.ranges.push({path:['trigger'],range:[...range]});}else issue('missing-or-ambiguous-act-anchor',key);}
    }else if(spec.role==='domain'){
     if(present!==null&&present!==Boolean(spans.length))issue('presence-span-inconsistent',key);if(spec.area!==area){if(present||spans.length)issue('cross-area-key-unresolved',key);continue;}
     for(const span of spans){tick();const query=queryMap.get(key+':'+span.tokens.join(':')),value=chars.slice(...span.range).join(''),condition={key:spec.type+'.'+spec.key,value_span:value},index=String(raw.request.constraints.length);
      if(bankMap.has(key)){
       const layout=bankMap.get(key),values=logits.slice(query*width+layout.start,query*width+layout.end),proof=canonicalLiteralProof(config.banks[key],value,values,tick);
       if(proof){condition.value=proof.value;auxiliary.valueProofs.push({key,query,range:[...span.range],literal:value,...proof});const c=proof.classifier;if(c.index!==null)auxiliary.selectedLogits.push({key,query,index:c.index,logit:values[c.index],probability:c.probability,role:'source-proof-alternative'});}
       else{const f=field(key,query);if(f.exists)condition.value=f.value;else issue('unresolved-domain-value',key);}
      }else condition.value=value;
      for(const meta of config.metadataKeys){tick();const f=field(meta,query);if(f.exists){setPath(condition,m.rawRoutes.metadata[meta],f.value);emitted.add(meta);}}
      raw.request.constraints.push(condition);raw.ranges.push({path:['constraints',index,'value_span'],range:[...span.range]});if(typeof condition.value==='string'&&condition.value===value)raw.ranges.push({path:['constraints',index,'value'],range:[...span.range]});else if(Object.hasOwn(condition,'value'))issue('normalization-requires-declared-proof',key);
     }
    }else if(spec.role==='metadata'&&!config.metadataKeys.includes(key)&&present)issue('unsupported-metadata-head',key);
   }
   for(const key of config.metadataKeys){tick();const p=presence[config.keys.indexOf(key)];if(p!==0&&(p>0)!==emitted.has(key))issue('metadata-presence-inconsistent',key);}
   if(typeof raw.request.target.type!=='string'||!layout.targetFamilies[area]?.includes(raw.request.target.type)){delete raw.request.target.type;issue('missing-unknown-or-cross-area-target-type');}
   if(m.artifactRole==='fixture')issue('fixture-model-untrained');
   raw.coverage.complete=raw.unresolved.length===0;
  }catch(error){issue(String(error?.message??'key-inference-failed'));raw.coverage.complete=false;}
  const adapted=adapter.adapt(raw);return {raw,packet:adapted.packet,diagnostics:{...adapted.diagnostics,valueProofs:copyHostData(auxiliary.valueProofs)},provenance:copyHostData(provenance),auxiliary,offsetProvenance,graphConfidence:null,steps};
 }
 return {provenance:()=>copyHostData(provenance),infer,async read(text,context){const result=await infer(text,context);await recordDiagnostics(result);if(!result.packet)throw Error('invalid-key-model-packet');return result.packet;}};
}
