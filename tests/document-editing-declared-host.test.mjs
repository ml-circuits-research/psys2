import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {invokeToolCommand,describeNativeControl,verifyNativeControlEffect} from '../src/dialog/native-control-intent.mjs';
import {documentTextId} from '../worlds/docs.editor/native-editing.mjs';
const call=(h,operation,args)=>invokeToolCommand(h,{invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
function setup(){const state=initialDocumentState(),host=createDocumentHost({state,instanceId:'editor'});call(host,'document.write',{title:'Notes',blocks:[{kind:'paragraph',text:'Hello world'}]});return {state,host,id:state.blocks[0].id};}
test('literal native text, labels, title and alignment update the actual document model and preserve marks on unchanged text',()=>{
 const {state,host,id}=setup();
 assert.equal(call(host,'document.title.change',{id:state.textId,title:'Meeting notes'}).status,'changed');
 assert.equal(call(host,'document.block.mark',{id,at:'0',from:0,to:5,mark:'bold',enabled:true}).status,'changed');
 assert.equal(call(host,'document.block.change',{id,text:'Hello world!',name:'Introduction',align:'center'}).status,'changed');
 assert.equal(state.title,'Meeting notes');assert.equal(state.blocks[0].name,'Introduction');assert.equal(state.blocks[0].align,'center');
 assert.deepEqual(state.blocks[0].marks,[{at:'0',from:0,to:5,type:'bold'}]);
 assert.equal(state.doc.content[1].content[0].marks[0].type,'bold');
 const observed=host.observe().objects.find(o=>o.id===id);assert.equal(observed.inputs.find(i=>i.key==='index').values[0],'0');assert.equal(observed.inputs.find(i=>i.key==='align').values[0],'"center"');
});
test('native selection and mark ranges are validated, observable and undoable without a parser',()=>{
 const {state,host,id}=setup();
 assert.equal(call(host,'document.block.select',{id,from:0,to:5}).status,'changed');assert.deepEqual(state.selection,{type:'range',block:id,at:'0',from:0,to:5});
 assert.equal(host.observe().objects.find(o=>o.id===id).inputs.find(i=>i.key==='selectionTo').values[0],'5');
 assert.equal(call(host,'document.block.mark',{id,from:0,to:5,mark:'italic',enabled:true}).status,'changed');
 const before=structuredClone(state);
 for(const args of [{id,from:0,to:100,mark:'bold',enabled:true},{id,from:3,to:1,mark:'bold',enabled:true},{id,from:0,to:5,mark:'link',enabled:true,attrs:{href:'javascript:bad'}}]){assert.equal(call(host,'document.block.mark',args).status,'refused');assert.deepEqual(state,before);}
 assert.equal(call(host,'document.block.mark',{id,from:0,to:5,mark:'italic',enabled:false}).status,'changed');assert.equal(state.blocks[0].marks?.length??0,0);
 assert.equal(call(host,'document.undo',{}).status,'changed');assert.equal(state.blocks[0].marks[0].type,'italic');
});
test('full block reorder preserves exact ids and rejects incomplete, duplicate and foreign orders atomically',()=>{
 const {state,host,id}=setup();
 call(host,'document.block.make',{parent:state.textId,kind:'quote',text:'Second'});call(host,'document.section.make',{parent:state.textId,text:'Third'});
 const ids=state.blocks.map(b=>b.id),reversed=ids.toReversed();
 assert.equal(call(host,'document.block.reorder',{ids:reversed}).status,'changed');assert.deepEqual(state.blocks.map(b=>b.id),reversed);
 const before=structuredClone(state);for(const bad of [[id],[id,id,id],['missing',...ids.slice(1)]]){assert.equal(call(host,'document.block.reorder',{ids:bad}).status,'refused');assert.deepEqual(state,before);}
 assert.equal(call(host,'document.undo',{}).status,'changed');assert.deepEqual(state.blocks.map(b=>b.id),ids);
});
test('lists, task states and rectangular tables are real literal blocks with editable text containers',()=>{
 const {state,host}=setup();
 const list=call(host,'document.list.make',{parent:state.textId,style:'task',items:['One','Two'],name:'Tasks'}).changed[0];
 assert.equal(call(host,'document.list.change',{id:list,checked:[true,false]}).status,'changed');
 assert.equal(call(host,'document.container.change',{id:documentTextId(list,'1'),text:'Second task'}).status,'changed');
 assert.equal(state.blocks.find(b=>b.id===list).items[1],'Second task');assert.equal(state.blocks.find(b=>b.id===list).checked[0],true);
 const table=call(host,'document.table.make',{parent:state.textId,rows:[['Name','Value'],['A','2']],header:true,name:'Values'}).changed[0];
 assert.equal(call(host,'document.container.change',{id:documentTextId(table,'1:1'),text:'3'}).status,'changed');assert.equal(state.blocks.find(b=>b.id===table).rows[1][1],'3');
 const before=structuredClone(state);assert.equal(call(host,'document.table.change',{id:table,rows:[['A','B'],['only one']]}).status,'refused');assert.deepEqual(state,before);
 assert.ok(state.doc.content.some(node=>node.type==='taskList'));assert.ok(state.doc.content.some(node=>node.type==='table'));
});
test('section editing retains section identity and non-heading level requests refuse',()=>{
 const {state,host,id}=setup();const section=call(host,'document.section.make',{parent:state.textId,text:'Heading'}).changed[0];
 assert.equal(call(host,'document.section.change',{id:section,text:'New heading',name:'Chapter one',level:1}).status,'changed');
 assert.equal(host.observe().objects.find(o=>o.id===section).sourceType,'docs.editor.section');
 const before=structuredClone(state);assert.equal(call(host,'document.block.change',{id,level:3}).status,'refused');assert.deepEqual(state,before);
});

test('literal table cell edit has exact observed identity and verifiable native UI intent',()=>{
 const {state,host}=setup(),table=call(host,'document.table.make',{parent:state.textId,rows:[['A','B']],header:false}).changed[0];
 const before=host.observe(),operation=host.bindings().find(o=>o.id==='document.container.change'),args={id:documentTextId(table,'0:1'),text:'User value'};
 const intent=describeNativeControl({operation,args,before}),receipt=call(host,operation.id,args),after=host.observe();
 const verification=verifyNativeControlEffect({intent,before,after,receipt});
 assert.equal(verification.status,'verified');assert.equal(state.blocks.find(b=>b.id===table).rows[0][1],'User value');
 assert.deepEqual(intent.expected.providedArgs,args);
});

test('chapters and subchapters use real heading levels and exact insertion references',()=>{
 const {state,host}=setup();const first=call(host,'document.section.make',{parent:state.textId,text:'Chapter one',level:1}).changed[0],second=call(host,'document.section.make',{parent:state.textId,text:'Chapter two',level:1}).changed[0];
 const sub=call(host,'document.section.make',{parent:state.textId,text:'A subchapter',level:2,after:first}).changed[0];
 assert.deepEqual(state.blocks.filter(b=>b.kind==='heading').map(b=>[b.id,b.level]),[[first,1],[sub,2],[second,1]]);
 const before=structuredClone(state);assert.equal(call(host,'document.section.make',{parent:state.textId,text:'Lost',level:2,after:'missing'}).status,'refused');assert.deepEqual(state,before);
});

test('subchapters insert at an exact observed block before a later chapter without moving content',()=>{
 const {state,host}=setup(),parent=state.textId;
 const first=call(host,'document.section.make',{parent,text:'Chapter one',level:1}).changed[0];
 const body=call(host,'document.block.make',{parent,kind:'paragraph',text:'Keep first chapter body'}).changed[0];
 const second=call(host,'document.section.make',{parent,text:'Chapter two',level:1}).changed[0];
 const sub=call(host,'document.section.make',{parent,text:'Subchapter',level:2,after:body}).changed[0];
 assert.deepEqual(state.blocks.slice(1).map(b=>b.id),[first,body,sub,second]);
 const before=structuredClone(state);assert.equal(call(host,'document.section.make',{parent,text:'Bad',level:2,after:'missing'}).status,'refused');assert.deepEqual(state,before);
});
