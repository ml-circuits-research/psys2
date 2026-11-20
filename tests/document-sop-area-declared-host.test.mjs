// The Documents tab as a SOP area (worlds/docs.editor/area.sop): every native Documents operation compiles to
// std.acts calls on a w.document instance, or to an explicit refusal; the page is derived in SOP and drawn as it is.
// Every state here is made through the area's own commands.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentArea,projectDocumentArea,documentAreaStateWorld} from '../worlds/docs.editor/sop-document.mjs';
import {readNativeToolInterface} from '../worlds/native-tool-interface.mjs';
import NATIVE_INTERFACE from '../worlds/docs.editor/native-interface-source.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';

async function area(){
 const state={sop:'',runtime:{view:{}}},host=await createDocumentArea({state});let n=0;
 const run=(operation,args={})=>invokeToolCommand(host,{operation,args,invocation:'doc-'+(n++),expectedVersion:host.observe().version});
 const say=(operation,args)=>operation+' '+JSON.stringify(args);
 const ok=(operation,args)=>{const result=run(operation,args);assert.equal(result.status,'changed',say(operation,args)+' -> '+(result.reason??result.status));return result;};
 const refused=(operation,args,reason)=>{const result=run(operation,args);assert.equal(result.status,'refused',say(operation,args)+' -> '+result.status);assert.equal(result.reason,reason,say(operation,args));return result;};
 return {state,host,run,ok,refused,view:()=>projectDocumentArea(state)};
}
const value=(raw)=>raw===undefined?undefined:raw.startsWith('"')?JSON.parse(raw):raw==='true'||raw==='false'?raw==='true':/^-?\d+(\.\d+)?$/.test(raw)?Number(raw):raw;
/** The blocks of a state in document order: [{code, form, text, level, align, name, style, header}]. */
function blocks(state){
 return documentAreaStateWorld(state).ofType('w.document.block').map((fact)=>Object.fromEntries(Object.keys(fact.attrs).filter((k)=>!['kind','world','document'].includes(k)).map((k)=>[k,value(fact.attrs[k][0])])))
  .sort((a,b)=>a.n-b.n);
}
const codes=(state)=>blocks(state).map((b)=>b.code);
/** The items of a list block, in order: [{text, checked}]. */
function items(state,code){
 const world=documentAreaStateWorld(state),block=world.ofType('w.document.block').find((b)=>b.attrs.code[0]===code);
 return world.ofType('w.document.item').filter((i)=>i.attrs.block[0]==='$'+block.id).map((i)=>({n:value(i.attrs.n[0]),text:value(i.attrs.text?.[0]),checked:value(i.attrs.checked?.[0])})).sort((a,b)=>a.n-b.n).map(({text,checked})=>checked===undefined?{text}:{text,checked});
}
function cells(state,code){
 const world=documentAreaStateWorld(state),block=world.ofType('w.document.block').find((b)=>b.attrs.code[0]===code),rows=[];
 for(const c of world.ofType('w.document.cell').filter((c)=>c.attrs.block[0]==='$'+block.id))(rows[value(c.attrs.row[0])-1]??=[])[value(c.attrs.column[0])-1]=value(c.attrs.text?.[0]);
 return rows;
}
/** The marks of a state: [{block, form, from, to, href?, colour?, item?/cell?}] sorted. */
function marks(state){
 const world=documentAreaStateWorld(state),code=(ref)=>world.get(ref.slice(1))?.attrs.code[0];
 return world.ofType('w.document.mark').map((m)=>({block:code(m.attrs.block[0]),form:m.attrs.form[0],from:value(m.attrs.from[0]),to:value(m.attrs.to[0]),
  ...(m.attrs.href?{href:value(m.attrs.href[0])}:{}),...(m.attrs.colour?{colour:value(m.attrs.colour[0])}:{}),
  ...(m.attrs.item?{item:value(world.get(m.attrs.item[0].slice(1)).attrs.n[0])}:{}),...(m.attrs.cell?{cell:[value(world.get(m.attrs.cell[0].slice(1)).attrs.row[0]),value(world.get(m.attrs.cell[0].slice(1)).attrs.column[0])]}:{})}))
  .sort((a,b)=>a.block<b.block?-1:a.block>b.block?1:a.form<b.form?-1:a.form>b.form?1:a.from-b.from);
}
const objects=(host)=>Object.fromEntries(host.observe().objects.map((o)=>[o.id,o]));
const input=(object,key)=>{const found=object?.inputs.find((i)=>i.key===key);return found?.values.map((v)=>JSON.parse(v));};

