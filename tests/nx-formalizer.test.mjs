// SPDX-License-Identifier: AGPL-3.0-only
// NX5 unit tests: the pattern index of the NX formalizer, and (when an onnxruntime-node entry and an NX export are available through
// NX_ORT / NX_EXPORT) one model reading through the real engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadSet } from '../scripts/lib/nx-read.mjs';
import { buildPatternIndex, gateFeatures, rulesCover, opOfWires } from '../scripts/lib/nx-formalizer.mjs';

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

test('NX7 gate features: spans inside the frame, frame score, covered words', () => {
  const rec = idx.get('request:tasks.add').find((r) => r.p.id === 'pat.kids.tasks.add1');
  const tag = [...rec.slotOfTag.keys()].find((t) => t.endsWith('.item'));
  const text = 'add buy milk to my to-do list';
  const s = text.indexOf('buy milk');
  const f = gateFeatures({ r: rec, extra: 0, fr: 1 }, text, new Map([[tag, { s, e: s + 8 }]]), 0.97);
  assert.equal(f.op, 0.97);
  assert.ok(f.cover >= 2 && f.cover <= f.words);
  // a span placed outside the pattern's slot position (before the leading frame word) is not inside the frame
  const g = gateFeatures({ r: rec, extra: 0, fr: 1 }, 'buy milk add to my to-do list', new Map([[tag, { s: 0, e: 8 }]]), 0.97);
  assert.equal(g.inFrame, false);
  // a span of another pattern (extra) breaks the frame check
  assert.equal(gateFeatures({ r: rec, extra: 1, fr: 1 }, text, new Map([[tag, { s, e: s + 8 }]]), 0.97).inFrame, false);
});

test('NX7 rules coverage: ignored words and best-effort guesses are not covered; the operation of wires', () => {
  assert.equal(rulesCover({ text: 'please add milk now' }), 4);
  assert.equal(rulesCover({ text: 'please add milk now', ignored: ['please'] }), 3);
  assert.equal(rulesCover({ text: 'please add milk now', bestEffort: { ignored: [{ text: 'now' }] } }), 3);
  const wire = { type: 'core.request', entries: [{ key: 'core.request.action', value: { v: 'tasks.add' } }] };
  assert.equal(opOfWires([{ type: 'core.agent', entries: [] }, wire]), 'request:tasks.add');
});
