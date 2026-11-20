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

test('a made object draws the parts of its k.objects drawing, in a free slot, with the colour on its largest part',async()=>{
 const {state,run,view}=await area();
 assert.equal(run('@c drawing.object.make kind="house" color="#0000ff"').status,'changed');
 assert.equal(run('@c drawing.object.make kind="tree"').status,'changed');
 const {svg,objects}=view();
 assert.deepEqual(objects.filter(o=>!o.in).map(o=>[o.id,o.kind]),[['o1','house'],['o2','tree']]);
 assert.ok(objects.some(o=>o.in==='o1'&&o.kind==='roof'),'the parts are observed under their object');
 assert.equal(drawn(svg,'o1'),6);assert.equal(drawn(svg,'o2'),2);
 assert.match(svg,/<rect x="20" y="45" width="60" height="50" fill="#0000ff"\/>/,'the walls take the house colour');
 assert.match(state.sop,/drawing=tree x=250 y=350/,'the second object goes to the next free slot');
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
 run('@c drawing.object.make kind="house"');
 assert.equal(run('@c drawing.part.change id="o1" index=1 width=4').reason,'part-size-not-declared');
 assert.equal(run('@c drawing.catalog.make name="no such drawing"').reason,'drawing-not-in-catalog');
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
