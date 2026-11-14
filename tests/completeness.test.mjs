// SPDX-License-Identifier: AGPL-3.0-only
// Completeness of readings and arbitration by coverage (spec 16 section 12, spec 20 "Arbitration by coverage"; Q15 items 2 and 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { annotateUnread, completeMode, completeSource, isIncomplete } from '../src/formalizer/completeness.mjs';
import { unreadBy, targetsOf } from '../src/formalizer/typed-world.mjs';
import { createRouter, setWorldChooser } from '../src/formalizer/routing.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

const tok = (w, i) => ({ kind: 'word', raw: w, lower: w.toLowerCase(), start: i, end: i + 1 });
const view = (s) => s.split(' ').map(tok);
const withEnv = async (name, value, run) => {
  const old = process.env[name];
  if (value == null) delete process.env[name]; else process.env[name] = value;
  try { return await run(); } finally { if (old === undefined) delete process.env[name]; else process.env[name] = old; }
};
const withMode = async (mode, run) => {
  const old = process.env.PSYS2_COMPLETE;
  if (mode == null) delete process.env.PSYS2_COMPLETE; else process.env.PSYS2_COMPLETE = mode;
  try { return await run(); } finally { if (old === undefined) delete process.env.PSYS2_COMPLETE; else process.env.PSYS2_COMPLETE = old; }
};

test('annotateUnread (heuristic source): a question word inside a free-text capture and the words a skip passes over are unread; dictation (rest) and clean readings are not', () => withEnv('PSYS2_COMPLETE_SRC', 'heuristic', () => {
  const v = view('what sound does a cow make what 7 plus 5');
  const m = (slots, skipped = []) => ({ pattern: { worldId: 'w1' }, view: v, slots, skipped });
  const a = m({ x: { class: 'words', tokens: [0, 7] } }), b = m({ x: { class: 'rest', tokens: [0, 7] } }), c = m({ n: { class: 'number', tokens: [8, 9] } }, [[1, 2]]);
  annotateUnread([a, b, c]);
  assert.deepEqual(a.unread, ['what', 'what']);
  assert.deepEqual(b.unread, []);
  assert.deepEqual(c.unread, ['sound']);
}));

test('annotateUnread (heuristic source): a word another world reads with its own slot is unread in a free-text capture (competition, not a word list)', () => withEnv('PSYS2_COMPLETE_SRC', 'heuristic', () => {
  const v = view('move the house left');
  const free = { pattern: { worldId: 'media.music' }, view: v, slots: { x: { class: 'words', tokens: [1, 3] } } };
  const typed = { pattern: { worldId: 'art.draw' }, view: v, slots: { dir: { class: 'lex.dir', tokens: [3, 4] } } };
  annotateUnread([free, typed]);
  assert.deepEqual(free.unread, ['house']);
  assert.deepEqual(typed.unread, []);
}));

test('the switch: hold by default (typed worlds, spec 16 section 13), off and ask are explicit; a variant is complete by construction', async () => {
  const seg = { unparsed: false, match: { unread: ['what'] } };
  assert.equal(await withMode(null, () => completeMode()), 'hold');
  assert.equal(await withEnv('PSYS2_COMPLETE_SRC', null, () => completeSource()), 'typed');
  assert.equal(await withMode('off', () => isIncomplete(seg)), false);
  assert.equal(await withMode('hold', () => isIncomplete(seg)), true);
  assert.equal(await withMode('ask', () => isIncomplete({ ...seg, variant: { via: 'near' } })), false);
});

const fake = (world, id, priority, unread, tier = 5) => ({ pattern: { id, worldId: world, priority, emit: '' }, literals: 2, skips: 0, order: 0, slots: {}, unread, tier, sub: 0 });

