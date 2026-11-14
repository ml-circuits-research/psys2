// src/lang/ro.mjs: the catalog's language world w.lang.ro read with the library's std.morph (bundled copy, loaded lazily), and the grammar path using it (questions.md Q13).
// Romanian appears here only as data of the language world's tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openLangRo } from '../src/lang/ro.mjs';
import { grammarRoEn } from '../src/translate/grammar-ro.mjs';

const ro = await openLangRo();
test('lang.ro analyses a noun form to its lemma, features and the English of its sense', () => {
  const a = ro.analyse('casa', 'casa')[0];
  assert.equal(a.pos, 'noun'); assert.equal(a.entry.ro, 'casă'); assert.equal(a.entry.en, 'house'); assert.equal(a.def, true);
  const g = ro.analyse('copacului', 'copacului')[0];
  assert.equal(g.entry.en, 'tree'); assert.equal(g.gen, true);
});
const bareLib = await openLangRo({ workaround: false });
test('lang.ro: a verb with a diacritic suffix is analysed through the Q51 workaround, not by the library alone', () => {
  const plain = ro.analyse('deseneaza', 'desenează').find((x) => x.pos === 'verb');
  assert.equal(plain?.entry.en, 'draw');
  const bare = bareLib.analyse('deseneaza', 'desenează').find((x) => x.pos === 'verb');
  assert.equal(bare, undefined, 'the library 0.62 alone misses it (Q51); when this fails the workaround can be deleted');
});
test('lang.ro: a clitic hyphen is split off a verb', () => {
  const a = ro.analyse('arata-mi', 'arată-mi').find((x) => x.pos === 'verb');
  assert.equal(a?.enclitic, 'mi');
});
test('the grammar path reads with the words of w.lang.ro', () => {
  assert.equal(grammarRoEn('Desenează o casă roșie lângă un copac', { lexicon: ro }).text, 'draw a red house next to a tree.');
  assert.equal(grammarRoEn('fă casa roșie', { lexicon: ro }).text, 'make the house red.');
  assert.equal(grammarRoEn('Ce frumos e afară', { lexicon: ro }).ok, false);
});
test('lang.ro loads only the dictionary files its words need', () => {
  const fresh = ro.loaded();
  assert.ok(fresh.dictionaryFiles.length < 15);
});
