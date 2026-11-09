import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSet } from '../scripts/lib/nx-read.mjs';
import { makeGateContext, gateOne, gateAll } from '../scripts/lib/nx-gate.mjs';

const gc = makeGateContext(await loadSet());
const rec = (o) => ({ id: 'x', group: 'g', world: 'kids.arith', text: 'Tom has 5 apples.', op: 'kids.arith.holding', slots: [], ...o });
const S = (key, text, value) => ({ key, text, value });
const good = rec({ slots: [S('kids.arith.holding.owner', 'Tom', 'tom'), S('kids.arith.holding.count', '5', 5), S('kids.arith.holding.item', 'apples', 'apple')] });

test('a good record passes and gets span offsets', () => {
  const g = gateOne(gc, good);
  assert.equal(g.ok, true);
  assert.deepEqual(g.rec.slots.map((s) => s.span), [[0, 3], [8, 9], [10, 16]]);
});
test('numeric strings are canonicalised to numbers', () => {
  const g = gateOne(gc, rec({ slots: [S('kids.arith.holding.count', '5', '5')] }));
  assert.equal(g.ok, true); assert.equal(g.rec.slots[0].value, 5);
});
test('unknown world, op and key are dropped with their reason', () => {
  assert.equal(gateOne(gc, rec({ world: 'no.such' })).reason, 'unknown-world');
  assert.equal(gateOne(gc, rec({ op: 'kids.arith.fly' })).reason, 'unknown-op');
  assert.equal(gateOne(gc, rec({ slots: [S('kids.arith.holding.colour', 'red', 'red')] })).reason, 'unknown-key');
});
test('a span that is not in the text is dropped', () => {
  assert.equal(gateOne(gc, rec({ slots: [S('kids.arith.holding.item', 'pears', 'pear')] })).reason, 'span-not-in-text');
});
test('a non-numeric value for a numeric key and a value outside the lexicon are dropped', () => {
  assert.equal(gateOne(gc, rec({ slots: [S('kids.arith.holding.count', '5', 'lots')] })).reason, 'value-type');
  assert.equal(gateOne(gc, rec({ text: 'Tom has 5 zorks.', slots: [S('kids.arith.holding.item', 'zorks', 'zork')] })).reason, 'value-not-in-lexicon');
});
test('malformed records and duplicate keys are dropped', () => {
  assert.equal(gateOne(gc, null).reason, 'not-an-object');
  assert.equal(gateOne(gc, rec({ op: null })).reason, 'missing-field');
  assert.equal(gateOne(gc, rec({ slots: [S('kids.arith.holding.count', '5', 5), S('kids.arith.holding.count', '5', 5)] })).reason, 'duplicate-key');
});
test('question and request ops pass through the dry run', () => {
  const q = rec({ text: 'What is 7 plus 5?', op: '?kids.arith.calc', slots: [S('kids.arith.calc.a', '7', 7), S('kids.arith.calc.b', '5', 5), S('kids.arith.calc.op', null, 'plus'), S('seek', null, 'result')] });
  assert.equal(gateOne(gc, q).ok, true);
  const r = rec({ world: 'art.draw', text: 'draw a red house', op: 'draw.add', slots: [S('arg.m1', 'red', 'red'), S('arg.kind', 'house', 'house')] });
  assert.equal(gateOne(gc, r).ok, true);
});
test('gateAll counts the drops by reason', () => {
  const r = gateAll(gc, [good, rec({ op: 'nope' }), rec({ op: 'nope' })]);
  assert.equal(r.accepted.length, 1); assert.deepEqual(r.dropped, { 'unknown-op': 2 });
});
