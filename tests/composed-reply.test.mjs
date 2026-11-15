// SPDX-License-Identifier: AGPL-3.0-only
// COMPOSED REPLIES (spec 06; reviewer 2026-11-15 03:15 item 2; live owner check row 1: "6 nod-zi pe schița sa, s-a alăturat în ordine" was the machine translator on a sentence the
// application composed). A reply with a frame (`say`) is said from the language world's template (w.lang.ro + src/lang/ro.local.mjs, std.morph realise) before any translator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, translateParts } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { openLangRo } from '../src/lang/ro.mjs';

test('composeRo: the templates of the act, the lemmas by sense, counts and agreement by realise; null outside them', async () => {
  const ro = await openLangRo();
  assert.equal(ro.composeRo({ act: 'diagram.shaped', roles: { thing: 'house', nodes: { n: 7, noun: 'node' } } }), 'Am desenat o diagramă în formă de casă: 7 noduri pe contur, unite în ordine.');
  assert.match(ro.composeRo({ act: 'diagram.shaped', roles: { thing: 'tree', nodes: { n: 20, noun: 'node' } } }), /: 20 de noduri pe contur/, '"de" from 20');
  assert.equal(ro.composeRo({ act: 'diagram.shaped.placed', roles: { thing: 'house', shapes: { n: 4, noun: 'shape' } } }), 'Am așezat cele 4 forme pe un contur în formă de casă, în sensul acelor de ceasornic, de sus.');
  const scene = ro.composeRo({ act: 'draw.scene', roles: { things: [{ n: 1, noun: 'sun', colour: 'yellow' }, { n: 2, noun: 'cloud' }, { n: 1, noun: 'house', colour: 'blue' }, { n: 2, noun: 'tree', colour: 'green' }, { n: 1, noun: 'bird', colour: 'blue' }], example: 'house', colour: 'blue' } });
  assert.equal(scene, 'Am desenat o scenă însorită pentru tine: un soare galben, 2 nori, o casă albastră, 2 copaci verzi și o pasăre albastră. Poți schimba orice, de exemplu „fă casa albastră”.');
  assert.equal(ro.composeRo({ act: 'diagram.shaped', roles: { thing: 'blorp', nodes: { n: 7, noun: 'node' } } }), null, 'a word with no lemma: not composed');
  assert.equal(ro.composeRo({ act: 'no.such.act', roles: {} }), null, 'no template: not composed');
});

test('translateParts: a part with a frame is composed before any translator (the machine one is not asked); a part without one is translated as before', async () => {
  let asked = 0;
  const machine = { fallbackMode: () => 'fallback', rules: createTranslator(), candidatesViaMT: async (text) => { asked++; return [{ text: 'MAȘINĂ ' + text }]; }, leftovers: () => [] };
  const say = { act: 'diagram.shaped', roles: { thing: 'house', nodes: { n: 7, noun: 'node' } } };
  const out = await translateParts([{ text: 'I drew a diagram in the shape of a house: 7 nodes on its outline, joined in order.', translate: true, say }], machine, 'ro');
  assert.equal(out.map((p) => p.text).join(''), 'Am desenat o diagramă în formă de casă: 7 noduri pe contur, unite în ordine.');
  assert.deepEqual(out.routes, ['composed']);
  assert.equal(asked, 0, 'the machine translator was not asked for a composed reply');
  const free = await translateParts([{ text: 'The sun is a star.', translate: true }], machine, 'ro');
  assert.equal(asked, 1, 'free text still goes to the translators');
  assert.match(free.map((p) => p.text).join(''), /^MAȘINĂ/);
});

test('a Romanian session: the owner\'s two turns are answered in composed Romanian, in both reasoners', async () => {
  for (const reasoner of ['ops', 'matrix']) {
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator(), ...(reasoner === 'matrix' ? { options: { reasoner } } : {}) });
    const d = engine.createSession({ language: 'ro' });
    d.setWorldState('ui.shell', { activeTab: 'diagram' });
    const r = await d.send('deseneaza o diagrama in forma de casa');
    assert.equal(r.text, 'Am desenat o diagramă în formă de casă: 7 noduri pe contur, unite în ordine.', reasoner);
    assert.equal(r.answers[0].text, 'I drew a diagram in the shape of a house: 7 nodes on its outline, joined in order.', `${reasoner}: the English stays the world's`);
    const s = engine.createSession({ language: 'ro' });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    const a = await s.send('deseneaza ceva random');
    assert.match(a.text, /^Am desenat o scenă însorită pentru tine: .+ și o pasăre albastră\. Poți schimba orice, de exemplu „fă casa albastră”\.$/, reasoner);
    const e = engine.createSession({ language: 'en' });
    e.setWorldState('ui.shell', { activeTab: 'diagram' });
    assert.equal((await e.send('Draw a diagram in house form.')).text, 'I drew a diagram in the shape of a house: 7 nodes on its outline, joined in order.', `${reasoner}: English unchanged`);
  }
});
