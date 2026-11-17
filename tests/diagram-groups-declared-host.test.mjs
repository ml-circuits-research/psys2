import test from'node:test';import assert from'node:assert/strict';
import{createDiagramHost,initialDiagramState}from'../worlds/diagram.sketch/declared-host.mjs';
const call=(h,operation,args)=>h.invoke({invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
test('named groups retain members through layout, properties and movement; explicit numeric values produce a linked chart',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'groups'});
 const first=call(h,'diagram.node.make',{kind:'rectangle',n:3});assert.equal(first.status,'changed');const ids=s.shapes.map(n=>n.name);
 assert.equal(call(h,'diagram.group.make',{name:'Sales',ids}).status,'changed');const members=[...s.groups[0].members];
 assert.equal(call(h,'diagram.group.layout',{id:'Sales',layout:'column'}).status,'changed');assert.deepEqual(s.groups[0].members,members);assert.equal(s.groups[0].layout,'column');
 assert.equal(call(h,'diagram.group.change',{id:'Sales',label:'Quarterly sales',colour:'blue'}).status,'changed');assert.deepEqual(s.groups[0].members,members);assert.equal(s.groups[0].name,'Sales');assert.equal(s.groups[0].label,'Quarterly sales');
 const before=structuredClone(s),bad=call(h,'diagram.group.chart',{id:'Sales',type:'bar'});assert.equal(bad.status,'refused');assert.deepEqual(s,before);
 for(const [i,id]of ids.entries())assert.equal(call(h,'diagram.node.change',{ids:[id],value:i+2,label:'Item '+i}).status,'changed');
 assert.equal(call(h,'diagram.group.chart',{id:'Sales',type:'bar'}).status,'changed');assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[2,3,4]);assert.equal(s.chartTools.charts[0].group,'Sales');assert.deepEqual(s.groups[0].members,members);
 assert.equal(call(h,'diagram.group.place',{id:'Sales',x:300,y:250}).status,'changed');const obs=h.observe().objects.find(o=>o.sourceType==='diagram.sketch.group');assert.ok(obs.inputs.some(i=>i.key==='x'&&i.values.includes('300')));
 assert.equal(call(h,'diagram.group.ungroup',{id:'Sales'}).status,'changed');assert.equal(s.groups.length,0);assert.equal(s.shapes.length,3);
});
test('group selection is declared, preserves members and rejects a missing group without mutation',async()=>{
 const state=initialDiagramState(),h=await createDiagramHost({state,instanceId:'group-selection'});
 const invoke=(operation,args)=>h.invoke({invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
 invoke('diagram.node.make',{kind:'circle',n:2});const ids=state.shapes.map(n=>n.name);invoke('diagram.group.make',{name:'Selected pair',ids});const before=state.compositionHistory.length;
 const selected=invoke('diagram.group.select',{id:'Selected pair'});assert.equal(selected.status,'changed');assert.deepEqual(state.selected.shapes,ids);assert.equal(state.selected.group,'Selected pair');assert.equal(state.compositionHistory.length,before);assert.equal(state.chartTools.active,null);
 const snapshot=JSON.stringify(state);assert.equal(invoke('diagram.group.select',{id:'missing'}).status,'refused');assert.equal(JSON.stringify(state),snapshot);
});
