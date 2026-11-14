import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSettings, loadSettings, DEFAULT_SETTINGS, SETTINGS_VERSION, SETTINGS_KEY } from '../docs/webchat/ui/settings.mjs';

const store = (obj = {}) => ({ data: { ...obj }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } });

test('the default formalizer is the encoder, partial understanding and spellcheck are on', () => {
  assert.equal(DEFAULT_SETTINGS.formalizer, 'encoder');
  assert.equal(DEFAULT_SETTINGS.partialUnderstanding, true);
  assert.equal(DEFAULT_SETTINGS.spellcheck, true);
  assert.equal(DEFAULT_SETTINGS.settingsVersion, SETTINGS_VERSION);
});

test('fresh profile: defaults, nothing migrated', () => {
  const r = migrateSettings(null);
  assert.equal(r.settings.formalizer, 'encoder');
  assert.equal(loadSettings(true, store()).formalizer, 'encoder');
});

test('a saved v1 "rules" (the old default) migrates to "encoder" once and is written back', () => {
  const st = store({ [SETTINGS_KEY]: JSON.stringify({ language: 'ro', formalizer: 'rules' }) });
  const s = loadSettings(true, st);
  assert.equal(s.formalizer, 'encoder');
  assert.equal(s.language, 'ro');
  assert.equal(JSON.parse(st.data[SETTINGS_KEY]).settingsVersion, SETTINGS_VERSION);
});

test('an explicit later choice of "rules" (the helper model switched off, saved with the current version) is respected', () => {   // the choice is `helperModel` since settings v6; `formalizer` is derived from it
  const st = store({ [SETTINGS_KEY]: JSON.stringify({ language: 'en', helperModel: false, settingsVersion: SETTINGS_VERSION }) });
  assert.equal(loadSettings(true, st).formalizer, 'rules');
  // and it survives another load
  assert.equal(loadSettings(true, st).formalizer, 'rules');
});

test('unknown formalizer values and broken storage fall back to the defaults', () => {
  assert.equal(migrateSettings({ formalizer: 'magic', settingsVersion: 2 }).settings.formalizer, 'encoder');
  const bad = store({ [SETTINGS_KEY]: '{not json' });
  assert.equal(loadSettings(true, bad).formalizer, 'encoder');
  assert.equal(loadSettings(false, bad).formalizer, 'encoder');
});
