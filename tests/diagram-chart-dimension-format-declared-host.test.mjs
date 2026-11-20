// SPDX-License-Identifier: AGPL-3.0-only
// Charts in the Diagram tab by their dimension and formatted (worlds/diagram.sketch/chart-format.sop, act-rules.sop;
// specs/diagram-capabilities.md): a chart asked for by its dimension alone draws that dimension's typical categories
// (k.charts.category) with sample values and says so; the formatting properties of the chart group are set by number,
// by a comparative of k.values or by name, and each is seen in what is drawn. The reader keys of the data drops bind to
// these parameters through declared key alignments (execution-policy.sop app.execution.keyBinding).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramArea,projectDiagramArea,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {completeBindings} from '../src/dialog/declared-bindings.mjs';
import {compileNativeCapability} from '../src/dialog/capability-plan-adapter.mjs';
import {readNativeToolInterface} from '../worlds/native-tool-interface.mjs';
import DIAGRAM from '../worlds/diagram.sketch/native-interface-source.mjs';
import {chartToolInterface} from '../worlds/data.charts/declared-host.mjs';

async function area(){
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke('@c '+command,toolInvocationContext('cf-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const nodes=(state)=>diagramAreaStateWorld(state).ofType('w.diagram.node').map(f=>({code:f.attrs.code[0],label:String(f.attrs.label?.[0]??'').replace(/^"|"$/g,''),value:Number(f.attrs.value?.[0]),n:Number(f.attrs.n?.[0])})).sort((a,b)=>a.n-b.n);
const texts=(svg)=>[...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),size:Number(m[3]),attrs:m[4],text:m[5]}));
const text=(svg,t)=>texts(svg).find(x=>x.text===t);
const rect=(svg,code)=>{const m=svg.match(new RegExp('data-select="'+code+'"><rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"'));return m&&{x:Number(m[1]),y:Number(m[2]),w:Number(m[3]),h:Number(m[4])};};

test('a chart by its dimension: the typical categories with sample values, the axis titles, and the chart marked as a sample',async()=>{
 const {state,ok,view}=await area();
 ok('diagram.group.chart.make label="Sales by month" layout="bar" dimension="month" measure="sales" aggregate="sum"');
 const made=nodes(state);
 assert.deepEqual(made.map(n=>n.label).slice(0,3),['January','February','March']);assert.equal(made.length,12);
 assert.ok(made.every(n=>Number.isFinite(n.value)),'every category has a value');
 const g1=view().inputs.g1;assert.equal(g1.xLabel,'month');assert.equal(g1.yLabel,'total sales');
 assert.equal(diagramAreaStateWorld(state).ofType('w.diagram.group')[0].attrs.sample?.[0],'true');
 // A dimension the catalog has no categories for: its name with A, B, C, D; none at all: A, B, C.
 ok('diagram.group.chart.make label="Ships" layout="pie" dimension="flag"');
 assert.deepEqual(nodes(state).slice(12).map(n=>n.label),['flag A','flag B','flag C','flag D']);
 ok('diagram.group.chart.make label="Chart" layout="bar"');
 assert.deepEqual(nodes(state).slice(16).map(n=>n.label),['A','B','C']);
});

test('the reader route: values the policy seeds, categories it numbers; a said dimension names them, said labels stay',async()=>{
 const {state,ok}=await area();
 ok('diagram.group.chart.make label="Sales" layout="bar" dimension="month" labels="1" labels="2" labels="3" values=3 values=5 values=2');
 assert.deepEqual(nodes(state).map(n=>[n.label,n.value]),[['January',3],['February',5],['March',2]]);
 ok('diagram.group.chart.make label="Staff" layout="bar" dimension="sex" labels="1" labels="2" labels="3" values=3 values=5 values=2');
 assert.deepEqual(nodes(state).slice(3).map(n=>n.label),['Female','Male','3'],'beyond the dimension\'s categories the numbers stay');
 ok('diagram.group.chart.make label="Genres" layout="bar" dimension="month" labels="Rock" labels="Pop" values=3 values=5');
 assert.deepEqual(nodes(state).slice(6).map(n=>n.label),['Rock','Pop']);
});

