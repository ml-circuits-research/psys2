#!/usr/bin/env node
/**
 * MT-SERIOUS item 2/4: Romanian REPLIES through the on-device model. Every case of training/eval/operational-ro.jsonl is answered with the webchat's switch translator
 * whose backend is the on-device model (the vendored bergamot-translator, scripts/lib/mt-node.mjs; live, no oracle); each reply shown is classified like check-ro-replies
 * (Romanian / English kept / mixed / broken quote) and counted when it ends in the fixed line. Modes:
 *   hybrid   rules and templates first, the model for what they cannot say (the integrated state)
 *   mt       replies by the model only: the Romanian reply templates are switched off (the state after the hacks are removed); reading stays with the rules here, to isolate the replies
 * The model's replies are also written to a sample file for a human to read (--sample N, every k-th reply of the first mode that differs from the rules' reply).
 *   node scripts/mt-replies.mjs --cache <dir> [--mode hybrid|mt|both] [--limit N] [--sample 60 --out file.json] [--reasoner matrix|ops]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { createNodeMt } from './lib/mt-node.mjs';
import { checkRomanianReplies } from './check-ro-replies.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
let cases = readFileSync(join(REPO, 'training/eval/operational-ro.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
const mt = await createNodeMt({ cacheDir: arg('cache') });
await mt.ensure('ro');
const backend = { translatorKind: () => 'mt', detectorKind: () => null, prepare: async () => {}, state: () => 'ready', supports: () => true, detect: async () => [], translate: (t, f, to) => mt.translate(t, f, to) };
const base = createTranslator();
const noRoReplies = { ...base, supports: (f, t) => f === 'ro' && t === 'en', translate: (t, o) => (o?.to === 'ro' ? { text: '', alignment: [], unknown: [String(t)], untranslatable: [], notes: [], confidence: 0 } : base.translate(t, o)) };
const settings = settingsForMode('rules');
const modes = arg('mode', 'both') === 'both' ? ['hybrid', 'mt'] : [arg('mode')];
const out = { reasoner, cases: cases.length, modes: {} };
for (const mode of modes) {
  const tr = createSwitchTranslator({ rules: mode === 'hybrid' ? createTranslator() : noRoReplies, backend, getStrategy: () => 'auto' });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: tr });
  const t0 = Date.now();
  const res = await checkRomanianReplies({ cases, engine, settings });
  out.modes[mode] = { counts: res.counts, badCount: res.bad.length, ms: Date.now() - t0, bad: res.bad.slice(0, 25), families: res.families.slice(0, 10) };
  console.log(`[${reasoner}] ${mode}: ${res.counts.romanian} Romanian, ${res.counts.english} kept in English, ${res.counts.mixed} mixed, ${res.counts['broken-quote']} broken quotes, ${res.counts.fixedLine} fixed line (of ${res.n}), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
if (arg('sample')) {   // replies the model wrote, to be read by a person (English reply, Romanian reply)
  const n = Number(arg('sample')), tr = createSwitchTranslator({ rules: noRoReplies, backend, getStrategy: () => 'auto' });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: tr });
  const rows = [], seen = new Set();
  for (const c of cases) {
    const s = engine.createSession({ ...settings, language: 'en' });
    if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
    for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
    for (const m of c.setup ?? []) await s.send(m);
    let r; try { r = await s.send(c.message, { language: 'auto' }); } catch { continue; }
    const en = r.trace?.replyEnglish ?? r.text;
    if (en === r.text || seen.has(en)) continue;
    seen.add(en); rows.push({ id: c.id, user: c.message, reply_en: en, reply_ro: r.text });
  }
  const step = Math.max(1, Math.floor(rows.length / n));
  out.sample = rows.filter((_, i) => i % step === 0).slice(0, n);
  out.distinctEnglishReplies = rows.length;
}
mt.reset();
if (arg('out')) writeFileSync(arg('out'), JSON.stringify(out));
process.exit(0);
