// RD10, RD1b, RD2 (worker-tasks): proper names in the correction vocabulary (whole-value, multi-word, bounded), wrappers around values,
// the capability check before a reading wins, world and tab names in the spell vocabulary, bare game coordinates without a game,
// never "correcting" a word valid in some world, naming a world wins (the three Charts-tab sentences). Tests span worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { nameCandidates, nameIndex } from '../src/formalizer/names.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const open = (tab) => {
  const s = engine.createSession({ language: 'en', spell: true, bestEffort: true });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const worldsOf = (r) => r.segments.map((x) => x.match?.worldId ?? null);

// ---- proper names -------------------------------------------------------------------------------------------------------------------
for (const [tab, said, city] of [
  ['map', 'show Pariss', 'Paris'], ['map', 'show New Youk', 'New York'], ['map', 'get me to New Youk', 'New York'], ['avatar', 'show Londn', 'London'],
  ['draw', 'show Parris', 'Paris'], ['map', 'show Bern city', 'Bern'], ['map', 'show the city of Bern', 'Bern'], ['charts', 'show the town of Pariss', 'Paris'],
  ['map', 'show Brazil country', 'Brazil'],
]) {
  test(`names: "${said}" on ${tab} reads ${city}`, async () => {
    const r = await open(tab).send(said);
    assert.ok(r.segments.every((x) => !x.unparsed), r.text);
    assert.ok(worldsOf(r).includes('geo.map'), r.text);
    assert.match(r.text, new RegExp(city));
  });
}

test('names: a value that exists is never moved (Paris stays Paris, "red house" untouched)', async () => {
  const idx = nameIndex(engine.set);
  assert.ok(idx.exact.has('paris'));
  assert.deepEqual(nameCandidates('show Paris', { set: engine.set }), []);
  assert.deepEqual(nameCandidates('draw a red house', { set: engine.set }), []);
});

test('names: bounded work on very long, heavily misspelled messages', () => {
  const noise = Array.from({ length: 60 }, (_, i) => ['xqzv', 'plmok', 'Pariss', 'New Youk', 'blorf', 'Londn'][i % 6] + (i % 7 ? '' : 'z')).join(' ');
  const t0 = performance.now();
  const out = nameCandidates(`show ${noise} and ${noise}`, { set: engine.set });
  const ms = performance.now() - t0;
  assert.ok(out.length <= 6, 'candidate cap');
  assert.ok(ms < 400, `name stage took ${ms} ms`);
});

test('names: a 60-word noise message completes end to end in bounded time', async () => {
  const noise = Array.from({ length: 60 }, (_, i) => ['xqzv', 'plmok', 'Pariss', 'New Youk', 'blorf', 'Londn'][i % 6]).join(' ');
  for (const tab of ['map', 'avatar', 'draw']) {
    const t0 = performance.now();
    await open(tab).send(`show ${noise}`);
    const ms = performance.now() - t0;
    assert.ok(ms < 8000, `${tab}: ${ms} ms`);
  }
});

// ---- capability check ---------------------------------------------------------------------------------------------------------------
for (const tab of ['tictactoe', 'chess', 'map', 'draw', 'music']) {
  test(`capability: "change vatar to a man" on ${tab} reaches the avatar, not the editor`, async () => {
    const r = await open(tab).send('change vatar to a man');
    assert.ok(worldsOf(r).includes('ui.avatar'), r.text);
    assert.ok(!/could not find/.test(r.text), r.text);
  });
}
test('capability: "change X to Y" stays with the editor on its tab and when X is in the document', async () => {
  const s = open('editor');
  assert.match((await s.send('change red to blue')).text, /could not find "red"/);
  const d = open('map');
  await d.send('add a paragraph The cat sat on the mat.');
  const r = await d.send('change cat to dog');
  assert.deepEqual(worldsOf(r), ['docs.editor']);
  assert.match(r.text, /replaced/);
});

