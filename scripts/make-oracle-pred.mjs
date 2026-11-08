#!/usr/bin/env node
/**
 * Synthetic dispatcher predictions from gold labels (an upper bound and a pipeline proof for scripts/eval-dispatch.mjs).
 * Same JSONL contract as the real dispatcher output (spec 03 section 7): one segmentation (the gold one), top-3 worlds per
 * piece with the gold world first, no simplified text. Deterministic.
 *
 * Usage: node scripts/make-oracle-pred.mjs [--out <file>] [--noise <0..1>] [--limit N] [--only single|multi]
 *   --noise  share of pieces where the gold world is moved to rank 2 or 3 (a wrong top-1), by a hash of the record id;
 *            shows the validation layer rejecting and recovering. Default 0 (pure oracle).
 *   --split-noise  share of records that also get a wrong first segmentation (the whole text as one piece) ahead of the gold one.
 * Default output: training/runs/dispatch-oracle/oracle.jsonl
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadGold } from './lib/dispatch-gold.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const h = (s) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16) / 0xffffffff;

export function oraclePrediction(g, { worlds, noise = 0, splitNoise = 0 }) {
  const pick = (id, k) => { let i = Math.floor(h(`${id}|d${k}`) * worlds.length); return worlds[i % worlds.length]; };
  const segments = g.segments.map((s, i) => {
    const id = `${g.id}#${i}`;
    const others = [];
    for (let k = 0; others.length < 2 && k < 20; k++) { const w = pick(id, k); if (w !== s.world && !others.includes(w)) others.push(w); }
    const wrongTop = h(`${id}|noise`) < noise;
    const ranked = wrongTop ? [others[0], s.world, others[1]] : [s.world, others[0], others[1]];
    const sc = wrongTop ? [0.8, 0.15, 0.05] : [0.9, 0.06, 0.04];
    return { start: s.start, end: s.end, text: s.text, worlds: ranked.map((w, j) => ({ world: w, score: sc[j] })) };
  });
  const segmentations = [{ score: -0.05, segments }];
  if (h(`${g.id}|split`) < splitNoise) {
    const first = { start: 0, end: g.text.length, text: g.text, worlds: [{ world: g.segments[0].world, score: 0.9 }] };
    segmentations.unshift({ score: -0.03, segments: [first] });
    segmentations[1].score = -0.5;
  }
  return { id: g.id, text: g.text, context: g.context, boundaries: [], segmentations };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const out = resolve(opt('--out', join(REPO, 'training/runs/dispatch-oracle/oracle.jsonl')));
  const noise = Number(opt('--noise', 0)), splitNoise = Number(opt('--split-noise', 0));
  const only = opt('--only', null), limit = Number(opt('--limit', Infinity));
  const gold = loadGold(join(REPO, 'training/dataset'));
  let ids = only === 'multi' ? gold.multiIds() : only === 'single' ? gold.testIds() : gold.ids();
  ids = ids.slice(0, limit);
  const worlds = gold.worldDirs.filter((w) => w !== 'kids.common' || true);
  const lines = ids.map((id) => JSON.stringify(oraclePrediction(gold.get(id), { worlds, noise, splitNoise })));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} predictions to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