test('the interface: 27 declared operations, each compiled by the area (a call, a view change, an explicit refusal or nothing)',async()=>{
 const operations=readNativeToolInterface(NATIVE_INTERFACE).realize().bindings.map((b)=>b.id);
 assert.equal(operations.length,27);
 const {host}=await area();
 assert.deepEqual(host.bindings().map((b)=>b.id).sort(),[...operations].sort());
});

test('a first state: one empty document, drawn as an untitled page and observed with no blocks',async()=>{
 const {state,host,view}=await area();
 assert.deepEqual(documentAreaStateWorld(state).ofType('w.document.document').map((d)=>d.attrs.code[0]),['text1']);
 const doc=objects(host).text1;assert.equal(doc.kind,'document');assert.deepEqual(input(doc,'title'),['']);assert.deepEqual(input(doc,'length'),[0]);
 assert.match(view().svg,/>Untitled document</);
});

test('document.title.change: the title changes in place; another document id is refused',async()=>{
 const {state,host,ok,refused,run,view}=await area();
 ok('document.title.change',{id:'text1',title:'Trip notes'});
 ok('document.title.change',{id:'text1',title:'Holiday notes'});
 assert.equal(documentAreaStateWorld(state).ofType('w.document.document').length,1,'changed, not added');
 assert.deepEqual(input(objects(host).text1,'title'),['Holiday notes']);
 assert.match(view().svg,/>Holiday notes</);
 assert.equal(run('document.title.change',{id:'text1',title:'Holiday notes'}).status,'unchanged');
 refused('document.title.change',{id:'text9',title:'x'},'missing-document');
});

test('document.block.make, document.section.make: blocks at the end, a section after a block, headings and levels',async()=>{
 const {state,host,ok,refused}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'First.'});
 ok('document.block.make',{parent:'text1',kind:'heading',text:'A heading'});
 ok('document.block.make',{parent:'text1',kind:'quote',text:'A quote.',name:'motto'});
 ok('document.section.make',{parent:'text1',text:'Chapter one',level:1});
 ok('document.section.make',{parent:'text1',text:'Early section',level:2,after:'b1'});
 assert.deepEqual(blocks(state).map(({code,form,text,level})=>level===undefined?[code,form,text]:[code,form,text,level]),
  [['b1','paragraph','First.'],['b5','heading','Early section',2],['b2','heading','A heading',3],['b3','quote','A quote.'],['b4','heading','Chapter one',1]]);
 assert.equal(blocks(state).find((b)=>b.code==='b3').name,'motto');
 assert.equal(host.observe().objects.length>0,true);
 assert.equal(state.runtime.view.selected,'b5','a new block is selected');
 refused('document.block.make',{parent:'text9',kind:'paragraph'},'missing-parent-document');
 refused('document.block.make',{parent:'text1',kind:'paragraph',level:3},'unexpected-heading-level');
 refused('document.section.make',{parent:'text1',text:'x',after:'b99'},'missing-insertion-reference');
});

