import test from'node:test';import assert from'node:assert/strict';
import{inspectWorldsRuntime}from'../src/dialog/worlds-inspection.mjs';
test('architecture inspector exposes exact held files, actual state structures and labeled declarations without claiming reasoning',()=>{
 const state={objects:[{id:'a',x:5}],history:[{objects:[]}],future:[],selected:'a'},schema='@t core.type name=novel.item',archive='@a novel.item x=5';
 const result=inspectWorldsRuntime({index:{worlds:{novel:{imports:['shared'],reads:[],compose:[]},shared:{imports:[]}}},bundle:{worlds:{novel:{files:{'legend.sop':schema,'world.sop':'@w core.world'}}}},loaded:['novel'],nativeStates:{novel:state},instances:[{world:'novel',instanceId:'actual',revision:2,wires:archive}],instanceCaches:[{world:'novel',wireCount:1,wires:archive}],hosts:[{world:'novel',view:'editor',operations:[{id:'novel.add'}],observation:{objects:state.objects}}],knowledgeFiles:[{path:'shards/a.sop',text:'@k k.item n=2'}],reader:{state:'ready',cache:{hits:7,networkBytes:0}},sessionMeta:{memory:{newEngineUndo:[{operation:'actual'}]}}});
 const byId=new Map(result.nodes.map(n=>[n.id,n]));
 assert.ok(!result.nodes.some(n=>n.id.startsWith('cache:')));assert.equal(byId.get('component:reader').details.cache.hits,7);assert.match(byId.get('component:reader').help.purpose,/candidate request graphs/);assert.equal(byId.get('instance:novel').role,'Observed World instance');
 const readerPolicy=byId.get('knowledge:reader-admission-policy');
 assert.equal(readerPolicy.details.source,'worlds/app.project/reader-admission-policy.sop');
 assert.doesNotMatch(readerPolicy.wires,/ core\.(type|slot) /);
 assert.match(byId.get('schema:reader-admission').wires,/@reader\.evidence\.type core\.type/);
 assert.ok(result.edges.some(e=>e.from===readerPolicy.id&&e.to==='schema:reader-admission'));
 assert.match(readerPolicy.wires,/@reader.permit.calibrated core.rule/);
 assert.ok(result.edges.some(e=>e.from==='component:request-admission'&&e.to===readerPolicy.id));
 const context=byId.get('knowledge:reader-context'),contextSchema=byId.get('schema:reader-context');
 assert.match(context.wires,/@context.rank.mention std.decide.criterion/);
 assert.match(contextSchema.wires,/core.type of=app.readerContext.display/);
 assert.ok(result.edges.some(e=>e.from===context.id&&e.to===contextSchema.id));
 assert.ok(!byId.has('component:formalizer'));assert.equal(byId.get('component:request-admission').details.entryPoint,'assessReaderProposal');
 assert.equal(byId.get('schema:novel:legend.sop').wires,schema);assert.equal(byId.get('instance:novel').wires,archive);assert.equal(byId.get('instance:novel').details.cachedWorld.wires,archive);
 assert.equal(byId.get('native:novel').details,state);assert.ok(!byId.has('structure:novel:history'));assert.deepEqual(byId.get('native:novel').details.history,state.history);
 assert.equal(byId.get('world:shared').details.loaded,false);assert.equal(byId.get('world:shared').wires,undefined);assert.equal(byId.get('world:shared').sopAvailable,false);
 assert.equal(byId.get('interpreter:novel').implementation,'JavaScript');assert.equal(byId.get('knowledge-file:shards/a.sop').wires,'@k k.item n=2');
 assert.ok(result.edges.some(e=>e.from==='world:novel'&&e.to==='world:shared'&&e.label==='imports'));
 assert.ok(!result.edges.some(e=>e.label==='reasoned with'));assert.ok(result.limitations.length);
 assert.ok(!byId.has('session-memory:newEngineUndo'));assert.deepEqual(byId.get('runtime:session-memory').details.memory.newEngineUndo,[{operation:'actual'}]);
 const ids=new Set(result.nodes.map(n=>n.id));for(const edge of result.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);}
});
import{performGesture}from'./fixtures/editor-gesture.mjs';
import{emptyDrawingState as initialDrawingState}from'../worlds/art.draw/sop-drawing.mjs';
test('native execution emits actual host invocation boundaries and observer exceptions cannot alter effects',async()=>{
 const events=[],session={isession:{state:{'art.draw':initialDrawingState()}},engine:{onWorldActivity:event=>events.push(event)}};
 const result=await performGesture(session,{view:'draw',operation:'drawing.ids.show',args:{mode:'always'}});
 assert.equal(result.ok,true);assert.deepEqual(events.map(e=>e.phase),['start','end']);assert.equal(events[0].invocation,events[1].invocation);assert.equal(events[0].args.mode,'always');assert.equal(events[0].args.duration,4000);assert.ok(events[1].durationMs>=0);assert.equal(events[1].result.status,'changed');assert.equal(events[1].status,'changed');assert.equal(events[0].operation,'drawing.ids.show');assert.ok(events[0].nodeIds.includes('interpreter:art.draw'));
 session.engine.onWorldActivity=()=>{throw Error('broken observer');};
 assert.equal((await performGesture(session,{view:'draw',operation:'drawing.ids.show',args:{mode:'off'}})).ok,true);assert.equal(session.isession.state['art.draw'].runtime.view.ids,'off');
});

