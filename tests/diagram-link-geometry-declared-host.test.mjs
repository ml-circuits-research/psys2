// Link geometry on the Diagram SOP area (worlds/diagram.sketch/link-schema.sop, link-geometry.sop): where each end of a
// link is attached (a node and a side, or a free point), its bends, the mark at each end, the label's place and the
// routing styles, each changed by a declared command (the route the tab's gestures and chat share) and checked by what
// is drawn and observed. Every state is made through the area's own commands.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiagramState,projectDiagramArea,createDiagramArea,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

async function area() {
 const state={sop:'',runtime:{view:{}}},host=await createDiagramArea({state});let n=0;
 const run=(command)=>host.invoke('@c '+command,toolInvocationContext('lk-'+(n++),host.observe().version));
 const ok=(command)=>{const result=run(command);assert.equal(result.status,'changed',command+' -> '+(result.reason??result.status));return result;};
 return {state,host,run,ok,view:()=>projectDiagramArea(state)};
}
const ends=(state)=>{const w=diagramAreaStateWorld(state),code=(ref)=>w.get(ref.slice(1)).attrs.code[0];
 return Object.fromEntries(w.ofType('w.diagram.edge').map(e=>[e.attrs.code[0],[e.attrs.from?code(e.attrs.from[0]):null,e.attrs.to?code(e.attrs.to[0]):null]]));};
const line=(view,id)=>{const m=view.svg.match(new RegExp(`data-select="${id}"><polyline points="([^"]+)"`));return m?m[1].split(' ').map(p=>p.split(',').map(Number)):null;};
const near=(a,b,tol=0.6)=>Math.abs(a-b)<=tol;
const sidePoint=(box,side)=>({top:[(box.x0+box.x1)/2,box.y0],bottom:[(box.x0+box.x1)/2,box.y1],left:[box.x0,(box.y0+box.y1)/2],right:[box.x1,(box.y0+box.y1)/2]})[side];

test('an end moves to another node and to another side of a node; the line leaves and enters across the sides',async()=>{
 const {state,ok,view}=await area();
 for(const label of ['Start','Test','Review','Check'])ok(`diagram.node.make kind="rectangle" label="${label}"`);
 ok('diagram.link.make from="n1" to="n2"');ok('diagram.link.make from="n2" to="n4"');
 // "connect the arrow to Review instead of Test": the end at Test goes to Review.
 ok('diagram.link.attach ids="e1" at="n2" node="n3"');
 assert.deepEqual(ends(state).e1,['n1','n3']);
 // "move the end of e2 to the top of Check" and "make e2 go from the left side of Test".
 ok('diagram.link.attach ids="e2" end="end" node="n4" side="top"');
 ok('diagram.link.change ids="e2" fromSide="left"');
 const v=view(),pts=line(v,'e2'),from=sidePoint(v.boxes.n2,'left'),to=sidePoint(v.boxes.n4,'top');
 assert.deepEqual(pts[0],from,'the line starts at the middle of the left side of Test');
 assert.deepEqual(pts.at(-1),to,'and ends at the middle of the top of Check');
 assert.ok(pts[1][0]<from[0]&&near(pts[1][1],from[1]),'it leaves the left side sideways');
 assert.ok(near(pts.at(-2)[0],to[0])&&pts.at(-2)[1]<to[1],'it enters the top from above');
 for(let i=1;i<pts.length;i++)assert.ok(near(pts[i][0],pts[i-1][0])||near(pts[i][1],pts[i-1][1]),'every piece is orthogonal');
 assert.equal(v.inputs.e2.fromSide,'left');assert.equal(v.inputs.e2.toSide,'top');
 // "attach the right end to Start": the end drawn further right goes to Start.
 const tips=line(view(),'e1'),right=tips[0][0]>tips.at(-1)[0]?'from':'to';
 ok('diagram.link.attach ids="e1" end="right" node="n1" side="right"');
 assert.equal(ends(state).e1[right==='from'?0:1],'n1');
});

