// SPDX-License-Identifier: AGPL-3.0-only
// Three general mechanisms of 2026-11-14 (spec 20 "Arbitration" rule 5, handover/lang.en): an order in time is never answered as a distance,
// one host resolver reads every noun phrase, and a referent held by a world the user works in is evidence for that world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/lang/en.mjs';
import { readNounPhrase } from '../src/lang/np-resolve.mjs';
import path from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { compareTimes, loadTime, timeFrom, timePosition } from '../src/knowledge/time.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

test('timeComparison: the shape of a question about two moments; the calendar (k.time) says whether they are moments', () => {
  for (const [t, rel] of [['is Monday before Friday', 'before'], ['Is December after November?', 'after'], ['does spring come after winter', 'after'], ["is 3 o'clock before 5pm", 'before'], ['is March during the summer', 'during']]) assert.equal(en.timeComparison(t)?.rel, rel, t);
  assert.equal(en.timeComparison('is July during the summer in the southern hemisphere').hemisphere, 'south');
  for (const t of ['what day is before Friday', 'how many days from Monday to Friday', 'before Friday']) assert.equal(en.timeComparison(t), null, t);
});

test('compareTimes: an order or a containment by lookup in k.time, offline from the bundled subset and from the catalog alike', async () => {
  const facts = createFacts({ source: createKnowledgeSource(path.join(DEFAULT_ROOT, '../tests/fixtures/catalog')) });
  for (const from of ['bundled', 'catalog']) {
    if (from === 'catalog') assert.equal(await loadTime(facts), 'catalog');
    else assert.equal(timeFrom(), 'bundled');
    const c = (a, b, rel, o) => compareTimes(a, b, rel, o);
    for (const [a, b, rel, answer, o] of [
      ['Monday', 'Friday', 'before', 'yes'], ['Friday', 'Monday', 'before', 'no'], ['Friday', 'Monday', 'after', 'yes'], ['Jan', 'March', 'before', 'yes'], ['June', 'March', 'before', 'no'],
      ['winter', 'spring', 'before', 'yes'], ['spring', 'winter', 'after', 'yes'], ['the morning', 'the night', 'before', 'yes'],
      ["3 o'clock", '5pm', 'before', 'yes'], ['noon', '9 am', 'before', 'no'], ['15:30', '9 pm', 'before', 'yes'],
      ['July', 'the summer', 'during', 'yes'], ['March', 'the summer', 'during', 'no'], ['January', 'summer', 'during', 'yes', { hemisphere: 'south' }], ['July', 'summer', 'during', 'no', { hemisphere: 'south' }],
      ['3 pm', 'the afternoon', 'during', 'yes'], ['Monday', 'March', 'before', 'unknown'], ['Monday', 'the summer', 'during', 'unknown'],
    ]) assert.equal(c(a, b, rel, o)?.answer, answer, `${from}: ${a} ${rel} ${b}`);
    assert.equal(compareTimes('the red house', 'the blue one', 'before'), null, 'a phrase that is no time is not a question about time');
    assert.match(compareTimes('July', 'the summer', 'during').text, /southern hemisphere it is winter/, 'the other hemisphere is said');
    assert.match(compareTimes("3 o'clock", '5 o\'clock', 'before').text, /am or pm/, 'an ambiguous hour is said to be');
    assert.deepEqual(timePosition('March'), { cycle: 'year', n: 3, kind: 'month' });
  }
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
    for (const t of ['is Monday before Friday', 'is Friday after Monday', 'is June before March', 'is July during the summer']) assert.match((await s.send(t)).text, /^(?:Yes|No), /, t);
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
