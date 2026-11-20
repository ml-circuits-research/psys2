// SPDX-License-Identifier: AGPL-3.0-only
// Declared key alignments (execution-policy.sop app.execution.keyBinding / keyValue; declared-bindings.mjs rule 5):
// the reader's chart keys bind to the chart group's operations and their said values reach the tool as the declared
// parameter values (specs/semantic-frame.md §5).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeBindings} from '../src/dialog/declared-bindings.mjs';
import {compileNativeCapability} from '../src/dialog/capability-plan-adapter.mjs';
import {readNativeToolInterface} from '../worlds/native-tool-interface.mjs';
import DIAGRAM from '../worlds/diagram.sketch/native-interface-source.mjs';
import {chartToolInterface} from '../worlds/data.charts/declared-host.mjs';

const table=()=>({properties:[{area:'diagram',key:'chart.type',canonical:'data.charts.chart.type',hostBinding:{sourceType:'data.charts.chart',parameter:'type',operation:'diagram.group.chart'}}],coverage:[],families:[],kinds:[]});

test('chart keys bind to the chart group operations with declared values',async()=>{
 const t=await completeBindings(table()),row=key=>t.properties.find(r=>r.area==='diagram'&&r.key===key);
 assert.equal(row('chart.type').hostBinding.operation,'diagram.chart.format');
 assert.equal(row('chart.type').canonical,'diagram.sketch.group.layout');
 assert.deepEqual(row('chart.type').classValues,['bar','line','area','pie','doughnut','scatter','radar','treemap']);
 assert.deepEqual(row('chart.grid').valueMap.find(v=>v.said==='hide'),{said:'hide',value:false});
 assert.deepEqual(row('chart.legend').valueMap.find(v=>v.said==='hide'),{said:'hide',value:'none'});
 assert.equal(row('chart.sort').hostBinding.operation,'diagram.chart.sort');
 assert.equal(row('chart.max').numeric,true);
 assert.equal(row('point.chart').hostBinding.parameter,'chart');assert.equal(row('point.value').hostBinding.operation,'diagram.chart.point.change');
 // The chart's shape (chart-shape.sop): bars lying on their side, series stacked, the axis floor.
 assert.equal(row('chart.horizontal').hostBinding.parameter,'orientation');
 assert.deepEqual(row('chart.horizontal').valueMap.find(v=>v.said==='on'),{said:'on',value:'horizontal'});
 assert.deepEqual(row('chart.stacked').valueMap.find(v=>v.said==='off'),{said:'off',value:'none'});
 assert.equal(row('chart.min').numeric,true);
 // No declared counterpart (a gradient, 3d): the said value is not mapped and the reply discloses it.
 assert.equal(row('chart.effect').valueMap.some(v=>v.said==='gradient'),false);
});

test('a said legend value reaches the chart format tool as its declared parameter value',async()=>{
 const bindings=await completeBindings(table());
 const group={id:'g1',kind:'group',source:'diagram',sourceType:'diagram.sketch.group',version:'1',inputs:[{key:'legend',binding:'diagram.group.legend',values:['"right"'],source:'diagram',sourceType:'diagram.sketch.group',version:'1'}]};
 const candidate={request:'r',wires:`@s std.request.source text="get rid of the legend"
@r std.request act=change mood=do source=$s
@t std.request.target request=$r mode=existing kind=w.chart.chart
@v std.request.constraint request=$r target=$t concept=diagram.sketch.group.legend operator=eq polarity=positive character=requirement value="hide"`};
 const plan=compileNativeCapability(candidate,{area:{area:'diagram'},view:'diagram',bindings:{...bindings,kinds:[{area:'diagram',lemma:'group',canonical:'w.chart.chart',nativeFamilyBinding:{operation:'diagram.chart.format',sourceType:'diagram.sketch.group'}}]},
  host:readNativeToolInterface(DIAGRAM,{imports:{'data.charts':chartToolInterface}}).realize({'diagram.themes':['pastel','ocean'],'diagram.colours':['red']}),observation:{instanceId:'fixture',version:'1',scope:'diagram',complete:true,objects:[group]},focus:'g1',unapplied:[]});
 assert.equal(plan.status,'compiled',plan.reason);
 assert.equal(plan.operation,'diagram.chart.format');
 assert.equal(plan.args.legend,'none');
});
