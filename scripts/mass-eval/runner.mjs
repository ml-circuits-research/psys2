// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. Runs one dataset row through the whole application route (routeNewEngine) on the tab's SOP area,
// seeded with the row's context objects, with either the gold reader (oracle level) or the deployed SOP-BERT reader
// (end-to-end level), and returns the observations before/after plus the reply and its trace.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NATIVE_AREAS} from '../../src/dialog/app-reader-context.mjs';
import {observedReaderContext} from '../../src/dialog/native-reader-context.mjs';
import {routeNewEngine} from '../../src/dialog/reader-routing.mjs';
import {createFacts} from '../../src/knowledge/facts.mjs';
import {CATALOG_PIN} from '../../src/knowledge/catalog-pin.mjs';
import {pinnedCatalog} from '../lib/catalog-pin.mjs';
import {createKnowledgeSource} from '../../src/loaders/knowledge-source.mjs';
import {createGoldProvider,trainerRequest,goldCut} from './gold-reader.mjs';
import {createSetupCache,TAB} from './area-setup.mjs';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const WEBCHAT=path.join(ROOT,'docs/webchat');
export const DEPLOYMENT=JSON.parse(readFileSync(path.join(WEBCHAT,'models/sop-bert/deployment.json'),'utf8'));
export const BUNDLE=path.join(WEBCHAT,DEPLOYMENT.artifactBase);
export const DEFAULT_RUNTIME_ROOT=path.resolve(ROOT,'../.session-control/diagram-vss-demo/training/laptop/node_modules');

// The catalog at the pin (src/knowledge/catalog-pin.mjs): the site's copy when the webchat build has made it, else the
// local checkout of the pinned commit (scripts/lib/catalog-pin.mjs), so the areas load the schemas the code is built on.
function siteKnowledge(){
 const root=path.join(WEBCHAT,'catalog');
 if(existsSync(path.join(root,CATALOG_PIN.commit)))return createFacts({source:createKnowledgeSource(path.join(root,CATALOG_PIN.commit))});
 return createFacts({source:createKnowledgeSource(pinnedCatalog().dir)});
}

/** The deployed reader through the verified provider (same assembly as training/sop-bert/probe-bundle.mjs). */
async function deployedReader(runtimeRoot,getContext){
 const {loadActualReplayReader,runtimeTreeIdentity}=await import('../lib/actual-reader-provider.mjs');
 const {createVerifiedReaderProvider}=await import('../../src/dialog/verified-reader-provider.mjs');
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const manifestBytes=readFileSync(path.join(BUNDLE,'manifest.json')),manifest=JSON.parse(manifestBytes);
 const tree=process.env.MASS_EVAL_RUNTIME_TREE?JSON.parse(process.env.MASS_EVAL_RUNTIME_TREE):await runtimeTreeIdentity(runtimeRoot);
 const ortModule='onnxruntime-node/dist/index.js',transformersModule='@huggingface/transformers/dist/transformers.node.mjs';
 const backend={format:'psys2.node-reader-backend/1',runtimeTreeSha256:tree.sha256,node:process.version,platform:process.platform,arch:process.arch,ortModule,transformersModule,options:{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1}};
 const file=name=>{const b=readFileSync(path.join(BUNDLE,name));return {path:name,sha256:sha(b),bytes:b.length};};
 const spec={format:'psys2.actual-reader-replay/1',artifactRoot:BUNDLE,manifestSha256:sha(manifestBytes),runtimeRoot,runtimeTreeSha256:tree.sha256,ortModule,transformersModule,
  runtimeIdentity:{...DEPLOYMENT.runtimeIdentity,bindingsSha256:manifest.bindingsSha256,backendSha256:sha(JSON.stringify(backend))},
  tokenizerArtifact:file('tokenizer.json'),bindingsArtifact:file('bindings.json'),tokenizerConfig:file('tokenizer_config.json')};
 // The replay loader keeps per-probe diagnostics under a 16 MB budget reset by probe()/run(); this harness calls the
 // provider directly for thousands of rows, so the diagnostics (unused here) are not retained.
 let assembled=null;
 await loadActualReplayReader(spec,{factory:async options=>{assembled=await createVerifiedReaderProvider({...options,getContext,recordDiagnostics:async()=>{}});return assembled;}});
 return assembled.provider;
}

