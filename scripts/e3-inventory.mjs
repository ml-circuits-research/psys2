#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3 inventory: per world and operation key, what the hand-written files already say and what a description adds, and how many lines of
 * hand-written patterns / shapes the generated patterns replace (blocks whose emit key is described).
 *
 *   node scripts/e3-inventory.mjs [--json out.json]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { emitKey, parseArg } from '../src/worlds/describe.mjs';

globalThis.PSYS_GEN_PATTERNS = 'only';
const WORLDS = ['kids.shop', 'geo.map', 'docs.editor'];
const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const read = (w, f) => { const p = join(DEFAULT_ROOT, w, f); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const out = { worlds: {} };
for (const id of WORLDS) {
  const w = set.worlds.get(id);
  const descs = w.descriptions;
  const keys = new Set(descs.map((d) => d.op));
  const blocks = [read(id, 'patterns.sop'), read(id, 'matrix.patterns.sop')].flatMap((t) => t.split(/\n\s*\n/)).filter((b) => /^@\S+ core\.(pattern|shape)\b/m.test(b));
  const keyOf = (b) => emitKey(/emit="([^"\n]*(?:\\"[^"\n]*)*)"/.exec(b)?.[1]?.replace(/\\"/g, '"') ?? '');
  const byKey = new Map();
  for (const b of blocks) {
    const k = keyOf(b) ?? '(none)';
    const e = byKey.get(k) ?? { blocks: 0, lines: 0, slots: new Map() };
    e.blocks++; e.lines += b.split('\n').length;
    for (const m of b.matchAll(/\{(\w+):([\w.]+)(?:\([^)]*\))?\??\}/g)) e.slots.set(`${m[1]}:${m[2]}`, true);
    byKey.set(k, e);
  }
  const opsFile = new Map(w.operations.map((o) => [o.action ?? o.outputs[0]?.replace(/\.\w+$/, ''), o]));
  const ops = [...byKey.entries()].map(([k, e]) => {
    const op = w.operations.find((o) => o.action === k || o.outputs.some((x) => x.startsWith(`${k}.`)) || o.id.endsWith(`.${k.split('.').pop()}`));
    return { key: k, handBlocks: e.blocks, handLines: e.lines, slotsInPatterns: [...e.slots.keys()], inOperationsSop: !!op, operationInputs: op?.inputs.length ?? 0, operationOutputs: op?.outputs.length ?? 0, operationDoc: !!op?.doc, described: keys.has(k) };
  }).sort((a, b) => b.handLines - a.handLines);
  const gen = w.generated ?? { replaced: [], patterns: [] };
  const descLines = read(id, 'describe.sop').split('\n').filter((l) => l.trim()).length;
  const replaced = ops.filter((o) => o.described);
  out.worlds[id] = {
    operationKeysInPatterns: ops.length, operationKeysDescribed: replaced.length, descriptions: descs.length,
    handPatternBlocksTotal: blocks.length, handPatternLinesTotal: blocks.reduce((n, b) => n + b.split('\n').length, 0),
    handBlocksReplaced: replaced.reduce((n, o) => n + o.handBlocks, 0), handLinesReplaced: replaced.reduce((n, o) => n + o.handLines, 0),
    generatedPatterns: gen.patterns.length, descriptionLines: descLines, ops,
    withArgsFromPatternsOnly: replaced.filter((o) => o.operationInputs === 0 && o.slotsInPatterns.length).length,
    describedFieldsUsed: descs.reduce((n, d) => n + ['verb', 'noun', 'ask', 'tverb', 'rest', 'pre', 'mid', 'subject'].filter((k) => d[k]).length, 0),
    requiresDeclared: descs.filter((d) => d.requires.length).length,
  };
}
if (process.argv.includes('--json')) writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(out, null, 1));
for (const [id, v] of Object.entries(out.worlds)) {
  console.log(`${id}: op keys ${v.operationKeysInPatterns}, described ${v.operationKeysDescribed} (${v.descriptions} descriptions, ${v.descriptionLines} lines); hand pattern blocks ${v.handPatternBlocksTotal} / ${v.handPatternLinesTotal} lines, replaced ${v.handBlocksReplaced} / ${v.handLinesReplaced} lines; generated ${v.generatedPatterns}`);
}
