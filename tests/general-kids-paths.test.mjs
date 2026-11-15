// SPDX-License-Identifier: AGPL-3.0-only
// The kids plan (ADR-011): the real word-problem turns (r0194, r0195, r0201, r0541-r0543) and the real shop turns (r0598, r0599, r0622-r0624, r0626, r0627) are answered by the
// GENERAL worlds with the content kids worlds hidden: calc.story (the library's storyState) and plan.list (w.list v3, the catalog's shop frames, the library's listSums).
// Also: sentences in sequence (spec 03), {segment} as read, and the inflection slip of rule 4 (spec 16 section 14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sameStem } from '../src/formalizer/spell.mjs';
import { confidentTypo } from '../src/dialog/foreign-reading.mjs';

const HIDDEN = new Set(['kids.arith', 'kids.shop']);
const base = createFsLoader({ roots: [DEFAULT_ROOT] });
const loader = new Proxy(base, { get(t, k) { if (k === 'listWorlds') return async () => (await t.listWorlds()).filter((w) => !HIDDEN.has(w)); return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } });
const engine = await createEngine({ loader });
const session = (tab) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const worldsOf = (r) => [...new Set(r.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean))];
const say = (r) => r.trace?.replyEnglish ?? r.text;

test('word problems by storyState: one message, the story read in sequence (r0194, r0195, r0201)', async () => {
  let r = await session('robot').send('Tom has 15 apples. He gives 12 to Ana. How many apples does Tom have?');
  assert.deepEqual(worldsOf(r), ['calc.story']);
  assert.match(say(r), /Tom has 3 apples\.$/);
  r = await session('robot').send('Tom has 5 apples. He gives 8 to Ana. How many apples does Tom have?');
  assert.match(say(r), /Tom only had 5 apples, so Tom cannot give away 8\./);
  r = await session('robot').send('Tom has 10 bees. One flyes away. How many bee Tom has ?');
  assert.match(say(r), /Tom lost 1 bee\. Tom has 9 bees\./);
});

test('word problems across turns (r0541-r0543), and a bare word is no story (plan H7)', async () => {
  const s = session('robot');
  assert.match(say(await s.send('Tom has 10 bees.')), /10 bees/);
  assert.match(say(await s.send('One flyes away.')), /lost 1/);
  assert.match(say(await s.send('How many bee Tom has ?')), /\b9\b/);
  assert.ok(!worldsOf(await session('robot').send('Research')).includes('calc.story'));
});

test('the shop by listSums over w.list: the change, short money, a settled list, a price (r0598, r0599, r0622-r0624)', async () => {
  let r = await session().send('I want a puzzle and I pay 10 lei. What is the change?');
  assert.deepEqual(worldsOf(r), ['plan.list']);
  assert.match(say(r), /10 lei is not enough\. A puzzle costs 18 lei\./);
  r = await session().send('I want 2 pencils and I give the cashier 10 lei. How much change do I get?');
  assert.match(say(r), /Your change from 10 lei is 6 lei\./);
  const s = session('shop');
  assert.match(say(await s.send("I would like a ball and a pencil and pay with 20 lei. what's the change")), /Your change from 20 lei is 13 lei\./);
  assert.match(say(await s.send('how much does a pencil cost?')), /A pencil costs 2 lei\./);
  assert.match(say(await s.send('I want a puzzle and I pay 10 lei. What is the change?')), /10 lei is not enough\. A puzzle costs 18 lei\./, 'the paid list is settled: a new purchase');
  assert.deepEqual(s.state('plan.list').lists.map((l) => l.items.map((i) => i.text)), [['ball', 'pencil'], ['puzzle']]);
});

test('the shop declines what is not a list: a sum is not a price, "I want a red house" stays the drawing\'s', async () => {
  assert.ok(!worldsOf(await session().send('How much is 2 plus 2?')).includes('plan.list'));
  assert.deepEqual(worldsOf(await session('draw').send('I want a red house')), ['art.draw']);
});

test('rule 4: two inflected forms of one stem are an inflection slip, a word and its own stem are not', () => {
  assert.equal(sameStem('flyes', 'flies'), true);
  assert.equal(sameStem('beard', 'bear'), false);
  assert.equal(sameStem('cats', 'cat'), false);
  assert.equal(sameStem('hint', 'mint'), false);
  const known = (w) => ['flyes', 'flies', 'hint', 'mint'].includes(w);
  assert.equal(confidentTypo({ from: 'flyes', to: 'flies' }, known), true);
  assert.equal(confidentTypo({ from: 'hint', to: 'mint' }, known), false);
});
