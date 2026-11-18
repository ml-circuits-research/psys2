import{readFile}from'node:fs/promises';
import test from'node:test';import assert from'node:assert/strict';
import{inspectExecutionWorlds}from'../src/dialog/execution-world-inspection.mjs';
import{executeRequestCandidate}from'../src/dialog/new-engine.mjs';
import{inspectDeclaredExecutionSourceWorld,declaredPropertyValues}from'../src/dialog/declared-execution.mjs';
import{serialize,World,parse,SCHEMA_TYPES}from'../src/vendor/sopworld/sopworld.mjs';
import SOURCE from'../src/dialog/new-engine-source.mjs';
import{CATALOG_PIN}from'../src/knowledge/catalog-pin.mjs';
import{makeObject}from'../worlds/art.draw/board.mjs';
import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
const lookup=(graph,id)=>graph.nodes.find(node=>node.id===id);
test('inspection shows exact available pinned snapshot without initializing the lazy source World',async()=>{
 assert.equal(inspectDeclaredExecutionSourceWorld().loaded,false);
 const graph=await inspectExecutionWorlds({newEngineJournal:[]}),snapshot=lookup(graph,'execution:source-snapshot');
 assert.equal(inspectDeclaredExecutionSourceWorld().loaded,false);
 assert.deepEqual(snapshot.details.snapshot,SOURCE.snapshot);assert.equal(snapshot.details.knowledgePin,SOURCE.knowledgePin);assert.equal(snapshot.details.activeKnowledgePin,CATALOG_PIN.commit);assert.equal(snapshot.details.knowledgePinMatchesActive,SOURCE.knowledgePin===CATALOG_PIN.commit);
 assert.ok(snapshot.wires.includes(serialize([SOURCE.snapshot.log[0].wires[0]])));assert.equal(lookup(graph,'execution:module:declared-execution').details.sourceWorld.loaded,false);
 snapshot.details.sources[0].path='changed only in inspector output';assert.notEqual(SOURCE.sources[0].path,'changed only in inspector output');
 assert.ok(!graph.nodes.some(node=>node.id.startsWith('execution:cache:')));
 const constructors=lookup(graph,'execution:constructor-policy');
 assert.equal(constructors.details.source,'worlds/app.project/constructor-policy.sop');
 assert.equal(constructors.wires,await readFile(new URL('../'+constructors.details.source,import.meta.url),'utf8'));
 assert.equal(constructors.details.loaded,false);
 const constructorSchema=lookup(graph,'execution:constructor-schema');
 assert.equal(constructorSchema.details.source,'worlds/app.project/constructor-schema.sop');
 assert.equal(constructorSchema.wires,await readFile(new URL('../'+constructorSchema.details.source,import.meta.url),'utf8'));
 assert.ok(parse(constructorSchema.wires).every(wire=>SCHEMA_TYPES.has(wire.type)));
 assert.ok(graph.edges.some(edge=>edge.from===constructors.id&&edge.to===constructorSchema.id));
 assert.ok(graph.edges.some(edge=>edge.from==='execution:creation-policy'&&edge.to===constructors.id));
 for(const owner of ['execution:policy','execution:composition-policy']){
  const facts=lookup(graph,owner),schema=lookup(graph,owner+':schema');
  assert.equal(parse(facts.wires).some(wire=>SCHEMA_TYPES.has(wire.type)&&wire.type!=='core.rule'),false,'policy rules and facts have separate schema definitions');
  assert.ok(parse(schema.wires).some(wire=>wire.type==='core.type'));
  assert.ok(graph.edges.some(edge=>edge.from===owner&&edge.to===schema.id&&edge.label==='imports schema'));
 }
 assert.ok(Object.keys(SOURCE.schemaModules).length>0);
 assert.equal(SOURCE.snapshot.log.flatMap(entry=>entry.wires??[]).some(wire=>SCHEMA_TYPES.has(wire.type)&&wire.type!=='core.use'),false,'context replay references schema modules rather than copying definitions');
 for(const [name,text]of Object.entries(SOURCE.schemaModules))assert.equal(lookup(graph,'execution:source-schema:'+name).wires,text);
 const ids=new Set(graph.nodes.map(node=>node.id));for(const edge of graph.edges){assert.ok(ids.has(edge.from));assert.ok(ids.has(edge.to));}
});
test('actual declared property lookup initializes only its owning cache and inspection returns detached exact state',async()=>{
 assert.ok(declaredPropertyValues('colour').includes('purple'));
 const before=inspectDeclaredExecutionSourceWorld(),graph=await inspectExecutionWorlds({newEngineJournal:[]}),cache=lookup(graph,'execution:module:declared-execution').details.sourceWorld;
 assert.equal(before.loaded,true);assert.equal(cache.loaded,true);assert.equal(cache.wires,before.wires);assert.deepEqual(cache.snapshot,before.snapshot);assert.ok(cache.factCount>0);
 assert.equal(parse(cache.wires).some(wire=>SCHEMA_TYPES.has(wire.type)),false);
 assert.ok(parse(cache.schemaWires).some(wire=>wire.type==='core.type'));
 before.snapshot.log[0].wires[0].id='inspection-mutation';assert.notEqual(inspectDeclaredExecutionSourceWorld().snapshot.log[0].wires[0].id,'inspection-mutation');
});
test('actual executed journal evidence becomes an inspectable SOP World with real standard module sources',async()=>{
 const text='Change the colour of the circle to purple.',state=initialDrawingState();state.objects=[{...makeObject(state,'circle'),color:'red'}];
 const session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':state}},newEngineJournal:[]};
 const candidate={request:'r',wires:'@source std.request.source text='+JSON.stringify(text)+'\n@r std.request act=change mood=do source=$source root=$condition\n@target std.request.target request=$r mode=existing kind=circle\n@condition std.request.constraint request=$r target=$target concept=colour operator=eq value=purple character=requirement polarity=positive'};
 const result=await executeRequestCandidate(session,candidate,text,{view:'draw',language:'en',invocation:'actual-inspection-operation'});assert.equal(result.trace.assessment,'changed');
 const before=structuredClone(session),graph=await inspectExecutionWorlds(session),episode=graph.nodes.find(node=>node.kind==='episode');
 assert.deepEqual(session,before);assert.deepEqual(episode.details.evidence,session.newEngineJournal[0].evidence);assert.match(episode.wires,/@effect.claim std.reply.property/);assert.match(episode.wires,/core.use world=std.request/);assert.equal(episode.details.loaded,false);
 for(const name of ['std.request','std.trace','std.reply']){const module=lookup(graph,'library:'+name);assert.equal(module.details.available,true);assert.match(module.wires,/core.module/);assert.ok(graph.edges.some(edge=>edge.from===episode.id&&edge.to===module.id&&edge.label==='imports'));}
 const evidence=World.fromJSON(episode.details.evidence);assert.equal(evidence.get('effect.claim').attrs.status[0],'changed');assert.equal(lookup(graph,'execution:module:declared-execution').details.sourceWorld.loaded,true);
});
