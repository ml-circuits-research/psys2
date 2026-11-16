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
const lib0 = await import('../src/vendor/sopworld/sopworld.mjs');
const engine2 = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: tr });
engine2.sopworld = lib0;
const language = requestLanguage(lib);
const vocab = spellVocabulary(engine.set);
const known = (w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!tr.rules?.knownEnglish?.(w) || !!tr.knownEnglish?.(w);   // as the door passes it
const TAB = { draw: 'art.draw', diagram: 'diagram.sketch', editor: 'docs.editor', docs: 'docs.editor' };
const fold = (w) => String(w).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tally = {};
const proposed = []; let proposerHarm = 0;
const { proposeReading, negationWords } = await import('../src/dialog/proposer.mjs');
const proposer = process.env.PSYS2_PROPOSER === '1' ? await (await import('./lib/proposer-node.mjs')).openProposer({}) : null;
const bump = (k, v) => { tally[k] ??= { right: 0, wrong: 0, asked: 0, missed: 0, n: 0 }; tally[k][v]++; tally[k].n++; };
for (const r of rows) {
  const world = TAB[r.tab] ? engine.set.get(TAB[r.tab]) : null;
  const live = world ? liveWorld(lib, world) : null;
  let verdict = 'missed', fixes = [], asks = [], english = r.text, srcRepairs = [];
  const control = !(r.typos ?? []).length;
  if (live) {
    srcRepairs = [];
    if (process.argv.includes('--rules-only') && r.lang === 'ro') english = (await tr.translate(r.text, { from: 'ro', to: 'en' }))?.text ?? r.text;
    else if (r.lang === 'ro') {   // as the door reads it: the translation candidates with the contextual repair of the live worlds' words (Q39 S3), chosen by the request reading
      const s = engine2.createSession({ language: 'ro' }); s.setWorldState('ui.shell', { activeTab: r.tab });
      if (process.argv.includes('--no-context')) s._contextRepairOf = () => null;   // the door without the contextual repair (the older dictionary-only repair candidate stays)
      const en = await s._doorEnglish(r.text, { language: 'ro' });
      english = en?.english ?? r.text; srcRepairs = (en?.changes ?? []).filter((x) => fold(x.from) !== fold(x.to)).map((x) => ({ from: x.from, to: x.to, kind: x.kind }));   // diacritics put back are not repairs of a typo asks = en?.asks ?? [];
    }
    const kw = r.lang === 'ro' ? new Set((r.text.match(/[\p{L}]+/gu) ?? []).map(fold)) : null;   // as the door passes it: a word the translation left as written is the person's own
    let q; try { q = readTurn(lib, live, language, english, { known: kw ? (w) => known(w) || kw.has(fold(w)) : known }); } catch (e) { console.error("CRASH", JSON.stringify(english), String(e.message).slice(0, 80)); q = { corrections: [], asks: [], request: null, unread: [], used: [] }; }
    fixes = [...q.corrections, ...srcRepairs.map((x) => ({ said: x.from, as: x.to, kind: x.kind }))]; asks = [...(q.asks ?? []), ...asks];
    if (proposer) {   // spell + proposer (Q48): the proposal reads the spell-repaired words; an accepted one is listed (on a control it is harm)
      const pr = await proposeReading(proposer, { q, english, world: TAB[r.tab], read: (t) => readTurn(lib, live, language, t, {}), negations: negationWords(language) });
      if (pr.accepted) { proposed.push(`${r.id} [${control ? 'control' : 'typo'}] ${english} -> ${pr.english}`); if (control) proposerHarm++; }
    }
  }
  // a Romanian row is judged on its English: a repair is right when it lands on the translation of the intended word (the source word is gone from the English)
  const intended = (r.typos ?? []).map((t) => fold(t.to));
  if (control) verdict = fixes.length ? 'wrong' : 'right';
  else if (fixes.some((f) => r.lang === 'en' && !intended.includes(fold(f.as)))) verdict = 'wrong';
  else if (r.lang === 'en' && (r.typos ?? []).every((t) => fixes.some((f) => fold(f.said) === fold(t.from) && fold(f.as) === fold(t.to)))) verdict = 'right';
  else if (r.lang === 'ro' && srcRepairs.some((f) => !intended.includes(fold(f.to)))) verdict = 'wrong';   // a source-side repair to a word that is not the intended one
  else if (r.lang === 'ro' && (r.typos ?? []).every((t) => srcRepairs.some((f) => fold(f.from) === fold(t.from) && fold(f.to) === fold(t.to)))) verdict = 'right';
  else if (r.lang === 'ro' && fixes.length) verdict = 'asked';   // not judgeable on the English: reported, never counted right
  else if (asks.length) verdict = 'asked';
  for (const k of ['all', `${r.lang}`, control ? 'control' : `typo-${r.confidence}`]) bump(k, verdict);
  if (process.argv.includes('--dump')) console.log(`${verdict.padEnd(6)} ${r.id} [${r.lang} ${r.tab}] ${r.text} | ${english !== r.text ? `en: ${english} | ` : ''}${fixes.map((f) => `${f.said}>${f.as}${f.kind ? `(${f.kind})` : ''}`).join(', ')}${asks.length ? ` asks ${JSON.stringify(asks).slice(0, 80)}` : ''}`);
}
for (const [k, t] of Object.entries(tally)) console.log(`${k.padEnd(12)} n=${t.n} right ${t.right}, wrong ${t.wrong}, asked ${t.asked}, missed ${t.missed}`);
if (proposer) console.log(`spell + proposer: ${proposed.length} proposals accepted (controls changed: ${proposerHarm})${proposed.length ? `\n  ${proposed.join('\n  ')}` : ''}`);
