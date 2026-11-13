// TRANSFER first slice (spec 22): the session store of things, aspects, views, session.learned. Targeted tests: the pure modules, and one conversation per reasoner that moves things between
// three views (seating plan, Talk, avatar) with no code per pair of views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { parseTeach, learn, withLearned } from '../src/knowledge/learned.mjs';
import { aspectsOf, sync, find, whyNot, viewByWords, ensure } from '../worlds/session.things/things.mjs';

const CAT = path.resolve(import.meta.dirname, 'fixtures/catalog');
const catalog = () => createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } });

test('taught sentences become wires of the knowledge format; unknown forms teach nothing', () => {
  assert.deepEqual(['is_a', 'villa', 'house'], ((t) => [t.form, t.subject, t.object])(parseTeach('A villa is a kind of house.')));
  assert.equal(parseTeach('My dog is called Rex.').object, 'Rex');
  assert.equal(parseTeach('ducks float').form, 'can');
  assert.equal(parseTeach('fish live in water').form, 'at');
  assert.equal(parseTeach('a boat is made of wood').object, 'wood');
  assert.equal(parseTeach('what can ducks do?'), null);
  assert.equal(parseTeach('hello there'), null);
  const lines = [];
  const r = learn(lines, parseTeach('a villa is a kind of house'));
  assert.match(r.line, /^@learned\.1 k\.words\.sense word="villa" pos=noun n=0 gloss="a kind of house" is_a="house" core\.source="user"$/);
  assert.equal(learn(lines, parseTeach('a villa is a kind of house')).existing, true, 'the same fact is not stored twice');
});

test('the learned wires are overlaid on the catalog for one session only', async () => {
  const base = catalog();
  await base.thing('house'); await base.thing('dog');
  const mine = [], other = [];
  learn(mine, parseTeach('a villa is a kind of house')); learn(mine, parseTeach('my dog is called Rex')); learn(mine, parseTeach('ducks can float'));
  const kn = withLearned(base, () => mine), kn2 = withLearned(base, () => other);
  assert.deepEqual(kn.ancestors('villa'), ['house'].concat(kn.ancestors('house')));
  assert.ok(kn.peek('villa').objects.length, 'a villa is drawn as the house it is a kind of');
  assert.equal(kn.peek('villa').drawnAs, 'house');
  assert.equal(kn.peek('rex').owned.kind, 'dog');
  assert.ok(kn.peek('duck').commonsense.can.includes('float'));
  assert.equal(kn2.peek('villa'), undefined, 'another session knows nothing of it');
  assert.equal(base.peek('villa'), undefined, 'the shared catalog is never changed');
  assert.deepEqual(kn.own('dog'), [{ kind: 'dog', name: 'Rex' }]);
});

test('aspects come from knowledge, the schema of the view and the attributes; the view gate says why in plain words', async () => {
  const base = catalog(); await base.thing('table'); await base.thing('paris');
  const t = aspectsOf({ kind: 'table', th: base.peek('table'), attrs: { seats: 4, colour: 'blue' }, attrTypes: { colour: 'colour', seats: 'number' } });
  assert.equal(t.visual, 'knowledge'); assert.equal(t.numeric, 'attribute'); assert.equal(t.textual, 'schema');
  const paris = aspectsOf({ kind: 'city', th: base.peek('paris') });
  assert.ok(paris.geographic, 'a city is on the map');
  const plain = aspectsOf({ kind: 'idea' });
  assert.deepEqual(Object.keys(plain).sort(), ['relational', 'textual']);
  const face = { id: 'a', noun: 'face', aspects: ['visual'] };
  assert.match(whyNot({ kind: 'idea', aspects: plain }, face), /An idea has no picture to show in the face/);
  assert.equal(whyNot({ kind: 'table', aspects: t }, face), null);
  assert.equal(viewByWords([{ id: 'plan.seating', noun: 'seating plan', words: ['seating'] }, { id: 'talk', noun: 'conversation', words: ['talk'] }], 'the seating plan tab').id, 'plan.seating');
});