import{inspectSchemaSource}from'../src/dialog/worlds-inspection.mjs';
test('declared schema worlds expose native interfaces, state completeness and exact governing sources without inventing language bindings',()=>{
 const native='@module core.module name=app.native.interface\n@type core.type of=app.native.operation\n@slot core.slot of=app.native.operation key=id kind=string present=true\n@operation app.native.operation id="novel.move" act="place" on="novel.item"\n@parameter app.native.parameter name="x" type="number" operation=$operation\n';
 const stateSchema='@item core.type of=novel.item closed=true\n@x core.slot of=novel.item key=x kind=number present=true\n';
 const files=[{file:'native-interface.sop',role:'native-tool-interface',completeStateSchema:false},{file:'state-definition.sop',role:'canonical-state-schema',completeStateSchema:true},{file:'unread.sop',role:'additional-declarations',completeStateSchema:false}];
 const graph=inspectWorldsRuntime({index:{worlds:{novel:{schemaWorld:'pattern.novel',schemaFiles:files}}},bundle:{worlds:{novel:{files:{'native-interface.sop':native,'state-definition.sop':stateSchema}}}},loaded:['novel'],instances:[{world:'novel',instanceId:'actual',revision:1,authoritative:true,wires:'@o novel.item x=5',schema:stateSchema}],nativeStates:{novel:{sop:'@o novel.item x=5'}}});
 const byId=new Map(graph.nodes.map(node=>[node.id,node])),toolInterface=byId.get('schema:novel:native-interface.sop'),pattern=byId.get('schema-world:pattern.novel');
 assert.equal(toolInterface.wires,native);assert.equal(toolInterface.details.role,'native-tool-interface');assert.equal(toolInterface.details.completeStateSchema,false);
 assert.equal(toolInterface.schemaView.types.length,1);assert.equal(toolInterface.schemaView.slots.length,1);assert.equal(toolInterface.schemaView.tools.length,1);assert.equal(toolInterface.schemaView.parameters.length,1);assert.equal(toolInterface.schemaView.language.length,0);assert.match(toolInterface.schemaView.languageStatus,/do not establish a text-to-intent binding/);
 assert.equal(toolInterface.schemaView.tools[0].attributes.id[0],'"novel.move"');assert.match(toolInterface.schemaView.tools[0].wire,/app.native.operation/);
 assert.equal(pattern.details.schemaWorld,'pattern.novel');assert.equal(pattern.details.completeStateSchema,true);assert.equal(pattern.status,'declared sources partly loaded');assert.ok(pattern.wires.includes(native)&&pattern.wires.includes(stateSchema));
 assert.equal(byId.get('schema:novel:unread.sop').wires,undefined);assert.equal(byId.get('schema:novel:unread.sop').schemaView.status,'source not loaded');
 assert.equal(byId.get('instance:novel').role,'Operational World instance');assert.equal(byId.get('instance:novel').details.nativeCarrier.sop,'@o novel.item x=5');assert.ok(!byId.has('native:novel'));
 assert.equal(byId.get('governing-schema:novel').wires,stateSchema);assert.equal(byId.get('governing-schema:novel').schemaView.slots.length,1);
 assert.ok(graph.edges.some(edge=>edge.from==='world:novel'&&edge.to===pattern.id&&edge.label==='declares schema world'));
 assert.ok(graph.edges.some(edge=>edge.from==='instance:novel'&&edge.to===pattern.id&&edge.label==='declared schema world'));
 assert.ok(graph.edges.some(edge=>edge.from===pattern.id&&edge.to===toolInterface.id&&edge.label==='declares source file'));
 const ids=new Set(graph.nodes.map(node=>node.id));for(const edge of graph.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);}
});
test('source evidence keeps declared documentation and language wires distinct from runtime understanding',()=>{
 const source='@legend core.legend namespace=novel doc="Actual legend description"\n@item core.type of=novel.item doc="Actual type meaning"\n@word core.word text="scarlet" means=red\n';
 const evidence=inspectSchemaSource(source);assert.equal(evidence.legends[0].documentation,'Actual legend description');assert.equal(evidence.types[0].documentation,'Actual type meaning');assert.equal(evidence.language[0].attributes.text[0],'"scarlet"');assert.match(evidence.languageStatus,/does not prove/);
 assert.equal(inspectSchemaSource('@broken').status,'source parse failed');
});
test('interpreters that run are on the map: SOP area interpreter, SOP world host, std.problem compiler and its providers with real status',async()=>{
 const {describePlacementSearch}=await import('../src/dialog/placement-search-inspection.mjs');
 const index={worlds:{novel:{runtimeModules:['worlds/sop-area.mjs','worlds/sop-world-host.mjs'],nativeHost:{module:'worlds/novel/sop-novel.mjs',factory:'createNovelArea'}}}};
 const hosts=[{world:'novel',view:'editor',operations:[{id:'novel.add',spatial:{kindKey:'kind'}}],observation:{objects:[]}}];
 const ready=describePlacementSearch({status:{supported:true,isolated:true,state:'ready',version:'5.4.1',base:'https://example.test/z3/',loadMs:1234,load:{status:'loaded',ms:1234,base:'https://example.test/z3/'}},activity:[{operation:'std.placement',phase:'start'},{operation:'std.placement',phase:'end',provider:'z3',time:7}]});
 const graph=inspectWorldsRuntime({index,loaded:['novel'],hosts,placementSearch:ready});
 const node=id=>graph.nodes.find(entry=>entry.id===id),edge=(from,to)=>graph.edges.some(entry=>entry.from===from&&entry.to===to);
 for(const id of ['component:sop-area','component:sop-world-host','component:problem-compiler','provider:internal-search','provider:z3'])assert.equal(node(id)?.kind,'interpreter',id);
 assert.equal(node('provider:internal-search').status,'always available');
 assert.equal(node('provider:z3').status,'ready');assert.match(node('provider:z3').description,/Ready: loaded from https:\/\/example\.test\/z3\/ \(z3-solver 5\.4\.1, 1234 ms\)/);
 assert.equal(node('component:problem-compiler').details.lastSolvedBy,'z3');
 assert.equal(node('interpreter:novel').details.source,'worlds/novel/sop-novel.mjs');
 assert.ok(edge('component:sop-area','interpreter:novel')&&edge('interpreter:novel','component:sop-world-host'));
 assert.ok(edge('component:problem-compiler','provider:internal-search')&&edge('component:problem-compiler','provider:z3')&&edge('component:problem-compiler','interpreter:novel'));
 assert.ok(!edge('provider:z3','runtime:activity-bus'),'providers do not claim to publish activity');
 const states=[[{supported:false,isolated:false,state:'not-loaded'},'unavailable',/not cross-origin isolated/],[{supported:true,isolated:true,state:'not-loaded'},'not loaded',/Not loaded/],
  [{supported:true,isolated:true,state:'warming',warmedBy:'idle'},'warming',/idle warm-up/],[{supported:true,isolated:true,state:'unavailable',error:'z3-fetch: z3-built.js 404'},'unavailable',/load failed \(z3-fetch/],
  [{supported:true,base:'b/',load:{status:'loaded',ms:9,base:'b/'}},'ready',/9 ms/],
  [{supported:true,isolated:true,state:'warming',warmedBy:'startup'},'warming',/started by the start-up/],
  [{supported:true,isolated:true,state:'ready',warmedBy:'startup',base:'b/',load:{status:'loaded',ms:9,base:'b/'}},'ready',/9 ms, started by the start-up/]];
 for(const [status,state,summary]of states){const {z3}=describePlacementSearch({status});assert.equal(z3.state,state);assert.match(z3.summary,summary);}
 assert.equal(node('runtime:registry').label,'World loader');
});
test('records say what they are and which World shows them, so the map needs no Session runtime layer',()=>{
 const index={worlds:{novel:{tab:{title:'Novel'},schemaWorld:'pattern.novel',schemaFiles:[{file:'native-interface.sop',role:'native-tool-interface'}],runtimeModules:['worlds/sop-area.mjs','worlds/sop-world-host.mjs']}}};
 const catalog={worlds:[{id:'k.sample',schema:'k.sample/schema.sop',shards:[{path:'k.sample/data.sop'}]}]};
 const graph=inspectWorldsRuntime({index,bundle:{worlds:{novel:{files:{'native-interface.sop':'@m core.module name=x'}}}},loaded:['novel'],hosts:[{world:'novel',view:'novel',operations:[]}],instances:[{world:'novel',instanceId:'i',revision:1,authoritative:true,wires:'@o novel.item x=1'}],knowledgeFiles:[{path:'index.json',text:JSON.stringify(catalog)},{path:'k.sample/data.sop',text:'@d k.item'}],sessionMeta:{memory:{}}});
 const node=id=>graph.nodes.find(entry=>entry.id===id);
 assert.equal(node('runtime:registry').kind,'component','the world loader is a component, not a session runtime record');
 assert.equal(node('runtime:session-memory').partOf,'component:reasoner','session memory is part of the Session');
 assert.equal(node('schema:novel:native-interface.sop').partOf,'schema-world:pattern.novel','a declared schema file is part of its schema World');
 assert.equal(node('knowledge-file:k.sample/data.sop').partOf,'knowledge-world:k.sample','a read source file is part of its catalog World');
 assert.equal(node('knowledge-file:index.json').partOf,'knowledge:catalog','the catalog index is part of the catalog');
 assert.equal(node('knowledge-file:k.sample/schema.sop').partOf,'knowledge-world:k.sample','an unread declared schema is part of its catalog World');
 assert.equal(node('instance:novel').displayName,'Novel instance World');assert.equal(node('interpreter:novel').displayName,'Novel tool host');assert.equal(node('world:novel').displayName,'Novel tool package');
 assert.match(node('provider:z3').displayName,/^Z3 solver \(/);
});
