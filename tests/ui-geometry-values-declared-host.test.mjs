import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import{test}from'node:test';import assert from'node:assert/strict';
import{quantizeGeometryArguments}from'../docs/webchat/ui/geometry-values.mjs';
import{performGesture}from'./fixtures/editor-gesture.mjs';
import{createDrawingHost,initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
test('UI dispatch rounds real geometry and leaves unrelated numeric values exact',()=>{
 const input={x:226.7711375210331,y:288.9317562519493,width:120,height:72,n:3,value:1.23456789,start:1794900000001,duration:3600001,data:[1.12345678],datasets:[{data:[{x:1.23456789,y:9.87654321}]}],geometry:{bounds:{x0:1.1234567,y1:2.9876543},points:[[1.23456,7.65432]],matrix:[1.123456,0,0,1.987654,12.123456,11.987654]},scale:1.1234567};
 const before=structuredClone(input),out=quantizeGeometryArguments(input);assert.equal(out.x,226.77);assert.equal(out.y,288.93);assert.equal(out.scale,1.12);assert.equal(out.value,input.value);assert.equal(out.start,input.start);assert.equal(out.duration,input.duration);assert.deepEqual(out.data,input.data);assert.deepEqual(out.datasets,input.datasets);assert.deepEqual(out.geometry,{bounds:{x0:1.12,y1:2.99},points:[[1.23,7.65]],matrix:[1.12,0,0,1.99,12.12,11.99]});assert.deepEqual(input,before);
 assert.deepEqual(quantizeGeometryArguments({width:.001,x:.001,y:-.001}),{width:.01,x:0,y:0});
});
test('actual Drawing command text, SOP arguments and stored position share UI precision',async()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'ui-precision'});invokeToolCommand(host,{invocation:'make',expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind:'rectangle'}});
 const session={isession:{state:{'art.draw':state}},engine:{}},args=quantizeGeometryArguments({ids:[state.objects[0].id],x:226.7711375210331,y:288.9317562519493});
 const result=await performGesture(session,{view:'draw',operation:'drawing.object.place',args});assert.equal(result.ok,true);assert.equal(toNativeDrawingState(session.isession.state['art.draw']).objects[0].x,args.x);assert.equal(toNativeDrawingState(session.isession.state['art.draw']).objects[0].y,args.y);assert.match(result.intentRecord.wires,/x=226\.77 y=288\.93/);assert.match(result.intentRecord.text,/226\.77/);assert.match(result.intentRecord.text,/288\.93/);assert.equal(result.intentRecord.verification.status,'verified');
});

test('geometry copying has a finite depth and value budget, including cycles',()=>{const cyclic={};cyclic.geometry=cyclic;assert.throws(()=>quantizeGeometryArguments(cyclic),/budget/);let deep={x:1.1234};for(let n=0;n<34;n++)deep={geometry:deep};assert.throws(()=>quantizeGeometryArguments(deep),/budget/);assert.throws(()=>quantizeGeometryArguments({data:Array(100001).fill(1)}),/budget/);});
