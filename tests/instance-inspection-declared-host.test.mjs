import test from 'node:test';import assert from 'node:assert/strict';
import{serializeInstanceState,parse,str}from'../src/vendor/sopworld/sopworld.mjs';
import{inspectInstanceRecord}from'../src/dialog/instance-inspection.mjs';
test('inspection exposes exact full archive and object-owned wire closures without inventing provenance',()=>{
 const wires=serializeInstanceState({world:'novel.world',instanceId:'actual-instance',revision:7,schemaVersion:'1',objects:[{id:'first',type:'novel.item',attributes:{label:['First'],payload:[{flag:false,n:2.5}]},relations:{next:['second']},metadata:{binding:'actual.binding'}},{id:'second',type:'novel.item',attributes:{label:['Second']},relations:{next:['first']}}],projection:{privateRendererCache:['visible in full archive']},metadata:{knowledge:{version:'actual-pin'}}});
 const info=inspectInstanceRecord({wires},{observation:{scope:'real.scope',objects:[{id:'first',source:'actual-source',version:'12'}]}});
 assert.equal(info.wires,wires);assert.equal(info.instanceId,'actual-instance');assert.equal(info.revision,7);assert.equal(info.metadata.knowledge.version,'actual-pin');
 const first=info.objects[0],selected=parse(first.wires),full=new Map(parse(wires).map(n=>[n.id,n]));assert.deepEqual(first.observation,{source:'actual-source',version:'12',scope:'real.scope'});
 assert.ok(selected.some(n=>n.id===first.factId));assert.ok(!selected.some(n=>n.type==='std.instance.object'));assert.ok(parse(first.archiveWires).some(n=>n.type==='std.instance.object'&&str(n.attrs.id[0])==='first'));
 for(const node of [...selected,...parse(first.archiveWires)])assert.deepEqual(node,full.get(node.id));
 assert.ok(!selected.some(n=>n.id===info.objects[1].factId));assert.doesNotMatch(first.wires,/actual.binding/);assert.match(first.archiveWires,/actual.binding/);assert.doesNotMatch(first.wires,/privateRendererCache/);assert.equal(info.objects[1].observation,undefined);
});
