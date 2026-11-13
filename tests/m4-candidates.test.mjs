// SPDX-License-Identifier: AGPL-3.0-only
// M4: the English of a foreign message is chosen among candidates by understanding. Invariants only, on a synthetic language ("xx"): nothing here is per language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repairSource, sourceResidue, chooseCandidate, gatherCandidates, englishTest } from '../src/translate/candidates.mjs';

const english = englishTest((w) => ['draw', 'move', 'the', 'a', 'goat', 'house', 'left', 'girl', 'next', 'to', 'boy'].includes(w));
// a made-up source vocabulary: folded key -> surface forms with diacritics
const vocab = new Map([['deseneaza', ['desenează']], ['capra', ['capră']], ['casa', ['casă']], ['muta', ['mută', 'muta']]]);

test('residue: a kept source word is found, English words and names are not', () => {
  assert.deepEqual(sourceResidue('Desneaza a goat', 'desneaza o capra', english), ['Desneaza']);
  assert.deepEqual(sourceResidue('Draw a goat', 'desneaza o capra', english), []);
  assert.deepEqual(sourceResidue('Move Ana next to the boy', 'muta Ana langa baiat', english), []);
  assert.deepEqual(sourceResidue('draw "capra"', 'deseneaza "capra"', english), []);   // quoted text is the user's own
});

test('repair: missing diacritics and one near word, from the vocabulary only', () => {
  const r = repairSource('desneaza o capra', vocab, english);
  assert.equal(r.text, 'desenează o capră');
  assert.deepEqual(r.changes.map((c) => c.kind), ['near', 'diacritics']);
  assert.equal(repairSource('draw a house', vocab, english).changes.length, 0, 'English words are left alone');
  assert.equal(repairSource('xyzzy plugh', vocab, english).changes.length, 0, 'no near word, no guess');
  assert.equal(repairSource('muta', vocab, english).text, 'muta', 'ambiguous surface forms are not guessed');
});

test('choice: source-word candidates are out; the first one understood completely wins; ties go to the earlier (browser) one', async () => {
  const cands = [{ source: 'browser', text: 'Desneaza a goat' }, { source: 'model', text: 'Draw a goat' }, { source: 'rules', text: 'Make a goat' }];
  const asked = [];
  const understand = async (t) => { asked.push(t); return { issues: /^draw/i.test(t) ? 0 : 2 }; };
  const { chosen, log } = await chooseCandidate(cands, 'desneaza o capra', { understand, isEnglish: english });
  assert.equal(chosen.source, 'model');
  assert.match(log[0].rejected, /source words/);
  assert.ok(log[1].chosen && !log[0].chosen);
  assert.deepEqual(asked, ['Draw a goat'], 'the loop stops at the first complete reading');
  const tie = await chooseCandidate([{ source: 'browser', text: 'Move the girl' }, { source: 'model', text: 'Move a girl' }], 'x', { understand: async () => ({ issues: 1 }), isEnglish: english });
  assert.equal(tie.chosen.source, 'browser');
});

test('choice: when every candidate keeps source words the least bad is still read (the person gets an answer)', async () => {
  const cands = [{ source: 'rules', text: 'Move fetita linga a boy' }, { source: 'browser', text: 'Move fetita next to a boy' }];
  const { chosen } = await chooseCandidate(cands, 'muta fetita linga baiat', { understand: async () => ({ issues: 1 }), isEnglish: english });
  assert.equal(chosen.source, 'browser');
});

test('gather: every translator, one repaired candidate, no duplicates; a failing translator is just absent', async () => {
  const rules = { supports: () => true, translate: (t) => ({ text: t.replace('capră', 'goat').replace('desenează', 'draw'), alignment: [], unknown: [] }), sourceVocabulary: () => vocab, knownEnglish: (w) => english(w) };
  const translator = { rules, candidatesViaMT: async (t) => [{ source: 'browser', text: `B:${t}`, translation: { text: `B:${t}` } }, { source: 'model', text: `B:${t}`, translation: { text: `B:${t}` } }] };
  const out = await gatherCandidates('desneaza o capra', { from: 'xx', translator });
  assert.deepEqual(out.map((c) => c.source), ['browser', 'rules', 'repaired-browser']);   // the model's identical text is a duplicate
  const none = await gatherCandidates('x', { from: 'xx', translator: { candidatesViaMT: async () => { throw new Error('down'); } } });
  assert.deepEqual(none, []);
});

test('no interjection openers in draw replies', async () => {
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../src/dialog/index.mjs');
  const { createTranslator } = await import('../src/translate/index.mjs');
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  for (const t of ['draw a house', 'draw a sun', 'move the sun higher']) assert.doesNotMatch((await s.send(t)).text, /^[A-Za-z-]+! /, t);
});
