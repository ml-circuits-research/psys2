// Read-only architecture projection of the runtime registry. No inferred execution links.
export function inspectWorldsRuntime({index={},bundle={worlds:{}},loaded=[],instances=[],hosts=[],knowledgeFiles=[],reader={},nativeStates={},instanceCaches=[],sessionMeta=null,libraryInfo=null}={}){
 const nodes=[],edges=[],loadedSet=new Set(loaded),hostByWorld=new Map(hosts.map(h=>[h.world,h]));
 const link=(from,to,label)=>edges.push({from,to,label});
 nodes.push({id:'runtime:registry',label:'Application registry',kind:'runtime',implementation:'JavaScript',description:'Actual routing index and loaded bundle registry. This is not a SOP central project world.',details:{index,loaded}});
 for(const [id,info]of Object.entries(index.worlds??{})){
  const held=bundle.worlds?.[id],files=held?.files??{},host=hostByWorld.get(id);
  nodes.push({id:'world:'+id,label:id,kind:'world',implementation:'SOP Lang',description:info.summary||info.title||'',details:{...info,loaded:loadedSet.has(id),files:Object.keys(files)},wires:Object.entries(files).map(([path,text])=>'# '+path+'\n'+text).join('\n\n')});
  link('runtime:registry','world:'+id,loadedSet.has(id)?'loaded world':'available world');
  for(const target of info.imports??[])link('world:'+id,'world:'+target,'imports');
  for(const target of info.reads??[])link('world:'+id,'world:'+target,'declares reads');
  for(const target of info.compose??[])link('world:'+id,'world:'+target,'declares composition');
  for(const [path,text]of Object.entries(files))if(/(?:schema|legend).*\.sop$/.test(path)){
   const key='schema:'+id+':'+path;
   nodes.push({id:key,label:id+' / '+path,kind:'schema',implementation:'SOP Lang',description:'Exact schema/legend file held by the world loader.',wires:text,details:{world:id,path,loaded:loadedSet.has(id)}});link('world:'+id,key,'contains declaration file');
  }
  if(host){
   nodes.push({id:'interpreter:'+id,label:host.view+' interpreter',kind:'interpreter',implementation:'JavaScript',description:'Native declared host: bindings and observation from the actual host. Semantic behavior is still implemented in JavaScript here.',tools:host.operations,details:{world:id,capabilities:host.capabilities,observation:host.observation,source:'worlds/'+id+'/declared-host.mjs'}});
   link('interpreter:'+id,'world:'+id,'native adapter for');
  }
 }
 for(const [world,state]of Object.entries(nativeStates)){
  const nativeId='native:'+world;
  nodes.push({id:nativeId,label:world+' native state',kind:'runtime',implementation:'JavaScript',description:'Actual operational editor state. Every top-level structure is exposed below, including undo/redo when present.',details:state});link('runtime:registry',nativeId,'session state');
  for(const [key,value]of Object.entries(state??{})){const id='structure:'+world+':'+key;nodes.push({id,label:world+' / '+key,kind:'structure',implementation:'JavaScript',description:'Exact native state property, not an independent SOP world.',details:{key,value}});link(nativeId,id,'owns property');}
 }
 for(const cache of instanceCaches){nodes.push({id:'cache:'+cache.world,label:cache.world+' SOP cache',kind:'runtime',implementation:'SOP Lang in JavaScript World',description:'Actual session.instanceWorlds cache. This is loaded from the persistence snapshot; it is not yet the editor operational authority.',wires:cache.wires,details:{world:cache.world,wireCount:cache.wireCount}});link('cache:'+cache.world,'instance:'+cache.world,'loaded from snapshot');}
 for(const record of instances){
  nodes.push({id:'instance:'+record.world,label:record.world+' instance',kind:'instance',implementation:'SOP snapshot + native JavaScript state',description:'Exact current SOP serialization. Stored browser records are inspected separately. Native editor state remains the operational authority; this archive includes undo and renderer data.',wires:record.wires,details:{instanceId:record.instanceId,revision:record.revision,world:record.world}});
  link('instance:'+record.world,'world:'+record.world,'instance of');
  link('native:'+record.world,'instance:'+record.world,'serialized snapshot from');

  if(hostByWorld.has(record.world))link('interpreter:'+record.world,'instance:'+record.world,'observes / changes');
 }
 if(sessionMeta){
  nodes.push({id:'runtime:session-memory',label:'Session memory and journals',kind:'runtime',implementation:'JavaScript',description:'Actual serializable session metadata, conversational references and global undo/redo journals.',details:sessionMeta});link('component:reasoner','runtime:session-memory','owns session metadata');
  for(const [key,value]of Object.entries(sessionMeta.memory??{})){const id='session-memory:'+key;nodes.push({id,label:'Session / '+key,kind:'structure',implementation:'JavaScript',description:'Actual session memory entry, including global action journals when present.',details:{key,value}});link('runtime:session-memory',id,'owns memory entry');}
 }
 nodes.push({id:'knowledge:catalog',label:'Knowledge catalog',kind:'knowledge',implementation:'SOP Lang + JavaScript loader',description:'Shared catalog loaded by reference. The children show files actually read in this worker; no knowledge is copied into an instance by this inspector.',details:{filesRead:knowledgeFiles.length}});
 const knowledgeByPath=new Map(knowledgeFiles.map(file=>[file.path,file])),catalogText=knowledgeByPath.get('index.json')?.text;let catalogWorlds=[];
 try{const catalog=JSON.parse(catalogText??'null');if(Array.isArray(catalog?.worlds))catalogWorlds=catalog.worlds;}catch{/* The exact invalid source remains visible as a file. */}
 const catalogIds=new Set(catalogWorlds.map(world=>world.id));
 for(const world of catalogWorlds){
  const id='knowledge-world:'+world.id,paths=[world.schema,...(world.shards??[]).map(shard=>shard.path)].filter(Boolean),loadedFiles=paths.filter(path=>knowledgeByPath.has(path));
  nodes.push({id,label:world.id,kind:'knowledge',implementation:'SOP Lang',description:'Actual catalog world declaration. Files are loaded by reference, not copied into instances.',details:{...world,loadedFiles}});link('knowledge:catalog',id,'catalog world');
  for(const target of world.depends??[])if(catalogIds.has(target))link(id,'knowledge-world:'+target,'declares dependency');
  for(const path of loadedFiles)link(id,'knowledge-file:'+path,path===world.schema?'loaded schema':'loaded shard');
  if(world.schema&&!knowledgeByPath.has(world.schema)){const schemaId='knowledge-file:'+world.schema;nodes.push({id:schemaId,label:world.schema,kind:'schema',implementation:'SOP Lang',description:'Schema declared by the catalog; its text has not been read by this worker.',details:{path:world.schema,loaded:false}});link(id,schemaId,'declares schema');}
 }
 for(const file of knowledgeFiles){const id='knowledge-file:'+file.path;nodes.push({id,label:file.path,kind:catalogWorlds.some(world=>world.schema===file.path)?'schema':'knowledge',implementation:/\.sop$/.test(file.path)?'SOP Lang':'Catalog data',description:'Exact file text returned by the active knowledge source.',wires:file.text,details:{path:file.path,loaded:true}});link('knowledge:catalog',id,'loaded file');} 
 if(libraryInfo){nodes.push({id:'component:library',label:'SOPWorlds library',kind:'component',implementation:'JavaScript + built-in SOP schemas',description:'Actual imported library version, schema type identities and exported pipeline declarations. These are implementation mechanisms, not independent instance worlds.',details:libraryInfo});link('component:reasoner','component:library','imports mechanisms');link('component:formalizer','component:library','imports schema / binding mechanisms');}
 nodes.push({id:'component:reader',label:'SOP-BERT reader',kind:'component',implementation:'Trained model + JavaScript',description:'Actual browser reader provider. This node does not imply that model internals are SOP reasoning.',details:reader});
 nodes.push({id:'component:formalizer',label:'Request formalizer',kind:'component',implementation:'JavaScript + SOP declarations',description:'Request proposal and binding pipeline. Stage events report actual runtime guard stages, not invented world activations.'});
 nodes.push({id:'component:reasoner',label:'Session / executor',kind:'component',implementation:'JavaScript + SOP mechanisms',description:'Actual session.send execution boundary. Native UI controls invoke their declared host directly.'});
 nodes.push({id:'runtime:activity-bus',label:'Runtime activity bus',kind:'component',implementation:'JavaScript worker event channel',description:'Actual world-activity events on the engine worker channel. Emits observed loading, reader, session and native invocation boundaries; it does not infer internal reasoning.',details:{workerEvent:'world-activity',retainedWorkerEvents:200,browserReplayWindow:300}});
 for(const node of nodes.filter(node=>node.kind==='interpreter'||['component:reader','component:reasoner','knowledge:catalog'].includes(node.id)))link(node.id,'runtime:activity-bus','publishes observed activity');
 link('component:reasoner','component:reader','requestReader provider');
 return {nodes,edges,limitations:['This graph projects actual loader metadata, native bindings and snapshots; the graph is not yet an authoritative SOP project world.','A loaded/imported world is not proof it participated in a particular decision. Only observed runtime events animate nodes.']};
}
