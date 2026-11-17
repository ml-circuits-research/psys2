import test from'node:test';import assert from'node:assert/strict';
import{inspectWorldsRuntime}from'../src/dialog/worlds-inspection.mjs';
test('architecture inspector exposes exact held files, actual state structures and labeled declarations without claiming reasoning',()=>{
 const state={objects:[{id:'a',x:5}],history:[{objects:[]}],future:[],selected:'a'},schema='@t core.type name=novel.item',archive='@a novel.item x=5';
 const result=inspectWorldsRuntime({index:{worlds:{novel:{imports:['shared'],reads:[],compose:[]},shared:{imports:[]}}},bundle:{worlds:{novel:{files:{'legend.sop':schema,'world.sop':'@w core.world'}}}},loaded:['novel'],nativeStates:{novel:state},instances:[{world:'novel',instanceId:'actual',revision:2,wires:archive}],instanceCaches:[{world:'novel',wireCount:1,wires:archive}],hosts:[{world:'novel',view:'editor',operations:[{id:'novel.add'}],observation:{objects:state.objects}}],knowledgeFiles:[{path:'shards/a.sop',text:'@k k.item n=2'}],reader:{state:'ready'},sessionMeta:{memory:{newEngineUndo:[{operation:'actual'}]}}});
 const byId=new Map(result.nodes.map(n=>[n.id,n]));
 assert.equal(byId.get('schema:novel:legend.sop').wires,schema);assert.equal(byId.get('instance:novel').wires,archive);assert.equal(byId.get('cache:novel').wires,archive);
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
 assert.equal(result.ok,true);assert.deepEqual(events.map(e=>e.phase),['start','end']);assert.equal(events[1].status,'changed');assert.equal(events[0].operation,'drawing.ids.show');assert.ok(events[0].nodeIds.includes('interpreter:art.draw'));
 session.engine.onWorldActivity=()=>{throw Error('broken observer');};
 assert.equal((await invokeNativeControl(session,{view:'draw',operation:'drawing.ids.show',args:{mode:'off'}})).ok,true);assert.equal(session.isession.state['art.draw'].idDisplay.mode,'off');
});
