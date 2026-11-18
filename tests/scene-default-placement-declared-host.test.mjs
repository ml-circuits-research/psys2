import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {executeDeclaredRequest} from '../src/dialog/declared-execution.mjs';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

const root = new URL('../docs/webchat/', import.meta.url);
const deployment = JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',root),'utf8'));
const bindings = JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,root),'utf8'));
const catalog = process.env.SCENE_TEST_CATALOG ?? new URL('catalog/'+CATALOG_PIN.commit+'/',root).pathname;
const world = 'art.draw', view = 'draw';
const setup = () => ({
  isession: {state:{[world]:initialDrawingState(),'ui.shell':{activeTab:view}}},
  engine: {knowledge:createFacts({source:createKnowledgeSource(catalog)})},
});
const observe = session => toNativeDrawingState(session.isession.state[world]).objects;
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
