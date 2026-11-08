#!/usr/bin/env node
/**
 * Prints the patterns that the request shapes (`core.shape`) of a world generate, as SOP Lang (L6, spec 03 section 2b).
 *
 *   node scripts/expand-patterns.mjs <world> [--shape <id>] [--stats]
 *
 * The output is exactly what the loader appends to the world's own patterns, so it can be pasted into `patterns.sop` to freeze a shape
 * (and then the shape deleted). `--stats` prints counts per shape and form instead. Problems found by `checkPattern` go to stderr.
 */
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

const args = process.argv.slice(2);
const only = args.includes('--shape') ? args[args.indexOf('--shape') + 1] : null;
const world = args.find((a) => !a.startsWith('--') && a !== only);
if (!world) { console.error('usage: node scripts/expand-patterns.mjs <world> [--shape <id>] [--stats]'); process.exit(2); }
const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const w = set.get(world);
if (!w) { console.error(`unknown world '${world}'`); process.exit(2); }
const q = (s) => JSON.stringify(s);
const generated = w.patterns.filter((p) => p.shape && (!only || p.shape === `shape.${only}`));
if (args.includes('--stats')) {
  const by = new Map();
  for (const p of generated) { const k = `${p.shape} ${p.form}`; by.set(k, (by.get(k) ?? 0) + 1); }
  for (const [k, n] of by) console.log(`${k}: ${n}`);
  console.log(`total ${generated.length} generated patterns from ${w.shapes.length} shapes; match text ${generated.reduce((n, p) => n + p.match.length, 0)} bytes`);
} else {
  for (const p of generated) {
    console.log(`@${p.id} core.pattern\n    match=${q(p.match)}\n    emit=${q(p.emit)}\n    kind=${p.kind}\n    priority=${p.priority}`);
    for (const e of p.examples) console.log(`    example=${q(e)}`);
    console.log('');
  }
}
for (const e of w.errors) console.error(`problem: ${e.file ?? ''} ${e.message}`);