export async function createRunner({levels=['oracle','e2e'],runtimeRoot=DEFAULT_RUNTIME_ROOT}={}){
 const knowledge=siteKnowledge();
 const bindingsJSON=readFileSync(path.join(BUNDLE,'bindings.json'),'utf8'),bindings=JSON.parse(bindingsJSON),bindingsSha256=createHash('sha256').update(bindingsJSON).digest('hex');
 const manifest=JSON.parse(readFileSync(path.join(BUNDLE,'manifest.json'),'utf8')),registry=JSON.parse(manifest.configJSON).registry;
 const inventory=JSON.parse(readFileSync(path.join(ROOT,'official-dataset/inventory.json'),'utf8'));
 const setup=createSetupCache({knowledge,bindings});
 let context=null;
 const getContext=()=>{if(!context)throw Error('native-context-unavailable');return context;};
 const gold=levels.includes('oracle')?await createGoldProvider({bindingsJSON,bindingsSha256,bindings,registry,getContext}):null;
 const e2e=levels.includes('e2e')?await deployedReader(runtimeRoot,getContext):null;
 // The inventory nests banks as world -> type -> keys -> name -> values.
 const banks=inventory;

 async function run(row,level){
  const tab=TAB[row.world],area=NATIVE_AREAS[tab];
  const seeded=await setup(row.world,row.context?.existing??[]);
  const state=seeded.state;
  const host=await area.create({state:state[area.world],instanceId:'mass-eval',...(knowledge?{knowledge}:{})});
  const before=host.observe();
  const session={isession:{state},newEngineJournal:[],engine:{...(knowledge?{knowledge}:{}),onWorldActivity:()=>{}}};
  const notes=[];let provider,proposals=[];
  if(level==='oracle'){
   const requests=(row.requests??[]).map(r=>trainerRequest(r,row.world,banks,notes));
   const cut=goldCut(row.text,requests);
   if(cut.error)return {setup:seeded,before,error:cut.error,layerHint:'data',notes};
   gold.models.set({text:row.text,spans:cut.spans,requests});gold.proposals.length=0;
   provider=gold.provider;proposals=gold.proposals;
  }else{
   const recorded=[];
   provider={...e2e,async propose(sop){const p=await e2e.propose(sop);recorded.push(p);return p;},
    proposeIndependent:async sop=>{const p=await e2e.proposeIndependent(sop);if(p)recorded.push({...p,__retry:true});return p;},
    proposeLiteral:async sop=>{const p=await e2e.proposeLiteral(sop);if(p)recorded.push({...p,__retry:true});return p;},
    async *proposeRequests(sop){for await(const p of e2e.proposeRequests(sop)){recorded.push(p);yield p;}}};
   proposals=recorded;
  }
  session.engine.requestReader=provider;
  context=observedReaderContext(row.world,before,row.context?.previous??null,{compact:true,text:row.text});
  let reply,error=null;const t0=performance.now(),goldState=level==='oracle'?gold.models.current:null;
  try{reply=await routeNewEngine(session,row.text,{language:'en'});}catch(e){error=String(e?.message??e).slice(0,300);}
  finally{context=null;if(gold)gold.models.set(null);}
  const ms=performance.now()-t0;
  const afterHost=await area.create({state:session.isession.state[area.world],instanceId:'mass-eval',...(knowledge?{knowledge}:{})});
  const after=afterHost.observe();
  return {setup:seeded,before,after,reply,error,ms,notes,proposals:[...proposals],unlabelled:goldState?.unlabelled};
 }
 return {run,knowledge,bindings,registry};
}