test('observation: sections hold their blocks (in, role), containers sit under their blocks, indexes follow the order',async()=>{
 const {host,ok}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Before any section.'});
 ok('document.section.make',{parent:'text1',text:'Chapter',level:1});
 ok('document.section.make',{parent:'text1',text:'Section',level:2});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Inside the section.'});
 const o=objects(host);
 assert.deepEqual(['b1','b2','b3','b4'].map((id)=>[o[id].kind,o[id].sourceType,o[id].in,o[id].role,input(o[id],'index')[0]]),
  [['paragraph','docs.editor.block','text1','member',0],['section','docs.editor.section','text1','member',1],['section','docs.editor.section','b2','member',2],['paragraph','docs.editor.block','b3','member',3]]);
 const text=o[JSON.stringify(['b4','0'])];
 assert.equal(text.kind,'text');assert.equal(text.sourceType,'docs.editor.text');assert.equal(text.in,'b4');assert.deepEqual(input(text,'text'),['Inside the section.']);
 assert.deepEqual(input(o.b2,'level'),[1]);assert.deepEqual(input(o.b4,'text'),['Inside the section.']);
 assert.deepEqual(input(o.text1,'length'),[8],'words: chapter, section, and the two paragraphs');
});

test('document.block.change and document.section.change: text, name, kind, level, alignment; plain-text and level rules',async()=>{
 const {state,ok,refused,run}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Some text.'});
 ok('document.list.make',{parent:'text1',style:'bullet',items:['a']});
 ok('document.block.change',{id:'b1',text:'Other text.',name:'intro',align:'center'});
 assert.deepEqual(blocks(state)[0],{code:'b1',n:1,form:'paragraph',text:'Other text.',name:'intro',align:'center'});
 ok('document.block.change',{id:'b1',kind:'heading'});
 assert.equal(blocks(state)[0].level,2,'a paragraph made a heading with no level is a section');
 ok('document.block.change',{id:'b1',level:4});
 assert.equal(blocks(state)[0].level,4);
 ok('document.section.change',{id:'b1',level:1,text:'Chapter'});
 assert.deepEqual([blocks(state)[0].level,blocks(state)[0].text],[1,'Chapter']);
 refused('document.block.change',{id:'b1',kind:'quote',level:3},'unexpected-heading-level');
 ok('document.block.change',{id:'b1',kind:'quote'});
 refused('document.block.change',{id:'b1',level:3},'unexpected-heading-level');
 refused('document.block.change',{id:'b2',text:'x'},'not-a-plain-text-block');
 refused('document.block.change',{id:'b9',name:'x'},'missing-target');
 assert.equal(run('document.block.change',{id:'b2',name:'groceries'}).status,'changed','a list takes a name');
});

test('document.block.align and document.section.align',async()=>{
 const {state,ok,refused}=await area();
 ok('document.section.make',{parent:'text1',text:'Head',level:1});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Body'});
 ok('document.block.align',{id:'b2',align:'right'});
 ok('document.section.align',{id:'b1',align:'center'});
 assert.deepEqual(blocks(state).map((b)=>b.align),['center','right']);
 refused('document.block.align',{id:'b7',align:'left'},'missing-target');
});

test('document.block.select and document.section.select: the selected block and a range of its text',async()=>{
 const {state,host,ok,refused,run}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Hello world'});
 ok('document.table.make',{parent:'text1',rows:[['a','b'],['c','d']]});
 run('document.block.select',{id:'b1',at:'0',from:6,to:11});
 assert.deepEqual(state.runtime.view,{selected:'b1',from:'6',to:'11',at:'0'});
 const b1=objects(host).b1;assert.deepEqual([input(b1,'selected'),input(b1,'selectionFrom'),input(b1,'selectionTo'),input(b1,'selectionAt')],[[true],[6],[11],['0']]);
 run('document.section.select',{id:'b1',from:0,to:0});
 assert.deepEqual(state.runtime.view,{selected:'b1',from:null,to:null,at:null},'a block selection clears the range');
 run('document.block.select',{id:'b2',at:'1:0',from:0,to:1});
 assert.deepEqual(state.runtime.view,{selected:'b2',from:'0',to:'1',at:'1:0'},'a cell of a table');
 run('document.block.select',{id:'b2',from:0,to:0});
 assert.equal(state.runtime.view.selected,'b2','a table is selected as a block');
 refused('document.block.select',{id:'b1',from:3,to:40},'invalid-text-range');
 refused('document.block.select',{id:'b1',from:5,to:2},'invalid-text-range');
 refused('document.block.select',{id:'b8',from:0,to:0},'invalid-text-range');
});

