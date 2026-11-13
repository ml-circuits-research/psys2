import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSet, mini } from './helpers.mjs';
import { tokenize, compilePattern, matchTokens, FormSession, makeEnv } from '../src/formalizer/rules/index.mjs';
import { prefilterPasses, prefilterNeeds, wordBag } from '../src/formalizer/rules/matcher.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

const LEX = `@phrase.t.lead core.phrase
    alt=would_you_kindly alt=can_you alt=kindly
`;
const set = await bundleSet({ t: mini('t', { files: { 'lexicon.sop': LEX } }) });
const lex = lexIndex(set);
const toks = (text) => tokenize(text, 0).filter((t) => t.kind !== 'punct');

test('prefilter sees macro alternatives: a required [$id] group is not filtered out wrongly', () => {
  const c = compilePattern('[$t.lead] paint {c:word}', lex.phrases);
  assert.ok([...prefilterNeeds(c)].some((s) => s.has('kindly') && s.has('can') && s.has('would')));
  for (const [text, ok] of [['kindly paint red', true], ['can you paint red', true], ['would you kindly paint red', true], ['paint red', false]]) {
    const t = toks(text);
    assert.equal(prefilterPasses(c, wordBag(t)), ok, text);
    if (ok) assert.ok(matchTokens(c, t, makeEnv(text, set, new FormSession(), lex)), text);
  }
});

test('prefilter never rejects a migrated ui.avatar pattern that matches its own examples', async () => {
  const real = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
  const rl = lexIndex(real);
  let matched = 0;
  for (const p of real.get('ui.avatar').patterns) {
    const c = compilePattern(p.match, rl.phrases);
    for (const ex of p.examples) {
      const t = tokenize(ex, 0).filter((x) => x.kind !== 'punct' && !x.filler);
      const m = matchTokens(c, t, makeEnv(ex, real, new FormSession(), rl));
      if (m) { matched++; assert.ok(prefilterPasses(c, wordBag(t)), `${p.id}: ${ex}`); }
    }
  }
  assert.ok(matched > 40, `matched ${matched}`);
});
