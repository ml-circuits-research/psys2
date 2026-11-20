import {compileNativeCapability} from '../src/dialog/capability-plan-adapter.mjs';
import {readNativeToolInterface} from '../worlds/native-tool-interface.mjs';
import CHART_SOURCE from '../worlds/data.charts/native-interface-source.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartSVG,chartRows} from '../worlds/data.charts/vector-svg.mjs';
test('Chart interface seeds reach the generic compiler and an authored notice changes the result', () => {
 const bindings={kinds:[{area:'diagram',lemma:'bar chart',canonical:'k.charts.kind.bar_chart',
  nativeFamilyBinding:{operation:'chart.make',arguments:{type:'bar'}}}],properties:[
  {area:'diagram',canonical:'w.chart.point.value',hostBinding:{sourceType:'data.charts.chart',parameter:'values',codec:'number-list'}},
 ]};
 const candidate={request:'r',wires:`@s std.request.source text="draw a bar chart"
@r std.request act=make mood=do source=$s
@t std.request.target request=$r mode=new kind=k.charts.kind.bar_chart
@v std.request.constraint request=$r target=$t concept=w.chart.point.value operator=eq polarity=positive character=requirement value="[3,5,8]"`};
 const original='I numbered the categories because no labels were supplied.';
 const edited='The tool assigns category numbers.';
 const compile=source=>compileNativeCapability(candidate,{
  area:{area:'diagram'},view:'diagram',bindings,host:readNativeToolInterface(source).realize(),
  observation:{instanceId:'declared-fixture',version:'1',scope:'data.charts',complete:true,objects:[]},unapplied:[],
 });
 const current=compile(CHART_SOURCE), changed=compile(CHART_SOURCE.replace(original,edited));
 assert.equal(current.status,'compiled');
 assert.deepEqual(current.args.labels,['1','2','3']);
 assert.deepEqual(current.args.values,[3,5,8]);
 assert.ok(current.notes.includes(original));
 assert.ok(changed.notes.includes(edited));
 assert.ok(!changed.notes.includes(original));
});

test('all chart renderings are editable SVG geometry with escaped labels and faithful numeric ordering',()=>{
 const c={id:'chart:c1',type:'bar',title:'<script>',labels:['B','<A>'],datasets:[{label:'Value',data:[2,5]}],options:{sort:'desc'}};assert.deepEqual(chartRows(c).map(r=>r.value),[5,2]);
 for(const type of ['bar','line','pie','doughnut','polarArea','radar','scatter']){const svg=chartSVG({...c,type});assert.ok(svg.includes('data-chart-id="chart:c1"'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<canvas'));assert.ok(!svg.includes('NaN'));}
});