test('document.block.mark and document.section.mark: marks join, cut and keep what they say; links and highlights are checked',async()=>{
 const {state,ok,refused,view}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'The quick brown fox jumps over the lazy dog'});
 ok('document.block.mark',{id:'b1',from:4,to:9,mark:'bold',enabled:true});
 ok('document.block.mark',{id:'b1',from:9,to:15,mark:'bold',enabled:true});
 assert.deepEqual(marks(state),[{block:'b1',form:'bold',from:4,to:15}],'touching bold marks are one');
 ok('document.block.mark',{id:'b1',from:6,to:12,mark:'bold',enabled:false});
 assert.deepEqual(marks(state),[{block:'b1',form:'bold',from:4,to:6},{block:'b1',form:'bold',from:12,to:15}],'a bold range cut in two');
 ok('document.section.mark',{id:'b1',from:16,to:19,mark:'italic',enabled:true});
 assert.match(view().svg,/font-weight="600"[^>]*>qu</);
 assert.match(view().svg,/font-style="italic"[^>]*>fox</);
 ok('document.block.mark',{id:'b1',from:20,to:25,mark:'highlight',enabled:true,attrs:{color:'#fff2a8'}});
 ok('document.block.mark',{id:'b1',from:22,to:30,mark:'highlight',enabled:true,attrs:{color:'#a8f0ff'}});
 assert.deepEqual(marks(state).filter((m)=>m.form==='highlight'),[{block:'b1',form:'highlight',from:20,to:22,colour:'#fff2a8'},{block:'b1',form:'highlight',from:22,to:30,colour:'#a8f0ff'}],'a highlight of another colour replaces the old one where they meet');
 ok('document.block.mark',{id:'b1',from:35,to:39,mark:'link',enabled:true,attrs:{href:'https://example.org'}});
 ok('document.block.mark',{id:'b1',from:0,to:3,mark:'underline',enabled:true});
 ok('document.block.mark',{id:'b1',from:31,to:34,mark:'strike',enabled:true});
 ok('document.block.mark',{id:'b1',from:40,to:43,mark:'code',enabled:true});
 const svg=view().svg;
 assert.match(svg,/fill="#a8f0ff"/,'a highlight is drawn behind its characters');
 assert.match(svg,/fill="#1d5fbf"[^>]*>lazy</,'a link is drawn in its colour');
 assert.equal((svg.match(/<polyline /g)??[]).length,3,'lines under the link and the underline, through the strike');
 ok('document.block.mark',{id:'b1',from:21,to:24,mark:'highlight',enabled:false});
 assert.deepEqual(marks(state).filter((m)=>m.form==='highlight'),[{block:'b1',form:'highlight',from:20,to:21,colour:'#fff2a8'},{block:'b1',form:'highlight',from:24,to:30,colour:'#a8f0ff'}],'a cut piece keeps its colour');
 refused('document.block.mark',{id:'b1',from:0,to:3,mark:'link',enabled:true},'invalid-link');
 refused('document.block.mark',{id:'b1',from:0,to:3,mark:'link',enabled:true,attrs:{href:'javascript:alert(1)'}},'invalid-link');
 refused('document.block.mark',{id:'b1',from:0,to:3,mark:'highlight',enabled:true},'invalid-highlight');
 refused('document.block.mark',{id:'b1',from:0,to:3,mark:'bold',enabled:true,attrs:{size:3}},'unknown-mark-attribute');
 refused('document.block.mark',{id:'b1',from:3,to:3,mark:'bold',enabled:true},'invalid-text-range');
 refused('document.block.mark',{id:'b1',from:0,to:99,mark:'bold',enabled:true},'invalid-text-range');
});

