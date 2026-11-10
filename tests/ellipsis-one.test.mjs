// ELLIPSIS: "and a yellow one" repeats the previous command with its noun and the new modifier (spec 03 section 1c, spec 05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { oneAnaphora } from '../src/formalizer/rules/expand.mjs';
import { tokenize } from '../src/formalizer/rules/normalize.mjs';

const rules = createTranslator();
const engine = await createEngine({ loader: createFsLoader(), translator: rules });
const ro = (t) => rules.translate(t, { from: 'ro', to: 'en' }).text;

async function draw(message, lang = 'en', tab = 'draw') {
  const s = engine.createSession({ language: lang });
  s.setWorldState('ui.shell', { activeTab: tab });
  const r = await s.send(message);
  return { r, objs: (s.state()['art.draw']?.objects ?? []).map((o) => `${o.kind}:${o.color ?? ''}`), status: (r.answers ?? []).map((a) => a.status) };
}

test('translator: Romanian elliptic "una/unul/alta + adjective" keeps the English ellipsis', () => {
  assert.equal(ro('fă o casă verde și una galbenă'), 'Make a green house and a yellow one');
  assert.equal(ro('desenează un cerc roșu și unul albastru'), 'Draw a red circle and a blue one');
  assert.equal(ro('desenează două pisici și una mare'), 'Draw 2 cats and a big one');
  assert.equal(ro('desenează o casă și încă una galbenă'), 'Draw a house and another yellow one');
  assert.equal(ro('desenează o casă și alta galbenă'), 'Draw a house and another yellow one');
});

test('oneAnaphora: forms, noun tail, class-aware modifiers, singular noun', () => {
  const opts = { leads: new Set(['a', 'an', 'another', 'one']), nouns: new Set(['one', 'ones']), sameClass: (a, b) => ['red', 'green', 'yellow'].includes(a) && ['red', 'green', 'yellow'].includes(b), isModifier: (w) => ['red', 'green', 'yellow', 'big'].includes(w), singular: (w) => w.replace(/s$/, '') };
  const first = (c, a) => oneAnaphora(tokenize(c), tokenize(a), opts)?.candidates[0].map((t) => t.lower).join(' ');
  assert.equal(first('a yellow one', 'draw a green house'), 'draw a yellow house');
  assert.equal(first('another yellow one', 'add a red circle'), 'add a yellow circle');
  assert.equal(first('one yellow', 'draw a house'), 'draw a yellow house');
  assert.equal(first('a big one', 'draw two cats'), 'draw a big cat');
  assert.equal(first('two big ones', 'draw two cats'), 'draw 2 big cats');
  assert.equal(first('a yellow one', 'draw a big green house'), 'draw a big yellow house');
  assert.equal(oneAnaphora(tokenize('a yellow house'), tokenize('draw a green house'), opts), null);
  assert.equal(oneAnaphora(tokenize('the red one'), tokenize('draw a green house'), opts), null);
});

test('Romanian: "fă o casă verde și una galbenă" draws both houses', async () => {
  const { r, objs, status } = await draw('fă o casă verde și una galbenă', 'ro');
  assert.deepEqual(objs, ['house:green', 'house:yellow']);
  assert.deepEqual(status, ['supported', 'supported']);
  assert.match(r.text, /casă galbenă/);
  assert.deepEqual((await draw('desenează două pisici și una mare', 'ro')).objs.length, 3);
});

test('English: draw / add / make with "and a <adj> one", "and another <adj> one", "and one <adj>"', async () => {
  assert.deepEqual((await draw('draw a green house and a yellow one')).objs, ['house:green', 'house:yellow']);
  assert.deepEqual((await draw('add a red circle and a blue one')).objs, ['circle:red', 'circle:blue']);
  assert.deepEqual((await draw('make a red circle and a blue one')).objs, ['circle:red', 'circle:blue']);
  assert.deepEqual((await draw('draw a house and another yellow one')).objs, ['house:', 'house:yellow']);
  assert.deepEqual((await draw('draw a house and one yellow')).objs, ['house:', 'house:yellow']);
  assert.equal((await draw('draw two cats and a big one')).objs.length, 3);
  assert.equal((await draw('draw two cats and two big ones')).objs.length, 4);
  assert.deepEqual((await draw('draw a circle and a red one and a blue one')).objs, ['circle:', 'circle:red', 'circle:blue']);
  const big = await draw('draw a big green house and a yellow one');
  assert.match(big.r.text, /big yellow house/);
});

test('"one" elsewhere is untouched', async () => {
  assert.equal((await draw('draw a house and a tree')).objs.length, 2);
  assert.equal((await draw('draw one house')).objs.length, 1);
});
