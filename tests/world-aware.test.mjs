// SPDX-License-Identifier: AGPL-3.0-only
// World-aware reading (spec 16, E2): the option is off by default and changes nothing; the veto names its reason and never acts; scoring is read-only; the
// choice prefers the reading the world can take; the layer is bounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { normalizeWorldAware, baseMode, leftOut, sayMissing } from '../src/dialog/world-aware.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = async (worldAware, tab, setup = []) => {
  const s = engine.createSession({ language: 'en', ...(worldAware ? { worldAware } : {}) });   // null: the option is not passed (the default); 'off' turns the layer off
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  for (const m of setup) await s.send(m);
  return s;
};
const strip = (st) => JSON.stringify({ ...st, 'ui.help': undefined, 'art.draw': { ...st['art.draw'], history: undefined, future: undefined } });   // the turn machinery adds empty undo lists, and ui.help remembers the last unparsed text

test('option: default veto (user decision 2026-11-12), explicit off turns it off, unknown values are the default, strict is a variant of the base mode', () => {
  assert.equal(normalizeWorldAware(undefined), 'veto');
  assert.equal(normalizeWorldAware('nonsense'), 'veto');
  assert.equal(normalizeWorldAware('off'), 'off');
  for (const m of ['off', 'veto', 'choose', 'observe', 'veto-strict', 'choose-strict']) assert.equal(normalizeWorldAware(m), m);
  assert.equal(baseMode('veto-strict'), 'veto');
  assert.equal(baseMode('choose'), 'choose');
});

test('off: the shipped reply, nothing recorded on the segments', async () => {
  const s = await session('off', 'draw', ['draw a house']);
  assert.equal(s.worldAware, 'off');
  const r = await s.send('delete the dragon');
  assert.match(r.text, /I do not know what "the dragon" is/);
  assert.ok(r.segments.every((x) => x.wa === undefined && x.veto === undefined && x.pick === undefined));
});

// The first veto case (RO-LEFTOVERS item 3): a Romanian reading that leaves out the noun ("părul") must not act.  The rules translator reads "fă părul roșu" without
// the hair; with worldAware off that reading goes through unchecked (in the webchat it turned the body light red: still wrong with the option off), with
// worldAware=veto it is not acted on: the reply says there is no "părul" and the avatar does not change.
test('veto: "fă părul roșu" leaves out "părul": nothing is changed, the reply names the word (off: no veto is recorded)', async () => {
  const { createTranslator } = await import('../src/translate/index.mjs');
  const ro = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
  const run = async (worldAware) => {
    const s = ro.createSession({ language: 'ro', ...(worldAware ? { worldAware } : {}) });
    s.setWorldState('ui.shell', { activeTab: 'robot' });
    const colors = () => JSON.stringify(s.state()['ui.avatar']?.robot?.colors);
    const before = colors();
    const r = await s.send('fă părul roșu', { language: 'ro' });
    return { r, same: colors() === before };
  };
  const v = await run('veto');
  assert.equal(v.r.segments[0].veto?.kind, 'no-referent');
  assert.match(v.r.text, /părul/);
  assert.deepEqual(v.r.statuses, ['missing']);
  assert.ok(v.same, 'the avatar is unchanged');
  const off = await run('off');
  assert.ok(off.r.segments.every((x) => x.veto === undefined || x.veto === null), 'with the option off the veto never runs');
});