test('arbitration: coverage first, then the open tab, then priority (std.decide kind world); no unread words keeps the tiers', async () => {
  setWorldChooser(lib.choose);
  const route = (matches, ctx) => createRouter().route({ matches, context: ctx, scores: [], tokens: [] });
  const ctx = { tabWorld: 'tab.w', activeTab: 'tab' };
  await withMode('hold', () => {
    const r = route([fake('tab.w', 'p1', 50, ['house']), fake('other.w', 'p2', 10, [])], ctx);
    assert.equal(r.matches[0].pattern.worldId, 'other.w');
    assert.equal(r.decision.arbitration.by, 'coverage');
    const t = route([fake('tab.w', 'p1', 10, ['x']), fake('other.w', 'p2', 90, ['y'])], ctx);
    assert.equal(t.matches[0].pattern.worldId, 'tab.w', 'equal coverage: the open tab keeps the sentence whatever the priority');
    const n = route([fake('tab.w', 'p1', 10, []), fake('other.w', 'p2', 90, [])], ctx);
    assert.equal(n.matches[0].pattern.worldId, 'tab.w');
    assert.equal(n.decision.arbitration, undefined);
  });
  await withMode('off', () => {
    const r = route([fake('tab.w', 'p1', 50, ['house']), fake('other.w', 'p2', 10, [])], ctx);
    assert.equal(r.matches[0].pattern.worldId, 'tab.w', 'PSYS2_COMPLETE=off: the earlier order');
  });
});

test('typed unread: the slots of a reading are checked by the types of its world; a slot nobody typed, dictation and an open join are free', () => {
  const tw = { slots: new Map([['w.kind|name', { expects: 'name' }]]), known: new Set(['hat', 'beard']), lexicon: new Map(), args: { thing: 'phrase', place: 'place' }, open: new Set(['w.open|name']),
    fits: (target, text) => (/\b(what|makes)\b/.test(text) ? { ok: false } : { ok: true }) };
  const typedFor = (id) => (id === 'w' ? tw : null);
  const v = view('put the boxes in a circle');
  const req = (slots) => ({ pattern: { worldId: 'w', emit: '@{_} core.request action=w.place arg.thing=\\"{thing}\\" arg.place=\\"{place}\\"' }, view: v, slots });
  assert.deepEqual(targetsOf(req({}).pattern), { thing: 'w.place|thing', place: 'w.place|place' });
  assert.deepEqual(unreadBy(typedFor, req({ thing: { class: 'words', tokens: [2, 3] } })), ['boxes'], 'a thing that is not a kind of the world');
  assert.deepEqual(unreadBy(typedFor, req({ thing: { class: 'rest', tokens: [2, 3] } })), [], 'dictation is free');
  assert.deepEqual(unreadBy(typedFor, req({ place: { class: 'rest', tokens: [4, 6] } })), ['circle'], 'a place is checked even as rest');
  assert.deepEqual(unreadBy(typedFor, req({ thing: { class: 'words', tokens: [2, 3] } }), () => new Set(['boxes'])), [], 'a thing of the session is a known word');
  const stmt = { pattern: { worldId: 'w', emit: '@{_} w.kind name={a}' }, view: view('what makes'), slots: { a: { class: 'words', tokens: [0, 2] } } };
  assert.deepEqual(unreadBy(typedFor, stmt), ['makes'], 'a name the world refuses (fitsSlot)');
  assert.deepEqual(unreadBy(() => null, stmt), [], 'no typed world: nothing is unread');
});

test('typed worlds are built from typed.json with the library: kinds, keys, joined things, the avatar closed and the diagram (a reader) free', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  engine.sopworld = lib;
  const animals = engine.set.typedFor('kids.animals'), avatar = engine.set.typedFor('ui.avatar'), diagram = engine.set.typedFor('diagram.sketch');
  assert.ok(animals.counts.things > 100, 'the animals of k.animals are things of the typed world');
  assert.equal(lib.fitsSlot(animals, 'kids.animals.animal', 'legs', '4').ok, true);
  assert.equal(lib.fitsSlot(animals, 'kids.animals.animal', 'legs', 'four legs').ok, false);
  assert.ok(animals.open.has('kids.animals.animal|name'), 'animals can be taught: the join is open');
  assert.equal(avatar.args.thing, 'phrase');
  assert.ok(avatar.known.has('hat') && !avatar.known.has('boxes'));
  assert.deepEqual(diagram.args, {}, 'the diagram reads whole sentences itself (reader): its free text is not typed');
  assert.ok(engine.set.typedFor('ui.avatar', { things: [{ id: 'g1', label: 'guest Ann', kind: 'ui.avatar.guest', attrs: {} }] }), 'the session things are added at run time');
});

