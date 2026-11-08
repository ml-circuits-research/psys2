import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { exportTraining, mulberry32, seedOf, splitOf, canonicalWires } from '../scripts/export-training.mjs';

const ROOT = fileURLToPath(new URL('../worlds', import.meta.url));
const WORLDS = ['kids.common', 'kids.arith', 'kids.shop', 'kids.time', 'kids.animals', 'kids.shapes', 'kids.tasks', 'games.tictactoe', 'games.guess', 'games.hangman', 'ui.shell'];
const KIDS = WORLDS.filter((w) => w.startsWith('kids.'));
const load = (id) => import(pathToFileURL(path.join(ROOT, id, 'datagen.mjs')).href);

test('export helpers: seeds are stable, splits depend on the group only, canonical form ignores ids and bookkeeping', () => {
  assert.equal(seedOf('kids.arith', '1'), seedOf('kids.arith', '1'));
  assert.notEqual(seedOf('kids.arith', '1'), seedOf('kids.arith', '2'));
  assert.equal(splitOf('kids.arith', 'g1'), splitOf('kids.arith', 'g1'));
  const a = parse('@w1 kids.arith.holding owner=$e.tom count=5 item=apple core.seq=3 core.via=$p core.in=$kids.arith core.source="m#0-5"').wires;
  const b = parse('@x9 kids.arith.holding item=apple count=5 owner=$e.tom').wires;
  assert.deepEqual(canonicalWires(a), canonicalWires(b));
});

for (const id of WORLDS) {
  test(`datagen ${id}: deterministic for a seed, valid SOP Lang, >= 5 phenomena, negatives present`, async () => {
    assert.ok(existsSync(path.join(ROOT, id, 'datagen.mjs')), `${id} has no datagen.mjs`);
    const mod = await load(id);
    assert.equal(typeof mod.version, 'string');
    const seed = seedOf(id, mod.version);
    const a = mod.generate({ rng: mulberry32(seed), count: 400 });
    const b = mod.generate({ rng: mulberry32(seed), count: 400 });
    assert.deepEqual(a, b, 'same seed, same examples');
    const c = mod.generate({ rng: mulberry32(seed + 1), count: 400 });
    assert.notDeepEqual(a, c, 'another seed gives other examples');
    assert.ok(a.length >= 200 && a.length <= 400, `${id} produced ${a.length} examples`);
    const seen = new Set();
    for (const ex of a) {
      assert.equal(typeof ex.text, 'string');
      assert.ok(ex.text.trim().length > 0);
      assert.equal(typeof ex.group, 'string');
      assert.equal(typeof ex.phenomenon, 'string');
      const key = JSON.stringify([ex.context ?? [], ex.text]);
      assert.ok(!seen.has(key), `duplicate example ${key}`);
      seen.add(key);
      if (ex.negative) { assert.ok(ex.expect == null, 'negative examples expect nothing'); continue; }
      assert.equal(typeof ex.expect, 'string', `${ex.text}: expect must be SOP text`);
      const { wires, errors } = parse(ex.expect, { source: ex.group });
      assert.deepEqual(errors, [], `${ex.text}: ${errors[0]?.message}`);
      assert.ok(wires.length >= 1, `${ex.text}: expect has no wire`);
    }
    const phenomena = new Set(a.map((e) => e.phenomenon));
    assert.ok(phenomena.size >= 5, `${id} covers ${phenomena.size} phenomena: ${[...phenomena]}`);
    assert.ok(new Set(a.map((e) => e.group)).size >= 8, `${id} has too few groups`);
    assert.ok(a.some((e) => e.negative), 'has negatives');
    assert.ok(a.some((e) => e.negative && e.phenomenon === 'out-of-domain'), 'has out-of-domain negatives');
  });
}

test('datagen: agreement with the rule formalizer and export consistency', async (t) => {
  const lines = [];
  for (const id of WORLDS) {
    const { records, report } = await exportTraining({ root: ROOT, world: id, count: 500, ruleDerived: false });
    const e = report.worlds[id];
    assert.ok(e && !e.generator_error, `${id}: ${e?.generator_error}`);
    assert.equal(e.agreement.invalid_expect, 0, `${id}: expect circuits that do not match the legend`);
    lines.push(`${id}: records=${e.generator_records} agreement=${e.agreement.rate} positives=${e.agreement.positive_rate} negatives=${e.agreement.negative_rate}`);
    if (KIDS.includes(id)) {
      assert.ok(e.agreement.rate >= 0.85, `${id} agreement ${e.agreement.rate} < 0.85`);
      assert.ok(e.agreement.positive_rate >= 0.85, `${id} positive agreement ${e.agreement.positive_rate} < 0.85`);
    }
    // no group straddles train and dev
    const splitOfGroup = new Map();
    for (const r of records.get(id)) {
      assert.ok(['train', 'dev'].includes(r.split));
      assert.equal(splitOfGroup.get(r.group) ?? r.split, r.split, `${id}: group ${r.group} in two splits`);
      splitOfGroup.set(r.group, r.split);
      if (r.label_status === 'generator-backed') assert.ok(r.expected_circuit.length > 0);
    }
  }
  t.diagnostic(lines.join('\n'));
});
