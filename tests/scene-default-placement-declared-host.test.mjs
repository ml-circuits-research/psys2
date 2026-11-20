import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {compareDeclaredReadings,executeDeclaredRequest} from '../src/dialog/declared-execution.mjs';
import {drawingObjects} from './drawing-state.mjs';
import {diagramState,diagramNodes} from './diagram-state.mjs';
import {createDiagramArea} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

const root = new URL('../docs/webchat/', import.meta.url);
const deployment = JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',root),'utf8'));
const bindings = JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,root),'utf8'));
const catalog = process.env.SCENE_TEST_CATALOG ?? new URL('catalog/'+CATALOG_PIN.commit+'/',root).pathname;
const world = 'art.draw', view = 'draw';
const setup = () => ({
  isession: {state:{[world]:emptyDrawingState(),'ui.shell':{activeTab:view}}},
  engine: {knowledge:createFacts({source:createKnowledgeSource(catalog)})},
});
const observe = session => drawingObjects(session.isession.state[world]);
async function draw(session, name, coordinates = {}) {
  const kind = bindings.kinds.find(row=>row.area==='drawing' && row.lemma===name).canonical;
  const candidate={request:'r',wires:[
    '@s std.request.source text="Create the requested object."',
    '@r std.request act=make mood=do source=$s',
    '@t std.request.target request=$r mode=new kind='+kind,
    ...Object.entries(coordinates).map(([axis, value]) => '@c.'+axis+' std.request.constraint request=$r target=$t concept='+axis+
      ' operator=eq character=requirement polarity=positive value='+value),
  ].join('\n')};
  const result=await executeDeclaredRequest(session,candidate,'Create the requested object.',{view,bindings});
  assert.equal(result.statuses[0],'supported',JSON.stringify(result.trace));
  return result;
}
const measure = ({x,y}) => [x,y];
const box = o => ({x0:o.x-o.size/2,y0:o.y-o.size/2,x1:o.x+o.size/2,y1:o.y+o.size/2});
const apart = (a,b) => a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0;
const HORIZON = 350; // the landscape layout of the Drawing page: sky above half of its 700 px height

// The Drawing tab declares no scene-default port: a chat request without a place reaches the area's own placement
// (worlds/art.draw/act-rules.sop: knowledge regions, containment, free spots, knowledge sizes). These checks are
// geometric, as a person looking at the page would judge it.
test('a chat creation without a place is placed by the Drawing area, and each explicit coordinate is kept', async () => {
  const session=setup(), activity=[];
  session.engine.onWorldActivity=event=>activity.push(event);
  const inferred=await draw(session,'sun');
  const [sun]=observe(session);
  assert.ok(box(sun).y1<=HORIZON && box(sun).y0>=0,'the sun lies in the sky: '+JSON.stringify(sun));
  assert.ok(sun.size>=100,'the sun is drawn at its knowledge size, not tiny');
  assert.doesNotMatch(inferred.trace.compiledSop,/scene\.seed/);
  assert.doesNotMatch(inferred.trace.compiledSop,/name="[xy]"/,'the chat adds no coordinate of its own');
  assert.equal(activity.filter(event=>event.nodeIds?.includes('execution:scene-default-policy')).length,0);

  for(const input of [{x:115},{y:510},{x:73,y:511}]){
    const next=setup();
    await draw(next,'sun',input);
    const [made]=observe(next);
    for(const [axis,value] of Object.entries(input))assert.equal(made[axis],value,axis+' is kept as asked');
  }
});

test('a boat goes into the water of a lake on the page, never onto other things, and no lake is added', async () => {
  const session=setup();
  const add = (kind,x,y) => performGesture(session,{view,operation:'drawing.object.make',args:{kind,x,y}});
  assert.equal((await add('lake',260,460)).ok,true);
  assert.equal((await add('lake',720,440)).ok,true);
  assert.equal((await add('square',720,440)).ok,true);
  const placement=await draw(session,'boat');
  const objects=observe(session), boat=objects.at(-1);
  assert.deepEqual(objects.map(o=>o.kind),['lake','lake','square','boat']);
  assert.ok(objects.filter(o=>o.kind==='lake').some(lake=>{const l=box(lake),b=box(boat);return b.x0>=l.x0&&b.x1<=l.x1&&b.y0>=l.y0&&b.y1<=l.y1;}),'the boat lies within a lake: '+JSON.stringify(boat));
  assert.ok(apart(box(boat),box(objects[2])),'the boat does not cover the square');
  assert.doesNotMatch(placement.trace.compiledSop,/scene\.seed/);

  const empty=setup();
  await draw(empty,'boat');
  const [alone]=observe(empty);
  assert.deepEqual(observe(empty).map(o=>o.kind),['boat']);
  assert.ok(alone.y>HORIZON,'with no water on the page the boat goes low on the page');
});

