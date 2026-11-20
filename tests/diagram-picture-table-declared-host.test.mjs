// SPDX-License-Identifier: AGPL-3.0-only
// Pictures and tables as diagram nodes (catalog w.diagram.node shape picture|table, source, caption, rows, columns and
// w.diagram.cell; worlds/diagram.sketch style-projection.sop): an image frame with a placeholder picture and a caption,
// a grid of rows and columns with its cell texts; and their kind words in the reader's binding table (declared-bindings
// completion 8: the native values of a family's make operation that no kind row names).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramArea,projectDiagramArea} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {completeBindings} from '../src/dialog/declared-bindings.mjs';

async function area(){
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke('@c '+command,toolInvocationContext('cs-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const rect=(svg,code)=>{const m=svg.match(new RegExp('data-select="'+code+'"><rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"'));return m&&{x:Number(m[1]),y:Number(m[2]),w:Number(m[3]),h:Number(m[4])};};
const texts=(svg)=>[...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),attrs:m[4],text:m[5]}));

test('a picture: a frame with a placeholder picture, its label and caption under it, resizable, its source observed',async()=>{
 const {ok,view,host}=await area();
 ok('diagram.node.make kind="picture" label="Logo" caption="Our new logo" source="logo.png"');
 const v=view().svg,box=rect(v,'n1');
 assert.equal(Math.round(box.w),120);assert.equal(Math.round(box.h),90);
 assert.ok((v.match(/<polygon /g)??[]).length>=2,'hills and a sun');
 const label=texts(v).find(t=>t.text==='Logo'),caption=texts(v).find(t=>t.text==='Our new logo');
 assert.ok(label.y>box.y+box.h&&caption.y>label.y&&/italic/.test(caption.attrs),'the label under the frame, the caption under it');
 const node=host.observe().objects.find(o=>o.id==='n1');
 assert.equal(node.kind,'picture');
 assert.equal(view().inputs.n1.source,'logo.png');
 ok('diagram.node.resize ids="n1" width=200 height=200');
 assert.equal(Math.round(rect(view().svg,'n1').w),200);
});

test('a table: a grid of rows and columns, its header row shaded, its cells written in their places',async()=>{
 const {ok,run,view}=await area();
 ok('diagram.node.make kind="table" label="Plan" rows=2 columns=4 cells="P1" cells="P2" cells="P3" cells="P4" cells="a" cells="b"');
 const v=view().svg,box=rect(v,'n1');
 assert.equal(Math.round(box.w),256,'64 a column');assert.equal(Math.round(box.h),56,'28 a row');
 const t=texts(v),p1=t.find(x=>x.text==='P1'),p4=t.find(x=>x.text==='P4'),b=t.find(x=>x.text==='b');
 assert.ok(p1.x<p4.x&&Math.abs(p1.y-p4.y)<0.5&&b.y>p1.y,'reading order: along the first row, then the next');
 assert.ok(t.find(x=>x.text==='Plan').y<box.y,'its label over the grid');
 ok('diagram.node.change ids="n1" cells="Q1"');
 assert.ok(texts(view().svg).some(x=>x.text==='Q1')&&!texts(view().svg).some(x=>x.text==='P1'),'a cell takes its new text');
 ok('diagram.node.make kind="table"');
 assert.equal(Math.round(rect(view().svg,'n2').w),192,'3 by 3 unless given');
 assert.equal(run('diagram.node.make kind="table" rows=1 cells="a" cells="b" cells="c" cells="d"').status,'refused');
});

test('kind words: picture, image, table and treemap reach the binding table from the native values and the catalog',async()=>{
 const t=await completeBindings({kinds:[{area:'diagram',type:'node',lemma:'box',canonical:'w.diagram.node',nativeFamilyBinding:{operation:'diagram.node.make',sourceType:'diagram.sketch.node'}},
  {area:'diagram',type:'chart',lemma:'bar chart',canonical:'k.charts.kind.bar_chart'}],properties:[],families:[]});
 const row=(type,lemma)=>t.kinds.find(k=>k.area==='diagram'&&k.type===type&&k.lemma===lemma);
 assert.equal(row('node','picture').canonical,row('node','image').canonical,'a catalog word of the value names the same kind');
 assert.deepEqual(row('node','picture').nativeFamilyBinding.arguments,{kind:'picture'});
 assert.equal(row('node','table').nativeFamilyBinding.arguments.kind,'table');
 assert.equal(row('chart','treemap').canonical,'k.charts.kind.treemap','the declared kind binding of the value');
 assert.equal(row('chart','tree map').canonical,'k.charts.kind.treemap');
 assert.equal(row('chart','bar'),undefined,'a value whose declared kind is named already is left to completion 6');
});
