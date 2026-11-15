#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * How many proposer rows carry a label the rules cannot produce on that sentence (coordinator 2026-11-16): a sample of the rows of each source is read by readRequest as
 * written; the row counts as "beyond the rules" when that reading is incomplete (unread words, nothing read) or says something else than the row's label.
 *
 *   node scripts/request-label-share.mjs [--data training/data/request-proposer/train.jsonl] [--per-source 150]
 */
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { requestLanguage, liveWorld, readTurn } from '../src/dialog/request.mjs';
import { signatureOf } from '../src/dialog/proposer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rows = readFileSync(arg('data', 'training/data/request-proposer/train.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const language = requestLanguage(lib);
const lives = {};
const per = Number(arg('per-source', 150));
const by = {};
for (const r of rows) (by[r.source] ??= []).push(r);
const out = {};
for (const [src, rs] of Object.entries(by)) {
  const step = Math.max(1, Math.floor(rs.length / per));
  let n = 0, beyond = 0;
  for (let i = 0; i < rs.length && n < per; i += step) {
    const r = rs[i];
    lives[r.world] ??= liveWorld(lib, engine.set.get(r.world));
    const q = readTurn(lib, lives[r.world], language, r.words.join(' '), {});
    const complete = !q.unread.length && !!(q.act || q.target || q.reaction || q.request.constraints?.length || q.request.refers);
    if (!complete || signatureOf(q.request) !== r.sig) beyond++;
    n++;
  }
  out[src] = { rows: rs.length, sampled: n, beyond_rules: beyond, share: +(beyond / n).toFixed(3) };
}
const total = Object.values(out).reduce((a, x) => a + x.rows * x.share, 0);
console.log(JSON.stringify({ by_source: out, estimated_rows_beyond_rules: Math.round(total), of: rows.length, share: +(total / rows.length).toFixed(3) }, null, 1));
