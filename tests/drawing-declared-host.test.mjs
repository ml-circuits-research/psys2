import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createDrawingHost,initialDrawingState,DRAWING_TOOL_BINDINGS} from '../worlds/art.draw/declared-host.mjs';
import {partsOf,KINDS} from '../worlds/art.draw/scene.mjs';
const call=(host,operation,args,invocation=Math.random().toString())=>invokeToolCommand(host,{invocation,expectedVersion:host.observe().version,operation,args});
test('Drawing lifecycle creates actual renderable board objects across native kinds',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'drawing.native'});
 assert.deepEqual(DRAWING_TOOL_BINDINGS[0].params.kind.enum,Object.keys(KINDS));
 for(const kind of ['circle','rectangle','tree']){const r=call(host,'drawing.object.make',{kind,name:`Named ${kind}`,x:120,y:180,color:'#8040FF'});assert.equal(r.status,'changed');assert.equal(r.verification,'unverified');const object=state.objects.at(-1);assert.equal(object.kind,kind);assert.equal(object.name,`Named ${kind}`);assert.ok(partsOf(object).length>0);assert.equal(object.x,120);}
 const o=host.observe();assert.equal(o.complete,true);assert.equal(o.objects.filter(x=>x.sourceType==='art.draw.object').length,3);assert.equal(new Set(o.objects.map(x=>x.source)).size,o.objects.length);assert.ok(o.objects.some(x=>x.sourceType==='art.draw.part'&&x.in));assert.ok(o.objects.every(x=>x.inputs.every(i=>i.source===x.source&&i.version===o.version)));
});
test('Drawing transactions preserve no-op, stale refusal, replay and real board undo',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'drawing.history'}),before=host.observe();
 const packet={invocation:'make',expectedVersion:before.version,operation:'drawing.object.make',args:{kind:'circle',color:'#123456'}};
 const made=invokeToolCommand(host,packet),id=made.changed[0],source=host.observe().objects[0].source;
 assert.equal(invokeToolCommand(host,packet).replayed,true);assert.equal(state.objects.length,1);
 assert.equal(invokeToolCommand(host,{...packet,invocation:'stale'}).reason,'stale-observation');
 const count=state.history.length;assert.equal(call(host,'drawing.object.change',{ids:[id],color:'#123456'}).status,'unchanged');assert.equal(state.history.length,count);
 assert.equal(call(host,'drawing.object.change',{ids:[id],color:'#654321',size:77}).status,'changed');
 assert.equal(call(host,'drawing.undo',{}).status,'changed');assert.equal(state.objects[0].color,'#123456');
 assert.equal(call(host,'drawing.object.remove',{ids:[id]}).status,'changed');assert.equal(host.observe().objects.length,0);
 assert.equal(call(host,'drawing.undo',{}).status,'changed');assert.equal(state.objects[0].id,id);assert.notEqual(host.observe().objects[0].source,source);
});
test('Drawing malformed or unsupported native operations never partially change state',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'drawing.refusal'});call(host,'drawing.object.make',{kind:'square'});const before=JSON.stringify(state),id=state.objects[0].id;
 for(const [op,args]of [['drawing.object.make',{kind:'invented-kind'}],['drawing.object.change',{ids:[id],color:'purple'}],['drawing.object.remove',{ids:[id,'missing']}],['drawing.object.change',{ids:[id],size:-1}],['drawing.object.change',{ids:[id]}]]){assert.equal(call(host,op,args).status,'refused');assert.equal(JSON.stringify(state),before);}
});
