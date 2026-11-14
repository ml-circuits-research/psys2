// SPDX-License-Identifier: AGPL-3.0-only
// geo.map pilot (spec 21 section 12): the places of the map come by lookup from the catalog's k.geo, through the host's `needs` entries (`wires:<type>`) and `peekWires`; the open place class reads
// any name of k.geo (accent-free spellings included) and nothing that is a colour or a word of the schema's doc. Targeted: one fixture catalog, no world run.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { attachOpenWords, ready, knowsPlace } from '../src/knowledge/open-words.mjs';
import { parseLine } from '../src/knowledge/catalog.mjs';
import { buildIndex, lookup, keyOf } from '../worlds/geo.map/places.mjs';
import { parse } from '../src/soplang/index.mjs';
import { needsOf } from '../src/dialog/knowledge-lookup.mjs';

const CAT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/catalog');
const facts = createFacts({ source: createKnowledgeSource(CAT) });

test('the shared fact parser reads keys with digits (code2)', () => {
  assert.deepEqual(parseLine('@x k.geo.country name=Japan code2=JP').attrs.code2, ['JP']);
});

test('the map reads its collections through its typed needs and builds the index synchronously', async () => {
  assert.equal(buildIndex(facts), null, 'nothing is loaded before the host settles the needs');
  const needs = needsOf({ id: 'geo.map', wires: parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../worlds/geo.map/world.sop'), 'utf8')).wires });
  assert.equal(needs.length, 4, 'the map declares its four collections as typed needs');
  for (const n of needs) await facts.load(n);
  const D = buildIndex(facts);
  assert.ok(D && D.countries.length > 200 && D.cities.length > 1000);
  const sudan = lookup(D, 'sudan');
  assert.equal(sudan.kind, 'country');
  assert.deepEqual(sudan.capital, ['Khartoum']);
  assert.equal(sudan.cc, 'SD');
  assert.equal(lookup(D, 'united_state').name, 'United States', 'the lexicon lemma (last word singular) finds the plural name');
  assert.equal(lookup(D, 'the_netherlands').kind, 'country');
  const paris = lookup(D, 'paris');
  assert.equal(paris.kind, 'city');
  assert.equal(D.byCc.get(paris.cc).name, 'France');
  assert.ok(lookup(D, 'europe').members.includes('FR'), 'a continent holds the countries whose continent it is');
  assert.ok(lookup(D, 'eu').members.length >= 27, 'a group holds its members by name');
  assert.equal(keyOf("St. George's"), 'st_georges');
});

test('the open place class: names of k.geo, with or without accents, never a colour or a word of the schema doc', async () => {
  attachOpenWords(facts);
  await ready();
  await facts.loadVocab();
  for (const w of ['paris', 'new_york', 'cape_town', 'sao_paulo', 'chisinau', 'united_state']) assert.ok(knowsPlace(w, ['k.geo']), w);
  for (const w of ['red', 'black', 'river', 'north', 'zebra']) assert.ok(!knowsPlace(w, ['k.geo']), w);
});
