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
  for (const id of ['geo.map', 'media.music']) {
    assert.equal(set.get(id), undefined);
    assert.equal(await loader.loadOps(id), null);
  }
  for (const id of ['ui.shell', 'ui.help', 'meta.worlds']) assert.doesNotMatch(await loader.readFile(id, 'kb.sop'), /\b(?:geo\.map|media\.music)\b/);
  assert.ok(set.get('art.draw') && set.get('diagram.sketch') && set.get('docs.editor'));
});
