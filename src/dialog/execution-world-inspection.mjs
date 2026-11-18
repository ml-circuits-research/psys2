// Read-only inspection of execution worlds already owned by the application.
import{parse,serialize,str,version,build}from'../vendor/sopworld/sopworld.mjs';
import SOURCE from'./new-engine-source.mjs';
import{CATALOG_PIN}from'../knowledge/catalog-pin.mjs';
import{inspectRequestRoutingPolicy}from'./request-routing-policy.mjs';
import{inspectHistoryPolicy}from'./history-policy.mjs';
import{inspectHistoryJournal}from'./history-journal.mjs';
import{inspectExecutionPolicyWorld}from'./execution-policy.mjs';
import{sceneDefaultInspection}from'./scene-placement-defaults.mjs';
import{inspectCapabilityPolicy}from'./capability-plan-adapter.mjs';
import{inspectCreationPolicy}from'./project-create-action.mjs';
import{inspectConstructorPolicy}from'./native-binding-candidates.mjs';
import{inspectGroundedProjection}from'./grounded-projection.mjs';
import{inspectReaderHeadPolicy}from'./reader-head-alternative.mjs';
import{inspectReferencePolicy}from'./reference-policy.mjs';
import{inspectSchemaSource}from'./worlds-inspection.mjs';
import{inspectRequestCompositionPolicy}from'./request-composition-policy.mjs';
const clone=value=>structuredClone(value);
const loggedWires=snapshot=>(snapshot?.log??[]).flatMap(entry=>entry.wires??[]);
const importsOf=snapshot=>[...new Set(loggedWires(snapshot).filter(wire=>wire.type==='core.use').flatMap(wire=>(wire.attrs.world??[]).map(str)))];
/** Called by cache-owning modules; never invokes their lazy source constructor. */
export function inspectCachedExecutionSource(world,{moduleNames=[]}={}){
 if(!world)return {loaded:false};
 return {loaded:true,snapshot:clone(world.toJSON()),wires:serialize([...world.wires.values()]),schemaWires:serialize([...world.matrix.values()]),matrixSize:world.matrix.size,factCount:world.wires.size,modules:clone(world.modules()),libraryModules:Object.fromEntries(moduleNames.filter(name=>typeof world.options.library[name]==='string').map(name=>[name,world.options.library[name]]))};
}
function snapshotText(snapshot){return (snapshot?.log??[]).map((entry,index)=>'# Log entry '+index+' / '+entry.op+'\n'+serialize(entry.wires??[])).join('\n\n');}
/** Projects actual cache accessors and retained journal JSON; performs no reading or reasoning. */
export async function inspectExecutionWorlds(session){
 const [{inspectDeclaredExecutionSourceWorld},{inspectSpatialPlacementWorld}]=await Promise.all([
  import('./declared-execution.mjs'),import('./spatial-placement-execution.mjs'),
 ]);
 const journal=session?.newEngineJournal??[],moduleNames=[...new Set(journal.flatMap(record=>importsOf(record.evidence)))],sources=[['declared-execution','src/dialog/declared-execution.mjs',inspectDeclaredExecutionSourceWorld({moduleNames})]],nodes=[],edges=[];
 const link=(from,to,label)=>edges.push({from,to,label});
 const routing=inspectRequestRoutingPolicy();
 nodes.push({id:'execution:routing-policy',label:'Request interpreter routing',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Selects one interpreter from admitted request facts and the history compiler’s declared methods.',
  wires:routing.policy,details:{source:'worlds/app.project/request-routing-policy.sop',loaded:routing.loaded}});
 nodes.push({id:'execution:routing-schema',label:'app.request.route',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines a placement witness and the interpreter selected for an admitted request.',
  wires:routing.schema,details:{source:'worlds/app.project/request-routing-schema.sop',loaded:routing.loaded}});
 link('execution:module:declared-execution','execution:routing-policy','selects an interpreter using');
 link('execution:routing-policy','execution:routing-schema','imports schema');
 link('execution:routing-policy','execution:history-policy','reads declared history methods');
 const history=inspectHistoryPolicy();
 nodes.push({id:'execution:history-policy',label:'History circuit policy',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Compiles an admitted history request with the latest observed entry in the active editor.',
  wires:history.source,details:{source:'worlds/app.project/history-policy.sop',loaded:history.loaded}});
 nodes.push({id:'execution:history-schema',label:'History schema',kind:'schema',implementation:'SOP Lang schema World',
  description:'Defines journal heads, concrete restore instructions and the results the history interpreter reports.',
  wires:history.schema,details:{source:'worlds/app.project/history-schema.sop',loaded:history.loaded}});
 link('execution:history-policy','execution:history-schema','uses the journal contract');
 nodes.push({id:'interpreter:app.history',label:'History interpreter',kind:'interpreter',implementation:'JavaScript journal primitive',
  description:'Checks the compiled head and current content, then restores and verifies the saved editor state.',
  details:{module:'src/dialog/history-tool.mjs'}});
 const journalInstance=inspectHistoryJournal(session);
 if(journalInstance)nodes.push({id:'instance:app.history',label:'Session Undo and Redo',kind:'instance',implementation:'Authoritative SOP Lang World',
  description:'Live journal identities, ordered entries and derived heads. Entry payload references link to editor snapshots owned by the journal interpreter.',
  wires:journalInstance.wires,details:{identity:journalInstance.identity,authority:'operational',undo:journalInstance.undo,redo:journalInstance.redo,
   payloadStore:'src/dialog/history-journal.mjs'}});
 link('execution:module:declared-execution','execution:history-policy','compiles history requests');
 link('execution:history-policy','interpreter:app.history','supplies a guarded SOP call');
 if(journalInstance)link('interpreter:app.history','instance:app.history','restores and verifies an entry');
 const grounded=inspectGroundedProjection();
 nodes.push({id:'execution:grounded-projection',label:'Grounded request projection',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Derives typed request wires from chosen contextual and creation evidence, retaining rule support and source spans.',
  wires:grounded.policy,details:{source:'worlds/app.project/grounded-projection.sop',loaded:grounded.loaded}});
 nodes.push({id:'execution:grounded-projection-schema',label:'app.grounded',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines grounded evidence, graph aliases and their standard request types.',
  wires:grounded.schema,schemaView:inspectSchemaSource(grounded.schema),details:{source:'worlds/app.project/grounded-projection-schema.sop',loaded:grounded.loaded}});
 link('execution:grounded-projection','execution:grounded-projection-schema','imports schema');
 link('execution:reference-policy','execution:grounded-projection','supplies a grounded reference');
 link('execution:creation-policy','execution:grounded-projection','supplies a grounded constructor');
 link('execution:grounded-projection','execution:module:declared-execution','emits an owned request graph');
 const headPolicy=inspectReaderHeadPolicy();
 nodes.push({id:'execution:reader-head-policy',label:'Competing property heads',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Checks whether an unresolved head has a source-grounded equivalent for the active editor.',
  wires:headPolicy.source,details:{source:'worlds/app.project/reader-head-policy.sop',loaded:headPolicy.loaded}});
 nodes.push({id:'execution:reader-head-schema',label:'app.reader.head',kind:'schema',implementation:'SOP Lang schema module',
  description:'Declares source-grounded property evidence and equivalent competing heads.',
  wires:headPolicy.schema,schemaView:inspectSchemaSource(headPolicy.schema),details:{source:'worlds/app.project/reader-head-schema.sop',loaded:headPolicy.loaded}});
 link('execution:reader-head-policy','execution:reader-head-schema','imports schema');
 link('execution:reader-head-policy','execution:module:declared-execution','requires a complete live capability plan');
 const reference=inspectReferencePolicy();
 nodes.push({id:'execution:reference-policy',label:'Context references',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Matches contextual references to observed objects. Its criteria prefer the focused object for a current reference and exclude it when retargeting the previous change.',
  wires:reference.policy,details:{source:'worlds/app.project/reference-policy.sop',loaded:reference.loaded}});
 nodes.push({id:'execution:reference-schema',label:'app.reference',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines reader evidence, live objects, canonical bindings and the result of resolving a contextual reference.',
  wires:reference.schema,schemaView:inspectSchemaSource(reference.schema),details:{source:'worlds/app.project/reference-schema.sop',loaded:reference.loaded}});
 link('execution:reference-policy','execution:reference-schema','imports schema');
 link('execution:reference-policy','execution:module:declared-execution','supplies a grounded reference');
 const creation=inspectCreationPolicy();
 nodes.push({id:'execution:creation-policy',label:'Creation readings',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Ranks constructors by grounded lexical evidence, reader type and family. It also classifies anchored inputs by authored source roles and the selected tool parameters.',
  wires:creation.policy,details:{source:'worlds/app.project/creation-policy.sop',loaded:creation.loaded}});
 nodes.push({id:'execution:creation-schema',label:'app.creation',kind:'schema',implementation:'SOP Lang schema module',
  description:'Declares grounded source evidence, capability inputs, lexical limits and dispositions of creation requirements.',
  wires:creation.schema,schemaView:inspectSchemaSource(creation.schema),details:{source:'worlds/app.project/creation-schema.sop',loaded:creation.loaded}});
 link('execution:creation-policy','execution:creation-schema','imports schema');
 const constructors=inspectConstructorPolicy();
 nodes.push({id:'execution:constructor-policy',label:'Native constructor eligibility',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Joins reader bindings with the current tool interface and retains every eligible constructor pair.',
  wires:constructors.policy,details:{source:'worlds/app.project/constructor-policy.sop',loaded:constructors.loaded}});
 nodes.push({id:'execution:constructor-schema',label:'app.constructor',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines mapped identities, tool capabilities and the derived pairs passed to creation ranking.',
  wires:constructors.schema,schemaView:inspectSchemaSource(constructors.schema),
  details:{module:'app.constructor',source:'worlds/app.project/constructor-schema.sop',loaded:constructors.loaded}});
 link('execution:constructor-policy','execution:constructor-schema','imports schema');
 link('execution:creation-policy','execution:constructor-policy','ranks eligible constructor pairs');
 link('execution:creation-policy','execution:module:declared-execution','supplies grounded creation readings');
 const policy=inspectExecutionPolicyWorld();
 nodes.push({id:'execution:policy',label:'Execution policy',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Declares omitted argument defaults, their notices and catalog lookup ownership.',
  wires:policy.facts,details:{source:policy.source,loaded:policy.loaded,dependencies:policy.dependencies}});
 const capability=inspectCapabilityPolicy();
 nodes.push({id:'execution:capability-policy',label:'Capability compilation',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Applies request modes, seeds, guards and the declared normalization rules to live tool inputs.',
  wires:capability.wires,details:{source:capability.source,loaded:capability.loaded}});
 link('execution:module:declared-execution','execution:capability-policy','compiles native requests with');
 link('execution:capability-policy','execution:policy','uses authored seeds and lookup declarations');
 link('execution:capability-policy','execution:source-snapshot','reads original catalog values');
 const sceneDefaults=sceneDefaultInspection();
 nodes.push({id:'execution:scene-default-policy',label:'Scene placement defaults',kind:'knowledge',implementation:'Operational SOP Lang World',
  description:'Projects catalog regions through observed editor geometry and chooses optional coordinates for ordinary creation.',
  wires:sceneDefaults.policy,details:{source:'worlds/app.project/scene-default-policy.sop',loaded:capability.loaded}});
 nodes.push({id:'execution:scene-default-schema',label:'app.sceneDefault',kind:'schema',implementation:'SOP Lang schema module',
  description:'Defines renderer ports, observed bounds and optional placement alternatives.',
  wires:sceneDefaults.schema,schemaView:inspectSchemaSource(sceneDefaults.schema),
  details:{source:'worlds/app.project/scene-default-schema.sop',loaded:capability.loaded}});
 nodes.push({id:'execution:scene-default-projection',label:'Scene catalog projection',kind:'knowledge',implementation:'SOP Lang compilation profile',
  description:'Binds the current subject names, visible support kinds and layout to indexed catalog reads and selected region evidence.',
  wires:sceneDefaults.projection,details:{source:'worlds/app.project/scene-default-projection.sop',loaded:sceneDefaults.projectionLoaded,
   catalogModules:parse(sceneDefaults.projection).filter(wire=>wire.type==='std.knowledge.profile').flatMap(wire=>wire.attrs.module.map(str))}});
 link('execution:scene-default-policy','execution:scene-default-schema','imports schema');
 link('execution:scene-default-policy','execution:scene-default-projection','uses selected catalog regions');
 link('execution:capability-policy','execution:scene-default-policy','uses scoped missing-coordinate seeds');
 const placement=inspectSpatialPlacementWorld();
 if(placement){
  const ids={policy:'execution:placement-policy',geometry:'execution:placement-geometry',schema:'execution:placement-geometry-schema'};
  const details={loaded:placement.loaded,knowledgePin:placement.knowledgePin,libraryPin:placement.libraryPin};
  nodes.push({id:ids.policy,label:'Placement objective',kind:'knowledge',implementation:'Operational SOP Lang World',description:'The method and declared costs read when compiling placement from live geometry.',wires:placement.policy,details:{...details,source:'worlds/app.project/spatial-placement.sop'}});
  nodes.push({id:ids.geometry,label:'Spatial policies',kind:'knowledge',implementation:'Catalog SOP Lang facts',description:'The compiled route reads these pinned geometric applicability and scoring policies.',wires:placement.knowledge,details});
  nodes.push({id:ids.schema,label:'k.spatial2d',kind:'schema',implementation:'Catalog SOP Lang schema and rules',description:'Shared relation, geometry and measurement declarations used by both editor routes.',wires:placement.schema,schemaView:inspectSchemaSource(placement.schema),details});
  link('execution:module:declared-execution',ids.policy,'compiles relation placement');
  link(ids.policy,ids.geometry,'uses spatial policies');
  link(ids.geometry,ids.schema,'imports schema and rules');
 }
 const composition=inspectRequestCompositionPolicy(),compositionWires=composition.facts;
 nodes.push({id:'execution:composition-policy',label:'Request composition',kind:'knowledge',implementation:'Operational SOP Lang World',description:'Schedules independent request cuts in source order and chooses what follows an unresolved result.',wires:compositionWires,details:{loaded:composition.loaded,source:'worlds/app.project/request-composition-policy.sop',dependencies:composition.dependencies}});
 link('execution:composition-policy','execution:module:declared-execution','governs independent request scheduling');
 for(const [owner,schema]of [['execution:policy',policy.schema],['execution:composition-policy',composition.schema]]){
  const id=owner+':schema';nodes.push({id,label:schema.module,kind:'schema',implementation:'SOP Lang schema module',description:'Structural declarations imported by the linked policy. These definitions are not policy facts or editor state.',wires:schema.wires,schemaView:inspectSchemaSource(schema.wires),details:{source:schema.source,module:schema.module,loaded:schema.loaded}});link(owner,id,'imports schema');
 }

 nodes.push({id:'execution:source-snapshot',label:'Execution knowledge',kind:'knowledge',implementation:'SOP Lang snapshot bundled in JavaScript',description:'Declared value-lookup composition used by declared execution. Its knowledge facts and schema-module dependencies have separate source ownership. Inspection does not initialize the lazy World cache.',wires:snapshotText(SOURCE.snapshot),details:{loaded:false,status:'available initialization snapshot',knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin,activeKnowledgePin:CATALOG_PIN.commit,knowledgePinMatchesActive:SOURCE.knowledgePin===CATALOG_PIN.commit,activeLibraryVersion:version,activeLibraryBuild:build,sources:clone(SOURCE.sources),snapshot:clone(SOURCE.snapshot)}});
 for(const [name,text]of Object.entries(SOURCE.schemaModules)){
  const id='execution:source-schema:'+name;nodes.push({id,label:name,kind:'schema',implementation:'SOP Lang schema module',description:'Exact separately held schema module required to replay the execution knowledge context.',wires:text,schemaView:inspectSchemaSource(text),details:{module:name,knowledgePin:SOURCE.knowledgePin,source:SOURCE.sources.find(source=>source.owner===name&&source.role==='schema')?.path}});link('execution:source-snapshot',id,'imports schema');
 }
 const libraryModules=new Map();
 for(const [key,module,cache]of sources){
  const component='execution:module:'+key;
  nodes.push({id:component,label:key==='new-engine'?'Property executor':'Action executor',kind:'component',implementation:'JavaScript',description:'Executes declared requests against native tool hosts. Its reusable source World and cache status are implementation details below, rather than extra architecture nodes.',help:{purpose:'Bind a validated request to declared native tools and retain evidence of the actual effect.',inputs:['Validated request graph','Current host observation','Execution knowledge'],outputs:['Tool invocation or a specific unresolved capability','Effect evidence and undo journal'],limits:['This component contains native JavaScript execution logic. A parsed request alone does not establish an executable binding.']},details:{module,sourceWorld:{cached:cache.loaded,cachePolicy:'lazy process-local World',loaded:cache.loaded,knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin,...(cache.loaded?{wires:cache.wires,schemaWires:cache.schemaWires,matrixSize:cache.matrixSize,factCount:cache.factCount,modules:cache.modules,snapshot:cache.snapshot}:{})}}});link(component,'execution:source-snapshot','uses execution knowledge');
  for(const [name,text]of Object.entries(cache.libraryModules??{}))libraryModules.set(name,text);
 }
 nodes.push({id:'execution:journal',label:'Retained execution journal',kind:'runtime',implementation:'JavaScript collection of SOP World snapshots',description:'Actual session.newEngineJournal entries. Each evidence snapshot below is a retained SOP World, not a fabricated reasoning replay.',details:{count:journal.length,records:clone(journal)}});
 for(const [index,record]of journal.entries()){
  const id='execution:episode:'+index+':'+String(record.invocation),snapshot=record.evidence,imports=importsOf(snapshot);
  nodes.push({id,label:'Evidence '+String(record.invocation),kind:'episode',implementation:'Retained SOP Lang World snapshot',description:'Exact evidence.toJSON retained by the executed operation. The wire text lists its real restoration log entries; JSON retains the full snapshot.',wires:snapshotText(snapshot),details:{...clone(record),imports,loaded:false,status:'retained serialized World'}});link('execution:journal',id,'retains evidence World');link(id,'execution:module:declared-execution','retained by');
  for(const name of imports)link(id,'library:'+name,'imports');
 }
 for(const name of moduleNames){const text=libraryModules.get(name);nodes.push({id:'library:'+name,label:name,kind:'schema',implementation:'SOP Lang standard module',description:text?'Exact standard module source available through the actual loaded execution World library.':'Referenced by retained evidence; its source is not held by an initialized execution cache.',...(text?{wires:text}:{}),details:{module:name,available:text!==undefined,libraryVersion:version,libraryBuild:build}});}
 return {nodes,edges};
}
