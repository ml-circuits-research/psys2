// Dump the unique real Romanian user phrases (owner logs, ledger, real-phrase files) for hand glossing.
//   node scripts/ro-en-real-dump.mjs > real-ro.tsv     (columns: id, tab, source, text, previous english where logged)
import { readFileSync } from 'node:fs';
import { detectLanguage } from '../src/translate/index.mjs';
const L = (f) => readFileSync(`training/eval/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const S = new Map();
const add = (src, t, tab, en, lang) => {
  const k = String(t ?? '').trim();
  if (!k || S.has(k)) return;
  const d = detectLanguage(k).lang;
  if (lang !== 'ro' && d !== 'ro') return;
  if (lang === 'en' && !/[ăâîșț]/i.test(k)) return;
  S.set(k, { src, tab, en });
};
for (const f of ['owner-log-2026-11-13.jsonl', 'owner-log-2026-11-13b.jsonl']) for (const r of L(f)) add('owner-log', r.text, r.tab, r.english, r.lang);
for (const r of L('failures.jsonl')) add('ledger', r.text, r.tab, null, r.language);
for (const f of ['real-phrases-2026-11-09e.jsonl', 'real-phrases-2026-11-09c.jsonl']) for (const r of L(f)) add('real-phrases', r.text || r.message, r.tab, null, r.lang || r.language);
const mob = JSON.parse(readFileSync('training/eval/real-phrases-2026-11-09f-mobile.json', 'utf8'));
for (const r of mob.records) add('real-mobile', r.text ?? r.message, r.tab, null, r.lang ?? r.language);
let i = 0;
for (const [t, v] of S) console.log([`real#${String(++i).padStart(3, '0')}`, v.tab ?? '', v.src, t.replace(/\s+/g, ' '), v.en ?? ''].join('\t'));
