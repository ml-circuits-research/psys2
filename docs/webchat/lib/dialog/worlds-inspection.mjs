// Read-only architecture projection of the runtime registry. No inferred execution links.
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=d7baa85342';
import {inspectReaderAdmissionPolicy} from './reader-policy.mjs?v=fe480c5b2c';
import {inspectReaderContextPolicy} from './reader-context-policy.mjs?v=a76f394007';
import {describeWorldsNodes} from './worlds-node-metadata.mjs?v=11b6d9d2f3';
import {CATALOG_WORLD_PURPOSES} from './catalog-world-purpose.mjs?v=170e410551';

export function inspectSchemaSource(source){
 if(typeof source!=='string')return {status:'source not loaded',legends:[],modules:[],types:[],slots:[],tools:[],parameters:[],language:[],documentation:[],languageStatus:'Source has not been read; no language binding is asserted.'};
 try{
  const nodes=parse(source),entry=node=>({id:node.id,predicate:node.type,attributes:structuredClone(node.attrs),wire:serialize([node]),...(node.attrs.doc?{documentation:node.attrs.doc.map(str).join(' ')}:{})}),select=types=>nodes.filter(node=>types.includes(node.type)).map(entry);
  const language=select(['core.word','core.phrase','core.shape']);
  return {status:'parsed declarations',legends:select(['core.legend']),modules:select(['core.module','core.use']),types:select(['core.type']),slots:select(['core.slot','core.key']),tools:select(['app.native.operation','std.capability.operation']),parameters:select(['app.native.parameter','std.capability.parameter']),language,documentation:nodes.filter(node=>node.attrs.doc).map(entry),languageStatus:language.length?'Word, phrase or shape declarations are present. Their presence does not prove that the active reader uses them.':'No core.word, core.phrase or core.shape declarations occur in this source. Native tool declarations alone do not establish a text-to-intent binding.'};
 }catch(error){return {status:'source parse failed',error:String(error?.message??error),legends:[],modules:[],types:[],slots:[],tools:[],parameters:[],language:[],documentation:[],languageStatus:'Source could not be parsed; no language binding is asserted.'};}
}
export function inspectWorldsRuntime({index={},bundle={worlds:{}},loaded=[],instances=[],hosts=[],nativePackages=[],knowledgeFiles=[],reader={},nativeStates={},instanceCaches=[],sessionMeta=null,libraryInfo=null}={}){
 const authoritative=new Set(instances.filter(record=>record.authoritative).map(record=>record.world));
 const schemaWorlds=new Map();
 const nodes=[],edges=[],loadedSet=new Set(loaded),hostByWorld=new Map(hosts.map(h=>[h.world,h]));
 const link=(from,to,label)=>edges.push({from,to,label});
 nodes.push({id:'runtime:registry',label:'World loader',kind:'runtime',implementation:'JavaScript',description:'Actual bundle/module loading index. Editor domain resolution is handled by the separate operational SOP project World.',details:{index,loaded}});
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
   nodes.push({id:key,label:id+' / '+path,kind:'schema',implementation:'SOP Lang',status:loaded?'source loaded':'source declared, not loaded',description:descriptor.role==='native-tool-interface'?'Declared native tool interface: operations, targets and parameters. This source does not claim a complete semantic state schema.':'Exact schema, legend or policy source declared by this application package.',...(loaded?{wires:text}:{}),schemaView:inspectSchemaSource(text),details:{world:id,path,...descriptor,...(schemaWorld?{schemaWorld}:{}),loaded}});
   link('world:'+id,key,declared.has(path)?'declares schema file':'contains declaration file');if(schemaWorldId&&declared.has(path))link(schemaWorldId,key,'declares source file');
  }
  if(host){
   nodes.push({id:'interpreter:'+id,label:host.view+' native tool adapter',kind:'adapter',implementation:'JavaScript',description:'Native tool implementation with declared bindings, observation and effect handlers. JavaScript performs tool execution and remaining domain behavior.',tools:host.operations,details:{world:id,capabilities:host.capabilities,observation:host.observation,source:'worlds/'+id+'/declared-host.mjs'}});
   link('interpreter:'+id,'world:'+id,'implements declared tools');
   if(!authoritative.has(id)&&Object.hasOwn(nativeStates,id))link('interpreter:'+id,'native:'+id,'operates on');
  }
 }
 for(const [world,state]of Object.entries(nativeStates)){
  if(authoritative.has(world))continue;
  const nativeId='native:'+world;
  nodes.push({id:nativeId,world,label:world+' native state',kind:'runtime',role:'Native editor state',implementation:'JavaScript',description:'Actual operational JavaScript editor state. Its additional semantic fields are available in this record’s properties.',details:state});
  link('component:reasoner',nativeId,'owns native session state');
 }

 for(const record of instances){
  nodes.push({id:'instance:'+record.world,label:record.world+' world instance',kind:'instance',implementation:record.authoritative?'Authoritative SOP Lang World':'SOP Lang World observed from native adapter',description:record.authoritative?'Actual operational domain state. Tools decode temporary native data from these exact SOP facts and commit only validated SOP results; there is no parallel native row store.':'Actual semantic World held in session.instanceWorlds: domain facts and explicit references, excluding native history, renderer projection and archive descriptors. The native adapter still owns additional semantic state; this observation is not yet the operational authority.',wires:record.wires,details:{instanceId:record.instanceId,revision:record.revision,world:record.world,storage:'session.instanceWorlds',authority:record.authoritative?'operational':'observation',...(record.authoritative&&Object.hasOwn(nativeStates,record.world)?{nativeCarrier:nativeStates[record.world]}:{}),cachedWorld:instanceCaches.find(cache=>cache.world===record.world)??null}});
  link('instance:'+record.world,'world:'+record.world,'associated application world');
  if(schemaWorlds.has(record.world))link('instance:'+record.world,schemaWorlds.get(record.world),'declared schema world');
  if(!record.authoritative&&Object.hasOwn(nativeStates,record.world))link('native:'+record.world,'instance:'+record.world,'supplies observed facts');
  if(record.schema){const id='governing-schema:'+record.world;nodes.push({id,label:record.world+' governing schema',kind:'schema',implementation:'SOP Lang',description:'Actual schema loaded to validate the operational World.',wires:record.schema,schemaView:inspectSchemaSource(record.schema),details:{world:record.world,role:'governing-state-schema'}});link('instance:'+record.world,id,'validated by');}

  if(hostByWorld.has(record.world))link('interpreter:'+record.world,'instance:'+record.world,record.authoritative?'reads and updates canonical facts':'projects observed facts');
 }
 if(sessionMeta){
  nodes.push({id:'runtime:session-memory',label:'Session memory',kind:'runtime',implementation:'JavaScript',description:'Actual serializable session metadata, conversational references and global undo/redo journals.',details:sessionMeta});link('component:reasoner','runtime:session-memory','owns session metadata');
 }
 nodes.push({id:'knowledge:catalog',label:'Knowledge',kind:'knowledge',implementation:'SOP Lang + JavaScript loader',description:'Shared catalog loaded by reference. The children show files actually read in this worker; no knowledge is copied into an instance by this inspector.',details:{filesRead:knowledgeFiles.length}});
 const knowledgeByPath=new Map(knowledgeFiles.map(file=>[file.path,file])),catalogText=knowledgeByPath.get('index.json')?.text;let catalogWorlds=[];
 try{const catalog=JSON.parse(catalogText??'null');if(Array.isArray(catalog?.worlds))catalogWorlds=catalog.worlds;}catch{/* The exact invalid source remains visible as a file. */}
 const sourcePaths=world=>[...new Set([world.schema,world.vocabulary,...(world.shards??[]).map(shard=>shard.path)].filter(Boolean))];
 const catalogIds=new Set(catalogWorlds.map(world=>world.id)),sourceOwners=new Map(catalogWorlds.flatMap(world=>sourcePaths(world).map(path=>[path,world.id])));
 for(const world of catalogWorlds){
  const id='knowledge-world:'+world.id,paths=sourcePaths(world),loadedFiles=paths.filter(path=>knowledgeByPath.has(path));
  nodes.push({id,label:world.id,kind:'knowledge',implementation:'SOP Lang',status:loadedFiles.length===paths.length&&paths.length?'All declared sources read':loadedFiles.length?'Some sources read':'Source files available; not read',why:CATALOG_WORLD_PURPOSES[world.id],sourceFiles:paths.filter(path=>path.endsWith('.sop')).map(path=>({path,role:path===world.schema?'schema':'knowledge',loaded:knowledgeByPath.has(path)})),usage:loadedFiles.some(path=>knowledgeByPath.get(path)?.purposes?.includes('runtime'))?'runtime-read':loadedFiles.length?'inspection-only':'available',description:'A world published in the shared catalog. The catalog contains world patterns and knowledge bases; this entry does not explicitly declare which book role it has. Sources are linked, not copied into instances.',details:{...world,loadedFiles,architectureRole:'Published world; specific pattern/knowledge role not declared in catalog metadata'}});link('knowledge:catalog',id,'catalog world');
  for(const target of world.depends??[])if(catalogIds.has(target))link(id,'knowledge-world:'+target,'declares dependency');
  for(const path of loadedFiles)link(id,'knowledge-file:'+path,path===world.schema?'loaded schema':path===world.vocabulary?'loaded vocabulary':'loaded shard');
  if(world.schema&&!knowledgeByPath.has(world.schema)){const schemaId='knowledge-file:'+world.schema;nodes.push({id:schemaId,label:world.schema,kind:'schema',implementation:'SOP Lang',description:'Schema declared by the catalog; its text has not been read by this worker.',why:CATALOG_WORLD_PURPOSES[world.id],sourceFiles:[{path:world.schema,role:'schema',loaded:false}],usage:'available',schemaView:inspectSchemaSource(undefined),details:{path:world.schema,loaded:false}});link(id,schemaId,'declares schema');}
 }
 for(const file of knowledgeFiles){const id='knowledge-file:'+file.path;nodes.push({id,label:file.path,kind:catalogWorlds.some(world=>world.schema===file.path)?'schema':'knowledge',implementation:/\.sop$/.test(file.path)?'SOP Lang':'Catalog data',description:'Exact file text returned by the active knowledge source.',why:CATALOG_WORLD_PURPOSES[sourceOwners.get(file.path)],sourceFiles:[{path:file.path,role:'source',loaded:true}],usage:file.purposes?.includes('runtime')?'runtime-read':'inspection-only',wires:file.text,...(catalogWorlds.some(world=>world.schema===file.path)?{schemaView:inspectSchemaSource(file.text)}:{}),details:{path:file.path,loaded:true}});link('knowledge:catalog',id,'loaded file');}
 if(libraryInfo){nodes.push({id:'component:library',label:'SOPWorlds library',kind:'component',implementation:'JavaScript + built-in SOP schemas',description:'Actual imported library version, schema type identities and exported pipeline declarations. These are implementation mechanisms, not independent instance worlds.',details:libraryInfo});link('component:reasoner','component:library','imports mechanisms');}
 nodes.push({id:'component:reader',label:'SOP-BERT',kind:'component',implementation:'Trained model + JavaScript',description:'Actual browser reader provider. This node does not imply that model internals are SOP reasoning.',details:reader});
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
 nodes.push({id:'component:reasoner',label:'Session',kind:'component',implementation:'JavaScript + SOP mechanisms',description:'Actual session.send execution boundary. Native UI controls invoke their declared host directly.'});
 nodes.push({id:'runtime:activity-bus',label:'Activity bus',kind:'component',implementation:'JavaScript worker event channel',description:'Actual world-activity events on the engine worker channel. Emits observed loading, reader, session and native invocation boundaries; it does not infer internal reasoning.',details:{workerEvent:'world-activity',retainedWorkerEvents:200,browserReplayWindow:300}});
 for(const node of nodes.filter(node=>['interpreter','adapter'].includes(node.kind)||['component:reader','component:reasoner','knowledge:catalog'].includes(node.id)))link(node.id,'runtime:activity-bus','publishes observed activity');
 link('component:reasoner','component:reader','requestReader provider');
 const componentHelp={
  'runtime:registry':{purpose:'Load the application packages declared by the deployment and provide their exact SOP source files.',inputs:['Versioned world index','Requested domain'],outputs:['Loaded world package and native module dependencies'],limits:['Loading a package does not mean it took part in a reasoning step.']},
  'component:reader':{purpose:'Turn the input text into candidate request graphs using SOP-BERT and its declared binding metadata.',inputs:['User text','Available world and selection context'],outputs:['Candidate intents, targets and constraints','Model confidence and missing-field diagnostics'],limits:['Recognition is separate from tool execution. A correctly named concept may still lack an executable drawing or tool binding.'],execution:'Model artifacts may be cached. Cache hit and initialization timings remain in this component’s implementation details.'},
  'component:request-admission':{purpose:'Validate reader proposals and verify retained calibration evidence.',inputs:['Reader candidates and provenance','Configured admission policy'],outputs:['Admissible interpretations and alternatives','Named gaps and rejected interpretations'],limits:['Native tool binding and execution follow in separate components.']},
  'component:control-interpreter':{purpose:'Read concrete SOP control commands produced by UI gestures or supplied directly.',inputs:['Compact or expanded SOP command','Declared native tool interface'],outputs:['Validated operation name and typed arguments'],limits:['Concrete controls bypass vague-language interpretation; they still use the same native tool handlers.']},
  'component:reasoner':{purpose:'Coordinate a user turn, dispatch requests to execution mechanisms and retain conversational state.',inputs:['User request','Current editor Worlds','Session memory'],outputs:['Concrete effects or a named unresolved step','Response and undo state'],limits:['Only instrumented boundaries animate in this graph. The animation does not reveal every internal deduction.']},
  'runtime:activity-bus':{purpose:'Carry actual loading, reader and tool-execution events from the worker to the UI.',inputs:['Instrumented runtime boundary events'],outputs:['Visible node activation and event timeline'],limits:['It observes execution; it does not make decisions or infer unrecorded reasoning.']},
  'component:library':{purpose:'Provide the shared SOP parser, typed World schemas, bindings and reasoning mechanisms.',inputs:['SOP declarations and concrete request/state facts'],outputs:['Validated Worlds and reusable operations'],limits:['The library is a native implementation mechanism; its declared schemas are shown as separate schema sources.']}
 };
 const titleOf=world=>index.worlds?.[world]?.tab?.title??index.worlds?.[world]?.title??world;
 for(const node of nodes){
  const world=node.details?.world;
  if(node.id.startsWith('world:')){const title=titleOf(node.id.slice(6));node.displayName=title+(index.worlds?.[node.id.slice(6)]?.tab?' tools':'');node.help={purpose:'Declare the domain tools, source files and application bindings for '+title+'.',inputs:['Application composition declarations'],outputs:['Tool interface and schema references','Available domain source files'],limits:['This node is an application package, not a second copy of the editor state. Its linked instance contains the current facts.']};}
  else if(node.kind==='instance'){node.displayName=titleOf(world)+(authoritative.has(world)?' World':' observed World');node.role=authoritative.has(world)?'Operational World instance':'Observed World instance';node.help={purpose:'Expose the current concrete objects and relationships for '+titleOf(world)+'.',inputs:[node.description],outputs:['Exact domain SOP facts','References to the declared schema'],limits:[authoritative.has(world)?'The tool adapter still executes mechanical operations in JavaScript.':'Native editor state remains authoritative; this SOP World observes its declared facts. Additional native properties are inspectable separately.']};}
  else if(node.id.startsWith('native:'))node.displayName=titleOf(node.id.slice(7))+' native state';
  else if(node.id.startsWith('interpreter:')){node.displayName=titleOf(node.id.slice(12))+' adapter';node.help={purpose:'Execute the declared tools against the actual editor state and expose observations.',inputs:['Concrete validated operation and parameters'],outputs:['Updated editor state','Object observations and effect status'],limits:['Native JavaScript code still contains domain semantics; listing its tool schema does not migrate those semantics into reasoning.']};}
  else if(node.id.startsWith('schema-world:'))node.displayName=titleOf(world)+(node.details.completeStateSchema?' schema':' tool schema');
  if(componentHelp[node.id])node.help=componentHelp[node.id];
  if(!node.help)node.help={purpose:node.description??'Inspect this actual runtime record.',inputs:[],outputs:[],limits:node.kind==='schema'?['Schema validity and declared tools do not prove natural-language recognition coverage.']:node.implementation?.includes('JavaScript')?['This is a native implementation component or structure, not an independent SOP World instance.']:[]};
 }
 return {nodes:describeWorldsNodes(nodes),edges,limitations:['This graph projects actual loader metadata, native bindings and snapshots; the graph is not yet an authoritative SOP project world.','A loaded/imported world is not proof it participated in a particular decision. Only observed runtime events animate nodes.']};
}
