// Read-only inspection of execution worlds already owned by the application.
import{serialize,str,version,build}from'../vendor/sopworld/sopworld.mjs?v=20fdd56a67';
import SOURCE from'./new-engine-source.mjs?v=e31b4adb7f';
import{CATALOG_PIN}from'../knowledge/catalog-pin.mjs?v=dc47595de0';
const clone=value=>structuredClone(value);
const loggedWires=snapshot=>(snapshot?.log??[]).flatMap(entry=>entry.wires??[]);
const importsOf=snapshot=>[...new Set(loggedWires(snapshot).filter(wire=>wire.type==='core.use').flatMap(wire=>(wire.attrs.world??[]).map(str)))];
/** Called by cache-owning modules; never invokes their lazy source constructor. */
export function inspectCachedExecutionSource(world,{moduleNames=[]}={}){
 if(!world)return {loaded:false};
 return {loaded:true,snapshot:clone(world.toJSON()),wires:serialize([...world.matrix.values(),...world.wires.values()]),matrixSize:world.matrix.size,factCount:world.wires.size,modules:clone(world.modules()),libraryModules:Object.fromEntries(moduleNames.filter(name=>typeof world.options.library[name]==='string').map(name=>[name,world.options.library[name]]))};
}
function snapshotText(snapshot){return (snapshot?.log??[]).map((entry,index)=>'# Log entry '+index+' / '+entry.op+'\n'+serialize(entry.wires??[])).join('\n\n');}
/** Projects actual cache accessors and retained journal JSON; performs no reading or reasoning. */
export async function inspectExecutionWorlds(session){
 const [{inspectNewEngineSourceWorld},{inspectDeclaredExecutionSourceWorld}]=await Promise.all([import('./new-engine.mjs?v=dacb925ff3'),import('./declared-execution.mjs?v=dacb925ff3')]);
 const journal=session?.newEngineJournal??[],moduleNames=[...new Set(journal.flatMap(record=>importsOf(record.evidence)))],sources=[['new-engine','src/dialog/new-engine.mjs',inspectNewEngineSourceWorld({moduleNames})],['declared-execution','src/dialog/declared-execution.mjs',inspectDeclaredExecutionSourceWorld({moduleNames})]],nodes=[],edges=[];
 const link=(from,to,label)=>edges.push({from,to,label});
 nodes.push({id:'execution:source-snapshot',label:'Static execution knowledge snapshot',kind:'knowledge',implementation:'SOP Lang snapshot bundled in JavaScript',description:'Exact available initialization snapshot imported by both execution modules. Inspection does not initialize either lazy World cache. Its pinned knowledge differs from the active catalog when indicated below.',wires:snapshotText(SOURCE.snapshot),details:{loaded:false,status:'available initialization snapshot',knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin,activeKnowledgePin:CATALOG_PIN.commit,knowledgePinMatchesActive:SOURCE.knowledgePin===CATALOG_PIN.commit,activeLibraryVersion:version,activeLibraryBuild:build,sources:clone(SOURCE.sources),snapshot:clone(SOURCE.snapshot)}});
 const libraryModules=new Map();
 for(const [key,module,cache]of sources){
  const component='execution:module:'+key,id='execution:cache:'+key;
  nodes.push({id:component,label:key+' module',kind:'component',implementation:'JavaScript',description:'Actual imported execution module. The lazy source World below is separate from editor instance worlds.',details:{module}});link(component,'execution:source-snapshot','imports initialization snapshot');
  nodes.push({id,label:key+' source World',kind:'knowledge',implementation:'SOP Lang World cached by JavaScript',description:cache.loaded?'Actual already-initialized execution knowledge World. Its schema matrix, fact wires and restoration log are inspectable.':'Lazy source cache has not been initialized. Inspecting it does not initialize it.',...(cache.loaded?{wires:cache.wires}:{}),details:{loaded:cache.loaded,owner:module,knowledgePin:SOURCE.knowledgePin,libraryPin:SOURCE.libraryPin,...(cache.loaded?{matrixSize:cache.matrixSize,factCount:cache.factCount,modules:cache.modules,snapshot:cache.snapshot}:{})}});
  link(component,id,'owns lazy source cache');link(id,'execution:source-snapshot',cache.loaded?'initialized from':'will initialize from');
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
