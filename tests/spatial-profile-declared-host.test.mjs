import { test } from 'node:test';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/vendor/sopworld/sopworld.mjs';
import { routeNewEngine } from '../src/dialog/reader-routing.mjs';
import { invokeNativeControl } from '../src/dialog/native-tool-controls.mjs';
import { identityRegistryFor, instanceIdFor } from '../src/dialog/instance-identity.mjs';
import { createNativeToolHost } from '../worlds/native-tool-host.mjs';
import { createDrawingHost, initialDrawingState } from '../worlds/art.draw/declared-host.mjs';
import { createDiagramHost, initialDiagramState } from '../worlds/diagram.sketch/declared-host.mjs';
import { observePlacementCorrection, placementProfileSop, placementProfileSnapshot, readPlacementProfile, rememberPlacement, restorePlacementProfile, withdrawPlacementCorrection } from '../worlds/app.project/spatial-profile.mjs';

const root = new URL('../docs/webchat/', import.meta.url);
const deployment = JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',root),'utf8'));
const bindings = JSON.parse(readFileSync(new URL(deployment.artifactBase + deployment.bindingsArtifact.path,root),'utf8'));
const text = 'Place the fish near the house.';
const kind = lemma => bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma).canonical;
function request(act) {
  return { request:'r', wires:[
    `@source std.request.source text="${text}"`,
    '@r std.request act='+act+' mood=do source=$source',
    '@subject std.request.target request=$r mode='+(act==='make'?'new':'existing')+' kind='+kind('fish'),
    '@anchor std.request.target request=$r mode=existing kind='+kind('house'),
    '@near std.request.constraint request=$r target=$subject concept=place operator=relation relation=near goal=$anchor polarity=positive character=requirement',
  ].join('\n') };
}

function setup() {
  let candidate = request('make');
  const world = 'art.draw', view = 'draw';
  const session = { isession:{state:{[world]:initialDrawingState(),'ui.shell':{activeTab:view}}}, engine:{ requestReader:{
    bindings:()=>bindings, provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
    propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[candidate],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
  } } };
  const control = (operation,args) => invokeNativeControl(session,{view,operation,args});
  const spatial = () => createDrawingHost({state:session.isession.state[world],instanceId:instanceIdFor(session,world)}).observeSpatial();
  async function run(act = 'make') {
    candidate = request(act);
    const result = await routeNewEngine(session,text,{view});
    assert.equal(result.statuses[0],'supported',result.trace.error??result.trace.reason);
    return result.trace.receipt.changed[0];
  }
  return {session,world,control,spatial,run};
}

const command = (act,clearance) =>
  '@spacing app.spatial-profile.'+act+' relation=near metric=near_distance'+(clearance===undefined?'':' clearance='+clearance);

function gap(spatial,subject,anchor) {
  const lookup = id => spatial.boxes.find(row=>row.entity===id);
  const a=lookup(subject), b=lookup(anchor);
  return Math.max(a.min_x-b.max_x,b.min_x-a.max_x,a.min_y-b.max_y,b.min_y-a.max_y);
}

test('exact SOP preference changes actual compiled placement and undo is scoped across pages', async () => {
  const {session,world,control,spatial,run} = setup();
  const anchor = (await control('drawing.object.make',{kind:'house',x:390,y:350})).receipt.changed[0];
  const set = input=>placementProfileSop(session,spatial(),input);
  assert.equal(set({clearance:34}).ok,false);
  assert.equal(set(command('set','-1')).ok,false);
  assert.equal(set(command('set',34)+'\n@bad core.type of=unknown').ok,false);
  assert.equal(set(command('set',34)).clearance,34);

  const diagram = await createDiagramHost({state:initialDiagramState(),instanceId:instanceIdFor(session,'diagram.sketch')});
  assert.equal(placementProfileSop(session,diagram.observeSpatial(),command('inspect')).clearance,null);
  assert.equal(placementProfileSop(session,diagram.observeSpatial(),command('set',27)).clearance,27);
  const fish = await run();
  assert.equal(gap(spatial(),fish,anchor),34);
  assert.equal(set(command('set',42)).clearance,42);
  await run('place');
  assert.equal(gap(spatial(),fish,anchor),42);
  assert.equal(set(command('undo')).clearance,34);
  await run('place');
  assert.equal(gap(spatial(),fish,anchor),34);
  assert.equal(set(command('undo')).clearance,null);
  await run('place');
  assert.equal(gap(spatial(),fish,anchor),12);
  assert.equal(placementProfileSop(session,diagram.observeSpatial(),command('inspect')).clearance,27);

  const portable = placementProfileSnapshot(session);
  const next = {isession:{state:{[world]:session.isession.state[world]}}};
  restorePlacementProfile(next,portable);
  assert.equal(placementProfileSop(next,diagram.observeSpatial(),command('inspect')).clearance,27);
});

