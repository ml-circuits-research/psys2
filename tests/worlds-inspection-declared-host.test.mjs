import test from'node:test';import assert from'node:assert/strict';
import{inspectWorldsRuntime}from'../src/dialog/worlds-inspection.mjs';
test('architecture inspector exposes exact held files, actual state structures and labeled declarations without claiming reasoning',()=>{
 const state={objects:[{id:'a',x:5}],history:[{objects:[]}],future:[],selected:'a'},schema='@t core.type name=novel.item',archive='@a novel.item x=5';
 const result=inspectWorldsRuntime({index:{worlds:{novel:{imports:['shared'],reads:[],compose:[]},shared:{imports:[]}}},bundle:{worlds:{novel:{files:{'legend.sop':schema,'world.sop':'@w core.world'}}}},loaded:['novel'],nativeStates:{novel:state},instances:[{world:'novel',instanceId:'actual',revision:2,wires:archive}],instanceCaches:[{world:'novel',wireCount:1,wires:archive}],hosts:[{world:'novel',view:'editor',operations:[{id:'novel.add'}],observation:{objects:state.objects}}],knowledgeFiles:[{path:'shards/a.sop',text:'@k k.item n=2'}],reader:{state:'ready',cache:{hits:7,networkBytes:0}},sessionMeta:{memory:{newEngineUndo:[{operation:'actual'}]}}});
 const byId=new Map(result.nodes.map(n=>[n.id,n]));
 assert.ok(!result.nodes.some(n=>n.id.startsWith('cache:')));assert.equal(byId.get('component:reader').details.cache.hits,7);assert.match(byId.get('component:reader').help.purpose,/candidate request graphs/);assert.equal(byId.get('instance:novel').role,'World instance');
 assert.equal(byId.get('schema:novel:legend.sop').wires,schema);assert.equal(byId.get('instance:novel').wires,archive);assert.equal(byId.get('instance:novel').details.cachedWorld.wires,archive);
 assert.equal(byId.get('native:novel').details,state);assert.deepEqual(byId.get('structure:novel:history').details.value,state.history);
 assert.equal(byId.get('world:shared').details.loaded,false);assert.equal(byId.get('world:shared').wires,'');
 assert.equal(byId.get('interpreter:novel').implementation,'JavaScript');assert.equal(byId.get('knowledge-file:shards/a.sop').wires,'@k k.item n=2');
 assert.ok(result.edges.some(e=>e.from==='world:novel'&&e.to==='world:shared'&&e.label==='imports'));
 assert.ok(!result.edges.some(e=>e.label==='reasoned with'));assert.ok(result.limitations.length);
 assert.deepEqual(byId.get('session-memory:newEngineUndo').details.value,[{operation:'actual'}]);
 const ids=new Set(result.nodes.map(n=>n.id));for(const edge of result.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);}
});
import{invokeNativeControl}from'../src/dialog/native-tool-controls.mjs';
import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
test('native execution emits actual host invocation boundaries and observer exceptions cannot alter effects',async()=>{
 const events=[],session={isession:{state:{'art.draw':initialDrawingState()}},engine:{onWorldActivity:event=>events.push(event)}};
 const result=await invokeNativeControl(session,{view:'draw',operation:'drawing.ids.show',args:{mode:'always'}});
 assert.equal(result.ok,true);assert.deepEqual(events.map(e=>e.phase),['start','end']);assert.equal(events[0].invocation,events[1].invocation);assert.equal(events[0].args.mode,'always');assert.equal(events[0].args.duration,4000);assert.ok(events[1].durationMs>=0);assert.equal(events[1].result.status,'changed');assert.equal(events[1].status,'changed');assert.equal(events[0].operation,'drawing.ids.show');assert.ok(events[0].nodeIds.includes('interpreter:art.draw'));
 session.engine.onWorldActivity=()=>{throw Error('broken observer');};
 assert.equal((await invokeNativeControl(session,{view:'draw',operation:'drawing.ids.show',args:{mode:'off'}})).ok,true);assert.equal(session.isession.state['art.draw'].idDisplay.mode,'off');
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
