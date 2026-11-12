#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E2, step 3: the library's reader core (`interpret` over `core.word` facts, split candidates, `score`, `veto`) on the messages of the E1 sets that belong to a world with
 * words. Measurement only: the library's reading is compared with what the rules did (the rows of `scripts/e1-collect.mjs`), nothing is acted on.
 *
 *   node scripts/e2-splits.mjs --rows <f-rules-off.json> [--world kids.shop] [--out <file.json>]
 *
 * The words are the world's `describe.sop` `core.word` facts (E3b) plus, for a world whose lexicon lists the values of a slot, one `core.word` per value
 * (`valueWords`). Only words whose `means` the matrix knows are read by the library (kids.shop: all; geo.map and docs.editor: their `means` are emit keys of the
 * descriptions, not names of the matrix, so the library reports `unknown-word` for 341 and 247 of them and reads nothing).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { readText, valueWords } from '../src/dialog/word-reader.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const WORLD = arg('world', 'kids.shop');
const rows = JSON.parse(readFileSync(arg('rows'), 'utf8')).rows.filter((r) => r.world === WORLD && r.kind !== 'dialogue-turn');

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const session = engine.createSession({ language: 'en' });
const base = session.isession.rs.peek(WORLD);
const describe = readFileSync(new URL(`../worlds/${WORLD}/describe.sop`, import.meta.url), 'utf8');
const lexicon = readFileSync(new URL(`../worlds/${WORLD}/lexicon.sop`, import.meta.url), 'utf8');
const items = [...lexicon.matchAll(/^\s+word=(\w+)$/gm)].map((m) => m[1]);
const wordWires = describe.split('\n').filter((l) => l.startsWith('@w.') && l.includes('core.word')).join('\n');
const SLOT = { 'kids.shop': 'kids.shop.price.item' }[WORLD];

const out = { world: WORLD, rows: rows.length, bySet: {}, cases: [] };
for (const r of rows) {
  const w = base.fork();
  w.tell(wordWires);
  if (SLOT && items.length) w.tell(valueWords(items, SLOT));
  const text = r.english ?? r.message;
  let read;
  try { read = readText(w, text); } catch (e) { read = { error: String(e.message).slice(0, 100), candidates: [] }; }
  const set = (out.bySet[r.set] ??= { n: 0, candidates: 0, judged: 0, answer: 0, split: 0, rightRules: 0, answerOnNonRight: 0, answerOnRight: 0, agreeOnRight: 0 });
  set.n++;
  const ok = r.outcome === 'right';
  if (ok) set.rightRules++;
  if (read.candidates.length) set.candidates++;
  const top = read.top;
  const judged = read.results?.[read.order?.[0]]?.judged;
  if (judged) set.judged++;
  if (top?.parts) set.split++;
  const answer = read.veto?.answer === true;
  if (answer) { set.answer++; ok ? set.answerOnRight++ : set.answerOnNonRight++; }
  const op = (r.segments ?? []).map((s) => /pat\.kids\.shop\.(?:[a-z0-9]+\.)*?(total|price|change|purchase|income|expense|leftafter|affordability|balance|money)/.exec(s.pattern ?? '')?.[1]).filter(Boolean);
  const wires = top ? (top.parts ?? [top]).map((p) => p.wires).join(' + ') : null;
  const agree = answer && op.length && op.some((o) => wires.includes(`kids.shop.${o}`));
  if (agree && ok) set.agreeOnRight++;
  if (!ok || (answer && ok && op.length && !agree)) out.cases.push({ set: r.set, id: r.id, text, rules: r.outcome, rulesOps: op, library: wires, answer, reasons: read.veto?.reasons?.map((x) => x.reason) ?? null, split: !!top?.parts });
}
const o = arg('out');
if (o) writeFileSync(o, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.bySet, null, 1));
console.log('cases listed:', out.cases.length);
