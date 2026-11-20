import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacts } from '../src/knowledge/facts.mjs';
import { guard } from '../src/dialog/turn-guard.mjs';

test('a turn accounts for an in-flight catalog read started by background preload', async () => {
  let finish, reads = 0, clock = 0;
  const source = {
    text(path) {
      assert.equal(path, 'index.json');
      reads++;
      return new Promise(resolve => { finish = resolve; });
    },
  };
  const catalog = createFacts({ source, startReadWait: () => guard.beginWait() });
  const events = [];
  const preload = catalog.world('test.world', { accountRead: false });
  await Promise.resolve();
  guard.setWaitListener((event, used) => events.push([event, used]));
  const first = guard.install({ clock: () => clock, hardMs: 10 });
  try {
    const old = catalog.world('test.world');
    guard.release(first);
    const replacement = guard.install({ clock: () => clock, hardMs: 10 });
    try {
      clock = 2;
      const read = catalog.world('test.world');
      assert.deepEqual(events, [['start', 0], ['start', 0]]);
      clock = 22;
      finish('{ "worlds": [{ "id": "test.world" }] }');
      for (const row of await Promise.all([preload, old, read])) assert.equal(row.id, 'test.world');
      assert.deepEqual(events, [['start', 0], ['start', 0], ['end', 20]]);
      assert.equal(reads, 1);
      guard.check();
      assert.equal((await catalog.world('test.world')).id, 'test.world');
      assert.equal(events.length, 3);
      clock = 31;
      assert.throws(() => guard.check(), { name: 'TurnAborted' });
    } finally {
      guard.release(replacement);
    }
  } finally {
    guard.release(first);
    guard.setWaitListener(null);
  }
});