test('the store keeps the identity of a thing; the view that made it owns kind, name and parts; a view changes an attribute only by what it changed', () => {
  const st = ensure({});
  const A = () => ({}), item = (o) => ({ key: 'k', kind: 'table', ...o });
  const { ids } = sync(st, 'plan.seating', [item({ attrs: { seats: 4, colour: 'white' } })], A);
  const id = ids.k;
  sync(st, 'talk', [item({ thingId: id, kind: 'WRONG', attrs: { seats: 99 } })], A);   // a stale copy in another view
  assert.equal(st.things[0].kind, 'table'); assert.equal(st.things[0].attrs.seats, 4, 'the first publication of another view overwrites nothing');
  sync(st, 'plan.seating', [item({ thingId: id, attrs: { seats: 6, colour: 'white' } })], A);
  sync(st, 'talk', [item({ thingId: id, attrs: { seats: 99, colour: 'red' } })], A);   // the second shows what talk changed: seats unchanged since its last copy (99 -> 99), colour red
  assert.equal(st.things[0].attrs.seats, 6); assert.equal(st.things[0].attrs.colour, 'red');
  sync(st, 'plan.seating', [], A);
  assert.equal(st.things.length, 1, 'still shown in talk');
  sync(st, 'talk', [], A);
  assert.equal(st.things.length, 0, 'a thing no view shows is dropped');
  assert.deepEqual(find(ensure({ things: [{ id: 'x', kind: 'table', label: 'table 2', name: null }] }), 'table 2').map((t) => t.id), ['x']);
});

for (const reasoner of ['ops', 'matrix']) {
  test(`${reasoner}: a table made in the seating plan is shown in Talk and a thing of Talk in the seating plan, by the one operation; what a view cannot take is said plainly`, async () => {
    process.env.PSYS2_PILOT_ROOTS = path.resolve(import.meta.dirname, '../worlds-pilot');
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['table', 'hat', 'bicycle', 'house']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('seating');
    await s.send('add a table'); await s.send('make table 1 blue'); await s.send('add a guest called Ann at table 1');
    let r = await s.send('send table 1 to the talk');
    assert.match(r.text, /^Here is table 1 from the seating plan/);
    const card = s.state('talk').cards.at(-1);
    assert.equal(card.kind, 'drawing'); assert.equal(card.data.tint, 'blue', 'the colour travelled with the thing');
    r = await s.send('send Ann to the avatar');
    assert.match(r.text, /^Ann is not something the face has/, 'a guest has no place on a face: said plainly, nothing changed');
    tab('talk');
    await s.send('What does a bicycle look like?');
    r = await s.send('send it to the seating plan');
    assert.match(r.text, /A bicycle is not something the seating plan has/);
    r = await s.send('What does a house look like?');
    tab('robot');
    await s.send('put on a hat');
    r = await s.send('send the hat to the talk');
    assert.match(r.text, /^Here is a hat from the face/);
    const things = s.state('session.things').things;
    assert.ok(things.find((t) => t.kind === 'table').shown.includes('talk'));
    const guest = Object.keys(things.find((t) => t.kind === 'guest').aspects);
    assert.ok(guest.includes('social') && !guest.includes('numeric'), 'a guest is a person: social, no numbers');
  });

  test(`${reasoner}: what the user teaches in one view is read in the others at the knowledge tier`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['house', 'person']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('seating');
    assert.match((await s.send('a waiter is a kind of person')).text, /^OK, a waiter is a kind of person/);
    assert.match((await s.send('add a waiter called Sam')).text, /A waiter is a kind of guest\. I added guest Sam/);
    tab('talk');
    assert.match((await s.send('a villa is a kind of house')).text, /^OK, a villa is a kind of house/);
    await engine.knowledge.thing('villa');
    assert.match((await s.send('What kind of thing is a villa?')).text, /A villa is a kind of house/);
    assert.equal(s.state('session.things').learned.length, 2, 'the taught facts are wires of the session');
  });
}
