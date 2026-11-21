// SPDX-License-Identifier: AGPL-3.0-only
// Real-use measurement only (no runtime changes). One dataset row through the full application route
// (routeNewEngine) with the DEPLOYED SOP-BERT reader, on the tab's SOP area seeded with the row's context objects
// through the area's own commands (psys2/scripts/mass-eval/area-setup.mjs). Same assembly as mass-eval's e2e level,
// but it also returns the area states before/after so the result can be rendered (area.project -> SVG).
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {PSYS2} from './paths.mjs';

const imp=p=>import(path.join(PSYS2,p));
const {NATIVE_AREAS}=await imp('src/dialog/app-reader-context.mjs');
const {observedReaderContext}=await imp('src/dialog/native-reader-context.mjs');
const {routeNewEngine}=await imp('src/dialog/reader-routing.mjs');
const {createFacts}=await imp('src/knowledge/facts.mjs');
const {createKnowledgeSource}=await imp('src/loaders/knowledge-source.mjs');
const {createSetupCache,TAB}=await imp('scripts/mass-eval/area-setup.mjs');
const {diffObservations}=await imp('scripts/mass-eval/judge.mjs');

const WEBCHAT=path.join(PSYS2,'docs/webchat');
export const DEPLOYMENT=JSON.parse(readFileSync(path.join(WEBCHAT,'models/sop-bert/deployment.json'),'utf8'));
export const BUNDLE=path.join(WEBCHAT,DEPLOYMENT.artifactBase);
export const DEFAULT_RUNTIME_ROOT=path.resolve(PSYS2,'../.session-control/diagram-vss-demo/training/laptop/node_modules');

function siteKnowledge(){
 const root=path.join(WEBCHAT,'catalog'),commit=existsSync(root)?readdirSync(root).find(n=>/^[0-9a-f]{40}$/.test(n)):null;
 return commit?createFacts({source:createKnowledgeSource(path.join(root,commit))}):null;
}

async function deployedReader(runtimeRoot,getContext){
 const {loadActualReplayReader,runtimeTreeIdentity}=await imp('scripts/lib/actual-reader-provider.mjs');
 const {createVerifiedReaderProvider}=await imp('src/dialog/verified-reader-provider.mjs');
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const manifestBytes=readFileSync(path.join(BUNDLE,'manifest.json')),manifest=JSON.parse(manifestBytes);
 const tree=process.env.REAL_USE_RUNTIME_TREE?JSON.parse(process.env.REAL_USE_RUNTIME_TREE):await runtimeTreeIdentity(runtimeRoot);
 const ortModule='onnxruntime-node/dist/index.js',transformersModule='@huggingface/transformers/dist/transformers.node.mjs';
 const backend={format:'psys2.node-reader-backend/1',runtimeTreeSha256:tree.sha256,node:process.version,platform:process.platform,arch:process.arch,ortModule,transformersModule,options:{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1}};
 const file=name=>{const b=readFileSync(path.join(BUNDLE,name));return {path:name,sha256:sha(b),bytes:b.length};};
 const spec={format:'psys2.actual-reader-replay/1',artifactRoot:BUNDLE,manifestSha256:sha(manifestBytes),runtimeRoot,runtimeTreeSha256:tree.sha256,ortModule,transformersModule,
  runtimeIdentity:{...DEPLOYMENT.runtimeIdentity,bindingsSha256:manifest.bindingsSha256,backendSha256:sha(JSON.stringify(backend))},
  tokenizerArtifact:file('tokenizer.json'),bindingsArtifact:file('bindings.json'),tokenizerConfig:file('tokenizer_config.json')};
 let assembled=null;
 await loadActualReplayReader(spec,{factory:async options=>{assembled=await createVerifiedReaderProvider({...options,getContext,recordDiagnostics:async()=>{}});return assembled;}});
 return assembled.provider;
}

const KEEP=['kind','name','label','title','text','colour','color','fill','stroke','size','x','y','width','height','shape','layout','from','to','values','labels','value','style','facing','pose','count','parent','group','variant','drawing','line','dash','font','opacity','rotation','z'];
const props=o=>{const m={};for(const i of o.inputs??[]){if(['selected','index','version'].includes(i.key))continue;m[i.key]=i.values.length===1?i.values[0]:i.values;}return m;};
const brief=o=>{const p=props(o),out={id:o.id,kind:o.kind};for(const k of Object.keys(p))if(KEEP.includes(k)||Object.keys(out).length<14)out[k]=typeof p[k]==='string'?p[k].slice(0,80):Array.isArray(p[k])?p[k].slice(0,8):p[k];return out;};

// Placement solver: the page places with Z3 (z3-solver 5.4.1, WebAssembly). Node uses the same package from npm, so a Node run
// places like the browser; the internal search is only the logged emergency path (z3Status().counts).
export const DEFAULT_Z3_MODULE=path.resolve(PSYS2,'../soplang-words-lib/experiments/node_modules/z3-solver/build/node.js');
export async function useNodeZ3(modulePath=process.env.REAL_USE_Z3_MODULE??DEFAULT_Z3_MODULE){
 const {usePlacementSolver}=await imp('src/dialog/placement-search-provider.mjs');
 const {solveWithZ3}=await imp('src/vendor/sopworld/z3-translate.mjs');
 const z3=await import(modulePath),{Context}=await z3.init(),z=new Context('sopworld');
 usePlacementSolver({solve:model=>solveWithZ3(z,model),label:'z3-solver (node)'});
 const {setPlacementMode}=await imp('src/dialog/placement-search-provider.mjs');setPlacementMode(process.env.REAL_USE_MODE??'fast');
 return z3;
}

