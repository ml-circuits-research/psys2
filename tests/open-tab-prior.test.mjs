// SPDX-License-Identifier: AGPL-3.0-only
// Class D (reviewer 2026-11-15 10:00 item 3, 10:55): the open tab's world has a strong prior. Another world that owns a tab takes a turn only when the message names it or its
// things; a reading that only took an indefinite ("something") or whose catch-all swallowed words foreign to it is not its reading (spec 03 section 7.9e). Plus the composed
// Romanian reply of a move (the doer acts on the things, spec 06) and the answer to "What would you like?" after a thing the world has no kind for (spec 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const on = (tab) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const worldsOf = (r) => [...new Set((r.segments ?? []).map((x) => x.match?.worldId).filter(Boolean))];

test('an indefinite thing never opens another tab: "draw something random" on the Diagram tab draws a diagram, not a Documents paragraph', async () => {
  const s = on('diagram');
  const r = await s.send('Draw something random');
  assert.deepEqual(worldsOf(r), ['diagram.sketch']);
  assert.equal(s.state()['ui.shell'].activeTab, 'diagram');
  assert.ok((s.state()['diagram.sketch'].shapes ?? []).length > 0, r.text);
});

test('"draw something beautiful" on the Drawing tab draws there', async () => {
  const s = on('draw');
  const r = await s.send('Draw something beautiful');
  assert.deepEqual(worldsOf(r), ['art.draw']);
  assert.equal(s.state()['ui.shell'].activeTab, 'draw');
});

test('a catch-all of another world holding none of its words is dropped: no transposition in Music from the Drawing tab', async () => {
  const s = on('draw');
  const r = await s.send('move the elements logically to the three levels');
  assert.ok(!worldsOf(r).includes('media.music'), r.text);
  assert.equal(s.state()['ui.shell'].activeTab, 'draw');
});

test('a world the message names still takes the turn', async () => {
  const s = on('draw');
  const r = await s.send('add a paragraph to the document');
  assert.ok(worldsOf(r).includes('docs.editor'), r.text);
});

test('after "draw a villa" (no such kind) the answer "a house and 2 fish" is a new request, not the villa\'s text', async () => {
  const s = on('draw');
  await s.send('draw a villa');
  const r = await s.send('a house and 2 fish');
  assert.match(r.text, /house/i);
  assert.ok((s.state()['art.draw'].objects ?? []).length >= 2, r.text);
});
