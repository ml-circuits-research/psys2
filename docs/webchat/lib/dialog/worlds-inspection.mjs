// Read-only architecture projection of the runtime registry. No inferred execution links.
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=ebb9691a80';
import {inspectReaderAdmissionPolicy} from './reader-policy.mjs?v=6f246bc7a3';
import {inspectReaderContextPolicy} from './reader-context-policy.mjs?v=7a5480b952';
import {describeWorldsNodes} from './worlds-node-metadata.mjs?v=c606798b5f';
import {CATALOG_WORLD_PURPOSES} from './catalog-world-purpose.mjs?v=3df107aae0';
import {describePlacementSearch} from './placement-search-inspection.mjs?v=fe18d841ef';
import {RUNTIME_COMPONENTS,componentAudit,auditRuntimeComponents} from './runtime-component-registry.mjs?v=229e281339';

export function inspectSchemaSource(source){
 if(typeof source!=='string')return {status:'source not loaded',legends:[],modules:[],types:[],slots:[],tools:[],parameters:[],language:[],documentation:[],languageStatus:'Source has not been read; no language binding is asserted.'};
 try{
  const nodes=parse(source),entry=node=>({id:node.id,predicate:node.type,attributes:structuredClone(node.attrs),wire:serialize([node]),...(node.attrs.doc?{documentation:node.attrs.doc.map(str).join(' ')}:{})}),select=types=>nodes.filter(node=>types.includes(node.type)).map(entry);
  const language=select(['core.word','core.phrase','core.shape']);
  return {status:'parsed declarations',legends:select(['core.legend']),modules:select(['core.module','core.use']),types:select(['core.type']),slots:select(['core.slot','core.key']),tools:select(['app.native.operation','std.capability.operation']),parameters:select(['app.native.parameter','std.capability.parameter']),language,documentation:nodes.filter(node=>node.attrs.doc).map(entry),languageStatus:language.length?'Word, phrase or shape declarations are present. Their presence does not prove that the active reader uses them.':'No core.word, core.phrase or core.shape declarations occur in this source. Native tool declarations alone do not establish a text-to-intent binding.'};
 }catch(error){return {status:'source parse failed',error:String(error?.message??error),legends:[],modules:[],types:[],slots:[],tools:[],parameters:[],language:[],documentation:[],languageStatus:'Source could not be parsed; no language binding is asserted.'};}
}
const SOP_AREA_MODULE='worlds/sop-area.mjs',SOP_WORLD_HOST_MODULE='worlds/sop-world-host.mjs';
const SESSION_MEMORY_DESCRIPTION='Part of the Session (turn coordinator), kept as serializable JavaScript: the message counter and session languages; the conversation memory (discourse frames, dialogue, focus and last action: the conversational references); the recent worlds; the global undo/redo journal (history.sop holds the same SOP facts as the Session Undo and Redo World, payloads hold the editor snapshots it restores); retained execution evidence (newEngineJournal, shown as the Retained execution journal); the reader\'s previous reading and the placement spacing profile.';
const solverName=provider=>({internal:'the internal search',z3:'Z3','declared-method':'the declared placement method (ranked directions, no search)'})[provider]??provider;
/** Interpreters that run for every SOP area and for relation placement; the Z3 node carries its live load state. */
function interpreterNodes(placementSearch){
 const z3=placementSearch?.z3??{state:'not loaded',summary:'Status not supplied.'};
 return [
  {id:'component:sop-area',label:'SOP area interpreter',kind:'interpreter',implementation:'JavaScript over declared SOP',description:'Reads each tab\'s area.sop: the catalog modules that form its instance and knowledge, the rule files that compile its commands and project its drawing, its initial things and the open choices of its native interface. It builds the tab\'s tool host from that declaration and holds no knowledge of any tab.',details:{source:SOP_AREA_MODULE,renderer:'worlds/sop-primitives.mjs'}},
  {id:'component:sop-world-host',label:'SOP world host',kind:'interpreter',implementation:'JavaScript + library acts',description:'Runs a tool command on a tab whose state is an SOP instance World: the command is told as app.act.request, the tab\'s authored rules derive ordered app.act.call facts (make, change, remove) and view facts, and the library\'s generic acts (World.act) apply them. The resulting instance facts are the tool state.',details:{source:SOP_WORLD_HOST_MODULE}},
  {id:'component:problem-compiler',label:'std.problem compiler',displayName:'Placement compiler (std.problem)',kind:'interpreter',implementation:'SOPWorlds library (compileRequest, std.placement)',status:placementSearch?.lastSolvedBy?'last placement: '+placementSearch.lastSolvedBy:'no placement compiled yet',why:'Compiles a relation request ("put the sun above the house") with the observed geometry. A request the declared placement method covers is placed by its ranked directions without a search; a placement problem (std.problem) goes to a search provider (Z3 when ready, otherwise the internal search). '+(placementSearch?.lastSolvedBy?'The last placement in this session was answered by '+solverName(placementSearch.lastSolvedBy)+(placementSearch.lastStatus?' (status '+placementSearch.lastStatus+')':'')+'.':'No placement has been compiled in this session yet.'),description:'Compiles a relation request with the observed geometry, the placement objective and k.spatial2d. The declared placement method answers with ranked directions when it covers the request; otherwise the request becomes a std.problem (positions as variables, relations as constraints, declared costs as the objective) solved by a search provider. The result says which one placed it.',details:{source:'src/vendor/sopworld/sopworld.mjs',caller:'src/dialog/spatial-placement-execution.mjs',lastSolvedBy:placementSearch?.lastSolvedBy??null,lastStatus:placementSearch?.lastStatus??null,placementsCompiled:placementSearch?.placements??0}},
  {id:'provider:internal-search',label:'Internal search',displayName:'Internal search solver',kind:'interpreter',implementation:'SOPWorlds library (JavaScript)',status:'always available',why:'Solves placement problems with the library\'s own bounded search. Always available; it answers whenever Z3 is not ready or declines a model.',description:'The library\'s bounded grid search over the problem\'s variables, checking each constraint as soon as its variables are assigned and keeping the cheapest assignments. It answers whenever Z3 is unavailable or declines a model.',details:{source:'src/vendor/sopworld/sopworld.mjs (solveInternal)',availability:'always available'}},
  {id:'provider:z3',label:'Z3 SMT solver',displayName:'Z3 solver ('+z3.state+')',kind:'interpreter',implementation:'Z3 WebAssembly (z3-solver '+(z3.version??'unknown')+')',status:z3.state,why:'Solves placement problems with the Z3 SMT solver when the page can run it. '+z3.summary,description:'Solves the same std.problem as an SMT optimisation (integer and real position variables, relation constraints, soft costs) in a WebAssembly build loaded from the library site. '+z3.summary,details:z3},
 ];
}
/** Summary of the deployed reader binding bundle (engine.requestReader.bindings()): identity, pins, sizes and key coverage per area. */
export function summarizeReaderBindings(bindings,{sha256=null,bytes=null}={}){
 if(!bindings||typeof bindings!=='object')return null;
 const count=value=>Array.isArray(value)?value.length:0,byArea={};
 for(const row of Array.isArray(bindings.coverage)?bindings.coverage:[]){const area=byArea[row.area]??={bound:[],unbound:[]};if(row.status==='bound')area.bound.push({key:row.key,by:row.by??null,operation:row.operation??null,parameter:row.parameter??null});else area.unbound.push({key:row.key,reason:row.reason??null});}
 const kindWorlds={};for(const kind of Array.isArray(bindings.kinds)?bindings.kinds:[])if(typeof kind?.sourceWorld==='string')kindWorlds[kind.sourceWorld]=(kindWorlds[kind.sourceWorld]??0)+1;
 const catalogue=bindings.catalogue??{},provenance=bindings.provenance??{};
 return {format:bindings.format??null,sha256,bytes,knowledgePin:catalogue.knowledgePin??provenance.knowledgePin??null,baseKnowledgePin:catalogue.baseKnowledgePin??null,inventory:catalogue.inventory??null,libraryVersion:provenance.runtimeLibraryVersion??null,
  sizes:{families:count(bindings.families),kinds:count(bindings.kinds),properties:count(bindings.properties),units:count(bindings.units),unresolved:count(bindings.unresolved)},
  coverage:Object.fromEntries(Object.entries(byArea).map(([area,{bound,unbound}])=>[area,{bound:bound.length,total:bound.length+unbound.length,boundKeys:bound,unboundKeys:unbound}])),kindWorlds};
}
/** Per-turn reader evidence retained by the worker (cutter spans, key-reader packets, minimum probability, unresolved, context fit). */
function summarizeReaderDiagnostics(diagnostics){
 return diagnostics.map(diagnostic=>{const result=diagnostic?.result??{},packet=result.packet??{};
  return {component:diagnostic?.component??null,text:packet.source?.text??null,...(Array.isArray(packet.spans)?{spans:packet.spans}:{}),coverage:packet.coverage??null,unresolved:packet.unresolved??[],minimumProbability:result.auxiliary?.minimumProbability??null,contextSelection:result.auxiliary?.contextSelection??null};});
}
/** Records of the reader's binding bundle and per-turn evidence, the turn limits, the translation boundary and the suggestion sampler. */
function addReaderAndBoundaryRecords(nodes,edges,{readerBindings,readerDiagnostics,turnLimits,translation,sampler}){
 const ids=new Set(nodes.map(node=>node.id)),links=[],link=(from,to,label)=>(ids.has(to)?edges.push({from,to,label}):links.push({from,to,label}));
 const add=node=>{nodes.push(node);ids.add(node.id);};
 // null: the worker has no bundle yet (reader loading or unavailable); the record is still shown so the map keeps one shape.
 if(readerBindings!==undefined){
  const coverage=readerBindings?Object.entries(readerBindings.coverage).map(([area,row])=>area+' '+row.bound+'/'+row.total).join(', '):'';
  add({id:'component:reader-bindings',label:'Reader binding bundle',kind:'component',representation:'catalog',entry:'model',implementation:'Binding bundle (JSON, hash checked)',status:readerBindings?'keys bound: '+(coverage||'no coverage rows'):'not loaded: the reader has not supplied its bundle yet',
   why:'Binds the lemmas and keys the reader proposes to canonical kinds, properties, units and native tool parameters. Coverage lists, per area the bundle covers, which inventory keys are bound and why the others are not; an area without coverage rows has no key bindings in this bundle. Built from the knowledge catalog at pin '+(readerBindings?.knowledgePin??'unknown')+'.',
   description:'Deployed SOP-BERT binding bundle: identity, catalog pin, sizes and key coverage per area.',details:readerBindings??{loaded:false}});
  link('component:reader','component:reader-bindings','binds proposals with');
  for(const world of Object.keys(readerBindings?.kindWorlds??{}))link('component:reader-bindings','knowledge-world:'+world,'takes kind lemmas from');
 }
 if(Array.isArray(readerDiagnostics)){
  const evidence=summarizeReaderDiagnostics(readerDiagnostics),cuts=evidence.filter(row=>row.component==='cutter');
  add({id:'runtime:reader-evidence',label:'Reader evidence of the last turn',kind:'runtime',implementation:'JavaScript (worker retained diagnostics)',status:evidence.length?evidence.length+' model calls · cuts '+cuts.map(row=>JSON.stringify((row.spans??[]).map(span=>Array.isArray(span)?span:[span.start,span.end]))).join(' '):'no reader call in the last turn',
   why:'The reader\'s own per-turn diagnostics, retained by the worker for the last turn: the cutter\'s spans (how the text was split into requests), each key-reader packet, the minimum head probability, unresolved items and how the context was fitted to the model budget.',
   description:'Per-turn reader diagnostics (reset at each turn).',details:{calls:evidence}});
  link('component:reader','runtime:reader-evidence','records its per-turn diagnostics in');
 }
 if(turnLimits){
  add({id:'runtime:turn-limits',label:'Turn limits and budget',kind:'runtime',implementation:'JavaScript (time limits, guard, step budget)',status:'watchdog '+(turnLimits.limits?.watchdogMs??'?')+' ms'+(turnLimits.budget?' · step budget on':' · no step budget'),
   why:'The live time limits of a turn (watchdog, model call deadlines, effect cap) and the step budget. A turn the guard aborts emits "Session request failed" with the reason, the stage it was in and these limits; a turn the page watchdog kills restarts the worker.',
   description:'Turn deadlines, guard and step budget in force.',details:turnLimits});
  link('runtime:turn-limits','component:reasoner','bounds each turn of');
 }
 if(translation){
  add({id:'runtime:translation-boundary',label:'Translation calls and failures',kind:'runtime',implementation:'Browser translation APIs via the page (worker relay)',status:translation.lastFailure?'last failure: '+translation.lastFailure.error:translation.calls?translation.calls+' calls, no failure':'not used in this session',
   why:'Translates non-English input to English and replies back at the system boundary, through the page\'s browser translator and language detector. It records each call and the last failure reason.',description:'Language detection and machine translation calls and their last failure.',details:translation});
  link('runtime:translation-boundary','component:reasoner','translates input and replies for');
 }
 if(sampler){
  add({id:'runtime:suggestion-sampler',label:'Last suggestion sample',kind:'runtime',implementation:'JavaScript (declared-tool sampler)',status:sampler.last?'last sample: '+(sampler.last.view??'?')+' · '+(sampler.last.items??0)+' items':'no sample yet',
   why:'Samples example requests and control suggestions from the declared tools of a tab ("dice"). Its probe runs are marked as suggestion probes in the activity log and never change the editors.',description:'Suggestion sampler scope and its last run.',details:sampler});
  link('runtime:suggestion-sampler','component:reader','probes the reader with');
 }
 return links;
}
/**
 * Puts every declared runtime JavaScript component on the map. A component that names an existing record (node) decorates it
 * with its audit; otherwise it becomes its own record in the JavaScript band, in the column of its area when it has one.
 * Links to records of the base graph become edges; links to records only the merged worker graph holds are returned as
 * componentLinks, which the explorer draws when both ends exist.
 */
