// RD1, RD2, RD8 (worker-tasks, "a real user dialogue"): spelling with the active world first, naming a world wins, bare words follow the tab,
// the headless host settles the chess engine. Tests are written across worlds, not for one sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { spellCandidates, worldVocabulary } from '../src/formalizer/spell.mjs';
import { createRouter, namedWorlds, namingTables } from '../src/formalizer/routing.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const open = (tab, patch = {}) => {
  const s = engine.createSession({ language: 'en', spell: true });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  for (const [w, p] of Object.entries(patch)) s.setWorldState(w, p);
  return s;
};
const worldsOf = (r) => r.segments.map((x) => x.match?.worldId ?? null);

// ---- RD2: naming a world wins ----------------------------------------------------------------------------------------------------
const NAMED = [
  // [tab the user is on, sentence, world that must read it]
  ['charts', 'Turn the avatar blue.', 'ui.avatar'],
  ['draw', 'Turn the avatar blue.', 'ui.avatar'],
  ['music', 'Turn the avatar blue.', 'ui.avatar'],
  ['chess', 'Turn the avatar blue.', 'ui.avatar'],
  ['charts', 'Clear the map.', 'geo.map'],
  ['editor', 'Can you change the map to street?', 'geo.map'],
  ['charts', 'Clear the picture.', 'art.draw'],
  ['music', 'Wipe the canvas.', 'art.draw'],
  ['tictactoe', 'Describe my picture.', 'art.draw'],
  ['music', 'Describe the story.', 'docs.reader'],
  ['charts', 'Read the story aloud.', 'docs.reader'],
  ['draw', 'Can u rotate the chess board?', 'games.chess'],
];
test('a message that names a world routes to it whatever tab is open', async () => {
  for (const [tab, text, world] of NAMED) {
    const r = await open(tab).send(text);
    assert.ok(worldsOf(r).includes(world), `${tab}: "${text}" read by ${worldsOf(r).join(',')} instead of ${world}`);
    if (tab !== 'robot') assert.equal(r.segments[0].decision?.tierName === undefined || r.segments[0].decision.tier <= 3, true);
  }
});

test('naming does not steal: verb uses, formats and a named tab world keep the sentence', async () => {
  // "paint" is an alias of the drawing tab, but "paint yourself green" is the avatar's
  assert.ok(worldsOf(await open('robot').send('Paint yourself green.')).includes('ui.avatar'));
  // "as a picture" is a format
  const s = open('charts');
  await s.send('make a chart: apples 5, pears 3');
  assert.ok(worldsOf(await s.send('download it as a picture')).includes('data.charts'));
  // the tab's own world is named too: it keeps the sentence
  const d = open('draw');
  assert.ok(worldsOf(await d.send('Clear the picture.')).includes('art.draw'));
});

test('namedWorlds: names come from the tab manifests and the built-in tabs, after a determiner only', () => {
  const { names } = namingTables(engine.set);
  const tok = (t) => t.split(' ').map((w) => ({ kind: 'word', lower: w, raw: w }));
  assert.deepEqual([...namedWorlds(tok('make the avatar a woman'), names)], ['ui.avatar']);
  assert.ok(namedWorlds(tok('show my chart'), names).has('data.charts'));
  assert.ok(namedWorlds(tok('open the graphs'), names).has('data.charts'));
  assert.ok(namedWorlds(tok('zoom the map'), names).has('geo.map'));
  assert.equal(namedWorlds(tok('paint yourself green'), names).size, 0);
  assert.equal(namedWorlds(tok('download it as a picture'), names).size, 0);
  assert.equal(namedWorlds(tok('draw a house'), names).size, 0);
});

test('router tier 3a: the named world beats the tab world, unless the tab world is named too', () => {
  const router = createRouter();
  const mk = (worldId, id, literals = 3) => ({ pattern: { id, worldId, priority: 10, emit: '' }, literals, skips: 0, slots: {}, order: 0, score: 0 });
  const names = new Map([['ui.avatar', ['avatar']], ['data.charts', ['chart']]]);
  const tokens = (t) => t.split(' ').map((w) => ({ kind: 'word', lower: w, raw: w }));
  const ctx = { activeTab: 'charts', tabWorld: 'data.charts', names, tabWorlds: ['ui.avatar', 'data.charts'] };
  const r = router.route({ matches: [mk('data.charts', 'c'), mk('ui.avatar', 'a')], context: ctx, tokens: tokens('make the avatar blue') });
  assert.equal(r.matches[0].pattern.worldId, 'ui.avatar');
  const both = router.route({ matches: [mk('data.charts', 'c'), mk('ui.avatar', 'a')], context: ctx, tokens: tokens('put the avatar in the chart') });
  assert.equal(both.matches[0].pattern.worldId, 'data.charts');
});

// ---- RD2: bare words follow the active tab ---------------------------------------------------------------------------------------
test('bare "next", "more", "another one" follow the active tab; music claims them on its tab or while a song plays', async () => {
  for (const tab of ['draw', 'charts', 'map', 'documents', 'editor', 'chess', 'robot']) {
    for (const text of ['next', 'another one']) {
      const r = await open(tab).send(text);
      assert.ok(!worldsOf(r).includes('media.music'), `${tab}: "${text}" must not start a song (${worldsOf(r).join(',')})`);
    }
  }
  const draw = await open('draw').send('more');
  assert.ok(!worldsOf(draw).includes('media.music'));
  assert.ok(worldsOf(await open('music').send('next')).includes('media.music'), 'on its own tab');
  assert.ok(worldsOf(await open('draw', { 'media.music': { playing: true } }).send('next')).includes('media.music'), 'while a song plays');
  // the document reader's bare "next" needs an open search
  assert.ok(!worldsOf(await open('draw').send('next')).includes('docs.reader'));
});

