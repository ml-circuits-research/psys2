// The Drawing tab as a SOP area (worlds/art.draw/area.sop): commands become std.acts calls on the w.drawing
// instance, what is drawn is the projection with k.objects, and placement reads the declared geometry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDrawingArea,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

async function area() {
 const state={sop:'',runtime:{view:{}}},host=await createDrawingArea({state});let n=0;
 const run=(command)=>host.invoke(command,toolInvocationContext('drawing-'+(n++),host.observe().version));
 return {state,host,run,view:()=>projectDrawingArea(state)};
}
const drawn=(svg,code)=>(svg.match(new RegExp('data-select="'+code+'"','g'))??[]).length;

const objectsOf=(sop)=>[...sop.matchAll(/^@\S+ w\.drawing\.object .*$/gm)].map(([line])=>Object.fromEntries(['code','drawing','x','y','size']
 .map(key=>[key,line.match(new RegExp(' '+key+'=(\\S+)'))?.[1]]).map(([k,v])=>[k,/^-?\d/.test(v)?Number(v):v])));

test('a made object draws the parts of its k.objects drawing, in a free place, with the colour on its largest part',async()=>{
 const {state,run,view}=await area();
 assert.equal(run('@c drawing.object.make kind="house" color="#0000ff"').status,'changed');
 assert.equal(run('@c drawing.object.make kind="tree"').status,'changed');
 const {svg,objects}=view();
 assert.deepEqual(objects.filter(o=>!o.in).map(o=>[o.id,o.kind]),[['o1','house'],['o2','tree']]);
 assert.ok(objects.some(o=>o.in==='o1'&&o.kind==='roof'),'the parts are observed under their object');
 assert.equal(drawn(svg,'o1'),6);assert.equal(drawn(svg,'o2'),2);
 assert.match(svg,/<rect x="20" y="45" width="60" height="50" fill="#0000ff"\/>/,'the walls take the house colour');
 const [house,tree]=objectsOf(state.sop);
 assert.ok(house.y>350&&tree.y>350,'both stand on the ground, below the horizon of the landscape page');
 assert.ok(Math.abs(house.x-tree.x)>=(house.size+tree.size)/2,'the second object does not overlap the first');
 assert.ok(house.size>=120&&tree.size>=120,'both are drawn at the size of their k.scenes size class (huge)');
});

test('change, part edits, groups and removal update the instance in place',async()=>{
 const {state,run,view}=await area();
 run('@c drawing.object.make kind="house"');
 assert.equal(run('@c drawing.object.change ids="o1" size=240 label="home"').status,'changed');
 assert.equal(run('@c drawing.part.change id="o1" index=2 color="#00ff00"').status,'changed');
 assert.equal(run('@c drawing.part.change id="o1" index=2 color="#ff00ff"').status,'changed');
 assert.equal(run('@c drawing.part.remove id="o1" index=0').status,'changed');
 assert.equal((state.sop.match(/^@\S+ w\.drawing\.part /gm)??[]).length,2,'one edit per part, changed in place');
 const {svg}=view();
 assert.equal(drawn(svg,'o1'),6,'five parts and the label');assert.match(svg,/fill="#ff00ff"/);assert.match(svg,/>home</);
 run('@c drawing.object.make kind="sun"');
 assert.equal(run('@c drawing.object.group ids="o1" ids="o2" label="scene"').status,'changed');
 assert.match(state.sop,/w\.drawing\.group .*member=/);
 assert.equal(run('@c drawing.object.remove ids="o2"').status,'changed');
 assert.equal(run('@c drawing.page.clear').status,'changed');
 assert.deepEqual(view().objects,[]);
});

test('what is not declared is refused, not simulated',async()=>{
 const {run}=await area();
 run('@c drawing.object.make kind="star" x=200 y=200 size=100');
 assert.equal(run('@c drawing.part.extract id="o1" index=0').reason,'part-extract-shape-not-declared','a polygon part has no basic shape to become');
 assert.equal(run('@c drawing.catalog.make name="no such drawing"').reason,'drawing-not-in-catalog');
});

