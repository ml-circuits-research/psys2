// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's vocabulary read by buckets (lazy loading): the same answers as the whole vocab.json, a fraction of the bytes, only the buckets a message falls in; a catalog without buckets is read whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { writeBuckets } from '../scripts/build-catalog-vocab.mjs';

const FIXTURE = new URL('./fixtures/catalog/', import.meta.url).pathname;
const sourceOf = (dir, log) => ({ text: async (p) => { try { const t = readFileSync(join(dir, p), 'utf8'); log.push([p, t.length]); return t; } catch { return null; } } });

test('buckets: the same finds as the whole vocabulary, from a fraction of its bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'psys2-vocab-'));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const { buckets } = writeBuckets(dir);
    assert.ok(buckets > 5);
    const whole = JSON.parse(readFileSync(join(FIXTURE, 'vocab.json'), 'utf8'));
    const logB = [], logW = [];
    const withBuckets = createFacts({ source: sourceOf(dir, logB) });
    const wholeOnly = createFacts({ source: sourceOf(FIXTURE, logW) });   // the fixture catalog itself has no vocab/index.json
    const words = Object.keys(whole).filter((_, i) => i % 7 === 0).slice(0, 25);
    for (const w of words) {
      const a = await withBuckets.find(w), b = await wholeOnly.find(w);
      assert.deepEqual(a?.shards ?? null, b?.shards ?? null, `find(${w})`);
    }
    assert.equal((await withBuckets.find('qqzzxx')), null, 'an unknown word is unknown');
    const bytes = (log) => log.filter(([p]) => p.startsWith('vocab')).reduce((s, [, n]) => s + n, 0);
    assert.ok(withBuckets.vocabBuckets(), 'bucket mode');
    assert.ok(bytes(logB) < bytes(logW), `buckets read ${bytes(logB)} bytes, the whole file ${bytes(logW)}`);
    assert.ok(logB.every(([p]) => p === 'vocab/index.json' || /^vocab\/[a-z0-9_]{2}\.json$/.test(p) || !p.startsWith('vocab')), 'only index and buckets');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buckets: one lookup reads the index and one bucket, not the vocabulary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'psys2-vocab-'));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    writeBuckets(dir);
    const log = [];
    const f = createFacts({ source: sourceOf(dir, log) });
    await f.loadVocabFor(['blue']);
    assert.deepEqual(log.map(([p]) => p).sort(), ['vocab/bl.json', 'vocab/index.json']);
    assert.ok(f.peekVocab() && Object.hasOwn(f.peekVocab(), 'blue'));
    assert.ok(!Object.hasOwn(f.peekVocab(), 'amber'), 'another bucket stays unread');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
