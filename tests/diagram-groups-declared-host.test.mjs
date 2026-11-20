import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {toNativeDiagramState} from '../worlds/diagram.sketch/canonical-state.mjs';
import {nativeObservationObjects,compareInstanceObjects} from '../src/dialog/instance-facts.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{createDiagramHost,initialDiagramState}from'../worlds/diagram.sketch/declared-host.mjs';
const call=(h,operation,args)=>invokeToolCommand(h,{invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
test('named groups retain members through layout, properties and movement; explicit numeric values produce a linked chart',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'groups'});
 const first=call(h,'diagram.node.make',{kind:'rectangle',n:3});assert.equal(first.status,'changed');const ids=s.shapes.map(n=>n.name);
 assert.equal(call(h,'diagram.group.make',{name:'Sales',ids}).status,'changed');const members=[...s.groups[0].members];
 assert.equal(call(h,'diagram.group.layout',{id:'Sales',layout:'column'}).status,'changed');assert.deepEqual(s.groups[0].members,members);assert.equal(s.groups[0].layout,'column');
 assert.equal(call(h,'diagram.group.change',{id:'Sales',label:'Quarterly sales',colour:'blue'}).status,'changed');assert.deepEqual(s.groups[0].members,members);assert.equal(s.groups[0].name,'Sales');assert.equal(s.groups[0].label,'Quarterly sales');
 const before=structuredClone(s),bad=call(h,'diagram.group.chart',{id:'Sales',type:'bar'});assert.equal(bad.status,'refused');assert.deepEqual(s,before);
 for(const [i,id]of ids.entries())assert.equal(call(h,'diagram.node.change',{ids:[id],value:i+2,label:'Item '+i}).status,'changed');
 assert.equal(call(h,'diagram.group.chart',{id:'Sales',type:'bar'}).status,'changed');assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[2,3,4]);assert.equal(s.chartTools.charts[0].group,'Sales');assert.deepEqual(s.groups[0].members,members);
 assert.equal(call(h,'diagram.group.place',{id:'Sales',x:300,y:250}).status,'changed');const obs=h.observe().objects.find(o=>o.sourceType==='diagram.sketch.group');assert.ok(obs.inputs.some(i=>i.key==='x'&&i.values.includes('300')));
 assert.equal(call(h,'diagram.group.ungroup',{id:'Sales'}).status,'changed');assert.equal(s.groups.length,0);assert.equal(s.shapes.length,3);
});
test('group selection is declared, preserves members and rejects a missing group without mutation',async()=>{
 const state=initialDiagramState(),h=await createDiagramHost({state,instanceId:'group-selection'});
 const invoke=(operation,args)=>invokeToolCommand(h,{invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
 invoke('diagram.node.make',{kind:'circle',n:2});const ids=state.shapes.map(n=>n.name);invoke('diagram.group.make',{name:'Selected pair',ids});invoke('diagram.node.select',{ids:[]});const before=state.compositionHistory.length;
 const selected=invoke('diagram.group.select',{id:'Selected pair'});assert.equal(selected.status,'changed');assert.deepEqual(state.selected.shapes,ids);assert.equal(state.selected.group,'Selected pair');assert.equal(state.compositionHistory.length,before);assert.equal(state.chartTools.active,null);
 const snapshot=JSON.stringify(state);assert.equal(invoke('diagram.group.select',{id:'missing'}).status,'refused');assert.equal(JSON.stringify(state),snapshot);
});

test('new diagram nodes use explicit canvas coordinates and native selection clears and preserves groups',async()=>{
 const state=initialDiagramState(),h=await createDiagramHost({state,instanceId:'placement'});const invoke=(operation,args)=>invokeToolCommand(h,{invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
 invoke('diagram.node.make',{kind:'rectangle',x:120,y:175});const first=state.shapes[0];assert.equal(first.x,120);assert.equal(first.y,175);assert.deepEqual(state.selected.shapes,[first.name]);
 invoke('diagram.node.make',{kind:'circle',x:350,y:260});assert.equal(state.shapes[1].x,350);assert.equal(state.shapes[0].x,120);const ids=state.shapes.map(n=>n.name);invoke('diagram.node.select',{ids});invoke('diagram.group.make',{name:'Pair',ids});assert.equal(state.selected.group,'Pair');
 invoke('diagram.group.ungroup',{id:'Pair'});assert.deepEqual(state.selected.shapes,ids);assert.equal(state.selected.group,undefined);assert.equal(state.shapes.length,2);invoke('diagram.node.select',{ids:[]});assert.deepEqual(state.selected.shapes,[]);
});

import {performGesture} from './fixtures/editor-gesture.mjs';
test('linked group charts derive source edits atomically, preserve presentation, undo, and detach snapshots',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'linked-projection'});call(h,'diagram.node.make',{kind:'rectangle',n:2});const ids=s.shapes.map(n=>n.name);
 for(const [i,id]of ids.entries())call(h,'diagram.node.change',{ids:[id],value:i+2,label:['Apples','Pears'][i]});
 call(h,'diagram.group.make',{name:'Fruit',ids});call(h,'diagram.group.chart',{id:'Fruit',type:'bar'});const chartId=s.chartTools.active;
 call(h,'chart.place',{id:chartId,x:510,y:140});call(h,'chart.change',{id:chartId,type:'line',showLegend:false,colour:'#123456'});const presentation=structuredClone(s.chartTools.charts[0]);
 call(h,'diagram.node.change',{ids:[ids[0]],value:9,label:'Red apples'});let c=s.chartTools.charts[0];assert.deepEqual(c.labels,['Red apples','Pears']);assert.deepEqual(c.datasets[0].data,[9,3]);assert.equal(c.projection.status,'linked');assert.equal(c.type,'line');assert.deepEqual(c.placement,presentation.placement);assert.deepEqual(c.options,presentation.options);assert.equal(c.datasets[0].color,presentation.datasets[0].color);
 call(h,'diagram.undo',{});c=s.chartTools.charts[0];assert.deepEqual(c.labels,['Apples','Pears']);assert.deepEqual(c.datasets[0].data,[2,3]);assert.equal(s.shapes[0].value,2);
 call(h,'diagram.group.change',{id:'Fruit',label:'Weekly fruit'});assert.equal(s.chartTools.charts[0].title,'Weekly fruit');assert.equal(s.chartTools.charts[0].datasets[0].label,'Weekly fruit');call(h,'diagram.group.layout',{id:'Fruit',layout:'column'});assert.deepEqual(s.chartTools.charts[0].placement,presentation.placement);
 call(h,'diagram.group.ungroup',{id:'Fruit'});c=s.chartTools.charts[0];assert.equal(c.group,undefined);assert.equal(c.projection.status,'detached');assert.equal(c.projection.reason,'source-removed');assert.deepEqual(c.datasets[0].data,[2,3]);assert.equal(s.shapes.length,2);assert.equal(h.observe().objects.find(o=>o.id===chartId).inputs.find(i=>i.key==='projectionStatus').values[0],JSON.stringify('detached'));
 call(h,'diagram.undo',{});assert.equal(s.chartTools.charts[0].projection.status,'linked');assert.equal(s.groups.length,1);call(h,'diagram.node.remove',{ids:[ids[0]]});assert.equal(s.chartTools.charts[0].projection.status,'detached');assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[2,3]);call(h,'diagram.undo',{});
 call(h,'chart.point.change',{chart:chartId,index:0,value:11});assert.equal(s.chartTools.charts[0].projection.reason,'chart-data-edited');assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[11,3]);assert.equal(s.groups[0].chartId,undefined);call(h,'diagram.node.change',{ids:[ids[0]],value:20});assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[11,3]);
});

