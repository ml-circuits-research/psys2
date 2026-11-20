// Scratch benchmark driver (not part of the repository): probe-bundle.mjs --run, plus
// (a) before/after observation snapshots, (b) sessions: items sharing `session` run in order on one page with `previous`.
// usage: node hb-probe.mjs BUNDLE_DIR NODE_MODULES_ROOT ITEMS.jsonl > out.jsonl
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {loadActualReplayReader,runtimeTreeIdentity} from '../../../../scripts/lib/actual-reader-provider.mjs';
const [bundle,runtimeRoot,probes]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifestBytes=readFileSync(path.join(bundle,'manifest.json')),manifest=JSON.parse(manifestBytes);
const deployment=JSON.parse(readFileSync(new URL('../../../../docs/webchat/models/sop-bert/deployment.json',import.meta.url)));
const tree=await runtimeTreeIdentity(runtimeRoot);
const ortModule='onnxruntime-node/dist/index.js',transformersModule='@huggingface/transformers/dist/transformers.node.mjs';
const backend={format:'psys2.node-reader-backend/1',runtimeTreeSha256:tree.sha256,node:process.version,platform:process.platform,arch:process.arch,ortModule,transformersModule,options:{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1}};
const file=name=>{const b=readFileSync(path.join(bundle,name));return {path:name,sha256:sha(b),bytes:b.length};};
const spec={format:'psys2.actual-reader-replay/1',artifactRoot:bundle,manifestSha256:sha(manifestBytes),runtimeRoot,runtimeTreeSha256:tree.sha256,ortModule,transformersModule,
 runtimeIdentity:{...deployment.runtimeIdentity,bindingsSha256:manifest.bindingsSha256,backendSha256:sha(JSON.stringify(backend))},
 tokenizerArtifact:file('tokenizer.json'),bindingsArtifact:file('bindings.json'),tokenizerConfig:file('tokenizer_config.json')};
const {createVerifiedReaderProvider}=await import('../../../../src/dialog/verified-reader-provider.mjs');
const {observedReaderContext}=await import('../../../../src/dialog/native-reader-context.mjs');
const {routeNewEngine}=await import('../../../../src/dialog/reader-routing.mjs');
const {NATIVE_AREAS}=await import('../../../../src/dialog/app-reader-context.mjs');
const {seedFunctionalContext}=await import('../../../../scripts/functional-context-seeding.mjs');
const {FUNCTIONAL_NATIVE_BINDINGS}=await import('../../../../scripts/lib/functional-native-bindings.mjs');
let assembled=null,appContext=null;
await loadActualReplayReader(spec,{factory:async options=>{const inner=options.getContext;assembled=await createVerifiedReaderProvider({...options,recordDiagnostics:async()=>{},getContext:(...a)=>appContext??inner(...a)});return assembled;}});
let catalogKnowledge;
async function siteKnowledge(){
 if(catalogKnowledge!==undefined)return catalogKnowledge;
 const {readdirSync,existsSync}=await import('node:fs');
 const root=new URL('../../../../docs/webchat/catalog/',import.meta.url).pathname,commit=existsSync(root)?readdirSync(root).find(name=>/^[0-9a-f]{40}$/.test(name)):null;
 if(!commit)return catalogKnowledge=null;
 const {createFacts}=await import('../../../../src/knowledge/facts.mjs'),{createKnowledgeSource}=await import('../../../../src/loaders/knowledge-source.mjs');
 return catalogKnowledge=createFacts({source:createKnowledgeSource(root+commit)});
}
const snap=obs=>obs.objects.map(o=>{const inputs={};for(const i of o.inputs??[]){if(/^(selected|source|version)$/.test(i.key))continue;inputs[i.key]=i.values.length===1?i.values[0]:i.values;}
 return {id:o.id,kind:o.kind??null,...(o.in?{in:o.in}:{}),...(o.role?{role:o.role}:{}),inputs};});
async function newPage(p){
 const tab={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar',avatar:'avatar'}[p.area],area=NATIVE_AREAS[tab],state={};
 const empties={draw:async()=>(await import('../../../../worlds/art.draw/sop-drawing.mjs')).emptyDrawingState(),avatar:async()=>(await import('../../../../worlds/ui.avatar/sop-avatar.mjs')).emptyAvatarState(),
  diagram:async()=>(await import('../../../../worlds/diagram.sketch/sop-diagram.mjs')).emptyDiagramState(),calendar:async()=>{const m=await import('../../../../worlds/time.calendar/sop-calendar.mjs');return m.emptyCalendarArea();}};
 const defaults=empties[tab]?await empties[tab]():undefined;
 if(defaults)state[area.world]=defaults;state['ui.shell']={activeTab:tab};
 const knowledge=await siteKnowledge();
 const host=await area.create({state:state[area.world],instanceId:'probe-'+Math.random().toString(16).slice(2),...(knowledge?{knowledge}:{})});
 const setup=await seedFunctionalContext({context:{existing:p.context?.existing??[]},host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[p.area]??[],invocationPrefix:'probe'});
 const proposals=[];
 const session={isession:{state},newEngineJournal:[]};
 session.engine={...(knowledge?{knowledge}:{}),requestReader:{...assembled.provider,async propose(sop){const r=await assembled.provider.propose(sop);proposals.push(r);return r;},
  async *proposeRequests(sop){for await(const r of assembled.provider.proposeRequests(sop)){proposals.push(r);yield r;}}}};
 return {host,session,proposals,setup,previous:null};
}
async function turn(page,p){
 page.proposals.length=0;
 const before=snap(page.host.observe());
 appContext=observedReaderContext(p.area,page.host.observe(),page.previous,{compact:true,text:p.text});
 let reply;try{reply=await routeNewEngine(page.session,p.text,{language:'en'});}finally{appContext=null;}
 page.previous=p.text;
 const after=snap(page.host.observe());
 return {reason:reply?.trace?.reason??null,statuses:reply?.statuses,answer:reply?.text??reply?.reply??null,before,after,
  wires:page.proposals.flatMap(r=>r.candidates??[]).flatMap(c=>c.wires?[c.wires]:c.batch?.entries?.map(e=>e.wires)??[]),
  failures:page.proposals.flatMap(r=>r.failures??[]).map(f=>f.reason+(f.path?.length?':'+f.path.join('.'):'')+(f.detail?' '+JSON.stringify(f.detail).slice(0,300):''))};
}
const pages=new Map();
for(const line of readFileSync(probes,'utf8').split('\n').filter(Boolean)){
 const p=JSON.parse(line);let out;
 try{
  let page=p.session?pages.get(p.session):null;
  if(!page){page=await newPage(p);if(p.session)pages.set(p.session,page);}
  const r=await turn(page,p);
  out={id:p.id,text:p.text,area:p.area,session:p.session??null,seeded:page.setup.ok,seedFailures:page.setup.ok?undefined:page.setup.failures,...r};
 }catch(e){out={id:p.id,text:p.text,area:p.area,error:String(e.message),stack:String(e.stack).split('\n').slice(0,6).join(' / ')};}
 process.stdout.write(JSON.stringify(out)+'\n');
}
