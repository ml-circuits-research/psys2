import test from 'node:test';
import assert from 'node:assert/strict';
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

test('native interface schemas preserve every actual host binding without claiming complete native state schemas',async()=>{
 const {World,str}=await import('../src/vendor/sopworld/sopworld.mjs'),loader=await createDemoLoader();
 const definition=(world,token)=>{if(!token.startsWith('$'))return JSON.parse(token);const node=world.get(token.slice(1));if(node.type==='std.instance.sequence')return (node.attrs.item??[]).map(value=>definition(world,value));assert.equal(node.type,'std.instance.record');return Object.fromEntries(Object.entries(node.attrs).map(([key,values])=>[key.slice(6),definition(world,values[0])]));};
 for(const [id,profile]of Object.entries(loader.composition.profiles)){
  if(!profile.nativeHost)continue;
  const module=await import('../'+profile.nativeHost.module),initial=(await loader.loadOps(id)).initialState(),host=await module[profile.nativeHost.factory]({state:initial,instanceId:'composition-interface-test'}),world=new World();
  assert.equal(world.load(await loader.readFile(id,'native-interface.sop')).ok,true,id);
  const operations=world.ofType('app.native.operation');assert.deepEqual(operations.map(wire=>definition(world,wire.attrs.definition[0])),host.bindings(),id);
  for(const operation of operations){assert.ok(operation.attrs.definition[0].startsWith('$'));assert.equal(world.get(operation.attrs.definition[0].slice(1)).type,'std.instance.record');}
  for(const parameter of world.ofType('app.native.parameter'))assert.equal(world.get(parameter.attrs.operation[0].slice(1)).type,'app.native.operation');
  assert.equal(world.ofType('std.instance.snapshot').length,0);assert.equal(world.ofType('std.instance.object').length,0);
  assert.equal(profile.schemaFiles.find(file=>file.role==='native-tool-interface').completeStateSchema,false);
 }
 const calendar=loader.composition.profiles['time.calendar'];assert.ok(calendar.schemaFiles.some(file=>file.role==='canonical-state-schema'&&file.completeStateSchema));assert.match(await loader.readFile('time.calendar','instance-schema.sop'),/time.calendar.state/);
});
