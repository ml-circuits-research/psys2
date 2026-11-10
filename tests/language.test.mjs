// SPDX-License-Identifier: AGPL-3.0-only
// LANG-FIXED: docs/webchat/ui/language.mjs is the one owner of the interface language; the migration of the saved settings; the typed-message hint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLanguage, normalize, browserLanguage, tagOf, other, hintText, suggestSwitch, LANG_TAGS } from '../docs/webchat/ui/language.mjs';
import { migrateSettings, loadSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from '../docs/webchat/ui/settings.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';

test('get / set / tag: only the two languages, same value is no change', () => {
  const l = createLanguage({ initial: 'ro' });
  assert.equal(l.get(), 'ro'); assert.equal(l.tag(), 'ro-RO');
  assert.equal(l.set('fr', 'x'), false); assert.equal(l.set('auto', 'x'), false); assert.equal(l.set('ro', 'selector'), false);
  assert.equal(l.get(), 'ro');
  assert.equal(l.set('en', 'selector'), true); assert.equal(l.tag(), 'en-US');
  assert.deepEqual(l.history().map((h) => [h.lang, h.reason]), [['en', 'selector']]);
  assert.equal(createLanguage({ initial: 'auto' }).get(), 'en');
});

test('onChange fires once per real change, with the reason, and can be unsubscribed', () => {
  const l = createLanguage({ initial: 'en' });
  const seen = [];
  const off = l.onChange((e) => seen.push([e.lang, e.previous, e.reason, e.tag]));
  l.set('ro', 'command'); l.set('ro', 'command'); l.set('en', 'hint');
  off(); l.set('ro', 'selector');
  assert.deepEqual(seen, [['ro', 'en', 'command', 'ro-RO'], ['en', 'ro', 'hint', 'en-US']]);
});

test('a throwing listener does not break the others or the change', () => {
  const l = createLanguage();
  let n = 0;
  l.onChange(() => { throw new Error('boom'); }); l.onChange(() => { n++; });
  const warn = console.warn; console.warn = () => {};
  try { l.set('ro'); } finally { console.warn = warn; }
  assert.equal(n, 1); assert.equal(l.get(), 'ro');
});

test('the English variant (en-GB) changes the English tag only', () => {
  const l = createLanguage({ initial: 'en', variant: 'en-GB' });
  assert.equal(l.tag(), 'en-GB');
  l.set('ro'); assert.equal(l.tag(), 'ro-RO');
  l.set('en'); assert.equal(l.tag(), 'en-GB');
  l.setVariant('en-US'); assert.equal(l.tag(), 'en-US');
  assert.equal(tagOf('ro', 'en-GB'), LANG_TAGS.ro); assert.equal(tagOf('xx'), 'en-US');
});

test('helpers', () => {
  assert.equal(normalize('ro'), 'ro'); assert.equal(normalize('auto'), 'en'); assert.equal(normalize('auto', 'ro'), 'ro'); assert.equal(other('en'), 'ro');
  assert.equal(browserLanguage('ro-RO'), 'ro'); assert.equal(browserLanguage('ro'), 'ro'); assert.equal(browserLanguage('en-US'), 'en'); assert.equal(browserLanguage('fr'), 'en'); assert.equal(browserLanguage(undefined), 'en');
  assert.equal(hintText('ro', 'en').text, 'Pare engleză — schimb limba?'); assert.match(hintText('en', 'ro').text, /looks Romanian/);
});

test('migration: a saved auto language becomes the browser language and is saved; speechLang is dropped; en-GB is kept as the English variant', () => {
  assert.equal(migrateSettings({ language: 'auto', settingsVersion: 2 }, 'ro-RO').settings.language, 'ro');
  assert.equal(migrateSettings({ language: 'auto', settingsVersion: 2 }, 'en-GB').settings.language, 'en');
  assert.equal(migrateSettings({ language: 'ro', settingsVersion: 2 }, 'en-US').settings.language, 'ro');
  const m = migrateSettings({ language: 'ro', speechLang: 'en-GB', settingsVersion: 2 }, 'en-US');
  assert.equal('speechLang' in m.settings, false); assert.equal(m.settings.englishVariant, 'en-GB'); assert.equal(m.migrated, true);
  assert.equal(migrateSettings({ speechLang: 'auto', settingsVersion: 2 }).settings.englishVariant, 'en-US');
  assert.equal('speechLang' in DEFAULT_SETTINGS, false);
  const data = { [SETTINGS_KEY]: JSON.stringify({ language: 'auto', speechLang: 'auto', settingsVersion: 2 }) };
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'ro-RO' } });
  try { assert.equal(loadSettings(true, storage).language, 'ro'); } finally { if (prev) Object.defineProperty(globalThis, 'navigator', prev); else delete globalThis.navigator; }
  const saved = JSON.parse(data[SETTINGS_KEY]);
  assert.equal(saved.language, 'ro'); assert.equal('speechLang' in saved, false);
});

test('hint: only a clearly other-language typed message of enough words', async () => {
  const detect = async () => ({ lang: 'en', confidence: 0.9 });
  const evEn = () => ({ strongEn: true, strongRo: false }), evRo = () => ({ strongEn: false, strongRo: true }), none = () => ({ strongEn: false, strongRo: false });
  assert.equal(await suggestSwitch('please make the house bigger now', 'ro', { detect, evidence: evEn }), 'en');
  assert.equal(await suggestSwitch('desenează o casă mare și un copac', 'en', { detect: async () => ({ lang: 'ro' }), evidence: evRo }), 'ro');
  assert.equal(await suggestSwitch('ok stop', 'ro', { detect, evidence: evEn }), null, 'too short');
  assert.equal(await suggestSwitch('ok go now', 'ro', { detect, evidence: evEn }), null, 'too few letters');
  assert.equal(await suggestSwitch('please make the house bigger now', 'ro', { detect, evidence: none }), null, 'no strong evidence');
  assert.equal(await suggestSwitch('please make the house bigger now', 'ro', { detect: async () => ({ lang: 'ro' }), evidence: evEn }), null, 'the detector disagrees');
  assert.equal(await suggestSwitch('please make the house bigger now', 'en', { detect, evidence: evEn }), null, 'same language');
  assert.equal(await suggestSwitch('please make the house bigger now', 'ro', { detect: async () => { throw new Error('x'); }, evidence: evEn }), null, 'a failing detector never throws');
});

test('the engine never switches an explicit language, and the explicit switch command changes the shell state with a confirmation', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const st = settingsForMode('rules');
  const open = (language) => { const s = engine.createSession(sessionOptions(st, { language })); s.setWorldState('ui.shell', { language }); return s; };
  const ro = open('ro');
  for (const t of ['ok', 'stop', 'play little star', 'make a house']) { const r = await ro.send(t, { language: 'ro' }); assert.equal(r.lang, 'ro', t); assert.equal(ro.state()['ui.shell'].language, 'ro', t); }
  for (const t of ['vorbește în engleză', 'switch to English', 'speak English']) {
    const s = open('ro'); const r = await s.send(t, { language: 'ro' });
    assert.equal(s.state()['ui.shell'].language, 'en', t); assert.match(r.text, /am trecut la engleză/i, t);
  }
  for (const t of ['speak Romanian', 'switch to Romanian']) {
    const s = open('en'); const r = await s.send(t, { language: 'en' });
    assert.equal(s.state()['ui.shell'].language, 'ro', t); assert.match(r.text, /switched to Romanian/i, t);
  }
});