export async function createRealUseRunner({runtimeRoot=DEFAULT_RUNTIME_ROOT,z3=true}={}){
 if(z3)await useNodeZ3();
 const knowledge=siteKnowledge();
 const bindings=JSON.parse(readFileSync(path.join(BUNDLE,'bindings.json'),'utf8'));
 const setup=createSetupCache({knowledge,bindings});
 let context=null;
 const getContext=()=>{if(!context)throw Error('native-context-unavailable');return context;};
 const reader=await deployedReader(runtimeRoot,getContext);

 async function run(row){
  const tab=TAB[row.world],area=NATIVE_AREAS[tab];
  const seeded=await setup(row.world,row.context?.existing??[]);
  const state=seeded.state,beforeArea=JSON.parse(JSON.stringify(state[area.world]));
  const host=await area.create({state:state[area.world],instanceId:'real-use',...(knowledge?{knowledge}:{})});
  const before=host.observe();
  const session={isession:{state},newEngineJournal:[],engine:{...(knowledge?{knowledge}:{}),onWorldActivity:()=>{}}};
  const recorded=[];
  session.engine.requestReader={...reader,async propose(sop){const p=await reader.propose(sop);recorded.push(p);return p;},
   proposeIndependent:async sop=>{const p=await reader.proposeIndependent(sop);if(p)recorded.push({...p,__retry:true});return p;},
   proposeLiteral:async sop=>{const p=await reader.proposeLiteral(sop);if(p)recorded.push({...p,__retry:true});return p;},
   async *proposeRequests(sop){for await(const p of reader.proposeRequests(sop)){recorded.push(p);yield p;}}};
  // A follow-up row: the previous turn is what the reader sees as "previous" (as in the dataset's context).
  context=observedReaderContext(row.world,before,row.context?.previous??null,{compact:true,text:row.text});
  let reply,error=null;const t0=performance.now();
  try{reply=await routeNewEngine(session,row.text,{language:'en'});}catch(e){error=String(e?.message??e).slice(0,300);}
  finally{context=null;}
  const ms=performance.now()-t0;
  const afterArea=session.isession.state[area.world];
  const afterHost=await area.create({state:JSON.parse(JSON.stringify(afterArea)),instanceId:'real-use',...(knowledge?{knowledge}:{})});
  const after=afterHost.observe();
  const d=diffObservations(before,after,row.world);
  let svgBefore=null,svgAfter=null,renderError=null;
  try{svgBefore=area.projectState?.(beforeArea)?.svg??null;svgAfter=area.projectState?.(afterArea)?.svg??null;}catch(e){renderError=String(e?.message??e).slice(0,200);}
  if(!svgAfter&&!renderError){try{const {projectDrawingArea}=await imp('worlds/art.draw/sop-drawing.mjs');const {projectDiagramArea}=await imp('worlds/diagram.sketch/sop-diagram.mjs');const pr=row.world==='drawing'?projectDrawingArea:projectDiagramArea;svgBefore=pr(beforeArea).svg;svgAfter=pr(afterArea).svg;}catch(e){renderError=String(e?.message??e).slice(0,200);}}
  const reading=recorded.filter(p=>p&&!p.__retry).flatMap(p=>p.raw?.requests??[]);
  // Compiled wires: the executed tool calls (operation + arguments) of the reply.
  const compiled=(reply?.effects??[]).slice(0,8).map(e=>({op:e.operation??e.op??e.kind??e.type??null,args:e.args?JSON.stringify(e.args).slice(0,200):undefined}));
  return {__stageA:{before,after,reply,error,proposals:[...recorded]},compiled,
   setupFailures:seeded.failures,
   contextSeeded:before.objects.filter(o=>/^art\.draw\.object$|^diagram\.sketch\.(node|link|group)$|^data\.charts\./.test(o.sourceType)).map(brief),
   reply:reply?.text??null,statuses:reply?.statuses??null,reason:reply?.trace?.reason??null,error,ms:Math.round(ms),
   created:d.created.map(brief),removed:d.removed.map(o=>({id:o.id,kind:o.kind,name:props(o).name??props(o).label})),
   changed:d.changed.map(c=>({id:c.object.id,kind:c.object.kind,name:props(c.object).name??props(c.object).label,keys:c.keys,before:Object.fromEntries(c.keys.map(k=>[k,props(c.before)[k]])),after:Object.fromEntries(c.keys.map(k=>[k,props(c.object)[k]]))})),
   selectionChanged:d.selection,
   reading:reading.map(r=>({act:r.act,mood:r.mood,target:r.target,constraints:(r.constraints??[]).map(c=>({key:c.key,value:c.value??c.value_span,op:c.operator,phase:c.phase}))})),
   failures:[...new Set(recorded.filter(Boolean).flatMap(p=>(p.failures??[]).map(f=>f.reason+(f.path?.length?':'+f.path.join('.'):''))))].slice(0,6),
   svgBefore,svgAfter,renderError};
 }
 return {run,bindings};
}
