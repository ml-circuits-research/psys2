#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX4-B: documentation of every NX operation id (request:<action> from operations.sop, domain wire types and question types from legend.sop).
//   node scripts/export-nx-opdocs.mjs [--out /home/salboaie/work/psys2/training/dataset/nx/opdocs.json]
import { writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/home/salboaie/work/psys2/training/dataset/nx/opdocs.json';
const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const docs = {};
for (const w of set.list()) {
  for (const op of w.operations) if (op.action) docs[`request:${op.action}`] = { world: w.id, doc: op.doc ?? '', example: '' };
}
for (const [name, t] of set.legends.types) {
  docs[name] = { world: t.worldId, doc: t.doc ?? '', example: (t.examples ?? [])[0] ?? '' };
}
writeFileSync(out, JSON.stringify(docs, null, 0) + '\n');
console.log(`${Object.keys(docs).length} entries -> ${out}`);
