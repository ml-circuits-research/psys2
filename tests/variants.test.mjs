// SPDX-License-Identifier: AGPL-3.0-only
// Reading steps for unparsed clauses (spec 16 section 10): near words, alternations and slot types; the world decides; all or nothing; one switch per step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const session = (tab) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
/** A catalog that only knows some word senses and alternations (the shapes of k.words and w.lang.en). */
const facts = (rows) => ({ wires: async (type, { key } = {}) => rows.filter((r) => r.type === type && (key == null || [r.f.word?.[0], ...(r.f.synonym ?? [])].includes(key))), thing: async () => null, peek: () => undefined });
const SENSES = [{ id: 's1', type: 'k.words.sense', f: { word: ['possess'], pos: ['verb'], n: ['1'], synonym: ['have'] } },
  { id: 's2', type: 'k.words.sense', f: { word: ['own'], pos: ['verb'], n: ['1'], synonym: ['have'] } }];

test('near words: an unknown verb that the word senses make a synonym of "have" is read as it, and the world accepts the reading', async () => {
  engine.setKnowledge(facts(SENSES));
  try {
    const s = session('kids.animals');
    const r = await s.send('A zebra possesses 4 legs.');
    assert.match(r.text, /a zebra has 4 legs/i);
    assert.equal(r.segments[0].variant?.via, 'near');
    assert.equal(r.segments[0].variant?.as, 'have');
  } finally { engine.setKnowledge(null); }
});

test('near words: without the catalog nothing changes (the clause stays unread)', async () => {
  const r = await session('kids.animals').send('A zebra possesses 4 legs.');
  assert.ok(r.segments[0].unparsed);
});

test('near words: the switch PSYS2_NEAR=off skips the step', async () => {
  engine.setKnowledge(facts(SENSES));
  process.env.PSYS2_NEAR = 'off';
  try { const r = await session('kids.animals').send('A zebra possesses 4 legs.'); assert.ok(r.segments[0].unparsed); } finally { delete process.env.PSYS2_NEAR; engine.setKnowledge(null); }
});

test('all or nothing: a word with no near word the worlds know stays unread', async () => {
  engine.setKnowledge(facts(SENSES));
  try { const r = await session('kids.animals').send('A zebra frobnicates 4 legs.'); assert.ok(r.segments[0].unparsed); } finally { engine.setKnowledge(null); }
});

test('alternations: with no w.lang.en.alternation rule in the catalog the step does nothing (the rules are knowledge, never ours)', async () => {
  engine.setKnowledge(facts([]));
  try { const r = await session('kids.animals').send('Could you please say that a zebra has 4 legs?'); assert.ok(r.segments.some((x) => x.unparsed) || !r.segments.some((x) => x.variant?.via === 'alternation')); } finally { engine.setKnowledge(null); }
});