test('veto: "delete the dragon" says what the picture holds, changes nothing', async () => {
  const s = await session('veto', 'draw', ['draw a house']);
  const before = strip(s.state());
  const r = await s.send('delete the dragon');
  assert.match(r.text, /^I can't find \u201cdragon\u201d in the picture\. In the picture I can see: .*house/);
  assert.deepEqual(r.statuses, ['missing']);
  assert.equal(r.segments[0].veto.kind, 'no-referent');
  assert.equal(strip(s.state()), before, 'no state change: the hook read a copy');
});

test('veto: "connect Start to End" with no End offers to add it, and "yes" does', async () => {
  const s = await session('veto', 'diagram', ['add a rectangle called Start']);
  const r = await s.send('connect Start to End');
  assert.equal(r.text, 'I can\'t find a box called \u201cEnd\u201d. Shall I add it?');
  const y = await s.send('yes');
  assert.match(y.text, /Connected Start/);
});

test('veto: "switch to klingon" lists the languages the app has, from the ui.shell knowledge base', async () => {
  const s = await session('veto', 'robot');
  const r = await s.send('switch to klingon');
  assert.equal(r.text, 'I do not speak klingon. The languages I have: English and Romanian.');
  const off = await (await session('off', 'robot')).send('switch to klingon');
  assert.match(off.text, /I did not understand/);
  const ok = await s.send('switch to romanian');
  assert.doesNotMatch(ok.text, /I do not speak/);
});

test('veto: a game move while no game runs and another tab is open is not played (no-game)', async () => {
  const s = await session('veto', 'draw', ['draw a house']);
  const r = await s.send('put it in the top right corner');
  assert.equal(r.segments[0].veto?.kind, 'no-game');
  assert.match(r.text, /We are not playing Tic-tac-toe right now/);
  assert.deepEqual(s.state()['games.tictactoe'].board, ['', '', '', '', '', '', '', '', ''], 'no game was started');
  const t = await session('veto', 'tictactoe');
  assert.match((await t.send('put it in the top right corner')).text, /You took top right/, 'on the game tab the move is played');
});

test('choose: the reading the open tab can take wins over a move in a game that is not running; veto alone keeps the router order', async () => {
  const s = await session('choose', 'draw', ['draw a house']);
  const r = await s.send('put it in the top right corner');
  assert.equal(r.segments[0].match.worldId, 'art.draw');
  assert.match(r.text, /moved the house/);
  assert.equal(r.segments[0].pick.disagree, true);
  assert.equal(r.segments[0].pick.applied, true);
  assert.equal(r.segments[0].pick.host, 'games.tictactoe:pat.games.tictactoe.move');
  assert.ok(r.segments[0].pick.readings.every((x) => typeof x.why === 'string' && x.why.length > 0), 'every place is explained');
});

test('observe: records the judgement and the choice, changes the reply of nothing', async () => {
  const off = await (await session('off', 'draw', ['draw a house'])).send('put it in the top right corner');
  const s = await session('observe', 'draw', ['draw a house']);
  const r = await s.send('put it in the top right corner');
  assert.equal(r.text, off.text);
  assert.ok(r.segments[0].wa && r.segments[0].pick);
});

test('nothing is half done: a vetoed clause holds back the readable ones of the same message', async () => {
  const s = await session('veto', 'draw', ['draw a house']);
  const before = strip(s.state());
  const r = await s.send('delete the dragon and make the house red');
  assert.ok(r.segments.every((x) => x.unparsed), 'both clauses are held');
  assert.ok(r.segments.some((x) => x.veto?.kind === 'held'));
  assert.equal(strip(s.state()), before);
});

test('score is read-only: the instance keeps its version, stamp and wires', async () => {
  const s = await session('off', 'tictactoe');
  await s.send('play tic tac toe');
  const rs = s.isession.rs;
  const world = rs.peek('games.tictactoe');
  const before = [world.version, world.stamp, world.log.length];
  const wires = (await s.send('i take the center')).segments.flatMap((x) => x.wires);
  const after0 = [world.version, world.stamp, world.log.length];
  const probe = rs.score([{ wires }, { wires }]);
  assert.equal(probe.results.length, 2);
  assert.deepEqual([world.version, world.stamp, world.log.length].join(), after0.join(), 'scoring changed nothing');
  assert.ok(before.length === 3);
  for (const r of probe.ranked) assert.ok(typeof r.why === 'string');
});

test('content words: fillers, corrected typos and tiny words are not "left out"', () => {
  assert.deepEqual(leftOut({ text: 'sketch anything you like', bestEffort: { took: 'sketch anything you like', ignored: ['lie', 'pls'] } }), []);
  assert.deepEqual(leftOut({ text: 'e2 to e4', bestEffort: { took: 'e2 to e4', ignored: ['la'] } }), []);
  assert.deepEqual(leftOut({ text: 'make it red', bestEffort: { took: 'make it red', ignored: ['hair'] } }), ['hair']);
  assert.deepEqual(leftOut({ text: 'make it red', bestEffort: { took: 'make it red', ignored: ['cu'] } }, true), []);
  assert.deepEqual(leftOut({ text: 'make it red', bestEffort: { took: 'make it red', ignored: ['părul'] } }, true), ['părul']);
});

test('sayMissing: an offer asks, a plain refusal says what the world holds', () => {
  assert.equal(sayMissing({ missing: [{ name: 'End', kind: 'box' }], offer: 'x' }).text, 'I can\'t find a box called \u201cEnd\u201d. Shall I add it?');
  assert.equal(sayMissing({ missing: [{ name: 'A', kind: 'circle' }, { name: 'B', kind: 'circle' }], offer: 'x' }).text, 'I can\'t find circles called \u201cA\u201d or \u201cB\u201d. Shall I add them?');
  assert.equal(sayMissing({ missing: [{ name: 'dragon', kind: 'thing' }], here: 'a house', where: 'picture' }).text, 'I can\'t find \u201cdragon\u201d in the picture. In the picture I can see: a house.');
  assert.equal(sayMissing({ missing: [{ name: 'dragon', kind: 'thing' }], here: null, where: 'picture' }).text, 'I can\'t find \u201cdragon\u201d in the picture. The picture is empty.');
});

// Correction 2 (SHIP-NOW): the veto never contradicts itself and the open tab's world answers when it reads the message.
test('veto: "make the hair red" on the Avatar tab is the avatar world\'s answer (offers the person), not the drawing world\'s veto', async () => {
  for (const tab of ['robot', 'draw']) {
    const s = await session('veto', tab);
    const r = await s.send('make the hair red');
    if (tab === 'robot') {
      assert.match(r.text, /has no hair color, but the person does/);
      assert.match(r.text, /"yes"/);
      assert.ok(r.segments.every((x) => !x.veto), 'no veto: the avatar world reads the message');
    }
    assert.ok(!/did not know the word/i.test(r.text));
  }
});

test('veto: a word that a vetoed reading names is never reported as "I did not know the word" (Romanian; the reading itself depends on the MT)', async () => {
  const { createTranslator } = await import('../src/translate/index.mjs');
  const ro = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
  const s = ro.createSession({ language: 'ro' });
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  const r = await s.send('fă părul roșu', { language: 'ro' });
  assert.match(r.text, /părul/);
  assert.ok(!/Nu am știut cuvântul/.test(r.text), r.text);
});
