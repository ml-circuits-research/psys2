// Read-only inspection of execution worlds already owned by the application.
import{serialize,str,version,build}from'../vendor/sopworld/sopworld.mjs?v=df8c26a4de';
import SOURCE from'./new-engine-source.mjs?v=94658c42d6';
import{CATALOG_PIN}from'../knowledge/catalog-pin.mjs?v=d1ff29de82';
import{inspectExecutionPolicyWorld}from'./execution-policy.mjs?v=df2bd66b62';
import{inspectSchemaSource}from'./worlds-inspection.mjs?v=94ead0703f';
import{inspectRequestCompositionPolicy}from'./request-composition-policy.mjs?v=24e6325486';
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
 const [{inspectNewEngineSourceWorld},{inspectDeclaredExecutionSourceWorld},{inspectSpatialPlacementWorld}]=await Promise.all([
  import('./new-engine.mjs?v=c1b4a1fb44'),import('./declared-execution.mjs?v=c1b4a1fb44'),import('./spatial-placement-execution.mjs?v=ee2e9a4822'),
 ]);
 const journal=session?.newEngineJournal??[],moduleNames=[...new Set(journal.flatMap(record=>importsOf(record.evidence)))],sources=[['new-engine','src/dialog/new-engine.mjs',inspectNewEngineSourceWorld({moduleNames})],['declared-execution','src/dialog/declared-execution.mjs',inspectDeclaredExecutionSourceWorld({moduleNames})]],nodes=[],edges=[];
 const link=(from,to,label)=>edges.push({from,to,label});
 const policy=inspectExecutionPolicyWorld();
 nodes.push({id:'execution:policy',label:'Execution policy',kind:'knowledge',implementation:'Operational SOP Lang World + declared host clock',description:'Actual policy queried by execution for omitted arguments and knowledge-property joins. The source is available before initialization; loaded status records the real lazy World. This moves these decisions out of native operation maps, but does not migrate editor state or all native tool semantics.',wires:policy.facts,details:{source:policy.source,loaded:policy.loaded,functions:policy.functions,dependencies:policy.dependencies},help:{purpose:'Declare defaults and knowledge value joins used by concrete request execution.',inputs:['Operation and explicit arguments','Referenced knowledge properties','Clock primitive for a missing current time'],outputs:['Only omitted argument defaults','Assumption notices','Typed knowledge-property lookup descriptors'],limits:['These are explicit defaults, not proof of broader reasoning. Editor native implementations remain visible.']}});
 link('execution:module:declared-execution','execution:policy','queries defaults and value joins');
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
 nodes.push({id:'execution:composition-policy',label:'Request composition',kind:'knowledge',implementation:'Operational SOP Lang World',description:'Actual source-order scheduling and undo policy for independently validated request cuts. This declaration does not infer target membership or causal dependencies from repeated nouns.',wires:compositionWires,details:{loaded:composition.loaded,source:'worlds/app.project/request-composition-policy.sop',dependencies:composition.dependencies}});
 link('execution:composition-policy','execution:module:declared-execution','governs independent request scheduling');
 for(const [owner,schema]of [['execution:policy',policy.schema],['execution:composition-policy',composition.schema]]){
  const id=owner+':schema';nodes.push({id,label:schema.module,kind:'schema',implementation:'SOP Lang schema module',description:'Structural declarations imported by the linked policy. These definitions are not policy facts or editor state.',wires:schema.wires,schemaView:inspectSchemaSource(schema.wires),details:{source:schema.source,module:schema.module,loaded:schema.loaded}});link(owner,id,'imports schema');
 }

 nodes.push({id:'execution:source-snapshot',label:'Execution knowledge',kind:'knowledge',implementation:'SOP Lang snapshot bundled in JavaScript',description:'Declared value-lookup composition used by both execution modules. Its knowledge facts and schema-module dependencies have separate source ownership. Inspection does not initialize either lazy World cache.',wires:snapshotText(SOURCE.snapshot),details:{loaded:false,status:'available initialization snapshot',knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin,activeKnowledgePin:CATALOG_PIN.commit,knowledgePinMatchesActive:SOURCE.knowledgePin===CATALOG_PIN.commit,activeLibraryVersion:version,activeLibraryBuild:build,sources:clone(SOURCE.sources),snapshot:clone(SOURCE.snapshot)}});
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
  nodes.push({id,label:'Evidence '+String(record.invocation),kind:'episode',implementation:'Retained SOP Lang World snapshot',description:'Exact evidence.toJSON retained by the executed operation. The wire text lists its real restoration log entries; JSON retains the full snapshot.',wires:snapshotText(snapshot),details:{...clone(record),imports,loaded:false,status:'retained serialized World'}});link('execution:journal',id,'retains evidence World');link(id,'execution:module:new-engine','retained by');
  for(const name of imports)link(id,'library:'+name,'imports');
 }
 for(const name of moduleNames){const text=libraryModules.get(name);nodes.push({id:'library:'+name,label:name,kind:'schema',implementation:'SOP Lang standard module',description:text?'Exact standard module source available through the actual loaded execution World library.':'Referenced by retained evidence; its source is not held by an initialized execution cache.',...(text?{wires:text}:{}),details:{module:name,available:text!==undefined,libraryVersion:version,libraryBuild:build}});}
 return {nodes,edges};
}
