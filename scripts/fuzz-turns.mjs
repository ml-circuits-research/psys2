#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Turn fuzzer (HANG + STOP task, spec 06 "Turn lifecycle"): messages from every evaluation set get typo noise (swapped, dropped, doubled
 * characters, merged words, misspelled place names) and go through the full pipeline in the webchat configuration with a per-turn guard
 * (hard deadline, soft deadline). Asserts that every turn settles within the budget; reports the slowest turns, the aborted ones and the
 * stage that bounded them.
 *
 *   node scripts/fuzz-turns.mjs [--n 3000] [--budget 8000] [--soft 5000] [--seed 1] [--mode rules] [--show 10] [--json out.json]
 *
 * Exit code 1 when a turn did not settle, exceeded the budget by more than 1.5 s, or the aborted share is above --max-aborted (default 2 %).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { TurnAborted } from '../src/formalizer/guard.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const N = Number(opt('n', 3000)), BUDGET = Number(opt('budget', 8000)), SOFT = Number(opt('soft', 5000)), SEED = Number(opt('seed', 1)), SHOW = Number(opt('show', 10));
const MAX_ABORTED = Number(opt('max-aborted', 0.02));
const settings = settingsForMode(opt('mode', 'rules'));

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** One noise operation on a random word: swap, drop, double, merge with the next word, or misspell a capitalised (place) name. */
export function addNoise(text, rand) {
  const words = text.split(' ');
  if (!words.length) return text;
  const pick = () => Math.floor(rand() * words.length);
  const nOps = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < nOps; k++) {
    const i = pick(); const w = words[i];
    const op = Math.floor(rand() * 6);
    if (op === 4 && i + 1 < words.length) { words.splice(i, 2, w + words[i + 1]); continue; }
    if (w.length < 3) continue;
    const j = 1 + Math.floor(rand() * (w.length - 2));
    if (op === 0) words[i] = w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);
    else if (op === 1) words[i] = w.slice(0, j) + w.slice(j + 1);
    else if (op === 2) words[i] = w.slice(0, j) + w[j] + w.slice(j);
    else if (op === 3 && /^[A-Z]/.test(w)) words[i] = w.slice(0, j) + 'xyzaeiou'[Math.floor(rand() * 8)] + w.slice(j + 1);
    else words[i] = w.slice(0, j) + w.slice(j + 1) + w[j];
  }
  return words.join(' ');
}

const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
export function collectMessages() {
  const E = join(REPO, 'training/eval');
  const out = [];
  for (const c of readJsonl(join(E, 'operational.jsonl'))) out.push({ text: c.message, tab: c.tab, init: c.init, src: 'operational' });
  for (const d of readJsonl(join(E, 'dialogues.jsonl'))) for (const t of d.turns ?? []) out.push({ text: t.message, tab: t.tab ?? d.tab, init: d.init, src: 'dialogues' });
  for (const c of readJsonl(join(E, 'loose-words.jsonl'))) out.push({ text: c.message, tab: c.tab, src: 'loose' });
  if (existsSync(join(E, 'typos'))) for (const f of readdirSync(join(E, 'typos'))) for (const c of readJsonl(join(E, 'typos', f))) out.push({ text: c.typo ?? c.original, tab: c.tab, src: 'typos' });
  for (const f of readdirSync(E).filter((x) => /^real-dialogue.*\.txt$/.test(x))) for (const l of readFileSync(join(E, f), 'utf8').split('\n')) if (l.trim()) out.push({ text: l.trim(), tab: null, src: 'real' });
  return out.filter((m) => typeof m.text === 'string' && m.text.trim());
}

export async function buildEngine() { return createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() }); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const engine = await buildEngine();
  const all = collectMessages();
  const rand = rng(SEED);
  const rows = [];
  let session = null, since = 99, lastTab = undefined;
  for (let i = 0; i < N; i++) {
    const m = all[Math.floor(rand() * all.length)];
    const noisy = rand() < 0.85 ? addNoise(m.text, rand) : m.text;
    if (since >= 8 || m.tab !== lastTab) {
      session = engine.createSession(sessionOptions(settings, { language: 'en' }));
      if (m.tab) session.setWorldState('ui.shell', { activeTab: m.tab });
      for (const [w, patch] of Object.entries(m.init ?? {})) session.setWorldState(w, patch);
      since = 0; lastTab = m.tab;
    }
    since++;
    const t0 = performance.now();
    let outcome = 'ok', stage = null;
    const ctl = new AbortController();
    const hang = new Promise((r) => setTimeout(() => r('HANG'), BUDGET + 5000).unref?.());
    try {
      const r = await Promise.race([session.send(noisy, { signal: ctl.signal, hardMs: BUDGET, softMs: SOFT }), hang]);
      if (r === 'HANG') outcome = 'hang';
    } catch (e) {
      if (e instanceof TurnAborted) { outcome = `aborted:${e.reason}`; stage = e.stage; } else { outcome = 'error'; stage = String(e?.message ?? e).slice(0, 80); }
    }
    rows.push({ text: noisy, src: m.src, ms: performance.now() - t0, outcome, stage });
  }
  const sorted = [...rows].sort((a, b) => b.ms - a.ms);
  const count = (p) => rows.filter(p).length;
  const hangs = count((r) => r.outcome === 'hang'), over = count((r) => r.ms > BUDGET + 1500), aborted = count((r) => r.outcome.startsWith('aborted')), errors = count((r) => r.outcome === 'error');
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`turns ${rows.length}  budget ${BUDGET} ms (soft ${SOFT})  seed ${SEED}  mode ${opt('mode', 'rules')}`);
  console.log(`p50 ${ms[Math.floor(ms.length * 0.5)].toFixed(0)} ms  p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(0)} ms  p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(0)} ms  max ${ms.at(-1).toFixed(0)} ms`);
  console.log(`hangs ${hangs}  over budget+1.5s ${over}  aborted ${aborted}  errors ${errors}`);
  console.log(`slowest ${SHOW}:`);
  for (const r of sorted.slice(0, SHOW)) console.log(`  ${r.ms.toFixed(0).padStart(6)} ms  ${r.outcome}${r.stage ? ` [${r.stage}]` : ''}  ${r.src}  ${JSON.stringify(r.text.slice(0, 90))}`);
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
  const bad = hangs > 0 || over > 0 || aborted / rows.length > MAX_ABORTED || errors > 0;
  if (errors) for (const r of rows.filter((x) => x.outcome === 'error').slice(0, 5)) console.log('ERROR', r.stage, JSON.stringify(r.text));
  console.log(bad ? 'FAIL' : 'PASS');
  process.exit(bad ? 1 : 0);
}
