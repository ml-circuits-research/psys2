#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * M4 measurement: for every foreign-language row of the owner logs (training/eval/owner-log-2026-11-13*.jsonl) and of the failure ledger (training/eval/failures.jsonl),
 * the English the reader gets under four configurations, counted per cause group (log `class`; ledger `source`):
 *   old-rules      the rules translator alone (what the reading got before M4 when no browser Translator exists)
 *   old-model      the on-device model alone (the owner's path: translator first), with --bergamot
 *   new            candidates (rules + repaired rules [+ model + repaired model with --bergamot]) chosen by understanding
 * Per configuration: rows whose English still has source words ("residue"), rows the reader does not understand completely in the tab ("incomplete").
 * Each tab starts from an empty session (the log's earlier turns are not replayed: this measures the translation choice, not the scene).
 *
 *   node scripts/m4-measure.mjs [--bergamot <cacheDir>] [--json] [--limit N]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { gatherCandidates, chooseCandidate, sourceResidue, englishTest } from '../src/translate/candidates.mjs';
import { spellVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';
import { createBudget, installBudget, releaseBudget } from '../src/dialog/budget.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[++i];
const rules = createTranslator();
let mt = null;
if (opt.bergamot && opt.bergamot !== true) { const { createNodeMt } = await import('./lib/mt-node.mjs'); mt = await createNodeMt({ cacheDir: opt.bergamot }); await mt.ensure('ro'); }
// --logged: the browser Translator is replayed from the English the owner's browser really produced (the `english` of the log row, where the turn went through the Translator)
const logged = new Map(), production = new Map();   // production: the English the owner's build really read, whatever route made it
if (opt.logged) for (const f of ['', 'b', 'c']) for (const l of readFileSync(join(REPO, `training/eval/owner-log-2026-11-13${f}.jsonl`), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.lang === 'ro' && r.english) { production.set(r.text, r.english); if ((r.via ?? []).includes('translator-in')) logged.set(r.text, r.english); } }
const backend = opt.logged
  ? { translatorKind: () => 'native', detectorKind: () => null, supports: () => true, sources: async (f, t) => [...(logged.size ? ['native'] : []), ...(mt ? ['model'] : [])],
      translate: async (t, f, to, only) => { if (only === 'model') return mt.translate(t, f, to); if (logged.has(t)) return logged.get(t); throw new Error('no logged translation'); }, detect: async () => { throw new Error('none'); } }
  : mt
  ? { translatorKind: () => 'mt', detectorKind: () => null, supports: () => true, sources: async () => ['model'], translate: (t, f, to) => mt.translate(t, f, to), detect: async () => { throw new Error('none'); } }
  : { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); } };
const translator = createSwitchTranslator({ rules, getStrategy: () => 'auto', backend });
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
const vocab = spellVocabulary(engine.set);
const isEnglish = englishTest((w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!rules.knownEnglish(w));

const rows = [];
for (const f of ['', 'b', 'c']) {
  const file = join(REPO, `training/eval/owner-log-2026-11-13${f}.jsonl`);
  for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.lang === 'ro') rows.push({ log: `owner-${f || 'a'}`, group: r.class, tab: r.tab, text: r.text }); }
}
for (const l of readFileSync(join(REPO, 'training/eval/failures.jsonl'), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.language && r.language !== 'en') rows.push({ log: 'ledger', group: r.source, tab: r.tab, text: r.text }); }
const limit = Number(opt.limit) || rows.length;

const sessions = new Map();
const sessionFor = (tab) => { if (!sessions.has(tab)) { const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: tab }); sessions.set(tab, s); } return sessions.get(tab); };
const tally = {};
const bump = (group, cfg, key) => { const t = (tally[group] ??= { rows: 0 }); t[`${cfg}.${key}`] = (t[`${cfg}.${key}`] ?? 0) + 1; };
const detail = [];
for (const r of rows.slice(0, limit)) {
  const s = sessionFor(r.tab);
  const b = installBudget(createBudget());
  try {
    const t = (tally[r.group] ??= { rows: 0 }); t.rows++;
    const probe = async (cfg, english) => {
      const residue = sourceResidue(english, r.text, isEnglish);
      const u = await s._understands(english).catch(() => ({ issues: 9 }));
      if (residue.length) bump(r.group, cfg, 'residue');
      if (u.issues > 0) bump(r.group, cfg, 'incomplete');
      return { english, residue, issues: u.issues };
    };
    const one = {};
    const rr = await rules.translate(r.text, { from: 'ro', to: 'en' });
    one['old-rules'] = await probe('old-rules', rr.text);
    if (opt.logged) { const m = production.get(r.text) ?? null; if (m) one['old-logged'] = await probe('old-logged', m); }
    if (mt) { const m = await mt.translate(r.text, 'ro', 'en').catch(() => null); one['old-model'] = await probe('old-model', m ?? r.text); }
    const cands = await gatherCandidates(r.text, { from: 'ro', to: 'en', translator });
    const pick = await chooseCandidate(cands, r.text, { understand: (e) => s._understands(e), isEnglish });
    one.new = await probe('new', pick.chosen?.text ?? rr.text);
    one.new.source = pick.chosen?.source ?? 'none';
    detail.push({ ...r, ...one });
  } finally { releaseBudget(b); }
}
mt?.reset?.();
if (opt.json) console.log(JSON.stringify({ tally, detail }, null, 1));
else {
  const cfgs = ['old-rules', ...(opt.logged ? ['old-logged'] : []), ...(mt ? ['old-model'] : []), 'new'];
  const sum = { rows: 0 }; for (const c of cfgs) { sum[`${c}.residue`] = 0; sum[`${c}.incomplete`] = 0; }
  console.log(`rows ${Math.min(limit, rows.length)}; configurations: ${cfgs.join(', ')}  (residue / incomplete per group)`);
  for (const [g, t] of Object.entries(tally)) {
    sum.rows += t.rows; for (const c of cfgs) for (const k of ['residue', 'incomplete']) sum[`${c}.${k}`] += t[`${c}.${k}`] ?? 0;
    console.log(`${String(g).padEnd(24)} n=${String(t.rows).padStart(3)}  ${cfgs.map((c) => `${c} ${t[`${c}.residue`] ?? 0}/${t[`${c}.incomplete`] ?? 0}`).join('   ')}`);
  }
  console.log(`${'TOTAL'.padEnd(24)} n=${String(sum.rows).padStart(3)}  ${cfgs.map((c) => `${c} ${sum[`${c}.residue`]}/${sum[`${c}.incomplete`]}`).join('   ')}`);
  const src = {}; for (const d of detail) src[d.new.source] = (src[d.new.source] ?? 0) + 1;
  console.log('chosen source:', JSON.stringify(src));
}
