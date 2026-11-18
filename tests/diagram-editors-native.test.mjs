import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {readInstanceState,serializeInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
import {K} from '../worlds/diagram.sketch/core.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
import {readFile} from 'node:fs/promises';import {snapshotNativeInstances,restoreNativeInstances} from '../src/dialog/instance-persistence.mjs';
const invoke=(host,operation,args)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
async function fixture(){const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'diagram-editors'});return {state,host};}
test('native multi-node movement preserves offsets and exact resize has observable dimensions',async()=>{
 const {state,host}=await fixture();invoke(host,'diagram.node.make',{kind:'rectangle',n:2});const ids=state.shapes.map(node=>node.name),dx=state.shapes[1].x-state.shapes[0].x,dy=state.shapes[1].y-state.shapes[0].y;
 assert.equal(invoke(host,'diagram.node.place',{ids,x:400,y:300}).status,'changed');assert.equal(state.shapes[1].x-state.shapes[0].x,dx);assert.equal(state.shapes[1].y-state.shapes[0].y,dy);
 assert.equal(invoke(host,'diagram.node.resize',{ids,width:160,height:90}).status,'changed');for(const node of state.shapes){assert.equal(node.w,160);assert.equal(node.h,90);}const facts=nativeObservationObjects(host.observe());assert.deepEqual(facts.find(row=>row.id===ids[0]).attributes.width,[160]);
 const snapshot=structuredClone(state);assert.equal(invoke(host,'diagram.node.resize',{ids,width:-1,height:90}).status,'refused');assert.deepEqual(state,snapshot);
});
test('real connections support selection, authored label/style/colour/arrow/width, endpoint edits and undo',async()=>{
 const {state,host}=await fixture();invoke(host,'diagram.node.make',{kind:'rectangle',n:3});const [a,b,c]=state.shapes.map(node=>node.name);assert.equal(invoke(host,'diagram.link.make',{from:a,to:b}).status,'changed');const id=state.edges[0].id;assert.deepEqual(state.selected.edges,[id]);
 assert.equal(invoke(host,'diagram.link.select',{ids:[id],nodes:[a]}).status,'changed');assert.deepEqual(state.selected.shapes,[a]);
 assert.equal(invoke(host,'diagram.link.change',{ids:[id],label:'Flow',style:'dashed',colour:'red',arrow:'both',width:4,to:c}).status,'changed');assert.equal(state.edges[0].to,c);const facts=nativeObservationObjects(host.observe()).find(row=>row.id===id);assert.deepEqual(facts.attributes.label,['Flow']);assert.deepEqual(facts.attributes.width,[4]);assert.deepEqual(facts.relations.to,[c]);
 assert.equal(invoke(host,'diagram.undo',{}).status,'changed');assert.equal(state.edges[0].to,b);assert.equal(state.edges[0].properties,undefined);
});
test('numeric chart creation produces primary group and actual editable geometry, not a separate chart object',async()=>{
 const {state,host}=await fixture();assert.equal(invoke(host,'diagram.group.chart.make',{label:'Counts',labels:['One','Two','Three'],values:[2,5,3],layout:'bar'}).status,'changed');const group=state.groups[0],ids=[...group.members];assert.match(group.name,/^g\d+$/);assert.equal(state.chartTools.charts.length,0);assert.equal(group.label,'Counts');assert.equal(state.shapes.length,3);assert.ok(state.shapes.every(node=>node.w>0&&node.h>0));assert.equal(state.shapes[1].h/state.shapes[0].h,2.5);
 assert.equal(invoke(host,'diagram.group.layout',{id:group.name,layout:'line'}).status,'changed');assert.equal(state.edges.length,2);const links=[...state.groups[0].links],before=state.edges.map(edge=>edge.id);assert.deepEqual(nativeObservationObjects(host.observe()).find(row=>row.id===group.name).relations.links,links);
 assert.equal(invoke(host,'diagram.node.change',{ids:[ids[0]],value:4}).status,'changed');assert.deepEqual(state.edges.map(edge=>edge.id),before,'same numeric line retains actual link IDs');
 assert.equal(invoke(host,'diagram.group.ungroup',{id:group.name}).status,'changed');assert.equal(state.groups.length,0);assert.deepEqual(state.shapes.map(node=>node.name),ids);assert.deepEqual(state.edges.map(edge=>edge.id),links);assert.equal(invoke(host,'diagram.node.change',{ids:[ids[0]],label:'Editable point'}).status,'changed');
});
test('pie and doughnut members are real sector nodes, preserve values, and can be ungrouped and resized',async()=>{
 const {state,host}=await fixture();assert.equal(invoke(host,'diagram.group.chart.make',{label:'Parts',labels:['A','B'],values:[1,3],layout:'pie'}).status,'changed');const group=state.groups[0],member=state.shapes[0];assert.equal(member.shape,'sector');assert.equal(member.endAngle-member.startAngle,Math.PI/2);assert.equal(member.innerRadius,0);
 assert.equal(invoke(host,'diagram.group.layout',{id:group.name,layout:'doughnut'}).status,'changed');assert.equal(state.shapes[0].innerRadius,.52);assert.deepEqual(state.shapes.map(node=>node.value),[1,3]);
 assert.equal(invoke(host,'diagram.group.ungroup',{id:group.name}).status,'changed');assert.equal(invoke(host,'diagram.node.resize',{ids:[member.name],width:180,height:180}).status,'changed');assert.equal(invoke(host,'diagram.node.change',{ids:[member.name],label:'Edited sector'}).status,'changed');assert.equal(state.shapes[0].label,'Edited sector');
 const session={isession:{state:{'diagram.sketch':state}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}},records=await snapshotNativeInstances(session),target={isession:{state:{}},engine:session.engine};await restoreNativeInstances(target,records);assert.deepEqual(target.isession.state['diagram.sketch'],state);
});
test('invalid numeric group data refuses atomically and ordinary labels are separate from readonly identity',async()=>{
 const {state,host}=await fixture(),before=structuredClone(state);assert.equal(invoke(host,'diagram.group.chart.make',{label:'Invalid',labels:['A'],values:[-1],layout:'pie'}).status,'refused');assert.deepEqual(state,before);
 invoke(host,'diagram.node.make',{kind:'rectangle',n:2});const ids=state.shapes.map(node=>node.name);assert.equal(invoke(host,'diagram.group.make',{name:'g1',label:'Human label',ids}).status,'changed');assert.equal(state.groups[0].name,'g1');assert.equal(state.groups[0].label,'Human label');assert.equal(invoke(host,'diagram.group.change',{id:'g1',label:'Other label'}).status,'changed');assert.equal(state.groups[0].name,'g1');assert.equal(invoke(host,'diagram.group.change',{id:'g1',label:''}).status,'changed');assert.equal(state.groups[0].label,'');assert.equal(state.groups[0].name,'g1');
});

