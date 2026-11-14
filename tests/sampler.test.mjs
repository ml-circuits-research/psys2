// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createSampler, samplerContext } from '../src/dialog/sampler.mjs';

test('without std.sample the adapter is unavailable and returns nothing (no local generator)', () => {
  const s = createSampler({}, {});
  assert.equal(s.available, false);
  assert.equal(s.dice(), null); assert.deepEqual(s.examples(), []); assert.deepEqual(s.actions(), []);
});

test('with a sampler: kinds, counts, context and placeholder filtering', () => {
  const calls = [];
  const fake = { sample: (w, o) => { calls.push(o); return [{ text: 'draw a red house' }, { text: 'move the {thing}' }, { text: ' paint it blue ', act: 'paint' }, { text: 'x <y>' }]; } };
  const s = createSampler(fake, {});
  assert.ok(s.available);
  const ctx = samplerContext({ tab: 'draw', recentWorlds: ['art.draw'], selected: 'house1' });
  assert.equal(s.dice(ctx, 7).text, 'draw a red house');
  assert.equal(calls[0].kind, 'command'); assert.equal(calls[0].count, 1); assert.equal(calls[0].seed, 7); assert.equal(calls[0].tab, 'draw');
  assert.deepEqual(s.examples(ctx, 10).map((x) => x.text), ['draw a red house', 'paint it blue']);
  assert.equal(calls[1].count, 4);
  s.actions(ctx); assert.equal(calls[2].kind, 'actions'); assert.equal(calls[2].subject, 'house1');
});

test('the vendored sopworld does not yet export a sampler (update the spec when it does)', () => {
  assert.equal(typeof lib.sample, 'undefined');
});
