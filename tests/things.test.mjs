// TRANSFER first slice (spec 23): the session store of things, aspects, views, session.learned. Targeted tests: the pure modules, and one conversation per reasoner that moves things between
// views (drawing, Talk, avatar, map) with no code per pair of views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { parseTeach, learn, withLearned } from '../src/knowledge/learned.mjs';
import { aspectsOf, sync, find, whyNot, viewByWords, ensure, select } from '../worlds/session.things/things.mjs';

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
  assert.equal(viewByWords([{ id: 'test.plan', noun: 'floor plan', words: ['floor'] }, { id: 'talk', noun: 'conversation', words: ['talk'] }], 'the floor plan tab').id, 'test.plan');
});

test('the store keeps the identity of a thing; the view that made it owns kind, name and parts; a view changes an attribute only by what it changed', () => {
  const st = ensure({});
  const A = () => ({}), item = (o) => ({ key: 'k', kind: 'table', ...o });
  const { ids } = sync(st, 'test.plan', [item({ attrs: { seats: 4, colour: 'white' } })], A);
  const id = ids.k;
  sync(st, 'talk', [item({ thingId: id, kind: 'WRONG', attrs: { seats: 99 } })], A);   // a stale copy in another view
  assert.equal(st.things[0].kind, 'table'); assert.equal(st.things[0].attrs.seats, 4, 'the first publication of another view overwrites nothing');
  sync(st, 'test.plan', [item({ thingId: id, attrs: { seats: 6, colour: 'white' } })], A);
  sync(st, 'talk', [item({ thingId: id, attrs: { seats: 99, colour: 'red' } })], A);   // the second shows what talk changed: seats unchanged since its last copy (99 -> 99), colour red
  assert.equal(st.things[0].attrs.seats, 6); assert.equal(st.things[0].attrs.colour, 'red');
  sync(st, 'test.plan', [], A);
  assert.equal(st.things.length, 1, 'still shown in talk');
  sync(st, 'talk', [], A);
  assert.equal(st.things.length, 0, 'a thing no view shows is dropped');
  assert.deepEqual(find(ensure({ things: [{ id: 'x', kind: 'table', label: 'table 2', name: null }] }), 'table 2').map((t) => t.id), ['x']);
});

for (const reasoner of ['ops', 'matrix']) {
  test(`${reasoner}: a house drawn in the drawing is shown in Talk and a thing of Talk in the drawing, by the one operation; what a view cannot take is said plainly`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['hat', 'bicycle', 'house']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('draw');
    await s.send('draw a house'); await s.send('make the house blue');
    let r = await s.send('send the house to the talk');
    assert.match(r.text, /^Here is a house from the drawing/);
    assert.ok(s.state('talk').cards.length, 'a card in Talk');
    r = await s.send('send it to the avatar');
    assert.match(r.text, /^A house is not something the face has/, 'a house has no place on a face: said plainly, nothing changed');
    tab('talk');
    await s.send('What does a bicycle look like?');
    r = await s.send('send it to the map');
    assert.match(r.text, /A bicycle has no position on Earth to show in the map/);
    tab('robot');
    await s.send('put on a hat');
    r = await s.send('send the hat to the talk');
    assert.match(r.text, /^Here is a hat from the face/);
    const things = s.state('session.things').things;
    assert.ok(things.find((t) => t.kind === 'house').shown.includes('talk'));
  });

  test(`${reasoner}: what the user teaches in one view is read in the others at the knowledge tier`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['house', 'person']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('draw');
    assert.match((await s.send('a waiter is a kind of person')).text, /^OK, a waiter is a kind of person/);
    tab('talk');
    assert.match((await s.send('What kind of thing is a waiter?')).text, /A waiter is a kind of person/);
    assert.match((await s.send('a villa is a kind of house')).text, /^OK, a villa is a kind of house/);
    await engine.knowledge.thing('villa');
    assert.match((await s.send('What kind of thing is a villa?')).text, /A villa is a kind of house/);
    assert.equal(s.state('session.things').learned.length, 2, 'the taught facts are wires of the session');
  });
}

test('select: "what I drew", "the things in the plan" and "the discussion" name sets of things by the view that holds them; a view that counts takes anything', () => {
  const st = ensure({ things: [
    { id: 'a', kind: 'house', shown: ['art.draw'], aspects: {} }, { id: 'b', kind: 'table', shown: ['docs.editor'], aspects: {} }, { id: 'c', kind: 'person', name: 'Ann', shown: ['docs.editor'], aspects: {} },
  ] });
  const views = [{ id: 'docs.editor', noun: 'document', words: ['document', 'plan'] }, { id: 'art.draw', noun: 'drawing board', words: ['draw', 'drawing'] }];
  assert.deepEqual(select(st, 'what I drew', views).things.map((t) => t.id), ['a']);
  assert.deepEqual(select(st, 'things in the plan', views).things.map((t) => t.id), ['b', 'c']);
  assert.equal(select(st, 'the discussion', views).things.length, 3);
  assert.equal(select(st, 'the discussion', views).session, true);
  assert.deepEqual(select(st, 'Ann', views).things.map((t) => t.id), ['c']);
  assert.equal(whyNot({ kind: 'hat', aspects: { visual: 'knowledge' } }, { noun: 'chart', aspects: ['numeric'], counts: true }), null);
  assert.match(whyNot({ kind: 'hat', aspects: { visual: 'knowledge' } }, { noun: 'calendar', aspects: ['temporal'] }), /has no time to show in the calendar/);
});

for (const reasoner of ['ops', 'matrix']) {
  test(`${reasoner}: a chart and a document of "what I drew" / "the discussion" are selections of session things into views (one request each); a document is made with its text in one request`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    engine.setKnowledge(catalog());
    for (const w of ['bicycle']) await engine.knowledge.thing(w);
    const s = engine.createSession({ language: 'en' });
    const tab = (t) => s.setWorldState('ui.shell', { activeTab: t });
    tab('draw'); await s.send('draw 3 cars'); await s.send('draw a house');
    tab('talk'); await s.send('What does a bicycle look like?');
    tab('charts');
    let r = await s.send('make a chart of what I drew');
    assert.match(r.text, /cars 3 and houses 1/, r.text);
    const chart = s.state('data.charts').charts[0];
    assert.deepEqual([chart.labels, chart.datasets[0].data], [['Cars', 'Houses'], [3, 1]]);
    r = await s.send('create a chart about the current discussion');
    assert.match(r.text, /bicycles 1/, r.text);
    await s.send('undo');
    assert.deepEqual(s.state('data.charts').charts[0].labels, ['Cars', 'Houses'], 'one step to undo for the whole selection');
    tab('editor');
    r = await s.send('create a document about the current discussion');
    assert.match(r.text, /document called "About the discussion" with \d sections/, r.text);
    const doc = s.state('docs.editor');
    assert.ok(doc.blocks.some((b) => b.kind === 'heading' && /drawing/i.test(b.text)), 'one section per view the things come from');
    assert.ok(doc.blocks.some((b) => b.kind === 'list' && b.items.some((i) => /bicycle/i.test(i))), JSON.stringify(doc.blocks));
    r = await s.send('make a document called Holiday with the text "We go to the sea. We swim."');
    assert.match(r.text, /document called "Holiday" with 1 block/, r.text);
    assert.equal(s.state('docs.editor').blocks[0].text, 'We go to the sea. We swim.');
  });
}
