// RO-TRANSLATE-FALLBACK (spec 06 "Translator as a fallback"): the rules and templates read and write first; the on-device Translator (here the table fake of
// scripts/lib/fake-browser-apis.mjs behind the same switch translator the webchat worker uses) is the bounded safety net, in both directions, and a
// Romanian session never shows English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, translateParts } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator, createRemoteBackend } from '../docs/webchat/ui/translation.mjs';
import { createFakeTranslation } from '../scripts/lib/fake-browser-apis.mjs';

const base = createTranslator();
const fake = createFakeTranslation();
/** The rules translator as if its Romanian tables knew nothing (so every Romanian message needs the fallback) and its English replies failed for text outside the templates. */
function weakRules({ ro = true, en = false } = {}) {
  return {
    ...base,
    translate: (text, o) => {
      if (ro && o?.from === 'ro') return { text, alignment: [], unknown: [{ word: text, span: [0, text.length] }], notes: [], confidence: 0.1 };
      if (en && o?.from === 'en') return { text, alignment: [], unknown: [{ word: text, span: [0, text.length] }], notes: [], confidence: 0 };
      return base.translate(text, o);
    },
  };
}
function backendOf(translate, { kind = 'translator' } = {}) {
  return { translatorKind: () => kind, detectorKind: () => null, translate, detect: async () => [], prepare: async () => {}, state: () => 'ready' };
}
const okBackend = (calls = []) => backendOf(async (t, f, to) => { calls.push({ t, f, to }); return fake.translate(t, f, to); });
const mk = (rules, backend, strategy = 'auto') => createSwitchTranslator({ rules, backend, getStrategy: () => strategy });

async function session(translator, reasoner = 'matrix') {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator, reasoner });
  return engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'ro' }));
}

for (const reasoner of ['matrix', 'ops']) {
  test(`input: a Romanian message the rules do not understand is read through the Translator (${reasoner})`, async () => {
    const calls = [];
    const tr = mk(weakRules(), okBackend(calls));
    const s = await session(tr, reasoner);
    await s.send('mă cheamă Ana', { language: 'ro' }).catch(() => {});
    for (const [msg, re, en] of [
      ['câți ani am?', /age|ani|vârst/i, 'How old am I?'],
      ['cum mă numesc?', /./, 'What is my name?'],
      ['deschide jocul de ghicit', /Ghicește/, 'Open the guess the animal tab.'],
      ['e ora 25', /oră|ora/i, "It is 25 o'clock."],
      ['deschide magazinul', /cumpărături/, 'Open the shopping list.'],
    ]) {
      const r = await s.send(msg, { language: 'ro' });
      assert.equal(r.lang, 'ro', msg);
      assert.equal(r.trace.via, 'translator-in', `${msg} -> ${r.text}`);
      assert.equal(r.trace.english, en, msg);
      assert.match(r.text, re, `${msg} -> ${r.text}`);
      assert.ok(r.segments.every((g) => !g.unparsed), `${msg} still has an unparsed clause`);
    }
    assert.ok(calls.some((c) => c.f === 'ro' && c.to === 'en'));
    assert.ok(tr.usage.some((u) => u.via === 'translator-in' && u.strategy === 'browser-api'));
  });
}

test('input: when the rules understand, the Translator is never asked (rules first)', async () => {
  const calls = [];
  const tr = mk(base, okBackend(calls));
  const s = await session(tr);
  const r = await s.send('mă cheamă Ana', { language: 'ro' });
  assert.match(r.text, /Ana/);
  assert.equal(r.trace.via, undefined);
  assert.deepEqual(calls.filter((c) => c.f === 'ro'), []);
});

test('input: a Translator that is absent, switched off, wrong or late leaves the rules reading and never throws', async () => {
  const cases = [
    ['absent', mk(weakRules(), backendOf(async () => '', { kind: null }))],
    ['rules strategy', mk(weakRules(), okBackend(), 'rules')],
    ['empty', mk(weakRules(), backendOf(async () => ''))],
    ['numbers changed', mk(weakRules(), backendOf(async () => 'It is 29 o\'clock.'))],
    ['negation dropped', mk(weakRules(), backendOf(async () => 'Open the tab.'))],
    ['hangs', mk(weakRules(), createRemoteBackend({ kinds: { translator: 'translator' }, call: () => new Promise(() => {}), deadlineMs: 60 }))],
    ['throws', mk(weakRules(), backendOf(async () => { throw new Error('model unavailable'); }))],
  ];
  for (const [name, tr] of cases) {
    const s = await session(tr);
    const t0 = performance.now();
    const r = await s.send('nu e ora 25', { language: 'ro' });
    assert.equal(r.lang, 'ro', name);
    assert.notEqual(r.trace.via, 'translator-in', name);
    assert.ok(performance.now() - t0 < 1500, `${name} took ${Math.round(performance.now() - t0)} ms`);
  }
});

test('input: a second reading that is no better is dropped and the session is as the first reading left it', async () => {
  const tr = mk(weakRules(), backendOf(async () => 'Qwerty zxcv blorp.'));
  const s = await session(tr);
  const r = await s.send('câți ani am?', { language: 'ro' });
  assert.notEqual(r.trace.via, 'translator-in');
  assert.equal(r.lang, 'ro');
  assert.equal(s._msg, 1);
});

test('output: a reply the rules cannot put into Romanian goes to the Translator, checked', async () => {
  const calls = [];
  const tr = mk(weakRules({ ro: false, en: true }), okBackend(calls));
  const parts = await translateParts([{ text: 'The sun is a star.', translate: true }], tr, 'ro');
  assert.equal(parts.map((p) => p.text).join(''), 'Soarele este o stea.');
  assert.deepEqual(parts.routes, ['translator-out']);
  // the user's quoted words stay verbatim around a translated run
  const q = await translateParts([{ text: 'The sun is a star. ', translate: true }, { text: '"soare"', translate: false, quote: true }], tr, 'ro');
  assert.equal(q.map((p) => p.text).join(''), 'Soarele este o stea. „soare”');   // Romanian quotes
});

test('output: no template and no usable Translator: a Romanian line, never English (rules route when the table knows it)', async () => {
  for (const backend of [backendOf(async () => '', { kind: null }), backendOf(async () => 'The sun is a star.')]) {
    const tr = mk(weakRules({ ro: false, en: true }), backend);
    const parts = await translateParts([{ text: 'Totally unknown sentence about quasars.', translate: true }, { text: '"cuvânt"', translate: false, quote: true }], tr, 'ro');
    const shown = parts.map((p) => p.text).join('');
    assert.deepEqual(parts.routes, ['ro-generic']);
    assert.match(shown, /^Nu am încă o formulare în română/);
    assert.match(shown, /„cuvânt”/);
    assert.doesNotMatch(shown, /quasars/);
  }
  const ok = await translateParts([{ text: 'I drew a house.', translate: true }], mk(base, okBackend()), 'ro');
  assert.deepEqual(ok.routes, ['rules-translate']);
});

test('output: the plain rules translator keeps its old behaviour (a reply it cannot translate stays English as a whole)', async () => {
  const parts = await translateParts([{ text: 'Totally unknown sentence about quasars.', translate: true }], base, 'ro');
  assert.equal(parts.map((p) => p.text).join(''), 'Totally unknown sentence about quasars.');
  assert.equal(parts.routes, undefined);
});
