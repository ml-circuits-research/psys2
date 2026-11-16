// SPDX-License-Identifier: AGPL-3.0-only
// A committed result of the REAL set must be from the tree it claims to measure (reviewer 2026-11-14 23:50): the headline once said 201/253 for weeks after the tab cut made it 142,
// because nobody re-ran the default result files. Every result file records `build` and `tree` (scripts/lib/measure-build.mjs); this test fails when the files the measurement
// depends on (src, worlds, knowledge, the judge, the set) are no longer the ones measured. Fix: node scripts/real-set.mjs run --reasoner matrix  (and --reasoner ops).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshness, treeOf, REAL_SET_INPUTS } from '../scripts/lib/measure-build.mjs';
import { notUnderstoodOk, outcomeOf, removedWorldOf, diffRows } from '../scripts/real-set.mjs';
import { CATALOG_PIN } from '../src/knowledge/catalog-pin.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the default REAL-set result files are from the current tree (re-run them after any change to what they measure)', (t) => {
  if (treeOf(REPO) == null) { t.skip('not a git checkout'); return; }
  for (const r of ['matrix', 'ops']) {
    const f = join(REPO, `training/results/real-2026-11-15-${r}.json`);
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    const { fresh, why } = freshness(REPO, res);
    assert.ok(fresh, `${f}: ${why}. Inputs: ${REAL_SET_INPUTS.join(', ')}. Run: node scripts/real-set.mjs run --reasoner ${r}`);
  }
});

// P1 (reviewer 2026-11-15 01:15): the default result files are the headline, so they measure what ships (the shipped mode, the pinned catalog, a recorded seed)
test('the default REAL-set result files are of the shipped mode, on the pinned catalog, seeded', () => {
  for (const r of ['matrix', 'ops']) {
    const f = join(REPO, `training/results/real-2026-11-15-${r}.json`);
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(res.mode, 'shipped', `${f}: mode ${res.mode}`);
    assert.equal(res.catalog?.commit, CATALOG_PIN.commit, `${f}: catalog ${res.catalog?.commit} is not the pin`);
    assert.equal(res.settings?.formalizer, 'encoder', `${f}: the shipped formalizer is the encoder`);
    assert.ok(Number.isFinite(res.seed), `${f}: no seed`);
  }
});

test('the judge: a forbid-only check is not met by "I did not understand"; another tab\'s world taking a turn is other_world', () => {
  assert.equal(notUnderstoodOk({ reply_not: 'hangman', world_not: 'games.hangman' }), false);
  assert.equal(notUnderstoodOk({ unchanged: true }), true);
  const meta = new Set(['talk', 'ui.shell']);
  assert.equal(outcomeOf({ unparsedAll: false, acted: true, statuses: ['supported'], worlds: ['media.music'], tabWorld: 'art.draw', meta }), 'other_world');
  assert.equal(outcomeOf({ unparsedAll: false, acted: false, statuses: ['unsupported'], worlds: ['media.music'], tabWorld: 'art.draw', meta }), 'other_world');
  assert.equal(outcomeOf({ unparsedAll: false, acted: true, statuses: ['supported'], worlds: ['talk'], tabWorld: 'art.draw', meta }), 'executed');
  assert.equal(outcomeOf({ unparsedAll: true, acted: false, statuses: [], worlds: [], tabWorld: 'art.draw', meta }), 'not_understood');
});

test('ledger rows of removed worlds are recognised; a row that only forbids a removed world, or names one in a note, is not', () => {
  assert.match(removedWorldOf({ text: 'hint', tab: 'tictactoe' }), /removed tictactoe tab/);
  for (const tab of ['map', 'music']) assert.match(removedWorldOf({ text: 'more', tab }), new RegExp(`removed ${tab} tab`));
  assert.equal(removedWorldOf({ text: 'draw a map', tab: 'draw' }), null);
  assert.equal(removedWorldOf({ text: 'write about music', tab: 'editor' }), null);
  assert.match(removedWorldOf({ text: 'hint pls', tab: 'robot', happened: 'We are not playing hangman. Say "play hangman" to start.' }), /reply came from a removed world/);
  assert.equal(removedWorldOf({ text: 'crocodilii', tab: 'draw', happened: 'I am not sure how it fits', expected: 'redo the move; never hangman' }), null);
  assert.equal(removedWorldOf({ text: 'o', tab: 'diagram', happened: 'A has no common second name. [before the cut games.hangman took the letter]', expected: 'not-understood' }), null);
  assert.equal(removedWorldOf({ text: 'Drawing a house', tab: 'draw', happened: 'I did not understand "Drawing a house". Did you mean "Draw a house." or "Start a new chess game."?' }), null);
});

test('two result files are compared row by row without the time taken', () => {
  const a = { rows: [{ id: 'r1', outcome: 'executed', ms: 5 }, { id: 'r2', outcome: 'asked', ms: 1 }] };
  const b = { rows: [{ id: 'r1', outcome: 'executed', ms: 9 }, { id: 'r2', outcome: 'refused', ms: 1 }] };
  assert.deepEqual(diffRows(a, b).map((x) => x.id), ['r2']);
});
