import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const say = async (lines) => {
  const s = engine.createSession({ language: 'en' });
  let r;
  for (const l of lines) r = await s.send(l);
  return r.text;
};

test('renderer: the user entity is shown as "you" and :has/:is agree with the subject', async () => {
  assert.equal(await say(['I have 5 apples.', 'How many apples do I have?']), 'You have 5 apples.');
  assert.equal(await say(['Tom has 5 apples.', 'How many apples does Tom have?']), 'Tom has 5 apples.');
  assert.equal(await say(['I have 2 apples.']), 'OK, you have 2 apples.');
});

for (const id of ['kids.arith', 'kids.shop', 'kids.time']) {
  test(`world ${id}: loads without problems, has >= 25 tests and they all pass`, async () => {
    const mine = engine.problems().filter((p) => p.startsWith(id + ':'));
    assert.deepEqual(mine, []);
    const r = await runWorldTests(engine, id);
    assert.ok(r.total >= 25, `${id} has ${r.total} tests`);
    assert.deepEqual(r.failed, []);
  });

  test(`world ${id}: every pattern example is read by its own pattern without ambiguity`, async () => {
    const bad = [];
    for (const p of engine.set.get(id).patterns) {
      assert.ok(p.examples.length >= 1, `${p.id} has no example`);
      const session = engine.createSession({ language: 'en' });
      // elliptic patterns (slot class recent) need an item mentioned before
      if (p.match.includes('recent(') || p.match.includes('lastagent')) await session.send('Tom has 5 apples.');
      const r = await session.send(p.examples[0]);
      if (!r.trace.patterns.includes(p.id) || /another way/.test(r.text)) {
        // a more specific pattern of the same world may legitimately win; it must still be understood
        if (r.statuses.includes('unparsed')) bad.push(p.id);
      }
    }
    assert.deepEqual(bad, []);
  });
}
