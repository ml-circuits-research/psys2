// SPDX-License-Identifier: AGPL-3.0-only
// Class F (reviewer 2026-11-15 10:00 item 6): several instructions in one message: the library's `clauses` cut, each clause read by the intent step, the verb carried
// over to a clause that has none, and one reply for the same act of several things (spec 03 section 7.9f).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const diagram = async () => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  await s.send('add a circle named alfa');
  await s.send('add a square named beta');
  return s;
};
const y = (s, n) => s.state()['diagram.sketch'].shapes.find((x) => x.name === n).y;

test('the same act of two things is one sentence', async () => {
  const s = await diagram();
  const r = await s.send('move alfa up, move beta up');
  assert.match(r.text, /^Moved alfa and beta up\.$/);
});

test('a clause with no verb takes the verb of the clause before it', async () => {
  const s = await diagram();
  const a = y(s, 'alfa'), b = y(s, 'beta');
  const r = await s.send('move alfa up and the beta below');
  assert.ok(y(s, 'alfa') < a, r.text);
  assert.ok(y(s, 'beta') > b, r.text);
  assert.match(r.text, /^I took that as: move the beta down\./);
});
