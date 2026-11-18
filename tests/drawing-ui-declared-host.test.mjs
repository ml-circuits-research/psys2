import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
const call=(h,operation,args,invocation=crypto.randomUUID())=>invokeToolCommand(h,{invocation,expectedVersion:h.observe().version,operation,args});
test('Drawing selection and explicit placement preserve identity, names, undo and stale guards',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'ui-editing'});
 call(h,'drawing.object.make',{kind:'circle',name:'Same'});const first=state.objects[0].id;call(h,'drawing.object.make',{kind:'square',name:'Same'});const second=state.objects[1].id;
 assert.equal(state.selected,second);assert.equal(call(h,'drawing.object.select',{id:first}).status,'changed');assert.equal(state.selected,first);
 assert.equal(call(h,'drawing.object.place',{ids:[first],x:123,y:234}).status,'changed');assert.equal(state.objects[0].x,123);assert.equal(state.objects[1].x,500);
 assert.equal(call(h,'drawing.object.change',{ids:[first],name:'Renamed'}).status,'changed');assert.equal(state.objects[0].id,first);
 call(h,'drawing.undo',{});assert.equal(state.objects[0].name,'Same');call(h,'drawing.undo',{});assert.equal(state.objects[0].x,500);
 call(h,'drawing.object.select',{id:null});assert.equal(state.selected,null);
 const before=JSON.stringify(state);assert.equal(call(h,'drawing.object.select',{id:'absent'}).reason,'missing-target');assert.equal(call(h,'drawing.object.place',{ids:[first,'absent'],x:10,y:10}).status,'refused');assert.equal(JSON.stringify(state),before);
 const version=h.observe().version;state.objects[0].x=22;assert.equal(invokeToolCommand(h,{invocation:'stale',expectedVersion:version,operation:'drawing.object.place',args:{ids:[first],x:30,y:30}}).reason,'stale-observation');
});
test('Drawing clear is a real native operation and the entire page stays undoable',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'ui-clear'});call(h,'drawing.object.make',{kind:'tree'});const id=state.objects[0].id;state.sky='blue';
 assert.equal(call(h,'drawing.page.clear',{}).status,'changed');assert.equal(state.objects.length,0);assert.equal(state.sky,null);assert.equal(call(h,'drawing.undo',{}).status,'changed');assert.equal(state.objects[0].id,id);assert.equal(state.sky,'blue');
});

import {drawingPartsOf} from '../worlds/art.draw/part-tools.mjs';
import {partsOf,kindKey} from '../worlds/art.draw/scene.mjs';
test('compound drawings expose actual named vector parts and edit one constituent without replacing its meaning',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'parts'});call(h,'drawing.object.make',{kind:'house'});const id=state.objects[0].id;
 const before=call(h,'drawing.object.parts',{id}).data;assert.ok(before.length>3);assert.ok(before.some(p=>p.role==='roof'));const index=before.find(p=>p.role==='roof').index;
 assert.equal(call(h,'drawing.part.select',{id,index}).status,'changed');assert.equal(state.selectedPart.index,index);
 const original=before[index];assert.equal(call(h,'drawing.part.change',{id,index,color:'#ff0000'}).status,'changed');assert.equal(state.objects[0].semanticKind,'house');assert.equal(h.observe().objects[0].kind,'house');assert.equal(partsOf(state.objects[0])[index].hex,'#ff0000');
 assert.equal(call(h,'drawing.part.place',{id,index,x:original.x+35,y:original.y+15}).status,'changed');const moved=drawingPartsOf(state.objects[0])[index];assert.ok(Math.abs(moved.x-original.x-35)<.01);assert.ok(Math.abs(moved.y-original.y-15)<.01);
 assert.equal(call(h,'drawing.part.change',{id,index,width:original.width*1.2}).status,'changed');assert.ok(drawingPartsOf(state.objects[0])[index].width>original.width);
 const snapshot=JSON.stringify(state);assert.equal(call(h,'drawing.part.change',{id,index:999,color:'#00ff00'}).status,'refused');assert.equal(JSON.stringify(state),snapshot);
 assert.equal(call(h,'drawing.undo',{}).status,'changed');assert.ok(Math.abs(drawingPartsOf(state.objects[0])[index].width-original.width)<.01);
});
test('extract, group, move and ungroup retain actual constituents and undo rather than rasterizing',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'grouping'});call(h,'drawing.object.make',{kind:'house',name:'Home'});const root=state.objects[0].id;
 const roof=drawingPartsOf(state.objects[0]).find(p=>p.role==='roof');call(h,'drawing.part.extract',{id:root,index:roof.index});assert.equal(state.objects.length,2);const extracted=state.objects.find(o=>o.id!==root);assert.equal(extracted.origin.role,'roof');assert.ok(extracted.shape.parts.length);assert.ok(!JSON.stringify(extracted).includes('data:image'));
 const ids=state.objects.map(o=>o.id),before=structuredClone(state.objects);call(h,'drawing.object.group',{ids,name:'Editable home'});assert.equal(state.objects.length,1);const group=state.objects[0];assert.equal(group.shape.members.length,2);
 const gx=group.x,gy=group.y;call(h,'drawing.object.place',{ids:[group.id],x:gx+40,y:gy+20});call(h,'drawing.object.ungroup',{id:group.id});assert.equal(state.objects.length,2);
 for(const o of state.objects){const old=before.find(p=>p.id===o.id);assert.ok(old);assert.ok(Math.abs(o.x-old.x-40)<.01);assert.ok(Math.abs(o.y-old.y-20)<.01);assert.ok(partsOf(o).length);}
 call(h,'drawing.undo',{});assert.equal(state.objects.length,1);assert.equal(state.objects[0].name,'Editable home');
});

