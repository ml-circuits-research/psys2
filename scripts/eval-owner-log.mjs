#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Owner-log eval (SCENE-NATURAL): replays the owner's real messages of training/eval/owner-log-2026-11-13.jsonl in the tab they were typed in, in
 * order, one session per day, with the same rules-translation path the browser takes first
 * (language auto for Romanian messages). Every message is checked by training/eval/owner-log-checks.json (per message index: what must hold, in the
 * operational-check format of scripts/lib/operational-check.mjs plus `reply_not` / `reply_any` regexes on the English reply and `world_not`).
 * Messages without a check are reported but not counted. Reports right / wrong per class and the steps (budget ticks) per message.
 *
 *   node scripts/eval-owner-log.mjs [--verbose] [--json] [--only 12,13]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { visibleState } from './lib/visible-state.mjs';
import { evaluateCase } from './lib/operational-check.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { replyFlags } from './lib/reply-check.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

export async function replay({ log = join(REPO, 'training/eval/owner-log-2026-11-13.jsonl'), checks = join(REPO, 'training/eval/owner-log-checks.json') } = {}) {
  const rows = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let chk = {};
  try { chk = JSON.parse(readFileSync(checks, 'utf8')); } catch { /* no checks yet */ }
  // The translator of the phone / no-browser-Translator path of the webchat: rules first, a fixed Romanian line for a reply they cannot write (so the Romanian reply is checkable)
  const rules = createTranslator();
  const translator = createSwitchTranslator({ rules, getStrategy: () => 'auto', backend: { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' } });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  // The knowledge catalog of the owner's browser, from the repository copy (knowledge/k.objects) plus a crocodile fixture (the online catalog had one).
  const kdir = join(REPO, 'knowledge'), fx = join(REPO, 'training/eval/owner-log-knowledge');
  const source = { text: async (p) => {
    if (p === 'vocab.json') { const v = JSON.parse(readFileSync(join(kdir, 'k.objects/vocab.json'), 'utf8')); for (const w of ['crocodile', 'crocodiles']) v[w] = ['k.objects/shards/owner-log']; return JSON.stringify(v); }
    if (p === 'k.objects/shards/owner-log.sop') return readFileSync(join(fx, 'crocodile.sop'), 'utf8');
    const f = join(kdir, p.replace(/^k\.objects\//, 'k.objects/')); return existsSync(f) ? readFileSync(f, 'utf8') : null;
  } };
  engine.setKnowledge(createFacts({ source }));
  const settings = settingsForMode('rules');
  let s = null, prevDay = null;
  const out = [];
  for (const [i, r] of rows.entries()) {
    if (!s || r.time.slice(0, 10) !== prevDay) s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    prevDay = r.time.slice(0, 10);
    s.setWorldState('ui.shell', { activeTab: r.tab });
    const before = s.state();
    const t0 = performance.now();
    let reply = null, error = null;
    try { reply = await s.send(r.text, r.lang === 'ro' ? { language: 'ro' } : undefined); } catch (e) { error = e.message; }
    const ms = performance.now() - t0;
    const rec = { i, class: r.class, tab: r.tab, text: r.text, ms: Math.round(ms), error };
    if (reply) {
      const after = s.state();
      const english = reply.trace?.replyEnglish ?? reply.text;
      Object.assign(rec, { replyUser: reply.text.slice(0, 200), english: reply.trace?.english ?? null, reply: english.slice(0, 200), worlds: [...new Set(reply.segments.map((x) => x.world).filter(Boolean))], statuses: reply.statuses, steps: (reply.budget ?? reply.trace?.budget)?.ticks ?? null, top: (reply.budget ?? reply.trace?.budget)?.top ?? null });
      // P6: the reply is as natural as the request (no internal word, no dangling article, a complete sentence; in the user's language no English left)
      rec.replyFlags = [...replyFlags(english), ...(r.lang === 'ro' && reply.text !== english ? replyFlags(reply.text, { lang: 'ro', leftovers: translator.leftovers }).map((f) => `ro:${f}`) : [])];
      const c = chk[i];
      if (c) {
        const items = evaluateCase({ world: c.world ?? 'art.draw', expect: c }, { before, after, replyText: english, effects: reply.effects, statuses: reply.statuses, unparsedAll: reply.segments.length === 0 || reply.segments.every((x) => x.unparsed), values: reply.answers.map((a) => a.value) });
        const bad = items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`);
        if (c.unchanged && JSON.stringify(visibleState(before)) !== JSON.stringify(visibleState(after))) bad.push('unchanged');
        for (const re of [].concat(c.reply_not ?? [])) if (new RegExp(re, 'i').test(english)) bad.push(`reply_not:${re}`);
        if (c.reply_any && ![].concat(c.reply_any).some((re) => new RegExp(re, 'i').test(english))) bad.push(`reply_any:${c.reply_any}`);
        for (const w of [].concat(c.world_not ?? [])) if (rec.worlds.includes(w)) bad.push(`world_not:${w}`);
        rec.outcome = bad.length ? 'wrong' : 'right';
        rec.failing = bad;
      } else rec.outcome = 'unchecked';
    } else rec.outcome = 'wrong';
    out.push(rec);
  }
  return out;
}

export function summarize(rows) {
  const by = {};
  for (const r of rows) { const k = r.class; by[k] ??= { right: 0, wrong: 0, unchecked: 0 }; by[k][r.outcome]++; }
  const tot = { right: 0, wrong: 0, unchecked: 0 };
  for (const v of Object.values(by)) for (const k of Object.keys(tot)) tot[k] += v[k];
  return { by_class: by, total: tot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = arg('only') ? new Set(arg('only').split(',').map(Number)) : null;
  const rows = (await replay()).filter((r) => !only || only.has(r.i));
  if (flag('json')) console.log(JSON.stringify(rows, null, 1));
  else {
    for (const r of rows) if (flag('verbose') || r.outcome === 'wrong') console.log(`${String(r.i).padStart(2)} ${r.outcome.padEnd(9)} [${r.tab}/${r.class}] ${JSON.stringify(r.text)} -> ${JSON.stringify(r.english)} => ${JSON.stringify(r.reply)} ${r.worlds?.join(',')} ${r.ms}ms${r.failing?.length ? ` FAIL ${r.failing.join(' ')}` : ''}`);
    const sm = summarize(rows);
    console.log('class'.padEnd(16), 'right wrong unchecked');
    for (const [k, v] of Object.entries(sm.by_class)) console.log(k.padEnd(16), String(v.right).padStart(5), String(v.wrong).padStart(5), String(v.unchecked).padStart(9));
    console.log('TOTAL'.padEnd(16), String(sm.total.right).padStart(5), String(sm.total.wrong).padStart(5), String(sm.total.unchecked).padStart(9));
    const unnatural = rows.filter((r) => r.replyFlags?.length);
    console.log(`REPLY CHECK: ${unnatural.length} of ${rows.length} replies flagged`);
    for (const r of unnatural) console.log(`  ${String(r.i).padStart(2)} ${JSON.stringify(r.reply)} => ${r.replyFlags.join('; ')}`);
    console.log(`time ${rows.reduce((a, r) => a + r.ms, 0)} ms, max ${Math.max(...rows.map((r) => r.ms))} ms`);
  }
}
