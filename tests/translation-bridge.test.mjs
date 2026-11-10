// The engine worker has no Translation API: it asks the page over a message, with a deadline, and falls back to the rules (COMPUTE-BUDGET D, item 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator, createRemoteBackend } from '../docs/webchat/ui/translation.mjs';

const rules = createTranslator();
const RO = 'câte zile are iunie?';

function make(call, { kinds = { translator: 'translator', detector: 'detector' }, deadlineMs = 60 } = {}) {
  const backend = createRemoteBackend({ kinds, call, deadlineMs });
  return createSwitchTranslator({ rules, getStrategy: () => 'auto', getDetectStrategy: () => 'auto', backend });
}

test('remote backend: the page answers, the checked browser translation is used', async () => {
  const seen = [];
  const t = make(async (op, p) => { seen.push(op); return op === 'translate' ? 'how many days does June have?' : [{ detectedLanguage: 'ro', confidence: 0.95 }]; });
  const d = await t.detectLanguage(RO);
  assert.equal(d.strategy, 'browser-api'); assert.equal(d.lang, 'ro');
  const r = await t.translate(RO, { from: 'ro', to: 'en' });
  assert.equal(r.strategy, 'browser-api'); assert.equal(r.text, 'how many days does June have?');
  assert.deepEqual(seen, ['detect', 'translate']);
});

test('remote backend: a page that does not answer in time falls back to the rules within the deadline', async () => {
  const t = make(() => new Promise(() => {}));
  const t0 = Date.now();
  const r = await t.translate(RO, { from: 'ro', to: 'en' });
  const d = await t.detectLanguage(RO);
  assert.ok(Date.now() - t0 < 400, 'two calls, each bounded');
  assert.equal(r.strategy, 'rules'); assert.match(t.usage[0].reason, /page translation/);
  assert.equal(d.strategy ?? 'rules', 'rules'); assert.equal(d.lang, 'ro');
});

test('remote backend: a failing page and a bad browser translation both fall back to the rules', async () => {
  const bad = make(async () => { throw new Error('boom'); });
  assert.equal((await bad.translate(RO, { from: 'ro', to: 'en' })).strategy, 'rules');
  const wrong = make(async (op) => (op === 'translate' ? 'how many days does May have?' + ' 7' : []));
  const r = await wrong.translate('câte zile are iunie 30?', { from: 'ro', to: 'en' });
  assert.equal(r.strategy, 'rules'); assert.match(wrong.usage[0].reason, /checker failed/);
});

test('remote backend: a page without the API (kinds null) never sends a message', async () => {
  let calls = 0;
  const t = make(async () => { calls++; return ''; }, { kinds: {} });
  assert.equal((await t.translate(RO, { from: 'ro', to: 'en' })).strategy, 'rules');
  await t.detectLanguage(RO);
  assert.equal(calls, 0);
});

test('checkTranslation ends (a regex that matched the empty string at 0 once looped for ever on every checked browser translation)', async () => {
  const { Worker } = await import('node:worker_threads');
  const url = new URL('../docs/webchat/ui/translation.mjs', import.meta.url).href;
  const code = `import { checkTranslation } from ${JSON.stringify(url)}; import { parentPort } from 'node:worker_threads';
    parentPort.postMessage([checkTranslation('fă o casă verde și una galbenă', 'make a green house and a yellow one', { from: 'ro', to: 'en' }),
      checkTranslation('Ion are 3 mere. Nu vrea Maria', 'Ion has 3 apples. Maria does not want', { from: 'ro', to: 'en' }),
      checkTranslation('Ea a venit la Ion', 'She came to him', { from: 'ro', to: 'en' })]);`;
  const w = new Worker(code, { eval: true });
  const out = await new Promise((resolve, reject) => { const t = setTimeout(() => { w.terminate(); reject(new Error('checkTranslation did not end in 5 s')); }, 5000); w.on('message', (m) => { clearTimeout(t); resolve(m); }); w.on('error', reject); });
  await w.terminate();
  assert.deepEqual(out, [null, null, 'names not preserved (Ion)']);
});
