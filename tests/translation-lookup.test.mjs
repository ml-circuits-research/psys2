// SPDX-License-Identifier: AGPL-3.0-only
// One source of Romanian -> English words (reviewer 2026-11-16 03:30; spec 05 "One lookup of the source words"): the open world's senses, the translator's entries, the dictionary,
// in that order; a word only the dictionary knows is translated, never left in Romanian; the other senses are candidates the reading chooses among.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/translate/index.mjs';
import { lookupRo, sensesRo } from '../src/translate/lexicon-ro.mjs';
import { gatherCandidates } from '../src/translate/candidates.mjs';

const tr = createTranslator();
const en = (t, o = {}) => tr.translate(t, { from: 'ro', to: 'en', ...o });

test('a word only the dictionary knows is translated like any other word (no Romanian left, nothing unknown)', () => {
  for (const [ro, re] of [['desenează o vilă', /^Draw a villa$/], ['pune copilul pe leagan', /on the swing$/], ['ai exagerat', /exaggerated/], ['rearanjează diagrama', /^Rearrange the diagram$/]]) {
    const r = en(ro);
    assert.match(r.text, re, ro);
    assert.deepEqual(r.unknown, [], ro);
  }
});

test('the lookup: the translator\'s reading first (every part of speech kept), then the dictionary\'s senses and lemmas; the open world\'s words first', () => {
  const rosie = lookupRo('roșie');
  assert.equal(rosie.length, 1, 'adjective and noun of the translator are one reading');
  assert.deepEqual(rosie[0].analyses.map((a) => a.pos).sort(), ['adj', 'noun']);
  assert.deepEqual(lookupRo('fata', { diaFree: true }).map((o) => [o.en, o.source]), [['girl', 'rules'], ['face', 'dictionary']]);
  assert.deepEqual(lookupRo('loc', { prefer: new Set(['seat']) }).map((o) => [o.en, o.source]), [['place', 'rules'], ['seat', 'world']], 'the translator\'s reading stays the default; the world\'s senses lead the others');
  assert.deepEqual(sensesRo('aseaza').map((s) => s.en), ['sit', 'arrange']);
  assert.deepEqual(lookupRo('zzqx'), []);
});

test('the translator reports the forms with several senses and takes the sense the caller chooses', () => {
  const r = en('muta fetita in fata casei');
  const amb = r.senses?.find((s) => s.key === 'fata');
  assert.ok(amb, 'fata has several senses');
  assert.deepEqual(amb.options, ['girl', 'face']);
  assert.match(en('muta fetita in fata casei', { senses: { fata: 'face' } }).text, /\bface\b/);
});

test('the candidates: one more rules candidate per other sense, after the default (a tie of the reading keeps the default)', async () => {
  const cands = await gatherCandidates('aseaza elementele', { from: 'ro', to: 'en', translator: { rules: tr }, machine: false });
  const i = cands.findIndex((c) => c.source === 'rules'), j = cands.findIndex((c) => c.source === 'rules-sense');
  assert.ok(i >= 0 && j > i, cands.map((c) => c.source).join(','));
  assert.ok(cands.some((c) => /arrange/i.test(c.text)) && cands.some((c) => /^Sit/.test(c.text)));
});

test('a dictation frame (a raw slot) is one reading: the translation without it is a candidate of its own, after it (reviewer 05:05: "scrie o scrisoare scurta despre o vila")', async () => {
  const t = 'scrie o scrisoare scurta despre o vila';
  const r = en(t);
  assert.ok(r.verbatim && /^Type o scrisoare/.test(r.text), r.text);
  assert.equal(en(t, { verbatim: false }).text, 'Write a short letter about a villa');
  const cands = await gatherCandidates(t, { from: 'ro', to: 'en', translator: { rules: tr }, machine: false });
  const i = cands.findIndex((c) => c.source === 'rules'), j = cands.findIndex((c) => c.source === 'rules-plain');
  assert.ok(i >= 0 && j > i, cands.map((c) => c.source).join(','));
  assert.ok(!en('scrie o poveste despre o vulpe').verbatim, 'a frame of its own (a kind of text) is no dictation');
});
