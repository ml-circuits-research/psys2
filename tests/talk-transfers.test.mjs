// TALK stage 2 (spec 18 section 7): cards that change by talking, travel between tabs and come back; the session cards; experiment E-T4 (30 transfers across
// art.draw, diagram.sketch and geo.map and back, both reasoners, every one undoable, with the numbers). No network: a small in-memory catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { cardHtml, treeSvg, factsHtml, drawingSvg, tintOf } from '../worlds/talk/cards.mjs';
import { layoutParts } from '../worlds/talk/ops.mjs';
import { anyOverlap } from '../worlds/space/space.mjs';
import { withCatalogIndex, withFixtureWorlds } from './helpers.mjs';

const RAW = {
  'vocab.json': JSON.stringify({ comet: ['k.words/shards/w'], france: ['k.words/shards/w'], romania: ['k.words/shards/w'], japan: ['k.words/shards/w'], italy: ['k.words/shards/w'], paris: ['k.words/shards/w'], spider: ['k.words/shards/w'], moon: ['k.words/shards/w'] }),
  'k.words/shards/w.sop': [
    '@k.words.comet.noun.1 k.words.sense word=comet pos=noun n=1 gloss="a small icy body that travels around the sun" is_a=celestial_body is_a=object core.source="t"',
    '@k.words.france.noun.1 k.words.sense word=france pos=noun n=1 gloss="a republic in western Europe" is_a=country core.source="t"',
    '@k.words.romania.noun.1 k.words.sense word=romania pos=noun n=1 gloss="a country in eastern Europe" is_a=country core.source="t"',
    '@k.words.japan.noun.1 k.words.sense word=japan pos=noun n=1 gloss="an island country in East Asia" is_a=country core.source="t"',
    '@k.words.italy.noun.1 k.words.sense word=italy pos=noun n=1 gloss="a republic in southern Europe" is_a=country core.source="t"',
    '@k.words.paris.noun.1 k.words.sense word=paris pos=noun n=1 gloss="the capital of France" is_a=city core.source="t"',
    '@k.words.spider.noun.1 k.words.sense word=spider pos=noun n=1 gloss="a predatory arachnid with eight legs" is_a=arachnid core.source="t"',
    '@k.words.moon.noun.1 k.words.sense word=moon pos=noun n=1 gloss="the natural satellite of the Earth" core.source="t"',
  ].join('\n'),
};
const FILES = withFixtureWorlds(withCatalogIndex(RAW), ['k.geo']);   // the map reads its places from the catalog (geo.map pilot): the fixture catalog's k.geo
const source = { text: async (p) => FILES[p] ?? null };

