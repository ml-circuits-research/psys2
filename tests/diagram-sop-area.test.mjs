// The Diagram tab as a SOP area (worlds/diagram.sketch/area.sop): commands become std.acts calls on a w.diagram
// instance; the layout (levels by graph depth, rows, routes through the gaps) is derived in SOP and drawn as it is.
// Every state here is made through the area's own commands.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramArea,projectDiagramArea,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

async function area() {
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke(command,toolInvocationContext('diagram-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const boxes=(host)=>Object.fromEntries(host.observeSpatial().boxes.map(box=>[box.entity,box]));
// The polyline of each edge, as drawn: [[x,y],...].
const routes=(svg)=>Object.fromEntries([...svg.matchAll(/<g [^>]*data-select="(e\d+)"><polyline points="([^"]+)"/g)]
 .map(([,id,points])=>[id,points.split(' ').map(pair=>pair.split(',').map(Number))]));
const overlap=(a,b)=>a.min_x<b.max_x&&b.min_x<a.max_x&&a.min_y<b.max_y&&b.min_y<a.max_y;
// Whether an axis-parallel segment passes through the inside of a box.
const crosses=([x1,y1],[x2,y2],b)=>{
 const [lx,hx]=[Math.min(x1,x2),Math.max(x1,x2)],[ly,hy]=[Math.min(y1,y2),Math.max(y1,y2)];
 return lx<b.max_x-1&&hx>b.min_x+1&&ly<b.max_y-1&&hy>b.min_y+1;
};
const nodeBoxes=(host,state)=>{const all=boxes(host),nodes=diagramAreaStateWorld(state).ofType('w.diagram.node').map(node=>node.attrs.code[0]);return Object.fromEntries(nodes.map(code=>[code,all[code]]));};
const ends=(state)=>Object.fromEntries(diagramAreaStateWorld(state).ofType('w.diagram.edge').map(edge=>{
 const world=diagramAreaStateWorld(state),code=(ref)=>world.get(ref.slice(1)).attrs.code[0];
 return [edge.attrs.code[0],[code(edge.attrs.from[0]),code(edge.attrs.to[0])]];
}));
/** No two nodes overlap; every edge leaves its source and enters its target; no route crosses another node. */
function assertLayout(host,state,svg){
 const nodes=nodeBoxes(host,state),codes=Object.keys(nodes);
 for(const [i,a] of codes.entries())for(const b of codes.slice(i+1))assert.ok(!overlap(nodes[a],nodes[b]),a+' overlaps '+b);
 const drawn=routes(svg);
 for(const [edge,[from,to]] of Object.entries(ends(state))){
  const line=drawn[edge];assert.ok(line?.length>=2,edge+' is drawn');
  const near=(p,b)=>p[0]>=b.min_x-1&&p[0]<=b.max_x+1&&p[1]>=b.min_y-1&&p[1]<=b.max_y+1;
  assert.ok(near(line[0],nodes[from]),edge+' leaves '+from);assert.ok(near(line.at(-1),nodes[to]),edge+' enters '+to);
  for(let k=1;k<line.length;k++)for(const code of codes)if(code!==from&&code!==to)assert.ok(!crosses(line[k-1],line[k],nodes[code]),edge+' crosses '+code);
 }
}

test('nodes and edges: codes in the instance, levels top to bottom, routes that cross no node',async()=>{
 const {state,host,ok,run,view}=await area();
 ok('@c diagram.node.make kind="ellipse" label="Start"');
 ok('@c diagram.node.make kind="rectangle" label="Boil water"');
 ok('@c diagram.node.make kind="diamond" label="Hot enough?"');
 ok('@c diagram.node.make kind="rectangle" label="Pour" colour="green"');
 ok('@c diagram.node.make kind="rectangle" label="Wait"');
 ok('@c diagram.node.make kind="ellipse" label="Drink"');
 for(const [a,b] of [[1,2],[2,3],[3,4],[3,5],[5,3],[4,6],[1,6]])ok(`@c diagram.link.make from="n${a}" to="n${b}"`);
 assert.equal((state.sop.match(/^@\S+ w\.diagram\.node /gm)??[]).length,6);
 assert.doesNotMatch(state.sop,/ x=/,'positions are derived, not stored');
 const {svg,objects}=view(),y=Object.fromEntries(objects.filter(o=>o.binding==='diagram.node').map(o=>[o.id,Number(o.y)]));
 assert.ok(y.n1<y.n2&&y.n2<y.n3&&y.n3<y.n4&&y.n4<y.n6,'each edge goes down a level');
 assert.equal(y.n4,y.n5,'two branches share a level');
 assert.ok(y.n6>y.n4,'the edge n1 -> n6 does not pull n6 up: the longest path sets its level');
 assertLayout(host,state,svg);
 assert.match(svg,/>Hot enough\?</);
 assert.equal(run('@c diagram.link.make from="n1" to="n2"').reason,'link-exists');
 assert.equal(run('@c diagram.link.make from="n1" to="n9"').reason,'missing-endpoint');
});

test('a new node takes a free place in its row; connecting it moves it under its parent',async()=>{
 const {state,host,ok,view}=await area();
 ok('@c diagram.node.make kind="rectangle" label="A"');ok('@c diagram.node.make kind="rectangle" label="B"');
 const before=view().objects.filter(o=>o.binding==='diagram.node');
 assert.equal(before[0].y,before[1].y,'unconnected nodes share the first row');
 assertLayout(host,state,view().svg);
 ok('@c diagram.link.make from="n1" to="n2"');
 const after=Object.fromEntries(view().objects.filter(o=>o.binding==='diagram.node').map(o=>[o.id,o]));
 assert.ok(Number(after.n2.y)>Number(after.n1.y));assert.equal(after.n1.x,after.n2.x,'a single child is aligned under its parent');
});

test('rows, columns and grids: arrangements and groups contain their members',async()=>{
 const {state,host,ok,run,view}=await area();
 ok('@c diagram.node.make kind="circle" n=3 layout="row" colour="orange"');
 assert.match(state.sop,/w\.diagram\.group .*framed=false/,'a row of new nodes is an arrangement');
 const row=nodeBoxes(host,state);
 assert.ok(row.n1.min_y===row.n2.min_y&&row.n1.max_x<=row.n2.min_x&&row.n2.max_x<=row.n3.min_x,'in a row, left to right');
 ok('@c diagram.node.make kind="rectangle" label="Sparrow"');ok('@c diagram.node.make kind="rectangle" label="Eagle"');
 ok('@c diagram.group.make name="birds" label="Birds" ids="n4" ids="n5"');
 ok('@c diagram.group.layout id="birds" layout="column"');
 const all=boxes(host);
 assert.ok(all.n4.max_y<=all.n5.min_y&&all.n4.min_x===all.n5.min_x,'in a column, top to bottom');
 for(const member of ['n4','n5'])assert.ok(all[member].min_x>=all.birds.min_x&&all[member].max_x<=all.birds.max_x&&all[member].min_y>=all.birds.min_y&&all[member].max_y<=all.birds.max_y,member+' inside its group');
 assert.ok(!overlap(all.birds,all.n1)&&!overlap(all.birds,all.n3),'a group does not cover other nodes');
 assert.deepEqual(host.observeSpatial().relations.filter(r=>r.object==='birds').map(r=>r.subject).sort(),['n4','n5']);
 ok('@c diagram.link.make from="n1" to="n4"');ok('@c diagram.link.make from="n4" to="n5"');ok('@c diagram.link.make from="n1" to="n3"');
 assertLayout(host,state,view().svg);
 ok('@c diagram.group.layout id="birds" layout="grid"');ok('@c diagram.group.resize id="birds" scale=0.5');
 assert.ok(boxes(host).n4.max_x-boxes(host).n4.min_x<100,'a scaled group draws its members smaller');
 assert.equal(run('@c diagram.group.make name="birds" ids="n2"').reason,'invalid-or-duplicate-group-name');
 assert.equal(run('@c diagram.group.make name="n2" ids="n2"').reason,'invalid-or-duplicate-group-name');
 assert.equal(run('@c diagram.group.make name="other" ids="n4"').reason,'node-already-in-group');
 ok('@c diagram.group.make name="pets" ids="n1" ids="n2"');
 assert.equal((state.sop.match(/w\.diagram\.member .*group=\$w_diagram_group1 /g)??[]).length,1,'grouped nodes leave their arrangement');
 ok('@c diagram.node.layout ids="n1" ids="n2" layout="tree"');
 ok('@c diagram.group.change id="birds" label="Big birds" colour="blue" size="large"');
 assert.match(state.sop,/label="Big birds"/);assert.equal((state.sop.match(/colour=blue size=large/g)??[]).length,2,'colour and size go to the members');
 ok('@c diagram.group.ungroup id="birds"');
 assert.match(state.sop,/label=Eagle/,'ungrouping keeps the members');
 ok('@c diagram.group.select id="pets"');assert.equal(state.runtime.view.selected,'pets');
 ok('@c diagram.group.remove id="pets"');
 assert.doesNotMatch(state.sop,/code=n1 /,'removing a group removes its members');
 assert.equal(run('@c diagram.group.remove id="pets"').reason,'missing-group');
});

test('changes, selection, placement and removal update the instance in place',async()=>{
 const {state,host,ok,run,view}=await area();
 ok('@c diagram.node.make kind="rectangle" label="A"');ok('@c diagram.node.make kind="rectangle" label="B"');ok('@c diagram.node.make kind="circle" label="C"');
 ok('@c diagram.node.change ids="n1" ids="n2" colour="navy" size="small"');ok('@c diagram.node.change ids="n1" label="Alpha" value=5');
 assert.match(state.sop,/code=n1 .*label=Alpha/);assert.match(view().svg,/fill="#000080"/);assert.match(view().svg,/fill="#ffffff"[^>]*>Alpha</,'a dark node gets a white label');
 assert.equal(run('@c diagram.node.change ids="n1"').reason,'missing-property');
 assert.equal(run('@c diagram.node.change ids="zz" colour="red"').reason,'missing-target');
 ok('@c diagram.node.select ids="n2"');assert.equal(state.runtime.view.selected,'n2');
 assert.ok(view().controls.find(c=>c.label==='Delete').available,'the selection enables its controls');
 ok('@c diagram.node.resize ids="n3" width=200 height=90');
 assert.equal(boxes(host).n3.max_x-boxes(host).n3.min_x,200);
 ok('@c diagram.node.place ids="n1" x=150 y=600');
 const a=boxes(host).n1;assert.deepEqual([(a.min_x+a.max_x)/2,(a.min_y+a.max_y)/2],[150,600]);assert.match(state.sop,/code=n1 .*pinned=true/);
 ok('@c diagram.node.place ids="n1" ids="n2" x=500 y=600');
 const [p,q]=[boxes(host).n1,boxes(host).n2];assert.equal((p.min_x+p.max_x+q.min_x+q.max_x)/4,500,'several placed nodes keep their spacing about the point');
 ok('@c diagram.node.layout ids="n1" ids="n2" layout="tree"');assert.match(state.sop,/code=n1 .*pinned=false/,'back in the layout');
 ok('@c diagram.link.make from="n1" to="n3"');ok('@c diagram.link.make from="n2" to="n3"');
 ok('@c diagram.link.change ids="e1" label="yes" style="dashed" arrow="both" colour="red" width=4');
 const svg=view().svg;assert.match(svg,/stroke-dasharray="8 5"/);assert.match(svg,/stroke-width="4"/);assert.equal((svg.match(/data-select="e1"><polygon/g)??[]).length,2,'both ends have a head');
 ok('@c diagram.link.change ids="e2" from="n3" to="n1"');assert.deepEqual(ends(state).e2,['n3','n1']);
 assert.equal(run('@c diagram.link.change ids="e2"').reason,'missing-property');
 assert.equal(run('@c diagram.link.change ids="e2" to="nope"').reason,'missing-endpoint');
 ok('@c diagram.link.select ids="e2" nodes="n1"');assert.equal(state.runtime.view.selected,'e2');
 ok('@c diagram.link.remove ids="e1"');assert.deepEqual(Object.keys(ends(state)),['e2']);
 ok('@c diagram.node.remove ids="n3"');assert.deepEqual(Object.keys(ends(state)),[],'removing a node removes its edges');
 ok('@c diagram.link.make from="n1" to="n2"');assert.deepEqual(ends(state),{e1:['n1','n2']},'the next code follows the highest one left');
 ok('@c diagram.selection.remove nodes="n2" links="e1"');assert.doesNotMatch(state.sop,/code=n2 /);
 ok('@c diagram.ids.show mode="always"');assert.match(view().svg,/>n1</);
 ok('@c diagram.ids.show mode="off"');assert.doesNotMatch(view().svg,/>n1</);
 ok('@c diagram.page.clear');assert.equal(state.sop,'');assert.deepEqual(view().objects.map(o=>o.id),['page'],'only the page is left');
});

test('charts: bars and points from the members\' values; what is not declared is refused',async()=>{
 const {state,host,ok,run,view}=await area();
 ok('@c diagram.group.chart.make label="Legs" labels="Cat" labels="Bird" labels="Spider" values=4 values=2 values=8 layout="bar"');
 const b=boxes(host),h=(id)=>b[id].max_y-b[id].min_y;
 assert.equal(h('n3'),160);assert.equal(h('n1'),80);assert.equal(h('n2'),40);
 assert.equal(b.n1.max_y,b.n3.max_y,'bars share a baseline');
 assert.match(view().svg,/>Spider</);
 ok('@c diagram.group.layout id="g1" layout="line"');
 assert.match(view().svg,/data-select="g1"><polyline/,'a line chart joins its points');
 ok('@c diagram.group.chart.make label="P" labels="a" values=1 layout="pie"');
 assert.equal(run('@c diagram.group.chart.make label="P" labels="a" labels="b" values=1 layout="bar"').reason,'invalid-chart-data');
 ok('@c diagram.node.make kind="rectangle" label="no value"');ok('@c diagram.group.make name="plain" ids="n5"');
 assert.equal(run('@c diagram.group.layout id="plain" layout="bar"').reason,'explicit-numeric-values-required');
 assert.equal(run('@c diagram.group.layout id="plain" layout="pie"').reason,'explicit-numeric-values-required');
 assert.equal(run('@c diagram.group.layout id="plain" layout="radial"').reason,'group-layout-not-declared');
});

test('every declared operation is compiled or refused with its reason, never simulated',async()=>{
 const {host,ok,run}=await area();
 ok('@c diagram.node.make kind="rectangle" label="A"');ok('@c diagram.node.make kind="rectangle" label="B"');ok('@c diagram.link.make from="n1" to="n2"');
 ok('@c diagram.group.make name="g" ids="n2"');
 const refused={'diagram.layout':'missing-property','diagram.node.split id="zz"':'missing-target','diagram.node.insert link="e9"':'missing-target',
  'diagram.group.chart id="g" type="bar"':'chart-composition-not-in-area','diagram.group.chart.adopt id="chart:1"':'chart-composition-not-in-area',
  'diagram.group.layout id="g" layout="free"':'group-layout-not-declared','diagram.page.change':'missing-property'};
 for(const [command,reason] of Object.entries(refused))assert.equal(run('@c '+command).reason,reason,command);
 // The composed data.charts commands are not this area's instance: each is refused, none silently accepted.
 const charts=host.bindings().filter(op=>op.id.startsWith('chart.'));
 assert.ok(charts.length>0);
 for(const op of charts){const args=Object.entries(op.params).filter(([,p])=>p.required).map(([k,p])=>k+'='+(p.type==='array'?'"x"':p.enum?JSON.stringify(p.enum[0]):p.type==='number'||p.type==='integer'?(p.min??1):'"x"')).join(' ');
  const result=run('@c '+op.id+' '+args);assert.equal(result.status,'refused',op.id);assert.ok(result.reason,op.id+' has a reason');}
 // Undo and redo belong to the application's journal; observe reads the view.
 const own=host.bindings().map(op=>op.id).filter(id=>id.startsWith('diagram.'));
 assert.deepEqual(own.length,54);
});

test('the area declares its geometry and measures a command for placement',async()=>{
 const {host,ok}=await area();
 ok('@c diagram.node.make kind="rectangle" label="A"');
 const spatial=host.observeSpatial();
 assert.equal(spatial.frame,'diagram.canvas');assert.deepEqual(spatial.occupants,['n1']);
 const size=host.measureSpatial('@c diagram.node.make kind="circle" size="large"');
 assert.ok(Math.abs(size.width-91.8)<1e-6&&Math.abs(size.height-91.8)<1e-6,'a large circle is 1.35 times 68');
});
