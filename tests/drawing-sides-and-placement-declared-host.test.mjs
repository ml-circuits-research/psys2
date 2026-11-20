// Drawing requests the probes found failing, each won by a declared or generic piece:
// - "make the house wider": every drawn object is observed with its width and height (the sides of its box, its
//   size when it has no own side; worlds/art.draw/act-rules.sop and render-projection.sop), and a comparative of a
//   side is declared on the same scale as size (worlds/app.project/execution-policy.sop), so it scales that side only;
// - "add a duck in the lake": a kind drawn by the catalog tool (drawing.catalog.make) has the same declared spatial
//   capability as the drawn kinds, so relations place it; its extent is measured with its knowledge loaded;
// - "put the sun above the house" with no sun: the reading as given has no target, so the ranked creating reading
//   draws a sun there, says so, and can be undone.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
import {comparativeSteps} from '../src/dialog/comparative-projection.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {NATIVE_AREAS} from '../src/dialog/app-reader-context.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindingsText=readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');
const catalogRoot=new URL('catalog/',webchat).pathname,catalogCommit=readdirSync(catalogRoot).find(name=>/^[0-9a-f]{40}$/.test(name));
const knowledge=createFacts({source:createKnowledgeSource(catalogRoot+catalogCommit)});

function session(){
 let read;
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{knowledge,onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 const objects=()=>parse(s.isession.state['art.draw'].sop).filter(w=>w.type==='w.drawing.object');
 return {s,objects,draw:args=>performGesture(s,{view:'draw',operation:'drawing.object.make',args}),
  say:async(text,request)=>{
   const out=bridgeRawStructure({format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area:'drawing',model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},
    requestCount:1,requests:[{span:text,trigger:text.split(' ')[0],mood:'do',...request}],ranges:[],coverage:{complete:true,truncated:false}},{bindings,bindingSha256,comparatives:comparativeSteps()});
   assert.deepEqual(out.diagnostics,[]);read=out.decoded.candidates[0];
   return routeNewEngine(s,text,{view:'draw'});
  },
  // An authored request graph, as a probe's reading wrote it, through the same route.
  sop:(text,lines)=>routeNewEngine(s,['@src std.request.source text='+JSON.stringify(text),...lines].join('\n').replace('mood=do','mood=do source=$src'),{view:'draw'})};
}
const supported=reply=>assert.equal(reply.statuses[0],'supported',reply.trace?.error??reply.trace?.reason??reply.text);
const observed=async s=>{
 const host=await NATIVE_AREAS.draw.create({state:structuredClone(s.isession.state['art.draw']),instanceId:'observe'});
 return {objects:host.observe().objects.filter(o=>o.sourceType==='art.draw.object'),spatial:host.observeSpatial()};
};
const input=(object,key)=>Number(JSON.parse(object.inputs.find(i=>i.key===key).values[0]));

test('every drawn object is observed with its width and height, its size where it has no side of its own',async()=>{
 const t=session();
 await t.draw({kind:'house'});
 const {objects:[house],spatial}=await observed(t.s);
 const size=input(house,'size');
 assert.equal(input(house,'width'),size);
 assert.equal(input(house,'height'),size);
 const box=spatial.boxes.find(b=>b.entity===house.id);
 assert.equal(box.max_x-box.min_x,size);
});

test('"make the house wider" scales the width the house has now by one comparative step and keeps its height',async()=>{
 const t=session();
 await t.draw({kind:'house'});
 const [before]=t.objects(),size=Number(before.attrs.size[0]);
 const factor=comparativeSteps().find(row=>row.concept==='w.drawing.object.width'&&row.step==='more').factor;
 const reply=await t.say('make the house wider',{act:'change',target:{type:'drawn',mode:'existing',determiner:'definite',fill:'written',kind:'house',kind_span:'house'},
  constraints:[{key:'drawn.width',operator:'delta',step:'more',value:'wider',value_span:'wider',phase:'result',polarity:'positive',character:'requirement'}]});
 supported(reply);
 const [after]=t.objects();
 assert.equal(Number(after.attrs.width[0]),size*factor);
 assert.equal(after.attrs.height,undefined,'the other side stays the size');
 const {objects:[house],spatial}=await observed(t.s),box=spatial.boxes.find(b=>b.entity===house.id);
 assert.equal(input(house,'width'),size*factor);
 assert.equal(input(house,'height'),size);
 assert.equal(box.max_x-box.min_x,size*factor);
 assert.equal(box.max_y-box.min_y,size);
});