test('linked projection preserves authored titles and detaches a radial snapshot when source becomes negative',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'radial-projection'});call(h,'diagram.node.make',{kind:'circle'});const id=s.shapes[0].name;call(h,'diagram.node.change',{ids:[id],value:5});call(h,'diagram.group.make',{name:'Source',ids:[id]});call(h,'diagram.group.chart',{id:'Source',type:'pie',title:'Authored title'});const chart=s.chartTools.active;call(h,'diagram.group.change',{id:'Source',label:'Renamed source'});assert.equal(s.chartTools.charts[0].title,'Authored title');assert.equal(s.chartTools.charts[0].datasets[0].label,'Renamed source');call(h,'chart.series.change',{chart,index:0,colour:'#123456'});assert.equal(s.chartTools.charts[0].projection.status,'linked');
 assert.equal(call(h,'diagram.node.change',{ids:[id],value:-1}).status,'changed');assert.equal(s.shapes[0].value,-1);assert.deepEqual(s.chartTools.charts[0].datasets[0].data,[5]);assert.equal(s.chartTools.charts[0].projection.reason,'source-values-incompatible');call(h,'diagram.undo',{});assert.equal(s.shapes[0].value,5);assert.equal(s.chartTools.charts[0].projection.status,'linked');
});

test('clear diagram removes its entire native instance and mixed undo restores nodes, links, groups and charts',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'clear-diagram'});call(h,'diagram.node.make',{kind:'rectangle',n:2});const ids=s.shapes.map(n=>n.name);for(const id of ids)call(h,'diagram.node.change',{ids:[id],value:4});call(h,'diagram.link.make',{from:ids[0],to:ids[1]});call(h,'diagram.group.make',{name:'Pair',ids});call(h,'diagram.group.chart',{id:'Pair',type:'bar'});const before=structuredClone({shapes:s.shapes,edges:s.edges,groups:s.groups,chartTools:s.chartTools});
 assert.equal(call(h,'diagram.page.clear',{}).status,'changed');assert.equal(h.observe().objects.length,0);assert.equal(s.shapes.length+s.edges.length+s.groups.length+s.chartTools.charts.length,0);assert.equal(call(h,'diagram.undo',{}).status,'changed');assert.deepEqual(s.shapes,before.shapes);assert.deepEqual(s.edges,before.edges);assert.deepEqual(s.groups,before.groups);assert.deepEqual(s.chartTools.charts,before.chartTools.charts);
 call(h,'diagram.node.select',{ids});assert.equal(call(h,'diagram.node.remove',{ids}).status,'changed');assert.deepEqual(s.selected.shapes,[]);assert.equal(s.shapes.length,0);call(h,'diagram.undo',{});assert.equal(s.shapes.length,2);assert.deepEqual(s.selected.shapes,ids);
});

