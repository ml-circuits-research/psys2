import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {compareDeclaredReadings,executeDeclaredRequest} from '../src/dialog/declared-execution.mjs';
import {drawingObjects} from './drawing-state.mjs';
import {createDiagramHost,initialDiagramState} from "../worlds/diagram.sketch/declared-host.mjs";
import {toNativeDiagramState} from "../worlds/diagram.sketch/canonical-state.mjs";
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
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

test('ordinary creation uses a live scene slot and preserves each explicit coordinate independently', async () => {
  const session=setup();
  const inferred=await draw(session,'sun');
  assert.deepEqual(measure(observe(session)[0]),[500,175]);
  assert.match(inferred.trace.compiledSop,/name="y" value=175/);
  assert.match(inferred.text,/used the scene layout/);

  for(const [input, wanted] of [[{x:115},[115,175]],[{y:510},[500,510]],[{x:73,y:511},[73,511]]]){
    const next=setup();
    await draw(next,'sun',input);
    assert.deepEqual(measure(observe(next)[0]),wanted);
  }
});

test('water placement prefers a feasible observed support and never adds an unstated lake', async () => {
  const session=setup();
  const add = (kind,x,y) => performGesture(session,{view,operation:'drawing.object.make',args:{kind,x,y}});
  assert.equal((await add('lake',260,460)).ok,true);
  assert.equal((await add('lake',720,440)).ok,true);
  assert.equal((await add('square',720,440)).ok,true);
  const activity=[];
  session.engine.onWorldActivity=event=>activity.push(event);
  const placement=await draw(session,'boat');
  const objects=observe(session);
  assert.deepEqual(objects.map(o=>o.kind),['lake','lake','square','boat']);
  assert.ok(Math.abs(objects.at(-1).x-260)<5,JSON.stringify(objects.at(-1)));
  assert.ok(Math.abs(objects.at(-1).y-460)<5,JSON.stringify(objects.at(-1)));
  assert.match(placement.trace.compiledSop,/scene\.seed/);
  const selected=activity.filter(event=>event.nodeIds.includes('execution:scene-default-policy'));
  assert.equal(selected.length,1);
  assert.deepEqual(selected[0].nodeIds.filter(id=>id.startsWith('knowledge-world:')),['knowledge-world:k.composition2d']);
  assert.ok(selected[0].facts.includes('k.layouts.anchor.lake.water'));
  assert.match(selected[0].sceneEvidence,/@k\.layouts\.anchor\.lake\.water k\.layouts\.anchor/);
  assert.match(selected[0].sceneEvidence,/app\.sceneDefault\.candidate .*crowding=0/);

  const empty=setup(),without=await draw(empty,'boat');
  assert.deepEqual(observe(empty).map(o=>o.kind),['boat']);
  assert.doesNotMatch(without.trace.compiledSop,/scene\.seed/);
});

test('an occupied sky slot tries another sampled point and a full region keeps its least crowded candidate',async()=>{
  const session=setup();
  await draw(session,'sun');
  await draw(session,'moon');
  const [sun,moon]=observe(session);
  assert.deepEqual(measure(sun),[500,175]);
  assert.deepEqual(measure(moon),[250,175]);

  const full=setup();
  const blocked=await performGesture(full,{view,operation:'drawing.object.make',args:{kind:'square',x:500,y:175,size:1500}});
  assert.equal(blocked.ok,true);
  const center=await performGesture(full,{view,operation:'drawing.object.make',args:{kind:'square',x:500,y:175}});
  assert.equal(center.ok,true);
  const soft=await draw(full,'sun');
  assert.equal(observe(full).length,3);
  assert.match(soft.trace.compiledSop,/scene\.seed/);
  assert.deepEqual(measure(observe(full).at(-1)),[250,175]);
});

