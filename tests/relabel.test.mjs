import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { valueInText, runAttempt } from '../scripts/collect-paraphrases.mjs';
import { lowerStrings, segmentTarget } from '../scripts/lib/dispatch-gold.mjs';
import { makeReader, judge } from '../scripts/lib/relabel.mjs';

test('value matching: note names and short values', () => {
  assert.equal(valueInText('f_sharp', 'chord notes for F# minor pls'), true);
  assert.equal(valueInText('d', 'chord notes for F# minor pls'), false);   // "d" is not in "chord"
  assert.equal(valueInText('d', 'chord D major'), true);
});

test('plain multi-command gold: lower-cased strings; context-dependent segments carry no target', () => {
  assert.equal(lowerStrings('a.t="C C F A" n=3'), 'a.t="c c f a" n=3');
  assert.equal(segmentTarget({ target: 'x="Hansel"', context: [] }, 'plain'), 'x="hansel"');
  assert.equal(segmentTarget({ target: 'x="Hansel"', context: [] }, 'clean'), 'x="Hansel"');
  assert.equal(segmentTarget({ target: 'x=plum', context: ['Amy has 8 plums.'] }, 'clean'), null);
});

test('the labelled world reads, not the all-worlds router', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const text = 'add milk to my shopping list, is there milk on it';
  const own = await runAttempt(engine, { tab: 'editor', text, world: 'kids.tasks' });
  assert.deepEqual(own.worlds, ['kids.tasks']);
  const read = makeReader(engine);
  const bad = '@w1 core.request\n    core.request.action=music.melodyAdd\n    core.request.arg.notes="milk to my shopping list, is there milk on it"\n';
  const j = await judge({ engine, read }, { id: 't', world: 'kids.tasks', text, context: [], tab: null, target: bad, label_status: 'rules-own' });
  assert.equal(j.cause, 'gold_target_from_another_world');
  assert.ok(['relabel', 'needs_review'].includes(j.fix.kind));
});
