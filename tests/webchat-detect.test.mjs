import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSwitchTranslator, DETECT_MIN_CONFIDENCE } from '../docs/webchat/ui/translation.mjs';

const rules = { detectLanguage: (t) => { rules.calls.push(t); return { lang: 'ro', confidence: 0.9 }; }, translate: () => ({}), calls: [] };
const mk = (opts) => createSwitchTranslator({ rules, getStrategy: () => 'auto', ...opts });
let creates = 0;
const mock = (detect, availability = 'available') => {
  creates = 0;
  globalThis.self = { LanguageDetector: { availability: async () => availability, create: async () => { creates++; return { detect }; } } };
};
afterEach(() => { delete globalThis.self; rules.calls.length = 0; });

test('browser API present: its top result is used and the detector is cached', async () => {
  mock(async () => [{ detectedLanguage: 'en', confidence: 0.95 }, { detectedLanguage: 'ro', confidence: 0.02 }]);
  const t = mk();
  assert.equal((await t.detectLanguage('what is two plus two')).lang, 'en');
  await t.detectLanguage('what is three plus two');
  assert.equal(creates, 1);
  assert.equal(rules.calls.length, 0);
  assert.equal(t.detectUsage[0].strategy, 'browser-api');
});

test('API absent: rules detector', async () => {
  const t = mk();
  assert.equal((await t.detectLanguage('cât face doi plus doi')).lang, 'ro');
  assert.equal(rules.calls.length, 1);
  assert.equal(t.detectUsage[0].strategy, 'rules');
});

test('API throws: rules detector, fallback recorded', async () => {
  mock(async () => { throw new Error('boom'); });
  const t = mk();
  assert.equal((await t.detectLanguage('cât face doi plus doi')).lang, 'ro');
  assert.equal(t.detectUsage[0].fallback, true);
  assert.match(t.detectUsage[0].reason, /boom/);
});

test('model still downloading: rules detector', async () => {
  mock(async () => [{ detectedLanguage: 'en', confidence: 1 }], 'downloadable');
  assert.equal((await mk().detectLanguage('cât face doi plus doi')).lang, 'ro');
});

test('low confidence: unknown', async () => {
  mock(async () => [{ detectedLanguage: 'ro', confidence: DETECT_MIN_CONFIDENCE - 0.1 }]);
  assert.equal((await mk().detectLanguage('banana split')).lang, 'unknown');
});

test('unsupported language: unknown', async () => {
  mock(async () => [{ detectedLanguage: 'fr', confidence: 0.99 }]);
  assert.equal((await mk().detectLanguage('bonjour tout le monde')).lang, 'unknown');
});

test('setting "rules" never touches the browser API', async () => {
  mock(async () => [{ detectedLanguage: 'en', confidence: 1 }]);
  const t = mk({ getDetectStrategy: () => 'rules' });
  assert.equal((await t.detectLanguage('what is two plus two')).lang, 'ro');
  assert.equal(creates, 0);
});

test('very short input goes to the rules detector', async () => {
  mock(async () => [{ detectedLanguage: 'en', confidence: 1 }]);
  await mk().detectLanguage('ok');
  assert.equal(rules.calls.length, 1);
});
