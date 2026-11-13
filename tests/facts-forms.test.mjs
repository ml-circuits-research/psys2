// SPDX-License-Identifier: AGPL-3.0-only
// Two invariants of the generic catalog reading (facts.mjs), on a synthetic catalog (no network, no fixture folder):
//  1. a word form that the catalog only lists as `core.word text=<form> means=<name> of=<type>.name` ("ants" of "ant") is the thing of that name;
//  2. a vocabulary entry that names a schema file by its own path (`k.x/schema.sop`, as the catalog's index does) is read at that path, never at `<path>.sop`, and a read that finds
//     the file does not make the catalog "unreachable".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacts } from '../src/knowledge/facts.mjs';

const files = {
  'index.json': JSON.stringify({ worlds: [{ id: 'k.t', exports: ['k.t.animal'], shards: [{ id: 'k.t/shards/a', keys: ['ant', 'ants'] }] }] }),
  'vocab.json': JSON.stringify({ ant: ['k.t/shards/a'], ants: ['k.t/shards/a'], baby: ['k.t/schema.sop'] }),
  'k.t/shards/a.sop': '@k.t.animal.ant k.t.animal name=ant legs=6\n@k.t.word.ant core.word text=ants means=ant of=k.t.animal.name\n',
  'k.t/schema.sop': '@k.t core.module name=k.t\n',
};
const source = { text: async (p) => files[p] ?? null };

test('a plural the catalog lists as a form of a name is the thing of that name', async () => {
  const f = createFacts({ source });
  const th = await f.thing('ants');
  assert.equal(th?.name, 'ant');
  assert.ok(th.wires.some((w) => w.type === 'k.t.animal'));
});

test('a schema file named by its own path is read, and the catalog stays reachable', async () => {
  const f = createFacts({ source });
  await f.thing('baby');
  assert.equal(f.unreachable(), false);
});
