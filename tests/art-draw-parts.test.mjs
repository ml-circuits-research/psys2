// SPDX-License-Identifier: AGPL-3.0-only
// SCENE-NATURAL P5: things are taken apart and built. Parts by name (also for catalog objects), a missing part says which parts the thing has, take apart (one undo
// step joins them again), put together and name a group (used like any object), variation ("3 different houses"), and a catalog picture for a word the board
// reads as another kind ("a ball"). Both reasoners, other words than the owner's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BALL = '@k.objects.ball k.objects.object name=ball\n@k.objects.ball.body k.objects.part of=ball name=body shape=circle x=10 y=10 w=80 h=80 z=1 colour=orange\n@k.objects.ball.stripe k.objects.part of=ball name=stripe shape=rectangle x=10 y=47 w=80 h=6 z=2 colour=white\n';
const source = { text: async (p) => {
  const kdir = join(REPO, 'knowledge');
  if (p === 'vocab.json') { const v = JSON.parse(readFileSync(join(kdir, 'k.objects/vocab.json'), 'utf8')); for (const w of ['crocodile', 'crocodiles']) v[w] = ['k.objects/shards/owner-log']; v.ball = ['k.objects/shards/ball']; v.balls = ['k.objects/shards/ball']; return JSON.stringify(v); }
  if (p === 'k.objects/shards/owner-log.sop') return readFileSync(join(REPO, 'training/eval/owner-log-knowledge/crocodile.sop'), 'utf8');
  if (p === 'k.objects/shards/ball.sop') return BALL;
  const f = join(kdir, p); return existsSync(f) ? readFileSync(f, 'utf8') : null;
} };

for (const reasoner of ['matrix', 'ops']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), reasoner });
  engine.setKnowledge(createFacts({ source }));
  const session = async (setup = []) => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    for (const m of setup) await s.send(m);
    return s;
  };
  const objs = (s) => s.state()['art.draw'].objects;
  const say = async (s, text) => (await s.send(text)).text;

  test(`${reasoner}: a missing part says which parts the thing has, never "composite"`, async () => {
    const s = await session(['draw a crocodile']);
    const t = await say(s, 'make the wings of the crocodile red');
    assert.match(t, /no wing/);
    assert.match(t, /legs/);
    assert.doesNotMatch(t, /composite/i);
    assert.match(await say(s, 'make the legs of the crocodile black'), /black/);
    assert.equal(objs(s)[0].parts.legs, 'black');
  });

  test(`${reasoner}: take a house apart; the parts keep their place; one undo joins them`, async () => {
    const s = await session(['draw a house', 'make the roof blue']);
    const [house] = objs(s);
    const t = await say(s, 'take the house apart');
    assert.match(t, /apart/);
    const pieces = objs(s);
    assert.ok(pieces.length >= 4 && pieces.every((o) => o.kind === 'composite' && o.shape));
    assert.ok(pieces.every((o) => Math.abs(o.x - house.x) < house.size && Math.abs(o.y - house.y) < house.size), 'the pieces stay where the house was');
    const roof = pieces.find((o) => /^roof/.test(o.thing));
    assert.ok(roof && roof.y < house.y, 'the roof is above the middle of the house');
    assert.ok(roof.shape.parts.every((p) => /#0000ff/i.test(p.c)), 'the blue roof stays blue');
    // a piece is a thing of its own: it moves and is coloured alone
    await s.send('move the roof to the top right');
    await s.send('make the walls green');
    assert.ok(objs(s).find((o) => /^roof/.test(o.thing)).x > 600);
    await s.send('undo'); await s.send('undo');
    assert.match(await say(s, 'undo'), /took the house apart/);
    assert.deepEqual(objs(s).map((o) => o.kind), ['house']);
    assert.equal(objs(s)[0].parts.roof, 'blue');
  });

  test(`${reasoner}: separate one part of a thing`, async () => {
    const s = await session(['draw a car']);
    const t = await say(s, 'detach the wheels from the car');
    assert.match(t, /separated/);
    const all = objs(s);
    assert.equal(all.length, 2);
    assert.ok(all.some((o) => o.kind === 'car' && (o.hide ?? []).includes('wheels')));
    assert.ok(all.some((o) => /^wheels/.test(o.thing)));
    await s.send('undo');
    assert.deepEqual(objs(s).map((o) => o.kind), ['car']);
    assert.match(await say(s, 'separate the sails'), /no sail|not find/);
  });

  test(`${reasoner}: put things together, name the group, use it like any object`, async () => {
    const s = await session(['draw a red car', 'draw a tree']);
    const t = await say(s, 'put the car and the tree together as a convoy');
    assert.match(t, /convoy/);
    assert.equal(objs(s).length, 1);
    assert.equal(objs(s)[0].thing.split('~')[0], 'convoy');
    const x0 = objs(s)[0].x;
    await s.send('move the convoy to the left');
    assert.ok(objs(s)[0].x < x0);
    await s.send('make the convoy bigger');
    assert.ok(objs(s)[0].size > 400);
    await say(s, 'draw another convoy');
    assert.equal(objs(s).filter((o) => /^convoy/.test(o.thing)).length, 2);
    assert.match(await say(s, 'copy the convoy'), /copy/);
    assert.equal(objs(s).length, 3);
    // taking a group apart gives back what it was made of
    await s.send('delete the last convoy'); await s.send('delete the last convoy');
    const back = await say(s, 'take the convoy apart');
    assert.match(back, /car/);
    assert.deepEqual(objs(s).map((o) => o.kind).sort(), ['car', 'tree']);
    assert.equal(objs(s).find((o) => o.kind === 'car').color, 'red');
  });

  test(`${reasoner}: "this is a ..." names what was just drawn; "group them" needs things`, async () => {
    const s = await session(['draw 2 stars']);
    assert.match(await say(s, 'these are a constellation'), /constellation/);
    assert.equal(objs(s).length, 1);
    const empty = await session();
    assert.match(await say(empty, 'put these together'), /Which things/);
  });

  test(`${reasoner}: "3 different houses" differ in colour and size`, async () => {
    const s = await session(['draw 3 different houses']);
    const hs = objs(s);
    assert.equal(hs.length, 3);
    assert.equal(new Set(hs.map((o) => o.color)).size, 3);
    assert.equal(new Set(hs.map((o) => o.size)).size, 3);
    const plain = await session(['draw 3 houses']);
    assert.equal(new Set(objs(plain).map((o) => o.color)).size, 1);
    const suns = await session(['draw 3 varied suns']);
    assert.equal(new Set(objs(suns).map((o) => o.color)).size, 1, 'a sun keeps its colour');
    assert.equal(new Set(objs(suns).map((o) => o.size)).size, 3);
  });

  test(`${reasoner}: "a ball" comes from the catalog, not a red circle`, async () => {
    const s = await session(['draw a ball']);
    assert.equal(objs(s)[0].kind, 'composite');
    assert.equal(objs(s)[0].thing, 'ball');
    assert.match(await say(s, 'draw 2 blue balls'), /balls/);
    assert.equal(objs(s).length, 3);
    const t = await session(['draw a circle']);
    assert.equal(objs(t)[0].kind, 'circle');
  });
}
