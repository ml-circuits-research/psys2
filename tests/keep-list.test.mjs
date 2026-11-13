import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { keepListOf, protectText, protectedTranslate } from '../src/translate/keep-list.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const keep = keepListOf(engine.set);

test('keep-list is derived from the worlds: currency, names, tabs, song titles', () => {
  assert.ok(keep.verbatim.includes('lei'));
  assert.ok(keep.verbatim.includes('twinkle twinkle'));
  assert.ok(keep.names.includes('maria'));
  assert.ok(keep.tabs.includes('documents'));
});

test('protect and restore: capital names, currency, titles, "the X tab"; verbs and lowercase words are left alone', () => {
  const rt = (t, extra = []) => { const p = protectText(t, keep, { extra }); return [p.text, p.restore(p.text)]; };
  assert.deepEqual(rt('A kite costs 5 lei'), ['A kite costs 5 Zorqa', 'A kite costs 5 lei']);
  assert.equal(rt('Maria has 3 apples')[1], 'Maria has 3 apples');
  assert.ok(rt('Maria has 3 apples')[0].startsWith('Zorqa'));
  assert.equal(rt('play twinkle twinkle')[0], 'play Zorqa');
  assert.equal(rt('open the Draw tab')[0], 'open the Zorqa tab');
  assert.equal(rt('draw a house')[0], 'draw a house');
  assert.equal(rt('my dog is called Fido', ['Fido'])[0], 'my dog is called Zorqa');
  assert.equal(rt('fido is here', ['Fido'])[0], 'fido is here');
});

test('protectedTranslate: restores, and falls back to the plain translation when a placeholder is lost', async () => {
  const calls = [];
  const good = protectedTranslate(async (t) => { calls.push(t); return `<${t}>`; }, () => ({ keep }));
  assert.equal(await good('5 lei', 'en', 'fr'), '<5 lei>');
  assert.equal(calls[0], '5 Zorqa');
  const lossy = protectedTranslate(async (t) => (t.includes('Zorq') ? 'cinq' : `plain:${t}`), () => ({ keep }));
  assert.equal(await lossy('5 lei', 'en', 'fr'), 'plain:5 lei');
});
