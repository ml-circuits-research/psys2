// TALK tab (spec 18): the world `talk` (question frames, cards, topics, how do you know, honest scope), the card renderers and the board layout.
// A small in-memory catalog stands in for the real one: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { cardHtml, boardSvg, layoutBoard, drawingSvg, BOARD, esc } from '../worlds/talk/cards.mjs';
import tab, { CHIPS, mood } from '../docs/webchat/ui/tabs/talk.mjs';

const FILES = {
  'vocab.json': JSON.stringify({ comet: ['k.objects/shards/sky', 'k.words/shards/co'], spider: ['k.words/shards/sp'], elephant: ['k.commonsense/shards/core'], mouse: ['k.commonsense/shards/core'], lighthouse: ['k.objects/shards/buildings'], tail: ['k.words/shards/co'] }),
  'k.objects/shards/sky.sop': [
    '@k.objects.comet k.objects.object name=comet',
    '@k.objects.comet.tail k.objects.part of=comet name=tail shape=triangle x=0 y=40 w=60 h=20 z=1 colour=white',
    '@k.objects.comet.head k.objects.part of=comet name=head shape=circle x=60 y=35 w=30 h=30 z=2 colour=grey',
  ].join('\n'),
  'k.objects/shards/buildings.sop': [
    '@k.objects.lighthouse k.objects.object name=lighthouse',
    '@k.objects.lighthouse.tower k.objects.part of=lighthouse name=tower shape=rectangle x=30 y=20 w=40 h=70 z=1 colour=white',
    '@k.objects.lighthouse.lamp k.objects.part of=lighthouse name=lamp shape=circle x=35 y=5 w=30 h=20 z=2 colour=yellow',
    '@k.objects.lighthouse.part3 k.objects.part of=lighthouse name=part3 shape=rectangle x=0 y=90 w=100 h=10 z=0 colour=grey',
  ].join('\n'),
  'k.words/shards/co.sop': '@k.words.comet.noun.1 k.words.sense word=comet pos=noun n=1 gloss="a small icy body that travels around the sun" core.source="t"\n@k.words.tail.noun.1 k.words.sense word=tail pos=noun n=1 gloss="the rear part of an animal or a comet" core.source="t"',
  'k.words/shards/sp.sop': '@k.words.spider.noun.1 k.words.sense word=spider pos=noun n=1 gloss="a predatory arachnid with eight legs" core.source="t"',
  'k.commonsense/shards/core.sop': ['@k.commonsense.elephant k.commonsense.thing name=elephant size=huge at=savanna', '@k.commonsense.mouse k.commonsense.thing name=mouse size=small at=house'].join('\n'),
};
const source = { text: async (p) => FILES[p] ?? null };

let engine;
const session = () => { const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: 'talk' }); return s; };
test.before(async () => { engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } }); });

test('with the catalog: a thing is drawn from its parts, a plain sentence comes with the card', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  let r = await s.send('What is a comet?');
  assert.match(r.text, /small icy body/);
  assert.ok(r.effects.some((e) => e.name === 'talk.card'));
  const st = s.state('talk');
  assert.equal(st.cards[0].kind, 'drawing');
  assert.equal(st.cards[0].data.parts.length, 2);
  assert.equal(st.topics[0].name, 'comet');
  r = await s.send('What does a lighthouse look like?');
  assert.match(r.text, /a tower/);
  assert.doesNotMatch(r.text, /part3/, 'unnamed parts are never listed');
  r = await s.send('What are the parts of a lighthouse?');
  assert.deepEqual(s.state('talk').cards.at(-1).data.items.map((x) => x.name), ['tower', 'lamp']);
});

test('with the catalog: counts, bars, no fact', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  let r = await s.send('How many legs does a spider have?');
  assert.equal(r.text, 'A spider has 8 legs.');
  assert.deepEqual(s.state('talk').cards[0].data, { n: 8, label: 'legs', from: 'gloss' });
  r = await s.send('Which is bigger, a mouse or an elephant?');
  assert.equal(r.text, 'An elephant is bigger than a mouse.');
  const bars = s.state('talk').cards.at(-1);
  assert.equal(bars.kind, 'bars');
  assert.equal(bars.data.big, 1);
  const n = s.state('talk').cards.length;
  r = await s.send('What is a blorp?');
  assert.equal(r.text, "I don't know that yet.");
  assert.equal(s.state('talk').cards.length, n, 'no fact, no card');
  assert.ok(!r.effects.some((e) => e.name === 'talk.card'));
  r = await s.send('How many wings does a spider have?');
  assert.match(r.text, /not how many wings/);
  assert.equal(s.state('talk').cards.length, n);
});