const engines = {};
const engineFor = async (mode) => (engines[mode] ??= await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: mode } }));
const sessionOf = async (mode, tab = 'talk') => {
  const engine = await engineFor(mode);
  engine.setKnowledge(createFacts({ source }));
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const tab = (s, id) => s.setWorldState('ui.shell', { activeTab: id });

test('a card changes by talking: colour, size, another thing next to it; undo takes each back', async () => {
  const s = await sessionOf('matrix');
  await s.send('What does a bicycle look like?');
  let r = await s.send('make it red');
  assert.match(r.text, /bicycle red/);
  assert.ok(r.effects.some((e) => e.name === 'talk.card' && e.args.update));
  const card = () => s.state('talk').cards.find((c) => c.kind === 'drawing');
  assert.equal(card().data.tint, 'red');
  assert.ok(tintOf(card()) && cardHtml(card()).includes(tintOf(card())));
  r = await s.send('bigger');
  assert.equal(card().data.scale, 1.2);
  r = await s.send('smaller');
  assert.equal(card().data.scale, 1);
  r = await s.send('show the moon too');
  assert.match(r.text, /moon next to the bicycle/);
  assert.equal(card().data.extras.length, 1);
  assert.ok(cardHtml(card()).includes('translate(116 0)'), 'the moon is drawn in its own frame');
  r = await s.send('show the wheel too');
  assert.match(r.text, /already in the picture/);
  assert.ok(card().data.mark, 'the wheel is marked');
  await s.send('undo');   // the mark
  assert.equal(card().data.mark, undefined);
  r = await s.send('undo');
  assert.equal(card().data.extras, undefined, 'the moon is taken back');
  await s.send('undo'); await s.send('undo'); await s.send('undo');
  assert.equal(card().data.tint, undefined, 'the colour is taken back');
});

test('follow-ups without a subject use the current topic', async () => {
  const s = await sessionOf('ops');
  await s.send('What does a bicycle look like?');
  let r = await s.send('what are its parts?');
  assert.match(r.text, /bicycle has/);
  r = await s.send('and its parts?');
  assert.match(r.text, /bicycle has/);
  r = await s.send('how many wheels does it have?');
  assert.match(r.text, /2 wheels/);
  r = await s.send('what does it look like?');
  assert.match(r.text, /bicycle/);
  const fresh = await sessionOf('ops');
  r = await fresh.send('what are its parts?');
  assert.match(r.text, /not on anything yet/);
});

test('the parts diagram is laid out by the SPACE module: no overlaps, every part has a box', async () => {
  for (const n of [1, 2, 3, 5, 7, 10, 12]) {
    const items = Array.from({ length: n }, (_, i) => ({ name: `part${i}`, n: 1 }));
    const lay = layoutParts(items);
    assert.equal(Object.keys(lay.boxes).length, n);
    const boxes = Object.entries(lay.boxes).map(([id, [x, y]]) => ({ id, x, y, w: lay.box.w, h: lay.box.h }));
    assert.ok(!anyOverlap(boxes), `no overlaps for ${n} parts`);
    assert.ok(boxes.every((b) => b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= lay.w && b.y - b.h / 2 > lay.root.y + 10 && b.y + b.h / 2 <= lay.h), 'inside the frame, under the root');
  }
  const s = await sessionOf('ops');
  await s.send('What are the parts of a bicycle?');
  const c = s.state('talk').cards.at(-1);
  assert.ok(c.data.layout?.boxes && cardHtml(c).includes('tk-partbox'));
});

test('what kind of thing: a tree from the is-a facts; session cards say "nothing leaves the device" once', async () => {
  const s = await sessionOf('ops');
  let r = await s.send('What kind of thing is a comet?');
  assert.match(r.text, /kind of celestial body and object/);
  const c = s.state('talk').cards.at(-1);
  assert.equal(c.kind, 'tree');
  assert.ok(treeSvg(c).includes('celestial body'));
  r = await s.send('What do you know about me?');
  assert.match(r.text, /do not know anything about you/);
  assert.match(r.text, /Nothing leaves this device\./);
  r = await s.send('What did I draw today?');
  assert.match(r.text, /not drawn anything/);
  assert.doesNotMatch(r.text, /Nothing leaves/, 'said once');
  tab(s, 'draw');
  await s.send('draw a red house'); await s.send('draw two trees');
  tab(s, 'talk');
  r = await s.send('What did I draw today?');
  assert.match(r.text, /drew 3 things: 2 trees and a house/);
  const f = s.state('talk').cards.at(-1);
  assert.equal(f.kind, 'facts');
  assert.ok(factsHtml(f).includes('tree'));
  tab(s, 'chess');
  await s.send('e4'); await s.send('knight to f6');
  tab(s, 'talk');
  r = await s.send('How many moves did I make in chess?');
  assert.match(r.text, /You made [12] moves? in chess/);
  assert.equal(s.state('talk').cards.at(-1).kind, 'icons');
  assert.doesNotMatch(drawingSvg([{ name: 'a', shape: 'circle', x: 0, y: 0, w: 5, h: 5, colour: ['red'] }]), /<script/);
});

// ---------------------------------------------------------------- E-T4: 30 transfers, both reasoners
const THINGS = ['bicycle', 'house', 'car', 'boat', 'robot', 'rocket', 'castle', 'train', 'flower', 'tree'];
const PLACES = ['france', 'romania', 'japan', 'italy', 'paris'];
const drawSig = (s) => JSON.stringify((s.state('art.draw')?.objects ?? []).map((o) => [o.id, o.kind, o.thing ?? null, o.color]));
const diagSig = (s) => JSON.stringify([(s.state('diagram.sketch')?.shapes ?? []).map((x) => x.name), (s.state('diagram.sketch')?.edges ?? []).length]);
const mapSig = (s) => JSON.stringify(s.state('geo.map')?.focus?.name ?? null);

for (const mode of ['matrix', 'ops']) {
  test(`E-T4 cross-world transfers (reasoner ${mode}): 30 transfers, every one undoable, and "ask about this" back`, async () => {
    const rows = [];
    const rec = (kind, name, ok, undone, ms) => rows.push({ kind, name, ok, undone, ms });
    // to the drawing (10): the card is changed first for the odd ones, and the colour travels with it
    for (const [i, thing] of THINGS.entries()) {
      const s = await sessionOf(mode);
      await s.send(`What does a ${thing} look like?`);
      if (i % 2) await s.send('make it blue');
      const before = drawSig(s), t0 = performance.now();
      const r = await s.send('put it in my drawing');
      const ms = performance.now() - t0;
      const objs = s.state('art.draw').objects;
      const ok = /Drawing tab took it/.test(r.text) && objs.length === 1 && (objs[0].kind === thing || objs[0].thing === thing) && (!(i % 2) || objs[0].color === 'blue');
      tab(s, 'talk');
      await s.send('undo');
      rec('draw', thing, ok, drawSig(s) === before, ms);
    }
    // to the diagram (10): the parts become boxes linked to the thing
    for (const thing of THINGS) {
      const s = await sessionOf(mode);
      await s.send(`What are the parts of a ${thing}?`);
      const n = s.state('talk').cards.at(-1).data.items.length, before = diagSig(s), t0 = performance.now();
      const r = await s.send('make a diagram of this');
      const ms = performance.now() - t0;
      const d = s.state('diagram.sketch');
      const ok = /Diagram tab took it/.test(r.text) && d.shapes.length === Math.min(n, 8) + 1 && d.edges.length === Math.min(n, 8);
      tab(s, 'talk');
      await s.send('undo');
      rec('diagram', thing, ok, diagSig(s) === before, ms);
    }
    // to the map (5): a place the map knows
    for (const place of PLACES) {
      const s = await sessionOf(mode);
      await s.send(`What is ${place}?`);
      const before = mapSig(s), t0 = performance.now();
      const r = await s.send('show it on the map');
      const ms = performance.now() - t0;
      const ok = /Map tab took it|I put a pin on/.test(r.text) && String(s.state('geo.map').focus?.name ?? '').toLowerCase() === place;
      tab(s, 'talk');
      await s.send('undo');
      rec('map', place, ok, mapSig(s) === before, ms);
    }
    // and back (5): "ask about this" opens Talk on the selected thing of the other tab
    const back = [];
    for (const [from, make, expect] of [
      ['draw', async (s) => { await s.send('What does a house look like?'); await s.send('put it in my drawing'); }, /house from your drawing/],
      ['draw', async (s) => { await s.send('What does a car look like?'); await s.send('put it in my drawing'); await s.send('select the car'); }, /car from your drawing/],
      ['diagram', async (s) => { await s.send('What are the parts of a boat?'); await s.send('make a diagram of this'); }, /boat from your diagram/],
      ['map', async (s) => { await s.send('What is italy?'); await s.send('show it on the map'); }, /italy from the map/],
      ['map', async (s) => { await s.send('What is japan?'); await s.send('show it on the map'); }, /japan from the map/],
    ]) {
      const s = await sessionOf(mode);
      await make(s);
      tab(s, from);
      const t0 = performance.now();
      const r = await s.send('ask about this');
      back.push({ from, ok: expect.test(r.text) && s.state('ui.shell').activeTab === 'talk', ms: performance.now() - t0 });
    }
    const sum = (k) => rows.filter((x) => x[k]).length;
    const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    console.log(`E-T4 [${mode}] transfers ${rows.length}: ok ${sum('ok')}, undone ${sum('undone')}; by tab ` + ['draw', 'diagram', 'map'].map((k) => `${k} ${rows.filter((x) => x.kind === k && x.ok).length}/${rows.filter((x) => x.kind === k).length}`).join(', ')
      + `; back ${back.filter((b) => b.ok).length}/${back.length}; median ms ${median(rows.map((x) => x.ms)).toFixed(0)}, max ${Math.max(...rows.map((x) => x.ms)).toFixed(0)}`);
    const bad = rows.filter((x) => !x.ok || !x.undone).map((x) => `${x.kind}:${x.name}${x.ok ? '' : ' (transfer)'}${x.undone ? '' : ' (undo)'}`);
    assert.deepEqual(bad, [], `failed transfers: ${bad.join(', ')}`);
    assert.deepEqual(back.filter((b) => !b.ok).map((b) => b.from), [], 'ask about this');
    assert.equal(rows.length + back.length, 30);
  });
}
