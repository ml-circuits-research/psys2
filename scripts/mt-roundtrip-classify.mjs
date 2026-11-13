#!/usr/bin/env node
/**
 * ROUND-TRIP-MINING step 2: classify every failed round-trip case (verdict not "right") as
 *   mt-wrong      the model changed the meaning (a number, a name, a negation or the content words of the original are not in the English that came back)
 *   judge-strict  the meaning came back and we read it right, but the judge compares UI words (every state and effect expectation holds, only an answer substring differs)
 *   reader-gap    the meaning came back (mechanical checks pass) and we do not read it
 *   original-fails  the English original itself is not read right (a gap of the world, not of the translation; counted apart)
 * Mechanical checks (pure, exported for the tests): numbers, quoted/capitalised names, negation, content-word overlap.
 *
 *   node scripts/mt-roundtrip-classify.mjs <cases.jsonl> [--write] [--md]   prints the shares per language; --write rewrites the file with a "class" field
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { numbersInText } from './lib/operational-check.mjs';

const STOP = new Set('a an the to of and or in on at for with by it its is are was were be me my i you your we our this that these those please pls can could would will do does did just some any then there here from as into up'.split(' '));
const NEG = /\b(?:not|no|never|none|nothing|without|cannot|(?:do|does|did|is|are|was|were|can|could|will|would|should|has|have|had)n['’]?t|don['’]?t|can['’]?t|won['’]?t)\b/i;
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export const words = (s) => String(s).toLowerCase().replace(/['’]s\b/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const stem = (w) => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w);
export const contentWords = (s) => words(s).filter((w) => !STOP.has(w) && !(w in NUMW) && !/^\d/.test(w)).map(stem);
export const numberSet = (s) => new Set([...numbersInText(s), ...words(s).filter((w) => w in NUMW).map((w) => NUMW[w])]);
/** Names: quoted strings and capitalised words that do not start the sentence. */
export function names(s) {
  const out = new Set();
  for (const m of String(s).matchAll(/"([^"]+)"|“([^”]+)”/g)) out.add((m[1] ?? m[2]).toLowerCase());
  const toks = String(s).split(/\s+/);
  toks.forEach((t, i) => { const w = t.replace(/^\W+|\W+$/g, ''); if (i > 0 && /^\p{Lu}\p{L}+$/u.test(w) && w !== 'I') out.add(w.toLowerCase()); });
  return out;
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export function mechanical(original, back) {
  const nums = sameSet(numberSet(original), numberSet(back));
  const neg = NEG.test(original) === NEG.test(back);
  const nm = [...names(original)].every((n) => String(back).toLowerCase().includes(n));
  const a = new Set(contentWords(original)), b = new Set(contentWords(back));
  const inter = [...a].filter((x) => b.has(x)).length;
  const overlap = a.size ? inter / a.size : 1;   // share of the original's content words that survive
  const extra = b.size ? [...b].filter((x) => !a.has(x)).length / b.size : 0;   // share of the new content words (words the model made up)
  const ow = words(original).filter((w) => !STOP.has(w))[0], bw = new Set(words(back).map(stem));
  const head = !ow || bw.has(stem(ow));   // the command verb / question word of the original survives
  const q = (t) => /\?\s*$/.test(t) || /^\s*(?:what|how|which|who|where|when|why|can|is|are|does|do|did)\b/i.test(t);
  const form = q(original) === q(back);   // a question stays a question
  return { nums, neg, names: nm, overlap: Math.round(overlap * 100) / 100, extra: Math.round(extra * 100) / 100, head, form };
}

export function classify(row) {
  if (row.verdict === 'right') return null;
  if (row.original_verdict && row.original_verdict !== 'right') return 'original-fails';   // the English original is not read right either: not a round-trip loss
  const m = mechanical(row.original, row.back_translation);
  const failing = row.reading?.failing ?? [];
  if (m.nums && m.neg && m.names && failing.length && failing.every((f) => f.startsWith('answer:')) && !/did not understand|understood only|did not use|Did you mean|don.t know|do not know|I took that as|^OK|remember/i.test(row.reading?.reply ?? '')) return 'judge-strict';
  if (!m.nums || !m.neg || !m.names || !m.head || !m.form || m.overlap < 0.75 || m.extra > 0.34) return 'mt-wrong';
  return 'reader-gap';
}

if (process.argv[1]?.endsWith('mt-roundtrip-classify.mjs')) {
  const file = process.argv[2];
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const r of rows) { const c = classify(r); if (c) r.class = c; else delete r.class; }
  const langs = [...new Set(rows.map((r) => r.lang))];
  const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
  const table = {};
  for (const l of langs) {
    const rs = rows.filter((r) => r.lang === l), fails = rs.filter((r) => r.class);
    const n = (k) => fails.filter((r) => r.class === k).length;
    table[l] = { cases: rs.length, right: rs.length - fails.length, rightPct: pct(rs.length - fails.length, rs.length), failures: fails.length, mtWrong: n('mt-wrong'), readerGap: n('reader-gap'), judgeStrict: n('judge-strict'), originalFails: n('original-fails'),
      mtWrongPct: pct(n('mt-wrong'), fails.length), readerGapPct: pct(n('reader-gap'), fails.length), judgeStrictPct: pct(n('judge-strict'), fails.length) };
  }
  if (process.argv.includes('--write')) writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(JSON.stringify(table, null, 1));
}
