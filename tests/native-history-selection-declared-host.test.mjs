import test from 'node:test';import assert from 'node:assert/strict';
import{invokeNativeControl}from'../src/dialog/native-tool-controls.mjs';
import{canonicalDrawingState,toNativeDrawingState}from'../worlds/art.draw/canonical-state.mjs';
import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
import{NATIVE_AREAS}from'../src/dialog/app-reader-context.mjs';
import{createNativeToolHost,nativeToken}from'../worlds/native-tool-host.mjs';
const run=(s,view,operation,args={})=>invokeNativeControl(s,{view,operation,args});
test('selection changes preserve undo/redo while undeclared content changes still invalidate it',async()=>{
 const s={isession:{state:{'art.draw':initialDrawingState()}},engine:{}};
 await run(s,'draw','drawing.object.make',{kind:'circle'});await run(s,'draw','drawing.object.make',{kind:'square'});const ids=toNativeDrawingState(s.isession.state['art.draw']).objects.map(o=>o.id);
 await run(s,'draw','drawing.object.select',{id:ids[0]});assert.equal((await run(s,'draw','ui.history.undo')).ok,true);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).objects.length,1);
 await run(s,'draw','drawing.object.select',{id:null});assert.equal((await run(s,'draw','ui.history.redo')).ok,true);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).objects.length,2);
 const edited=toNativeDrawingState(s.isession.state['art.draw']);edited.objects[0].x+=1;s.isession.state['art.draw']=canonicalDrawingState(edited);assert.equal((await run(s,'draw','ui.history.undo')).ok,false);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).objects.length,2);
});
test('an unfamiliar host declares its focus path without adding a world branch to history',async()=>{
 NATIVE_AREAS.novel={world:'novel.workspace',historySelection:[['navigation','focus']],create:({state,instanceId})=>createNativeToolHost({state,instanceId,scope:'novel',operations:[{id:'novel.change',act:'change',on:'novel.item',params:{value:{type:'number',required:true}}},{id:'novel.pick',act:'pick',on:'novel.item',params:{id:{type:'string',required:true}}}],handlers:{'novel.change':(ctx,a)=>{ctx.state.value=a.value;return {status:'supported',changed:['a']};},'novel.pick':(ctx,a)=>{ctx.state.navigation.focus=a.id;return {status:'supported',changed:['a']};}},view:s=>[{id:'a',kind:'item',sourceType:'novel.item',inputs:[{key:'value',binding:'novel.value',values:[nativeToken(s.value)]}]}]})};
 try{const s={isession:{state:{'novel.workspace':{value:1,navigation:{focus:'a'}}}},engine:{}};await run(s,'novel','novel.change',{value:2});await run(s,'novel','novel.pick',{id:'other'});assert.equal((await run(s,'novel','ui.history.undo')).ok,true);assert.equal(s.isession.state['novel.workspace'].value,1);}finally{delete NATIVE_AREAS.novel;}
});

test('identity overlay view preference survives content undo and redo',async()=>{
 const s={isession:{state:{'art.draw':initialDrawingState()}},engine:{}};
 await run(s,'draw','drawing.object.make',{kind:'circle'});await run(s,'draw','drawing.ids.show',{mode:'always'});
 assert.equal((await run(s,'draw','ui.history.undo')).ok,true);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).objects.length,0);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).idDisplay.mode,'always');
 assert.equal((await run(s,'draw','ui.history.redo')).ok,true);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).objects.length,1);assert.equal(toNativeDrawingState(s.isession.state['art.draw']).idDisplay.mode,'always');
});
