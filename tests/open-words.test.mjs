// SPDX-License-Identifier: AGPL-3.0-only
// OPEN CLASSES BY LOOKUP (spec 21 section 10): a lexicon open to the catalog matches the words of the catalog at reading time, never a part of an object, and never blocks a turn on a hanging catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { OpenWords, probeOf, attachOpenWords, ready, knowsKind } from '../src/knowledge/open-words.mjs';

const CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/catalog');

test('kinds: a catalog word (singular lemma) is a kind, a part of an object is not, nothing is open before the vocabulary is loaded', async () => {
  const facts = createFacts({ source: createKnowledgeSource(CATALOG) });
  attachOpenWords(facts);
  assert.equal(knowsKind('zebra', ['k.animals']), false, 'not loaded yet: the closed list only');
  await ready();
  assert.equal(knowsKind('zebra', ['k.objects', 'k.animals', 'k.food']), true);
  assert.equal(knowsKind('zebra', ['k.food']), false, 'only the catalog worlds the lexicon names');
  assert.equal(knowsKind('roof', ['k.objects']), false, 'a roof is a part of a house, never a kind of its own');
  assert.equal(knowsKind('blorp', ['k.objects', 'k.animals']), false);
  attachOpenWords(null);
});

test('an OpenWords set keeps its own words, asks the probe for the rest, and iterates only the closed list', async () => {
  const facts = createFacts({ source: createKnowledgeSource(CATALOG) });
  attachOpenWords(facts);
  await ready();
  const w = new OpenWords(new Set(['house']), probeOf('knowledge', ['k.animals']), (e) => e === 'cat');
  assert.equal(w.has('house'), true);
  assert.equal(w.has('zebra'), true);
  assert.equal(w.has('cat'), false, 'a word the world gave to something else is blocked');
  assert.deepEqual([...w], ['house'], 'spelling and routing indexes walk the closed list');
  const c = new OpenWords(new Set(), probeOf('colour'));
  assert.equal(c.has('org'), true, 'chat shorthand of the one colour reader');
  assert.equal(c.has('teal'), true);
  assert.equal(c.has('blorp'), false);
  attachOpenWords(null);
});

test('a catalog whose vocabulary never arrives does not hold the turn', async () => {
  const hanging = { loadVocab: () => new Promise(() => {}), loadParts: () => new Promise(() => {}), peekVocab: () => null };
  attachOpenWords(hanging);
  const t = Date.now();
  await ready();
  await ready();
  assert.ok(Date.now() - t < 1500, 'the first call waits a short time, the next ones not at all');
  assert.equal(knowsKind('zebra', ['k.animals']), false);
  attachOpenWords(null);
});
