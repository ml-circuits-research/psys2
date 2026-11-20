// "Add a house next to the lake and left of the tree" with the tree far from the lake: no place keeps both declared
// distances (near: 40, left: 80), so the declared placement method (worlds/app.project/spatial-placement.sop,
// relax=gap) keeps each relation's direction and separation and makes the distances soft. The house is created
// beside the lake and left of the tree, and the reply says which relation it kept loosely. A scene where both
// distances fit is placed without that note.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {createDrawingArea,emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const text='add a house next to the lake and left of the tree';
const kind=lemma=>bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma)?.canonical;
const read={request:'r',wires:[
 `@source std.request.source text=${JSON.stringify(text)}`,
 '@r std.request act=make mood=do source=$source',
 '@house std.request.target request=$r mode=new determiner=indefinite kind='+kind('house'),
 '@lake std.request.target request=$r mode=existing determiner=definite kind='+kind('lake'),
 '@tree std.request.target request=$r mode=existing determiner=definite kind='+kind('tree'),
 '@near std.request.constraint request=$r target=$house concept=k.spatial2d.relation.kind operator=relation relation=near goal=$lake polarity=positive character=requirement',
 '@left std.request.constraint request=$r target=$house concept=k.spatial2d.relation.kind operator=relation relation=left goal=$tree polarity=positive character=requirement',
].join('\n')};

function sessionFor(state) {
 const session={isession:{state:{'art.draw':state,'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 return {session,control:(operation,args)=>performGesture(session,{view:'draw',operation,args}),run:()=>routeNewEngine(session,text,{view:'draw'})};
}
const gap=(a0,a1,b0,b1)=>a1<=b0?b0-a1:b1<=a0?a0-b1:0;

for(const scene of [{label:'a tree far from the lake',tree:920,relaxed:true},{label:'a tree close to the lake',tree:660,relaxed:false}])
 test('two relations place a new house next to the lake and left of the tree: '+scene.label,async()=>{
  const {session,control,run}=sessionFor(emptyDrawingState());
  assert.equal((await control('drawing.object.make',{kind:'lake',x:325,y:511})).ok,true);
  assert.equal((await control('drawing.object.make',{kind:'tree',x:scene.tree,y:525})).ok,true);
  const reply=await run();
  assert.equal(reply.statuses[0],'supported',reply.trace.reason+' '+reply.text);
  const wires=parse(reply.trace.placement),summary=wires.find(wire=>wire.type==='std.placement.result');
  assert.equal(str(summary.attrs.status[0]),'compiled');
  const observed=(await createDrawingArea({state:session.isession.state['art.draw'],instanceId:'check'})).observeSpatial().boxes.filter(b=>b.entity!=='drawing.canvas');
  const house=observed.at(-1),lake=observed[0],tree=observed[1];
  assert.ok(house.entity!==lake.entity&&house.entity!==tree.entity,'a new object was created');
  const overlapX=house.min_x<lake.max_x&&lake.min_x<house.max_x,overlapY=house.min_y<lake.max_y&&lake.min_y<house.max_y;
  assert.ok(!(overlapX&&overlapY),'off the lake '+JSON.stringify(house));
  assert.ok(gap(house.min_x,house.max_x,lake.min_x,lake.max_x)<=40&&gap(house.min_y,house.max_y,lake.min_y,lake.max_y)<=40,'next to the lake '+JSON.stringify({house,lake}));
  assert.ok(house.max_x<=tree.min_x,'left of the tree '+JSON.stringify({house,tree}));
  assert.equal((summary.attrs.relaxed??[]).map(str).includes('left'),scene.relaxed);
  assert.equal(/as close as the scene allows \(left\)/.test(reply.text),scene.relaxed,reply.text);
 });

// "The tree" with two trees: each tree is a candidate anchor, solved separately. The tree the house can be next to
// the lake and left of, keeping both declared distances, wins; the far one stays a ranked alternative, and the
// reply names the anchor it used.
test('two relations with two trees: the anchor that keeps both distances wins and is named',async()=>{
 const {session,control,run}=sessionFor(emptyDrawingState());
 for(const [kind,x,y] of [['lake',325,511],['tree',920,525],['tree',479,525]])assert.equal((await control('drawing.object.make',{kind,x,y})).ok,true);
 const reply=await run();
 assert.equal(reply.statuses[0],'supported',reply.trace.reason+' '+reply.text);
 const wires=parse(reply.trace.placement),summary=wires.find(wire=>wire.type==='std.placement.result');
 const observed=(await createDrawingArea({state:session.isession.state['art.draw'],instanceId:'check'})).observeSpatial().boxes.filter(b=>b.entity!=='drawing.canvas');
 const [lake,,near]=observed,house=observed.at(-1);
 const choice=wires.find(wire=>'$'+wire.id===summary.attrs.choice[0]);
 assert.equal(str(choice.attrs.anchor[0]),near.entity,'the nearer tree is the anchor');
 assert.ok(gap(house.min_x,house.max_x,lake.min_x,lake.max_x)<=40&&gap(house.min_y,house.max_y,lake.min_y,lake.max_y)<=40,'next to the lake '+JSON.stringify({house,lake}));
 assert.ok(house.max_x<=near.min_x&&near.min_x-house.max_x<=80,'left of that tree '+JSON.stringify({house,near}));
 assert.equal(summary.attrs.relaxed,undefined);
 assert.ok(reply.text.includes('I used '+near.entity+' as the anchor.'),reply.text);
});
