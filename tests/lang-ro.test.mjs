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
test('lang.ro: a verb with a diacritic suffix, with and without the diacritics, is analysed by the library alone (Q51 is fixed in sopworld >= 0.63; the host workaround is gone)', () => {
  assert.equal(ro.analyse('deseneaza', 'desenează').find((x) => x.pos === 'verb')?.entry.en, 'draw');
  assert.equal(ro.analyse('deseneaza', 'deseneaza').find((x) => x.pos === 'verb')?.entry.en, 'draw');
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
test('lang.ro replies with the article, made by the library from the catalog templates (no hand text)', () => {
  const reply = (t) => ro.replyRo(grammarRoEn(t, { lexicon: ro }).frame);
  assert.equal(reply('Desenează o casă roșie'), 'am desenat o casă roșie');
  assert.equal(reply('desenează un copac verde'), 'am desenat un copac verde');
  assert.equal(reply('șterge casa'), 'am șters casa');
  assert.equal(reply('fă casa roșie'), 'casa este acum roșie');
  assert.equal(reply('fă copacul albastru'), 'copacul este acum albastru');
  assert.equal(reply('desenează o casă'), null, 'no colour: outside the catalog template, the caller keeps its own reply');
  assert.equal(reply('desenează două case roșii'), null);
});
test('lang.ro: the UniMorph dictionary is a module of its own, loaded on request, and its rows have no sense', async () => {
  const big = await openLangRo({ unimorph: true });
  assert.ok(big.dictionary.byFolded('abac').length >= 1);
  assert.equal(ro.dictionary.byFolded('abac').length, 0);
  assert.equal(big.analyse('abacul', 'abacul').length, 0, 'no sense, no English: the grammar path does not use it');
  const glossed = await openLangRo({ unimorph: true, gloss: (lemma) => (lemma === 'abac' ? 'abacus' : null) });
  assert.equal(glossed.analyse('abacul', 'abacul')[0]?.entry.en, 'abacus');
});
test('lang.ro loads only the dictionary files its words need', () => {
  const fresh = ro.loaded();
  assert.ok(fresh.dictionaryFiles.length < 15);
});
