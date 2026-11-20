// Where the Drawing tab (worlds/art.draw/area.sop) puts things: new objects without a place follow the area's
// declared placement (knowledge regions, containment, free spots, knowledge sizes: worlds/art.draw/act-rules.sop),
// and a chat request with relations reaches the library placement (std.placement / std.problem) through the app's
// route, with the area's measured sizes. The geometric review of whole scenes is scripts/review-drawing-placement.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {SCENES,buildScene,review,knowledge} from '../scripts/review-drawing-placement.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const kindOf=lemma=>bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma)?.canonical;
const box=o=>({x0:o.x-o.size/2,y0:o.y-o.size/2,x1:o.x+o.size/2,y1:o.y+o.size/2});
const objects=state=>parse(state.sop).filter(w=>w.type==='w.drawing.object').map(w=>{
 const v=k=>{const raw=w.attrs[k]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
 return {id:v('code'),kind:v('drawing'),x:Number(v('x')),y:Number(v('y')),size:Number(v('size'))};
});

/** A compiled reading: make (or place) the subject with one or more relations to existing anchors. */
function reading(text,subject,relations,act='make') {
 const wires=[`@source std.request.source text=${JSON.stringify(text)}`,'@r std.request act='+act+' mood=do source=$source',
  '@subject std.request.target request=$r mode='+(act==='make'?'new':'existing')+' kind='+kindOf(subject)];
 relations.forEach(([relation,anchor],n)=>wires.push('@anchor'+n+' std.request.target request=$r mode=existing kind='+kindOf(anchor),
  '@rel'+n+' std.request.constraint request=$r target=$subject concept=place operator=relation relation='+relation+' goal=$anchor'+n+' polarity=positive character=requirement'));
 return {request:'r',wires:wires.join('\n')};
}
function session(read,text) {
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 return {s,draw:args=>performGesture(s,{view:'draw',operation:'drawing.object.make',args}),run:()=>routeNewEngine(s,text,{view:'draw'})};
}

test('new objects without a place: water things in the lake, sky things in the sky, ground things on the ground, no overlaps',async()=>{
 const {objects:made}=await buildScene(['lake','boat','fish','house','tree','sun','cloud']);
 const by=kind=>made.find(o=>o.kind===kind),lake=by('lake');
 for(const kind of ['boat','fish']){
  const o=by(kind),b=box(o),l=box(lake);
  assert.ok(b.x0>=l.x0&&b.x1<=l.x1&&b.y0>=l.y0&&b.y1<=l.y1,kind+' lies inside the lake');
 }
 for(const kind of ['sun','cloud'])assert.ok(box(by(kind)).y1<=350,kind+' is in the sky');
 for(const kind of ['house','tree'])assert.ok(by(kind).y>350,kind+' stands on the ground');
 assert.ok(by('house').size>by('fish').size,'a house is drawn bigger than a fish (k.scenes size classes)');
 assert.ok(by('sun').size>=100,'the sun is not tiny');
});

test('the review harness passes on its scenes that have room (no-water, water-later, pond-life)',async()=>{
 const k=knowledge();
 for(const name of ['no-water','water-later','pond-life']){
  const {objects:made}=await buildScene(SCENES[name]);
  assert.deepEqual(review(made,k).failures,[],name);
 }
});

test('a boat with no water on the page goes low on the page, not over anything',async()=>{
 const {objects:made}=await buildScene(['house','boat']);
 const [house,boat]=made;
 assert.ok(boat.y>350,'low on the page');
 const a=box(house),b=box(boat);
 assert.ok(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0,'no overlap with the house');
});

test('a chat relation reaches the library placement: "a fish left of the house", at the fish size the area measures',async()=>{
 const text='Draw a fish to the left of the house.',{s,draw,run}=session(reading(text,'fish',[['left','house']]),text);
 await draw({kind:'house',x:600,y:500});
 const reply=await run();
 assert.equal(reply.statuses[0],'supported',reply.trace.error??reply.trace.reason??reply.text);
 assert.equal(reply.trace.geometryVerified,true);
 const [house,fish]=objects(s.isession.state['art.draw']);
 assert.equal(fish.kind,'fish');
 assert.ok(box(fish).x1<=box(house).x0,'the fish is left of the house');
 assert.ok(fish.size<house.size,'the fish keeps its knowledge size, smaller than the house');
});

// Several relations are one std.problem (internal search here, Z3 on an isolated page). Beside its anchors the subject
// keeps their ground line (the soft alignment declared for left/right in worlds/app.project/spatial-placement.sop),
// and the result names the geometry it gives, which the app checks against what it observes after the call.
test('two relations compile as one placement problem: "a tree right of the house and left of the car"',async()=>{
 const text='Draw a tree to the right of the house and to the left of the car.';
 const {s,draw,run}=session(reading(text,'tree',[['right','house'],['left','car']]),text);
 await draw({kind:'house',x:300,y:500});
 await draw({kind:'car',x:700,y:500});
 const reply=await run();
 assert.equal(reply.statuses[0],'supported',reply.trace.error??reply.trace.reason??reply.text);
 assert.equal(reply.trace.geometryVerified,true);
 const [house,car,tree]=objects(s.isession.state['art.draw']);
 assert.equal(tree.kind,'tree');
 assert.ok(box(tree).x0>=box(house).x1&&box(tree).x1<=box(car).x0,'between the house and the car');
 const grounds=[box(house).y1,box(car).y1];
 assert.ok(grounds.some(y=>Math.abs(box(tree).y1-y)<=18),'on the ground line of an anchor, within a grid step: '+JSON.stringify(tree));
});

test('"a sun above the house" keeps the house\'s centre line; "a boat on the lake" floats in its water, drawn smaller to fit',async()=>{
 const above='Draw a sun above the house.',a=session(reading(above,'sun',[['above','house']]),above);
 await a.draw({kind:'house',x:400,y:520});
 const sky=await a.run();
 assert.equal(sky.statuses[0],'supported',sky.trace.reason??sky.text);
 const [house,sun]=objects(a.s.isession.state['art.draw']);
 assert.ok(box(sun).y1<=box(house).y0,'above the house');
 assert.ok(Math.abs(sun.x-house.x)<=1,'on the centre line of the house');

 const on='Draw a boat on the lake.',b=session(reading(on,'boat',[['on','lake']]),on);
 await b.draw({kind:'lake',x:400,y:520});
 const floating=await b.run();
 assert.equal(floating.statuses[0],'supported',floating.trace.reason??floating.text);
 assert.equal(floating.trace.geometryVerified,true);
 const [lake,boat]=objects(b.s.isession.state['art.draw']),l=box(lake),w=box(boat);
 // The water of a lake is its k.layouts anchor (x=3 y=22 w=94 h=56 in the frame of the drawing).
 const water={x0:l.x0+.03*lake.size,y0:l.y0+.22*lake.size,x1:l.x0+.97*lake.size,y1:l.y0+.78*lake.size};
 assert.ok(w.x0>=water.x0&&w.x1<=water.x1&&w.y0>=water.y0&&w.y1<=water.y1,'in the water '+JSON.stringify(boat));
 // (The lake is drawn from its outline handles, landscape-rules.sop: the boat fits the room inside its water.)
 assert.ok(boat.size<160&&boat.size>=.45*(water.y1-water.y0),'drawn smaller to fit the water, still visible: '+boat.size);
});

test('"a boat in the lake" places the boat within the lake, beside what already floats there',async()=>{
 const text='Draw a boat in the lake.',{s,draw,run}=session(reading(text,'boat',[['in','lake']]),text);
 await draw({kind:'lake',x:400,y:520});
 await draw({kind:'fish',x:490,y:520,size:60});
 const reply=await run();
 assert.equal(reply.statuses[0],'supported',reply.trace.error??reply.trace.reason??reply.text);
 assert.equal(reply.trace.geometryVerified,true);
 const [lake,fish,boat]=objects(s.isession.state['art.draw']),l=box(lake),b=box(boat),f=box(fish);
 assert.equal(boat.kind,'boat');
 assert.ok(b.x0>=l.x0&&b.x1<=l.x1&&b.y0>=l.y0&&b.y1<=l.y1,'the boat lies within the lake');
 assert.ok(b.x1<=f.x0||f.x1<=b.x0||b.y1<=f.y0||f.y1<=b.y0,'the boat does not cover the fish');
});

// An anchor at the page edge leaves no room on the stated side: the placement method's declared fallbacks
// (spatial-placement.sop fallback=shrink/shift/side) take the closest feasible place and the reply discloses which
// (placement-default-policy.sop app.placement.disclosure), instead of refusing the request.
test('"a tree left of the house" with the house at the left edge: the closest place, disclosed',async()=>{
 const text='Draw a tree to the left of the house.',{s,draw,run}=session(reading(text,'tree',[['left','house']]),text);
 await draw({kind:'house',x:60,y:500});
 const reply=await run();
 assert.equal(reply.statuses[0],'supported',reply.trace.error??reply.trace.reason??reply.text);
 const result=parse(reply.trace.placement).find(w=>w.type==='std.placement.result');
 assert.ok(['shrink','shift','side'].includes(str(result.attrs.fallback?.[0]??'')),reply.trace.placement.split('\n')[0]);
 assert.match(reply.text,/There is no room/);
 const [house,tree]=objects(s.isession.state['art.draw']),h=box(house),t=box(tree);
 assert.ok(t.x0>=0,'on the page');
 assert.ok(t.x1<=h.x0||h.x1<=t.x0||t.y1<=h.y0||h.y1<=t.y0,'not over the house');
});