test('marks in list items and table cells; a changed text moves its marks',async()=>{
 const {state,ok,refused}=await area();
 ok('document.list.make',{parent:'text1',style:'bullet',items:['milk and honey','eggs']});
 ok('document.block.mark',{id:'b1',at:'0',from:9,to:14,mark:'bold',enabled:true});
 ok('document.table.make',{parent:'text1',rows:[['name','price'],['bread','2']]});
 ok('document.block.mark',{id:'b2',at:'1:0',from:0,to:5,mark:'italic',enabled:true});
 assert.deepEqual(marks(state),[{block:'b1',form:'bold',from:9,to:14,item:1},{block:'b2',form:'italic',from:0,to:5,cell:[2,1]}]);
 refused('document.block.mark',{id:'b1',at:'5',from:0,to:1,mark:'bold',enabled:true},'invalid-text-range');
 // A paragraph's text changes: marks before stay, after move, over the change grow, inside it go.
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'one two three four five'});
 for(const [from,to] of [[0,3],[8,13],[14,18],[4,23]])ok('document.block.mark',{id:'b3',from,to,mark:'bold',enabled:true});
 ok('document.block.mark',{id:'b3',from:4,to:7,mark:'italic',enabled:true});
 const before=marks(state).filter((m)=>m.block==='b3');
 assert.deepEqual(before.map((m)=>[m.form,m.from,m.to]),[['bold',0,3],['bold',4,23],['italic',4,7]],'bold ranges that touch the new one join it');
 ok('document.block.change',{id:'b3',text:'one 2 three four five'});
 assert.deepEqual(marks(state).filter((m)=>m.block==='b3').map((m)=>[m.form,m.from,m.to]),[['bold',0,3],['bold',4,21],['italic',4,5]],'one changed word: a mark before stays, marks over it shrink');
 ok('document.container.change',{id:JSON.stringify(['b3','0']),text:'zero one 2 three four five'});
 assert.deepEqual(marks(state).filter((m)=>m.block==='b3').map((m)=>[m.form,m.from,m.to]),[['bold',5,8],['bold',9,26],['italic',9,10]],'text put before the marks moves them');
 ok('document.list.change',{id:'b1',items:['milk','eggs']});
 assert.deepEqual(marks(state).filter((m)=>m.block==='b1'),[],'a mark past the end of a shorter item goes');
});

test('document.container.change: a block text, a list item, a table cell by their ids; the title is not a container',async()=>{
 const {state,ok,refused,run}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Old'});
 ok('document.list.make',{parent:'text1',style:'numbered',items:['one','two']});
 ok('document.table.make',{parent:'text1',rows:[['a','b'],['c','d']]});
 ok('document.container.change',{id:JSON.stringify(['b1','0']),text:'New'});
 ok('document.container.change',{id:JSON.stringify(['b2','1']),text:'second'});
 ok('document.container.change',{id:JSON.stringify(['b3','1:1']),text:'D'});
 assert.equal(blocks(state)[0].text,'New');
 assert.deepEqual(items(state,'b2'),[{text:'one'},{text:'second'}]);
 assert.deepEqual(cells(state,'b3'),[['a','b'],['c','D']]);
 assert.equal(run('document.container.change',{id:JSON.stringify(['b1','0']),text:'New'}).status,'unchanged');
 refused('document.container.change',{id:JSON.stringify(['b9','0']),text:'x'},'missing-text-container');
 refused('document.container.change',{id:JSON.stringify(['text1','title']),text:'x'},'missing-text-container');
});

