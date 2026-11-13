#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The scaling indicators of Q10 item 1 (owner-agreed, 2026-11-14), recorded in training/eval/indicators.json and shown by scripts/landing-table.mjs next to the other measures that count:
 *
 *   seating60     a new world from a schema alone: the share of 60 natural requests (scripts/exp-seating.mjs, written without seeing the grammar) answered right. The judging is BY HAND (the reply is read against the
 *                 state), so it is set with `--set seating60 <right> <total> "<note>"`; `--seating` re-runs exp-seating and records how many requests the rules READ (not the judged number).
 *   robustness    the three robustness sets (typos, loose-words, paraphrases-rt) in the rules configuration: `--ablation <dir>/rules-C.json` (the result file of scripts/eval-ablation.mjs, outcome right / total without skipped rows).
 *   richest       the richest world on acts: the schema world with the most schema lines, the share of ITS OWN tests it passes (`--richest`, runs `test-world <id>`; a pilot under worlds-pilot is run with `--root worlds-pilot`).
 *   Cross-world captures (a world answering another world's sentence; target 0) are not stored: landing-table.mjs counts them live from the case corpus (groups "wrong world routing" and "foreign-world reading").
 *
 *   node scripts/indicators.mjs --ablation <file> | --richest | --seating | --set seating60 31 60 "by hand, ..."   (any combination; prints the file)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = join(REPO, 'training/eval/indicators.json');
export const read = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };
const build = () => spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
const today = () => new Date().toISOString().slice(0, 10);

/** { typos: { right, total }, ... } from a result file of scripts/eval-ablation.mjs (rows { set, outcome }; `skip` rows are not counted). */
export function robustness(file) {
  const rows = JSON.parse(readFileSync(file, 'utf8')).rows;
  const out = {};
  for (const set of ['typos', 'loose-words', 'paraphrases-rt']) {
    const r = rows.filter((x) => x.set === set && x.outcome !== 'skip');
    out[set] = { right: r.filter((x) => x.outcome === 'right').length, total: r.length };
  }
  return out;
}

/** The schema world with the most schema lines (worlds/ first, then worlds-pilot), and its own tests' pass count. */
export function richest() {
  const cand = [];
  for (const root of ['worlds', 'worlds-pilot']) {
    const d = join(REPO, root);
    if (!existsSync(d)) continue;
    for (const id of readdirSync(d)) { const f = join(d, id, 'schema.sop'); if (existsSync(f) && existsSync(join(d, id, 'tests.sop'))) cand.push({ id, root, lines: readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length }); }
  }
  // the richest world on acts is the drawing board while it exists as a schema world (the pilot or the switched world); otherwise the one with the most schema lines
  const pick = cand.find((c) => c.id === 'art.draw') ?? cand.sort((a, b) => b.lines - a.lines)[0];
  if (!pick) return null;
  const args = ['src/cli.mjs', 'test-world', pick.id, ...(pick.root === 'worlds-pilot' ? ['--root', 'worlds-pilot'] : [])];
  const r = spawnSync('node', args, { cwd: REPO, encoding: 'utf8', timeout: 600000 });
  const m = /(\d+)\/(\d+) passed/.exec(`${r.stdout}${r.stderr}`);
  return { world: pick.id, where: pick.root, schemaLines: pick.lines, right: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const data = read();
  const stamp = { date: today(), build: build() };
  const at = (k) => argv.indexOf(k);
  if (at('--ablation') >= 0) data.robustness = { ...stamp, config: 'rules-C', ...robustness(argv[at('--ablation') + 1]) };
  if (at('--richest') >= 0) data.richest = { ...stamp, ...richest() };
  if (at('--set') >= 0) { const i = at('--set'); data[argv[i + 1]] = { ...stamp, right: Number(argv[i + 2]), total: Number(argv[i + 3]), note: argv[i + 4] ?? '' }; }
  if (at('--seating') >= 0) {
    const dir = mkdtempSync(join(tmpdir(), 'indicators-')), out = join(dir, 'seating.jsonl');
    spawnSync('node', ['scripts/exp-seating.mjs', '--out', out], { cwd: REPO, encoding: 'utf8', timeout: 600000 });
    const rows = readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    rmSync(dir, { recursive: true, force: true });
    data.seating60 = { ...(data.seating60 ?? {}), read: rows.filter((x) => x.pattern && x.pattern !== 'unknown').length, readOf: rows.length, readDate: stamp.date };
  }
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
  console.log(JSON.stringify(data, null, 1));
}
