// TRANSFER (spec 23): the map as a view of the session things, a send act that names a view, and common sense at the knowledge tier (T3). Targeted tests, not a suite of phrases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { parseTeach, learn, withLearned } from '../src/knowledge/learned.mjs';
import { habitat, adviceFor, habitatSentence } from '../src/knowledge/commonsense.mjs';

const CAT = path.resolve(import.meta.dirname, 'fixtures/catalog');
const catalog = () => createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } });

test('common sense is one lookup at the knowledge tier: a catalog fact and a taught fact give the same advice and the same sentence', async () => {
  const base = catalog();
  for (const w of ['fish', 'house', 'lighthouse']) await base.thing(w);
  assert.deepEqual(habitat(base, 'fish').zones, ['water']);
  assert.equal(adviceFor(base, 'fish', 'sky'), 'A fish is usually found in water, not in the sky.');
  assert.equal(adviceFor(base, 'fish', 'water'), null, 'no advice where the thing belongs');
  assert.equal(habitat(base, 'house').zones[0], 'ground', 'the usual place of a picture (k.scenes) comes first');
  const mine = [];
  learn(mine, parseTeach('a villa is a kind of house')); learn(mine, parseTeach('zorbs live in water'));
  const kn = withLearned(base, () => mine);
  await kn.thing('villa'); await kn.thing('zorb');
  assert.equal(habitat(kn, 'villa').via, 'house', 'a villa stands where a house stands');
  assert.equal(adviceFor(kn, 'zorb', 'sky'), 'A zorb is usually found in water, not in the sky.');
  assert.equal(habitatSentence(kn, 'zorb'), 'You find it in water.');
  assert.equal(adviceFor(base, 'zorb', 'sky'), null, 'what one session was taught is not in the shared catalog');
  assert.equal(parseTeach('a house stands on the ground').form, 'at');
});

for (const reasoner of ['ops', 'matrix']) {
  test(`${reasoner}: the map is a view of the session things (pins for what has a place, plain words for what has none); a send that names the chart is a send; Talk has no per-pair branch to the map`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['paris', 'france', 'moon', 'table']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('talk');
    await s.send('What is Paris?');
    let r = await s.send('show it on the map');
    assert.match(r.text, /pin on Paris/, r.text);
    await s.send('What is France?'); await s.send('Tell me about the moon.');
    r = await s.send('put the places we talked about on the map');
    assert.match(r.text, /France/, r.text);
    assert.deepEqual(s.state('geo.map').markers.map((m) => m.name).sort(), ['France', 'Paris']);
    r = await s.send('show it on the map');
    assert.match(r.text, /has no position on Earth to show in the map/, r.text);
    tab('seating'); await s.send('add a table');
    r = await s.send('send table 1 to the chart');
    assert.match(r.text, /tables 1/, `a send names the chart: it is not chart data ("send table 1"): ${r.text}`);
    assert.doesNotMatch(readFileSync(path.resolve(import.meta.dirname, '../worlds/talk/ops.mjs'), 'utf8'), /to === 'map'/);
  });
}