test('document.list.make and document.list.change: items in order, styles, task checks, replacing (not adding to) the items',async()=>{
 const {state,host,ok,refused,view}=await area();
 ok('document.list.make',{parent:'text1',style:'task',items:['wash','dry','fold'],name:'chores'});
 assert.deepEqual(items(state,'b1'),[{text:'wash',checked:false},{text:'dry',checked:false},{text:'fold',checked:false}]);
 assert.equal(blocks(state)[0].name,'chores');
 ok('document.list.change',{id:'b1',checked:[true,false,true]});
 assert.deepEqual(items(state,'b1').map((i)=>i.checked),[true,false,true]);
 assert.match(view().svg,/>☑</);assert.match(view().svg,/>☐</);
 ok('document.list.change',{id:'b1',items:['wash','iron'],checked:[false,true]});
 assert.deepEqual(items(state,'b1'),[{text:'wash',checked:false},{text:'iron',checked:true}],'two places kept or changed, the third gone');
 ok('document.list.change',{id:'b1',items:['wash','iron','pack','go']});
 assert.equal(items(state,'b1').length,4);
 ok('document.list.change',{id:'b1',style:'numbered'});
 assert.equal(blocks(state)[0].style,'numbered');assert.match(view().svg,/>4\.</);
 const item=objects(host)[JSON.stringify(['b1','3'])];assert.equal(item.kind,'item');assert.equal(item.in,'b1');assert.deepEqual(input(item,'text'),['go']);
 refused('document.list.change',{id:'b1',checked:[true]},'invalid-list-content');
 refused('document.list.change',{id:'b9',style:'bullet'},'missing-list');
 refused('document.list.make',{parent:'text1',style:'bullet',items:[]},'invalid-literal-content');
 refused('document.list.make',{parent:'text7',style:'bullet',items:['a']},'missing-parent-document');
});

test('document.table.make and document.table.change: cells by row and column, a header row, even rows',async()=>{
 const {state,host,ok,refused,view}=await area();
 ok('document.table.make',{parent:'text1',rows:[['fruit','colour'],['apple','red'],['plum','purple']]});
 assert.deepEqual(cells(state,'b1'),[['fruit','colour'],['apple','red'],['plum','purple']]);
 assert.equal(blocks(state)[0].header,true);
 assert.match(view().svg,/fill="#eef1f6"/,'the header row is shaded');
 ok('document.table.change',{id:'b1',rows:[['fruit','colour'],['pear','green']],header:false});
 assert.deepEqual(cells(state,'b1'),[['fruit','colour'],['pear','green']],'cells changed and the third row gone');
 assert.equal(blocks(state)[0].header,false);
 const cell=objects(host)[JSON.stringify(['b1','1:0'])];assert.equal(cell.kind,'cell');assert.deepEqual([input(cell,'row'),input(cell,'column')],[[2],[1]]);
 refused('document.table.make',{parent:'text1',rows:[['a','b'],['c']]},'invalid-literal-content');
 refused('document.table.make',{parent:'text1',rows:[]},'invalid-literal-content');
 refused('document.table.change',{id:'b1',rows:[['a'],['b','c']]},'invalid-table-content');
 refused('document.table.change',{id:'b5',header:true},'missing-table');
});

test('document.block.reorder: every block once, in the new order',async()=>{
 const {state,ok,refused,run}=await area();
 for(const text of ['A','B','C'])ok('document.block.make',{parent:'text1',kind:'paragraph',text});
 ok('document.block.reorder',{ids:['b3','b1','b2']});
 assert.deepEqual(codes(state),['b3','b1','b2']);
 assert.equal(run('document.block.reorder',{ids:['b3','b1','b2']}).status,'unchanged');
 refused('document.block.reorder',{ids:['b3','b1']},'incomplete-block-order');
 refused('document.block.reorder',{ids:['b3','b3','b1']},'incomplete-block-order');
 refused('document.block.reorder',{ids:['b3','b1','b9']},'incomplete-block-order');
});

test('document.section.reorder: sections move with what they hold; what comes before the first section stays first',async()=>{
 const {state,ok,refused}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Preface'});
 ok('document.section.make',{parent:'text1',text:'One',level:1});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'one body'});
 ok('document.section.make',{parent:'text1',text:'Two',level:1});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'two body'});
 ok('document.list.make',{parent:'text1',style:'bullet',items:['x']});
 ok('document.section.reorder',{ids:['b4','b2']});
 assert.deepEqual(codes(state),['b1','b4','b5','b6','b2','b3']);
 refused('document.section.reorder',{ids:['b4']},'incomplete-section-order');
 refused('document.section.reorder',{ids:['b4','b3']},'incomplete-section-order');
});

