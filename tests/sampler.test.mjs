// SPDX-License-Identifier: AGPL-3.0-only
// RANDOM as a world (specs/25): the host side of sopworld std.sample. No generator of ours: the library draws, the host states the world and renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createSampler, engineSampler, realise } from '../src/dialog/sampler.mjs';

const engine = await createEngine({ loader: createFsLoader() });
const open = (tab) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };

test('without std.sample the adapter is unavailable and returns nothing (no local generator)', () => {
  const s = createSampler({}, { worldOf: () => null });
  assert.equal(s.available, false);
  assert.equal(s.dice({ worldId: 'x' }), null); assert.deepEqual(s.examples({ worldId: 'x' }), []); assert.deepEqual(s.actions({ worldId: 'x' }), []);
});

test('the vendored library has the sampler (0.59), and it is seeded', () => {
  assert.equal(typeof lib.sample, 'function');
  const s = open('draw'), sm = engineSampler(lib, engine, () => s);
  assert.ok(sm.available);
  const a = sm.dice({ worldId: 'art.draw', seed: 11 }), b = engineSampler(lib, engine, () => s).dice({ worldId: 'art.draw', seed: 11 });   // a fresh sampler: one sampler does not repeat a sentence it showed
  assert.ok(a?.text);
  assert.equal(a.text, b.text);
  assert.match(a.text, /^[A-Z][^<>{}$]*[.?]$/, 'a sentence, no placeholder');
});

test('the dice follows the state: a walk on the drawing board is executed every time, and it reaches things that exist', async () => {
  const s = open('draw'), sm = engineSampler(lib, engine, () => s);
  const acts = new Set();
  for (let i = 0; i < 12; i++) {
    const x = sm.dice({ worldId: 'art.draw', seed: 100 + i });
    assert.ok(x, `a sample at step ${i}`);
    acts.add(x.frame.action);
    const before = JSON.stringify(s.state('art.draw'));
    const r = await s.send(x.text);
    assert.ok(!/did not understand|did not catch|cannot talk about that/i.test(r.text), `${x.text} -> ${r.text}`);
    if (['make', 'remove', 'change', 'copy'].includes(x.frame.action)) assert.notEqual(JSON.stringify(s.state('art.draw')), before, x.text);
  }
  assert.ok(acts.has('make'));
  assert.ok(acts.size >= 3, [...acts].join(','));
});

test('acts the schema marks dice.not are never framed (they need words or a second thing)', () => {
  const sm = engineSampler(lib, engine, () => open());
  for (let seed = 0; seed < 40; seed++) {
    assert.ok(!/^Add an arrow/.test(sm.dice({ worldId: 'diagram.sketch', seed })?.text ?? ''), 'diagram: arrows need two shapes');
    assert.ok(!/^Add a (heading|paragraph|title|word|sentence)/.test(sm.dice({ worldId: 'docs.editor', seed })?.text ?? ''), 'editor: text kinds need their words');
  }
});

test('actions for a selected thing name acts that fit it, examples are three or four commands', async () => {
  const s = open('draw'); await s.send('Add a house.');
  const sm = engineSampler(lib, engine, () => s);
  const things = sm.thingsOf('art.draw');
  assert.equal(things.length, 1);
  const acts = sm.actions({ worldId: 'art.draw', thing: things[0].id, seed: 3 });
  assert.ok(acts.length >= 2 && acts.every((x) => x.frame.args.thing === things[0].id || x.frame.action === 'undo'), JSON.stringify(acts.map((x) => x.text)));
  const few = sm.examples({ worldId: 'art.draw', seed: 3 });
  assert.ok(few.length >= 3 && few.length <= 4, `${few.length}`);
});

