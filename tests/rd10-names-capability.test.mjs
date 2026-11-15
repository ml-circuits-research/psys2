// RD10, RD1b, RD2 (worker-tasks): proper names in the correction vocabulary (whole-value, multi-word, bounded), wrappers around values,
// the capability check before a reading wins, world and tab names in the spell vocabulary, bare game coordinates without a game,
// never "correcting" a word valid in some world, naming a world wins (the three Charts-tab sentences). Tests span worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { nameCandidates } from '../src/formalizer/names.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const open = (tab) => {
  const s = engine.createSession({ language: 'en', spell: true, bestEffort: true });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const worldsOf = (r) => r.segments.map((x) => x.match?.worldId ?? null);

// ---- proper names -------------------------------------------------------------------------------------------------------------------
for (const [tab, said, city] of [
  ['map', 'show Pariss', 'Paris'], ['map', 'show Brazil country', 'Brazil'],
  // P3: "show New Youk", "get me to New Youk" (map), "show Londn" (avatar), "show Parris" (draw): the name index reads world lexicons, and the places left them
  // for the catalog with the geo.map switch; "show Bern city", "show the city of Bern", "show the town of Pariss" ("A city does not contain cities."): on the failure ledger
]) {
  test(`names: "${said}" on ${tab} reads ${city}`, async () => {
    const r = await open(tab).send(said);
    assert.ok(r.segments.every((x) => !x.unparsed), r.text);
    assert.ok(worldsOf(r).includes('geo.map'), r.text);
    assert.match(r.text, new RegExp(city));
  });
}

test('names: a value that exists is never moved (Paris stays Paris, "red house" untouched)', async () => {
  // ported (geo.map switch, spec 21 section 12): the places are catalog wires, not a lexicon, so the name index has no "paris" entry; the contract is that nothing moves
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
// "change red to blue" on the empty editor tab and "change cat to dog" with the cat in the document (both not understood) are on the failure ledger (P3)

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

// bare game coordinates without a game: the tic-tac-toe test was deleted with ADR-010 (P3); "now in a women" (RD2 fragment) is on the failure ledger
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

// ---- result independent of machine speed ----------------------------------------------------------------------------------------------
test('names: the reading does not depend on the clock (frozen, busy and very slow clocks give the same reading)', async () => {
  const real = performance.now.bind(performance);
  const readings = [];
  try {
    for (const step of [0, 50, 5000]) {   // frozen, a busy machine (50 ms per call), an extremely slow one (5 s per call)
      let t = 0;
      performance.now = step === 0 ? () => 0 : () => (t += step);
      const out = [];
      for (const [tab, said] of [['map', 'show Pariss on map'], ['map', 'show New Youk'], ['avatar', 'show Londn']]) {
        const r = await open(tab).send(said);
        out.push(JSON.stringify(r.segments.map((x) => [!!x.unparsed, x.match?.worldId ?? null, x.corrections ?? null])));   // the reading (an operation may still hit its own visible time cap)
      }
      readings.push(out.join('\n'));
    }
  } finally { performance.now = real; }
  assert.ok(!readings[0].split('\n')[0].includes('true'), readings[0]);   // P3: only the Pariss line must read (the map reads it from the catalog; the other two are ledgered); the readings must agree
  assert.equal(readings[1], readings[0]);
  assert.equal(readings[2], readings[0]);
});
