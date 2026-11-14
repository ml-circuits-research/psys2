// SPDX-License-Identifier: AGPL-3.0-only
// Three general mechanisms of 2026-11-14 (spec 20 "Arbitration" rule 5, handover/lang.en): an order in time is never answered as a distance,
// one host resolver reads every noun phrase, and a referent held by a world the user works in is evidence for that world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/lang/en.mjs';
import { readNounPhrase } from '../src/lang/np-resolve.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

test('timeComparison: an order of two moments of the same or different kinds, nothing else', () => {
  for (const [t, kinds] of [['is Monday before Friday', ['day']], ['Is December after November?', ['month']], ['does spring come after winter', ['season']], ["is 3 o'clock before 5pm", ['clock']], ['is Monday before March', ['day', 'month']]]) {
    const r = en.timeComparison(t);
    assert.deepEqual(r?.kinds, kinds, t);
  }
  for (const t of ['what day is before Friday', 'is the red house before the blue one', 'is March during the summer', 'how many days from Monday to Friday']) assert.equal(en.timeComparison(t), null, t);
});

test('readNounPhrase: the one resolver reads choice and part of a set, a plain phrase goes back to the domain', () => {
  const dom = {
    rec: (t) => ({ refs: t.match(/\d+/g)?.map(Number) ?? null }),
    refs: (r) => r.refs, kind: () => null, made: (refs, kind, tier) => ({ made: refs, tier }), asked: (msg, refs) => ({ asked: msg, refs }), sayAll: (refs) => refs.map(String),
    partitive: (p, refs) => `which of ${refs.join(',')}`,
  };
  assert.deepEqual(readNounPhrase('table 1 or table 2', dom).done, { asked: 'Which do you mean: 1 or 2?', refs: [1, 2] });
  assert.deepEqual(readNounPhrase('table 1 or table 1', dom).done, { made: [1], tier: 'said' });
  assert.equal(readNounPhrase('the red house', dom).text, 'the red house');
  assert.equal(readNounPhrase('the table that is red', dom).text, 'red the table');
});

for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
  const session = (tab) => { const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: 'tasks' }); return s; };

  test(`${reasoner}: an order in time is not a distance`, async () => {
    const s = session();
    s.setWorldState('ui.shell', { activeTab: 'time' });
    for (const t of ['is Monday before Friday', 'is Friday after Monday', 'is June before March']) assert.match((await s.send(t)).text, /can not compare .* in time yet/, t);
  });

  test(`${reasoner}: a thing that is not in the open tab but in a list the user works in is that list's`, async () => {
    for (const item of ['milk', 'bread', 'eggs']) {
      const s = session();
      await s.send(`add ${item} to my shopping list`);
      s.setWorldState('ui.shell', { activeTab: 'draw' });
      await s.send('draw a red house');
      const r = await s.send(`remove ${item}`);
      assert.match(r.text, new RegExp(`shopping list`), `${item}: ${r.text}`);
      assert.equal(s.state()['ui.shell'].activeTab, 'draw', 'the tab did not change');
      assert.equal(s.state()['art.draw'].objects.length, 1, 'the picture is untouched');
    }
    const s = session();
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    await s.send('draw a red house'); await s.send('draw a tree');
    assert.match((await s.send('remove the tree')).text, /took away/, 'a thing of the open tab stays with the tab');
  });
}
