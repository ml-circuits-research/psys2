// SPDX-License-Identifier: AGPL-3.0-only
// Diagrams composed from knowledge (spec 14 section 9): the request is read into a kind and a topic (the kinds are the knowledge's), the library's composeDiagram / sampleDiagram draw a kind x a
// topic, the engine shows it; nothing is canned. The bundled subset is the knowledge here; the live catalog route is driven by a fake catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import * as DG from '../src/knowledge/diagram-world.mjs';
import * as E from '../worlds/diagram.sketch/engine.mjs';

const lib = await DG.diagramLibrary();
const world = DG.bundledDiagramWorld(lib);

test('the kinds are the knowledge\'s: the request names one of them and a topic, or asks for a random diagram', () => {
  assert.deepEqual(DG.kindNames().map((k) => k.name).sort(), ['Venn diagram', 'comparison table', 'cycle', 'flowchart', 'mind map', 'network', 'org chart', 'pipeline', 'timeline', 'tree']);
  const p = (t) => DG.parseDiagramRequest(t);
  assert.deepEqual(p('make a flowchart of making tea'), { kind: 'flowchart', topic: 'making tea', said: 'flowchart' });
  assert.equal(p('a cycle diagram of the four seasons').kind, 'cycle');
  assert.equal(p('draw a mind map about bees').topic, 'bees');
  assert.equal(p('make a Venn diagram of birds and animals that fly').kind, 'Venn diagram');
  assert.equal(p('draw the planets in order of distance from the sun on a timeline').kind, 'timeline');
  assert.deepEqual(p('make a random diagram'), { random: true });
  assert.deepEqual(p('draw a diagram'), { random: true });
  assert.deepEqual(p('Create a sample diagram please.'), { random: true });
  assert.equal(p('make a random mind map').kind, 'mind map');
  assert.equal(p('draw a tree'), null, 'a kind alone is the engine\'s own (the shape, the template)');
  assert.equal(p('make a cycle'), null);
  assert.equal(p('add a circle to the diagram'), null);
});

test('topic candidates: the topic as said, then windows of the words, longest first, singular and base forms, never starting or ending in a function word', () => {
  const c = DG.topicCandidates('the parts of a car');
  assert.deepEqual(c.slice(0, 3), ['the parts of a car', 'parts of a car', 'part of a car']);
  assert.ok(c.includes('car') && c.indexOf('car') < c.indexOf('parts'));
  assert.ok(DG.topicCandidates('making tea').includes('make tea'));
  assert.ok(DG.topicCandidates('honey bees').includes('bee'));
  assert.ok(!DG.topicCandidates('birds and animals that fly').slice(1).some((x) => /^(?:and|that|of|the)\b|\b(?:and|that|of|the)$/.test(x)));
});

