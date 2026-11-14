// SPDX-License-Identifier: AGPL-3.0-only
// Completeness of readings and arbitration by coverage (spec 16 section 12, spec 20 "Arbitration by coverage"; Q15 items 2 and 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { annotateUnread, completeMode, isIncomplete } from '../src/formalizer/completeness.mjs';
import { createRouter, setWorldChooser } from '../src/formalizer/routing.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

const tok = (w, i) => ({ kind: 'word', raw: w, lower: w.toLowerCase(), start: i, end: i + 1 });
const view = (s) => s.split(' ').map(tok);
const withMode = async (mode, run) => {
  const old = process.env.PSYS2_COMPLETE;
  if (mode == null) delete process.env.PSYS2_COMPLETE; else process.env.PSYS2_COMPLETE = mode;
  try { return await run(); } finally { if (old === undefined) delete process.env.PSYS2_COMPLETE; else process.env.PSYS2_COMPLETE = old; }
};

test('annotateUnread: a question word inside a free-text capture and the words a skip passes over are unread; dictation (rest) and clean readings are not', () => {
  const v = view('what sound does a cow make what 7 plus 5');
  const m = (slots, skipped = []) => ({ pattern: { worldId: 'w1' }, view: v, slots, skipped });
  const a = m({ x: { class: 'words', tokens: [0, 7] } }), b = m({ x: { class: 'rest', tokens: [0, 7] } }), c = m({ n: { class: 'number', tokens: [8, 9] } }, [[1, 2]]);
  annotateUnread([a, b, c]);
  assert.deepEqual(a.unread, ['what', 'what']);
  assert.deepEqual(b.unread, []);
  assert.deepEqual(c.unread, ['sound']);
});

test('annotateUnread: a word another world reads with its own slot is unread in a free-text capture (competition, not a word list)', () => {
  const v = view('move the house left');
  const free = { pattern: { worldId: 'media.music' }, view: v, slots: { x: { class: 'words', tokens: [1, 3] } } };
  const typed = { pattern: { worldId: 'art.draw' }, view: v, slots: { dir: { class: 'lex.dir', tokens: [3, 4] } } };
  annotateUnread([free, typed]);
  assert.deepEqual(free.unread, ['house']);
  assert.deepEqual(typed.unread, []);
});

test('the switch: off by default, hold and ask are explicit; a variant is complete by construction', async () => {
  const seg = { unparsed: false, match: { unread: ['what'] } };
  assert.equal(await withMode(null, () => completeMode()), 'off');
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

test('completeness end to end: an incomplete reading is not executed with PSYS2_COMPLETE=ask, and runs as before with off', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  const say = (mode) => withMode(mode, async () => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'music' });
    return s.send('Um what sound does a cow make what 7 plus 5');
  });
  const off = await say('off'), ask = await say('ask');
  assert.doesNotMatch(off.text, /understood only part/);
  assert.match(ask.text, /I understood only part of/);
  assert.match(ask.text, /What did you mean\?/);
});
