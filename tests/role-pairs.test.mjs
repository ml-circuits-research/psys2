import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { normalizedSop } from '../scripts/collect-paraphrases.mjs';

// Contrastive role pairs (review F7): same words, different roles -> the rule formalizer must give different SOPs.
const pairs = readFileSync(new URL('../training/eval/role-pairs.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('role pairs: every side parses by its atomic steps and the two sides mean different things', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const sopOf = async (setup, steps) => {
    const s = engine.createSession();
    for (const m of setup) await s.send(m);
    const wires = [];
    for (const m of steps) {
      const r = await s.send(m);
      assert.ok(r.segments.every((x) => !x.unparsed), `step not parsed: ${m}`);
      for (const x of r.segments) wires.push(...x.wires);
    }
    return normalizedSop(wires, engine.set.legends);
  };
  assert.ok(pairs.length >= 100);
  for (const p of pairs.filter((_, i) => i % 3 === 0)) {
    const a = await sopOf(p.setup, p.a.steps), b = await sopOf(p.setup, p.b.steps);
    assert.notDeepEqual(a, b, `${p.id}: ${p.a.text} vs ${p.b.text}`);
  }
});