function addRuntimeComponents(nodes,edges){
 const byId=new Map(nodes.map(node=>[node.id,node])),pending=[];
 for(const component of RUNTIME_COMPONENTS){
  const audit=componentAudit(component),existing=component.node?byId.get(component.node):null;
  let id;
  if(existing){existing.audit=audit;id=existing.id;}
  else{
   id='js:'+component.id;
   const node={id,label:component.label,kind:'component',layer:'code',representation:'javascript',implementation:component.uiHelper?'JavaScript UI helper':'JavaScript',role:component.uiHelper?'JavaScript UI helper':'JavaScript component',
    status:(audit.badge==='domain-logic'?'domain logic in JS':'generic JS')+' · '+audit.modules.length+' module'+(audit.modules.length===1?'':'s')+(audit.activityHook?'':' · no activity hook'),
    why:component.role,description:component.role,audit,details:{component:component.id,modules:component.modules.map(module=>module.path),classification:audit.counts,...(component.node?{decorates:component.node,decoratedRecordPresent:false}:{})}};
   if(component.area)node.world=component.area;
   nodes.push(node);byId.set(id,node);
  }
  for(const [target,label]of audit.actsOn)pending.push({from:id,to:target,label});
 }
 const links=[];
 for(const link of pending){if(link.from===link.to)continue;if(byId.has(link.to))edges.push(link);else links.push(link);}
 return links;
}
export function inspectWorldsRuntime({index={},bundle={worlds:{}},loaded=[],instances=[],hosts=[],nativePackages=[],knowledgeFiles=[],reader={},nativeStates={},instanceCaches=[],sessionMeta=null,libraryInfo=null,placementSearch=describePlacementSearch(),readerBindings=undefined,readerDiagnostics=null,turnLimits=null,translation=null,sampler=null}={}){
 const authoritative=new Set(instances.filter(record=>record.authoritative).map(record=>record.world));
 const schemaWorlds=new Map();
 const nodes=[],edges=[],loadedSet=new Set(loaded),hostByWorld=new Map(hosts.map(h=>[h.world,h]));
 const link=(from,to,label)=>edges.push({from,to,label});
 nodes.push({id:'runtime:registry',label:'World loader',kind:'component',role:'Implementation component',implementation:'JavaScript',description:'Loads the application packages (bundle files and native modules) from the versioned world index and records which ones this worker has loaded. Editor domain resolution is handled by the separate operational SOP tab registry World.',details:{index,loaded}});
 for(const [id,info]of Object.entries(index.worlds??{})){
  const held=bundle.worlds?.[id],files=held?.files??{},host=hostByWorld.get(id);
  nodes.push({id:'world:'+id,label:id,kind:'world',packageHasNativeCode:!!host||nativePackages.includes(id),implementation:host||nativePackages.includes(id)?'SOP declarations + JavaScript adapter':'SOP Lang',status:loadedSet.has(id)?'loaded':'available, not loaded',description:info.summary||info.title||'Application SOP world package. Schema declarations, methods and initial facts may coexist in this package; inspect its actual files.',details:{...info,loaded:loadedSet.has(id),files:Object.keys(files),architectureRole:'Application SOP world package; not asserted to be a pure world pattern'},wires:Object.entries(files).map(([path,text])=>'# '+path+'\n'+text).join('\n\n')});
  link('runtime:registry','world:'+id,loadedSet.has(id)?'loaded world':'available world');
  for(const target of info.imports??[])link('world:'+id,'world:'+target,'imports');
  for(const target of info.reads??[])link('world:'+id,'world:'+target,'declares reads');
  for(const target of info.compose??[])link('world:'+id,'world:'+target,'declares composition');
  const declared=new Map((info.schemaFiles??[]).map(entry=>typeof entry==='string'?[entry,{file:entry}]:[entry.file,entry]).filter(([file])=>typeof file==='string'));
  const paths=[...new Set([...Object.keys(files).filter(path=>/(?:schema|legend).*\.sop$/.test(path)),...declared.keys()])];
  const schemaWorld=typeof info.schemaWorld==='string'?info.schemaWorld:null,schemaWorldId=schemaWorld?'schema-world:'+schemaWorld:null;
  if(schemaWorldId){
   schemaWorlds.set(id,schemaWorldId);const present=[...declared.keys()].filter(path=>typeof files[path]==='string'),wires=present.map(path=>'# '+path+'\n'+files[path]).join('\n\n');
   nodes.push({id:schemaWorldId,label:schemaWorld,kind:'schema',implementation:'SOP Lang declared sources',status:present.length===declared.size&&declared.size?'declared sources loaded':present.length?'declared sources partly loaded':'declared sources not loaded',description:'Schema-world identity explicitly declared by application metadata. Its exact source files are linked below. This view does not assert an additional independently executed World.',...(present.length?{wires}:{}),schemaView:inspectSchemaSource(present.length?wires:undefined),details:{world:id,schemaWorld,declaredFiles:[...declared.values()],loadedFiles:present,completeStateSchema:[...declared.values()].some(file=>file.completeStateSchema===true),completenessEvidence:'completeStateSchema comes from the source-file declaration; a native-tool-interface alone is not a complete state schema.'}});
   link('world:'+id,schemaWorldId,'declares schema world');
  }
  for(const path of paths){
   const text=files[path],descriptor=declared.get(path)??{},key='schema:'+id+':'+path,loaded=typeof text==='string';
   nodes.push({id:key,label:id+' / '+path,kind:'schema',partOf:schemaWorldId&&declared.has(path)?schemaWorldId:'world:'+id,implementation:'SOP Lang',status:loaded?'source loaded':'source declared, not loaded',description:descriptor.role==='native-tool-interface'?'Declared native tool interface: operations, targets and parameters. This source does not claim a complete semantic state schema.':'Exact schema, legend or policy source declared by this application package.',...(loaded?{wires:text}:{}),schemaView:inspectSchemaSource(text),details:{world:id,path,...descriptor,...(schemaWorld?{schemaWorld}:{}),loaded}});
   link('world:'+id,key,declared.has(path)?'declares schema file':'contains declaration file');if(schemaWorldId&&declared.has(path))link(schemaWorldId,key,'declares source file');
  }
  if(host){
   const areaHost=(info.runtimeModules??[]).includes(SOP_WORLD_HOST_MODULE);
   nodes.push({id:'interpreter:'+id,label:host.view+(areaHost?' SOP area tool host':' native tool adapter'),kind:'adapter',implementation:'JavaScript',...(areaHost?{why:'Runs this tab\'s tools: built by the SOP area interpreter from area.sop, it executes commands through the tab\'s authored rules in the SOP world host and keeps the result as SOP instance facts. JavaScript validates arguments, observes objects and renders the view.'}:{}),description:areaHost?'Tool host of this tab, built by the SOP area interpreter from its area.sop. Commands run through the tab\'s authored rules in the SOP world host; JavaScript validates arguments, observes objects and renders the view.':'Native tool implementation with declared bindings, observation and effect handlers. JavaScript performs tool execution and remaining domain behavior.',tools:host.operations,details:{world:id,capabilities:host.capabilities,observation:host.observation,source:info.nativeHost?.module??null,factory:info.nativeHost?.factory??null,runtimeModules:info.runtimeModules??[]}});
   link('interpreter:'+id,'world:'+id,'implements declared tools');
   const runtimeModules=info.runtimeModules??[];
   if(runtimeModules.includes(SOP_AREA_MODULE))link('component:sop-area','interpreter:'+id,'builds this tool host from the area declaration');
   if(runtimeModules.includes(SOP_WORLD_HOST_MODULE))link('interpreter:'+id,'component:sop-world-host','runs commands through the area rules in');
   if((host.operations??[]).some(operation=>operation?.spatial))link('component:problem-compiler','interpreter:'+id,'applies solved placements through');
   if(!authoritative.has(id)&&Object.hasOwn(nativeStates,id))link('interpreter:'+id,'native:'+id,'operates on');
  }
 }
 for(const [world,state]of Object.entries(nativeStates)){
  if(authoritative.has(world))continue;
  const nativeId='native:'+world;
  nodes.push({id:nativeId,world,label:world+' native state',kind:'runtime',role:'Native editor state',implementation:'JavaScript',description:'JavaScript state of a world that has no authoritative SOP state (it is not an SOP World yet). Its fields are available in this record’s properties.',details:state});
  link('component:reasoner',nativeId,'owns native session state');
 }

 for(const record of instances){
  nodes.push({id:'instance:'+record.world,label:record.world+' world instance',kind:'instance',implementation:record.authoritative?'Authoritative SOP Lang World':'SOP Lang World observed from native adapter',description:record.authoritative?'Actual operational domain state. Tools decode temporary native data from these exact SOP facts and commit only validated SOP results; there is no parallel native row store.':'Actual semantic World held in session.instanceWorlds: domain facts and explicit references, excluding native history, renderer projection and archive descriptors. The native adapter still owns additional semantic state; this observation is not yet the operational authority.',wires:record.wires,details:{instanceId:record.instanceId,revision:record.revision,world:record.world,storage:'session.instanceWorlds',authority:record.authoritative?'operational':'observation',...(record.prepared===false?{observation:'Area not prepared in this session: no tool host was created and no knowledge was read for inspection. These are the instance facts it holds.'}:{}),...(record.authoritative&&Object.hasOwn(nativeStates,record.world)?{nativeCarrier:nativeStates[record.world]}:{}),cachedWorld:instanceCaches.find(cache=>cache.world===record.world)??null}});
  link('instance:'+record.world,'world:'+record.world,'associated application world');
  if(schemaWorlds.has(record.world))link('instance:'+record.world,schemaWorlds.get(record.world),'declared schema world');
  if(!record.authoritative&&Object.hasOwn(nativeStates,record.world))link('native:'+record.world,'instance:'+record.world,'supplies observed facts');
  if(record.schema){const id='governing-schema:'+record.world;nodes.push({id,label:record.world+' governing schema',kind:'schema',implementation:'SOP Lang',description:'Actual schema loaded to validate the operational World.',wires:record.schema,schemaView:inspectSchemaSource(record.schema),details:{world:record.world,role:'governing-state-schema'}});link('instance:'+record.world,id,'validated by');}

  if(hostByWorld.has(record.world))link('interpreter:'+record.world,'instance:'+record.world,record.authoritative?'reads and updates canonical facts':'projects observed facts');
 }
 if(sessionMeta){
  nodes.push({id:'runtime:session-memory',label:'Session memory',kind:'runtime',partOf:'component:reasoner',implementation:'JavaScript',description:SESSION_MEMORY_DESCRIPTION,details:sessionMeta});link('component:reasoner','runtime:session-memory','owns session metadata');
 }
 nodes.push({id:'knowledge:catalog',label:'Knowledge',displayName:'Knowledge catalog',kind:'knowledge',implementation:'SOP Lang + JavaScript loader',description:'Shared catalog loaded by reference. The children show files actually read in this worker; no knowledge is copied into an instance by this inspector.',details:{filesRead:knowledgeFiles.length}});
 const knowledgeByPath=new Map(knowledgeFiles.map(file=>[file.path,file])),catalogText=knowledgeByPath.get('index.json')?.text;let catalogWorlds=[];
 try{const catalog=JSON.parse(catalogText??'null');if(Array.isArray(catalog?.worlds))catalogWorlds=catalog.worlds;}catch{/* The exact invalid source remains visible as a file. */}
 const sourcePaths=world=>[...new Set([world.schema,world.vocabulary,...(world.shards??[]).map(shard=>shard.path)].filter(Boolean))];
 const catalogIds=new Set(catalogWorlds.map(world=>world.id)),sourceOwners=new Map(catalogWorlds.flatMap(world=>sourcePaths(world).map(path=>[path,world.id])));
 for(const world of catalogWorlds){
  const id='knowledge-world:'+world.id,paths=sourcePaths(world),loadedFiles=paths.filter(path=>knowledgeByPath.has(path));
  nodes.push({id,label:world.id,kind:'knowledge',implementation:'SOP Lang',status:loadedFiles.length===paths.length&&paths.length?'All declared sources read':loadedFiles.length?'Some sources read':'Source files available; not read',why:CATALOG_WORLD_PURPOSES[world.id],sourceFiles:paths.filter(path=>path.endsWith('.sop')).map(path=>({path,role:path===world.schema?'schema':'knowledge',loaded:knowledgeByPath.has(path)})),usage:loadedFiles.some(path=>knowledgeByPath.get(path)?.purposes?.includes('runtime'))?'runtime-read':loadedFiles.length?'inspection-only':'available',description:'A world published in the shared catalog. The catalog contains world patterns and knowledge bases; this entry does not explicitly declare which book role it has. Sources are linked, not copied into instances.',details:{...world,loadedFiles,architectureRole:'Published world; specific pattern/knowledge role not declared in catalog metadata'}});link('knowledge:catalog',id,'catalog world');
  for(const target of world.depends??[])if(catalogIds.has(target))link(id,'knowledge-world:'+target,'declares dependency');
  for(const path of loadedFiles)link(id,'knowledge-file:'+path,path===world.schema?'loaded schema':path===world.vocabulary?'loaded vocabulary':'loaded shard');
  if(world.schema&&!knowledgeByPath.has(world.schema)){const schemaId='knowledge-file:'+world.schema;nodes.push({id:schemaId,label:world.schema,kind:'schema',partOf:id,implementation:'SOP Lang',description:'Schema declared by the catalog; its text has not been read by this worker.',why:CATALOG_WORLD_PURPOSES[world.id],sourceFiles:[{path:world.schema,role:'schema',loaded:false}],usage:'available',schemaView:inspectSchemaSource(undefined),details:{path:world.schema,loaded:false}});link(id,schemaId,'declares schema');}
 }
 for(const file of knowledgeFiles){const id='knowledge-file:'+file.path,owner=sourceOwners.get(file.path);nodes.push({id,label:file.path,partOf:owner?'knowledge-world:'+owner:'knowledge:catalog',kind:catalogWorlds.some(world=>world.schema===file.path)?'schema':'knowledge',implementation:/\.sop$/.test(file.path)?'SOP Lang':'Catalog data',description:'Exact file text returned by the active knowledge source.',why:CATALOG_WORLD_PURPOSES[sourceOwners.get(file.path)],sourceFiles:[{path:file.path,role:'source',loaded:true}],usage:file.purposes?.includes('runtime')?'runtime-read':'inspection-only',wires:file.text,...(catalogWorlds.some(world=>world.schema===file.path)?{schemaView:inspectSchemaSource(file.text)}:{}),details:{path:file.path,loaded:true}});link('knowledge:catalog',id,'loaded file');}
 if(libraryInfo){nodes.push({id:'component:library',label:'SOPWorlds library',kind:'component',implementation:'JavaScript + built-in SOP schemas',description:'Actual imported library version, schema type identities and exported pipeline declarations. These are implementation mechanisms, not independent instance worlds.',details:libraryInfo});link('component:reasoner','component:library','imports mechanisms');}
 nodes.push(...interpreterNodes(placementSearch));
 link('component:problem-compiler','provider:internal-search','solves with (always available)');
 link('component:problem-compiler','provider:z3','solves with when loaded');
 if(libraryInfo){link('component:sop-world-host','component:library','runs generic acts in');link('component:problem-compiler','component:library','implemented in');}
 nodes.push({id:'component:reader',label:'SOP-BERT',displayName:'SOP-BERT reader',kind:'component',implementation:'Trained model + JavaScript',description:'Actual browser reader provider. This node does not imply that model internals are SOP reasoning.',details:reader});
 const context=inspectReaderContextPolicy();
 nodes.push({id:'knowledge:reader-context',label:'Reader context policy',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Defines the display bindings, exact mention evidence, hierarchy and focus used to select reader context.',
  wires:context.policy,details:{source:'worlds/app.project/reader-context-policy.sop',loaded:context.loaded}});
 nodes.push({id:'schema:reader-context',label:'app.readerContext',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines the native observation roles and evidence classes used by context projection.',
  wires:context.schema,schemaView:inspectSchemaSource(context.schema),
  details:{source:'worlds/app.project/reader-context-schema.sop',loaded:context.loaded}});
 link('component:reader','knowledge:reader-context','uses declared context projection');
 link('knowledge:reader-context','schema:reader-context','imports schema');

 nodes.push({id:'component:control-interpreter',label:'SOP tool command reader',kind:'interpreter',implementation:'JavaScript + declared tool schemas',description:'Parses compact or expanded SOP control wires and validates exact tool parameters before native UI invocation. This interpreter is separate from the text reader.',details:{source:'src/dialog/native-intent-reader.mjs',caller:'src/dialog/native-tool-controls.mjs'}});
 for(const host of hosts)if(Object.hasOwn(index.worlds??{},host.world))link('component:control-interpreter','interpreter:'+host.world,'validates concrete tool commands for');
 nodes.push({id:'component:request-admission',label:'Request admission',kind:'component',implementation:'JavaScript',description:'Checks technical proposal validity and submits measured evidence to the reader admission World.',details:{source:'src/dialog/reader-admission.mjs',entryPoint:'assessReaderProposal'}});
 const admissionPolicy=inspectReaderAdmissionPolicy();
 nodes.push({id:'knowledge:reader-admission-policy',label:'Reader admission policy',kind:'knowledge',implementation:'Operational SOP Lang World',
  status:admissionPolicy.loaded?'loaded':'available, not loaded',description:'Declares action classes, calibration limits and when reversible best effort is allowed.',wires:admissionPolicy.wires,
  details:{source:admissionPolicy.source,loaded:admissionPolicy.loaded}});
 nodes.push({id:'schema:reader-admission',label:'Reader admission schema',kind:'schema',implementation:'SOP Lang schema World',
  description:'Defines the measured reader evidence, action classes and decisions used to admit a proposed request.',
  wires:admissionPolicy.schema,schemaView:inspectSchemaSource(admissionPolicy.schema),
  details:{source:'worlds/app.project/reader-admission-schema.sop',loaded:admissionPolicy.loaded}});
 link('knowledge:reader-admission-policy','schema:reader-admission','imports its evidence and decision types');
 link('component:request-admission','knowledge:reader-admission-policy','asks for an admission decision');
 if(libraryInfo)link('knowledge:reader-admission-policy','component:library','runs declared rules in');
 link('component:reader','component:request-admission','supplies candidate graphs');
 link('component:reasoner','component:request-admission','checks proposal admission through');
 link('component:reasoner','component:control-interpreter','routes exact tool commands and undo through');
 nodes.push({id:'component:reasoner',label:'Session',displayName:'Session (turn coordinator)',kind:'component',implementation:'JavaScript + SOP mechanisms',description:'Actual session.send execution boundary. Native UI controls invoke their declared host directly.'});
 nodes.push({id:'runtime:activity-bus',label:'Activity bus',kind:'component',implementation:'JavaScript worker event channel',description:'Actual world-activity events on the engine worker channel. Emits observed loading, reader, session and native invocation boundaries; it does not infer internal reasoning.',details:{workerEvent:'world-activity',retainedWorkerEvents:300,browserReplayWindow:300,retention:'The worker keeps its last 300 events (returned with each inspection); the page keeps its last 300 for the log and replay. Copy retained log copies the page\'s 300.'}});
 const silent=new Set(interpreterNodes().map(node=>node.id));
 for(const node of nodes.filter(node=>!silent.has(node.id)&&['interpreter','adapter'].includes(node.kind)||['component:reader','component:reasoner','knowledge:catalog'].includes(node.id)))link(node.id,'runtime:activity-bus','publishes observed activity');
 link('component:reasoner','component:reader','requestReader provider');
 const componentHelp={
  'runtime:registry':{purpose:'Load the application packages declared by the deployment and provide their exact SOP source files.',inputs:['Versioned world index','Requested domain'],outputs:['Loaded world package and native module dependencies'],limits:['Loading a package does not mean it took part in a reasoning step.']},
  'component:reader':{purpose:'Turn the input text into candidate request graphs using SOP-BERT and its declared binding metadata.',inputs:['User text','Available world and selection context'],outputs:['Candidate intents, targets and constraints','Model confidence and missing-field diagnostics'],limits:['Recognition is separate from tool execution. A correctly named concept may still lack an executable drawing or tool binding.'],execution:'Model artifacts may be cached. Cache hit and initialization timings remain in this component’s implementation details.'},
  'component:request-admission':{purpose:'Validate reader proposals and verify retained calibration evidence.',inputs:['Reader candidates and provenance','Configured admission policy'],outputs:['Admissible interpretations and alternatives','Named gaps and rejected interpretations'],limits:['Native tool binding and execution follow in separate components.']},
  'component:control-interpreter':{purpose:'Read concrete SOP control commands produced by UI gestures or supplied directly.',inputs:['Compact or expanded SOP command','Declared native tool interface'],outputs:['Validated operation name and typed arguments'],limits:['Concrete controls bypass vague-language interpretation; they still use the same native tool handlers.']},
  'component:reasoner':{purpose:'Coordinate a user turn, dispatch requests to execution mechanisms and retain conversational state.',inputs:['User request','Current editor Worlds','Session memory'],outputs:['Concrete effects or a named unresolved step','Response and undo state'],limits:['Only instrumented boundaries animate in this graph. The animation does not reveal every internal deduction.']},
  'runtime:activity-bus':{purpose:'Carry actual loading, reader and tool-execution events from the worker to the UI.',inputs:['Instrumented runtime boundary events'],outputs:['Visible node activation and event timeline'],limits:['It observes execution; it does not make decisions or infer unrecorded reasoning.']},
  'runtime:session-memory':{purpose:'Keep the conversation and the global undo/redo state of this session in the JavaScript worker.',inputs:['Turns, tool effects and undo/redo commands'],outputs:['Conversational references for follow-ups','Undo/redo journal and retained execution evidence'],limits:['The undo/redo journal and the retained evidence are also shown as SOP Worlds; this record is their serialisable carrier, not a second source of truth.']},
  'component:sop-area':{purpose:'Turn each tab\'s area.sop declaration into its tool host.',inputs:['area.sop: catalog modules, rule files, initial things, interface choices'],outputs:['A tool host whose state is an SOP instance World'],limits:['It runs for every SOP area tab; tab-specific behaviour lives only in the declared rule files.']},
  'component:sop-world-host':{purpose:'Execute tool commands through the tab\'s authored SOP rules and the library\'s generic acts.',inputs:['Validated tool command','Current instance facts'],outputs:['New instance facts and view keys','Observed objects for the reader'],limits:['Undo and redo belong to the session journal, not to this host.']},
  'component:problem-compiler':{purpose:'Compile relation requests into a std.problem and choose a placement.',inputs:['Relation request','Observed geometry from the tab\'s tool host','Placement objective and k.spatial2d'],outputs:['Placement result with the provider that solved it'],limits:['The solved placement is applied through the tab\'s declared tools and can be undone like any other change.']},
  'provider:internal-search':{purpose:'Solve a std.problem without any external engine.',inputs:['std.problem model'],outputs:['Cheapest assignments found, or budget/exhausted status'],limits:['A bounded grid search: large domains end with a budget status.']},
  'provider:z3':{purpose:'Solve a std.problem with the Z3 SMT solver when the page can run it.',inputs:['std.problem model'],outputs:['Optimal assignment, or a decline so the internal search answers'],limits:['Needs a cross-origin isolated page (SharedArrayBuffer); nothing is fetched before the idle warm-up or the first placement problem.']},
  'component:library':{purpose:'Provide the shared SOP parser, typed World schemas, bindings and reasoning mechanisms.',inputs:['SOP declarations and concrete request/state facts'],outputs:['Validated Worlds and reusable operations'],limits:['The library is a native implementation mechanism; its declared schemas are shown as separate schema sources.']}
 };
 const titleOf=world=>index.worlds?.[world]?.tab?.title??index.worlds?.[world]?.title??world;
 for(const node of nodes){
  const world=node.details?.world;
  if(node.id.startsWith('world:')){const title=titleOf(node.id.slice(6));node.displayName=title+(index.worlds?.[node.id.slice(6)]?.tab?' SOP files':' package');node.why='The SOP files the '+title+' tab ships: its area declaration and rules (area.sop, act rules, render projection), its native tool interface and its instance schema. They declare what the tab can do; the live objects are in its instance World.';node.help={purpose:'The SOP files the '+title+' tab ships: area declaration and rules, native tool interface, instance schema.',inputs:['Application composition declarations'],outputs:['Tool interface and schema references','Available domain source files'],limits:['This node is an application package, not a second copy of the editor state. Its linked instance contains the current facts.']};}
  else if(node.kind==='instance'){node.displayName=titleOf(world)+(authoritative.has(world)?' instance World':' observed instance World');node.role=authoritative.has(world)?'Operational World instance':'Observed World instance';node.help={purpose:'Expose the current concrete objects and relationships for '+titleOf(world)+'.',inputs:[node.description],outputs:['Exact domain SOP facts','References to the declared schema'],limits:[authoritative.has(world)?'The tool adapter still executes mechanical operations in JavaScript.':'Native editor state remains authoritative; this SOP World observes its declared facts. Additional native properties are inspectable separately.']};}
  else if(node.id.startsWith('native:'))node.displayName=titleOf(node.id.slice(7))+' state (JavaScript)';
  else if(node.id.startsWith('interpreter:')){node.displayName=titleOf(node.id.slice(12))+((index.worlds?.[node.id.slice(12)]?.runtimeModules??[]).includes(SOP_WORLD_HOST_MODULE)?' tool host':' native adapter');node.help={purpose:'Execute the declared tools against the actual editor state and expose observations.',inputs:['Concrete validated operation and parameters'],outputs:['Updated editor state','Object observations and effect status'],limits:['Native JavaScript code still contains domain semantics; listing its tool schema does not migrate those semantics into reasoning.']};}
  else if(node.id.startsWith('schema-world:'))node.displayName=titleOf(world)+(node.details.completeStateSchema?' schema':' tool schema');
  const area=world??node.world??(node.id.startsWith('world:')?node.id.slice(6):node.id.startsWith('native:')?node.id.slice(7):null);if(typeof area==='string'&&!node.areaTitle&&titleOf(area)!==area)node.areaTitle=titleOf(area);
  if(componentHelp[node.id])node.help=componentHelp[node.id];
  if(!node.help)node.help={purpose:node.description??'Inspect this actual runtime record.',inputs:[],outputs:[],limits:node.kind==='schema'?['Schema validity and declared tools do not prove natural-language recognition coverage.']:node.implementation?.includes('JavaScript')?['This is a native implementation component or structure, not an independent SOP World instance.']:[]};
 }
 const recordLinks=addReaderAndBoundaryRecords(nodes,edges,{readerBindings,readerDiagnostics,turnLimits,translation,sampler});
 const componentLinks=[...recordLinks,...addRuntimeComponents(nodes,edges)];
 return {nodes:describeWorldsNodes(nodes),edges,componentLinks,runtimeAudit:auditRuntimeComponents(),limitations:['Every JavaScript module on the runtime path is registered in src/dialog/runtime-component-registry.mjs with its generality audit; a test fails when a runtime module is missing. Components without an activity hook (dashed ring) can act without lighting up.','This graph projects actual loader metadata, native bindings and snapshots; the graph is not yet an authoritative SOP project world.','A loaded/imported world is not proof it participated in a particular decision. Only observed runtime events animate nodes.']};
}