test('a kind with no drawing ("draw a stingray in the lake") is drawn as its closest drawable relative, named after it',async()=>{
 const t=session();
 await t.draw({kind:'lake'});
 const reply=await t.sop('draw a stingray in the lake',['@r0 std.request act=make mood=do root=$c0',
  '@t0 std.request.target determiner=indefinite kind=k.animals.animal.stingray mode=new request=$r0',
  '@t1 std.request.target determiner=definite kind=k.objects.lake mode=existing request=$r0',
  '@c0 std.request.constraint character=requirement concept=k.spatial2d.relation.kind goal=$t1 operator=relation polarity=positive relation=in request=$r0 source=$src source.start=15 source.end=17 target=$t0']);
 supported(reply);
 const ray=t.objects().find(o=>/stingray/.test(o.attrs.name?.[0]??''));
 assert.ok(ray,'the made object keeps the asked kind as its name');
 assert.equal(JSON.parse(ray.attrs.drawing[0].startsWith('"')?ray.attrs.drawing[0]:JSON.stringify(ray.attrs.drawing[0])),'fish','a stingray is a fish (a drawable k.kinds parent)');
 assert.match(reply.text,/There is no drawing of a stingray, so I drew a fish\./);
});

test('a catalog kind ("add a duck in the lake") is placed by a relation through the catalog tool',async()=>{
 const t=session();
 await t.draw({kind:'lake'});
 const reply=await t.sop('add a duck in the lake',['@r0 std.request act=make mood=do root=$c0',
  '@t0 std.request.target determiner=indefinite kind=k.objects.u1f986 mode=new request=$r0',
  '@t1 std.request.target determiner=definite kind=k.objects.lake mode=existing request=$r0',
  '@c0 std.request.constraint character=requirement concept=k.spatial2d.relation.kind goal=$t1 operator=relation polarity=positive relation=in request=$r0 source=$src source.start=11 source.end=13 target=$t0']);
 supported(reply);
 assert.match(reply.trace.placement,/drawing\.catalog\.make/);
 const objects=t.objects(),lake=objects.find(o=>o.attrs.drawing[0]==='lake'),duck=objects.find(o=>JSON.parse(o.attrs.drawing[0].startsWith('"')?o.attrs.drawing[0]:JSON.stringify(o.attrs.drawing[0]))==='duck');
 assert.ok(duck,'a duck is drawn');
 const half=Number(lake.attrs.size[0])/2;
 assert.ok(Math.abs(Number(duck.attrs.x[0])-Number(lake.attrs.x[0]))<=half&&Math.abs(Number(duck.attrs.y[0])-Number(lake.attrs.y[0]))<=half,'inside the lake');
});

test('a placement of a definite kind absent from the page draws one there, says so, and can be undone',async()=>{
 const t=session();
 await t.draw({kind:'house'});
 const reply=await t.sop('put the sun above the house',['@r0 std.request act=place mood=do root=$c0',
  '@t0 std.request.target determiner=definite kind=k.objects.sun mode=existing request=$r0',
  '@t1 std.request.target determiner=definite kind=k.objects.house mode=existing request=$r0',
  '@c0 std.request.constraint character=requirement concept=k.spatial2d.relation.kind goal=$t1 operator=relation polarity=positive relation=above request=$r0 source=$src source.start=12 source.end=17 target=$t0']);
 supported(reply);
 assert.match(reply.text,/There was no sun on the page, so I drew a new one\..*undo/);
 assert.equal(reply.trace.hypotheses.used,'creating');
 assert.equal(reply.trace.hypotheses.given.reason,'unbound-target');
 const objects=t.objects(),house=objects.find(o=>o.attrs.drawing[0]==='house'),sun=objects.find(o=>o.attrs.drawing[0]==='sun');
 assert.ok(sun&&Number(sun.attrs.y[0])<Number(house.attrs.y[0]),'the sun is above the house');
 assert.equal(t.s.newEngineUndo?.length,2,'the creation is one more undoable step');
 // With a sun on the page the reading as given moves it; nothing new is drawn.
 const again=await t.sop('put the sun above the house',['@r0 std.request act=place mood=do root=$c0',
  '@t0 std.request.target determiner=definite kind=k.objects.sun mode=existing request=$r0',
  '@t1 std.request.target determiner=definite kind=k.objects.house mode=existing request=$r0',
  '@c0 std.request.constraint character=requirement concept=k.spatial2d.relation.kind goal=$t1 operator=relation polarity=positive relation=above request=$r0 source=$src source.start=12 source.end=17 target=$t0']);
 assert.equal(again.trace.hypotheses,undefined);
 assert.equal(t.objects().filter(o=>o.attrs.drawing[0]==='sun').length,1);
});
