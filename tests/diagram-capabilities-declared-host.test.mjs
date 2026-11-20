// The Diagram editor's capabilities (specs/diagram-capabilities.md) on its SOP area: every new declared operation
// compiles to std.acts calls or an explicit refusal; layouts are checked by their geometry (no overlaps, crossings
// reduced, exact alignment), styles by what is drawn. Every state is made through the area's own commands.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramArea,projectDiagramArea,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

async function area() {
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke('@c '+command,toolInvocationContext('cap-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const boxes=(host)=>Object.fromEntries(host.observeSpatial().boxes.map(box=>[box.entity,box]));
const nodeCodes=(state)=>diagramAreaStateWorld(state).ofType('w.diagram.node').map(node=>node.attrs.code[0]);
const nodeBoxes=(host,state)=>{const all=boxes(host);return Object.fromEntries(nodeCodes(state).map(code=>[code,all[code]]));};
const centre=(b)=>[(b.min_x+b.max_x)/2,(b.min_y+b.max_y)/2];
const overlap=(a,b)=>a.min_x<b.max_x-0.5&&b.min_x<a.max_x-0.5&&a.min_y<b.max_y-0.5&&b.min_y<a.max_y-0.5;
const noOverlaps=(host,state)=>{const b=nodeBoxes(host,state),c=Object.keys(b);for(const [i,x] of c.entries())for(const y of c.slice(i+1))assert.ok(!overlap(b[x],b[y]),x+' overlaps '+y);};
const ends=(state)=>{const w=diagramAreaStateWorld(state),code=(ref)=>w.get(ref.slice(1)).attrs.code[0];
 return Object.fromEntries(w.ofType('w.diagram.edge').map(e=>[e.attrs.code[0],[code(e.attrs.from[0]),code(e.attrs.to[0])]]));};
const attr=(state,code,key)=>{const f=diagramAreaStateWorld(state).ofType('w.diagram.node').find(n=>n.attrs.code[0]===code);return f?.attrs[key]?.[0]?.replace(/^"|"$/g,'');};
// Crossings between links drawn as straight segments from centre to centre.
function crossings(host,state){
 const b=nodeBoxes(host,state),segs=Object.values(ends(state)).map(([a,c])=>[a,c,centre(b[a]),centre(b[c])]);
 const ccw=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);let k=0;
 for(const [i,s] of segs.entries())for(const t of segs.slice(i+1)){if(new Set([s[0],s[1],t[0],t[1]]).size<4)continue;
  if(ccw(s[2],s[3],t[2])*ccw(s[2],s[3],t[3])<0&&ccw(t[2],t[3],s[2])*ccw(t[2],t[3],s[3])<0)k++;}
 return k;
}

test('shapes: the new kinds are drawn; a role without a kind takes its flowchart shape',async()=>{
 const {state,ok,view}=await area();
 for(const kind of ['cylinder','cloud','actor','note','document','oval','parallelogram','double_rectangle','rounded_rectangle'])ok(`diagram.node.make kind="${kind}" label="${kind}"`);
 ok('diagram.node.make role="decision" label="Hot?"');ok('diagram.node.make role="database" label="Users"');ok('diagram.node.make role="start" label="Go"');
 assert.equal(attr(state,'n10','shape'),'diamond');assert.equal(attr(state,'n11','shape'),'cylinder');assert.equal(attr(state,'n12','shape'),'oval');
 const svg=view().svg;
 assert.match(svg,/data-select="n1"><polygon/,'a cylinder silhouette');assert.match(svg,/data-select="n1"><ellipse/,'and its lid');
 assert.match(svg,/data-select="n3"><polyline/,'an actor is lines');assert.match(svg,/data-select="n6"><rect[^>]*rx="28"/,'an oval is a stadium');
 assert.equal((svg.match(/data-select="n8"><polyline/g)??[]).length,2,'a subprocess has double sides');
 assert.match(svg,/>Users</);
});

test('styles: fill, outline, text colour, font size and weight; link arrowheads back and route',async()=>{
 const {state,ok,run,view}=await area();
 ok('diagram.node.make kind="rectangle" label="A"');ok('diagram.node.make kind="rectangle" label="B"');ok('diagram.link.make from="n1" to="n2" label="yes" style="dashed"');
 ok('diagram.node.change ids="n1" colour="yellow" outline="red" textColour="navy" fontSize=20 fontWeight="bold"');
 const svg=view().svg;
 assert.match(svg,/data-select="n1"><rect[^>]*stroke="#ff0000"/i);assert.match(svg,/font-size="20" font-weight="600"[^>]*fill="#000080">A</i);
 const inputs=view().inputs.n1;assert.equal(inputs.outline,'red');assert.equal(inputs.fontSize,20);
 assert.equal(run('diagram.node.change ids="n1" fontSize=200').status==='changed',false,'outside the declared range');
 ok('diagram.link.change ids="e1" arrow="back"');
 assert.equal((view().svg.match(/data-select="e1"><polygon/g)??[]).length,1,'one arrowhead, at the source');
 ok('diagram.link.change ids="e1" route="curved"');
 assert.ok((view().svg.match(/data-select="e1"><polyline points="([^"]+)"/)[1].split(' ').length)>=9,'a curve of many points');
 assert.equal(view().inputs.e1.way,'curved');
 ok('diagram.link.reverse ids="e1"');assert.deepEqual(ends(state).e1,['n2','n1']);
});

test('themes: a whole page, one role, a palette by level; later nodes follow the page theme',async()=>{
 const {state,ok,run,view}=await area();
 ok('diagram.node.make role="start" label="Go"');ok('diagram.node.make role="decision" label="Ok?"');ok('diagram.node.make kind="rectangle" label="Do"');
 ok('diagram.link.make from="n1" to="n2"');ok('diagram.link.make from="n2" to="n3"');
 ok('diagram.style.apply theme="dark"');
 let svg=view().svg;
 assert.match(svg,/^<svg[^>]*><g[^>]*><rect x="0" y="0"[^>]*fill="#1a202c"/,'the page is dark');
 assert.equal(attr(state,'n1','colour'),'#2d3748');assert.equal(attr(state,'n1','text_colour'),'#f7fafc');
 ok('diagram.node.make kind="circle" label="Later"');
 assert.match(view().svg,/data-select="n4"><ellipse[^>]*fill="#2d3748"/,'a later node follows the page theme');
 ok('diagram.style.apply theme="highlight" role="decision"');
 assert.equal(attr(state,'n2','colour'),'#fff3b0');assert.equal(attr(state,'n1','colour'),'#2d3748','the other roles keep theirs');
 ok('diagram.style.apply theme="flowchart"');
 assert.equal(attr(state,'n1','colour'),'#c6f0c2','the flowchart theme colours the start');assert.equal(attr(state,'n2','colour'),'#ffe8a3');
 ok('diagram.colour.by by="level"');
 const levels=['n1','n2','n3'].map(c=>attr(state,c,'colour'));assert.equal(new Set(levels).size,3,'each level its own colour');
 ok('diagram.colour.by by="shape" theme="pastel"');assert.equal(attr(state,'n4','colour'),'#ffd6d6','circle is the first shape');
 assert.equal(run('diagram.style.apply theme="nope"').status==='changed',false);
});

test('page layouts: tree turned left to right, grid, circle and radial; no overlaps',async()=>{
 const {state,host,ok,view}=await area();
 for(const t of ['Root','A','B','C','D','E'])ok(`diagram.node.make kind="rectangle" label="${t}"`);
 for(const [a,b] of [[1,2],[1,3],[2,4],[2,5],[3,6]])ok(`diagram.link.make from="n${a}" to="n${b}"`);
 ok('diagram.layout direction="right"');
 let c=Object.fromEntries(nodeCodes(state).map(code=>[code,centre(boxes(host)[code])]));
 assert.ok(c.n1[0]<c.n2[0]&&c.n2[0]<c.n4[0],'levels go left to right');assert.equal(c.n2[0],c.n3[0]);noOverlaps(host,state);
 ok('diagram.layout direction="up"');c=Object.fromEntries(nodeCodes(state).map(code=>[code,centre(boxes(host)[code])]));
 assert.ok(c.n1[1]>c.n2[1]&&c.n2[1]>c.n4[1],'levels go upwards');noOverlaps(host,state);
 ok('diagram.layout layout="grid" direction="down"');noOverlaps(host,state);
 c=Object.fromEntries(nodeCodes(state).map(code=>[code,centre(boxes(host)[code])]));assert.equal(c.n1[1],c.n3[1]);assert.ok(c.n4[1]>c.n1[1],'a 3 by 2 grid');
 ok('diagram.layout layout="circle"');noOverlaps(host,state);
 c=Object.fromEntries(nodeCodes(state).map(code=>[code,centre(boxes(host)[code])]));
 const mid=[0,1].map(k=>Object.values(c).reduce((s,p)=>s+p[k],0)/6),radii=Object.values(c).map(p=>Math.hypot(p[0]-mid[0],p[1]-mid[1]));
 for(const r of radii)assert.ok(Math.abs(r-radii[0])<2,'all on one ring');
 assert.match(view().svg,/data-select="e1"><polyline points="[^"]+"/);
 ok('diagram.layout layout="radial"');noOverlaps(host,state);
 c=Object.fromEntries(nodeCodes(state).map(code=>[code,centre(boxes(host)[code])]));
 const r1=Math.hypot(c.n2[0]-c.n1[0],c.n2[1]-c.n1[1]),r2=Math.hypot(c.n4[0]-c.n1[0],c.n4[1]-c.n1[1]);
 assert.ok(r2>r1+20,'the second level is on an outer ring');
 ok('diagram.layout spacing="loose" layout="tree"');const loose=boxes(host);ok('diagram.layout spacing="compact"');const compact=boxes(host);
 assert.ok(loose.n4.min_y-loose.n2.max_y>compact.n4.min_y-compact.n2.max_y,'loose spacing leaves more room');
 assert.equal(view().inputs.page.spacing,'compact');
});

test('improve the layout: hand-placed nodes with crossings go back to a layered layout with fewer crossings',async()=>{
 const {state,host,ok}=await area();
 for(const t of ['A','B','C','D'])ok(`diagram.node.make kind="rectangle" label="${t}"`);
 ok('diagram.link.make from="n1" to="n2"');ok('diagram.link.make from="n3" to="n4"');ok('diagram.link.make from="n1" to="n3"');
 ok('diagram.node.place ids="n1" x=100 y=100');ok('diagram.node.place ids="n2" x=500 y=500');ok('diagram.node.place ids="n3" x=500 y=100');ok('diagram.node.place ids="n4" x=100 y=500');
 const before=crossings(host,state);assert.ok(before>=1,'the placed links cross');
 ok('diagram.layout.improve');
 assert.equal(crossings(host,state),0,'no crossings after improving');noOverlaps(host,state);
 assert.doesNotMatch(state.sop,/pinned=true/);
});

test('align and distribute: exact edges and equal steps',async()=>{
 const {state,host,ok,run}=await area();
 ok('diagram.node.make kind="rectangle" label="A"');ok('diagram.node.make kind="circle" label="B"');ok('diagram.node.make kind="hexagon" label="Wide label here"');
 ok('diagram.node.place ids="n1" x=120 y=100');ok('diagram.node.place ids="n2" x=300 y=260');ok('diagram.node.place ids="n3" x=700 y=420');
 ok('diagram.nodes.align ids="n1" ids="n2" ids="n3" edge="left"');
 let b=nodeBoxes(host,state);assert.equal(b.n1.min_x,b.n2.min_x);assert.equal(b.n2.min_x,b.n3.min_x);
 ok('diagram.nodes.align ids="n1" ids="n2" ids="n3" edge="middle"');
 b=nodeBoxes(host,state);assert.equal(centre(b.n1)[1],centre(b.n2)[1]);assert.equal(centre(b.n3)[1],centre(b.n1)[1]);
 ok('diagram.node.place ids="n2" x=200 y=300');ok('diagram.node.place ids="n3" x=900 y=300');
 ok('diagram.nodes.distribute ids="n3" ids="n1" ids="n2" axis="horizontal"');
 b=nodeBoxes(host,state);const xs=['n1','n2','n3'].map(c=>centre(b[c])[0]).sort((p,q)=>p-q);
 assert.ok(Math.abs((xs[1]-xs[0])-(xs[2]-xs[1]))<1e-6,'equal steps');
 ok('diagram.group.make name="g1" ids="n1" ids="n2"');
 assert.equal(run('diagram.nodes.align ids="n1" ids="n3" edge="top"').reason,'node-in-group-place-the-group');
});

test('structure: chain, cycle, star, all; insert, duplicate, merge, split, numbering',async()=>{
 const {state,host,ok,run,view}=await area();
 for(const t of ['A','B','C','D','E'])ok(`diagram.node.make kind="rectangle" label="${t}"`);
 ok('diagram.links.connect ids="n1" ids="n2" ids="n3" pattern="chain"');assert.deepEqual(ends(state),{e1:['n1','n2'],e2:['n2','n3']});
 ok('diagram.links.connect ids="n1" ids="n2" ids="n3" pattern="cycle"');assert.equal(Object.keys(ends(state)).length,3,'the chain is kept, the loop closed');
 ok('diagram.links.connect ids="n4" ids="n1" ids="n5" pattern="star"');assert.ok(Object.values(ends(state)).some(([a,b])=>a==='n4'&&b==='n5'));
 assert.equal(run('diagram.links.connect ids="n1" ids="n2" ids="n3" ids="n4" ids="n5" pattern="all"').status,'changed','ten pairs need no confirmation');
 for(let i=6;i<=7;i++)ok(`diagram.node.make kind="circle" label="X${i}"`);
 assert.equal(run('diagram.links.connect ids="n1" ids="n2" ids="n3" ids="n4" ids="n5" ids="n6" pattern="all"').reason,'confirm-many-links');
 ok('diagram.links.connect ids="n6" ids="n7" pattern="all"');
 const e=Object.entries(ends(state)).find(([,v])=>v[0]==='n1'&&v[1]==='n2')[0];
 ok(`diagram.node.insert link="${e}" label="Check" kind="diamond"`);
 assert.deepEqual(ends(state)[e],['n1','n8']);assert.ok(Object.values(ends(state)).some(([a,b])=>a==='n8'&&b==='n2'),'the new node leads on');
 ok('diagram.node.change ids="n8" colour="orange" outline="red"');
 ok('diagram.node.duplicate ids="n8"');assert.equal(attr(state,'n9','label'),'Check');assert.equal(attr(state,'n9','colour'),'orange');assert.equal(attr(state,'n9','shape'),'diamond');
 ok('diagram.node.merge ids="n2" ids="n3" label="B and C"');
 assert.equal(nodeCodes(state).includes('n3'),false);assert.equal(attr(state,'n2','label'),'B and C');
 assert.ok(!Object.values(ends(state)).some(([a,b])=>a===b),'no link left to itself');
 ok('diagram.node.split id="n2" label="C"');
 const out=Object.values(ends(state)).filter(([a])=>a==='n10');assert.ok(out.length>=1,'the split part takes the outgoing links');
 assert.ok(Object.values(ends(state)).some(([a,b])=>a==='n2'&&b==='n10'));
 ok('diagram.steps.number mode="on"');assert.match(view().svg,/font-size="11" font-weight="600" text-anchor="middle"[^>]*fill="#ffffff">1</);
 noOverlaps(host,state);
});

test('rings and slices: a circle arrangement and pie and doughnut charts',async()=>{
 const {state,host,ok,view}=await area();
 ok('diagram.node.make kind="circle" n=5 layout="circle" colour="orange"');
 const b=nodeBoxes(host,state),cs=Object.values(b).map(centre),mid=[0,1].map(k=>cs.reduce((s,p)=>s+p[k],0)/cs.length);
 const r=cs.map(p=>Math.hypot(p[0]-mid[0],p[1]-mid[1]));for(const x of r)assert.ok(Math.abs(x-r[0])<2,'members on a ring');
 noOverlaps(host,state);
 ok('diagram.links.connect ids="n1" ids="n2" ids="n3" pattern="chain"');
 assert.match(view().svg,/data-select="e1"><polyline/,'links inside a ring are drawn');
 ok('diagram.group.chart.make label="Votes" labels="Yes" labels="No" labels="Maybe" values=6 values=3 values=1 layout="pie"');
 const svg=view().svg;assert.equal((svg.match(/data-select="n[678]"><polygon/g)??[]).length,3,'three slices');
 assert.match(svg,/>Maybe</);assert.match(svg,/fill="#4e79a7"/,'the vivid palette');
 ok('diagram.group.layout id="g2" layout="doughnut"');
 const pts=view().svg.match(/data-select="n6"><polygon points="([^"]+)"/)[1].split(' ').length;assert.equal(pts,26,'a doughnut slice has an inner edge');
});

test('charts: values, categories, type and formatting are edited on the chart group; nodes take effects',async()=>{
 const {state,host,ok,run,view}=await area();
 ok('diagram.group.chart.make label="Sales" labels="January" labels="February" labels="March" values=10 values=20 values=30 layout="bar"');
 ok('diagram.chart.value id="g1" category="March" value=40');assert.equal(attr(state,'n3','value'),'40');
 const b=boxes(host);assert.equal(b.n3.max_y-b.n3.min_y,160,'the largest bar is the full plot');
 ok('diagram.chart.category.add id="g1" label="April" value=20');assert.equal(attr(state,'n4','label'),'April');
 assert.deepEqual(view().inputs.g1.members.slice().sort(),['n1','n2','n3','n4']);
 ok('diagram.chart.category.rename id="g1" category="January" label="Jan"');assert.equal(attr(state,'n1','label'),'Jan');
 ok('diagram.chart.category.remove id="g1" category="n2"');assert.equal(nodeCodes(state).includes('n2'),false);
 assert.equal(run('diagram.chart.value id="g1" category="May" value=3').reason,'missing-category');
 ok('diagram.chart.format id="g1" title="Sales 2026" yLabel="Units" xLabel="Month" gridlines=true valueLabels=false');
 let svg=view().svg;assert.match(svg,/>Sales 2026</);assert.match(svg,/font-style="italic"[^>]*>Units</);assert.match(svg,/>Month</);
 assert.equal((svg.match(/stroke-dasharray="3 3"/g)??[]).length,4,'four gridlines');assert.doesNotMatch(svg,/>40</,'values hidden');
 assert.equal(run('diagram.chart.format id="g1"').reason,'missing-property');
 ok('diagram.group.layout id="g1" layout="area"');assert.match(view().svg,/data-select="g1"><polygon[^>]*opacity="0.3"/,'an area under the line');
 ok('diagram.group.layout id="g1" layout="pie"');ok('diagram.chart.format id="g1" legend="right"');
 svg=view().svg;assert.match(svg,/>Jan<\/text>/);assert.equal((svg.match(/data-select="n[0-9]+"><rect[^>]*width="11"/g)??[]).length,3,'a legend swatch per slice');
 ok('diagram.style.apply theme="highlight" ids="n3"');assert.equal(attr(state,'n3','colour'),'#fff3b0','a highlighted slice');
 ok('diagram.node.make kind="rectangle" label="Card"');
 ok('diagram.node.change ids="n5" effect="shadow" opacity=0.8 corner=14');
 svg=view().svg;assert.match(svg,/data-select="n5"><rect[^>]*rx="14"[^>]*opacity="0.8" style="filter:drop-shadow/);
 assert.equal(view().inputs.n5.effect,'shadow');
});

test('the page is an observed object; tidy links, swap, scale, rotate, conditional chart colours, sorting and the axis top',async()=>{
 const {state,host,ok,run,view}=await area();
 const page=()=>view().objects.find(o=>o.id==='page');
 assert.equal(page().kind,'diagram');assert.equal(page().layout,'flow');
 ok('diagram.node.make kind="rectangle" label="A"');ok('diagram.node.make kind="rectangle" label="B"');ok('diagram.link.make from="n1" to="n2" style="dotted"');
 ok('diagram.layout layout="grid"');assert.equal(page().layout,'grid');
 ok('diagram.link.improve ids="e1"');assert.equal(view().inputs.e1.style,'solid');assert.equal(view().inputs.e1.route,'orthogonal');
 const before=Object.fromEntries(['n1','n2'].map(c=>[c,centre(boxes(host)[c])]));
 ok('diagram.nodes.swap ids="n1" ids="n2"');
 const after=Object.fromEntries(['n1','n2'].map(c=>[c,centre(boxes(host)[c])]));
 assert.deepEqual(after.n1,before.n2);assert.deepEqual(after.n2,before.n1);
 ok('diagram.node.scale ids="n1" factor=1.5');const b=boxes(host).n1;assert.equal(b.max_x-b.min_x,180);assert.equal(b.max_y-b.min_y,84);
 ok('diagram.node.change ids="n2" rotation=30');assert.match(view().svg,/transform="rotate\(30 [^"]+" data-select="n2"><rect/);
 ok('diagram.group.chart.make label="Profit" labels="Q1" labels="Q2" labels="Q3" values=15 values=40 values=8 layout="bar"');
 ok('diagram.chart.highlight id="g1" test="below" value=20 colour="red"');
 assert.equal(attr(state,'n3','colour'),'red');assert.equal(attr(state,'n5','colour'),'red');assert.equal(attr(state,'n4','colour'),undefined);
 ok('diagram.chart.sort id="g1" order="descending"');
 const xs=['n3','n4','n5'].map(c=>centre(boxes(host)[c])[0]);assert.ok(xs[1]<xs[0]&&xs[0]<xs[2],'40, then 15, then 8');
 ok('diagram.chart.format id="g1" yMax=80');assert.equal(boxes(host).n4.max_y-boxes(host).n4.min_y,80,'40 of 80 is half the plot');
});
