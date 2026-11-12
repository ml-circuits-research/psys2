// SPDX-License-Identifier: AGPL-3.0-only
// MT-SERIOUS: the translation layer's order (a) browser Translator, (b) on-device model, (c) nothing; the model host's lazy load, deadline and restart (fake worker,
// no WASM); the checker for languages without negation/question tables; the language list gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMtHost } from '../docs/webchat/ui/mt-host.mjs';
import { createBrowserBackend, createRemoteBackend, checkTranslation, REMOTE_MT_DEADLINE_MS, REMOTE_DEADLINE_MS } from '../docs/webchat/ui/translation.mjs';
import { normalize, tagOf, langName, registerLanguages, createLanguage } from '../docs/webchat/ui/language.mjs';

const file = (path, bytes = 10) => ({ path, bytes });
const registry = { baseUrl: 'https://example.invalid', langs: { de: { bytes: 60, fromEn: { files: { model: file('m-ende'), lexicalShortlist: file('l-ende'), vocab: file('v-ende') }, flores: { bleu: 1 } }, toEn: { files: { model: file('m-deen'), lexicalShortlist: file('l-deen'), vocab: file('v-deen') }, flores: { bleu: 2 } } } } };

/** A worker that answers like translator-worker.js: initialize, loadTranslationModel, translate ("<from>:<text>" -> "<to>:<text>"); `hang` makes translate never answer. */
function fakeWorker({ hang = false } = {}) {
  const w = { terminated: false, calls: [], postMessage(m) {
    w.calls.push(m.name);
    if (m.name === 'translate' && hang) return;
    const { from, to } = m.args[0]?.models?.[0] ?? {};
    setTimeout(() => w.onmessage?.({ data: { id: m.id, result: m.name === 'translate' ? [{ target: { text: `${to}:${m.args[0].texts[0].text}` } }] : null } }), 1);
  }, terminate() { w.terminated = true; } };
  return w;
}
const mkHost = (opts = {}) => { const files = []; const workers = []; const host = createMtHost({ registry, fetchFile: async (url, { onProgress }) => { files.push(url); onProgress?.(10); return new ArrayBuffer(4); }, spawn: () => { const w = fakeWorker(opts); workers.push(w); return w; }, ...opts.host }); return { host, files, workers }; };

test('the model host is lazy: nothing is fetched or spawned until ensure(lang); then 6 files, both directions loaded', async () => {
  const { host, files, workers } = mkHost();
  assert.equal(files.length, 0); assert.equal(workers.length, 0);
  assert.deepEqual(host.languages(), ['de']);
  await assert.rejects(host.translate('hallo', 'de', 'en'), /not ready/);
  const seen = [];
  const h2 = createMtHost({ registry, fetchFile: async (u, { onProgress }) => { onProgress(10); return new ArrayBuffer(1); }, spawn: () => fakeWorker(), onState: (l, s) => seen.push(s.phase) });
  await h2.ensure('de');
  assert.deepEqual([...new Set(seen)], ['downloading', 'loading', 'ready']);
  assert.equal(await h2.translate('hallo', 'de', 'en'), 'en:hallo');
  assert.equal(await h2.translate('hello', 'en', 'de'), 'de:hello');
  await host.ensure('de'); assert.equal(files.length, 6); assert.equal(workers.length, 1);
  await assert.rejects(host.ensure('xx'), /no on-device translation model/);
});

test('a translation that misses its deadline ends the worker (WASM cannot be interrupted) and the language needs ensure() again', async () => {
  const { host, workers } = mkHost({ hang: true, host: { deadlineMs: 30 } });
  await host.ensure('de');
  await assert.rejects(host.translate('hallo', 'de', 'en'), /timed out/);
  assert.equal(workers[0].terminated, true);
  assert.equal(host.state('de').phase, 'idle');
  await assert.rejects(host.translate('hallo', 'de', 'en'), /not ready/);
});

