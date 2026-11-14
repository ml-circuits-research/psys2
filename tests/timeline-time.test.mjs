// SPDX-License-Identifier: AGPL-3.0-only
// plan.timeline puts a moment that is a time of the calendar (k.time) in its place: `when` is the position in its cycle and the row sorts each cycle in order (spec 23 section 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { inOrder } from '../docs/webchat/ui/tabs/timeline.mjs';

for (const reasoner of ['ops', 'matrix']) {
  test(`${reasoner}: moments named by a time of the calendar get their position; others and user changes keep theirs`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    s.setWorldState('ui.shell', { activeTab: 'timeline' });
    for (const t of ['add an event called March', 'add an event called Friday', 'add an event called January', 'add an event called Monday', 'add an event called Ann']) await s.send(t);
    const items = s.state()['plan.timeline'].items;
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    assert.deepEqual([by.March, by.Friday, by.January, by.Monday].map((i) => i.attrs.at), [3, 5, 1, 1]);
    assert.deepEqual([by.March, by.Friday].map((i) => i.time.cycle), ['year', 'week']);
    assert.equal(by.Ann.time, null);
    assert.equal(by.Ann.attrs.at, 0, 'a moment that is no time of the calendar keeps its default (0)');
    await s.send('set March time to 9');
    assert.equal(s.state()['plan.timeline'].items.find((i) => i.name === 'March').attrs.at, 9, 'what the user says wins');
    assert.deepEqual(inOrder(items.map((i) => (i.name === 'March' ? { ...i, attrs: { at: 3 } } : i))).map((i) => i.name), ['January', 'March', 'Monday', 'Friday', 'Ann']);
  });
}
