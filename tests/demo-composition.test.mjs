import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectWorlds, validateDependencies, createDemoLoader } from '../scripts/lib/demo-composition.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

test('composition cannot expose unselected files or executable modules', async () => {
  const visited = [];
  const source = { listWorlds: async () => ['a', 'b'], ...Object.fromEntries(['readFile', 'loadOps', 'loadFns'].map((name) => [name, async (...args) => { visited.push([name, ...args]); return 'visible'; }])) };
  const loader = await selectWorlds(source, ['a']);
  assert.deepEqual(await loader.listWorlds(), ['a']);
  for (const name of ['readFile', 'loadOps', 'loadFns']) assert.equal(await loader[name]('b', 'world.sop'), null);
  assert.deepEqual(visited, []);
  assert.equal(await loader.readFile('a', 'world.sop'), 'visible');
  await assert.rejects(selectWorlds(source, ['missing']), /missing world/);
  await assert.rejects(selectWorlds(source, ['a', 'a']), /unique world/);
});

test('all declared dependency kinds must be inside the composition', () => {
  for (const kind of ['imports', 'reads', 'compose']) {
    const world = { id: 'consumer', [kind]: ['provider'] };
    assert.throws(() => validateDependencies({ list: () => [world] }), new RegExp(`${kind} missing world provider`));
    assert.doesNotThrow(() => validateDependencies({ list: () => [world, { id: 'provider' }] }));
  }
});

test('demo loader and its generated metadata omit retired capabilities', async () => {
  const loader = await createDemoLoader();
  const set = await loadWorlds(loader);
  for (const id of ['geo.map','media.music','kids.common','kids.arith','kids.shop','kids.tasks','calc.arith','calc.story','talk','plan.list','ui.help','meta.worlds','session.conversation','session.dialogue','session.things','data.charts']) {
    assert.equal(set.get(id), undefined);
    assert.equal(await loader.loadOps(id), null);
  }
  assert.equal(set.list().length,7);assert.deepEqual(loader.always,await loader.listWorlds());
  for(const world of set.list()){assert.equal(world.patterns.length,0);assert.equal(world.lexicons.length,0);assert.equal(world.kb.length,0);}
  assert.equal((await loader.loadOps('ui.shell')).initialState().activeTab,'draw');
  assert.ok(set.get('art.draw') && set.get('diagram.sketch') && set.get('docs.editor'));
});

test('demo exposes authored native interfaces and the actual host uses those capability records',async()=>{
 const {World,parse,str}=await import('../src/vendor/sopworld/sopworld.mjs'),loader=await createDemoLoader();
 for(const [id,profile] of Object.entries(loader.composition.profiles)){
  if(!profile.nativeHost)continue;
  const source=await readFile(new URL('../worlds/'+id+'/native-interface.sop',import.meta.url),'utf8');
  assert.equal(await loader.readFile(id,'native-interface.sop'),source);
  // The host lists its own operations first, in their declared order= (not their position in the file), then composed ones.
  const native=parse(source).filter(wire=>wire.type==='std.capability.operation').sort((a,b)=>Number(str(a.attrs.order[0]))-Number(str(b.attrs.order[0])));
  const module=await import('../'+profile.nativeHost.module);
  const initial=(await loader.loadOps(id)).initialState();
  const host=await module[profile.nativeHost.factory]({state:initial,instanceId:'composition-interface-test'});
  const world=new World();
  world.use('std.capability');
  const facts=host.capabilityFacts('$scope');
  world.load('@scope std.capability.scope instance="fixture" version="1"');
  assert.ok(world.tell(facts,{factsOnly:true}).ok,id);
  const bindings=host.bindings(),operations=world.ofType('std.capability.operation');
  assert.deepEqual(operations.map(wire=>str(wire.attrs.name[0])),bindings.map(op=>op.id),id);
  assert.deepEqual(operations.slice(0,native.length).map(wire=>wire.id),native.map(wire=>wire.id),id);
  for(const parameter of world.ofType('std.capability.parameter')){
   const operation=world.get(parameter.attrs.operation[0].slice(1));
   const binding=bindings.find(op=>op.id===str(operation.attrs.name[0]));
   const name=str(parameter.attrs.name[0]);
   assert.equal(parameter.attrs.kind[0],binding.params[name].type);
  }
  assert.equal(world.ofType('std.instance.snapshot').length,0);
  assert.equal(profile.schemaFiles.find(file=>file.role==='native-tool-interface').completeStateSchema,false);
 }
 assert.equal(await loader.readFile('diagram.sketch','chart-interface.sop'),await readFile(new URL('../worlds/data.charts/native-interface.sop',import.meta.url),'utf8'));
 const calendar=loader.composition.profiles['time.calendar'];
 assert.ok(calendar.schemaFiles.some(file=>file.role==='canonical-state-schema'&&file.completeStateSchema));
 assert.match(await loader.readFile('time.calendar','instance-schema.sop'),/time.calendar.state/);
});
