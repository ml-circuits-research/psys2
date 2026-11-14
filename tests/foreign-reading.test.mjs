// SPDX-License-Identifier: AGPL-3.0-only
// Foreign readings (spec 16 section 14): a world other than the open tab's acts only on a full reading; a first-person statement is not a command; a bare letter is a fragment.
// The turns are the real ones the tab cut (ADR-010) left without a home (ledger rows "surviving world acts on an out-of-scope turn").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { isFragment, notFull, STATEMENT_SAY } from '../src/dialog/foreign-reading.mjs';

test('fragments and full readings (pure)', () => {
  for (const t of ['A', 'o', 'a', 'the', 'an a']) assert.ok(isFragment(t), t);
  for (const t of ['A minor', 'play A', 'cat']) assert.ok(!isFragment(t), t);
  const seg = (x) => ({ text: 'red house', match: { slots: {}, unread: [], unreadStrict: [] }, ...x });
  assert.equal(notFull(seg({})), null);
  assert.match(notFull(seg({ corrections: [{ from: 'hint', to: 'mint' }] })), /respelled/);
  assert.match(notFull(seg({ ignored: ['I'] })), /did not use/);
  assert.match(notFull(seg({ reframed: 'command' })), /reframed/);
  assert.match(notFull(seg({ match: { slots: { place: { value: '' } }, unread: [] } })), /empty slot/);
  assert.match(notFull(seg({ match: { slots: {}, unread: [], unreadStrict: ['hint'] } })), /unread/);
  assert.match(notFull(seg({ text: 'A', match: { slots: { note: { value: 'a' } }, unread: [] } })), /fragment/);
});

test('the turns the tab cut orphaned are not taken by a surviving world; full readings and named worlds still cross tabs', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  const say = async (tab, text, opts) => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: tab });
    const r = await s.send(text, opts);
    return { r, worlds: r.segments.filter((x) => !x.unparsed).map((x) => x.match?.worldId), state: s.state() };
  };
  // MOOD: a first-person statement is not a command, in the tab's own world too
  for (const [tab, text] of [['talk', 'I have two kids'], ['draw', 'I have two kids'], ['talk', 'I like cats, dogs and horses'], ['talk', 'I like chess, music and maps']]) {
    const { r, worlds, state } = await say(tab, text);
    assert.deepEqual(worlds, [], `${tab}: "${text}" read by ${worlds}`);
    assert.equal(r.text, STATEMENT_SAY, text);
    assert.equal(state['art.draw']?.objects?.length ?? 0, 0, `${text}: nothing drawn`);
    assert.equal(state['ui.shell'].activeTab, tab, `${text}: no tab opened`);
  }
  // a world's own frame that reads the speaker is not a statement: a to-do, a help request
  assert.deepEqual((await say('talk', 'I have to tidy my room')).worlds, ['kids.tasks']);
  assert.deepEqual((await say('talk', 'I am lost')).worlds, ['ui.help']);
  // FULL READING: respelled ("hint" -> "mint", "way" -> "say"), reframed gerund ("Reading"), a bare letter ("o" -> "A") do not reach another tab's world
  for (const [tab, text] of [['talk', 'hint'], ['talk', 'No way'], ['talk', 'Reading'], ['map', 'a'], ['talk', 'give me a hint']]) {
    const { worlds } = await say(tab, text);
    assert.ok(!worlds.some((w) => w === 'art.draw' || w === 'media.music'), `${tab}: "${text}" read by ${worlds}`);
  }
  // full readings still cross tabs, and a named world is always asked for
  assert.deepEqual((await say('talk', 'draw a house')).worlds, ['art.draw']);
  assert.deepEqual((await say('draw', 'play a C major chord')).worlds, ['media.music']);
  assert.deepEqual((await say('music', 'A')).worlds, ['media.music'], 'the tab world keeps its bare note');
  // the switch
  const old = process.env.PSYS2_FOREIGN; process.env.PSYS2_FOREIGN = 'off';
  try { assert.deepEqual((await say('talk', 'hint')).worlds, ['art.draw'], 'PSYS2_FOREIGN=off: the earlier behaviour'); } finally { if (old === undefined) delete process.env.PSYS2_FOREIGN; else process.env.PSYS2_FOREIGN = old; }
});
