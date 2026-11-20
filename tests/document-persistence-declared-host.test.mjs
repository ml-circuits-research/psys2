// The Documents SOP area's instance as a work file: the record is the w.document instance itself; a portable work
// file restores it exactly, the application's journal undoes a later edit, and bad content is refused before it
// replaces anything. (Replaces document-authority-declared-host.test.mjs, which tested the retired JS format.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {snapshotNativeInstances,restoreNativeInstances,observeNativeInstanceWorlds} from '../src/dialog/instance-persistence.mjs';
import {emptyDocumentArea,projectDocumentArea} from '../worlds/docs.editor/sop-document.mjs';
import {workFile,readWorkFile} from '../docs/webchat/ui/work-files.mjs';
import {createInstanceStore} from '../docs/webchat/ui/instance-store.mjs';
import {documentOf,documentBlocks,documentItems} from './document-state.mjs';

const world='docs.editor';
const session=(state)=>({engine:{},isession:{state:state?{[world]:state}:{}}});
const checked=async(s,operation,args={})=>{const outcome=await performGesture(s,{view:'editor',operation,args});assert.equal(outcome.ok,true,JSON.stringify(outcome.receipt??outcome).slice(0,400));return outcome;};

test('a portable work file restores the document exactly; the journal undoes a later edit',async()=>{
 const source=session(emptyDocumentArea());
 await checked(source,'document.write',{title:'Field report',genre:'report',topic:'Observations',blocks:[
  {kind:'heading',level:1,text:'Introduction'},{kind:'paragraph',text:'First line 😀\nSecond line "as written".',from:['record.a','record.b']}]});
 await checked(source,'document.list.make',{parent:'text2',style:'task',items:['Repeat','Repeat']});
 await checked(source,'document.list.change',{id:'b3',checked:[true,false]});
 await checked(source,'document.table.make',{parent:'text2',rows:[['Same','Same'],['Cell','Quoted "text"']],header:true});
 await checked(source,'document.block.mark',{id:'b4',at:'1:0',from:0,to:4,mark:'link',enabled:true,attrs:{href:'https://example.invalid/reference'}});
 await checked(source,'document.block.reorder',{ids:['b1','b4','b2','b3']});
 const before=structuredClone(source.isession.state[world]);
 assert.deepEqual(Object.keys(before),['sop','runtime']);
 assert.deepEqual(documentBlocks(before).map((b)=>b.id),['b1','b4','b2','b3']);
 assert.deepEqual(documentItems(before,'b3'),['Repeat','Repeat']);
 assert.equal(documentBlocks(before)[2].text,'First line 😀\nSecond line "as written".');
 const [record]=await snapshotNativeInstances(source,{worlds:[world]});
 const [observed]=await observeNativeInstanceWorlds(source,{worlds:[world]});
 assert.equal(observed.authoritative,true);assert.equal(observed.wires,record.wires);assert.equal(record.wires,before.sop);
 const store=createInstanceStore({persistent:false});
 await store.saveMany([record]);
 assert.equal(await store.exportWorld(world),record.wires);
 const saved=readWorkFile(JSON.stringify(workFile('fixture-build',await store.all())),'fixture-build');
 const restored=session();await restoreNativeInstances(restored,saved);
 assert.deepEqual(restored.isession.state[world].sop,before.sop);
 assert.equal(projectDocumentArea(restored.isession.state[world]).svg,projectDocumentArea(before).svg,'the same page');
 assert.deepEqual(await snapshotNativeInstances(restored,{worlds:[world]}),[record]);
 await checked(restored,'document.container.change',{id:JSON.stringify(['b4','1:0']),text:'Edited cell'});
 assert.notEqual(restored.isession.state[world].sop,before.sop);
 assert.ok((await performGesture(restored,{view:'editor',operation:'undo'})).ok);
 assert.equal(restored.isession.state[world].sop,before.sop);
});

test('bad content is refused before it replaces the document; content alone restores',async()=>{
 const source=session(emptyDocumentArea()),target=session(emptyDocumentArea());
 await checked(source,'document.write',{title:'Report',blocks:[{kind:'paragraph',text:'Text'}]});
 const [record]=await snapshotNativeInstances(source,{worlds:[world]}),initial=structuredClone(target.isession.state);
 for(const wires of [record.wires+'\n@foreign core.use world=std.request',record.wires.replace(/document=\$[^\s]+/,'document=$missing.document'),record.wires.replace(/form=paragraph/,'form=sonnet')]){
  assert.notEqual(wires,record.wires);
  await assert.rejects(restoreNativeInstances(target,[{...record,wires}]));
  assert.deepEqual(target.isession.state,initial);
 }
 await restoreNativeInstances(target,[{world,instanceId:record.instanceId,revision:record.revision,wires:record.wires}]);
 assert.equal(documentOf(target.isession.state[world]).title,'Report');
});
