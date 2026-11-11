// SPDX-License-Identifier: AGPL-3.0-only
// SOPWORLD-1b item 2 holds in BOTH reasoners (specs 11 section 12, 15): refused statements, "No, ..." corrections, "why?" with the user's own
// sentences in order, the start of a count, unknown amounts, "which list", and the Romanian replies that were wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
const settings = settingsForMode('rules');
const engines = { ops: await engineWith('ops'), matrix: await engineWith('matrix') };
const say = async (e, lines, language = 'en') => {
  const s = e.createSession(sessionOptions(settings, { language }));
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  const out = [];
  for (const l of lines) out.push((await s.send(l, language === 'en' ? {} : { language })).text);
  return { s, out };
};

for (const [mode, e] of Object.entries(engines)) {
  test(`${mode}: a purchase the user cannot pay is said, not acknowledged, and does not happen`, async () => {
    const { out } = await say(e, ['I have 10 lei.', 'I buy a book.', 'How much money do I have?']);
    assert.equal(out[1], 'That does not add up. You only had 10 lei, so you cannot spend 12 lei.');
    assert.match(out[2], /10 lei/);
  });
  test(`${mode}: an impossible event is said with the count before it and nothing changes`, async () => {
    const { out } = await say(e, ['Tom has 5 apples.', 'Tom ate 2.', 'He eats 5.', 'How many apples does Tom have?']);
    assert.equal(out[2], 'That does not add up. Tom only had 3 apples, so Tom cannot eat 5.');
    assert.match(out[3], /Tom has 3 apples/);
  });
  test(`${mode}: "No, she gives him 4." replaces the gift${mode === 'matrix' ? ', "Undo" brings it back (ops has no undo by design)' : ''}`, async () => {
    const { out } = await say(e, ['Tom has 5 apples.', 'Ana gives him 3 apples.', 'No, she gives him 4.', 'How many apples does Tom have?', 'Undo that.', 'How many apples does Tom have?']);
    assert.match(out[2], /took that back/i);
    assert.match(out[3], /Tom has 9 apples/);
    if (mode === 'matrix') assert.match(out[5], /Tom has 8 apples/);
  });
  test(`${mode}: "Why?" names every told fact in order, in the user's words`, async () => {
    const { out } = await say(e, ['Tom has 5 apples.', 'Ana gives him 3 apples.', 'He eats 2.', 'How many apples does Tom have?', 'Why?']);
    const w = out[4];
    const at = ['"Tom has 5 apples"', '"Ana gives him 3 apples"', '"He eats 2"'].map((q) => w.indexOf(q));
    assert.ok(at.every((i) => i >= 0), w);
    assert.ok(at[0] < at[1] && at[1] < at[2], w);
  });
  test(`${mode}: the start of a count and an unknown amount`, async () => {
    assert.match((await say(e, ['Tom had some apples.', 'He ate 2 and now has 3.', 'How many apples did Tom have at first?'])).out[2], /Tom had 5 apples at first/);
    assert.match((await say(e, ['Tom has 5 apples.', 'Ana gives him some.', 'How many apples does Tom have?'])).out[2], /more than 5 apples/);
  });
  test(`${mode}: "Which list did you put it on?" says the list and that it was assumed`, async () => {
    const { out } = await say(e, ['Add milk to my list.', 'Which list did you put it on?']);
    assert.match(out[1], /assumed your to-do list/);
  });
  test(`${mode}: Romanian: "Pot cumpăra 2 mingi?" after statements is the speaker asking, and the money left is said in Romanian`, async () => {
    const a = await say(e, ['O minge costă 5 lei, iar eu am 12 lei. Pot cumpăra 2 mingi?'], 'ro');
    assert.match(a.out[0], /^OK, .*Da\. 2 mingi costă 10 lei și ai 12 lei\.$/);
    const b = await say(e, ['Am 20 de lei.', 'Cumpăr o minge.', 'Câți bani mai am?'], 'ro');
    assert.equal(b.out[2], 'Ți-au rămas 15 lei.');
  });
}