test('shipped Diagram role layout responds to actual page occupancy and independent node moves', async () => {
  const candidate={request:'r',wires:[
    '@s std.request.source text="Add a circle."',
    '@r std.request act=make mood=do source=$s',
    '@t std.request.target request=$r mode=new kind=k.shapes.shape.circle',
  ].join('\n')};
  const state = initialDiagramState();
  state.frame = {x:800,y:500};
  const activity = [];
  const session = {
    isession:{state:{'diagram.sketch':state,'ui.shell':{activeTab:'diagram'}}},
    engine:{knowledge:createFacts({source:createKnowledgeSource(catalog)}),onWorldActivity:event=>activity.push(event)},
  };
  const shapes=()=>toNativeDiagramState(session.isession.state['diagram.sketch']).shapes;
  async function addCircle(expected) {
    const result=await executeDeclaredRequest(session,candidate,'Add a circle.',{view:'diagram',bindings});
    assert.equal(result.statuses[0],'supported',JSON.stringify(result.trace));
    assert.match(result.trace.controlIntent,/operation="diagram.node.make"/);
    assert.match(result.trace.compiledSop,/scene\.seed/);
    assert.deepEqual(measure(shapes().at(-1)),expected);
  }
  await addCircle([1200,750]);
  assert.match(activity.find(event=>event.sceneEvidence)?.sceneEvidence,/k\.layouts\.slot\.scatter\.item/);
  const proof=activity.find(event=>event.sceneEvidence);
  assert.match(proof.sceneEvidence,/basis=role/);
  assert.match(proof.sceneEvidence,/profile="scene.projection.roles"/);
  assert.doesNotMatch(proof.sceneEvidence,/k\.layouts\.anchor\.lake/);
  await addCircle([1000,750]);
  const moved=await performGesture(session,{view:'diagram',operation:'diagram.node.place',
    args:{ids:[shapes()[0].name],x:1400,y:750}});
  assert.equal(moved.ok,true);
  await addCircle([1200,750]);
  assert.deepEqual(shapes().map(measure),[[1400,750],[1000,750],[1200,750]]);

  const drawing=setup(), drawn=await draw(drawing,'circle');
  assert.equal(observe(drawing)[0].kind,'circle');
  assert.doesNotMatch(drawn.trace.compiledSop,/scene\.seed/);
});

test('plural Diagram preflight measures each admissible count and commits one native batch', async () => {
  const view='diagram', world='diagram.sketch', activity=[];
  const session={
    isession:{state:{[world]:initialDiagramState(),'ui.shell':{activeTab:view}}},
    engine:{knowledge:createFacts({source:createKnowledgeSource(catalog)}),onWorldActivity:event=>activity.push(event)},
  };
  const gesture=(operation,args={})=>performGesture(session,{view,operation,args});
  assert.equal((await gesture('diagram.node.make',{kind:'rectangle',x:285,y:250})).ok,true);
  const observation=()=>toNativeDiagramState(session.isession.state[world]).shapes.map(({name,shape,x,y})=>({name,shape,x,y}));
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
  assert.equal(compared.plan.scenePlaced,true);
  assert.equal(compared.plan.args.x,600);
  const singleton=await compareDeclaredReadings(session,[candidate(),candidate(3)],{view,bindings});
  assert.equal(singleton.plan.args.n,1);
  assert.equal(singleton.plan.args.x,400);
  assert.deepEqual(observation(),starting);
  const reply=await executeDeclaredRequest(session,candidate(3),text,{view,bindings});
  assert.equal(reply.statuses[0],'supported',reply.text);
  assert.match(reply.text,/Created 3 objects of kind circle/);
  assert.match(reply.trace.controlIntent,/name="n" value=3/);
  assert.deepEqual(observation().slice(0,1),starting);
  assert.deepEqual(observation().slice(1).map(measure),[[482,250],[600,250],[718,250]]);

  const proof=parse(activity.find(event=>event.sceneEvidence).sceneEvidence);
  const chosen=proof.find(row=>row.type==='app.sceneDefault.option');
  const observed=(await createDiagramHost({instanceId:'plural-observation',state:structuredClone(session.isession.state[world])})).observeSpatial();
  const names=new Set(observation().slice(1).map(shape=>shape.name));
  const boxes=observed.boxes.filter(box=>names.has(box.entity));
  const actual=[Math.min(...boxes.map(box=>box.min_x)),Math.min(...boxes.map(box=>box.min_y)),
    Math.max(...boxes.map(box=>box.max_x)),Math.max(...boxes.map(box=>box.max_y))];
  assert.deepEqual(['min_x','min_y','max_x','max_y'].map(key=>Number(chosen.attrs[key][0])),actual);
});