test('lines: months, seasons, days, planets and what comes next', async () => {
  engine.setKnowledge(null);
  const s = session();
  let r = await s.send('What are the seasons?');
  assert.match(r.text, /Spring, Summer, Autumn and Winter/);
  r = await s.send('What comes after December?');
  assert.match(r.text, /January/);
  assert.equal(s.state('talk').cards.at(-1).data.mark, 0);
  r = await s.send('Which planet is before Mercury?');
  assert.match(r.text, /closest to the sun/);
  r = await s.send('What is the fifth month?');
  assert.match(r.text, /May/);
});

test('a topic hangs under the topic the user came from', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  await s.send('What is a comet?');
  await s.send('What is a tail?');   // a part of the comet just shown
  await s.send('What are the planets in order?');
  const t = s.state('talk').topics;
  assert.equal(t.find((x) => x.name === 'tail')?.parent, t.find((x) => x.name === 'comet').id);
  assert.equal(t.find((x) => x.name === 'planets')?.parent, null);
});

test('how do you know: a card from what the answer rested on, in plain words', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  let r = await s.send('How do you know?');
  assert.match(r.text, /not answered anything yet/);
  await s.send('How many legs does a spider have?');
  r = await s.send('How do you know?');
  assert.match(r.text, /I read your question as how many legs a spider has/);
  assert.match(r.text, /the word senses/);
  assert.doesNotMatch(r.text, /k\.words|shards/);
  const how = s.state('talk').cards.at(-1);
  assert.equal(how.kind, 'how');
  assert.deepEqual(how.data.steps.map((x) => x.label).slice(0, 5), ['You asked', 'I read it as', 'I looked in', 'I found', 'So I made']);
});

test('the topic board: what did we talk about, and the board effect', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  let r = await s.send('What did we talk about?');
  assert.match(r.text, /not talked about anything/);
  await s.send('What is a comet?');
  r = await s.send('Show the topic board.');
  assert.match(r.text, /comet/);
  assert.ok(r.effects.some((e) => e.name === 'talk.board'));
});

test('honest scope: a plain refusal with two nearest suggestions, no free chat', async () => {
  engine.setKnowledge(null);
  const s = session();
  const r = await s.send('tell me a joke about pirates');
  assert.match(r.text, /^I cannot talk about that here/);
  const chips = r.effects.find((e) => e.name === 'chat.suggest');
  assert.equal(chips.args.items.length, 2);
  const r2 = await s.send('What can we talk about?');
  assert.match(r2.text, /^I can talk about/);
  assert.ok(r2.effects.find((e) => e.name === 'chat.suggest').args.items.length >= 3);
});

test('every suggestion chip of the tab is read by the world', async () => {
  engine.setKnowledge(null);
  for (const chip of CHIPS) {
    const s = session();
    const r = await s.send(chip);
    assert.notEqual(r.statuses.at(-1), 'unparsed', chip);
    assert.ok(!/^I cannot talk about that here/.test(r.text), chip);
    assert.ok(r.answers.length, chip);
  }
});

test('the tab plugin declares its world, its effects and no network use', () => {
  assert.equal(tab.id, 'talk');
  assert.equal(tab.world, 'talk');
  assert.ok(tab.effects['talk.card'] && tab.effects['talk.board']);
});

test('card renderers: every kind draws, markup from the knowledge is escaped', () => {
  const parts = [{ name: '<b>x</b>', shape: 'circle', x: 10, y: 10, w: 40, h: 40, z: 1, colour: ['red'] }, { name: 'bad', shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, z: 0, colour: ['"><script>'], rgb: 'javascript:1' }];
  const svg = drawingSvg(parts);
  assert.ok(svg.includes('<ellipse') && svg.includes('<rect'));
  assert.ok(!svg.includes('<b>') && !svg.includes('<script') && !svg.includes('javascript'));
  assert.equal(esc('<&"\'>'), '&lt;&amp;&quot;&#39;&gt;');
  const kinds = [
    { kind: 'parts', thing: 'car', title: 'Car', data: { items: [{ name: 'wheel', n: 4 }, { name: 'door', n: 1 }, { name: 'roof', n: 1 }, { name: 'seat', n: 2 }] } },
    { kind: 'icons', thing: 'spider', title: 'Legs', data: { n: 8, label: 'legs' } },
    { kind: 'bars', thing: 'a', title: 'A and B', data: { bars: [{ label: 'Jupiter', value: 139820 }, { label: 'Mars', value: 6779 }], unit: 'km', big: 0 } },
    { kind: 'line', thing: 'months', title: 'Months', data: { items: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], mark: 2 } },
    { kind: 'how', thing: 'x', title: 'How', data: { steps: [{ label: 'You asked', text: '<i>q</i>' }] } },
  ];
  for (const c of kinds) { const h = cardHtml(c); assert.ok(h.length > 40, c.kind); assert.ok(!/<i>q/.test(h), c.kind); }
  assert.equal((cardHtml(kinds[1]).match(/<circle/g) ?? []).length, 8);
});

