// C1 diagnostic only: exact eight-source tokenization, no model/session calls.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>equal(canonical(a),canonical(b));
function ranges(value,length){
 if(!Array.isArray(value)||value.length>32)throw Error('invalid-predicted-cuts');
 let previous=0;
 for(const span of value){if(!Array.isArray(span)||span.length!==2||!span.every(Number.isSafeInteger)||span[0]<previous||span[0]<0||span[0]>=span[1]||span[1]>length)throw Error('invalid-predicted-cuts');previous=span[1];}
 return value;
}
export function makePlan(inputs,nodeRows,pythonCases){
 if(inputs.length!==8||nodeRows.length!==8||pythonCases.length!==8)throw Error('exact-eight-required');
 const index=rows=>{const out=new Map();for(const row of rows){if(typeof row.id!=='string'||out.has(row.id))throw Error('duplicate-case');out.set(row.id,row);}return out;};
 const nodes=index(nodeRows),python=index(pythonCases),seen=new Set(),requests=[],cases=[];
 for(const row of inputs){
  if(!row||Object.keys(row).sort().join(',')!=='area,context,id,text'||typeof row.text!=='string'||typeof row.area!=='string'||typeof row.id!=='string'||seen.has(row.id))throw Error('source-only-input-required');
  seen.add(row.id);const node=nodes.get(row.id),reference=python.get(row.id);
  if(!node||!reference||node.sourceTextSha256!==sha(Buffer.from(row.text))||node.area!==row.area)throw Error('source-identity-mismatch');
  const context=node.result?.sourceContext;
  if(!context||Object.keys(context).sort().join(',')!=='area,context')throw Error('missing-actual-node-context');
  const diagnostics=node.result.diagnostics.filter(x=>x.component==='cutter');
  if(diagnostics.length!==1||diagnostics[0].result.packet.source.text!==row.text)throw Error('missing-exact-cutter-diagnostic');
  const chars=Array.from(row.text),nodeCuts=ranges(diagnostics[0].result.packet.spans,chars.length),pythonCuts=ranges(reference.pipeline.cutter.spans,chars.length);
  cases.push({id:row.id,sourceTextSha256:sha(Buffer.from(row.text)),contextEqual:same(context,{area:row.area,context:row.context}),cutsEqual:equal(nodeCuts,pythonCuts),nodeCuts,pythonCuts});
  requests.push({id:row.id,entryId:JSON.stringify([row.id,'cutter']),kind:'cutter',text:row.text,sourceRange:null,origins:['whole-message'],
   nodeContext:null,pythonContext:null});
  const union=new Map();
  const add=(range,origin)=>{const key=JSON.stringify(range);if(!union.has(key))union.set(key,{range,origins:[]});union.get(key).origins.push(origin);};
  if(chars.length)add([0,chars.length],'whole-message-control');
  for(const span of nodeCuts)add(span,'node-predicted');
  for(const span of pythonCuts)add(span,'python-predicted');
  for(const {range,origins}of [...union.values()].sort((a,b)=>a.range[0]-b.range[0]||a.range[1]-b.range[1])){
   requests.push({id:row.id,entryId:JSON.stringify([row.id,'key',range]),kind:'key',text:chars.slice(...range).join(''),sourceRange:range,origins,
    nodeContext:context,pythonContext:{area:row.area,context:row.context}});
  }
 }
 if(nodes.size!==seen.size||python.size!==seen.size)throw Error('case-set-mismatch');
 if(requests.length>64)throw Error('eight-cut-diagnostic-bound');
 return {format:'sop.actual-eight-tokenizer-plan/1',caseCount:8,sourceOnly:true,annotationGold:false,cases,requests};
}
export function compareEntries(node,python){
 if(node.length!==python.length)throw Error('tokenizer-entry-count-mismatch');
 const lookup=new Map(python.map(row=>[row.entryId,row]));
 if(lookup.size!==python.length)throw Error('duplicate-tokenizer-entry');
 const rows=[];
 for(const row of node){
  const other=lookup.get(row.entryId);if(!other)throw Error('tokenizer-entry-id-mismatch');
  const fields=['text','contextJSON','contextUTF8Sha256','full','padded','sourceOffsetError'];
  const mismatches=fields.filter(field=>!same(row[field],other[field]));
  rows.push({entryId:row.entryId,id:row.id,kind:row.kind,sourceRange:row.sourceRange,origins:row.origins,
   equal:mismatches.length===0,mismatches,
   nodeFeedSha256:sha(JSON.stringify({input_ids:row.padded.inputIds,attention_mask:row.padded.attentionMask})),
   pythonFeedSha256:sha(JSON.stringify({input_ids:other.padded.inputIds,attention_mask:other.padded.attentionMask}))});
 }
 return rows;
}
async function boundedJSON(path,maxBytes=4000000){const body=await readFile(path);if(body.length>maxBytes)throw Error('diagnostic-json-bound');return {body,value:JSON.parse(body.toString('utf8'))};}
export async function run(options){
 const required=['spec','inputs','nodeReport','pythonReport','pythonTokenizer','python','hostModule','keyModule','offsetModule','out'];
 if(required.some(key=>typeof options[key]!=='string'||!options[key]))throw Error('missing-diagnostic-path');
 const paths=Object.fromEntries(required.filter(k=>!['python','pythonTokenizer','out'].includes(k)).map(k=>[k,resolve(options[k])]));
 const original={};for(const [key,path]of Object.entries(paths))original[key]=sha(await readFile(path));
 const spec=(await boundedJSON(paths.spec)).value;
 const nodeReport=(await boundedJSON(paths.nodeReport,16000000)).value,pythonReport=(await boundedJSON(paths.pythonReport)).value;
 const inputBody=await readFile(paths.inputs);if(inputBody.length>1000000)throw Error('eight-input-bound');
 const inputs=inputBody.toString('utf8').trim().split('\n').map(JSON.parse);
 if(pythonReport.inputSha256!==sha(inputBody)||nodeReport.verified?.manifestSha256!==spec.manifestSha256||nodeReport.runtimeTree?.sha256!==spec.runtimeTreeSha256)throw Error('frozen-report-identity-mismatch');
 const plan=makePlan(inputs,nodeReport.rows,pythonReport.cases);
 const artifactRoot=await realpath(spec.artifactRoot);
 const local=async descriptor=>{
  const path=await realpath(resolve(artifactRoot,descriptor.path)),rel=relative(artifactRoot,path);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('tokenizer-artifact-escape');
  const body=await readFile(path);if(sha(body)!==descriptor.sha256||descriptor.bytes!==undefined&&body.length!==descriptor.bytes)throw Error('tokenizer-artifact-hash');
  return {body,path};
 };
 const token=await local(spec.tokenizerArtifact),configuration=await local(spec.tokenizerConfig);
 const runtime=await realpath(resolve(spec.runtimeRoot,spec.transformersModule)),rel=relative(await realpath(spec.runtimeRoot),runtime);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('runtime-module-escape');
 const packagePath=resolve(spec.runtimeRoot,'@huggingface/transformers/package.json'),packageData=await boundedJSON(packagePath);
 if(packageData.value.version!=='3.8.1')throw Error('unexpected-transformers-version');
 original.transformersPackage=sha(packageData.body);
 original.transformersModule=sha(await readFile(runtime));original.tokenizerJSON=sha(token.body);original.tokenizerConfig=sha(configuration.body);
 const host=await import(pathToFileURL(paths.hostModule).href),key=await import(pathToFileURL(paths.keyModule).href),offsets=await import(pathToFileURL(paths.offsetModule).href);
 const transformers=await import(pathToFileURL(runtime).href);transformers.env.allowRemoteModels=false;
 const profile=JSON.parse(token.body),rawConfig=JSON.parse(configuration.body);
 const constructorConfig=host.bertRuntimeConfiguration(profile,rawConfig); // Actual verified host policy, not another adapter.
 const tokenizer=new transformers.BertTokenizer(profile,constructorConfig);
 const authority=await offsets.createBertSourceOffsetAuthority({tokenizer,tokenizerJSON:token.body.toString('utf8'),tokenizerSha256:spec.tokenizerArtifact.sha256});
 const entries=[];
 for(const request of plan.requests){
  const contextJSON=request.kind==='cutter'?null:key.keyReaderContextJSON(request.nodeContext);
  const pair=contextJSON===null?{}:{text_pair:[contextJSON]},common={...pair,return_tensor:false};
  const full=await tokenizer([request.text],{...common,padding:false,truncation:false});
  const padded=await tokenizer([request.text],{...common,padding:'max_length',truncation:true,max_length:192});
  const fullIds=full.input_ids[0],fullMask=full.attention_mask[0],ids=padded.input_ids[0],mask=padded.attention_mask[0];
  let sourceOffsetError=null,a=null;
  try{a=await authority({text:request.text,...(contextJSON===null?{}:{contextJson:contextJSON}),tokenIds:ids,attentionMask:mask,fullTokenIds:fullIds,fullAttentionMask:fullMask,maxLength:192});}
  catch(error){sourceOffsetError=String(error.message);}
  const encoded=(inputIds,attentionMask,n)=>({inputIds,attentionMask,
   sequenceIds:a?a.sequenceIds.slice(0,n):null,specialTokensMask:a?a.specialTokensMask.slice(0,n):null,
   sourceOffsets:a?a.offsets.slice(0,n):null});
  entries.push({...request,contextJSON,contextUTF8Sha256:contextJSON===null?null:sha(Buffer.from(contextJSON)),
   full:encoded(fullIds,fullMask,fullIds.length),padded:encoded(ids,mask,ids.length),sourceOffsetError,
   offsetProvenance:a?.provenance??null});
 }
 const out=resolve(options.out);await mkdir(out,{recursive:false});
 const planPath=resolve(out,'plan.json');await writeFile(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 const pythonPath=fileURLToPath(new URL('./diagnose-eight-tokenizer-python.py',import.meta.url));
 original.nodeDiagnostic=sha(await readFile(fileURLToPath(import.meta.url)));original.pythonDiagnostic=sha(await readFile(pythonPath));
 const pythonOutput=resolve(out,'python.json');
 execFileSync(options.python,[pythonPath,planPath,pythonOutput,resolve(options.pythonTokenizer),spec.tokenizerArtifact.sha256],{encoding:'utf8',maxBuffer:1000000});
 const python=(await boundedJSON(pythonOutput,16000000)).value;
 const comparisons=compareEntries(entries,python.entries);
 for(const [name,path]of Object.entries(paths))if(original[name]!==sha(await readFile(path)))throw Error('diagnostic-source-mutated');
 if(original.nodeDiagnostic!==sha(await readFile(fileURLToPath(import.meta.url)))||original.pythonDiagnostic!==sha(await readFile(pythonPath))||original.transformersPackage!==sha(await readFile(packagePath)))throw Error('diagnostic-implementation-mutated');
 if(original.transformersModule!==sha(await readFile(runtime))||original.tokenizerJSON!==sha((await local(spec.tokenizerArtifact)).body)||original.tokenizerConfig!==sha((await local(spec.tokenizerConfig)).body))throw Error('tokenizer-runtime-mutated');
 const nodeOutput=resolve(out,'node.json');await writeFile(nodeOutput,JSON.stringify({entries},null,2)+'\n',{flag:'wx'});
 const report={format:'sop.actual-eight-tokenizer-parity/1',complete:true,caseCount:8,tokenizationEntries:entries.length,
  sourceOnly:true,annotationGold:false,modelCalls:0,caseContextsAndCuts:plan.cases,comparisons,
  allTokenizerInputsEqual:comparisons.every(x=>x.equal),allModelFeedsEqual:comparisons.every(x=>x.nodeFeedSha256===x.pythonFeedSha256),
  sourceHashes:original,planSha256:sha(await readFile(planPath)),nodeOutputSha256:sha(await readFile(nodeOutput)),
  pythonOutputSha256:sha(await readFile(pythonOutput)),pythonProvenance:python.provenance,
  nodeProvenance:{transformersVersion:packageData.value.version,runtimeModule:runtime,constructorPolicy:'actual-host bertRuntimeConfiguration',
   constructorConfigSha256:sha(JSON.stringify(constructorConfig)),runtimeTreeReceipt:nodeReport.runtimeTree,
   runtimeTreeVerification:'retained verified eight-probe receipt; direct module/source hashes rechecked here'},
  backendHandoff:'If feeds equal, compare actual numeric outputs on these exact padded feeds; no tokenizer fix inferred.',
  semanticAccuracy:null,calibration:null,executionEligible:false};
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({caseCount:8,entries:entries.length,allTokenizerInputsEqual:report.allTokenizerInputsEqual,
  allModelFeedsEqual:report.allModelFeedsEqual,differingCuts:plan.cases.filter(x=>!x.cutsEqual).map(x=>x.id),report:resolve(out,'report.json')}));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const options={};for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i].replace(/^--/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());options[name]=process.argv[i+1];}
 await run(options);
}
