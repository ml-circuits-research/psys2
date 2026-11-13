// KNOWLEDGE-BY-LOOKUP (spec 17): frames, the catalog lookup, and the dialog behaviour with a small in-memory catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts, lemmaCandidates } from '../src/knowledge/facts.mjs';

const FILES = {
  'vocab.json': JSON.stringify({ comet: ['k.objects/shards/sky', 'k.words/shards/co'], spider: ['k.words/shards/sp'], tree: ['k.commonsense/shards/core'], fish: ['k.commonsense/shards/core'], bird: ['k.commonsense/shards/core'] }),
  'k.objects/shards/sky.sop': [
    '@k.objects.comet k.objects.object name=comet',
    '@k.objects.comet.tail k.objects.part of=comet name=tail shape=triangle x=0 y=40 w=60 h=20 z=1 colour=white',
    '@k.objects.comet.head k.objects.part of=comet name=head shape=circle x=60 y=35 w=30 h=30 z=2 colour=grey',
  ].join('\n'),
  'k.words/shards/co.sop': '@k.words.comet.noun.1 k.words.sense word=comet pos=noun n=1 gloss="a small icy body that travels around the sun" core.source="t"',
  'k.words/shards/sp.sop': '@k.words.spider.noun.1 k.words.sense word=spider pos=noun n=1 gloss="a predatory arachnid with eight legs" core.source="t"',
  'k.commonsense/shards/core.sop': [
    '@k.commonsense.tree k.commonsense.thing name=tree at=forest made_of=wood size=large',
    '@k.commonsense.fish k.commonsense.thing name=fish at=water can=swim',
    '@k.commonsense.bird k.commonsense.thing name=bird at=sky can=fly can=sing',
  ].join('\n'),
};
const reads = [];
const source = { text: async (p) => { reads.push(p); return FILES[p] ?? null; } };

let engine;
const send = async (msg, tab) => {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s.send(msg);
};
test.before(async () => { engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } }); });

test('lemma candidates: plurals, no vocabulary', () => {
  assert.deepEqual(lemmaCandidates('Spiders'), ['spiders', 'spider']);
  assert.ok(lemmaCandidates('boxes').includes('box'));
  assert.ok(lemmaCandidates('cherries').includes('cherry'));
});

test('frames: the shape is read, any noun fits the slot', () => {
  const k = engine.interp.lang.know;
  assert.deepEqual(k('What is a blorp?'), { kind: 'define', slot: 'blorp' });
  assert.deepEqual(k("what's the moon"), { kind: 'define', slot: 'moon' });
  assert.deepEqual(k('how many legs does a spider have'), { kind: 'count', part: 'legs', slot: 'spider' });
  assert.deepEqual(k('how many wheels do bikes have?'), { kind: 'count', part: 'wheels', slot: 'bikes' });
  assert.deepEqual(k('what is a tree made of'), { kind: 'made', slot: 'tree' });
  assert.deepEqual(k('where does a fish live'), { kind: 'where', slot: 'fish' });
  assert.deepEqual(k('what can a bird do'), { kind: 'can', slot: 'bird' });
  assert.equal(k('draw a house'), null);
  assert.equal(k('what is two plus three times the number of days in a week'), null, 'a slot is at most three words');
});

test('catalog: a hit loads only the shards of the lemma, once', async () => {
  reads.length = 0;
  const cat = createFacts({ source });
  const th = await cat.thing('comets');
  assert.equal(th.name, 'comet');
  assert.deepEqual(th.loaded.sort(), ['k.objects/shards/sky', 'k.words/shards/co']);
  assert.equal(th.objects[0].parts.length, 2);
  assert.equal(await cat.thing('blorp'), null);
  assert.equal(cat.peek('blorp'), null);
  assert.equal(cat.peek('never-asked'), undefined);
  await cat.thing('comet');
  assert.equal(reads.filter((r) => r.endsWith('sky.sop')).length, 1, 'cached');
  assert.deepEqual(cat.countOf(await cat.thing('spider'), 'legs'), { n: 8, from: 'gloss' });
});

test('dialog without a catalog is unchanged', async () => {
  const r = await send('what is a blorp?');
  assert.doesNotMatch(r.text, /^I don't know what a blorp is/);
});

test('dialog with a catalog: the frame decides, the hit supplies the words', async () => {
  engine.setKnowledge(createFacts({ source }));
  try {
    let r = await send('what is a comet?');
    assert.match(r.text, /small icy body/);
    assert.equal(r.trace.discourse.meta.kind, 'knowledge');
    r = await send('what is a blorp?');
    assert.equal(r.text, "I don't know what a blorp is.");
    r = await send('what is a tree made of');
    assert.equal(r.text, 'A tree is made of wood.');
    r = await send('what can a bird do');
    assert.equal(r.text, 'A bird can fly and sing.');
    // a hit alone moves nothing: a message another world reads whole is not touched
    r = await send('how much is 2 plus 3');
    assert.equal(r.text, '2 plus 3 is 5.');
    r = await send('how many legs does a spider have?');
    assert.match(r.text, /8 legs/);
  } finally { engine.setKnowledge(null); }
});

test('drawing: a thing of the catalog is drawn from its parts; no hit is the plain refusal', async () => {
  engine.setKnowledge(createFacts({ source }));
  try {
    let r = await send('draw a comet', 'art.draw');
    assert.match(r.text, /I drew a (?:white )?comet/);
    r = await send('draw a blorp', 'art.draw');
    assert.equal(r.text, "I don't know how to draw a blorp yet.");
  } finally { engine.setKnowledge(null); }
});
