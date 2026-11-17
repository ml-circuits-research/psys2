// C1-only annotation adapter. No reader, learned model, execution or admission.
import {bridgeRawStructure} from '../../src/dialog/raw-structural-bridge.mjs';
import {prepareRequestBatch} from '../../src/vendor/sopworld/sopworld.mjs';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,rm,statfs,realpath} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const file=fileURLToPath(import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export async function hashFile(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
function fields(value,prefix=[],out=[],depth=0){if(depth>48||out.length>10000)throw Error('annotation-field-budget');if(value&&typeof value==='object'&&Object.keys(value).length){for(const[k,v]of Object.entries(value))fields(v,[...prefix,k],out,depth+1);}else out.push(prefix);return out;}
function assertPlainJson(value,depth=0,active=new Set(),counter={n:0}){
 if(++counter.n>20000||depth>48)throw TypeError('invalid-plain-JSON-row-bound');
 if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return;
 if(typeof value!=='object'||active.has(value)||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))throw TypeError('invalid-plain-JSON-row');
 active.add(value);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw TypeError('invalid-plain-JSON-row-descriptor');assertPlainJson(d.value,depth+1,active,counter);}active.delete(value);
}
export function compileTeacherRow(row,{bindings,bindingSha256,compilerSha256,bridgeSha256,librarySha256,bridgeBudget=200000}={}){
 // Public API accepts plain JSON only; malformed host objects are rejected
 // before any getter or annotation clone can run. Parsed corpus rows satisfy this.
 assertPlainJson(row);if(!row||Array.isArray(row)||typeof row!=='object')throw TypeError('invalid-plain-JSON-row');
 for(const value of [bindingSha256,compilerSha256,bridgeSha256,librarySha256])if(!isHash(value))throw Error('invalid-C1-provenance');
 const annotations=structuredClone(row.annotations),out={format:'sop.c1.teacher-request-expectation/1',id:row.id,source:{path:row.source_path,id:row.source_id,line:row.source_line,sha256:row.source_sha256,text:row.source?.text,unit:row.source?.unit},world:row.world,context:structuredClone(row.context??null),annotations,annotationListState:!Object.hasOwn(row,'annotations')?'absent':annotations===null?'explicit-null':Array.isArray(annotations)?'array':'other',origin:{kind:'C1-teacher-annotations',compilerSha256,bridgeSha256,librarySha256,bindingSha256},modelInference:false,executionEligible:false,executionCorrectness:'not-assessed',expectedGraphs:[],diagnostics:[],unconsumedFields:[],uncertifiedFields:[]};
 let annotationFields=[];const unknown=(reason,extra=[])=>{out.status='unknown';out.diagnostics.push({reason,path:['annotations']},...extra);out.uncertifiedFields=annotationFields;return out;};
 try{
  annotationFields=fields(annotations,['annotations']);out.annotationFields=annotationFields;
  if(!Array.isArray(annotations))return unknown('invalid-teacher-request-list');
  if(typeof row.source?.text!=='string'||row.source.unit!=='unicode-scalar'||typeof row.world!=='string')return unknown('invalid-teacher-source');
  if(annotations.length===0){out.status='zero-request';return out;}
  if(!row.source_path?.startsWith('data/haiku-v2/')){out.unconsumedFields=annotationFields;return unknown('unsupported-flat-v1-or-source-version');}
  // The published bridge reads measure_span as unit evidence only. Do not certify
  // extra teacher evidence that it would otherwise leave unconsumed.
  for(const[ri,request]of annotations.entries())for(const[ci,c]of(request?.constraints??[]).entries())if(Object.hasOwn(c,'measure_span')&&!Object.hasOwn(c,'unit'))out.unconsumedFields.push(['annotations',String(ri),'constraints',String(ci),'measure_span']);
  // Required adapter schema stamp, never emitted as a learned-model origin.
  const adapter={format:'psys2.raw-structural-predictions/1',source:{text:row.source.text,unit:'unicode-scalar'},area:row.world,model:{kind:'structural-graph',sha256:compilerSha256,decoderVersion:1},coverage:{complete:true,truncated:false},requestCount:annotations.length,requests:annotations,unresolved:[],ranges:[]};
  const result=bridgeRawStructure(adapter,{bindings,bindingSha256,budget:bridgeBudget});out.diagnostics=[...result.diagnostics,...(result.decoded?.issues??[])];
  for(const diagnostic of result.diagnostics)if(diagnostic.reason==='unsupported-raw-field')out.unconsumedFields.push(['annotations',...diagnostic.path.slice(1).map(String)]);
  const candidates=result.decoded?.candidates??[];
  if(out.diagnostics.length||out.unconsumedFields.length||candidates.length!==1||!candidates[0].batch?.entries?.length)return unknown('canonical-expectation-unresolved');
  const validation=prepareRequestBatch(candidates[0].batch,{budget:200000});
  if(!validation.ok)return unknown('strict-request-batch-validation-failed',validation.issues??[]);
  out.status='canonical-expectation';out.expectedGraphs=structuredClone(candidates[0].batch.entries);out.validation={ok:true,method:'published-prepareRequestBatch',requests:out.expectedGraphs.length};return out;
 }catch(error){return unknown(error.message??'invalid-teacher-annotation');}
}
async function freeBytes(p){const s=await statfs(p,{bigint:true});return s.bavail*s.bsize;}
export async function compileCorpus({corpus,corpusManifestSha256,exclusions,deployment,deploymentSha256,webRoot,out,bridgeSha256,librarySha256,maxOutputBytes=67108864,reserveBytes=303537434}){
 if(![corpusManifestSha256,deploymentSha256,bridgeSha256,librarySha256].every(isHash)||![maxOutputBytes,reserveBytes].every(x=>Number.isSafeInteger(x)&&x>0))throw Error('invalid-compiler-inputs');
 const corpusPath=path.join(corpus,'manifest.json');if(await hashFile(corpusPath)!==corpusManifestSha256||await hashFile(deployment)!==deploymentSha256)throw Error('input-manifest-hash-mismatch');
 const corpusManifest=JSON.parse(await readFile(corpusPath,'utf8')),deploy=JSON.parse(await readFile(deployment,'utf8')),root=await realpath(webRoot),manifestPath=path.resolve(root,deploy.manifestPath);
 if(!manifestPath.startsWith(root+path.sep)||deploy.format!=='psys2.browser-reader-deployment/1'||!isHash(deploy.manifestSha256)||await hashFile(manifestPath)!==deploy.manifestSha256)throw Error('deployment-identity-mismatch');
 const modelManifest=JSON.parse(await readFile(manifestPath,'utf8')),bindingPath=path.resolve(path.dirname(manifestPath),deploy.bindingsArtifact.path);
 if(!bindingPath.startsWith(path.dirname(manifestPath)+path.sep)||deploy.bindingsArtifact.sha256!==modelManifest.files.bindings.sha256||await hashFile(bindingPath)!==deploy.bindingsArtifact.sha256)throw Error('binding-identity-mismatch');
 const bindingSha256=deploy.bindingsArtifact.sha256,bindings=JSON.parse(await readFile(bindingPath,'utf8'));if(await hashFile(exclusions)!==corpusManifest.exclusion.sha256)throw Error('exclusion-identity-mismatch');
 const excludedRows=JSON.parse(await readFile(exclusions,'utf8'));if(!Array.isArray(excludedRows)||new Set(excludedRows).size!==excludedRows.length)throw Error('invalid-exclusions');const excluded=new Set(excludedRows);
 const bridgeFile=fileURLToPath(new URL('../../src/dialog/raw-structural-bridge.mjs',import.meta.url)),libraryFile=fileURLToPath(new URL('../../src/vendor/sopworld/sopworld.mjs',import.meta.url)),inputs={compiler:file,bridge:bridgeFile,library:libraryFile,bindings:bindingPath,corpusManifest:corpusPath,deployment,modelManifest:manifestPath,exclusions};
 if(await hashFile(bridgeFile)!==bridgeSha256||await hashFile(libraryFile)!==librarySha256)throw Error('published-bridge-library-hash-mismatch');
 const decoderFile=fileURLToPath(new URL('../../src/dialog/model-graph-decoder.mjs',import.meta.url)),copyFile=fileURLToPath(new URL('../../worlds/native-tool-host.mjs',import.meta.url));inputs.decoder=decoderFile;inputs.hostDataCopy=copyFile;
 const frozen={};for(const[k,p]of Object.entries(inputs))frozen[k]={path:p,sha256:await hashFile(p)};
 const sourceDigests=new Map(corpusManifest.sources.map(s=>[s.path,s.sha256]));for(const split of ['train','calibration']){const p=path.join(corpus,split+'.jsonl');if(await hashFile(p)!==corpusManifest.outputs[split])throw Error('corpus-data-hash-mismatch');inputs[split]=p;frozen[split]={path:p,sha256:corpusManifest.outputs[split]};}
 await mkdir(path.dirname(out),{recursive:true});if(await freeBytes(path.dirname(out))<BigInt(maxOutputBytes+reserveBytes))throw Error('expectation-output-reserve');await mkdir(out);const counts={},reasons={},seen=new Set();let total=0,encodedUsed=0;const active=[];
 try{
  for(const split of ['train','calibration']){
   const target=path.join(out,split+'.expectations.jsonl.gz'),sink=createWriteStream(target,{flags:'wx'}),gzip=createGzip({level:6,mtime:0});const bound=new Transform({transform(chunk,encoding,callback){freeBytes(out).then(free=>{if(encodedUsed+chunk.length>maxOutputBytes||free-BigInt(chunk.length)<BigInt(reserveBytes))return callback(Error('encoded-output-or-reserve-bound'));encodedUsed+=chunk.length;callback(null,chunk);},callback);}});const done=pipeline(gzip,bound,sink);done.catch(()=>{});active.push({gzip,done});let rows=0,decodedBytes=0;const decodedHash=createHash('sha256');
   for await(const line of createInterface({input:createReadStream(inputs[split]),crlfDelay:Infinity})){
    if(!line.trim())continue;if(Buffer.byteLength(line)>2097152)throw Error('source-record-bound');const row=JSON.parse(line),identity=row.source_path+':'+row.source_id,expectedSplit=parseInt(hash(identity).slice(0,8),16)%10===0?'calibration':'train';
    if(row.id!==identity||row.split!==split||expectedSplit!==split||seen.has(row.id)||excluded.has(row.source_id)||row.source_sha256!==sourceDigests.get(row.source_path))throw Error('source-row-identity-mismatch');seen.add(row.id);
    const compiled=compileTeacherRow(row,{bindings,bindingSha256,compilerSha256:frozen.compiler.sha256,bridgeSha256:frozen.bridge.sha256,librarySha256:frozen.library.sha256});counts[split+':'+compiled.status]=(counts[split+':'+compiled.status]??0)+1;for(const d of compiled.diagnostics)reasons[d.reason]=(reasons[d.reason]??0)+1;
    const body=JSON.stringify(compiled)+'\n';decodedBytes+=Buffer.byteLength(body);if(decodedBytes>1073741824)throw Error('decoded-output-bound');decodedHash.update(body);if(gzip.destroyed)await done;if(!gzip.write(body))await once(gzip,'drain');rows++;
    if(rows%100===0){const size=gzip.bytesWritten;if(size>1073741824)throw Error('decoded-output-bound');if(await freeBytes(out)<BigInt(reserveBytes))throw Error('expectation-reserve-changed');}
   }
   gzip.end();await done;const bytes=(await import('node:fs/promises')).stat(target).then(s=>s.size);const encodedBytes=await bytes;total+=encodedBytes;if(total>maxOutputBytes||rows!==corpusManifest.counts[split+':rows'])throw Error('expectation-output-count-or-size');counts[split+':rows']=rows;counts[split+':encodedBytes']=encodedBytes;counts[split+':decodedSha256']=decodedHash.digest('hex');counts[split+':encodedSha256']=await hashFile(target);
  }
  for(const[k,p]of Object.entries(inputs))if(await hashFile(p)!==frozen[k].sha256)throw Error('compiler-input-mutated');
  const summary={format:'sop.C1.teacher-expectation-corpus/1',origin:'C1-teacher-annotations',frozenInputs:frozen,counts,reasons,sourceRows:seen.size,reservedOverlap:0,outputBounds:{maxOutputBytes,reserveBytes},modelInference:false,executionCorrectness:'not-assessed',graphMatching:'not-run',executionEligible:false};const body=JSON.stringify(summary,null,2)+'\n';if(total+Buffer.byteLength(body)>maxOutputBytes||await freeBytes(out)-BigInt(Buffer.byteLength(body))<BigInt(reserveBytes))throw Error('summary-output-reserve');await writeFile(path.join(out,'summary.json'),body,{flag:'wx'});return summary;
 }catch(error){for(const stream of active)stream.gzip.destroy(error);await Promise.allSettled(active.map(stream=>stream.done));await rm(out,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===file){const a={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('invalid-cli');a[process.argv[i].slice(2)]=process.argv[i+1];}const result=await compileCorpus({corpus:a.corpus,corpusManifestSha256:a['corpus-manifest-sha256'],exclusions:a.exclusions,deployment:a.deployment,deploymentSha256:a['deployment-sha256'],webRoot:a['web-root'],out:a.out,bridgeSha256:a['bridge-sha256'],librarySha256:a['library-sha256'],maxOutputBytes:Number(a['max-output-bytes']??67108864),reserveBytes:Number(a['reserve-bytes']??303537434)});console.log(JSON.stringify({format:result.format,counts:result.counts,sourceRows:result.sourceRows,modelInference:false,executionEligible:false}));}
