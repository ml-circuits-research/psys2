// SPDX-License-Identifier: AGPL-3.0-only
// SUGGESTION CHIPS FROM WHAT COMES NEXT (spec 25; owner export 2026-11-14 22:43, finding 5: the chip "Add a weapon." after a sunny scene with a house and a dog). The chips (modes few /
// actions) name what the catalog's scenes put with the kinds in the picture (k.scenes.has), never a random lemma of the catalog's vocabulary; the dice (mode one) still draws from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { engineSampler } from '../src/dialog/sampler.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

const has = (scene, thing) => ({ type: 'k.scenes.has', f: { scene: [scene], thing: [thing] } });
const SCENES = { farm: ['house', 'dog', 'tree', 'barn', 'cow', 'fence'], park: ['tree', 'dog', 'bench', 'duck'], armoury: ['sword', 'weapon', 'shield'] };
const WIRES = new Map();
for (const [sc, ts] of Object.entries(SCENES)) { WIRES.set(sc, ts.map((t) => has(sc, t))); for (const t of ts) WIRES.set(t, [...(WIRES.get(t) ?? []), has(sc, t)]); }
const VOCAB = Object.fromEntries([...new Set(Object.values(SCENES).flat()), 'rocket', 'cannon'].map((w) => [w, ['k.objects/shards/x']]));
const knowledge = { peekWiresBy: (type, key) => (type === 'k.scenes.has' ? WIRES.get(key) : undefined), peekVocab: () => VOCAB, wires: async () => [] };

test('art.draw: the chips name the things the scenes of the picture have (ranked by the kinds they share), the dice the whole vocabulary', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const ex = engine.set.get('art.draw').ops.executor;
  const state = { objects: [{ id: 'o1', kind: 'house' }, { id: 'o2', kind: 'dog' }, { id: 'o3', kind: 'tree' }] };
  const chips = ex.sampleKnowledge({ state, knowledge, mode: 'actions' }).things;
  assert.deepEqual(chips.slice(0, 3).sort(), ['a barn', 'a cow', 'a fence'].sort(), 'the farm shares three kinds with the picture');
  assert.ok(chips.includes('a bench') && chips.includes('a duck'), 'the park shares two');
  assert.ok(!chips.some((x) => /weapon|sword|cannon|rocket/.test(x)), `no thing outside the picture's scenes: ${chips}`);
  const dice = ex.sampleKnowledge({ state, knowledge, mode: 'one' }).things;
  assert.ok(dice.includes('a rocket'), 'the dice draws from the vocabulary');
  assert.deepEqual(ex.sampleKnowledge({ state: { objects: [] }, knowledge, mode: 'actions' }).things, [], 'an empty picture has no next step');
});

test('the sampler: with next-step knowledge the chips offer it instead of the built-in nouns; a turn prefetches what the next chips read (never awaited by the turn)', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const asked = [];
  engine.setKnowledge({ ...knowledge, wires: async (type, { key }) => { asked.push(`${type}:${key}`); return WIRES.get(key) ?? []; } });
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  await s.send('draw a house and a dog');
  await s._nextPrefetch;
  assert.ok(asked.includes('k.scenes.has:house') && asked.includes('k.scenes.has:farm'), `the kinds, then their scenes: ${asked}`);
  const sm = engineSampler(lib, engine, () => s);
  const makes = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) for (const x of sm.sample('actions', { worldId: 'art.draw', count: 5, seed })) if (x.frame.action === 'make') makes.push(x.text);
  assert.ok(makes.length > 0, 'some chips add a thing');
  const next = new Set(Object.values(SCENES).slice(0, 2).flat().map((t) => `Add a ${t}.`));
  assert.ok(makes.every((t) => next.has(t) || /sky|ground|lake|sea/.test(t)), `every added thing comes from the picture's scenes: ${makes}`);
});
