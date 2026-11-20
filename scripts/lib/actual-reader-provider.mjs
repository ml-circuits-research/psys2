import {writeReaderSource} from '../../src/dialog/reader-source.mjs';
// Evaluation-only Node host. No model confidence or admission report is installed.
import {readFile,realpath,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {routeNewEngine} from '../../src/dialog/reader-routing.mjs';
import {bertRuntimeConfiguration} from '../../src/dialog/browser-reader-host.mjs';
export {bertRuntimeConfiguration};
import {copyHostData} from '../../worlds/native-tool-host.mjs';
import {observedReaderContext,REPLAY_CONTEXT_PROFILE} from './reader-context-profile.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inside=(root,path)=>{const rel=relative(root,path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);};
export async function runtimeTreeIdentity(directory){
 const root=await realpath(directory),rows=[];let bytes=0;
 async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  if(entries.length+rows.length>100000)throw Error('runtime-inventory-budget');
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   const path=resolve(dir,entry.name);if(entry.isSymbolicLink()){
    const target=await realpath(path);if(!inside(root,target))throw Error('runtime-symlink-escape');
    const data=await readFile(target);bytes+=data.length;if(bytes>2000000000||rows.length>=100000)throw Error('runtime-inventory-budget');
    rows.push({path:relative(root,path),link:relative(root,target),bytes:data.length,sha256:sha(data)});continue;
   }
   if(entry.isDirectory())await walk(path);else if(entry.isFile()){
    const data=await readFile(path);bytes+=data.length;if(bytes>2000000000||rows.length>=100000)throw Error('runtime-inventory-budget');
    rows.push({path:relative(root,path).split('\\').join('/'),bytes:data.length,sha256:sha(data)});
   }else throw Error('runtime-special-file');
  }
 }
 await walk(root);return {root,sha256:sha(JSON.stringify(rows)),files:rows.length,bytes};
}
/** Explicit spec paths are local evaluation inputs, never fields from a model or annotation. */
export async function loadActualReplayReader(spec,{factory}={}){
 if(!spec||spec.format!=='psys2.actual-reader-replay/1'||!hash(spec.manifestSha256)||!hash(spec.runtimeTreeSha256)||!spec.runtimeIdentity)throw Error('invalid-replay-reader-spec');
 const root=await realpath(spec.artifactRoot),manifestBytes=await readFile(resolve(root,'manifest.json'));
 if(sha(manifestBytes)!==spec.manifestSha256)throw Error('replay-manifest-hash');
 const tree=await runtimeTreeIdentity(spec.runtimeRoot);if(tree.sha256!==spec.runtimeTreeSha256)throw Error('runtime-tree-hash');
 async function runtimeModule(path){const full=await realpath(resolve(tree.root,path));if(!inside(tree.root,full))throw Error('runtime-module-escape');return import(pathToFileURL(full).href);}
 const ort=await runtimeModule(spec.ortModule),transformers=await runtimeModule(spec.transformersModule);
 const backendIdentity={format:'psys2.node-reader-backend/1',runtimeTreeSha256:tree.sha256,node:process.version,platform:process.platform,arch:process.arch,ortModule:spec.ortModule,transformersModule:spec.transformersModule,options:{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1}};
 if(spec.runtimeIdentity.backendSha256!==sha(JSON.stringify(backendIdentity)))throw Error('runtime-backend-identity');
 const backend={createSession:(bytes)=>ort.InferenceSession.create(bytes,backendIdentity.options),makeTensor:(type,data,dims)=>new ort.Tensor(type,data,dims)};
 const artifact=async path=>{if(typeof path!=='string'||isAbsolute(path)||path.split('/').includes('..'))throw Error('artifact-path');const full=await realpath(resolve(root,path));if(!inside(root,full))throw Error('artifact-escape');return new Uint8Array(await readFile(full));};
 const tokenizerConfigBytes=await artifact(spec.tokenizerConfig.path);
 if(!hash(spec.tokenizerConfig.sha256)||sha(tokenizerConfigBytes)!==spec.tokenizerConfig.sha256)throw Error('tokenizer-config-hash');
 const tokenizerConfig=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(tokenizerConfigBytes));
 if(tokenizerConfig.tokenizer_class!==undefined&&tokenizerConfig.tokenizer_class!=='DistilBertTokenizer'&&tokenizerConfig.tokenizer_class!=='BertTokenizer')throw Error('unsupported-tokenizer-class');
 let constructorConfig=null;
 const createTokenizer=async({tokenizerJSON})=>{constructorConfig=bertRuntimeConfiguration(JSON.parse(tokenizerJSON),tokenizerConfig);return new transformers.BertTokenizer(JSON.parse(tokenizerJSON),constructorConfig);};
 let current=null,observation=null,busy=false;const diagnostics=[];let diagnosticBytes=0;
 const create=factory??(await import('../../src/dialog/verified-reader-provider.mjs')).createVerifiedReaderProvider;
 const assembled=await create({manifestJSON:manifestBytes.toString('utf8'),manifestSha256:spec.manifestSha256,tokenizerArtifact:spec.tokenizerArtifact,bindingsArtifact:spec.bindingsArtifact,readArtifact:artifact,backend,createTokenizer,
  getContext:()=>{if(!current)throw Error('native-context-unavailable');return current;},recordDiagnostics:async entry=>{diagnosticBytes+=Buffer.byteLength(JSON.stringify(entry));if(diagnosticBytes>16000000)throw Error('reader-diagnostic-budget');diagnostics.push(entry);},runtimeIdentity:spec.runtimeIdentity,
  verifyHostRuntime:async({runtimeIdentity})=>({verified:true,identity:runtimeIdentity,authority:'psys2.node-reader-host/1: exact runtime tree and explicit trusted deployment identity'})});
 // Identity completeness beyond measured runtime bytes is a reviewed deployment obligation.
 return {verified:{...assembled.verified,backendIdentity,contextProfile:REPLAY_CONTEXT_PROFILE,tokenizerConfigSha256:spec.tokenizerConfig.sha256,tokenizerConstructorPolicy:'explicit-bert-special-roles/1',tokenizerConstructorConfigSha256:constructorConfig?sha(JSON.stringify(constructorConfig)):null},async probe(text,sourceContext){
  if(busy)throw Error('concurrent-replay-reader');
  if(!sourceContext||Object.keys(sourceContext).sort().join(',')!=='area,context')throw Error('invalid-source-context');
  busy=true;diagnostics.length=0;diagnosticBytes=0;
  try{current=copyHostData(sourceContext,{maxBytes:65536});const proposal=await assembled.provider.propose(writeReaderSource(text));return {proposal,diagnostics:[...diagnostics],sourceContext:current,semanticCorrectness:null,executionEligible:false};}
  finally{current=null;busy=false;}
 },async run(session,text,{area,host,previous=null}){
  if(busy)throw Error('concurrent-replay-reader');busy=true;diagnostics.length=0;diagnosticBytes=0;
  const engine=session.engine??{},old=engine.requestReader,oldAdmission=engine.requestReaderAdmission;session.engine=engine;let error=null;const proposals=[];
  delete engine.requestReaderAdmission;
  // Routing reads through propose or, for a cut into several requests, proposeRequests: record both.
  engine.requestReader={...assembled.provider,async propose(sourceSop){const p=await assembled.provider.propose(sourceSop);proposals.push(p);return p;},
   ...(typeof assembled.provider.proposeRequests==='function'?{async *proposeRequests(sourceSop){for await(const p of assembled.provider.proposeRequests(sourceSop)){proposals.push(p);yield p;}}}:{})};
  try{try{observation=host?.observe()??null;current=observedReaderContext(area,observation,previous);}catch(e){error=String(e.message);current=null;}
   const reply=await routeNewEngine(session,text,{language:'en'});
   const proposal=proposals.length<2?proposals[0]??null:{...proposals[0],candidates:proposals.flatMap(p=>p.candidates??[]),failures:proposals.flatMap(p=>p.failures??[]),parts:proposals};
   const routing=reply.trace?.readerRouting,operational=routing?.admission?.proposalEligible?{...proposal,candidates:routing.admission.alternatives,coverage:routing.model.coverage,failures:[],interpretation:routing.interpretation??proposal?.interpretation}:proposal;
   return {reply,measurement:{proposal:operational,modelProposal:proposal,diagnostics:[...diagnostics],context:current,observation,contextError:error,semanticCorrectness:null,admissionInstalled:false}};
  }finally{if(old===undefined)delete engine.requestReader;else engine.requestReader=old;if(oldAdmission!==undefined)engine.requestReaderAdmission=oldAdmission;current=null;observation=null;busy=false;}
 }};
}
