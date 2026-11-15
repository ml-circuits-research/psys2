#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE REAL TYPO SET THROUGH THE DOOR (Q39 S4; metric in training/eval/README.md): each row's text is read as the door reads it (the rules translation for Romanian, then
 * readRequest with `spell` over the tab's live world, sopworld 0.151) and scored right / wrong / asked / missed by its hand-judged typos. Controls: any change is wrong.
 *
 *   node scripts/typos-measure.mjs [--set training/eval/typos-real-2026-11-15.jsonl] [--dump]
 */
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { requestLanguage, liveWorld, readTurn } from '../src/dialog/request.mjs';
import { spellVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rows = readFileSync(arg('set', new URL('../training/eval/typos-real-2026-11-15.jsonl', import.meta.url)), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const tr = createTranslator();
const language = requestLanguage(lib);
const vocab = spellVocabulary(engine.set);
const known = (w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!tr.rules?.knownEnglish?.(w) || !!tr.knownEnglish?.(w);   // as the door passes it
const TAB = { draw: 'art.draw', diagram: 'diagram.sketch', editor: 'docs.editor', docs: 'docs.editor' };
const fold = (w) => String(w).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tally = {};
const bump = (k, v) => { tally[k] ??= { right: 0, wrong: 0, asked: 0, missed: 0, n: 0 }; tally[k][v]++; tally[k].n++; };
for (const r of rows) {
  const world = TAB[r.tab] ? engine.set.get(TAB[r.tab]) : null;
  const live = world ? liveWorld(lib, world) : null;
  let verdict = 'missed', fixes = [], asks = [], english = r.text;
  if (live) {
    if (r.lang === 'ro') english = (await tr.translate(r.text, { from: 'ro', to: 'en' }))?.text ?? r.text;
    const q = readTurn(lib, live, language, english, { known });
    fixes = q.corrections; asks = q.asks ?? [];
  }
  const control = !(r.typos ?? []).length;
  // a Romanian row is judged on its English: a repair is right when it lands on the translation of the intended word (the source word is gone from the English)
  const intended = (r.typos ?? []).map((t) => fold(t.to));
  if (control) verdict = fixes.length ? 'wrong' : 'right';
  else if (fixes.some((f) => r.lang === 'en' && !intended.includes(fold(f.as)))) verdict = 'wrong';
  else if (r.lang === 'en' && (r.typos ?? []).every((t) => fixes.some((f) => fold(f.said) === fold(t.from) && fold(f.as) === fold(t.to)))) verdict = 'right';
  else if (r.lang === 'ro' && fixes.length) verdict = 'asked';   // not judgeable on the English: reported, never counted right
  else if (asks.length) verdict = 'asked';
  for (const k of ['all', `${r.lang}`, control ? 'control' : `typo-${r.confidence}`]) bump(k, verdict);
  if (process.argv.includes('--dump')) console.log(`${verdict.padEnd(6)} ${r.id} [${r.lang} ${r.tab}] ${r.text} | ${english !== r.text ? `en: ${english} | ` : ''}${fixes.map((f) => `${f.said}>${f.as}`).join(', ')}${asks.length ? ` asks ${JSON.stringify(asks).slice(0, 80)}` : ''}`);
}
for (const [k, t] of Object.entries(tally)) console.log(`${k.padEnd(12)} n=${t.n} right ${t.right}, wrong ${t.wrong}, asked ${t.asked}, missed ${t.missed}`);
