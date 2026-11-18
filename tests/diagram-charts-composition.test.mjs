import {toNativeDiagramState} from '../worlds/diagram.sketch/canonical-state.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramHost,initialDiagramState,migrateChartTools} from '../worlds/diagram.sketch/declared-host.mjs';
import {chartSVG,chartRows} from '../worlds/data.charts/vector-svg.mjs';
import {executeDeclaredRequest} from '../src/dialog/declared-execution.mjs';
const call=(host,operation,args,id)=>host.invoke({invocation:id,expectedVersion:host.observe().version,operation,args});
const data={type:'bar',title:'Counts',labels:['Apples','Pears'],values:[5,-3],series:'Value',source:['source.input']};
test('one diagram instance contains shapes and vector charts with mixed undo/redo and chart selection',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'composition'});
 assert.equal(call(host,'diagram.node.make',{kind:'circle'},'node').status,'changed');
 assert.equal(call(host,'chart.make',data,'chart').status,'changed');
 assert.equal(state.chartTools.charts[0].id,'chart:1');assert.equal(state.chartTools.active,'chart:1');
 const objects=host.observe().objects;assert.ok(objects.some(o=>o.id==='c1'));assert.ok(objects.some(o=>o.id==='chart:1'));assert.equal(new Set(objects.map(o=>o.id)).size,objects.length);
 assert.deepEqual(state.chartTools.charts[0].source,['source.input']);
 call(host,'chart.point.change',{chart:'chart:1',index:0,value:9},'point');
 call(host,'diagram.undo',{},'undo-point');assert.equal(state.chartTools.charts[0].datasets[0].data[0],5);
 call(host,'diagram.undo',{},'undo-chart');assert.equal(state.chartTools.charts.length,0);assert.equal(state.shapes.length,1);
 call(host,'diagram.redo',{},'redo-chart');assert.equal(state.chartTools.charts.length,1);
 call(host,'chart.place',{id:'chart:1',x:330,y:170,width:500},'place');assert.equal(state.chartTools.charts[0].placement.x,330);
 assert.equal(call(host,'chart.select',{id:'absent'},'select-missing').reason,'missing-target');
});
test('chart migration namespaces legacy ids and preserves explicit values without a separate live store',()=>{
 const state=initialDiagramState(),legacy={charts:[{id:'c1',type:'bar',title:'Old',labels:['A'],datasets:[{label:'Value',data:[7]}],options:{}}],active:'c1',nextId:2,history:[],future:[]};
 migrateChartTools(state,legacy);assert.equal(state.chartTools.active,'chart:c1');assert.deepEqual(state.chartTools.charts[0].datasets[0].data,[7]);assert.equal(legacy.charts[0].id,'c1');
 migrateChartTools(state,legacy);assert.equal(state.chartTools.charts.length,1);
});
test('all chart renderings are editable SVG geometry with escaped labels and faithful numeric ordering',()=>{
 const state=initialDiagramState();migrateChartTools(state,{charts:[{id:'c1',type:'bar',title:'<script>',labels:['B','<A>'],datasets:[{label:'Value',data:[2,5]}],options:{sort:'desc'}}],active:'c1',nextId:2});
 const c=state.chartTools.charts[0];assert.deepEqual(chartRows(c).map(r=>r.value),[5,2]);
 for(const type of ['bar','line','pie','doughnut','polarArea','radar','scatter']){const svg=chartSVG({...c,type});assert.ok(svg.includes('data-chart-id="chart:c1"'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<canvas'));assert.ok(!svg.includes('NaN'));}
});
test('shared declared request executor passes anchored chart label/value lists to the composite native host',async()=>{
 const state=initialDiagramState(),session={isession:{state:{'diagram.sketch':state}}};
 const binding={area:'diagram',type:'chart',lemma:'bar chart',canonical:'k.charts.kind.bar_chart',nativeFamilyBinding:{operation:'chart.make',arguments:{type:'bar'}}};
 const properties=[['w.chart.point.category','labels','string-list'],['w.chart.point.value','values','number-list']].map(([canonical,parameter,codec])=>({area:'diagram',canonical,hostBinding:{id:'chart.make',sourceType:'data.charts.chart',parameter,codec}}));
 const candidate={request:'r',wires:'@s std.request.source text="make a bar chart"\n@r std.request act=make mood=do source=$s\n@t std.request.target request=$r mode=new kind=k.charts.kind.bar_chart\n@c1 std.request.constraint request=$r target=$t concept=w.chart.point.category operator=eq polarity=positive character=requirement value="Apples, Pears"\n@c2 std.request.constraint request=$r target=$t concept=w.chart.point.value operator=eq polarity=positive character=requirement value="5, 3"'};
 const reply=await executeDeclaredRequest(session,candidate,'make a bar chart',{bindings:{kinds:[binding],properties},view:'diagram'});
 assert.ok(reply.statuses.includes('supported'));assert.equal(toNativeDiagramState(state).chartTools.charts[0].type,'bar');assert.deepEqual(toNativeDiagramState(state).chartTools.charts[0].datasets[0].data,[5,3]);assert.deepEqual(toNativeDiagramState(state).chartTools.charts[0].labels,['Apples','Pears']);
});
test('multiple numeric constraints append in source order and missing category labels become disclosed ordinals',async()=>{
 const state=initialDiagramState(),session={isession:{state:{'diagram.sketch':state}}};
 const bindings={kinds:[{area:'diagram',lemma:'bar chart',canonical:'k.charts.kind.bar_chart',nativeFamilyBinding:{operation:'chart.make',arguments:{type:'bar'}}}],properties:[{area:'diagram',canonical:'w.chart.point.value',hostBinding:{sourceType:'data.charts.chart',parameter:'values',codec:'number-list'}}]};
 const constraints=[['c',8,32],['a',3,26],['b',5,29]].map(([id,value,start])=>`@${id} std.request.constraint request=$r target=$t concept=w.chart.point.value operator=eq polarity=positive character=requirement value="${value}" source=$s source.start=${start} source.end=${start+1}`).join('\n');
 const candidate={request:'r',wires:'@s std.request.source text="draw a bar chart with values 3, 5, 8"\n@r std.request act=make mood=do source=$s\n@t std.request.target request=$r mode=new kind=k.charts.kind.bar_chart\n'+constraints};
 const reply=await executeDeclaredRequest(session,candidate,'draw a bar chart with values 3, 5, 8',{bindings,view:'diagram'});
 assert.deepEqual(toNativeDiagramState(state).chartTools.charts[0].datasets[0].data,[3,5,8]);assert.deepEqual(toNativeDiagramState(state).chartTools.charts[0].labels,['1','2','3']);assert.match(reply.text,/numbered the categories/);
});
test('multi-series chart mutations and stacked rendering preserve numeric values across all forms',async()=>{
 const state=initialDiagramState(),h=await createDiagramHost({state,instanceId:'multi'});
 const made=call(h,'chart.make',{type:'bar',title:'Sales',labels:['A','B'],datasets:[{label:'2025',data:[2,4],color:null},{label:'2026',data:[3,5],color:null}]},'multi');assert.equal(made.status,'changed');
 const chart=state.chartTools.charts[0],id=chart.id;assert.equal(h.observe().objects.filter(o=>o.sourceType==='data.charts.series').length,2);
 call(h,'chart.change',{id,stacked:true,horizontal:true,palette:'ocean',showLegend:true,showValues:true},'options');
 for(const type of ['bar','line','pie','doughnut','polarArea','radar','scatter']){const svg=chartSVG({...state.chartTools.charts[0],type});assert.ok(!/NaN|Infinity/.test(svg));assert.ok(svg.includes('2 series'));}
 assert.equal(call(h,'chart.series.add',{chart:id,label:'2027',values:[7,8],colour:'#ff0000'},'add-series').status,'changed');
 assert.equal(call(h,'chart.point.change',{chart:id,series:2,index:1,value:9},'change-point').status,'changed');assert.equal(state.chartTools.charts[0].datasets[2].data[1],9);
 assert.equal(call(h,'chart.series.change',{chart:id,index:1,label:'Next year'},'change-series').status,'changed');
 assert.equal(call(h,'chart.series.remove',{chart:id,index:2},'remove-series').status,'changed');assert.equal(state.chartTools.charts[0].datasets.length,2);
 assert.equal(call(h,'chart.datasets.change',{id,labels:['A'],datasets:[{label:'Bad',data:[]}]},'invalid-series').status,'refused');
});
