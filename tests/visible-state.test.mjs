// SPDX-License-Identifier: AGPL-3.0-only
// The state the user can see, for the judges (scripts/lib/visible-state.mjs): a record created lazily on a turn, empty at any depth, is not a change of what the user sees
// (real row r0592: w.person's empty session record made on the first turn turned a wrong answer into "partly" because the turn "changed the state").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleState, shown } from '../scripts/lib/visible-state.mjs';

const same = (a, b) => JSON.stringify(visibleState(a)) === JSON.stringify(visibleState(b));

test('an empty record made lazily, at any depth, shows nothing', () => {
  const before = { 'session.things': { things: [], views: {}, learned: [], n: 0, person: null } };
  const after = { 'session.things': { things: [], views: {}, learned: [], n: 0, person: { me: {}, lines: [], said: {}, asking: null, paused: false } } };
  assert.ok(same(before, after));
  assert.ok(same({}, { 'docs.editor': {} }));
});

test('what the user sees still changes: items, a flag set, a count, items removed', () => {
  const base = { 'session.things': { n: 0, person: null, things: ['a'] } };
  assert.ok(!same(base, { 'session.things': { n: 0, person: { lines: ['I have two kids'] }, things: ['a'] } }));
  assert.ok(!same(base, { 'session.things': { n: 0, person: { paused: true }, things: ['a'] } }));
  assert.ok(!same(base, { 'session.things': { n: 1, person: null, things: ['a'] } }));
  assert.ok(!same(base, { 'session.things': { n: 0, person: null, things: [] } }));
  assert.equal(shown(0), 0);
  assert.equal(shown({ a: { b: [], c: null } }), undefined);
});

test('the hidden parts stay hidden', () => {
  assert.ok(same({ 'ui.help': { last: 'x' } }, {}));
  assert.ok(same({ 'kids.arith': { holdings: { a: 1 } } }, { 'kids.arith': { holdings: { a: 2 } } }));
});
