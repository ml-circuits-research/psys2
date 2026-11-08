import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { analyze, compilePattern, matchTokens, FormSession, makeEnv } from '../src/formalizer/rules/index.mjs';
import { wordBag, prefilterPasses, prefilterNeeds } from '../src/formalizer/rules/matcher.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';

const verdict = (match, text) => {
  const c = compilePattern(match);
  const tokens = analyze(text)[0].tokens.filter((t) => t.kind !== 'punct');
  return prefilterPasses(c, wordBag(tokens));
};

test('prefilter: needs are the first words of mandatory literals and groups only', () => {
  const c = compilePattern('[please|could_you]? make {x:word} [red|dark_blue] now ...');
  const needs = prefilterNeeds(c).map((s) => [...s].sort().join(','));
  assert.deepEqual(needs.sort(), ['dark,red', 'make', 'now']);
});

test('prefilter: rejects when a mandatory word is absent, accepts otherwise', () => {
  assert.equal(verdict('make {x:word} red', 'make it red'), true);
  assert.equal(verdict('make {x:word} red', 'make it blue'), false);
  assert.equal(verdict('[paint|colour] {x:word}', 'paint it'), true);
  assert.equal(verdict('[paint|colour]? {x:word}', 'it'), true);
});

test('prefilter: operator symbols and their words are interchangeable', () => {
  assert.equal(verdict('{a:number} + {b:number}', '2 plus 3'), true);
  assert.equal(verdict('{a:number} plus {b:number}', '2 + 3'), true);
  assert.equal(verdict('{a:number} multiplied_by {b:number}', '2 * 3'), true);
  assert.equal(verdict('{a:number} * {b:number}', '2 times 3'), true);
});

test('prefilter never rejects a pattern that matchTokens matches (fuzz over all pattern examples)', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const set = engine.set, lex = lexIndex(set);
  const pats = set.list().flatMap((w) => w.patterns.map((p) => ({ p, c: compilePattern(p.match, lexIndex(set).phrases) })));
  const compiledOf = new Map(pats.map((x) => [x.p, x.c]));
  const own = [], sampled = [];
  let k = 0;
  for (const w of set.list()) for (const p of w.patterns) for (const ex of p.examples ?? []) {
    own.push({ p, ex });
    if (k++ % 40 === 0) sampled.push({ p, ex });
  }
  assert.ok(own.length > 1000, 'pattern examples found');
  let matched = 0, rejected = 0, total = 0;
  const views = (text) => analyze(text).flatMap((s) => {
    const all = s.tokens.filter((t) => t.kind !== 'punct');
    return [all, all.filter((t) => !t.filler)];
  });
  const check = (c, view, env, label) => {
    total++;
    const m = matchTokens(c, view, env);
    const ok = prefilterPasses(c, wordBag(view));
    if (m) { matched++; assert.ok(ok, `prefilter rejected a match: ${label}`); }
    if (!ok) rejected++;
  };
  const form = new FormSession();
  for (const { p, ex } of own) {
    const env = makeEnv(ex, set, form, lex);
    for (const v of views(ex)) check(compiledOf.get(p), v, env, `${p.id} <- ${ex}`);
  }
  for (const { ex } of sampled) {
    const env = makeEnv(ex, set, form, lex);
    for (const v of views(ex)) for (const { p, c } of pats) check(c, v, env, `${p.id} <- ${ex}`);
  }
  assert.ok(matched > 500, `enough real matches exercised (${matched})`);
  assert.ok(rejected > total / 2, `the prefilter rejects most non-matches (${rejected}/${total})`);
});
