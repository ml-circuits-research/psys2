import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
const call=(host,operation,args,invocation)=>host.invoke({operation,args,invocation,expectedVersion:host.observe().version});
test('declared Diagram tools make, connect, change, move, layout and remove native items with full observations',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'diagram.one'});
 const made=call(host,'diagram.node.make',{kind:'circle',n:2},'make');assert.equal(made.status,'changed',JSON.stringify(made));assert.equal(made.verification,'unverified');assert.equal(made.before.objects.length,0);assert.equal(made.after.objects.length,2);assert.equal(state.undo.length,1);
 const ids=made.after.objects.map(o=>o.id);const linked=call(host,'diagram.link.make',{from:ids[0],to:ids[1]},'link');assert.equal(linked.status,'changed');const edge=linked.after.objects.find(o=>o.kind==='link');assert.equal(edge.from,ids[0]);
 assert.equal(call(host,'diagram.node.change',{ids:[ids[0]],colour:'purple',label:'Alpha'},'change').status,'changed');assert.equal(state.shapes[0].label,'Alpha');
 assert.equal(call(host,'diagram.node.place',{ids:[ids[0]],x:200,y:200},'place').status,'changed');assert.equal(state.shapes[0].x,200);assert.equal(state.shapes[0].y,200);
 assert.equal(call(host,'diagram.node.layout',{ids,layout:'row'},'layout').status,'changed');assert.equal(call(host,'diagram.link.remove',{ids:[edge.id]},'unlink').status,'changed');assert.equal(state.edges.length,0);
 const removed=call(host,'diagram.node.remove',{ids:[ids[0]]},'remove');assert.equal(removed.after.objects.length,1);const source=made.after.objects.find(o=>o.id===ids[0]).source;
 const restored=call(host,'diagram.undo',{},'undo');assert.equal(restored.after.objects.length,2);assert.notEqual(restored.after.objects.find(o=>o.id===ids[0]).source,source);
});
test('Diagram rejects missing targets and undeclared arguments atomically, with stale/replay guards',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'diagram.two'});const packet={invocation:'one',expectedVersion:host.observe().version,operation:'diagram.node.make',args:{kind:'square'}};const first=host.invoke(packet);assert.equal(first.status,'changed');assert.equal(host.invoke(packet).replayed,true);assert.equal(state.shapes.length,1);
 assert.equal(host.invoke({...packet,args:{kind:'circle'}}).reason,'invocation-reused');const before=JSON.stringify(state);
 assert.equal(call(host,'diagram.node.remove',{ids:[state.shapes[0].name,'absent']},'bad').status,'refused');assert.equal(call(host,'diagram.node.make',{kind:'square',n:13},'too-many').status,'refused');assert.equal(JSON.stringify(state),before);
 const version=host.observe().version;state.shapes[0].label='external';assert.equal(host.invoke({invocation:'stale',expectedVersion:version,operation:'diagram.node.remove',args:{ids:[state.shapes[0].name]}}).reason,'stale-observation');
 const observed=host.observe();observed.objects[0].inputs[0].values.push('bad');assert.notDeepEqual(observed,host.observe());
});
test('Diagram exposes actual native colour constraints and does not claim arbitrary RGB support',async()=>{
 const state=initialDiagramState(),h=await createDiagramHost({state,instanceId:'diagram.colour'});const make=h.bindings().find(b=>b.id==='diagram.node.make');assert.ok(make.params.colour.enum.includes('purple'));assert.ok(!make.params.colour.enum.includes('#112233'));
 assert.equal(call(h,'diagram.node.make',{kind:'circle',colour:'#112233'},'unsupported').reason,'invalid-argument-value');assert.equal(state.shapes.length,0);
 assert.equal(call(h,'diagram.node.make',{kind:'circle',colour:'purple'},'supported').status,'changed');assert.equal(state.shapes[0].color,'purple');
});