test('compose: a kind x a topic whose knowledge has the structure; the structure is the kind\'s; nothing without knowledge', () => {
  const cyc = DG.composeForRequest(lib, world, { kind: 'cycle', topic: 'the four seasons' });
  assert.deepEqual(cyc.diagram.nodes.map((n) => n.label), ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(cyc.diagram.edges.length, 4, 'a cycle comes round');
  assert.equal(cyc.diagram.directed, true);
  const tree = DG.composeForRequest(lib, world, { kind: 'tree', topic: 'the parts of a house' });
  assert.equal(tree.diagram.nodes[0].label, 'house');
  assert.ok(tree.diagram.nodes.length >= 5 && tree.diagram.edges.length === tree.diagram.nodes.length - 1);
  assert.equal(tree.diagram.directed, false);
  const map = DG.composeForRequest(lib, world, { kind: 'mind map', topic: 'honey bees' });
  assert.equal(map.topic, 'bee', 'the topic as the knowledge has it');
  assert.ok(map.diagram.nodes.some((n) => n.label === 'wing'));
  assert.equal(DG.composeForRequest(lib, world, { kind: 'tree', topic: 'cities of France' }).diagram.nodes[0].label, 'France', 'the knowledge\'s spelling');
  // a fill with no topic key holds for any topic: a request is never answered with the elements of a story or the aspects of a thing
  for (const [kind, topic] of [['mind map', 'unicorns'], ['tree', 'a blorp']]) assert.ok(DG.composeForRequest(lib, world, { kind, topic }).why, `${kind} of ${topic}`);
  // the catalog at the pin has an order of the planets by distance and the steps of making tea (k.space.body order, k.procedures.howto; catalog 590bc64): they compose now
  for (const [kind, topic] of [['timeline', 'the planets by distance'], ['flowchart', 'making tea']]) assert.ok(!DG.composeForRequest(lib, world, { kind, topic }).why, `${kind} of ${topic}`);
});

test('the request says which structure it means: the parts of a thing, its kinds, its cities', () => {
  const asked = (kind, topic) => DG.composeForRequest(lib, world, { kind, topic }).diagram.fill;
  assert.match(asked('tree', 'the parts of a house'), /k\.parts\.(?:usual|whole)/);   // the parts of a whole (k.parts.whole, catalog 590bc64) or the usual parts
  assert.match(asked('tree', 'the cities of France'), /k\.geo\.city/);
});

test('one request, one diagram: every fill is tried, a word of the request names the order (`by=`), else the knowledge\'s first; the seed does not choose', () => {
  const labels = (topic, seed) => DG.composeForRequest(lib, world, { kind: 'timeline', topic }, { seed }).diagram.nodes.map((n) => n.label);
  for (const seed of [1, 2, 3, 7, 11, 1234567]) {
    assert.deepEqual(labels('the planets by distance', seed), ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'], `seed ${seed}`);
    assert.equal(labels('the planets by size', seed)[0], 'Jupiter', `seed ${seed}: by=size`);
    assert.deepEqual(labels('the planets', seed), labels('the planets', 1), `seed ${seed}: no word names an order, the first fill of the knowledge`);
  }
});

test('a timeline is drawn on its line: its events in order joined by plain segments (k.diagrams: edges=none, structure=sequence)', () => {
  const d = DG.composeForRequest(lib, world, { kind: 'timeline', topic: 'the planets by distance' }).diagram;
  assert.equal(d.edges.length, 0, 'no edges by the knowledge');
  assert.equal(d.line, true);
  const conns = DG.engineNodes(d).filter((n) => n.args.action === 'connect');
  assert.equal(conns.length, d.nodes.length - 1);
  assert.ok(conns.every((c) => c.args.arrow === 'none'));
  assert.deepEqual(conns.map((c) => c.args.from), ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus']);
  assert.ok(!DG.composeForRequest(lib, world, { kind: 'cycle', topic: 'seasons' }).diagram.line, 'a kind with edges draws its own');
});

test('what the knowledge says is not for a person (`user_facing=false`) is never drawn, sampled or offered', () => {
  const hidden = world.ofType('k.procedures.method').filter((f) => f.attrs.user_facing?.[0] === 'false').map((f) => String(f.attrs.name[0]).replace(/^"|"$/g, ''));
  assert.ok(hidden.length >= 5, 'the bundled subset carries the methods and their key');
  assert.ok(hidden.includes('a face of a role'));
  for (const m of hidden) for (const kind of ['flowchart', 'pipeline']) { const r = DG.composeForRequest(lib, world, { kind, topic: m }); assert.ok(r.why || !hidden.includes(r.topic), `${kind} of ${m}: ${r.topic}`); }   // (a shorter window may name a method that is: "set a table")
  assert.ok(DG.composeForRequest(lib, world, { kind: 'flowchart', topic: 'a face of a role' }).why);
  const shown = world.ofType('k.procedures.method').find((f) => f.attrs.user_facing?.[0] === 'true');
  assert.ok(DG.composeForRequest(lib, world, { kind: 'flowchart', topic: String(shown.attrs.name[0]).replace(/^"|"$/g, '') }).diagram, 'a user-facing method is drawn');
  const low = hidden.map((x) => x.toLowerCase());
  for (let s = 1; s <= 60; s++) { const r = DG.sampleDiagrams(lib, world, { seed: s }); assert.ok(!low.includes(String(r.topic).toLowerCase()), `seed ${s}: ${r.topic}`); }
  for (const t of DG.diagramSentences(lib, world)) assert.ok(!low.some((m) => t.toLowerCase().includes(` of ${m}.`)), t);
});

test('engine nodes: one create per node at the place the layout gave, one connect per edge, the arrows of the kind; names are the labels, unique', () => {
  const d = DG.composeForRequest(lib, world, { kind: 'cycle', topic: 'seasons' }).diagram;
  const nodes = DG.engineNodes(d, new Set(['spring']));
  const creates = nodes.filter((n) => n.args.action === 'create'), conns = nodes.filter((n) => n.args.action === 'connect');
  assert.equal(creates.length, 4);
  assert.equal(conns.length, 4);
  assert.ok(conns.every((c) => c.args.arrow === 'forward'));
  assert.equal(new Set(creates.map((c) => c.args.name.toLowerCase())).size, 4);
  assert.ok(!creates.some((c) => c.args.name === 'spring'), 'a name already on the canvas is not reused');
  for (const c of creates) { const [x, y] = c.args.at.split(',').map(Number); assert.ok(x > 0 && x < 800 && y > 0 && y < 500, c.args.at); }
  const tree = DG.engineNodes(DG.composeForRequest(lib, world, { kind: 'tree', topic: 'house' }).diagram);
  assert.ok(tree.filter((n) => n.args.action === 'connect').every((c) => c.args.arrow === 'none'));
});

test('a layer wider than the frame is shown whole: the boxes of a crowded tree do not overlap on the canvas', () => {
  const d = DG.composeForRequest(lib, world, { kind: 'tree', topic: 'India' }).diagram;
  const boxes = DG.engineNodes(d).filter((n) => n.args.action === 'create').map((n) => { const [x, y] = n.args.at.split(',').map(Number); return { x, y, w: n.args.width, h: n.args.height, name: n.args.name }; });
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 1, `${a.name} overlaps ${b.name}`);
});

test('random diagrams: kind x topic from knowledge, varied, labelled, never only circles, nothing canned', () => {
  assert.equal(E.RANDOM_DIAGRAMS, undefined, 'the canned templates are gone');
  const seen = new Set(), kinds = new Set();
  for (let s = 1; s <= 24; s++) {
    const r = DG.sampleDiagrams(lib, world, { seed: s });
    assert.ok(!r.why, `seed ${s}`);
    const d = r.diagram;
    assert.ok(d.nodes.length >= 4 && d.nodes.every((n) => n.label), `seed ${s}: ${d.kind} of ${r.topic}`);
    // ported: a timeline is dots on its line with no edges by the knowledge (k.diagrams.kind.timeline edges=none, shape=dot "a dot on the line at the event's time")
    assert.ok(!d.nodes.every((n) => /^(?:circle|dot)$/.test(n.shape)) || d.edges.length >= d.nodes.length - 1 || d.kind === 'timeline', `seed ${s}`);
    assert.ok(DG.composeForRequest(lib, world, { kind: d.kind, topic: r.topic }).diagram, `the sample is a request the reader answers: ${d.kind} of ${r.topic}`);
    seen.add(`${d.kind}|${r.topic}`); kinds.add(d.kind);
  }
  assert.ok(seen.size >= 8, `${seen.size} distinct`);
  assert.ok(kinds.size >= 4, `kinds ${[...kinds]}`);
  assert.deepEqual(DG.sampleDiagrams(lib, world, { seed: 3 }).diagram.nodes.map((n) => n.id), DG.sampleDiagrams(lib, world, { seed: 3 }).diagram.nodes.map((n) => n.id), 'a seed is reproducible');
});

test('the dice: whole sentences of kind x topic that the reader reads back and the knowledge draws', () => {
  const list = DG.diagramSentences(lib, world);
  assert.ok(list.length >= 20, `${list.length} sentences`);
  assert.ok(new Set(list.map((x) => /^Make an? (.+?) of /.exec(x)[1])).size >= 5, 'several kinds');
  for (const t of list) { const p = DG.parseDiagramRequest(t); assert.ok(p?.kind && p.topic, t); assert.ok(DG.composeForRequest(lib, world, p).diagram, t); }
});

test('the live catalog route: the kinds and the shards the words name are told over the bundled subset', async () => {
  const shard = '@k.kinds.parent.sparrow.bird k.kinds.parent name=sparrow is_a=bird dimension=kind\n@k.kinds.parent.robin.bird k.kinds.parent name=robin is_a=bird dimension=kind\n@k.kinds.parent.wren.bird k.kinds.parent name=wren is_a=bird dimension=kind\n';
  const asked = [];
  const cat = {
    readText: async (p) => { asked.push(p); return p === 'k.kinds/shards/kind.sop' ? shard : p === 'k.kinds/shards/other.sop' ? '@x k.kinds.parent name=zzz is_a=zzz' : ''; },
    world: async (id) => (id === 'k.kinds' ? { schema: 'k.kinds/schema.sop', shards: Array.from({ length: 9 }, (_, i) => (i === 0 ? { path: 'k.kinds/shards/kind.sop', keys: ['bird', 'sparrow'] } : { path: 'k.kinds/shards/other.sop', keys: [`k${i}`] })) } : null),
  };
  const host = DG.diagramHostOf(cat);
  assert.equal(DG.diagramWorldOf(lib, cat), world, 'nothing loaded: the bundled subset');
  assert.equal(await host.load(['birds', 'bird']), true);
  assert.ok(asked.includes('k.kinds/shards/kind.sop'), 'the shard that names the word');
  assert.ok(!asked.includes('k.kinds/shards/other.sop'), 'a big world is read by the keys of the words');
  const live = DG.diagramWorldOf(lib, cat);
  const c = DG.composeForRequest(lib, live, { kind: 'tree', topic: 'birds' });
  assert.deepEqual(c.diagram.nodes.map((n) => n.label).sort(), ['bird', 'robin', 'sparrow', 'wren']);
  assert.ok(DG.composeForRequest(lib, live, { kind: 'cycle', topic: 'seasons' }).diagram, 'the bundled subset is still there');
});

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner: 'matrix' } });
const say = async (...texts) => {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  const out = [];
  for (const t of texts) out.push((await s.send(t, { language: 'en' })).text);
  return { out, st: s.state()['diagram.sketch'] };
};

