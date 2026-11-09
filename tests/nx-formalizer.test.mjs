// SPDX-License-Identifier: AGPL-3.0-only
// NX5 unit tests: the pattern index of the NX formalizer, and (when an onnxruntime-node entry and an NX export are available through
// NX_ORT / NX_EXPORT) one model reading through the real engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadSet } from '../scripts/lib/nx-read.mjs';
import { buildPatternIndex } from '../scripts/lib/nx-formalizer.mjs';

const set = await loadSet();
const idx = buildPatternIndex(set);

test('every operation has patterns, with slot tags for its keys', () => {
  const add = idx.get('request:tasks.add');
  assert.ok(add?.length >= 3);
  const rec = add.find((r) => r.p.id === 'pat.kids.tasks.add1');
  assert.equal(rec.world, 'kids.tasks');
  assert.equal(rec.slotOfTag.get('kids.tasks|core.request.arg.item'), 'item');
  assert.equal(rec.constOfTag.get('kids.tasks|core.request.arg.list'), 'to-do');
});

test('questions are indexed by type and seek, with a wildcard seek', () => {
  assert.ok(idx.get('question:kids.arith.holding:count')?.length);
  assert.ok(idx.get('question:kids.arith.holding:*')?.length);
  const give = idx.get('kids.arith.give');
  assert.ok(give?.some((r) => r.slotOfTag.get('kids.arith.change.who') === 'who'));
});

test('the frame words of the arithmetic patterns separate minus from plus', () => {
  const calc = idx.get('question:kids.arith.calc:result');
  const minus = calc.find((r) => [...r.frame].includes('minus') && ![...r.frame].includes('plus'));
  const plus = calc.find((r) => [...r.frame].includes('plus') && ![...r.frame].includes('minus'));
  assert.ok(minus && plus);
});

const ort = process.env.NX_ORT, dir = process.env.NX_EXPORT;
test('a model reading goes through the engine (needs NX_ORT and NX_EXPORT)', { skip: !(ort && dir && existsSync(ort) && existsSync(dir)) }, async () => {
  const { buildSystem } = await import('../scripts/lib/nx-runtime.mjs');
  const { sessionOptions } = await import('../src/dialog/runtime-config.mjs');
  const { engine, settings } = await buildSystem({ system: `${dir}-only`, ortPath: ort });
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  const r = await s.send('what is 3 plus 4');
  assert.match(r.text, /7/);
  assert.equal(r.segments[0].strategy, 'encoder');
});
