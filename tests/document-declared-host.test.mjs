import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
const call=(h,operation,args,invocation)=>h.invoke({operation,args,invocation,expectedVersion:h.observe().version});
const blocks=[{kind:'heading',text:'First',level:2},{kind:'paragraph',text:'First body.'},{kind:'heading',text:'Second',level:2},{kind:'paragraph',text:'Second body.'}];
test('Document writes supplied content, edits blocks, reorders/removes complete sections and restores history',()=>{
 const state=initialDocumentState(),h=createDocumentHost({state,instanceId:'document.one'});const made=call(h,'document.write',{title:'Test',blocks,genre:'report',topic:'fixture'},'write');assert.equal(made.status,'changed',JSON.stringify(made));assert.equal(made.verification,'unverified');assert.equal(state.history.length,1);assert.ok(state.doc);assert.equal(made.after.objects.length,5);
 const sections=made.after.objects.filter(x=>x.kind==='section');assert.equal(sections[0].members.length,2);const ids=sections.map(x=>x.id);
 assert.equal(call(h,'document.section.reorder',{ids:ids.toReversed()},'reorder').status,'changed');assert.equal(state.blocks[0].text,'Second');
 assert.equal(call(h,'document.block.change',{id:state.blocks[1].id,text:'Updated body.'},'change').status,'changed');assert.equal(state.blocks[1].text,'Updated body.');
 assert.equal(call(h,'document.section.remove',{ids:[ids[1]]},'remove').status,'changed');assert.equal(state.blocks.length,2);assert.equal(state.blocks[0].text,'First');
 assert.equal(call(h,'document.undo',{},'undo').status,'changed');assert.equal(state.blocks.length,4);assert.equal(call(h,'document.remove',{},'clear').status,'changed');assert.equal(h.observe().objects.length,0);
});
test('Document does not fabricate composition or tone changes when knowledge providers are absent',()=>{
 const state=initialDocumentState(),h=createDocumentHost({state,instanceId:'document.two'}),before=JSON.stringify(state);
 assert.equal(call(h,'document.compose',{genre:'report',topic:'bears'},'compose').reason,'missing-knowledge-composer');assert.equal(call(h,'document.rewrite',{property:'tone',value:'formal'},'rewrite').reason,'missing-knowledge-rewriter');assert.equal(JSON.stringify(state),before);
 assert.equal(call(h,'document.write',{title:'Bad',blocks:[{kind:'paragraph',text:'x',operation:'execute'}]},'bad').status,'refused');assert.equal(JSON.stringify(state),before);
});
test('Document uses an explicitly supplied composition provider and preserves supplied sources without claiming genre verification',()=>{
 const composer={available:true,compose:args=>({composition:{title:args.topic,type:args.genre,chapters:[{title:'Facts',subchapters:[{title:null,sentences:[{text:'A source-backed sentence.',source:'fixture.fact'}]}]}]}})};
 const state=initialDocumentState(),h=createDocumentHost({state,instanceId:'document.three',composer});const result=call(h,'document.compose',{genre:'report',topic:'Fixture',words:40},'compose');assert.equal(result.status,'changed',JSON.stringify(result));assert.equal(result.verification,'unverified');assert.deepEqual(state.blocks.find(b=>b.kind==='paragraph').from,['fixture.fact']);
});
test('Document rewrite replaces actual content through the declared provider and is undoable',()=>{
 const state=initialDocumentState(),rewriter={rewrite:({blocks,property,value})=>blocks.map(b=>({kind:b.kind,text:property==='tone'?`${value}: ${b.text}`:b.text,from:b.from}))};const h=createDocumentHost({state,instanceId:'document.rewrite',rewriter});
 call(h,'document.write',{title:'Original',blocks:[{kind:'paragraph',text:'Original body.',from:['fact.one']}],genre:'report',topic:'topic'},'write');
 const result=call(h,'document.rewrite',{property:'tone',value:'formal'},'rewrite');assert.equal(result.status,'changed',JSON.stringify(result));assert.equal(result.verification,'unverified');assert.equal(state.blocks[0].text,'formal: Original body.');assert.deepEqual(state.blocks[0].from,['fact.one']);assert.equal(state.kind,'report');
 assert.equal(call(h,'document.undo',{},'undo').status,'changed');assert.equal(state.blocks[0].text,'Original body.');assert.equal(call(h,'document.redo',{},'redo').status,'changed');assert.equal(state.blocks[0].text,'formal: Original body.');
});
