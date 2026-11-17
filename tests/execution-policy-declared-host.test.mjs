import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';
import{World,serialize}from'../src/vendor/sopworld/sopworld.mjs';
import SOURCE from'../worlds/app.project/execution-policy-source.mjs';
import{executionPolicyWorld,executionDefaults,executionValueSource}from'../src/dialog/execution-policy.mjs';
test('operational SOP defaults retain supplied scheduling values and only sample the clock for omissions',()=>{
 let calls=0;const missing=executionDefaults('calendar.meeting.add',{}, {now:()=>{calls++;return 987;}});
 assert.deepEqual(missing.values,{start:987,duration:1800000,participants:[],room:null});assert.equal(calls,1);
 assert.deepEqual(missing.notices,['I scheduled it starting now.','I used a 30-minute duration.']);
 assert.deepEqual(executionDefaults('calendar.meeting.add',{start:0,duration:60000,participants:['p'],room:'r'},{now:()=>{throw Error('must not sample');}}).values,{});
 assert.deepEqual(executionDefaults('document.write',{}).values,{blocks:[]});
 assert.deepEqual(executionDefaults('undeclared.operation',{}).values,{});
 assert.equal(executionPolicyWorld().functions()[0].registered,true);
});
test('a different declared operation and duration work without changing the policy interpreter',()=>{
 const world=new World();assert.equal(world.load(SOURCE.replaceAll('calendar.meeting.add','sample.task.make').replace('value=1800000','value=4500')).ok,true);
 assert.equal(executionDefaults('sample.task.make',{}, {world,now:()=>1}).values.duration,4500);
 assert.deepEqual(executionDefaults('calendar.meeting.add',{}, {world}).values,{});
 assert.deepEqual(executionValueSource('colour',world),{valueType:'k.colours.colour',nameKey:'name',valueKey:'rgb'});
 assert.equal(executionValueSource('absent',world),null);
});
test('authored SOP policy is the exact shipped source and duplicate defaults cannot silently win',async()=>{
 assert.equal(await fs.readFile(new URL('../worlds/app.project/execution-policy.sop',import.meta.url),'utf8'),SOURCE);
 const world=new World();assert.equal(world.load(SOURCE+'\n@duplicate app.execution.default operation="document.write" parameter="blocks" value=null').ok,true);
 assert.throws(()=>executionDefaults('document.write',{}, {world}),/duplicate-policy-default/);
 assert.match(serialize([...executionPolicyWorld().wires.values()]),/parameter="duration" value=1800000/);
});