test('a second sky thing takes a free spot of the sky; a full sky keeps the least crowded spot, not centred on anything',async()=>{
  const session=setup();
  await draw(session,'sun');
  await draw(session,'moon');
  const [sun,moon]=observe(session);
  for(const o of [sun,moon])assert.ok(box(o).y1<=HORIZON,o.kind+' is in the sky');
  assert.ok(apart(box(sun),box(moon)),'the moon does not cover the sun');

  const full=setup();
  assert.equal((await performGesture(full,{view,operation:'drawing.object.make',args:{kind:'square',x:500,y:350,size:1500}})).ok,true);
  assert.equal((await performGesture(full,{view,operation:'drawing.object.make',args:{kind:'square',x:500,y:175}})).ok,true);
  await draw(full,'sun');
  const objects=observe(full), made=objects.at(-1);
  assert.equal(objects.length,3);
  assert.equal(made.kind,'sun');
  assert.ok(box(made).y1<=HORIZON,'the sun stays in the sky');
  for(const other of objects.slice(0,2))assert.ok(Math.hypot(made.x-other.x,made.y-other.y)>=10,'not centred on '+other.kind);
  assert.ok(apart(box(made),box(objects[1])),'it does not cover the small square either');
});

// Diagram declares no scene-default placement: its area lays nodes out by flow levels (worlds/diagram.sketch/
// render-projection.sop) and stores no position unless a node is pinned. What remains to check here is plural creation.
test('plural Diagram preflight measures each admissible count and commits one native batch', async () => {
  const view='diagram', world='diagram.sketch';
  const session={
    isession:{state:{[world]:await diagramState([{kind:'rectangle'}]),'ui.shell':{activeTab:view}}},
    engine:{knowledge:createFacts({source:createKnowledgeSource(catalog)})},
  };
  const observation=()=>diagramNodes(session.isession.state[world]).map(({id,kind})=>({id,kind}));
  const starting=observation();
  const text='Add 3 circles';
  const candidate=count=>({request:'r',wires:[
    '@s std.request.source text='+JSON.stringify(text),
    '@r std.request act=make mood=do source=$s',
    '@t std.request.target request=$r mode=new kind=k.shapes.shape.circle',
    ...(count?['@c std.request.constraint request=$r target=$t concept=count operator=eq character=requirement polarity=positive value='+count]:[]),
  ].join('\n')});
  const compared=await compareDeclaredReadings(session,[candidate(3),candidate()],{view,bindings});
  assert.equal(compared.index,0,compared.sop);
  assert.equal(compared.plan.args.n,3);
  const singleton=await compareDeclaredReadings(session,[candidate(),candidate(3)],{view,bindings});
  assert.equal(singleton.plan.args.n,1);
  assert.deepEqual(observation(),starting,'preflight has no effect');
  const reply=await executeDeclaredRequest(session,candidate(3),text,{view,bindings});
  assert.equal(reply.statuses[0],'supported',reply.text);
  assert.match(reply.text,/Created 3 objects of kind circle/);
  assert.match(reply.trace.controlIntent,/name="n" value=3/);
  assert.equal(reply.trace.controlIntent.match(/std\.capability\.call /g).length,1,'one native batch');
  assert.deepEqual(observation().slice(0,1),starting);
  assert.deepEqual(observation().slice(1).map(node=>node.kind),['circle','circle','circle']);

  // The area's own layout puts every new circle on the page, apart from each other and from the rectangle.
  const observed=(await createDiagramArea({state:structuredClone(session.isession.state[world])})).observeSpatial();
  const boxes=new Map(observed.boxes.map(box=>[box.entity,box]));
  const nodes=observation().map(node=>boxes.get(node.id));
  for(const box of nodes)assert.ok(box&&box.min_x>=0&&box.min_y>=0&&box.max_x<=1000&&box.max_y<=700,JSON.stringify(box));
  const disjoint=(a,b)=>a.max_x<=b.min_x||b.max_x<=a.min_x||a.max_y<=b.min_y||b.max_y<=a.min_y;
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(disjoint(nodes[i],nodes[j]),nodes[i].entity+' covers '+nodes[j].entity);
});
