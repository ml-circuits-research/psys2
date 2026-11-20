// SPDX-License-Identifier: AGPL-3.0-only
// A chart group's shape (worlds/diagram.sketch/chart-shape.sop; specs/diagram-capabilities.md): the value axis floor
// (y_min), bars lying on their side (orientation), the plot's size in pixels (width, height) and a frame effect, each a
// slot of the catalog's w.diagram.group, set through diagram.chart.format and seen in what is drawn and observed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramArea,projectDiagramArea} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

async function area(){
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke('@c '+command,toolInvocationContext('cs-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const rect=(svg,code)=>{const m=svg.match(new RegExp('data-select="'+code+'"><rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"'));return m&&{x:Number(m[1]),y:Number(m[2]),w:Number(m[3]),h:Number(m[4])};};
const texts=(svg)=>[...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),attrs:m[4],text:m[5]}));
const MAKE='diagram.group.chart.make label="Sales" layout="bar" labels="Jan" labels="Feb" labels="Mar" values=3 values=5 values=2';

test('the value axis floor: bars measured from y_min, the axis numbers from it to the top',async()=>{
 const {ok,view}=await area();
 ok(MAKE);ok('diagram.chart.format id="g1" axisSide="left"');
 assert.equal(Math.round(rect(view().svg,'n1').h),96,'3 / 5 of a 160 high plot');
 ok('diagram.chart.format id="g1" yMin=1');
 assert.equal(view().inputs.g1.yMin,1);
 assert.equal(Math.round(rect(view().svg,'n1').h),80,'(3 - 1) / (5 - 1) of a 160 high plot');
 assert.ok(texts(view().svg).some(t=>t.text==='1'),'the axis starts at its floor');
});

test('bars lying on their side: categories down the side, labels left, values right, the plot as wide as said',async()=>{
 const {ok,view}=await area();
 ok(MAKE);ok('diagram.chart.format id="g1" orientation="horizontal"');
 const v=view(),jan=rect(v.svg,'n1'),feb=rect(v.svg,'n2'),mar=rect(v.svg,'n3');
 assert.equal(v.inputs.g1.orientation,'horizontal');
 assert.equal(jan.x,feb.x,'every bar starts at the baseline');assert.ok(feb.y>jan.y&&mar.y>feb.y,'one row per category, in order');
 assert.equal(Math.round(feb.w),160,'the largest value fills the plot');assert.equal(Math.round(jan.w),96);
 const label=texts(v.svg).find(t=>t.text==='Jan');assert.ok(label.x<jan.x&&/text-anchor="end"/.test(label.attrs),'the label left of its bar');
 ok('diagram.chart.format id="g1" width=320');
 assert.equal(Math.round(rect(view().svg,'n2').w),320,'a lying chart\'s width is the length of its plot');
 assert.equal(view().inputs.g1.width,320);
});

test('a standing chart sized by hand shares its width among its categories; height is the plot; an effect on the frame',async()=>{
 const {ok,run,view}=await area();
 ok(MAKE);
 assert.equal(view().inputs.g1.width,168,'observed as drawn: 3 categories of 56');assert.equal(view().inputs.g1.height,160);
 ok('diagram.chart.format id="g1" width=300 height=100');
 const feb=rect(view().svg,'n2');assert.equal(Math.round(feb.h),100);assert.ok(Math.abs(feb.w-100*9/14)<0.01,'a bar takes its usual share (18 of 28) of a 100 wide category');
 ok('diagram.chart.format id="g1" effect="shadow"');
 assert.match(view().svg,/drop-shadow/);
 assert.equal(run('diagram.chart.format id="g1" width=20').status,'refused','below the size limits');
});

test('series of a chart: made on the chart made last with values by category, side by side, stacked or as shares; renamed, recoloured, removed',async()=>{
 const {state,ok,run,view,host}=await area();
 ok(MAKE);
 ok('diagram.chart.series.add label="Costs" values=2 values=4 values=6');
 const s1=host.observe().objects.find(o=>o.sourceType==='diagram.sketch.series');
 assert.equal(s1.id,'s1');assert.ok(s1.inputs.some(i=>i.key==='chart'&&i.values[0]==='"g1"'),'a series of the chart made last');
 const side=view();
 assert.ok(Math.abs(rect(side.svg,'n1').w-18)<0.01,'two series share the category room: each bar half as wide');
 assert.ok(/<rect[^>]*data-select="g1"|Costs/.test(side.svg),'the series is drawn and named in the legend');
 assert.ok(texts(side.svg).some(t=>t.text==='Costs')&&texts(side.svg).some(t=>t.text==='Series 1'));
 assert.equal(view().inputs.g1.height,160);
 ok('diagram.chart.format id="g1" stacking="stacked" axisSide="left"');
 assert.ok(texts(view().svg).some(t=>t.text==='9'),'the axis top is the largest category total (Feb: 5 + 4)');
 ok('diagram.chart.format id="g1" stacking="percent"');
 assert.ok(texts(view().svg).some(t=>t.text==='100'),'shares: the axis runs to 100');
 assert.equal(Math.round(rect(view().svg,'n3').h),Math.round(160*2/8),'Mar: 2 of 2 + 6');
 ok('diagram.chart.series.change id="s1" label="Budget" colour="red"');
 assert.ok(texts(view().svg).some(t=>t.text==='Budget'));
 assert.equal(run('diagram.chart.series.add label="Too many" values=1 values=2 values=3 values=4').status,'refused','more values than categories');
 ok('diagram.chart.series.remove id="s1"');
 assert.equal(host.observe().objects.filter(o=>o.sourceType==='diagram.sketch.series').length,0);
});