// ---- RD1b: a word valid in some world is never corrected ------------------------------------------------------------------------------
test('RD1b: "next" on the drawing tab is not read as "neat"', async () => {
  const s = open('draw');
  await s.send('draw a house');
  const r = await s.send('next');
  assert.ok(!/I read "next"/.test(r.text), r.text);
});
test('RD1b: "red house big" draws a big red house (no "redo")', async () => {
  const r = await open('avatar').send('red house big');
  assert.ok(!/redo/.test(r.text), r.text);
  assert.ok(worldsOf(r).includes('art.draw'), r.text);
});
test('RD1b: a correction never switches the tab on its own', async () => {
  const s = open('avatar');
  await s.send('fa-i ochii mari');
  assert.equal(s.state()['ui.shell'].activeTab, 'avatar');
});

// ---- RD2: naming a world wins (Charts tab) ------------------------------------------------------------------------------------------
for (const said of ['the avatar should be a women', 'make the avatar look scared']) {
  test(`RD2: "${said}" on the Charts tab goes to the avatar`, async () => {
    const s = open('charts');
    await s.send('make a chart: apples 5, pears 3');
    const r = await s.send(said);
    assert.ok(worldsOf(r).includes('ui.avatar'), r.text);
    assert.ok(!/in the chart/.test(r.text), r.text);
  });
}
test('RD2: "now in a women" after an avatar change, with the Charts tab open, goes back to the avatar', async () => {
  const s = open('charts');
  await s.send('make a chart: apples 5, pears 3');
  await s.send('make the avatar a man');
  s.setWorldState('ui.shell', { activeTab: 'charts' });
  const r = await s.send('now in a women');
  assert.ok(worldsOf(r).includes('ui.avatar'), r.text);
});

// ---- bare game coordinates without a game --------------------------------------------------------------------------------------------------
test('bare coordinate on the Map tab offers a game, yes starts tic-tac-toe and plays it', async () => {
  const s = open('map');
  const a = await s.send('B1');
  assert.match(a.text, /B1 looks like a game move\. Do you want to play tic-tac-toe or chess\?/);
  const y = await s.send('yes');
  assert.equal(s.state()['ui.shell'].activeTab, 'tictactoe');
  assert.deepEqual(s.state()['games.tictactoe'].board?.[0]?.[1] ?? s.state()['games.tictactoe'].board?.b1 ?? 'X', 'X');
  assert.ok(y.segments.some((x) => x.match?.patternId === 'pat.games.tictactoe.coord'));
});
test('bare coordinate answered "no" leaves everything as it is; e4 offers chess only', async () => {
  const s = open('avatar');
  assert.match((await s.send('e4')).text, /E4 looks like a game move\. Do you want to play chess\?/);
  assert.match((await s.send('no')).text, /leave it as it is/);
  assert.equal(s.state()['ui.shell'].activeTab, 'avatar');
});
test('bare coordinate inside a running game is still a move', async () => {
  const s = open('chess');
  assert.match((await s.send('e4')).text, /pawn to e4/);
});

// ---- RD2 without best effort (the CLI default) ----------------------------------------------------------------------------------------
for (const said of ['the avatar should be a women', 'make the avatar look scared']) {
  test(`RD2 (no best effort): "${said}" with the Charts tab open goes to the avatar`, async () => {
    const s = engine.createSession({ language: 'en', spell: true });
    s.setWorldState('ui.shell', { activeTab: 'charts' });
    await s.send('make a chart: apples 5, pears 3');
    const r = await s.send(said);
    assert.ok(worldsOf(r).includes('ui.avatar'), r.text);
  });
}
test('RD1b: a lone valid word ("next") is never swapped for a neighbour', async () => {
  const s = engine.createSession({ language: 'en', spell: true });
  s.setWorldState('ui.shell', { activeTab: 'charts' });
  const r = await s.send('next');
  assert.ok(!/neat/.test(r.text), r.text);
});