import {THINGS} from '../worlds/art.draw/things.catalog.mjs';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
test('compound UI capture retains source references and leaves unsupported projections unverified',async()=>{
 const state=initialDrawingState(),session={isession:{state:{'art.draw':state}}};
 const run=(operation,args)=>invokeNativeControl(session,{view:'draw',operation,args});
 const current=()=>toNativeDrawingState(session.isession.state['art.draw']);
 await run('drawing.object.make',{kind:'house',name:'Home'});const root=current().objects[0].id;
 const roof=drawingPartsOf(current().objects[0]).find(p=>p.role==='roof');
 const extracted=await run('drawing.part.extract',{id:root,index:roof.index});
 assert.equal(extracted.ok,true);assert.equal(extracted.intentRecord.verification.status,'unverified');assert.equal(current().objects.length,2);assert.equal(current().objects.find(o=>o.id!==root).origin.role,'roof');
 const ids=current().objects.map(o=>o.id),grouped=await run('drawing.object.group',{ids,name:'Editable home'});
 assert.equal(grouped.ok,true);assert.equal(grouped.intentRecord.verification.status,'unverified');assert.equal(current().objects.length,1);assert.equal(current().objects[0].shape.members.length,2);
 const ungrouped=await run('drawing.object.ungroup',{id:current().objects[0].id});
 assert.equal(ungrouped.ok,true);assert.equal(ungrouped.intentRecord.verification.status,'unverified');assert.deepEqual(current().objects.map(o=>o.id),ids);assert.ok(current().objects.every(o=>partsOf(o).length));
 for(const record of [extracted,grouped,ungrouped].map(r=>r.intentRecord))assert.ok(record.text.includes('from '));
});
test('knowledge drawings use worker-loaded actual constituents, keep meaning and reject UI-supplied geometry',()=>{
 const state=initialDrawingState(),knowledge={peek:name=>name==='chair'?{name:'chair',objects:[{parts:THINGS.chair}]}:null},h=createDrawingHost({state,instanceId:'catalogue',knowledge});
 assert.equal(call(h,'drawing.catalog.make',{name:'unavailable'}).reason,'knowledge-drawing-unavailable');assert.equal(state.objects.length,0);
 assert.equal(call(h,'drawing.catalog.make',{name:'chair',parts:THINGS.chair}).reason,'unknown-argument');
 assert.equal(call(h,'drawing.catalog.make',{name:'chair'}).status,'changed');const o=state.objects[0];assert.equal(o.semanticKind,'chair');assert.ok(o.shape.parts.length);assert.equal(o.origin.representation,'knowledge-vector-parts');assert.ok(drawingPartsOf(o).some(p=>p.role));
 const observed=h.observe().objects;assert.ok(observed.some(p=>p.sourceType==='art.draw.part'&&p.in===o.id&&p.origin.kind==='chair'));
});

test('Drawing explicit placement and native multiple selection remain atomic and typed',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'marquee'});call(h,'drawing.object.make',{kind:'circle',x:100,y:160});call(h,'drawing.object.make',{kind:'square',x:350,y:250});const ids=state.objects.map(o=>o.id);assert.equal(state.objects[0].x,100);assert.equal(state.objects[1].y,250);assert.deepEqual(state.selectedIds,[ids[1]]);
 assert.equal(call(h,'drawing.objects.select',{ids}).status,'changed');assert.deepEqual(state.selectedIds,ids);const before=JSON.stringify(state);assert.equal(call(h,'drawing.objects.select',{ids:[...ids,'missing']}).status,'refused');assert.equal(JSON.stringify(state),before);
 call(h,'drawing.objects.select',{ids:[]});assert.deepEqual(state.selectedIds,[]);assert.equal(state.selected,null);
});

test('multi-delete and clear drawing preserve selection and editable compound state through native undo',()=>{
 const state=initialDrawingState(),h=createDrawingHost({state,instanceId:'delete-clear'});call(h,'drawing.object.make',{kind:'house'});call(h,'drawing.object.make',{kind:'circle'});const ids=state.objects.map(o=>o.id);call(h,'drawing.objects.select',{ids});assert.equal(call(h,'drawing.object.remove',{ids}).status,'changed');assert.equal(state.objects.length,0);assert.deepEqual(state.selectedIds,[]);call(h,'drawing.undo',{});assert.equal(state.objects.length,2);assert.deepEqual(state.selectedIds,ids);call(h,'drawing.page.clear',{});assert.equal(state.objects.length,0);assert.equal(state.selected,null);assert.deepEqual(state.selectedIds,[]);call(h,'drawing.undo',{});assert.equal(state.objects.length,2);assert.deepEqual(state.selectedIds,ids);assert.ok(drawingPartsOf(state.objects[0]).some(p=>p.role==='roof'));
});