test('board layout: a tidy tree, no overlaps, parents beside their children', () => {
  const topics = [
    { id: 't1', name: 'Jupiter', parent: null }, { id: 't2', name: 'moons', parent: 't1' }, { id: 't3', name: 'Io', parent: 't2' }, { id: 't4', name: 'Europa', parent: 't2' },
    { id: 't5', name: 'bicycle', parent: null }, { id: 't6', name: 'wheel', parent: 't5' }, { id: 't7', name: 'ghost', parent: 'nope' }, { id: 't8', name: 'loop', parent: 't8' },
  ];
  const L = layoutBoard(topics);
  assert.equal(L.nodes.length, topics.length + 1, 'the root and every topic');
  const boxes = L.nodes.map((n) => [n.x, n.y, n.x + BOARD.nodeW, n.y + BOARD.nodeH]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${L.nodes[i].name} overlaps ${L.nodes[j].name}`);
  }
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  assert.ok(at.get('t3').x > at.get('t2').x && at.get('t2').x > at.get('t1').x);
  assert.equal(at.get('t7').parent, 'root', 'an unknown parent hangs under the root');
  assert.ok(L.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + BOARD.nodeW <= L.width && n.y + BOARD.nodeH <= L.height));
  assert.match(boardSvg(topics, 't2'), /tk-current/);
  assert.equal(layoutBoard([]).nodes.length, 1);
});

test('E-T1/E-T3 fixes: "and a X?" keeps one article and reaches the topic, a bare "bigger than X?" is the compare frame, "which planet is the third?" is read', async () => {
  engine.setKnowledge(createFacts({ source }));
  const s = session();
  await s.send('What is a comet?');
  let r = await s.send('and a lighthouse?');
  assert.equal(r.trace.discourse.resolved.rewritten, 'What is a lighthouse?');
  assert.match(r.text, /a tower/);
  assert.equal(s.state('talk').topics.find((t) => t.id === s.state('talk').current).name, 'lighthouse');
  r = await s.send('bigger than a mouse?');
  assert.match(r.text, /but not how big|bigger|same size/);
  r = await s.send('Which planet is the third from the sun?');
  assert.match(r.text, /third planet from the sun is Earth/);
  r = await s.send('Which month is the fifth?');
  assert.match(r.text, /May/);
});

test('E-T3 fixes: "and before it?" and "and the seasons?" on a line, "no, the other one" after a comparison', async () => {
  engine.setKnowledge(null);
  const s = session();
  await s.send('What comes after Mars?');
  let r = await s.send('and before it?');
  assert.equal(r.text, 'Earth comes before Mars.');
  r = await s.send('and the seasons?');
  assert.match(r.text, /Spring, Summer, Autumn and Winter/);
  await s.send('Is Earth bigger than Mars?');
  r = await s.send('no, the other one');
  assert.match(r.text, /^(?:Mars|Earth) is about [\d,]+ km across\.$/);
  r = await s.send('no, the other one');
  assert.match(r.text, /^(?:Mars|Earth) is about/);
});

test('avatar reactions (host hook): found is happy, not found is sad, a big number is surprising', async () => {
  engine.setKnowledge(null);
  const s = session();
  const m = async (q) => { const r = await s.send(q); return mood(r, r.text); };
  assert.equal(await m('What comes after Mars?'), 'happy');
  assert.equal(await m('What is a blorp?'), 'sad');
  assert.equal(await m('Is Jupiter bigger than Mars?'), 'surprised');
  assert.equal(tab.mood, mood);
  assert.equal(mood({ statuses: [] }, 'hello'), null);
});