test('arbitration on typed worlds: "put the boxes in a circle" on the diagram tab is the diagram\'s (arrangement), not the avatar\'s; with PSYS2_COMPLETE=off the avatar still takes it', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  const world = (mode) => withMode(mode, async () => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'diagram' });
    const r = await s.send('put the boxes in a circle');
    return r.segments[0].match?.worldId;
  });
  assert.equal(await world('off'), 'ui.avatar');
  assert.equal(await world('hold'), 'diagram.sketch');
});

test('completeness end to end: an incomplete destructive reading is not executed (hold), and a clarifying ask replaces a half-read one (ask)', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  const say = (mode, tab, text) => withMode(mode, async () => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: tab });
    return s.send(text);
  });
  const off = await say('off', 'robot', 'remove the boxes from the face'), ask = await say('ask', 'robot', 'remove the boxes from the face');
  assert.doesNotMatch(off.text, /understood only part/);
  assert.match(ask.text, /I understood only part of .*I did not use "boxes"/, 'the half-read sentence is asked, not executed');
});

test('typed.json of every world is current (scripts/build-typed-worlds.mjs --check)', async () => {
  const { build } = await import('../scripts/build-typed-worlds.mjs');
  const { readFile } = await import('node:fs/promises');
  const files = await build();
  assert.ok(Object.keys(files).length >= 15);
  for (const [id, text] of Object.entries(files)) assert.equal(await readFile(new URL(`../worlds/${id}/typed.json`, import.meta.url), 'utf8').catch(() => null), text, `worlds/${id}/typed.json is stale: run node scripts/build-typed-worlds.mjs`);
});

test('the ensemble (PSYS2_ENSEMBLE, default on): the voices are pooled and the library decides (std.decide kind ensemble); off keeps the sequence', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  const senses = [{ id: 's1', type: 'k.words.sense', f: { word: ['possess'], pos: ['verb'], n: ['1'], synonym: ['have'] } }];
  engine.setKnowledge({ wires: async (type, { key } = {}) => senses.filter((r) => r.type === type && (key == null || [r.f.word?.[0], ...(r.f.synonym ?? [])].includes(key))), thing: async () => null, peek: () => undefined });
  const say = (v) => withEnv('PSYS2_ENSEMBLE', v, async () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'kids.animals' }); return s.send('A zebra possesses 4 legs.'); });
  try {
    const on = await say(null), off = await say('off');
    assert.match(on.text, /a zebra has 4 legs/i);
    assert.equal(on.segments[0].variant?.via, 'near');
    assert.deepEqual(on.segments[0].variant?.ensemble?.voices, ['near']);
    assert.equal(on.text, off.text);
    assert.equal(off.segments[0].variant?.ensemble, undefined);
  } finally { engine.setKnowledge(null); }
});

// CATCH-ALL readings (spec 16 section 13; owner export 2026-11-14 22:43: "deseneaza o diagrama in forma de casa" drew one circle, read by "{pre} diagram {post}" and called complete)
test('catch-all patterns: every world pattern whose captured arguments are only raw text (pre / post / rest) is listed, and a half-read catch-all is asked, not executed', async () => {
  const { isCatchAll } = await import('../src/formalizer/typed-world.mjs');
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const all = engine.set.list().flatMap((w) => (w.patterns ?? []).filter((p) => isCatchAll(p)).map((p) => p.id)).sort();
  for (const id of ['pat.diagram.sketch.read.frame', 'pat.diagram.sketch.read.frame.end', 'pat.diagram.sketch.read.frame.form', 'pat.diagram.sketch.read.frame.shaped', 'pat.diagram.sketch.read.own']) assert.ok(all.includes(id), id);
  assert.ok(!all.includes('pat.diagram.sketch.bare.mod'), 'a typed thing next to a leftover is not a catch-all (its leftover is still checked)');
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  const r = await s.send('Make a diagram of the glorbs in a quuxy way.');
  assert.match(r.text, /I understood only part of .*"glorbs" and "quuxy"/);
  assert.equal((s.state('diagram.sketch')?.shapes ?? []).length, 0, 'no default circle');
  const h = await s.send('Draw a diagram in house form.');
  assert.match(h.text, /in the shape of a house: 6 nodes on its outline/, 'the frame words are the own reader\'s (lex.diagram.sketch.shapedlike) and it reads the shape');
});
