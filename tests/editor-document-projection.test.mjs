// The Documents tab reads its document from the docs.editor SOP area projection (documentOf in
// docs/webchat/ui/tabs/editor.mjs): blocks in order with their form, section-ness, level, alignment and name, list
// items with their checks, table cells, marks with their colour and link, and the container ids the tab edits by.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentArea,projectDocumentArea} from '../worlds/docs.editor/sop-document.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {documentOf} from '../docs/webchat/ui/tabs/editor.mjs';

test('documentOf reads blocks, items, cells, marks and selection from the projection',async()=>{
 const state={sop:'',runtime:{view:{}}},host=await createDocumentArea({state});let n=0;
 const ok=(operation,args)=>{const r=invokeToolCommand(host,{operation,args,invocation:'doc-'+(n++),expectedVersion:host.observe().version});assert.equal(r.status,'changed',operation+' '+(r.reason??''));};
 ok('document.title.change',{id:'text1',title:'Trip'});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Hello world.',name:'intro'});
 ok('document.section.make',{parent:'text1',text:'Day one',level:1});
 ok('document.list.make',{parent:'text1',style:'task',items:['a','b']});
 ok('document.table.make',{parent:'text1',rows:[['h1','h2'],['c1','c2']],header:true});
 ok('document.block.mark',{id:'b1',at:'0',from:0,to:5,mark:'highlight',enabled:true,attrs:{color:'#fff2a8'}});
 ok('document.block.mark',{id:'b1',at:'0',from:6,to:11,mark:'link',enabled:true,attrs:{href:'https://example.org'}});
 ok('document.list.change',{id:'b3',checked:[true,false]});
 ok('document.block.align',{id:'b1',align:'center'});
 ok('document.block.select',{id:'b4',at:'0',from:0,to:0});
 const doc=documentOf(projectDocumentArea(state));
 assert.equal(doc.textId,'text1');assert.equal(doc.title,'Trip');assert.equal(doc.selected,'b4');
 assert.deepEqual(doc.blocks.map((b)=>[b.id,b.kind,b.section]),[['b1','paragraph',false],['b2','heading',true],['b3','list',false],['b4','table',false]]);
 const [p,s,l,t]=doc.blocks;
 assert.deepEqual([p.text,p.name,p.align,p.containers['0']],['Hello world.','intro','center',JSON.stringify(['b1','0'])]);
 assert.deepEqual(p.marks.map((m)=>[m.type,m.from,m.to,m.attrs]).sort(),[['highlight',0,5,{color:'#fff2a8'}],['link',6,11,{href:'https://example.org'}]]);
 assert.deepEqual([s.text,s.level,s.parent],['Day one',1,'text1']);
 assert.deepEqual([l.items,l.checked,l.style,l.parent],[['a','b'],[true,false],'task','b2']);
 assert.deepEqual([t.rows,t.header],[[['h1','h2'],['c1','c2']],true]);
});
