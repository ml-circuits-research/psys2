// SPDX-License-Identifier: AGPL-3.0-only
// Foreign readings (spec 16 section 14): a world other than the open tab's acts only on a full reading; a first-person statement is not a command; a bare letter is a fragment;
// a respelled content word that is not a confident typo is never a silent full reading, in any world (rule 4, real row r0296 "face un caca").
// The turns are the real ones the tab cut (ADR-010) left without a home (ledger rows "surviving world acts on an out-of-scope turn"). The decision is the library's reader contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { notFull, confidentTypo, moodOfClause, STATEMENT_SAY } from '../src/dialog/foreign-reading.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

test('fragments, moods and full readings: the library decides (pure)', () => {
  for (const t of ['A', 'o', 'a', 'the']) assert.equal(lib.moodOf(null, t), 'fragment', t);
  for (const t of ['A minor', 'play A', 'cat']) assert.notEqual(lib.moodOf(null, t), 'fragment', t);
  const lang = { stripPolite: (t) => t.replace(/^i want /i, '') };
  assert.equal(moodOfClause(lib, lang, 'I have two kids'), 'statement');
  assert.equal(moodOfClause(lib, lang, 'I want a red circle'), 'imperative', 'a wish is a request');
  const seg = (x) => ({ text: 'red house', match: { kind: 'request', slots: {}, unread: [], unreadStrict: [] }, ...x });
  const nf = (s) => notFull(s, { lib });
  assert.equal(nf(seg({})), null);
  assert.match(nf(seg({ corrections: [{ from: 'hint', to: 'mint' }] })), /respelling/);
  assert.match(nf(seg({ ignored: ['I'] })), /not read/);
  assert.match(nf(seg({ reframed: 'command' })), /respelling/);
  assert.match(nf(seg({ match: { slots: {}, unread: [], unreadStrict: ['hint'] } })), /not read/);
  assert.match(nf(seg({ text: 'A', match: { slots: { note: { value: 'a' } }, unread: [] } })), /fragment/);
  assert.match(notFull(seg({ match: { slots: { place: { value: '' } }, unread: [] } }), { lib, set: new Map() }), /empty slot/);
});

test('rule 4: a confident typo keeps its first letter, stays within the spelling budget and is not a known word', () => {
  const known = (w) => ['hint', 'face'].includes(w);
  for (const [from, to] of [['hosue', 'house'], ['circel', 'circle'], ['corcodilii', 'crocodiles'], ['elefant', 'elephant'], ['a vatar', 'avatar'], ['pls', 'please']]) assert.ok(confidentTypo({ from, to, kind: from === 'pls' ? 'abbreviation' : 'spell' }, known), `${from} -> ${to}`);
  for (const [from, to] of [['caca', 'face'], ['hint', 'mint'], ['sirkle', 'circle'], ['un', 'sun']]) assert.ok(!confidentTypo({ from, to, kind: 'spell' }, known), `${from} -> ${to}`);
  assert.ok(confidentTypo({ from: 'si', to: 'is', kind: 'spell' }, known), 'a function word is not a content word');
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
  // a wish is a request, in the tab's world
  assert.deepEqual((await say('draw', 'I want a red circle')).worlds, ['art.draw']);
  assert.deepEqual((await say('draw', "I'd like a blue house")).worlds, ['art.draw']);
  // RULE 4 (r0296): the open tab's world does not act on a guessed respelling ("caca" read as "face", a part of the sun in the scene); a confident typo is executed and named
  {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    await s.send('draw a sun');
    const before = JSON.stringify(s.state()['art.draw']);
    const r = await s.send('make a caca');
    assert.ok(r.segments.every((x) => x.unparsed), `read as ${r.segments.map((x) => x.text)}`);
    assert.equal(JSON.stringify(s.state()['art.draw']), before, 'nothing changed');
    assert.match(r.text, /caca/, 'the reply says which word was not understood');
    const t = await say('draw', 'draw a hosue');
    assert.deepEqual(t.worlds, ['art.draw']);
    assert.match(t.r.text, /"hosue" as "house"/);
  }
  // the switch
  const old = process.env.PSYS2_FOREIGN; process.env.PSYS2_FOREIGN = 'off';
  try { assert.deepEqual((await say('talk', 'hint')).worlds, ['art.draw'], 'PSYS2_FOREIGN=off: the earlier behaviour'); } finally { if (old === undefined) delete process.env.PSYS2_FOREIGN; else process.env.PSYS2_FOREIGN = old; }
});