test('a free end has no node: its reattachment, and the endpoint relations a reader observes',async()=>{
 const {state,ok,run,host,view}=await area();
 ok('diagram.node.make kind="rectangle" label="Start"');ok('diagram.node.make kind="rectangle" label="Done"');
 ok('diagram.link.make from="n1" to="n2"');
 const endpoint=()=>host.observeSpatial().relations.some(r=>r.subject==='e1'&&r.object==='n1'&&r.kind==='endpoint_of');
 assert.ok(endpoint(),'attached, e1 is an endpoint of Start');
 // "detach e1 from Start": the start stays near where it was drawn, free of the node.
 ok('diagram.link.detach ids="e1" at="n1"');
 let v=view();
 assert.equal(v.inputs.e1.fromFree,true);
 const p=line(v,'e1')[0];assert.deepEqual(p,[v.inputs.e1.fromX,v.inputs.e1.fromY],'the line starts at the free point');
 assert.deepEqual(ends(state).e1,[null,'n2'],'the link has no node at its start any more');
 assert.equal(v.objects.find(o=>o.id==='e1').from,undefined,'a reader sees no node at its start');
 assert.ok(!endpoint(),'a free end is no endpoint of Start');
 // A drop on empty space leaves the end free at the drop point; a drop on a node attaches it again.
 ok('diagram.link.detach ids="e1" end="to" x=640 y=520');
 v=view();assert.deepEqual(line(v,'e1').at(-1),[640,520]);assert.equal(v.inputs.e1.toFree,true);
 ok('diagram.link.attach ids="e1" end="from" node="n2" side="bottom"');
 v=view();assert.equal(v.inputs.e1.fromFree,undefined);assert.deepEqual(line(v,'e1')[0],sidePoint(v.boxes.n2,'bottom'));
 assert.deepEqual(ends(state).e1,['n2',null]);
 assert.equal(run('diagram.link.detach ids="e1" end="to"').reason,'already-free','a free end without a new point stays');
});

test('bends: added where said, moved, removed one by one or all; each routing style passes them',async()=>{
 const {ok,run,view}=await area();
 ok('diagram.node.make kind="rectangle" label="A"');ok('diagram.node.make kind="rectangle" label="B"');
 ok('diagram.link.make from="n1" to="n2" route="straight"');
 ok('diagram.link.bend.add ids="e1" x=300 y=380');
 ok('diagram.link.bend.add ids="e1" x=320 y=500');
 ok('diagram.link.bend.add ids="e1" x=250 y=440 after=1');
 let v=view(),pts=line(v,'e1');
 assert.deepEqual(pts.slice(1,-1),[[300,380],[250,440],[320,500]],'straight: through the bends in order');
 assert.deepEqual([].concat(v.inputs.e1.bends).sort(),['1 300 380','2 250 440','3 320 500']);
 ok('diagram.link.bend.move ids="e1" bend=2 x=200 y=450');
 assert.deepEqual(line(view(),'e1')[2],[200,450]);
 ok('diagram.link.change ids="e1" route="orthogonal"');
 pts=line(view(),'e1');
 for(let i=1;i<pts.length;i++)assert.ok(near(pts[i][0],pts[i-1][0])||near(pts[i][1],pts[i-1][1]),'orthogonal through bends');
 for(const b of [[300,380],[200,450],[320,500]])assert.ok(pts.some(p=>near(p[0],b[0])&&near(p[1],b[1])),'passes bend '+b);
 ok('diagram.link.change ids="e1" route="curved"');
 pts=line(view(),'e1');assert.ok(pts.length>=20,'a curve of many points: '+pts.length);
 ok('diagram.link.bend.remove ids="e1" bend=1');
 assert.equal([].concat(view().inputs.e1.bends).length,2);
 assert.equal(run('diagram.link.bend.move ids="e1" bend=7 x=1 y=1').reason,'missing-target');
 ok('diagram.link.bend.remove ids="e1"');
 assert.equal(view().inputs.e1.bends,undefined,'"straighten e1": no bend left');
 // Removing the link removes its bends with it.
 ok('diagram.link.bend.add ids="e1" x=300 y=380');ok('diagram.link.remove ids="e1"');
 assert.ok(!/diagram\.sketch\.bend/.test(view().sop));
});

