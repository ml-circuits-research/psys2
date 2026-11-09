#!/usr/bin/env node
/**
 * Romanian reply-quality check (RD5): every case of training/eval/operational-ro.jsonl (rules mode, language auto) is answered, and each reply shown
 * in a Romanian session must be fully Romanian, or kept in English as a whole, with well-formed quotes (scripts/lib/ro-reply-quality.mjs).
 *   node scripts/check-ro-replies.mjs [--limit N] [--world id] [--verbose] [--json]
 * Exit code 1 when any reply is mixed or has a broken quote.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { checkReply } from './lib/ro-reply-quality.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

export async function checkRomanianReplies({ cases, engine, settings }) {
  const counts = { romanian: 0, english: 0, mixed: 0, 'broken-quote': 0, skipped: 0 };
  const bad = [];
  for (const c of cases) {
    const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
    for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
    for (const m of c.setup ?? []) await s.send(m);
    let r;
    try { r = await s.send(c.message, { language: 'auto' }); } catch { continue; }
    const q = checkReply({ shown: r.text, english: r.trace?.replyEnglish ?? r.text, lang: r.lang });
    counts[q.kind]++;
    if (q.problems.length) bad.push({ id: c.id, message: c.message, reply: r.text, kind: q.kind, problems: q.problems });
  }
  return { n: cases.length, counts, bad };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cases = readFileSync(join(REPO, 'training/eval/operational-ro.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (arg('world')) cases = cases.filter((c) => c.world === arg('world'));
  if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const res = await checkRomanianReplies({ cases, engine, settings: settingsForMode('rules') });
  if (flag('json')) console.log(JSON.stringify(res));
  else {
    console.log(`Romanian replies over ${res.n} cases: ${res.counts.romanian} Romanian, ${res.counts.english} kept in English, ${res.counts.mixed} mixed, ${res.counts['broken-quote']} broken quotes`);
    for (const b of res.bad.slice(0, flag('verbose') ? 1000 : 15)) console.log(`  ${b.kind}  ${b.id}  "${b.message}"\n    -> ${b.reply}\n    ${b.problems.join('; ')}`);
  }
  process.exit(res.bad.length ? 1 : 0);
}
