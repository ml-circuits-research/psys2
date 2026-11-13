// SPDX-License-Identifier: AGPL-3.0-only
// meta.worlds (WORLD-OF-WORLDS, spec 19): the generated cards are not stale and stay small, the rules pick a world with a reason, a block is not outvoted, the
// encoder is one prior, a new world is added by its card alone, and the routing setting changes nothing by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { loadMetaWorlds } from '../src/dialog/meta-worlds.mjs';
import { createSymbolicRouter, rerankPrediction, normalizeRouting, ROUTINGS } from '../src/dialog/symbolic-router.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { generate, CARDS_FILE } from '../scripts/build-world-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const mw = await engine.prepareMeta();

test('the cards are generated, not stale (node scripts/build-world-cards.mjs --write)', async () => {
  assert.equal(readFileSync(CARDS_FILE, 'utf8'), await generate());
});

test('size gate: a card is a few lines, and the cards are a small part of what the worlds say', () => {
  const kb = readFileSync(CARDS_FILE, 'utf8');
  const cards = kb.split(/\n(?=@card\.)/).slice(1);
  assert.ok(cards.length >= 20);
  for (const c of cards) assert.ok(c.split('\n').filter((l) => l.trim()).length <= 40, c.slice(0, 40));
  let patterns = 0;
  for (const w of engine.set.list()) patterns += (w.raw?.patterns ?? '').length || 0;
  const bytes = (f) => { try { return readFileSync(path.join(ROOT, f), 'utf8').length; } catch { return 0; } };
  let all = 0;
  for (const w of engine.set.list()) all += bytes(`worlds/${w.id}/patterns.sop`);
  assert.ok(Buffer.byteLength(kb) < 0.05 * all, `the cards (${Buffer.byteLength(kb)} bytes) are under 5% of the patterns (${all} bytes)`);
});

test('meta.worlds is a module: not a tab, no patterns, no operations, never a candidate; its test passes', async () => {
  const w = engine.set.get('meta.worlds');
  assert.equal(w.tab ?? null, null);
  assert.equal(w.patterns.length, 0);
  assert.equal(w.operations.length, 0);
  assert.ok(!mw.worlds.includes('meta.worlds'));
  assert.deepEqual(engine.problems().filter((p) => String(p).includes('meta.worlds')), []);
  assert.deepEqual((await runWorldTests(engine, 'meta.worlds')).failed, []);
});

const live = (o = {}) => ({ active: null, running: [], asked: null, last: null, recent: [], scene: {}, ...o });

test('every vote has its rule and a reason in plain words', () => {
  const r = mw.route({ text: 'draw a red house', live: live({ active: 'art.draw' }) });
  assert.equal(r.ranked[0].world, 'art.draw');
  for (const x of r.ranked[0].reasons) { assert.ok(x.rule && x.say && !/[{}?]/.test(x.say), x.say); }
});

test('naming a world: a message that names the chess game is for chess whatever tab is open', () => {
  const d = mw.decide({ text: 'rotate the chess board', live: live({ active: 'art.draw' }) });
  assert.equal(d.world, 'games.chess');
  assert.match(d.ranked[0].reasons[0].say, /named the chess/);
});

test('a referent in a scene is strong evidence: "the crocodiles" on another tab are the drawing\'s', () => {
  const d = mw.decide({ text: 'move the crocodiles', live: live({ active: 'games.chess', scene: { 'art.draw': ['crocodile', 'house'] } }) });
  assert.equal(d.world, 'art.draw');
  assert.ok(d.ranked[0].reasons.some((x) => x.rule === 'referent' && /crocodile is in your drawing/.test(x.say)));
});

test('SCENE-NATURAL P1 is the first rule set: a piece without a verb continues the last action, and a world with nothing to continue is blocked', () => {
  const l = live({ active: 'art.draw', last: 'art.draw' });
  const r = mw.route({ text: 'the water', live: l, catalog: ['water'] });
  assert.equal(r.fragment, true);
  assert.equal(r.ranked[0].world, 'art.draw');
  assert.ok(r.ranked[0].reasons.some((x) => x.rule === 'followup'));
  assert.ok(r.blocked['diagram.sketch']?.some((b) => b.rule === 'nocontinuation'), 'a world that is not open, not last, not running cannot take a piece');
  assert.ok(!r.blocked['ui.shell'], 'the shell acts anywhere');
  // a world with a referent of the piece in its scene is not blocked
  const r2 = mw.route({ text: 'the crocodiles', catalog: ['crocodile'], live: live({ active: 'art.draw', last: 'art.draw', scene: { 'diagram.sketch': ['crocodile'] } }) });
  assert.ok(!r2.blocked['diagram.sketch']);
  // nothing said before: nothing to continue, nothing is blocked
  assert.equal(Object.keys(mw.route({ text: 'the water', catalog: ['water'], live: live({ active: 'art.draw' }) }).blocked).filter((x) => !x.startsWith('games.')).length, 0);
});