test('published explicit boxes and legacy styled edges retain their original optional observation contract',async()=>{
 const {state,host}=await fixture();invoke(host,'diagram.node.make',{kind:'rectangle',n:2});state.shapes[0].w=155;state.shapes[0].h=87;invoke(host,'diagram.link.make',{from:state.shapes[0].name,to:state.shapes[1].name});state.edges[0].label='Legacy label';state.edges[0].style='dashed';
 const objects=nativeObservationObjects(host.observe());assert.equal(objects.find(row=>row.id===state.shapes[0].name).attributes.width,undefined);assert.equal(objects.find(row=>row.id===state.edges[0].id).attributes.label,undefined);
 const source={isession:{state:{'diagram.sketch':state}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}},records=await snapshotNativeInstances(source),target={isession:{state:{}},engine:source.engine};await restoreNativeInstances(target,records);assert.deepEqual(await snapshotNativeInstances(target),records);
});

test('group scaling changes actual child geometry; deleting a member or mixed selection leaves no dangling group links',async()=>{
 const {state,host}=await fixture();invoke(host,'diagram.group.chart.make',{label:'Line',labels:['A','B','C'],values:[2,5,3],layout:'line'});const group=state.groups[0],before=state.shapes.map(node=>({x:node.x,y:node.y,w:node.w,h:node.h})),dx=before[1].x-before[0].x;
 assert.equal(invoke(host,'diagram.group.resize',{id:group.name,scale:2}).status,'changed');assert.equal(state.shapes[1].x-state.shapes[0].x,dx*2);assert.equal(state.shapes[0].w,before[0].w*2);assert.equal(state.groups[0].layout,'free');
 const nodeId=state.shapes[0].name,edgeId=state.edges.at(-1).id;assert.equal(invoke(host,'diagram.selection.remove',{nodes:[nodeId],links:[edgeId]}).status,'changed');assert.ok(state.groups.every(group=>group.members.every(id=>state.shapes.some(node=>node.name===id))));nativeObservationObjects(host.observe());
});

