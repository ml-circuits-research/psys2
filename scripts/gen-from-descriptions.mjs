#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3 (spec 03 section 2c): print the patterns generated from the `core.describe` wires of a world, as SOP, or statistics.
 *
 *   node scripts/gen-from-descriptions.mjs <world> [--describe <id>] [--lang ro] [--stats] [--json]
 *
 * The loader reads `describe.sop` only when PSYS_GEN_PATTERNS=add|only; this script sets it to `add` itself. `--lang ro` prints the patterns of the
 * Romanian language pack (lang/ro/, spec 03 section 2c) instead of the English ones.
 */
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : null;
globalThis.PSYS_GEN_PATTERNS = 'add';
if (lang) globalThis.PSYS_GEN_LANG = lang;
const [world] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--lang' && all[i - 1] !== '--describe');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const w = set.worlds.get(world);
if (!w) { console.error(`unknown world '${world}'`); process.exit(1); }
const only = arg('describe');
const gen = w.patterns.filter((p) => p.generatedFrom && (lang ? p.lang === lang : !p.lang) && (!only || p.generatedFrom === `describe.${only}`));
const errs = w.errors.filter((e) => e.file === 'describe.sop');
if (process.argv.includes('--json')) console.log(JSON.stringify({ world, descriptions: w.descriptions.length, generated: gen.length, errors: errs }, null, 1));
else if (process.argv.includes('--stats')) {
  const by = new Map();
  for (const p of gen) by.set(p.generatedFrom, (by.get(p.generatedFrom) ?? 0) + 1);
  for (const [k, n] of by) console.log(`${k}\t${n}`);
  console.log(`total\t${gen.length}\terrors\t${errs.length}`);
  for (const e of errs.slice(0, 10)) console.log('ERROR', e.message);
} else {
  for (const p of gen) console.log(`@${p.id} core.pattern\n    match="${p.match}"\n    emit="${p.emit.replace(/\n/g, '\\n')}"\n    kind=${p.kind}\n    priority=${p.priority}\n${p.examples.map((e) => `    example="${e}"\n`).join('')}`);
  for (const e of errs) console.error('ERROR', e.message);
}
