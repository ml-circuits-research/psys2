import test from 'node:test';
import assert from 'node:assert/strict';
import { retiredArea, unavailableAreaReply } from '../src/dialog/application-areas.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDemoLoader } from '../scripts/lib/demo-composition.mjs';
import { tableOf, retiredAreaOf, sendOptions, deltaRows } from '../scripts/real-set.mjs';

const areas = [{ id: 'retired-tool', world: 'fixture.old', label: 'Example tool', status: 'retired' }];
test('area availability uses explicit identity, not words or display labels', () => {
  assert.equal(retiredArea(areas, 'retired-tool'), areas[0]);
  for (const selector of [null, 'Example tool', 'write about retired-tool', 'editor', 'constructor']) assert.equal(retiredArea(areas, selector), null);
  const reply = unavailableAreaReply(areas[0], 'change it');
  assert.equal(reply.text, 'Example tool is not part of this application.');
  assert.deepEqual(reply.effects, []);
  assert.equal(reply.trace.unavailableArea.world, 'fixture.old');
});

test('retired-area sends refuse with data provenance and preserve state/history', async () => {
  const loader = await createDemoLoader();
  const engine = await createEngine({ loader, options: { applicationAreas: loader.retiredAreas } });
  const s = engine.createSession({ language: 'en' });
  const before = JSON.stringify(s.portableSnapshot(s.snapshot()));
  const r = await s.send('surprise me', { view: 'music' });
  assert.equal(r.text, 'Music is not part of this application.');
  assert.equal(r.unavailableArea.id, 'music');
  assert.deepEqual(r.effects, []);
  assert.equal(JSON.stringify(s.portableSnapshot(s.snapshot())), before);
  const legitimate = await s.send('write about music', { view: 'editor' });
  assert.equal(legitimate.unavailableArea, undefined);
  const mention = await s.send('what is a map');
  assert.equal(mention.unavailableArea, undefined);
});

test('report partitions a fixed denominator and retains retired-area evidence', () => {
  const rows = [
    { set: 'fixture', id: 'a', tab: 'editor', judge: 'state' },
    { set: 'fixture', id: 'b', tab: 'music', judge: 'state' },
    { set: 'fixture', id: 'c', tab: 'map', judge: 'outcome' },
    { set: 'fixture', id: 'd', tab: 'map', retired: 'old record' },
  ];
  const before = { rows: [{ id: 'a', outcome: 'executed', verdict: 'right' }, { id: 'b', outcome: 'executed', verdict: 'right' }, { id: 'c', outcome: 'executed', verdict: null }] };
  const after = { rows: [{ id: 'a', outcome: 'executed', verdict: 'right' }, { id: 'b', outcome: 'refused', verdict: 'honest', historicalVerdict: 'wrong' }, { id: 'c', outcome: 'refused', verdict: 'honest', historicalVerdict: null }] };
  const a = tableOf(rows, before), b = tableOf(rows, after);
  assert.equal(a.judged, 2); assert.equal(b.judged, 2);
  assert.deepEqual(a.survivingAreas, b.survivingAreas);
  assert.equal(b.retiredAreas.turns, 2); assert.equal(b.retiredAreas.judged, 1); assert.equal(b.retiredAreas.honest, 2);
  assert.equal(b.retired, 1);
  assert.deepEqual(b.retiredAreas.rows.map((r) => r.id), ['b', 'c']);
  assert.equal(b.retiredAreas.rows[0].historicalVerdict, 'wrong');
  assert.equal(deltaRows({ set: rows, res: before }, { set: rows, res: after }).some((r) => r.kind === 'scope'), false);
  assert.equal(retiredAreaOf({ tab: 'editor', text: 'write about music' }), null);
  assert.equal(sendOptions({}, { tab: 'music' }).view, 'music');
  assert.equal(sendOptions({}, { tab: 'editor', text: 'music' }).view, undefined);
});