test('a world that needs something running cannot take a message that does not start it, and no encoder prior outvotes a block', () => {
  const l = live({ active: 'art.draw' });
  const move = mw.route({ text: 'knight to f3', live: l, prior: { 'games.chess': 1 } });
  assert.ok(move.blocked['games.chess']?.some((b) => b.rule === 'notrunning'));
  assert.ok(!move.ranked.some((x) => x.world === 'games.chess'), 'blocked, so not in the ranking, whatever the prior says');
  assert.ok(!mw.route({ text: 'knight to f3', live: live({ active: 'art.draw', running: ['games.chess'] }) }).blocked['games.chess']);
  assert.ok(!mw.route({ text: 'let us play chess', live: l }).blocked['games.chess'], 'a message that names or starts it is not blocked');
  assert.ok(!mw.route({ text: 'e4', live: live() }).blocked['games.chess'], 'with no tab open a move is how a game starts');
});

test('the encoder is one prior with a weight: it adds, and it never reaches a referent', () => {
  const l = live({ active: 'art.draw', scene: { 'art.draw': ['crocodile'] } });
  const withPrior = mw.route({ text: 'the crocodile please', live: l, prior: { 'kids.animals': 0.9, 'art.draw': 0.1 } });
  assert.equal(withPrior.ranked[0].world, 'art.draw');
  const e = withPrior.ranked.flatMap((x) => x.reasons).find((x) => x.rule === 'encoder');
  assert.ok(e && e.points <= mw.priorWeight);
  // with no other evidence the prior decides
  const only = mw.decide({ text: 'zzz qqq', live: live(), prior: { 'kids.arith': 0.8, 'kids.time': 0.2 } });
  assert.equal(only.world, 'kids.arith');
  assert.equal(mw.decide({ text: 'zzz qqq', live: live() }).world, null, 'no reason: asked, not guessed');
});

test('a new world is added by its card alone', async () => {
  const w = engine.set.get('meta.worlds');
  const extra = '\n@card.test.kites meta.worlds.card\n    core.source="test"\n    id=test.kites kind=tab run=none tab=kites\n    name=kite name=kites\n    act=fly act=launch\n    thing=string thing=tail\n';
  const set = { get: (id) => (id === 'meta.worlds' ? { raw: { ...w.raw, kb: w.raw.kb + extra } } : null) };
  const m2 = await loadMetaWorlds(set);
  assert.equal(m2.decide({ text: 'fly the kite', live: live({ active: 'art.draw' }) }).world, 'test.kites');
  assert.ok(m2.worlds.includes('test.kites') && !mw.worlds.includes('test.kites'));
});

test('the routing setting: dispatcher is the default, symbolic orders the matches of the rule formalizer by meta.worlds', async () => {
  assert.deepEqual(ROUTINGS, ['dispatcher', 'symbolic', 'symbolic+encoder']);
  assert.equal(normalizeRouting(undefined), 'dispatcher');
  assert.equal(normalizeRouting('nonsense'), 'dispatcher');
  assert.equal('routing' in sessionOptions(settingsForMode('rules'), { language: 'en' }), false, 'A is the default: the options are unchanged');
  const run = async (routing) => {
    const s = engine.createSession(sessionOptions({ ...settingsForMode('rules'), routing }, { language: 'en' }));
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    return s.send('draw a red house');
  };
  const a = await run('dispatcher'), b = await run('symbolic');
  assert.notEqual(a.trace.routing[0]?.router, 'meta.worlds');
  assert.equal(b.trace.routing[0]?.router, 'meta.worlds');
  assert.match(b.trace.routing[0].reason, /^because /);
  assert.equal(a.segments[0].world, b.segments[0].world);
});

test('rerankPrediction replaces the encoder proposals by the ranking and keeps them as `encoder`', () => {
  const pred = { text: 'draw a red house', segmentations: [{ score: 0, segments: [{ start: 0, end: 16, text: 'draw a red house', worlds: [{ world: 'kids.shapes', score: 0.6 }, { world: 'art.draw', score: 0.4 }] }] }] };
  rerankPrediction(pred, mw, { tabWorld: 'art.draw', states: {} }, { useEncoder: false });
  const p = pred.segmentations[0].segments[0];
  assert.equal(p.worlds[0].world, 'art.draw');
  assert.equal(p.encoder[0].world, 'kids.shapes');
  assert.match(p.routing.reason, /^because /);
});