test('a part moves and resizes about its centre in page units and keeps its place on the object',async()=>{
 const {state,run,view}=await area();
 run('@c drawing.object.make kind="house" x=500 y=400 size=200');
 assert.equal(run('@c drawing.part.place id="o1" index=2 x=520 y=300').status,'changed');
 assert.equal(run('@c drawing.part.change id="o1" index=2 width=100 color="#00ff00"').status,'changed');
 assert.equal((state.sop.match(/^@\S+ w\.drawing\.part /gm)??[]).length,1,'one edit holds the move, the size and the colour');
 let roof=view().inputs['o1.2'];
 assert.deepEqual([roof.x,roof.y,roof.width,roof.color],[520,300,100,'#00ff00']);
 assert.match(view().svg,/<polygon points="[^"]+" fill="#00ff00"\/>/);
 run('@c drawing.object.place ids="o1" x=300 y=400');
 roof=view().inputs['o1.2'];
 assert.deepEqual([roof.x,roof.y],[320,300],'the part moves with its object');
 run('@c drawing.object.make kind="star" x=800 y=200 size=100');
 assert.equal(run('@c drawing.part.place id="o2" index=0 x=850 y=200').status,'changed','a part drawn through its points moves too');
 assert.equal(view().inputs['o2.0'].x,850);assert.match(view().svg,/translate\(850 /);
});

test('a box-shaped part is extracted as an object of its basic shape, where and as it was drawn',async()=>{
 const {state,run,view}=await area();
 run('@c drawing.object.make kind="house" x=600 y=400 size=200');
 const body=view().inputs['o1.1'];
 assert.equal(run('@c drawing.part.extract id="o1" index=1').status,'changed');
 const made=view().objects.find(o=>o.id==='o2');
 assert.deepEqual([made.kind,Number(made.x),Number(made.y)],['rectangle',body.x,body.y]);
 assert.deepEqual([view().inputs.o2.width,view().inputs.o2.height,view().inputs.o2.fill],[body.width,body.height,body.color]);
 assert.ok(!view().objects.some(o=>o.id==='o1.1'),'the part left its object');
 assert.equal(state.runtime.view.selected,'o2');
});

test('objects fit into a box together; a move with the same box size changes only their places',async()=>{
 const {state,run,view}=await area();
 run('@c drawing.object.make kind="circle" x=200 y=200 size=100');
 run('@c drawing.object.make kind="square" x=400 y=200 size=100');
 assert.equal(run('@c drawing.objects.transform ids="o1" ids="o2" x=160 y=200 width=300 height=100').status,'changed');
 assert.deepEqual(view().boxes,{o1:{x0:160,y0:200,x1:260,y1:300},o2:{x0:360,y0:200,x1:460,y1:300}});
 assert.doesNotMatch(state.sop,/width=/,'a move writes no sides');
 assert.equal(run('@c drawing.objects.transform ids="o1" ids="o2" x=100 y=100 width=600 height=50').status,'changed');
 assert.deepEqual(view().boxes,{o1:{x0:100,y0:100,x1:300,y1:150},o2:{x0:500,y0:100,x1:700,y1:150}});
});

test('the area declares the geometry placement reads: the page frame and a box per object',async()=>{
 const {host,run}=await area();
 run('@c drawing.object.make kind="lake" x=400 y=500 size=200');
 const spatial=host.observeSpatial();
 assert.equal(spatial.frame,'drawing.canvas');
 const lake=spatial.boxes.find(box=>box.entity==='o1');
 assert.deepEqual([lake.min_x,lake.min_y,lake.max_x,lake.max_y],[300,400,500,600]);
 assert.deepEqual(spatial.occupants,['o1']);
});
