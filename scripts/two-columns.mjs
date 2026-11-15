#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Two columns of one measure (Q48: rules alone / rules + proposer; translation arms): an owner-session result pair or a real-set result pair, turn by turn: the totals,
 * right / honest / wrong executions, and the turns won and lost (ids, text, replies).
 *
 *   node scripts/two-columns.mjs <result A.json> <result B.json> [--lang ro|en] [--json out.json]   (--lang: real-set rows of that language only)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const langArg = process.argv.indexOf('--lang');
const onlyLang = langArg > 0 ? process.argv[langArg + 1] : null;
const [fa, fb] = process.argv.slice(2).filter((x, i, a) => !x.startsWith('--') && !(a[i - 1] === '--lang' || a[i - 1] === '--json'));
const outArg = process.argv.indexOf('--json');
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
const realText = (() => { try { return Object.fromEntries(readFileSync('training/eval/real-2026-11-15.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.id, x]; })); } catch { return {}; } })();
const key = (r, i) => `${r.set ?? ""}#${r.id ?? ""}#${r.text ?? ""}#${i}`;   // rows of both runs come in the same order (variant rows carry no id)
// the class of a turn: right; honest (nothing changed, nothing claimed); wrong execution (something changed and the turn is not right)
const cls = (r) => {
  if (r.verdict !== undefined) {   // real set row
    if (r.verdict === 'right') return 'right';
    if (r.outcome === 'executed' && ['wrong', 'changed', 'partly'].includes(r.verdict)) return 'wrong-exec';
    if (r.outcome === 'executed' && r.verdict == null) return 'executed-unjudged';
    return r.verdict == null ? `unjudged-${r.outcome}` : 'honest';
  }
  if (!r.judged) return 'context';
  if (r.right) return 'right';
  return r.content ? 'wrong-exec' : 'honest';
};
if (onlyLang) { A.rows = A.rows.filter((r) => realText[r.id]?.lang === onlyLang); B.rows = B.rows.filter((r) => realText[r.id]?.lang === onlyLang); }
const median = (rows) => { const v = rows.map((r) => r.ms).filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const p90 = (rows) => { const v = rows.map((r) => r.ms).filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.9)] : null; };
const mb = new Map(B.rows.map((r, i) => [key(r, i), r]));
const tally = (rows) => { const t = {}; for (const r of rows) { const c = cls(r); t[c] = (t[c] ?? 0) + 1; } return t; };
const won = [], lost = [], changed = [];
for (const [i, a] of A.rows.entries()) {
  const b = mb.get(key(a, i));
  if (!b) continue;
  const ca = cls(a), cb = cls(b);
  const text = a.text ?? realText[a.id]?.text ?? '';
  const line = { id: `${a.set ?? ""}#${a.id ?? i}`, text, a: ca, b: cb, replyA: String(a.reply ?? '').slice(0, 120), replyB: String(b.reply ?? '').slice(0, 120) };
  if (ca !== 'right' && cb === 'right') won.push(line);
  else if (ca === 'right' && cb !== 'right') lost.push(line);
  else if (ca !== cb || String(a.reply ?? '') !== String(b.reply ?? '')) changed.push(line);
}
const res = { a: fa, b: fb, totalsA: tally(A.rows), totalsB: tally(B.rows), won, lost, changed };
console.log(JSON.stringify({ n: A.rows.length, totalsA: res.totalsA, totalsB: res.totalsB, msA: [median(A.rows), p90(A.rows)], msB: [median(B.rows), p90(B.rows)], won: won.length, lost: lost.length, changed: changed.length }));
for (const [n, l] of [['WON', won], ['LOST', lost], ['CHANGED', changed]]) for (const x of l) console.log(`${n} ${x.id} ${x.text} | ${x.a} -> ${x.b} | A: ${x.replyA} | B: ${x.replyB}`);
if (outArg > 0) writeFileSync(process.argv[outArg + 1], JSON.stringify(res, null, 1));
