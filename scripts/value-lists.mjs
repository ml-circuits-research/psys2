#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THIN LIVE WORLDS item 4 (worker-tasks 2026-11-14 06:20): "a world never declares a value list that a knowledge world has".
 * Audit: every hand-written `core.lexicon` of a tab world (`*.extra.sop`, `lexicon.sop` of the rule worlds) with how many of its words the catalog already has,
 * and in which knowledge world (the catalog's vocab.json maps a word to the shards that have it).
 *
 *   node scripts/value-lists.mjs <catalog dir> [--json]
 * A list whose words are mostly in one knowledge world is a candidate to be replaced by a lookup (the open lexicon `open=knowledge`); a list with none is the world's own.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cat = process.argv[2] ?? process.env.PSYS2_KNOWLEDGE;
if (!cat || !existsSync(join(cat, 'vocab.json'))) { console.error('usage: node scripts/value-lists.mjs <catalog dir with vocab.json>'); process.exit(2); }
const vocab = JSON.parse(readFileSync(join(cat, 'vocab.json'), 'utf8'));
const worldOf = (w) => (vocab[w] ?? []).map((s) => s.split('/')[0]);
const isGenerated = (t) => /GENERATED|Generated (from|by)/.test(t.split('\n').slice(0, 4).join('\n'));

const rows = [];
for (const w of readdirSync(join(REPO, 'worlds'))) {
  for (const f of readdirSync(join(REPO, 'worlds', w)).filter((x) => /^(lexicon.*|.*\.extra)\.sop$/.test(x))) {
    const text = readFileSync(join(REPO, 'worlds', w, f), 'utf8');
    if (isGenerated(text)) continue;
    for (const b of text.split(/\n(?=@)/)) {
      const m = /^@(\S+)\s+core\.lexicon\b/.exec(b);
      if (!m) continue;
      const words = [...b.matchAll(/\bword=(\S+)/g)].map((x) => x[1].replace(/_/g, ' ').toLowerCase());
      if (words.length < 8) continue;
      const by = {};
      let hit = 0;
      for (const x of words) { const ws = [...new Set(worldOf(x).filter((k) => /^k\./.test(k)))]; if (ws.length) hit++; for (const k of ws) by[k] = (by[k] ?? 0) + 1; }
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3);
      rows.push({ world: w, file: f, lexicon: m[1].replace(/^lex\./, ''), words: words.length, inKnowledge: hit, share: hit / words.length, top: top.map(([k, n]) => `${k} ${n}`).join(', ') });
    }
  }
}
rows.sort((a, b) => b.words - a.words);
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else {
  console.log('| world | lexicon | words | in a k.* world | share | most in |\n| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.world} | ${r.lexicon} | ${r.words} | ${r.inKnowledge} | ${Math.round(100 * r.share)}% | ${r.top || '-'} |`);
}