test('two independently verified placement corrections change the next compiled position and undo withdraws one', async () => {
  const {session,world,control,spatial,run} = setup();
  const anchor = (await control('drawing.object.make',{kind:'house',x:390,y:350})).receipt.changed[0];
  const fish = await run();
  const move = async distance => {
    const object = toNativeDrawingState(session.isession.state[world]).objects.find(row=>row.id===fish);
    return control('drawing.object.place',{ids:[fish],x:object.x+distance,y:object.y});
  };
  assert.equal(gap(spatial(),fish,anchor),12);
  assert.equal((await move(0)).intentRecord.verification.status,'verified');
  assert.equal(placementProfileSnapshot(session).corrections.length,0);
  assert.equal((await move(8)).intentRecord.verification.status,'verified');
  assert.equal(placementProfileSnapshot(session).corrections.length,1);
  assert.equal(gap(spatial(),fish,anchor),20);

  await run('place');
  assert.equal(gap(spatial(),fish,anchor),12);
  assert.equal((await move(8)).intentRecord.verification.status,'verified');
  assert.equal(placementProfileSnapshot(session).corrections.length,2);

  const entries = session.newEngineUndo.length;
  await run('place');
  assert.equal(gap(spatial(),fish,anchor),20);
  if (session.newEngineUndo.length > entries) await control('undo',{});
  assert.equal((await control('undo',{})).ok,true);
  assert.equal(placementProfileSnapshot(session).corrections.length,1);
  await run('place');
  assert.equal(gap(spatial(),fish,anchor),12);
});

test('profile evidence remains withdrawable without losing later entries and rejects incomparable observations', () => {
  const session = {};
  const spatial = (revision, gapLength, { source = 'fish@1', anchorX = 0, complete = true } = {}) => {
    const frame='canvas', scope='root', instance='editor';
    const obs = {frame,scope,instance,revision,evidence:'bounds'};
    return { revision,frame,scope, observation:{ instanceId:instance,complete,objects:[{id:'fish',source},{id:'house',source:'house@1'}] }, boxes:[
      {...obs,entity:'house',min_x:anchorX,max_x:10+anchorX,min_y:0,max_y:10},
      {...obs,entity:'fish',min_x:10+gapLength,max_x:20+gapLength,min_y:0,max_y:10},
    ] };
  };
  const before = spatial('a',12);
  rememberPlacement(session,before,'fish','house','near');
  for (const incomparable of [spatial('b',20,{source:'fish@2'}),spatial('b',20,{anchorX:2}),spatial('b',20,{complete:false}),spatial('b',12)]) {
    assert.equal(observePlacementCorrection(session,before,incomparable,'fish','test.invalid'),null);
  }
  const first = observePlacementCorrection(session,before,spatial('b',20),'fish','event.first');
  rememberPlacement(session,spatial('c',12),'fish','house','near');
  const second = observePlacementCorrection(session,spatial('c',12),spatial('d',20),'fish','event.second');
  assert.ok(first&&second);
  withdrawPlacementCorrection(session,first,false);
  const observations = parse(readPlacementProfile(session,spatial('e',20)));
  assert.deepEqual(observations.filter(row=>row.type==='k.spatial2d.correction').map(row=>row.attrs.event[0]),['"event.second"']);
  withdrawPlacementCorrection(session,first,true);
  assert.equal(placementProfileSnapshot(session).corrections.length,2);
});

test('different native wrappers share an epoch for one live object and advance it when the object reappears', () => {
  const session = {}, world = 'editor';
  const state = { items:['other','subject'] };
  const host = () => createNativeToolHost({
    state, instanceId:instanceIdFor(session,world), identityRegistry:identityRegistryFor(session,world), scope:'items',
    operations:[], handlers:{}, view:value=>value.items.map(id=>({id,kind:'item',sourceType:'example.item'})),
  });
  const source = () => host().observe().objects.find(row=>row.id==='subject')?.source;
  const first = source();
  state.items.reverse();
  assert.equal(source(),first);
  state.items = ['other'];
  assert.equal(source(),undefined);
  state.items.push('subject');
  const next = source();
  assert.notEqual(next,first);
  const portable = placementProfileSnapshot(session), restored = {};
  restorePlacementProfile(restored,portable);
  assert.deepEqual(identityRegistryFor(restored,world),identityRegistryFor(session,world));
});