test('document.block.remove and document.section.remove: blocks go; a section goes with what it holds',async()=>{
 const {state,ok,refused,run}=await area();
 ok('document.section.make',{parent:'text1',text:'Chapter A',level:1});
 ok('document.section.make',{parent:'text1',text:'Section A1',level:2});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'a1'});
 ok('document.block.make',{parent:'text1',kind:'heading',text:'Detail',level:3});
 ok('document.section.make',{parent:'text1',text:'Section A2',level:2});
 ok('document.list.make',{parent:'text1',style:'bullet',items:['a2']});
 ok('document.section.make',{parent:'text1',text:'Chapter B',level:1});
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'b'});
 ok('document.section.remove',{ids:['b2']});
 assert.deepEqual(codes(state),['b1','b5','b6','b7','b8'],'a section goes up to the next of its level');
 ok('document.section.remove',{ids:['b1']});
 assert.deepEqual(codes(state),['b7','b8'],'a chapter goes with its sections');
 assert.equal(documentAreaStateWorld(state).ofType('w.document.item').length,0,'with the items of its lists');
 refused('document.section.remove',{ids:['b8']},'missing-target');
 refused('document.section.remove',{ids:[]},'missing-target');
 ok('document.block.remove',{ids:['b8']});
 assert.deepEqual(codes(state),['b7']);
 assert.equal(run('document.block.remove',{ids:[]}).status,'unchanged');
 refused('document.block.remove',{ids:['b8']},'missing-target');
 refused('document.block.remove',{ids:['b7','b7']},'missing-target');
});

test('document.write: the old document goes, a new one is made from its blocks; invalid blocks are refused',async()=>{
 const {state,host,ok,refused}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'old'});
 ok('document.write',{title:'Penguins',genre:'essay',topic:'penguin',blocks:[{kind:'heading',text:'Birds that swim',level:1},{kind:'paragraph',text:'A penguin is a bird, but it cannot fly.',from:['k.animals.animal.penguin']},{kind:'quote',text:'So a bird is not always a flier.'}]});
 const world=documentAreaStateWorld(state);
 assert.deepEqual(world.ofType('w.document.document').map((d)=>[d.attrs.code[0],value(d.attrs.title[0]),d.attrs.genre[0],d.attrs.topic[0]]),[['text2','Penguins','essay','penguin']]);
 assert.deepEqual(blocks(state).map((b)=>[b.code,b.form,b.text]),[['b2','heading','Birds that swim'],['b3','paragraph','A penguin is a bird, but it cannot fly.'],['b4','quote','So a bird is not always a flier.']]);
 assert.equal(blocks(state)[1].source,'k.animals.animal.penguin');
 const doc=objects(host).text2;assert.deepEqual([input(doc,'genre'),input(doc,'topic'),input(doc,'length')],[['essay'],['penguin'],[21]],'words of the title and the blocks');
 ok('document.write',{title:'Empty',blocks:[]});
 assert.deepEqual(codes(state),[]);
 refused('document.write',{title:'x',blocks:[{kind:'table',text:'x'}]},'invalid-content');
 refused('document.write',{title:'x',blocks:[{kind:'paragraph'}]},'invalid-content');
 refused('document.write',{title:'x',blocks:[{kind:'paragraph',text:'x',colour:'red'}]},'invalid-content');
 refused('document.write',{title:'x',blocks:[{kind:'heading',text:'x',level:9}]},'invalid-content');
 refused('document.write',{title:'x',blocks:['just text']},'invalid-content');
});

test('document.remove: the document goes with everything in it; blocks need a document again',async()=>{
 const {state,host,ok,refused,run,view}=await area();
 ok('document.list.make',{parent:'text1',style:'bullet',items:['a','b']});
 ok('document.remove',{});
 assert.equal(state.sop.trim(),'');
 assert.deepEqual(host.observe().objects,[]);
 assert.match(view().svg,/>No document</);
 assert.equal(run('document.remove',{}).status,'unchanged');
 refused('document.block.make',{parent:'text1',kind:'paragraph'},'missing-parent-document');
 ok('document.write',{title:'Fresh',blocks:[]});
 assert.equal(objects(host).text1.kind,'document');
});

