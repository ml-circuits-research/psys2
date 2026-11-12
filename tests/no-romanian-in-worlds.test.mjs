// SPDX-License-Identifier: AGPL-3.0-only
// User decision 2026-11-12: nothing in Romanian in SOP Lang or the worlds. Romanian reaches a world only through the translation layer.
// Detection: Romanian diacritics, or frequent Romanian function words that English does not use.
// Allow-list (proper names, not language): in worlds/geo.map/kb.sop the gazetteer's own `name=`, `capital=` and `core.source=` values keep the spelling of
// GeoNames (Chișinău, Iași); everything else in that file is checked like any other file. A test that expects a place name uses its ASCII `key`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../worlds/', import.meta.url).pathname;
const DIACRITICS = /[ăâîșțşţĂÂÎȘȚŞŢ]/u;
// Romanian-only function words and verbs (none of them is an English word or a short token that occurs in alternation lists); two distinct ones in a line mark a Romanian sentence.
const WORDS = new Set(['sunt', 'pentru', 'vreau', 'vrei', 'foarte', 'multumesc', 'daca', 'dupa', 'inainte', 'cumpar', 'adauga', 'unde', 'cine', 'este', 'aveti', 'poti', 'despre', 'fiecare', 'buna', 'ziua', 'avem']);

function files(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(sop|md)$/.test(n)) out.push(p);
  }
  return out;
}

/** Text of a line without the allow-listed gazetteer values. */
function checked(file, line) {
  if (file.endsWith(path.join('geo.map', 'kb.sop'))) return line.replace(/\b(name|capital|core\.source)="[^"]*"/g, '$1=""');
  return line;
}

test('no Romanian word or diacritic in any file under worlds/', () => {
  const bad = [];
  for (const f of files(ROOT)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const line = checked(f, raw);
      if (DIACRITICS.test(line)) { bad.push(`${path.relative(ROOT, f)}:${i + 1}: diacritic: ${raw.trim().slice(0, 100)}`); return; }
      const toks = line.toLowerCase().match(/[a-z]+/g) ?? [];
      const hits = new Set(toks.filter((t) => WORDS.has(t)));
      if (hits.size >= 2) bad.push(`${path.relative(ROOT, f)}:${i + 1}: words: ${raw.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('the detector catches Romanian', () => {
  assert.ok(DIACRITICS.test('Câte mere are Tom?'));
  assert.ok(!DIACRITICS.test('How many apples does Tom have?'));
  assert.equal(checked('x/geo.map/kb.sop', '@c1 geo.map.city name="Iași" key=iasi').includes('Iași'), false);
});
