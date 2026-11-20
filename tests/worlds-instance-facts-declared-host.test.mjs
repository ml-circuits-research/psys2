// The Worlds tab reads every SOP area's instance facts without preparing areas the session has not used.
import test from'node:test';import assert from'node:assert/strict';
import{NATIVE_AREAS,createAreaHost}from'../src/dialog/app-reader-context.mjs';
import{observeNativeInstanceWorlds}from'../src/dialog/instance-persistence.mjs';
import{inspectInstanceRecord}from'../src/dialog/instance-inspection.mjs';
import{inspectWorldsRuntime}from'../src/dialog/worlds-inspection.mjs';
import{invokeToolCommand}from'../src/dialog/native-control-intent.mjs';
import{peekAreaBase}from'../worlds/sop-area.mjs';
test('inspection shows the instance facts a command made and leaves unused areas unprepared',async()=>{
 const state=Object.fromEntries(Object.values(NATIVE_AREAS).map(area=>[area.world,{sop:'',runtime:{view:{}}}]));
 const session={isession:{state},nativeInstanceIds:Object.fromEntries(Object.values(NATIVE_AREAS).map(area=>[area.world,'i.'+area.world]))};
 const draw=NATIVE_AREAS.draw,host=await createAreaHost(draw,{state:state[draw.world],instanceId:'i.'+draw.world});
 const made=invokeToolCommand(host,{invocation:'worlds.1',expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind:'triangle',x:120,y:80}});
 assert.equal(made.status,'changed',JSON.stringify(made));
 const unused=Object.values(NATIVE_AREAS).filter(area=>area!==draw),before=structuredClone(state);
 for(const area of unused)assert.equal(peekAreaBase(area.world),undefined,area.world+' must start unprepared');
 const records=await observeNativeInstanceWorlds(session,{includeHostInterface:true,includeSupport:true,prepareKnowledge:false});
 assert.deepEqual(state,before,'inspection must not start or change any area state');
 for(const area of unused)assert.equal(peekAreaBase(area.world),undefined,area.world+' must not be prepared by inspection');
 const drawn=records.find(record=>record.world===draw.world);
 assert.equal(drawn.prepared,true);assert.match(drawn.wires,/ w\.drawing\.object .*drawing=triangle x=120 y=80/);
 const [object]=drawn.observation.objects;assert.equal(drawn.observation.objects.length,1);
 for(const record of records.filter(record=>record.world!==draw.world)){assert.equal(record.prepared,false);assert.equal(record.observation,null);assert.equal(record.nativeInterface,undefined);}
 // The observed object binds to the fact its observation was derived from.
 const inspected=inspectInstanceRecord({...drawn,wires:drawn.carrier},{observation:drawn.observation,semanticWires:drawn.wires,observedSupport:drawn.observationSupport});
 const factId=drawn.observationSupport[object.id][0];
 assert.equal(inspected.objects[0].factId,factId);assert.equal(inspected.objects[0].factSource,'instance (derived observation)');assert.match(inspected.objects[0].wires,new RegExp('^@'+factId+' w\\.drawing\\.object '));
 const graph=inspectWorldsRuntime({instances:records,hosts:records.filter(record=>record.nativeInterface).map(record=>({world:record.world,view:'v',observation:record.observation,...record.nativeInterface})),nativeStates:state});
 const node=id=>graph.nodes.find(node=>node.id===id);
 assert.equal(node('instance:'+draw.world).wires,drawn.wires);
 for(const area of unused){assert.ok(node('instance:'+area.world));assert.match(node('instance:'+area.world).details.observation,/not prepared/);}
});
