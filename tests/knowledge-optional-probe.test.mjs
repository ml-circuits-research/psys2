// The optional `vocab/index.json` probe is asked at most once per session on a 404 and once per backoff window on a 5xx; the answer stays null (the network never changes a reading).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeSource, resetOptionalMisses, OPTIONAL_BACKOFF_MS } from '../src/loaders/knowledge-source.mjs';

const withFetch = async (handler, fn) => {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return handler(url); };
  try { await fn(calls); } finally { globalThis.fetch = real; resetOptionalMisses(); }
};

test('a 404 on vocab/index.json is asked once, across sources of the same catalog', () => withFetch(
  (u) => (u.includes('vocab/') ? new Response('', { status: 404 }) : new Response('ok')),
  async (calls) => {
    for (let i = 0; i < 11; i++) assert.equal(await createKnowledgeSource('https://x.test/c').text('vocab/index.json'), null);
    assert.equal(calls.length, 1);
    assert.equal(await createKnowledgeSource('https://x.test/c').text('vocab.json'), 'ok');
    assert.equal(await createKnowledgeSource('https://x.test/c').text('vocab.json'), 'ok');
    assert.equal(calls.length, 3, 'other files are never remembered as misses');
  }));

test('a 503 is a temporary miss: asked again after the backoff, and a good answer clears it', () => withFetch(
  () => new Response('', { status: 503 }),
  async (calls) => {
    let t = 0;
    const s = createKnowledgeSource('https://y.test/c', { now: () => t });
    assert.equal(await s.text('vocab/index.json'), null);
    assert.equal(await s.text('vocab/index.json'), null);
    assert.equal(calls.length, 1);
    t += OPTIONAL_BACKOFF_MS + 1;
    assert.equal(await s.text('vocab/index.json'), null);
    assert.equal(calls.length, 2);
    globalThis.fetch = async (u) => { calls.push(u); return new Response('{"buckets":{}}'); };
    t += 10 * 60000;
    assert.equal(await s.text('vocab/index.json'), '{"buckets":{}}');
    assert.equal(await s.text('vocab/index.json'), '{"buckets":{}}');
    assert.equal(calls.length, 4);
  }));