test('manual geometry edits stop declaring numeric layouts and group size facts use actual rendered dimensions',async()=>{
 for(const operation of ['diagram.node.resize','diagram.node.place','diagram.node.change','diagram.group.change']){
  const {state,host}=await fixture();invoke(host,'diagram.group.chart.make',{label:'Numeric',labels:['A','B'],values:[2,4],layout:'bar'});const group=state.groups[0],node=state.shapes[0],args=operation==='diagram.node.resize'?{ids:[node.name],width:120,height:80}:operation==='diagram.node.place'?{ids:[node.name],x:50,y:80}:operation==='diagram.node.change'?{ids:[node.name],size:'huge'}:{id:group.name,size:'huge'};
  assert.equal(invoke(host,operation,args).status,'changed');assert.equal(state.groups[0].layout,'free');assert.deepEqual(state.shapes.map(node=>node.value),[2,4]);
  if(operation==='diagram.group.change')for(const node of state.shapes){const dimensions=K.dims(node),object=nativeObservationObjects(host.observe()).find(row=>row.id===node.name);assert.deepEqual(object.attributes.width,[dimensions.w]);assert.deepEqual(object.attributes.height,[dimensions.h]);}
 }
});

test('native text and shape creation accept authored labels at actual pointer coordinates',async()=>{
 const {state,host}=await fixture();assert.equal(invoke(host,'diagram.node.make',{kind:'text',label:'A real text node',x:130,y:85}).status,'changed');assert.equal(state.shapes[0].shape,'text');assert.equal(state.shapes[0].label,'A real text node');assert.equal(state.shapes[0].x,130);assert.equal(state.shapes[0].y,85);assert.match(state.shapes[0].name,/^x[0-9]+$/);
});

test('archive validation compares actual renderer geometry rather than its optional authored-field cache',async()=>{
 const {state,host}=await fixture();invoke(host,'diagram.group.chart.make',{label:'Sectors',labels:['A','B'],values:[2,3],layout:'pie'});
 const world='diagram.sketch',instanceId=host.observe().instanceId,revision=0;
 const wires=serializeInstanceState({world,instanceId,revision,schemaVersion:'psys2.native-instance/1',
  objects:nativeObservationObjects(host.observe()),projection:state,
  metadata:{projection:'native-host-data/1',knowledge:{repository:CATALOG_PIN.repo,version:CATALOG_PIN.commit}},
 });
 for(const property of ['w','startAngle']){
  const archive=readInstanceState(wires);archive.projection.shapes[0][property]+=1;
  const target={isession:{state:{}},engine:{}};
  await assert.rejects(restoreNativeInstances(target,[{world,instanceId,revision,wires:serializeInstanceState(archive)}]),/instance-projection-mismatch/);
 }
});

test('Object ID view actions are declared, observed conditionally and independent of content undo',async()=>{
 const {state,host}=await fixture();assert.equal(host.observe().objects.some(row=>row.id==='diagram.page'),false);
 const before=Date.now();assert.equal(invoke(host,'diagram.ids.show',{mode:'temporary'}).status,'changed');assert.equal(state.idDisplay.mode,'temporary');assert.ok(state.idDisplay.expiresAt>=before+4000&&state.idDisplay.expiresAt<=Date.now()+4000);const page=nativeObservationObjects(host.observe()).find(row=>row.id==='diagram.page');assert.deepEqual(page.attributes.mode,['temporary']);assert.deepEqual(page.attributes.expiresAt,[state.idDisplay.expiresAt]);
 invoke(host,'diagram.node.make',{kind:'rectangle'});invoke(host,'diagram.ids.show',{mode:'off'});assert.equal(invoke(host,'diagram.undo',{}).status,'changed');assert.equal(state.idDisplay.mode,'off');assert.equal(state.shapes.length,0);invoke(host,'diagram.ids.show',{mode:'always'});invoke(host,'diagram.page.clear',{});assert.equal(state.idDisplay.mode,'always');
 const session={isession:{state:{'diagram.sketch':state}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}},records=await snapshotNativeInstances(session),target={isession:{state:{}},engine:session.engine};await restoreNativeInstances(target,records);assert.deepEqual(await snapshotNativeInstances(target),records);
});