test('marks at either end, double-headed, reversed with sides and bends, the label along the line',async()=>{
 const {state,ok,view}=await area();
 ok('diagram.node.make kind="rectangle" label="A"');ok('diagram.node.make kind="rectangle" label="B"');
 ok('diagram.link.make from="n1" to="n2" label="yes" fromSide="right"');
 ok('diagram.link.change ids="e1" head="diamond" tail="circle"');
 let v=view();
 assert.equal(v.inputs.e1.arrow,'both','a tail mark shows the tail');
 assert.equal((v.svg.match(/data-select="e1"><polygon points="[^"]+"/g)??[]).length,1,'one diamond (four points)');
 assert.equal((v.svg.match(/data-select="e1"><polygon points="([^"]+)"/)[1].split(' ').length),4);
 assert.match(v.svg,/data-select="e1"><ellipse/,'a circle at the start');
 ok('diagram.link.change ids="e1" head="none"');
 assert.equal(view().inputs.e1.arrow,'back','"no arrow at the end": the head goes');
 ok('diagram.link.change ids="e1" arrow="both"');
 v=view();assert.equal(v.inputs.e1.arrow,'both','"make the arrow double-headed"');
 ok('diagram.link.change ids="e1" head="open"');
 assert.match(view().svg,/data-select="e1"><polyline points="[^"]+"[^>]*\/><\/g>[\s\S]*data-select="e1"><polyline points="[^ ]+ [^ ]+ [^ "]+"/,'an open arrow is two strokes');
 ok('diagram.link.bend.add ids="e1" x=700 y=300');ok('diagram.link.bend.add ids="e1" x=700 y=420');
 const before=line(view(),'e1');
 ok('diagram.link.reverse ids="e1"');
 v=view();
 assert.deepEqual(ends(state).e1,['n2','n1']);
 assert.equal(v.inputs.e1.toSide,'right');assert.equal(v.inputs.e1.fromSide,'auto');
 assert.equal(v.inputs.e1.head,'circle');assert.equal(v.inputs.e1.tail,'open');
 const after=line(v,'e1'),bend=(pts,b)=>pts.findIndex(p=>near(p[0],b[0])&&near(p[1],b[1]));
 assert.ok(bend(before,[700,300])<bend(before,[700,420])&&bend(after,[700,420])<bend(after,[700,300]),'the bends are passed the other way');
 ok('diagram.link.change ids="e1" labelAt="middle"');
 assert.equal(view().inputs.e1.labelPosition,0.5);
 ok('diagram.link.change ids="e1" labelPosition=0.1');
 v=view();const [lx,ly]=v.svg.match(/data-select="e1"><text x="([\d.]+)" y="([\d.]+)"[^>]*>yes</).slice(1).map(Number);
 const first=line(v,'e1')[0],last=line(v,'e1').at(-1);
 assert.ok(Math.hypot(lx-6-first[0],ly-14-first[1])<Math.hypot(lx-6-last[0],ly-14-last[1]),'the label sits near the start');
});

test('all links orthogonal; a new link takes its sides, marks and route; refusals',async()=>{
 const {ok,run,view}=await area();
 for(const label of ['A','B','C'])ok(`diagram.node.make kind="rectangle" label="${label}"`);
 ok('diagram.link.make from="n1" to="n2" route="curved"');ok('diagram.link.make from="n1" to="n3" fromSide="bottom" toSide="left" head="circle" route="straight"');
 let v=view();assert.equal(v.inputs.e2.head,'circle');assert.equal(v.inputs.e2.way,'straight');
 assert.deepEqual(line(v,'e2')[0],sidePoint(v.boxes.n1,'bottom'));
 ok('diagram.layout route="orthogonal"');
 v=view();for(const id of ['e1','e2']){const pts=line(v,id);for(let i=1;i<pts.length;i++)assert.ok(near(pts[i][0],pts[i-1][0])||near(pts[i][1],pts[i-1][1]),id+' is orthogonal');}
 assert.equal(run('diagram.link.attach ids="e1" node="zz"').reason,'missing-endpoint');
 assert.equal(run('diagram.link.attach ids="e1" at="n3" node="n2"').reason,'missing-endpoint','e1 is not at C');
 assert.equal(run('diagram.link.attach ids="e9" node="n2"').reason,'missing-target');
 assert.equal(run('diagram.link.change ids="e1" fromSide="middle"').status,'refused','a side outside the declared list');
});

test('each link gesture is the declared tool command and reads back as its sentence',async()=>{
 const session={isession:{state:{'diagram.sketch':emptyDiagramState()}},engine:{}};
 const gesture=async(operation,args)=>{const r=await performGesture(session,{view:'diagram',operation,args});assert.ok(r.ok,operation+' -> '+r.message);return r.intentRecord;};
 for(const label of ['Start','Test','Review'])await gesture('diagram.node.make',{kind:'rectangle',label});
 assert.equal((await gesture('diagram.link.make',{from:'n1',to:'n2',fromSide:'right',route:'orthogonal'})).text,'Draw a link from "Start", to "Test", from the side "right", drawn "orthogonal".');
 assert.equal((await gesture('diagram.link.attach',{ids:['e1'],end:'to',node:'n3',side:'top'})).text,'Attach "e1" the end "to", to "Review", at the side "top".');
 assert.equal((await gesture('diagram.link.detach',{ids:['e1'],end:'to',x:600,y:500})).text,'Detach "e1" the end "to", leaving it at x 600, y 500.');
 assert.equal((await gesture('diagram.link.bend.add',{ids:['e1'],x:400,y:450,after:0})).text,'Bend "e1" through x 400, y 450, after bend 0.');
 assert.equal((await gesture('diagram.link.bend.move',{ids:['e1'],bend:1,x:420,y:460})).text,'Move a bend of "e1" number 1, to x 420, y 460.');
 const label=await gesture('diagram.link.change',{ids:['e1'],labelPosition:0.4});
 assert.equal(label.text,'Update "e1" with the label at 0.4.');assert.equal(label.verification.status,'verified');
 assert.equal((await gesture('diagram.link.bend.remove',{ids:['e1']})).text,'Straighten "e1".');
});

const crosses=(pts,box)=>pts.slice(1).some((q,i)=>{const p=pts[i],lo=(a,b)=>Math.min(a,b),hi=(a,b)=>Math.max(a,b);
 return near(p[1],q[1])?(p[1]>box.y0&&p[1]<box.y1&&lo(p[0],q[0])<box.x1&&hi(p[0],q[0])>box.x0):(p[0]>box.x0&&p[0]<box.x1&&lo(p[1],q[1])<box.y1&&hi(p[1],q[1])>box.y0);});
const inside=(pts,box,m=0)=>pts.some(([x,y])=>x>box.x0-m&&x<box.x1+m&&y>box.y0-m&&y<box.y1+m);

test('routes keep off other nodes; links between the same nodes fan out',async()=>{
 const {ok,view}=await area();
 for(const label of ['A','B','C','D'])ok(`diagram.node.make kind="rectangle" label="${label}"`);
 ok('diagram.layout layout="row" route="orthogonal"');
 ok('diagram.link.make from="n1" to="n3"');ok('diagram.link.make from="n1" to="n4" route="curved"');
 let v=view();
 assert.ok(!crosses(line(v,'e1'),v.boxes.n2),'the orthogonal link from A to C goes round B');
 const curve=line(v,'e2');assert.ok(!inside(curve,v.boxes.n2)&&!inside(curve,v.boxes.n3),'the curve from A to D bows clear of B and C');
 ok('diagram.link.make from="n1" to="n2"');ok('diagram.link.make from="n2" to="n1"');
 v=view();
 const there=line(v,'e3'),back=line(v,'e4');
 // Each runs along its own height between A and B (14 apart), not on top of the other.
 const level=(pts)=>pts.find((p,i)=>i&&near(p[1],pts[i-1][1])&&p[0]>v.boxes.n1.x1&&p[0]<v.boxes.n2.x0)?.[1]??pts[0][1];
 assert.ok(Math.abs(level(there)-level(back))>=10,'the two links fan out: '+level(there)+' / '+level(back));
});

test('named ports: a decision has yes, no and else; a database a lid; unknown names are refused',async()=>{
 const {ok,run,view}=await area();
 ok('diagram.node.make kind="diamond" label="Ok?"');ok('diagram.node.make kind="cylinder" label="Db"');ok('diagram.node.make kind="rectangle" label="Fix"');
 ok('diagram.link.make from="n1" to="n2" fromPort="yes" toPort="lid"');
 let v=view();
 assert.equal(v.inputs.e1.fromSide,'bottom');assert.equal(v.inputs.e1.fromPort,'yes');assert.equal(v.inputs.e1.toSide,'top');
 assert.deepEqual(line(v,'e1')[0],sidePoint(v.boxes.n1,'bottom'));
 assert.ok([].concat(v.inputs.n1.ports).includes('no:right'),'the decision observes its named ports');
 ok('diagram.link.make from="n1" to="n3"');
 ok('diagram.link.attach ids="e2" end="start" node="n1" port="no"');
 v=view();assert.equal(v.inputs.e2.fromSide,'right');assert.deepEqual(line(v,'e2')[0],sidePoint(v.boxes.n1,'right'));
 assert.equal(run('diagram.link.attach ids="e2" end="end" node="n3" port="lid"').reason,'no-such-port','a rectangle has no lid');
 assert.equal(run('diagram.link.change ids="e1" toPort="yes"').reason,'no-such-port');
});

test('moving the nodes at both ends moves the link\'s bends; reversing a link with a free end keeps it free at the other end',async()=>{
 const {state,ok,view}=await area();
 ok('diagram.node.make kind="rectangle" label="A" x=200 y=200');ok('diagram.node.make kind="rectangle" label="B" x=500 y=200');
 ok('diagram.link.make from="n1" to="n2"');ok('diagram.link.bend.add ids="e1" x=350 y=100');
 ok('diagram.node.place ids="n1" ids="n2" x=350 y=300');
 assert.equal(view().inputs.e1.bends,'1 350 200','the bend moved with both nodes (down 100)');
 ok('diagram.node.place ids="n1" x=200 y=420');
 assert.equal(view().inputs.e1.bends,'1 350 200','moving one end leaves the bend');
 ok('diagram.link.detach ids="e1" end="to" x=700 y=500');
 ok('diagram.link.reverse ids="e1"');
 const v=view();assert.deepEqual(ends(state).e1,[null,'n1']);assert.equal(v.inputs.e1.fromFree,true);
 assert.deepEqual([v.inputs.e1.fromX,v.inputs.e1.fromY],[700,500]);assert.equal(v.inputs.e1.bends,'1 350 200');
 assert.deepEqual(line(v,'e1')[0],[700,500]);
});
