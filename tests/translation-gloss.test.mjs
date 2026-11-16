// SPDX-License-Identifier: AGPL-3.0-only
// Class A (reviewer 2026-11-15 10:10): a bad translation cannot sink a turn. Protect before translating (quotes, the word after a naming word), never read a non-translation
// (non-words), the dictionary gloss (with a typo repair against the same dictionary) and glossed candidates chosen by understanding. Invariants on a synthetic language where
// possible; the gloss itself on the bundled w.lang.ro (spec 05 "A bad translation cannot sink a turn").
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonWords, sourceResidue, glossCandidates, chooseCandidate, englishTest } from '../src/translate/candidates.mjs';
import { protectText, namerTest } from '../src/translate/keep-list.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const english = englishTest((w) => ['draw', 'move', 'the', 'a', 'circle', 'called', 'arrange', 'sit', 'elements', 'of', 'diagram', 'as', 'hexagon', 'you', 'have', 'items', 'like'].includes(w));

test('non-words: a word the translator made that is not English; names, input words and contractions are not', () => {
  assert.deepEqual(nonWords('Assate the elements of the diagram', 'aseaza elementele diagramei', english), ['Assate']);
  assert.deepEqual(nonWords('Draw a circle called gamma', 'xx yy numit gamma', english), []);   // a name after "called"
  assert.deepEqual(nonWords('Move Zorqa the circle', 'muta Zorqa', english), []);              // a placeholder
  assert.deepEqual(nonWords("You're the circle", 'xx', english), []);                          // a contraction
  assert.deepEqual(nonWords('Move alfa', 'xx', english, { kept: new Set(['alfa']) }), []);     // a thing of the open world
  assert.deepEqual(nonWords('You have exaggerated', 'xx', english, { glossed: [{ from: 'x', to: 'exaggerated' }] }), []);   // a gloss is English by construction
});

test('residue: a name after "called", a kept thing or a word no dictionary has is not a source word left over', () => {
  assert.deepEqual(sourceResidue('Draw a circle called gamma', 'xx un cerc numit gamma', english), []);
  assert.deepEqual(sourceResidue('Move alfa', 'muta alfa', english, { kept: new Set(['alfa']) }), []);
  assert.deepEqual(sourceResidue('Tenerife', 'tenerife', english, { isName: () => true }), []);
  assert.deepEqual(sourceResidue('Aseaza the items', 'aseaza elementele', english), ['Aseaza']);
});

test('glossed candidates: the kept word and the non-word at the same place get each sense; counts must agree', () => {
  const gloss = (w) => (/^aseaza$/i.test(w) ? [{ en: 'sit' }, { en: 'arrange' }] : []);
  const cands = [{ source: 'model', text: 'Assate the elements of the diagram as a hexagon' }, { source: 'rules', text: 'Aseaza the items of the diagram like a hexagon' }];
  const out = glossCandidates(cands, 'aseaza elementele diagramei ca un hexagon', { gloss, isEnglish: english });
  assert.deepEqual(out.map((c) => c.text), ['Sit the elements of the diagram as a hexagon', 'Arrange the elements of the diagram as a hexagon', 'Sit the items of the diagram like a hexagon']);
  assert.deepEqual(out[1].glossed, [{ from: 'Aseaza', to: 'arrange' }]);
  assert.equal(out[0].source, 'glossed-model');
  // two non-words, one kept word: no pairing is guessed
  const two = glossCandidates([{ source: 'model', text: 'Assate the resid' }, { source: 'rules', text: 'Aseaza the items' }], 'aseaza x', { gloss, isEnglish: english });
  assert.deepEqual([...new Set(two.map((c) => c.source))], ['glossed-rules']);
});

test('choice: a candidate with non-words loses to one without; the understood gloss wins', async () => {
  const cands = [{ source: 'model', text: 'Assate the elements of the diagram' }, { source: 'glossed-model', text: 'Sit the elements of the diagram', glossed: [{ from: 'aseaza', to: 'sit' }] }, { source: 'glossed-model', text: 'Arrange the elements of the diagram', glossed: [{ from: 'aseaza', to: 'arrange' }] }];
  const asked = [];
  const pick = await chooseCandidate(cands, 'aseaza elementele diagramei', { understand: async (t) => { asked.push(t); return { issues: /^arrange/i.test(t) ? 0 : 1 }; }, isEnglish: english });
  assert.equal(pick.chosen.text, 'Arrange the elements of the diagram');
  assert.equal(asked[0], 'Sit the elements of the diagram', 'clean candidates are read first');
  assert.ok(!asked.includes('Assate the elements of the diagram'), 'the first complete reading ends the choice');
  assert.deepEqual(pick.log[0].nonWords, ['Assate']);
});

test('protect: quoted text (into English) and the word after a naming word pass untranslated', () => {
  const tr = createTranslator();
  const isNamer = namerTest(tr);
  assert.equal(isNamer('numit', 'ro'), true);
  assert.equal(isNamer('cerc', 'ro'), false);
  assert.equal(isNamer('called', 'en'), true);
  const p = protectText('desenează un cerc numit gamma', null, { isNamer: (w) => isNamer(w, 'ro') });
  assert.equal(p.text, 'desenează un cerc numit Zorqa');
  assert.equal(p.restore('Draw a circle called Zorqa'), 'Draw a circle called gamma');
  const q = protectText('scrie „salut lume” acum', null, { quotes: true });
  assert.equal(q.found.length, 1);
  assert.equal(q.restore('write Zorqa now'), 'write „salut lume” now');
  assert.equal(protectText('scrie „salut lume”', null, {}).found.length, 0, 'replies keep their quoted examples translatable');
});

test('gloss (w.lang.ro): every sense of the lemma, inflected as the form; a typo repaired only when unambiguous', () => {
  const tr = createTranslator();
  assert.deepEqual(tr.glossWord('aseaza', 'ro').map((g) => g.en), ['sit', 'arrange']);
  assert.deepEqual(tr.glossWord('exagerat', 'ro').map((g) => g.en), ['exaggerated']);
  assert.deepEqual(tr.glossWord('elementele', 'ro').map((g) => g.en), ['items', 'elements'], 'the one lookup: the translator\'s entry, then the dictionary\'s sense');
  const punr = tr.glossWord('punr', 'ro');
  assert.equal(punr[0]?.en, 'put');
  assert.equal(punr[0]?.repaired, 'pune');
  assert.deepEqual(tr.glossWord('mukte', 'ro'), [], 'munte and multe are both near: no guess');
  assert.deepEqual(tr.glossWord('azuriu', 'ro').map((g) => g.en), ['blue'], 'azuriu is a word of the catalog since 7042ea70 (blue), never repaired into auriu (golden)');
  assert.ok(!tr.glossWord('leagă', 'ro').some((g) => g.lemma === 'leagăn'), 'leagă is not leagăn (swing): it is a form of a lega (link) since the catalog 7042ea70');
  assert.deepEqual(tr.glossWord('tenerife', 'ro'), []);
  assert.deepEqual(tr.glossWord('aseaza', 'xx'), [], 'a language with no dictionary has no gloss');
});