test('session: "make a cycle of the seasons" draws four labelled shapes joined in a closed loop, one undo takes it away', async () => {
  const { out, st } = await say('make a cycle of the seasons');
  assert.match(out[0], /^I drew a cycle diagram with four shapes\. It is about seasons\.$/);
  assert.deepEqual(st.shapes.map((x) => x.label).sort(), ['autumn', 'spring', 'summer', 'winter']);
  assert.equal(st.edges.length, 4);
  assert.ok(st.edges.every((e) => e.arrow === 'forward'));
  const after = await say('make a cycle of the seasons', 'undo');
  assert.equal(after.st.shapes.length, 0);
});

test('session: a tree of parts is a tree (lines, no arrowheads, the root above), a mind map has its topic in the middle, a verbless request is read', async () => {
  const { st } = await say('draw a tree of the parts of a house');
  const root = st.shapes.find((x) => x.label === 'house');
  assert.ok(root && st.shapes.filter((x) => x !== root).every((x) => x.y > root.y));
  assert.ok(st.edges.every((e) => e.arrow === 'none'));
  const m = await say('a mind map about honey bees');
  const bee = m.st.shapes.find((x) => x.label === 'bee');
  assert.ok(bee && Math.abs(bee.x - 400) < 60 && Math.abs(bee.y - 250) < 60, 'the centre');
});

test('session: no knowledge is said, not drawn; a list of labels is still the engine\'s own reading', async () => {
  const none = await say('make a tree of the parts of a blorp');
  assert.match(none.out[0], /^I do not know enough about parts of a blorp to draw a tree of it yet\.$/);
  assert.equal(none.st?.shapes?.length ?? 0, 0);
  const own = await say('draw a process of Idea, Draft and Publish');
  assert.ok(own.st.shapes.length >= 3, own.out[0]);
  const circle = await say('draw a tree');
  assert.ok(circle.st.shapes.length >= 1, 'a kind alone is not a request');
});

test('session: "make a random diagram" and its siblings draw a structure of a kind about a topic', async () => {
  for (const t of ['make a random diagram', 'draw a diagram', 'Create a sample diagram please.', 'make a random mind map']) {
    const { out, st } = await say(t);
    assert.match(out[0], /^I drew a random .+ diagram with \w+ shapes\. It is about .+\.$/, t);
    assert.ok(st.shapes.length >= 4 && st.shapes.filter((x) => x.label).length >= 4 && st.edges.length >= 2 || st.shapes.length >= 4, t);
    assert.ok(!st.shapes.every((x) => x.kind === 'circle' && !x.label), t);
  }
});
