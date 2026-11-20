import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyCalendarArea,calendarAreaStateWorld} from '../worlds/time.calendar/sop-calendar.mjs';
import {str as sopText} from '../src/vendor/sopworld/sopworld.mjs';
const calendarThings=(state,kind)=>calendarAreaStateWorld(state).ofType('w.meetings.'+kind).map(fact=>Object.fromEntries(Object.entries(fact.attrs).map(([key,values])=>[key,values.length===1?(values[0].startsWith('"')?sopText(values[0]):values[0]):values])));
import {emptyDocumentArea} from '../worlds/docs.editor/sop-document.mjs';
import {documentOf,documentBlocks} from './document-state.mjs';
import {emptyAvatarState,avatarAreaStateWorld} from '../worlds/ui.avatar/sop-avatar.mjs';
const session=(world,state)=>({isession:{state:{[world]:state}},engine:{loader:{readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8')}}});
const run=(s,view,operation,args={})=>performGesture(s,{view,operation,args});
test('Calendar clear deletes exact events, retains its calendar, and the shared journal undo restores events',async()=>{
 const s=session('time.calendar',emptyCalendarArea()),state=()=>s.isession.state['time.calendar'];
 await run(s,'calendar','calendar.event.add',{id:'first',title:'First',start:1000,duration:100});await run(s,'calendar','calendar.event.add',{id:'second',title:'Second',start:2000,duration:100});
 const before=state().sop,r=await run(s,'calendar','calendar.events.remove',{ids:['first','second']});assert.equal(r.ok,true);
 assert.equal(calendarThings(state(),'meeting').length,0);assert.equal(calendarThings(state(),'calendar').length,1);
 assert.equal((await run(s,'calendar','undo')).ok,true);assert.equal(state().sop,before);
 await run(s,'calendar','calendar.events.remove',{ids:['first','second']});assert.equal((await run(s,'calendar','calendar.events.remove',{ids:[]})).changed,false);
});
test('Documents clear retains document identity/title and is undoable; section deletion includes nested subchapters',async()=>{
 const s=session('docs.editor',emptyDocumentArea()),state=()=>s.isession.state['docs.editor'];await run(s,'editor','document.write',{title:'Keep title',blocks:[{kind:'heading',level:1,text:'Chapter'},{kind:'paragraph',text:'Body'},{kind:'heading',level:2,text:'Subchapter'},{kind:'paragraph',text:'Sub body'},{kind:'heading',level:1,text:'Next'}]});
 const before=state().sop,id=documentOf(state()).code,blocks=documentBlocks(state()).map(b=>b.id);
 assert.equal((await run(s,'editor','document.block.remove',{ids:blocks})).ok,true);assert.equal(documentBlocks(state()).length,0);assert.equal(documentOf(state()).code,id);assert.equal(documentOf(state()).title,'Keep title');
 assert.equal((await run(s,'editor','document.block.remove',{ids:[]})).changed,false);assert.equal((await run(s,'editor','document.undo')).ok,true);assert.equal(state().sop,before);
 assert.equal((await run(s,'editor','document.section.remove',{ids:[blocks[0]]})).ok,true);assert.deepEqual(documentBlocks(state()).map(b=>b.text),['Next']);
 assert.equal((await run(s,'editor','undo')).ok,true);assert.equal(state().sop,before);
});
test('Avatar concrete deletion permits required parts, clear is empty/undoable and a preset recomposes',async()=>{
 const s=session('ui.avatar',emptyAvatarState()),state=()=>s.isession.state['ui.avatar'];
 // The parts of the person the Avatar shows (its face and its body are faces; the rest are parts).
 const parts=()=>[...avatarAreaStateWorld(state()).wires.values()].filter(w=>w.type!=='w.face.face').length;
 assert.equal((await run(s,'avatar','avatar.face.select')).ok,true);
 const before=state().sop;assert.ok(parts()>5);
 assert.equal((await run(s,'avatar','avatar.parts.remove',{ids:['head']})).ok,true);assert.ok(!/ w\.face\.head /.test(state().sop));
 {const u=await run(s,'avatar','avatar.undo');assert.equal(u.ok,true,JSON.stringify(u).slice(0,600));}assert.equal(state().sop,before);
 const ids=[...avatarAreaStateWorld(state()).wires.values()].filter(w=>w.type!=='w.face.face').map(w=>w.type.slice('w.face.'.length));
 assert.equal((await run(s,'avatar','avatar.clear',{ids})).ok,true);assert.equal(parts(),0);
 assert.equal((await run(s,'avatar','avatar.clear',{ids:[]})).changed,false);assert.equal((await run(s,'avatar','undo')).ok,true);assert.equal(state().sop,before);
 await run(s,'avatar','avatar.clear',{ids});assert.equal((await run(s,'avatar','avatar.face.preset',{preset:'robot'})).ok,true);assert.ok(parts()>3);
});
