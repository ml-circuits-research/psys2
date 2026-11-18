import {toNativeAvatarState,canonicalAvatarState} from '../worlds/ui.avatar/canonical-state.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
import {initialCalendarState,toNativeCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {initialCanonicalDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {toNativeDocumentState} from '../worlds/docs.editor/canonical-state.mjs';
import {DEFAULT_FACE} from '../worlds/ui.avatar/default-face.mjs';
import {variantFor} from '../worlds/ui.avatar/facedraw.mjs';
import {initialAvatarState,createAvatarHost} from '../worlds/ui.avatar/declared-host.mjs';
const session=(world,state)=>({isession:{state:{[world]:state}},engine:{loader:{readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8')}}});
const run=(s,view,operation,args={})=>invokeNativeControl(s,{view,operation,args});
test('Calendar clear deletes exact events, retains its resource, and actual shared undo restores events',async()=>{
 const s=session('time.calendar',initialCalendarState());
 await run(s,'calendar','calendar.event.add',{id:'first',title:'First',start:1000,duration:100});await run(s,'calendar','calendar.event.add',{id:'second',title:'Second',start:2000,duration:100});
 const before=structuredClone(s.isession.state['time.calendar']),r=await run(s,'calendar','calendar.events.remove',{ids:['first','second']});assert.equal(r.ok,true);assert.equal(toNativeCalendarState(s.isession.state['time.calendar']).meetings.length,0);assert.deepEqual(toNativeCalendarState(s.isession.state['time.calendar']).calendars,toNativeCalendarState(before).calendars);assert.deepEqual(Object.keys(s.isession.state['time.calendar']),['sop']);
 assert.equal((await run(s,'calendar','undo')).ok,true);assert.deepEqual(s.isession.state['time.calendar'],before);
 await run(s,'calendar','calendar.events.remove',{ids:['first','second']});assert.equal((await run(s,'calendar','calendar.events.remove',{ids:[]})).changed,false);
});
test('Documents clear retains document identity/title and is undoable; section deletion includes nested subchapters',async()=>{
 const s=session('docs.editor',initialCanonicalDocumentState()),project=()=>toNativeDocumentState(s.isession.state['docs.editor']);await run(s,'editor','document.write',{title:'Keep title',blocks:[{kind:'heading',level:1,text:'Chapter'},{kind:'paragraph',text:'Body'},{kind:'heading',level:2,text:'Subchapter'},{kind:'paragraph',text:'Sub body'},{kind:'heading',level:1,text:'Next'}]});
 const before=structuredClone(s.isession.state['docs.editor']),id=project().textId,blocks=project().blocks.map(b=>b.id);
 assert.equal((await run(s,'editor','document.block.remove',{ids:blocks})).ok,true);assert.equal(project().blocks.length,0);assert.equal(project().textId,id);assert.equal(project().title,'Keep title');
 assert.equal((await run(s,'editor','document.block.remove',{ids:[]})).changed,false);assert.equal((await run(s,'editor','document.undo')).ok,true);assert.deepEqual(s.isession.state['docs.editor'],before);
 assert.equal((await run(s,'editor','document.section.remove',{ids:[blocks[0]]})).ok,true);assert.deepEqual(project().blocks.map(b=>b.text),['Next']);
 assert.equal((await run(s,'editor','undo')).ok,true);assert.deepEqual(s.isession.state['docs.editor'],before);
});
test('Avatar concrete deletion permits required parts, clear is empty/undoable and exact base recomposes',async()=>{
 const s=session('ui.avatar',canonicalAvatarState(initialAvatarState())),state=()=>s.isession.state['ui.avatar'];
 const before=structuredClone(state());assert.equal((await run(s,'avatar','avatar.parts.remove',{ids:['head']})).ok,true);assert.equal(toNativeAvatarState(state()).face.slots.head,'none');assert.equal((await run(s,'avatar','avatar.undo')).ok,true);assert.deepEqual(state(),before);
 const ids=createAvatarHost({state:state(),instanceId:'visible'}).observe().objects.filter(o=>o.sourceType==='ui.avatar.part').map(o=>o.id);
 assert.equal((await run(s,'avatar','avatar.clear',{ids})).ok,true);assert.ok(Object.values(toNativeAvatarState(state()).face.slots).every(value=>value==='none'));
 assert.equal((await run(s,'avatar','avatar.clear',{ids:[]})).changed,false);assert.equal((await run(s,'avatar','undo')).ok,true);assert.deepEqual(state(),before);
 await run(s,'avatar','avatar.clear',{ids});assert.equal((await run(s,'avatar','avatar.face.preset',{preset:toNativeAvatarState(state()).face.base})).ok,true);assert.ok(Object.values(toNativeAvatarState(state()).face.slots).some(value=>value!=='none'));
});

test('transient blink/talk overlays cannot introduce parts into a cleared avatar',()=>{
 const state=initialAvatarState(),h=createAvatarHost({state,instanceId:'no-ghosts'}),ids=h.observe().objects.filter(o=>o.sourceType==='ui.avatar.part').map(o=>o.id);
 h.invoke({invocation:'clear',expectedVersion:h.observe().version,operation:'avatar.clear',args:{ids}});
 assert.equal(variantFor(DEFAULT_FACE,toNativeAvatarState(state).face,'eyes','left',{eyes:'closed'}),null);assert.equal(variantFor(DEFAULT_FACE,toNativeAvatarState(state).face,'mouth','left',{mouth:'talking'}),null);
 const expressive=h.invoke({invocation:'expression',expectedVersion:h.observe().version,operation:'avatar.face.expression',args:{expression:'happy'}});assert.equal(expressive.status,'changed');
 assert.equal(variantFor(DEFAULT_FACE,toNativeAvatarState(state).face,'eyebrows').name,toNativeAvatarState(state).face.expressionParts.eyebrows);
});
