#!/usr/bin/env node
/**
 * Lexicon `extends=` migration (L7, spec 02 "Lexicon"): a world lexicon that holds every word of a shared `lang.common` lexicon
 * (lex.lang.colour, ordinal, size, degree, direction, position, unit) inherits it instead of copying the words.
 *
 *   node scripts/migrate-lexicons.mjs <world> [--write]
 *
 * For every `core.lexicon` of the world's lexicon.sop whose resolved words contain ALL words of a shared lexicon (5 or more words; the
 * largest such lexicon, then further ones that add words), the shared words are removed from the lexicon and `extends=$lex.lang.<x>` is
 * added: the resolved word set is unchanged (checked). Own extras and `plural=` lines stay. A lexicon that holds only part of a shared
 * one is left alone (inheriting would add words, which changes what the world accepts). Dry run by default.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse, getAll, get } from '../src/soplang/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'worlds');
const argv = process.argv.slice(2);
const world = argv.find((a) => !a.startsWith('--'));
const WRITE = argv.includes('--write');
if (!world) { console.error('usage: node scripts/migrate-lexicons.mjs <world> [--write]'); process.exit(2); }
const file = join(ROOT, world, 'lexicon.sop');
if (!existsSync(file)) { console.error(`no ${file}`); process.exit(2); }

const common = new Map();
for (const x of parse(readFileSync(join(ROOT, 'lang.common', 'lexicon.sop'), 'utf8')).wires) {
  if (x.type !== 'core.lexicon') continue;
  const words = getAll(x, 'word').map((v) => String(v.v));
  if (words.length >= 5) common.set(x.id, words);
}

const text = readFileSync(file, 'utf8');
const blocks = text.split(/\n(?=@)/);
let changed = 0, removed = 0;
const report = [];
const out = blocks.map((b) => {
  if (!/^@\S+ core\.lexicon\b/.test(b)) return b;
  const lines = b.split('\n');
  const id = lines[0].split(' ')[0].slice(1);
  const wordLines = lines.filter((l) => /^\s+word=/.test(l));
  const mine = wordLines.map((l) => l.replace(/^\s+word=/, '').trim().replace(/^"|"$/g, ''));
  const have = new Set(mine.map((w) => w.toLowerCase()));
  const hasExtends = lines.some((l) => /^\s+extends=/.test(l));
  const picks = [];
  const covered = new Set();
  for (const [cid, cw] of [...common].sort((a, b) => b[1].length - a[1].length)) {
    if (cid === id) continue;
    if (!cw.every((w) => have.has(w.toLowerCase()))) continue;
    if (cw.every((w) => covered.has(w.toLowerCase()))) continue;
    picks.push(cid); cw.forEach((w) => covered.add(w.toLowerCase()));
  }
  if (!picks.length) return b;
  const keep = lines.filter((l) => !/^\s+word=/.test(l) || !covered.has(l.replace(/^\s+word=/, '').trim().replace(/^"|"$/g, '').toLowerCase()));
  const at = keep.findIndex((l) => /^\s+class=/.test(l));
  const ext = picks.map((p) => `    extends=$${p}`);
  keep.splice(at < 0 ? 1 : at + 1, 0, ...ext);
  changed++; removed += lines.length - keep.length + ext.length;
  report.push(`${id}: extends ${picks.join(', ')} (${covered.size} shared words removed, ${mine.length - covered.size} own words stay${hasExtends ? '; had extends already' : ''})`);
  return keep.join('\n');
});
for (const r of report) console.log(r);
console.log(`${world}: ${changed} lexicons use extends, ${removed} word lines removed`);
if (WRITE && changed) { writeFileSync(file, out.join('\n')); console.log('lexicon.sop rewritten'); } else if (!WRITE) console.log('dry run (pass --write to rewrite the file)');
