// RD5: the session language comes from strong evidence, and a reply is fully Romanian or left in English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine, translateParts } from '../src/dialog/index.mjs';
import { createTranslator, languageEvidence } from '../src/translate/index.mjs';
import { sampled } from './helpers.mjs';

const rules = createTranslator();
const engineWith = (detect) => createEngine({ loader: createFsLoader(), translator: { ...rules, detectLanguage: detect ?? rules.detectLanguage } });
const guessRo = async () => ({ lang: 'ro', confidence: 0.9 });   // a browser detector that calls everything Romanian

test('evidence: English with a typo is strongly English, clear Romanian is strongly Romanian', () => {
  for (const t of ['eys express fear', 'make bigger eyes', 'look suprised', 'hello there']) assert.equal(languageEvidence(t).strongEn, true, t);
  for (const t of ['fa ochii mari', 'desenează o casă', 'Câte mere are Ion?', 'arată-mi un bărbat', 'fa un grafic', 'fa ochi visatori']) assert.equal(languageEvidence(t).strongRo, true, t);
  for (const t of ['e', 'ok', 'casa mare', 'ochi mari']) { const e = languageEvidence(t); assert.equal(e.strongEn, false, t); assert.equal(e.strongRo, false, t); }
});

test('a browser guess of Romanian does not flip an English message with a typo', async () => {
  const s = (await engineWith(guessRo)).createSession({ language: 'auto' });
  assert.equal((await s.send('eys express fear')).lang, 'en');
  assert.equal((await s.send('look suprised')).lang, 'en');
});

test('a weak Romanian reading switches the session only when it repeats; a strong one at once', async () => {
  const e = await engineWith(guessRo);
  const weak = e.createSession({ language: 'auto' });
  assert.equal((await weak.send('casa mare')).lang, 'en');
  assert.equal((await weak.send('casa mare')).lang, 'ro');
  const strong = e.createSession({ language: 'auto' });
  assert.equal((await strong.send('fa ochii mari')).lang, 'ro');
  assert.equal((await strong.send('make bigger eyes')).lang, 'en', 'a clearly English message goes back to English');
});

test('LANG-FIXED: a session set to Romanian reads every message as Romanian, even an English one (no per-message detection)', async () => {
  const s = (await engineWith()).createSession({ language: 'ro' });
  for (const text of ['eys express fear', 'ok', 'stop', 'play little star']) {
    const r = await s.send(text);
    assert.equal(r.lang, 'ro', text);
    assert.equal(r.switchedLanguage, undefined, text);
  }
});

test('translateParts: all or nothing', async () => {
  const parts = [{ text: 'Ta-da! ', translate: true }, { text: 'I drew a house.', translate: true }];
  const ok = await translateParts([{ text: 'I drew a house.', translate: true }], rules, 'ro');
  assert.equal(ok.map((p) => p.text).join(''), 'Am desenat o casă.');
  const partlyKnown = [{ text: 'Nice! I drew a house.', translate: true }, { text: ' ', translate: false }, { text: '"x"', translate: false, example: true, en: '"English example"', incomplete: true }];
  const out = await translateParts(partlyKnown, rules, 'ro');
  assert.equal(out.map((p) => p.text).join(''), 'Nice! I drew a house. "English example"', 'the whole reply stays English');
  void parts;
});

test('Romanian replies are never mixed (sample of the Romanian operational set)', async () => {
  const e = await engineWith();
  const cases = sampled(readFileSync(new URL('../training/eval/operational-ro.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((_, i) => i % 6 === 0), { key: (c) => c.message });
  const mixed = [];
  for (const c of cases) {
    const s = e.createSession({ language: 'auto' });
    if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
    for (const m of c.setup ?? []) await s.send(m, { language: 'en' });
    const r = await s.send(c.message, { language: 'auto' });
    if (r.lang !== 'ro') continue;
    const unquote = (t) => t.replace(/"[^"]*"|„[^”]*”/g, '');   // the user's own quoted words stay as typed
    const body = unquote(r.text);
    if (body === unquote(r.trace.replyEnglish)) continue;   // left in English as a whole: allowed
    if (/\b(the|you|your|is|my|I|did|could|can|what|how|and|with|have|has)\b/.test(body)) mixed.push(`${c.message} -> ${r.text}`);
  }
  assert.deepEqual(mixed, []);
});

// Slice 6 (coordinator): every reply of the request door reaches a Romanian session in Romanian, through its reply facts (w.lang.ro reply rows, src/lang/ro.local.mjs while the catalog
// lacks them) or the translators sentence by sentence: never English, not even as a whole. Properties through Session.send; the person's own words and the kinds the dictionary has no
// word for are quoted.
test('the request door: every reply of a Romanian session is Romanian (acts, questions, capabilities, undo / redo, praise, honest replies)', async () => {
  const e = await engineWith();
  const s = e.createSession({ language: 'ro' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const english = [];
  for (const m of ['desenează o pădure', 'ce este în desen?', 'câți copaci sunt?', 'fă copacii roșii', 'mută copacii la stânga', 'anulează', 'refă', 'frumos', 'ce poți face aici?', 'desenează un unicorn zburător', 'șterge desenul', 'anulează casa', 'mută copacul']) {
    const r = await s.send(m, { language: 'ro' });
    const body = r.text.replace(/"[^"]*"|„[^”]*”/g, '');
    if (/\b(the|you|your|is|my|I|did|could|can|what|how|and|with|have|has|added|removed|moved|assumed|there|nothing|undid)\b/.test(body)) english.push(`${m} -> ${r.text}`);
  }
  assert.deepEqual(english, []);
});