test('only the largest categories, those above or below a value; said labels without values take sample values',async()=>{
 const {state,ok,run}=await area();
 ok('diagram.group.chart.make label="Top" layout="bar" labels="a" labels="b" labels="c" labels="d" values=5 values=9 values=1 values=7 top=2');
 assert.deepEqual(nodes(state).map(n=>n.label),['b','d'],'the two largest, in their order');
 ok('diagram.group.chart.make label="Big" layout="bar" labels="a" labels="b" labels="c" values=5 values=9 values=1 above=4');
 assert.deepEqual(nodes(state).slice(2).map(n=>n.label),['a','b']);
 ok('diagram.group.chart.make label="Small" layout="bar" labels="a" labels="b" labels="c" values=5 values=9 values=1 below=6');
 assert.deepEqual(nodes(state).slice(4).map(n=>n.label),['a','c']);
 ok('diagram.group.chart.make label="Genres" layout="bar" labels="rock" labels="pop" labels="jazz"');
 assert.deepEqual(nodes(state).slice(6).map(n=>n.label),['rock','pop','jazz']);
 assert.equal(run('diagram.group.chart.make label="Bad" layout="bar" labels="a" labels="b" values=1').reason,'invalid-chart-data','labels and values said both must pair up');
});

test('number properties: a number within limits, a comparative one step from the current value, the usual value, none; other words refused',async()=>{
 const {ok,run,view}=await area();
 ok('diagram.group.chart.make label="Sales" layout="bar" labels="Jan" labels="Feb" values=10 values=20');
 assert.equal(text(view().svg,'Jan').size,12,'the usual font');
 ok('diagram.chart.format id="g1" fontSize="bigger"');assert.equal(view().inputs.g1.fontSize,15);
 assert.equal(text(view().svg,'Jan').size,15);assert.equal(text(view().svg,'Sales').size,16,'the title one size above');
 ok('diagram.chart.format id="g1" fontSize="smaller"');assert.equal(view().inputs.g1.fontSize,12);
 ok('diagram.chart.format id="g1" fontSize="99"');assert.equal(view().inputs.g1.fontSize,40,'within the limits');
 ok('diagram.chart.format id="g1" fontSize="medium"');assert.equal(view().inputs.g1.fontSize,12);
 assert.equal(run('diagram.chart.format id="g1" fontSize="purple"').reason,'unknown-degree');
 // The gap between bars is the bar width the other way round: no gap fills the category's room.
 const before=rect(view().svg,'n1');assert.equal(before.w,36);
 ok('diagram.chart.format id="g1" barWidth="wider"');assert.ok(rect(view().svg,'n1').w>36);
 ok('diagram.chart.format id="g1" barGap="none"');assert.equal(view().inputs.g1.barWidth,1);assert.equal(rect(view().svg,'n1').w,56);
 ok('diagram.chart.format id="g1" precision=0');assert.equal(view().inputs.g1.precision,0);
});

test('axes: the value axis on the right with its numbers, inverted axes, a log scale, magnitudes and powers of ten',async()=>{
 const {ok,view}=await area();
 ok('diagram.group.chart.make label="Revenue" layout="bar" labels="A" labels="B" labels="C" values=2000 values=50000 values=1200000');
 const a0=rect(view().svg,'n1'),c0=rect(view().svg,'n3');assert.ok(a0.x<c0.x);
 ok('diagram.chart.format id="g1" axisSide="right" tickFormat="magnitude"');
 const svg=view().svg,top=text(svg,'1.2M'),half=text(svg,'600k');
 assert.ok(top&&half,'numbers in magnitudes');assert.match(top.attrs,/text-anchor="start"/,'right of the plot');assert.ok(top.x>c0.x);
 ok('diagram.chart.format id="g1" invert="x"');
 assert.ok(rect(view().svg,'n1').x>rect(view().svg,'n3').x,'the categories from the right');
 ok('diagram.chart.format id="g1" invert="y"');
 const a=rect(view().svg,'n1'),c=rect(view().svg,'n3');assert.equal(a.y,c.y,'bars hang from the top of the plot');assert.ok(c.h>a.h);
 ok('diagram.chart.format id="g1" invert="none" axisScale="log" tickFormat="power"');
 const log=view().svg;
 assert.ok(text(log,'10⁶')&&text(log,'10³')&&text(log,'10⁰'),'powers of ten on a log axis');
 const h1=rect(log,'n1').h,h2=rect(log,'n2').h,h3=rect(log,'n3').h;
 assert.ok(Math.abs((h2-h1)-(h3-h2))<20,'equal steps for equal ratios on a log scale (2000, 50000, 1200000: ratio 25 and 24)');
});

