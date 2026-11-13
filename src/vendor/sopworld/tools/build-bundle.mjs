#!/usr/bin/env node
// An offline bundle of a knowledge catalog (Round 24, A1): the shard texts an application
// needs, by path, in one JSON file that `bundleReader` reads with the same catalog code.
//
//   node tools/build-bundle.mjs <catalog dir> <out.json> <word or shard id or world id> ...
//
// The catalog dir holds index.json, vocab.json and the worlds' files (the layout of
// sop-knowledge-worlds' docs/worlds). A word takes the shards the vocabulary gives for it;
// `k.objects/shards/household` takes that shard; `k.colours` takes every shard of the world.
// The schemas they need come along.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog } from '../src/knowledge.mjs';

const [dir, out, ...wanted] = process.argv.slice(2);
if (!dir || !out || !wanted.length) { console.error('usage: node tools/build-bundle.mjs <catalog dir> <out.json> <word|shard|world> ...'); process.exit(1); }
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const vocab = existsSync(join(dir, 'vocab.json')) ? JSON.parse(readFileSync(join(dir, 'vocab.json'), 'utf8')) : {};
const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null);
const cat = createCatalog({ index, vocab, read });
const shards = new Set();
for (const x of wanted) { // bounded: the arguments
  if (cat.worlds().includes(x)) for (const s of cat.shardsOfWorld(x)) shards.add(s);
  else if (x.includes('/')) shards.add(x);
  else { const s = cat.shardsOf(x); if (!s.length) console.error(`no shard holds "${x}"`); for (const y of s) shards.add(y); }
}
const files = {};
for (const p of cat.plan([...shards])) { const t = read(p); if (t === null) console.error(`missing ${p}`); else files[p] = t; }
const used = Object.fromEntries(Object.entries(vocab).map(([w, ss]) => [w, ss.filter((s) => shards.has(s))]).filter(([, ss]) => ss.length));
writeFileSync(out, JSON.stringify({ index: { worlds: index.worlds.map((w) => ({ ...w, shards: (w.shards || []).filter((s) => shards.has(s.id)) })).filter((w) => Object.keys(files).some((p) => p.startsWith(w.id + '/'))) }, vocab: used, files }));
console.log(`${out}: ${Object.keys(files).length} files (${[...shards].length} shards), ${Object.keys(used).length} words, ${Object.values(files).reduce((n, t) => n + t.length, 0)} bytes`);