test('native diagram relations name exact live endpoint IDs and chart parents; dangling endpoint creation refuses atomically',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'native-relations'});call(h,'diagram.node.make',{kind:'circle',n:2});const ids=s.shapes.map(n=>n.name);call(h,'diagram.link.make',{from:ids[0],to:ids[1]});call(h,'chart.make',{type:'bar',title:'Actual parents',labels:['A'],datasets:[{label:'First',data:[2],color:null},{label:'Second',data:[3],color:null}],source:['historical-source-no-longer-live']});const observation=h.observe(),live=new Set(observation.objects.map(o=>o.id)),link=observation.objects.find(o=>o.sourceType==='diagram.sketch.link');assert.deepEqual(link.relations,{from:[ids[0]],to:[ids[1]]});assert.ok(Object.values(link.relations).flat().every(id=>live.has(id)));for(const child of observation.objects.filter(o=>['data.charts.point','data.charts.series'].includes(o.sourceType)))assert.ok(live.has(child.in));const chart=observation.objects.find(o=>o.sourceType==='data.charts.chart');assert.equal(chart.relations,undefined);
 const before=structuredClone(s);assert.equal(call(h,'diagram.link.make',{from:ids[0],to:'absent-exact-id'}).status,'refused');assert.deepEqual(s,before);
});

test('active linked-view relations resolve exact live IDs and chart deletion/ungroup detach without dangling references',async()=>{
 const s=initialDiagramState(),h=await createDiagramHost({state:s,instanceId:'linked-relations'});call(h,'diagram.node.make',{kind:'circle',n:2});const ids=s.shapes.map(n=>n.name);for(const id of ids)call(h,'diagram.node.change',{ids:[id],value:3});call(h,'diagram.group.make',{name:'Pair',ids});call(h,'diagram.group.chart',{id:'Pair',type:'bar'});const chartId=s.chartTools.active;
 const assertLive=()=>{const observation=h.observe(),objects=nativeObservationObjects(observation);assert.equal(compareInstanceObjects(objects,observation).ok,true);const live=new Set(observation.objects.map(o=>o.id));for(const row of observation.objects){for(const ref of [...(row.members??[]),...Object.values(row.relations??{}).flat(),...(row.in?[row.in]:[])])assert.ok(live.has(ref),'dangling '+row.id+' -> '+ref);}return observation;};
 let observation=assertLive();assert.deepEqual(observation.objects.find(o=>o.id===chartId).relations,{sourceGroup:['Pair'],sourceMembers:ids});assert.deepEqual(observation.objects.find(o=>o.id==='Pair').relations,{chart:[chartId]});
 call(h,'chart.remove',{ids:[chartId]});assert.equal(s.groups[0].chartId,undefined);assert.equal(assertLive().objects.find(o=>o.id==='Pair').relations,undefined);call(h,'diagram.undo',{});assertLive();
 call(h,'diagram.node.remove',{ids:[ids[0]]});assert.deepEqual(s.groups[0].members,[ids[1]]);observation=assertLive();assert.equal(observation.objects.find(o=>o.id===chartId).relations,undefined);assert.deepEqual(s.chartTools.charts[0].projection.members,ids);assert.equal(s.chartTools.charts[0].projection.status,'detached');assert.equal(s.groups[0].chartId,undefined);call(h,'diagram.undo',{});assertLive();
 call(h,'diagram.group.ungroup',{id:'Pair'});observation=assertLive();assert.equal(observation.objects.find(o=>o.id===chartId).relations,undefined);assert.equal(s.chartTools.charts[0].projection.sourceGroup,'Pair');assert.equal(s.chartTools.charts[0].projection.status,'detached');assert.equal(s.groups.length,0);const dangling=structuredClone(observation);dangling.objects.find(o=>o.id===chartId).relations={sourceGroup:['Pair']};assert.throws(()=>nativeObservationObjects(dangling),/dangling-native-relation/);
});