test('every schema world publishes its referents from its state (thing= in schema.sop): charts, pins, documents, list numbers', async () => {
  const s = open('charts'); await s.send('Add a chart.', { language: 'en', formalizer: 'rules', tab: 'data.charts' });
  const refs = (w, st) => engine.set.list().find((y) => y.id === w).ops.referents({ state: st ?? s.state(w) ?? {} });
  assert.deepEqual(refs('data.charts').map((r) => `${r.kind}${r.n}`), ['chart1']);
  assert.ok(refs('docs.reader', { docs: [{ id: 'd1', title: 'Tale' }] }).some((r) => r.kind === 'document' && r.name === 'Tale'), 'the reader publishes its documents');
  assert.ok(refs('geo.map', { markers: [{ id: 'm1', name: 'Point 1' }], highlighted: [] }).some((r) => r.kind === 'pin' && r.n === 1));
  const ed = refs('docs.editor', { blocks: [{ id: 'b7', kind: 'list' }, { id: 'b9', kind: 'paragraph' }, { id: 'b12', kind: 'list' }] });
  assert.deepEqual(ed.map((r) => r.n), [1, 1, 2], 'list 2 is the second list, not the digits of an id');
});

test('roles come from knowledge: places, songs, scales, animals of the worlds, colours of k.values; no hand-written example', () => {
  const texts = (tab, world, n = 30) => { const s = open(tab), sm = engineSampler(lib, engine, () => s); const out = new Set(); for (let i = 0; i < n; i++) { const d = sm.dice({ worldId: world, seed: 500 + i }); if (d) out.add(d.text); } return [...out]; };
  assert.ok(texts('map', 'geo.map').some((t) => /^Show [A-Z]/.test(t)) && texts('map', 'geo.map').some((t) => /^How far is .+ from .+\?$/.test(t)), 'the map names places and asks distances');
  assert.ok(texts('music', 'media.music').some((t) => /^Play (the .+ scale|a .+ chord|[A-Z].+)\.$/.test(t)));
  assert.ok(texts('charts', 'data.charts').some((t) => /^Make a (bar|pie) chart of the legs of the .+\.$/.test(t)));
  assert.ok(texts('reader', 'docs.reader').some((t) => /^(Search for|Read section|Summarize section) /.test(t)));
});

test('undo only after a change of the dice itself and rarely; redo right after its own undo', async () => {
  const s = open('draw'), sm = engineSampler(lib, engine, () => s);
  assert.ok(!sm.dice({ worldId: 'art.draw', seed: 3 }) || sm.dice({ worldId: 'art.draw', seed: 3 }).frame.action !== 'undo', 'nothing to undo at the start');
  const acts = [];
  for (let i = 0; i < 60; i++) { const d = sm.dice({ worldId: 'art.draw', seed: 2000 + i }); if (!d) continue; acts.push(d.frame.action); await s.send(d.text, { language: 'en', formalizer: 'rules', tab: 'art.draw' }); }
  assert.ok(acts.filter((a) => a === 'undo').length <= 9, `undo at most about one in ten: ${acts.filter((a) => a === 'undo').length}`);
  acts.forEach((a, i) => { if (a === 'redo') assert.equal(acts[i - 1], 'undo', 'a redo follows the dice undo'); });
});

test('a schema `know=<list>[:<verb>]` is read for kinds and the executor publishes its lists', () => {
  const x = engine.set.list().find((y) => y.id === 'geo.map').ops.executor;
  assert.deepEqual(x.schema.kinds.place.know, [{ list: 'places', verb: 'show' }]);
  assert.ok(x.sampleKnowledge({ state: {} }).places.length > 100);
});

test('a frame without a sentence (a place is needed) is not rendered', () => {
  assert.equal(realise({ action: 'place', args: {} }, { kinds: {} }, new Map(), () => 'x'), null);
  assert.equal(realise({ action: 'ask', args: { thing: 't_0' } }, { kinds: {} }, new Map([['t_0', { id: 'o1' }]]), () => 'the house'), null, 'a question with no attribute has no form every world reads');
});
