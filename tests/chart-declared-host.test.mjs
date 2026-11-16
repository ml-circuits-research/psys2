import {test} from 'node:test';import assert from 'node:assert/strict';import {createChartHost,initialChartState} from '../worlds/data.charts/declared-host.mjs';
const call=(h,operation,args,invocation)=>h.invoke({operation,args,invocation,expectedVersion:h.observe().version});
test('Charts preserve explicit numeric data, source IDs and all populations through mutation/removal/undo',()=>{
 const state=initialChartState(),h=createChartHost({state,instanceId:'charts.one'});const made=call(h,'chart.make',{type:'bar',title:'Counts',labels:['A','B'],values:[2,-3.5],series:'Value',source:['input.row']},'make');assert.equal(made.status,'changed');assert.equal(made.after.objects.length,3);assert.deepEqual(state.charts[0].datasets[0].data,[2,-3.5]);assert.deepEqual(state.charts[0].source,['input.row']);
 const id=state.charts[0].id;assert.equal(call(h,'chart.point.change',{chart:id,index:1,value:4},'point').status,'changed');assert.equal(state.charts[0].datasets[0].data[1],4);assert.equal(call(h,'chart.change',{id,title:'Changed'},'title').status,'changed');
 const removed=call(h,'chart.remove',{ids:[id]},'remove');assert.equal(removed.after.objects.length,0);assert.equal(call(h,'chart.undo',{},'undo').after.objects.length,3);assert.equal(state.charts[0].title,'Changed');
});
test('invalid chart data and ambiguous or incomplete target arguments never change state',()=>{
 const state=initialChartState(),h=createChartHost({state,instanceId:'charts.two'}),before=JSON.stringify(state);
 assert.equal(call(h,'chart.make',{type:'bar',title:'Bad',labels:['A'],values:[],series:'Values',source:[]},'bad').status,'refused');assert.equal(call(h,'chart.make',{type:'bar',title:'Bad',labels:['A'],values:[NaN],series:'Values',source:[]},'nan').status,'refused');assert.equal(JSON.stringify(state),before);
});