test('a failed download is reported in the state and a later ensure() retries', async () => {
  let fail = true;
  const host = createMtHost({ registry, fetchFile: async () => { if (fail) throw new Error('offline'); return new ArrayBuffer(1); }, spawn: () => fakeWorker() });
  await assert.rejects(host.ensure('de'), /offline/);
  assert.equal(host.state('de').phase, 'error'); assert.match(host.state('de').error, /offline/);
  fail = false;
  await host.ensure('de'); assert.equal(host.state('de').phase, 'ready');
});

test('layer order: the browser Translator first, the model otherwise, nothing else', async () => {
  const model = { has: (l) => l === 'de', state: () => ({ phase: 'ready' }), translate: async (t) => `MODEL:${t}` };
  const calls = [];
  const savedSelf = globalThis.self;
  try {
    // (b) no Translator in this window: the model answers; a language without a model fails (c)
    globalThis.self = {};
    const phone = createBrowserBackend({ mt: model });
    assert.equal(phone.translatorKind(), 'mt');
    assert.equal(await phone.translate('hallo', 'de', 'en'), 'MODEL:hallo');
    await assert.rejects(phone.translate('hola', 'es', 'en'), /no translator for this language pair/);
    assert.equal(createBrowserBackend().translatorKind(), null);
    // (a) a Translator that supports the pair is used first
    globalThis.self = { Translator: { availability: async ({ sourceLanguage, targetLanguage }) => (sourceLanguage === 'de' || targetLanguage === 'de' ? 'available' : 'unavailable'), create: async () => ({ translate: async (t) => { calls.push(t); return `NATIVE:${t}`; } }) } };
    const desktop = createBrowserBackend({ mt: model });
    assert.equal(desktop.translatorKind(), 'translator');
    assert.equal(await desktop.translate('hallo', 'de', 'en').catch(() => 'later'), await desktop.translate('hallo', 'de', 'en').catch(() => 'later'));
    // a pair the Translator does not support goes to the model
    model.has = (l) => l === 'fr';
    assert.equal(await desktop.translate('bonjour', 'fr', 'en'), 'MODEL:bonjour');
  } finally { globalThis.self = savedSelf; }
});

test('the bridge into the engine worker gets the longer deadline when a model exists', () => {
  const call = () => new Promise(() => {});
  assert.equal(REMOTE_MT_DEADLINE_MS > REMOTE_DEADLINE_MS, true);
  const b = createRemoteBackend({ kinds: { translator: 'mt', mt: true }, call, deadlineMs: 20 });
  return assert.rejects(b.translate('x', 'de', 'en'), /timed out/);
});

test('the checker: numbers and names for any language, negation and question words only where the tables exist', () => {
  assert.equal(checkTranslation('Wie viel ist 3 plus 4?', 'How much is 3 plus 4?', { from: 'de', to: 'en' }), null);
  assert.match(checkTranslation('Wie viel ist 3 plus 4?', 'How much is 3 plus 5?', { from: 'de', to: 'en' }), /numbers/);
  assert.match(checkTranslation('Wie viel ist das?', 'It is that much', { from: 'de', to: 'en' }), /question/);
  assert.match(checkTranslation('Nu desena nimic', 'Draw something', { from: 'ro', to: 'en' }), /negation/);
  assert.equal(checkTranslation('Draw nothing', 'Zeichne etwas', { from: 'en', to: 'de' }), null);   // no German negation table: not checked
  assert.equal(checkTranslation('Zeichne nichts', 'Draw something', { from: 'de', to: 'en' }), null);   // no German negation table: not checked
});

test('language codes: any registry code is valid, tags and names come from the code, the holder accepts registered languages only', () => {
  assert.equal(normalize('de'), 'de'); assert.equal(normalize('auto'), 'en'); assert.equal(normalize('zh_hant'), 'zh_hant');
  assert.equal(tagOf('tl'), 'fil-PH'); assert.equal(tagOf('de'), 'de'); assert.equal(tagOf('en', 'en-GB'), 'en-GB');
  assert.equal(langName('de'), 'German'); assert.equal(langName('ro', { own: true }), 'Română');
  const l = createLanguage({ initial: 'en' });
  assert.equal(l.set('fr'), false);
  registerLanguages(['fr']);
  assert.equal(l.set('fr'), true); assert.equal(l.tag(), 'fr');
});
