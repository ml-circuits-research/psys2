import test from'node:test';import assert from'node:assert/strict';
import{serializeInstanceState}from'../src/vendor/sopworld/sopworld.mjs';import{inspectInstanceRecord}from'../src/dialog/instance-inspection.mjs';
const record={wires:serializeInstanceState({instanceId:'i',world:'fixture.editor',schemaVersion:'1',revision:0,objects:[{id:'piece',type:'fixture.visible',attributes:{x:[5]},relations:{}}],projection:null})};
test('canonical inspection follows explicit interface identity and never substitutes a historical duplicate',()=>{
 const semanticWires='@current fixture.state id="piece" nativeType="fixture.visible" x=5\n@history fixture.state id="piece" x=1';
 const result=inspectInstanceRecord(record,{semanticWires,interfaceTypeKey:'nativeType'});assert.equal(result.objects[0].factId,'current');assert.match(result.objects[0].wires,/x=5/);assert.doesNotMatch(result.objects[0].wires,/@history/);assert.equal(result.wires,semanticWires);
 assert.throws(()=>inspectInstanceRecord(record,{semanticWires,interfaceTypeKey:null}),/canonical-object-identity-ambiguous/);
});
test('canonical inspection refuses missing, conflicting or duplicate interface facts',()=>{
 for(const semanticWires of ['@current fixture.state id="piece" x=5','@current fixture.state id="piece" nativeType="fixture.other" x=5','@a fixture.state id="piece" nativeType="fixture.visible"\n@b fixture.state id="piece" nativeType="fixture.visible"'])assert.throws(()=>inspectInstanceRecord(record,{semanticWires,interfaceTypeKey:'nativeType'}),/canonical-object-identity/);
});