test('bare coordinates follow the active game tab and are not claimed by another tab (RD8)', async () => {
  for (const tab of ['robot', 'draw', 'charts', 'map', 'music', 'documents']) {
    for (const text of ['b1', 'c1', 'e4']) {
      const r = await open(tab).send(text);
      assert.ok(!worldsOf(r).some((w) => w?.startsWith('games.')), `${tab}: "${text}" must not be a game move (${worldsOf(r).join(',')})`);
    }
  }
  assert.ok(worldsOf(await open('chess').send('e4')).includes('games.chess'));
  const t = open('tictactoe');
  assert.ok(worldsOf(await t.send('b1')).includes('games.tictactoe'));
  assert.equal(t.state('games.tictactoe').board[1], 'X');
  // a chess game in progress (recently used) does not take a coordinate typed on the tic-tac-toe tab
  const mixed = open('chess');
  await mixed.send('let us play chess');
  await mixed.send('e4');
  mixed.setWorldState('ui.shell', { activeTab: 'tictactoe' });
  const r = await mixed.send('c1');
  assert.ok(worldsOf(r).includes('games.tictactoe'), `got ${worldsOf(r).join(',')}`);
  assert.equal(mixed.state('games.chess').history.length, 1, 'the chess game did not move (only e4, the engine reply is still owed)');
});

// ---- RD1: the active world first -------------------------------------------------------------------------------------------------
const SPELL = [
  // [tab, typo, world that reads it, [from, to]]
  ['draw', 'bugger house pls', 'art.draw', ['bugger', 'bigger']],
  ['draw', 'add a cloud nect to a house', 'art.draw', ['nect', 'next']],
  ['robot', 'eys express fear', 'ui.avatar', ['eys', 'eyes']],
  ['robot', 'make your eyse square', 'ui.avatar', ['eyse', 'eyes']],
  ['map', 'zoom in to the mep', 'geo.map', ['mep', 'map']],
  ['chess', 'kinght to f3', 'games.chess', ['kinght', 'knight']],
  ['music', 'set the tempo to 120 beets per minute', 'media.music', ['beets', 'beats']],
];
test('typos are corrected against the world of the open tab first, inside slot phrases too', async () => {
  for (const [tab, text, world, [from, to]] of SPELL) {
    const r = await open(tab).send(text);
    assert.ok(worldsOf(r).includes(world), `${tab}: "${text}" read by ${worldsOf(r).join(',')}`);
    const fixes = r.segments.flatMap((x) => x.corrections ?? []);
    assert.ok(fixes.some((c) => c.from.toLowerCase() === from && c.to.toLowerCase() === to), `${tab}: "${text}" corrections ${JSON.stringify(fixes.map((c) => `${c.from}>${c.to}`))}`);
  }
});

test('"nect to a house" is "next to a house": the cloud is drawn next to the house', async () => {
  const s = open('draw');
  await s.send('draw a house');
  await s.send('add a cloud nect to the house');
  const o = s.state('art.draw').objects;
  assert.deepEqual(o.map((x) => x.kind).sort(), ['cloud', 'house']);
});

test('never corrected towards another world when the active world reads the sentence', async () => {
  // a real word of the drawing world is left alone on the drawing tab
  assert.ok(worldsOf(await open('draw').send('draw a boat')).includes('art.draw'));
  // a word another world knows is not turned into a word of the open tab: on the music tab "bugger house" is never a drawing
  const r = await open('music').send('bugger house pls');
  assert.ok(!worldsOf(r).includes('art.draw'), worldsOf(r).join(','));
  // an inflection is not a typo: "move the pawn" stays what it was on the chess tab (no "moves")
  const m = await open('chess').send('move the pawn');
  assert.ok(!(m.segments[0].corrections ?? []).some((c) => c.to === 'moves'));
});

test('spellCandidates ranks every neighbour of an unknown word for the world vocabulary', () => {
  const c = spellCandidates('add a cloud nect to a house', { vocab: worldVocabulary(engine.set, 'art.draw') });
  const nect = c.find((x) => x.from === 'nect');
  assert.ok(nect && nect.options.includes('next'), JSON.stringify(c));
  assert.deepEqual(spellCandidates('add a cloud next to a house', { vocab: worldVocabulary(engine.set, 'art.draw') }), []);
});

// ---- RD8: the chess engine reply never hangs without a host ---------------------------------------------------------------------
test('a headless host settles the engine request, so the next command is not "still thinking"', async () => {
  const s = open('chess');
  await s.send('let us play chess');
  const r = await s.send('e4');
  assert.equal(s.state('games.chess').pendingEngine, true, 'the world waits for a host');
  const texts = s.settleHeadless(r);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /^I play /);
  assert.equal(s.state('games.chess').pendingEngine, false);
  assert.equal(s.state('games.chess').history.length, 2);
  const next = await s.send('knight to f3');
  assert.doesNotMatch(next.text, /still thinking/);
});

test('without a headless host the world still falls back after a second command (unchanged contract)', async () => {
  const s = open('chess');
  await s.send('let us play chess');
  await s.send('e4');
  assert.match((await s.send('what can my knight do')).text, /still thinking|knight/i);
});