test('lines, markers, gridlines, pies and the title: what is drawn follows the chart group',async()=>{
 const {ok,view}=await area();
 ok('diagram.group.chart.make label="Trend" layout="line" labels="Q1" labels="Q2" labels="Q3" values=3 values=5 values=4');
 ok('diagram.chart.format id="g1" lineStyle="dashed" lineWidth="thicker" markerEdge="off" markerSize="20" gridlines=true gridStyle="solid"');
 const svg=view().svg;
 assert.match(svg,/<polyline points="[^"]+" fill="none" stroke="#1d6fe8" stroke-width="2.5"[^>]*stroke-dasharray="8 5"/,'a thicker dashed line');
 assert.match(svg,/data-select="n1"><ellipse[^>]*rx="10"[^>]*fill="[^"]+"\/>/,'markers 20 wide, without an outline');
 assert.ok(!/stroke="#c3cbd5"[^>]*stroke-dasharray/.test(svg),'solid gridlines');
 ok('diagram.chart.format id="g1" titleWeight="normal" titleColour="navy" titlePosition="top"');
 const title=text(view().svg,'Trend');assert.doesNotMatch(title.attrs,/font-weight/);assert.match(title.attrs,/fill="#000080"/);assert.match(title.attrs,/text-anchor="middle"/);
 ok('diagram.group.chart.make label="Share" layout="pie" labels="x" labels="y" values=1 values=3');
 const r0=view().inputs.g2.pieRadius;assert.equal(r0,undefined);
 ok('diagram.chart.format id="g2" pieRadius="larger"');assert.equal(view().inputs.g2.pieRadius,112.5);
});

test('the page: its background colour and its title',async()=>{
 const {ok,run,view}=await area();
 ok('diagram.page.change background="ivory" title="Quarterly review"');
 const v=view();assert.equal(v.inputs.page.background,'ivory');assert.equal(v.inputs.page.title,'Quarterly review');
 assert.ok(text(v.svg,'Quarterly review'),'the title is drawn');assert.match(v.svg,/<rect x="0" y="0"[^>]*fill="#fffff0"/i,'an ivory page');
 assert.equal(run('diagram.page.change').reason,'missing-property');
});

const table=()=>({properties:[],coverage:[],families:[],kinds:[]});
test('the data drops\' chart keys bind to the chart group, the chart make and the page through declared alignments',async()=>{
 const t=await completeBindings(table()),row=key=>t.properties.find(r=>r.area==='diagram'&&r.key===key);
 for(const [key,operation,parameter] of [['chart.fontSize','diagram.chart.format','fontSize'],['chart.barGap','diagram.chart.format','barGap'],['chart.barHeight','diagram.chart.format','barWidth'],
  ['chart.axisSide','diagram.chart.format','axisSide'],['chart.dimension','diagram.group.chart.make','dimension'],['chart.top','diagram.group.chart.make','top'],
  ['diagram.background','diagram.page.change','background'],['page.title','diagram.page.change','title']]){
  assert.equal(row(key)?.hostBinding.operation,operation,key);assert.equal(row(key).hostBinding.parameter,parameter,key);
 }
 assert.deepEqual(row('chart.invert').valueMap.find(v=>v.said==='off'),{said:'off',value:'none'});
 assert.deepEqual(row('chart.tickFormat').valueMap.find(v=>v.said==='powers of ten'),{said:'powers of ten',value:'power'});
 assert.deepEqual(row('chart.axisSide').classValues,['left','right']);
 assert.equal(row('chart.precision').numeric,true);
});

test('a reading of "make the font bigger" on a chart compiles to the chart format tool with the said word',async()=>{
 const bindings=await completeBindings(table());
 const group={id:'g1',kind:'group',source:'diagram',sourceType:'diagram.sketch.group',version:'1',inputs:[{key:'fontSize',binding:'diagram.group.fontSize',values:['12'],source:'diagram',sourceType:'diagram.sketch.group',version:'1'}]};
 const candidate={request:'r',wires:`@s std.request.source text="make the font bigger"
@r std.request act=change mood=do source=$s
@t std.request.target request=$r mode=existing kind=w.chart.chart
@v std.request.constraint request=$r target=$t concept=diagram.sketch.group.fontSize operator=eq polarity=positive character=requirement value="bigger"`};
 const plan=compileNativeCapability(candidate,{area:{area:'diagram'},view:'diagram',bindings:{...bindings,kinds:[{area:'diagram',lemma:'group',canonical:'w.chart.chart',nativeFamilyBinding:{operation:'diagram.chart.format',sourceType:'diagram.sketch.group'}}]},
  host:readNativeToolInterface(DIAGRAM,{imports:{'data.charts':chartToolInterface}}).realize({'diagram.themes':['pastel'],'diagram.colours':['red']}),observation:{instanceId:'fixture',version:'1',scope:'diagram',complete:true,objects:[group]},focus:'g1',unapplied:[]});
 assert.equal(plan.status,'compiled',JSON.stringify(plan).slice(0,600));assert.equal(plan.operation,'diagram.chart.format');assert.equal(plan.args.fontSize,'bigger');
});
