// SPDX-License-Identifier: AGPL-3.0-only
// Fixed-threshold auxiliary q8 calibration; never a request graph/confidence gate.
import {createReadStream,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';import {createGunzip} from 'node:zlib';import {createInterface} from 'node:readline';import {spawn} from 'node:child_process';import {resolve,dirname,basename} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
const metrics=['pairs','correct','positivePairs','tp','fp','fn','tn','spanRequested','spanAligned','spanCorrect','spanUnsupportedTokenization'];
export const emptyCounts=()=>Object.fromEntries(metrics.map(key=>[key,0]));
const sum=(a,b)=>{for(const key of metrics)a[key]+=b[key]??0;return a;};
export function summarizeCounts(count){return {...count,pairAccuracy:count.pairs?count.correct/count.pairs:null,positivePrecision:count.tp+count.fp?count.tp/(count.tp+count.fp):null,positiveRecall:count.tp+count.fn?count.tp/(count.tp+count.fn):null,negativeOnlyAccuracy:count.pairs?(count.tn+count.fp)/count.pairs:null,spanExact:count.spanAligned?count.spanCorrect/count.spanAligned:null};}
/** Alignment indices are supplied by the exact Python reference tokenizer, never
 * reconstructed from decoded WordPieces. A mismatch makes span scoring unknown. */
export function measurePair({row,logit,spanLogits,alignment,tokenParity}){
 if(!row||![0,1].includes(row.label)||typeof logit!=='number'||!Number.isFinite(logit)||!Array.isArray(spanLogits)||!spanLogits.length||spanLogits.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw Error('invalid-calibration-output');
 const result=emptyCounts(),truth=row.label===1,prediction=logit>=0;result.pairs=1;result.correct=Number(prediction===truth);result.positivePairs=Number(truth);result[prediction?(truth?'tp':'fp'):(truth?'fn':'tn')]=1;result.spanRequested=Number(Array.isArray(row.span));
 if(result.spanRequested&&!tokenParity)result.spanUnsupportedTokenization=1;
 if(tokenParity&&alignment!==null){
  if(!Array.isArray(alignment)||alignment.length!==2||alignment.some(n=>!Number.isSafeInteger(n)||n<0||n>=spanLogits.length)||alignment[0]>alignment[1])throw Error('invalid-reference-alignment');
  result.spanAligned=1;const argmax=channel=>spanLogits.reduce((best,pair,index)=>pair[channel]>spanLogits[best][channel]?index:best,0);result.spanCorrect=Number(argmax(0)===alignment[0]&&argmax(1)===alignment[1]);
 }
 return result;
}
export const scalarCounts=(group)=>Object.values(group).reduce((a,b)=>sum(a,b),emptyCounts());
const hashFile=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
// One persistent local reference tokenizer, bounded to one batch in flight. It
// sees calibration labels only to align known source offsets for evaluation.
const alignmentProgram=String.raw`
import sys,json
from transformers import AutoTokenizer
import transformers,tokenizers
path,maxlen=sys.argv[1],int(sys.argv[2]);tok=AutoTokenizer.from_pretrained(path,local_files_only=True)
print(json.dumps({'ready':True,'versions':{'python':sys.version.split()[0],'transformers':transformers.__version__,'tokenizers':tokenizers.__version__}}),flush=True)
for line in sys.stdin:
 rows=json.loads(line);x=tok([r['text']for r in rows],[r['query']for r in rows],padding=True,truncation=True,max_length=maxlen,return_offsets_mapping=True)
 aligned=[]
 for i,row in enumerate(rows):
  span=row['span'];offsets=x['offset_mapping'][i];seq=x.sequence_ids(i);indices=[j for j,(a,b)in enumerate(offsets)if seq[j]==0 and span and a>=span[0]and b<=span[1]and b>a]
  exact=bool(indices)and offsets[indices[0]][0]==span[0]and offsets[indices[-1]][1]==span[1]
  aligned.append([indices[0],indices[-1]]if exact else None)
 print(json.dumps({'ids':x['input_ids'],'mask':x['attention_mask'],'alignment':aligned}),flush=True)
`;
function alignmentBridge(python,modelDir,maxLength){
 const child=spawn(python,['-u','-c',alignmentProgram,modelDir,String(maxLength)],{stdio:['pipe','pipe','pipe'],env:{...process.env,TOKENIZERS_PARALLELISM:'false'}});let stderr='';child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8192);});let childError;child.on('error',error=>{childError=error;});child.stdin.on('error',error=>{childError=error;});const lines=createInterface({input:child.stdout,crlfDelay:Infinity})[Symbol.asyncIterator]();
 const next=async()=>{const line=await lines.next();if(line.done)throw Error('reference-tokenizer-unavailable: '+(childError?.message??stderr));return JSON.parse(line.value);};
 return {ready:async()=>{const response=await next();if(!response.ready)throw Error('reference-tokenizer-unavailable');return response.versions;},encode:async rows=>{if(!child.stdin.write(JSON.stringify(rows)+'\n'))await new Promise((yes,no)=>{const done=()=>{child.stdin.off('error',failed);yes();},failed=error=>{child.stdin.off('drain',done);no(error);};child.stdin.once('drain',done);child.stdin.once('error',failed);});return next();},close:()=>{child.stdin.end();child.kill();}};
}
const tensorValues=(tensor,dims)=>{if(!tensor||JSON.stringify(tensor.dims)!==JSON.stringify(dims)||tensor.data.length!==dims.reduce((a,b)=>a*b,1))throw Error('model-shape-mismatch');return Array.from(tensor.data,Number);};
function validateRow(row){if(!row||typeof row.text!=='string'||typeof row.query!=='string'||!['key','concept','source'].every(k=>typeof row[k]==='string'&&row[k])||!Object.hasOwn(row,'head')||![0,1].includes(row.label)||row.span!==null&&(!Array.isArray(row.span)||row.span.length!==2||row.span.some(n=>!Number.isSafeInteger(n)||n<0)||row.span[1]<=row.span[0]))throw Error('malformed-calibration-row');}
export async function calibrateBootstrapOnnx({modelDir,runtime,data,baseline,runManifest,checkpoint,python,out,batchSize=16,maxSteps=0,threads=2}){
 if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>128||!Number.isSafeInteger(maxSteps)||maxSteps<0||!Number.isSafeInteger(threads)||threads<1||threads>8||!python||existsSync(out))throw Error('invalid-calibration-options');
 modelDir=resolve(modelDir);const manifestPath=modelDir+'/bootstrap-manifest.json',manifest=JSON.parse(readFileSync(manifestPath,'utf8')),reference=JSON.parse(readFileSync(baseline,'utf8')),run=JSON.parse(readFileSync(runManifest,'utf8'));
 const modelPath=modelDir+'/onnx/model_quantized.onnx',tokenizerPath=modelDir+'/tokenizer.json',tokenizerConfigPath=modelDir+'/tokenizer_config.json',configPath=modelDir+'/config.json';
 const hashes={checkpointSha256:await hashFile(checkpoint),tokenizerConfigSha256:await hashFile(tokenizerConfigPath),modelConfigSha256:await hashFile(configPath),pythonExecutableSha256:await hashFile(python),onnxSha256:await hashFile(modelPath),tokenizerSha256:await hashFile(tokenizerPath),dataSha256:await hashFile(data),runManifestSha256:await hashFile(runManifest),baselineSha256:await hashFile(baseline),deploymentManifestSha256:await hashFile(manifestPath)};
 if(manifest.format!=='sop.inventory-bootstrap.browser'||manifest.version!==1||!Number.isSafeInteger(manifest.maxLength)||manifest.maxLength<4||manifest.maxLength>512||Number(run.arguments.maxlen)!==manifest.maxLength||manifest.executable!==false||manifest.graphProposal!==false||reference.format!=='sop.inventory-bootstrap.calibration'||reference.checkpointSha256!==manifest.checkpointSha256||hashes.checkpointSha256!==manifest.checkpointSha256||hashes.onnxSha256!==manifest.modelSha256||hashes.tokenizerSha256!==manifest.tokenizerSha256||hashes.dataSha256!==reference.dataSha256||hashes.runManifestSha256!==manifest.runManifestSha256||hashes.baselineSha256!==manifest.calibrationSha256)throw Error('calibration-provenance-mismatch');
 const T=await import(pathToFileURL(resolve(runtime)).href);T.env.allowLocalModels=true;T.env.allowRemoteModels=false;T.env.useBrowserCache=false;T.env.localModelPath=dirname(modelDir)+'/';
 const tokenizer=await T.AutoTokenizer.from_pretrained(basename(modelDir),{local_files_only:true}),model=await T.AutoModel.from_pretrained(basename(modelDir),{device:'cpu',dtype:'q8',local_files_only:true,session_options:{intraOpNumThreads:threads}});
 const bridge=alignmentBridge(python,modelDir,manifest.maxLength),groups=Object.fromEntries(['keys','concepts','declaredHeads','areas'].map(key=>[key,{}]));for(const key of Object.keys(run.inventoryData.fieldCoverage))groups.keys[key]=emptyCounts();
 let processed=0,steps=0,tokenParityRows=0,tokenMismatchRows=0,referenceVersions;const started=Date.now();
 const evaluate=async rows=>{
  const encoded=await tokenizer(rows.map(r=>r.text),{text_pair:rows.map(r=>r.query),padding:true,truncation:true,max_length:manifest.maxLength}),[batch,length]=encoded.input_ids.dims;
  if(batch!==rows.length||length>manifest.maxLength)throw Error('tokenizer-shape-mismatch');
  const alignment=await bridge.encode(rows),ids=tensorValues(encoded.input_ids,[batch,length]),mask=tensorValues(encoded.attention_mask,[batch,length]),output=await model({input_ids:encoded.input_ids,attention_mask:encoded.attention_mask}),scores=tensorValues(output.candidate_logits,[batch]),spans=tensorValues(output.span_logits,[batch,length,2]);
  for(let i=0;i<batch;i++){
   const row=rows[i],same=Array.isArray(alignment.ids[i])&&alignment.ids[i].length===length&&alignment.ids[i].every((n,j)=>n===ids[i*length+j]&&alignment.mask[i][j]===mask[i*length+j]);same?tokenParityRows++:tokenMismatchRows++;
   const count=measurePair({row,logit:scores[i],spanLogits:Array.from({length},(_,j)=>spans.slice((i*length+j)*2,(i*length+j+1)*2)),alignment:alignment.alignment[i],tokenParity:same});
   for(const [group,key]of [['keys',row.key],['concepts',row.concept],['declaredHeads',String(row.head)],['areas',row.source.split('/').at(-2)]])sum(groups[group][key]??=emptyCounts(),count);
  }
  processed+=rows.length;steps++;if(steps%100===0)process.stderr.write(JSON.stringify({steps,processed,seconds:(Date.now()-started)/1000})+'\n');
 };
 try{
  referenceVersions=await bridge.ready();const raw=createReadStream(data),stream=data.endsWith('.gz')?raw.pipe(createGunzip()):raw,lines=createInterface({input:stream,crlfDelay:Infinity});let batch=[];
  for await(const line of lines){if(!line.trim())continue;const row=JSON.parse(line);validateRow(row);batch.push(row);if(batch.length===batchSize){await evaluate(batch);batch=[];if(maxSteps&&steps>=maxSteps)break;}}
  if(batch.length&&(!maxSteps||steps<maxSteps))await evaluate(batch);stream.destroy();raw.destroy();
 }finally{bridge.close();}
 const totals=scalarCounts(groups.keys),expected=scalarCounts(reference.keys),complete=processed===expected.pairs;
 if(complete){for(const name of ['keys','concepts','declaredHeads','areas']){if(!reference[name])throw Error('missing-baseline-groups');const keys=new Set([...Object.keys(reference[name]),...Object.keys(groups[name])]);for(const key of keys)for(const metric of ['pairs','positivePairs','spanRequested'])if((groups[name][key]?.[metric]??0)!==(reference[name][key]?.[metric]??0))throw Error('calibration-population-mismatch: '+name+'/'+key+'/'+metric);}}
 for(const [key,path]of [['checkpointSha256',checkpoint],['tokenizerConfigSha256',tokenizerConfigPath],['modelConfigSha256',configPath],['pythonExecutableSha256',python],['onnxSha256',modelPath],['tokenizerSha256',tokenizerPath],['dataSha256',data],['runManifestSha256',runManifest],['baselineSha256',baseline],['deploymentManifestSha256',manifestPath]])if(await hashFile(path)!==hashes[key])throw Error('calibration-input-changed');
 const report={format:'sop.inventory-bootstrap.onnx-calibration',version:1,executable:false,graphProposal:false,deploymentConfidenceGate:false,conditioning:'gold field instance, key, phase and candidate; not graph prediction',threshold:'fixed logit>=0; no fitting',complete,populationCountsChecked:complete,processedPairs:processed,expectedPairs:expected.pairs,steps,seconds:(Date.now()-started)/1000,checkpointSha256:manifest.checkpointSha256,...hashes,evaluatorSha256:await hashFile(fileURLToPath(import.meta.url)),alignmentBridgeSha256:createHash('sha256').update(alignmentProgram).digest('hex'),runtime:{path:resolve(runtime),sha256:await hashFile(runtime),device:'cpu',dtype:'q8',threads,batchSize,maxLength:manifest.maxLength,tokenizer:'actual Transformers.js paired source/query',referenceTokenizer:referenceVersions,spanReference:'local Python tokenizer exact original Unicode scalar offsets; scored only on token-ID/mask parity'},tokenization:{parityRows:tokenParityRows,mismatchRows:tokenMismatchRows,spanComparable:tokenMismatchRows===0},totals:summarizeCounts(totals),baseline:{inference:reference.inference??null,totals:summarizeCounts(expected)},unsupportedCalibrationKeys:Object.keys(groups.keys).filter(key=>!groups.keys[key].pairs).sort(),...Object.fromEntries(Object.entries(groups).map(([name,group])=>[name,Object.fromEntries(Object.entries(group).sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>[key,summarizeCounts(count)]))]))};
 writeFileSync(out+'.tmp',JSON.stringify(report,null,2)+'\n',{flag:'wx'});renameSync(out+'.tmp',out);return report;
}
async function main(){const opts={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--model','--runtime','--data','--baseline','--run-manifest','--checkpoint','--python','--out','--batch','--max-steps','--threads'].includes(key)||process.argv[i+1]===undefined)throw Error('expected --option value');opts[key.slice(2)]=process.argv[i+1];}const report=await calibrateBootstrapOnnx({modelDir:opts.model,runtime:opts.runtime,data:opts.data,baseline:opts.baseline,runManifest:opts['run-manifest'],checkpoint:opts.checkpoint,python:opts.python,out:opts.out,batchSize:Number(opts.batch??16),maxSteps:Number(opts['max-steps']??0),threads:Number(opts.threads??2)});console.log(JSON.stringify({complete:report.complete,processedPairs:report.processedPairs,totals:report.totals,tokenization:report.tokenization}));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
