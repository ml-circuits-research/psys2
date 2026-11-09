import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_DEFAULTS, MODES, DEFAULT_MODE, settingsForMode, policyFromSettings, sessionOptions, runtimeSettings } from '../src/dialog/runtime-config.mjs';
import { DEFAULT_SETTINGS } from '../docs/webchat/ui/settings.mjs';

test('the webchat defaults are the runtime defaults, and the shipped mode is encoder+n1', () => {
  // fastPath is the one documented webchat override: the webchat answers at once when the rules read a whole clause (spec 06 Performance)
  for (const k of Object.keys(RUNTIME_DEFAULTS).filter((x) => x !== 'fastPath')) assert.equal(DEFAULT_SETTINGS[k], RUNTIME_DEFAULTS[k], k);
  assert.equal(DEFAULT_MODE, 'encoder+n1');
  assert.equal(RUNTIME_DEFAULTS.bestEffort, true);   // best effort with loose words is on by default (spec 03 7.15)
  assert.equal(sessionOptions({ ...RUNTIME_DEFAULTS, bestEffort: false }).bestEffort, false);
  assert.deepEqual(settingsForMode(DEFAULT_MODE), { ...RUNTIME_DEFAULTS });
});

test('modes differ only in formalizer and normalizer', () => {
  assert.equal(MODES.rules.formalizer, 'rules');
  assert.equal(MODES.encoder.normalizer, false);
  assert.equal(MODES['encoder+n1'].normalizer, true);
  assert.throws(() => settingsForMode('nope'));
});

test('policy and session options follow the settings', () => {
  assert.deepEqual(policyFromSettings(runtimeSettings()), { acceptRefused: true, trySpell: true, acceptPartial: true, tryNormalizer: true, trySimplified: false });
  assert.equal(policyFromSettings(settingsForMode('encoder')).tryNormalizer, false);
  const live = { ...RUNTIME_DEFAULTS };
  live.spellcheck = false;
  assert.equal(policyFromSettings(live).trySpell, false);
  assert.deepEqual(sessionOptions(settingsForMode('rules'), { language: 'en' }), { formalizer: 'rules', spell: true, partial: true, bestEffort: true, language: 'en' });
});

test('the S1 edit head is off by default and a setting turns it on (review decision e)', () => {
  assert.equal(RUNTIME_DEFAULTS.editHead, false);
  assert.equal(policyFromSettings(runtimeSettings()).trySimplified, false);
  assert.equal(policyFromSettings({ ...runtimeSettings(), editHead: true }).trySimplified, true);
});