test('document.compose and document.rewrite are refused: no composer and no rewriter (no language model) in this area',async()=>{
 const {state,refused}=await area();
 const before=state.sop;
 refused('document.compose',{genre:'story',topic:'a dragon'},'missing-knowledge-composer');
 refused('document.rewrite',{property:'tone',value:'formal'},'missing-knowledge-rewriter');
 assert.equal(state.sop,before);
});

test('document.observe, document.undo, document.redo compile to no call: observation is derived, history is the journal\'s',async()=>{
 const {state,run}=await area();
 const before=state.sop;
 for(const operation of ['document.observe','document.undo','document.redo'])assert.equal(run(operation,{}).status,'unchanged',operation);
 assert.equal(state.sop,before);
});

test('the page: title, headings by level, wrapped paragraphs, list markers, a quote bar, table cells; a tall page grows',async()=>{
 const {ok,view}=await area();
 ok('document.title.change',{id:'text1',title:'A page'});
 ok('document.section.make',{parent:'text1',text:'Chapter',level:1});
 const long='word '.repeat(60).trim();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:long});
 ok('document.block.make',{parent:'text1',kind:'quote',text:'Quoted.'});
 ok('document.list.make',{parent:'text1',style:'bullet',items:['one']});
 ok('document.table.make',{parent:'text1',rows:[['h1','h2'],['c1','c2']]});
 const {svg,controls}=view();
 assert.match(svg,/font-size="30" font-weight="600"[^>]*>A page</);
 assert.match(svg,/font-size="26" font-weight="600"[^>]*>Chapter</);
 const lines=[...svg.matchAll(/>((?:word ?)+)</g)].map((m)=>m[1].trim());
 assert.ok(lines.length>=4,'a long paragraph wraps');
 assert.ok(lines.every((line)=>line.length<=73),'within the column');
 assert.equal(lines.join(' ').split(' ').length,60,'no word lost');
 assert.match(svg,/>•</);assert.match(svg,/fill="#c3cad6"/);
 for(let i=0;i<20;i++)ok('document.block.make',{parent:'text1',kind:'paragraph',text:'More text '+i});
 const height=Number(view().svg.match(/viewBox="0 0 800 ([\d.]+)"/)[1]);
 assert.ok(height>900,'the page grows with what is on it');
 assert.ok(controls.some((c)=>c.operation==='document.block.make'&&c.fields.length===1),'a paragraph can be added from the inspector');
});

test('inspector controls declare their arguments: the document for new blocks, the view range for marks',async()=>{
 const {ok,view,run,state}=await area();
 ok('document.block.make',{parent:'text1',kind:'paragraph',text:'Hello there'});
 const {controls,options}=view();
 const add=controls.find((c)=>c.label==='Add paragraph');
 assert.deepEqual(add.args,[{param:'parent',option:'document'},{param:'kind',value:'paragraph'}]);
 assert.deepEqual(options.document,['text1']);
 const mark=controls.find((c)=>c.label==='Format the selected characters');
 assert.deepEqual(mark.args.map((a)=>a.view??a.key??a.value),['at','from','to',true,'color']);
 assert.deepEqual(mark.args.map((a)=>a.kind??null),[null,'number','number',null,null],'view keys that hold numbers say so');
 run('document.block.select',{id:'b1',from:0,to:5});
 ok('document.block.mark',{id:'b1',at:state.runtime.view.at,from:Number(state.runtime.view.from),to:Number(state.runtime.view.to),mark:'bold',enabled:true,attrs:{color:'#fff2a8'}});
 assert.deepEqual(marks(state),[{block:'b1',form:'bold',from:0,to:5}],'a bold mark ignores a colour');
});
