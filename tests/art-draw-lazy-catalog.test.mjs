import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, parseShard } from '../src/knowledge/catalog.mjs';
import * as scene from '../worlds/art.draw/scene.mjs';

// Lazy catalog objects (spec 07 section 7): shards read on demand are registered as drawable things; an object's own name wins over keywords; model-guessed part names are known.
const SHARD = `
@k.objects.a k.objects.object name=comet
@k.objects.a.p1 k.objects.part of=comet name=head named=model shape=circle x=10 y=10 w=40 h=40 z=1 colour=white rgb="#FFFFFF"
@k.objects.a.p2 k.objects.part of=comet name=tail kind=tail shape=polygon x=30 y=30 w=60 h=50 z=0 colour=blue rgb="#3366FF"
@k.objects.a.p2.1 k.objects.point part=$k.objects.a.p2 n=1 x=30 y=30
@k.objects.a.p2.2 k.objects.point part=$k.objects.a.p2 n=2 x=90 y=80
@k.objects.a.p2.3 k.objects.point part=$k.objects.a.p2 n=3 x=40 y=70
@k.objects.b k.objects.object name=lemonade
@k.objects.b.p1 k.objects.part of=lemonade name=glass shape=rectangle x=10 y=10 w=30 h=60 z=1 colour=yellow
@k.objects.c k.objects.object name=lemon
@k.objects.c.p1 k.objects.part of=lemon name=body shape=circle x=10 y=10 w=60 h=60 z=1 colour=yellow
@k.objects.b.word core.word text=lemon means=lemonade of=k.objects.object.name
`;

test('parseShard keeps named=model on a part', () => {
  const { objects } = parseShard(SHARD);
  assert.equal(objects.get('comet').find((p) => p.name === 'head').named, 'model');
  assert.equal(objects.get('comet').find((p) => p.name === 'tail').named, undefined);
});

test('an object name wins over the keyword of another object', async () => {
  const cat = createCatalog({ vocab: { lemon: ['k.objects/shards/x'] }, readShard: async () => SHARD });
  await cat.load('lemon');
  assert.equal(cat.thingOfWord('lemon'), 'lemon');
  assert.ok(cat.hasName('lemon'));
});

test('registerThings makes a loaded object a drawable kind; the vendored objects stay', () => {
  assert.equal(scene.isKind('composite:comet'), false);
  const { objects } = parseShard(SHARD);
  assert.deepEqual(scene.registerThings(objects, { star: 'comet' }), ['comet', 'lemonade', 'lemon']);
  assert.equal(scene.isKind('composite:comet'), true);
  assert.equal(scene.thingOfWord('star'), scene.thingOfWord('star'));
  const parts = scene.partsOf({ id: 'o1', kind: 'composite', thing: 'comet', x: 500, y: 350, size: 200, color: null, fill: 'crayon', rotation: 0, flip: false, parts: {} });
  assert.equal(parts.length, 2);
  assert.deepEqual(scene.registerThings(objects), [], 'a second registration adds nothing');
  assert.equal(scene.partGuessed('composite:comet', 'head'), true);
  assert.equal(scene.partGuessed('composite:comet', 'tail'), false);
});
