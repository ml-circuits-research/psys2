import test from 'node:test';import assert from 'node:assert/strict';
import{invokeNativeControl}from'../src/dialog/native-tool-controls.mjs';
import{canonicalDrawingState,toNativeDrawingState}from'../worlds/art.draw/canonical-state.mjs';
import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
import{NATIVE_AREAS}from'../src/dialog/app-reader-context.mjs';
import{createNativeToolHost,nativeToken,toolInvocationContext}from'../worlds/native-tool-host.mjs';
const run=(s,view,operation,args={})=>invokeNativeControl(s,{view,operation,args});
import{createHistoryTool}from'../src/dialog/history-tool.mjs';
import{executeHistoryRequest}from'../src/dialog/history-execution.mjs';
import{routeNewEngine}from'../src/dialog/reader-routing.mjs';
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

test('an authored history request dispatches exactly its compiled call and rejects a stale head', async () => {
 const events=[],state={'art.draw':initialDrawingState(),'ui.shell':{activeTab:'draw'}};
 const session={isession:{state},engine:{onWorldActivity:event=>events.push(event)}};
 await run(session,'draw','drawing.object.make',{kind:'circle'});
 const authored=direction=>'@source std.request.source text="Restore journal entry"\n@request std.request act='+direction+' mood=do source=$source';
 const before=structuredClone(state['art.draw']);
 const erased=await routeNewEngine(session,authored('undo'));
 assert.deepEqual(erased.statuses,['supported']);
 assert.match(erased.trace.compiledSop,/std\.compile\.result status=compiled/);
 assert.match(erased.trace.compiledSop,/std\.compile\.evidence.*support="history\.live\.undo"/);
 assert.match(erased.trace.controlIntent,/app\.history\.restore action=restore-history order=1/);
 assert.match(erased.trace.receipt.sop,/app\.history\.result status=changed verification=verified/);
 assert.equal(toNativeDrawingState(state['art.draw']).objects.length,0);
 const activity=events.filter(event=>event.operation==='app.history.restore');
 assert.equal(activity[0].sop,erased.trace.controlIntent);
 assert.equal(activity[1].result.sop,erased.trace.receipt.sop);
 assert.equal(session.newEngineUndo.length,0);
 assert.equal(session.newEngineRedo.length,1);

 // A forwarded UI control restores that same entry. Its previous Undo call must remain stale.
 const redo=await run(session,'draw','ui.history.redo');
 assert.equal(redo.receipt.verification,'verified');
 assert.deepEqual(state['art.draw'],before);
 const host=createHistoryTool(session,'draw');
 const prior=host.invoke(erased.trace.controlIntent,toolInvocationContext('retry',erased.trace.receipt.beforeVersion));
 assert.equal(prior.reason,'stale-history-head');
 assert.deepEqual(state['art.draw'],before);
 assert.equal(session.newEngineUndo.length,1);
 assert.equal(session.newEngineRedo.length,0);

 const incomplete=await executeHistoryRequest(session,{request:'request',wires:authored('undo')+'\n@target std.request.target request=$request mode=existing kind=unrelated'},'draw');
 assert.equal(incomplete.trace.reason,'incomplete-coverage');
 assert.deepEqual(state['art.draw'],before);
});
