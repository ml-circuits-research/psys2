#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * MODEL ABLATION (2026-11-13): every model of the runtime switched on and off, on the same sets, end to end through the shared pipeline
 * (src/dialog/runtime-config.mjs + scripts/lib/runtime-node.mjs). One configuration = one named combination of
 *   formalizer (rules | encoder), segmentation (model | rules clause splitter), routing (A dispatcher | B symbolic | C symbolic+encoder),
 *   nxStrategy (rules | hybrid | neural: who reads), normalizer (on | off).
 * Sets (all end to end, one fresh session per case unless the set is a dialogue / a log):
 *   operational, minimal-pairs, knowledge (answer regex), dialogues (each turn), wrong-tab (the world of the first understood segment is the gold world),
 *   owner-a (with checks), owner-b, owner-c (no checks: understood / asked / not understood only), ledger (English and Romanian rows of the failure ledger,
 *   by cause group: no gold exists, a row counts as `answered` when the system acted or answered and did not say it did not understand).
 * Outcomes per message: right | wrong (partly counts as wrong) | asked (a clarifying question, nothing done) | nu (not understood). Sets without gold: answered | asked | nu.
 *
 *   node scripts/eval-ablation.mjs --configs list
 *   node scripts/eval-ablation.mjs --configs rules-C,enc-C --ort <scratch>/node_modules/onnxruntime-node/dist/index.js --out <dir> [--jobs 20] [--sets a,b] [--limit N] [--latency]
 * `--latency` runs single-threaded (jobs 1), a small sample per set, and reports mean / p50 / p95 ms per message (the full runs share 20 cores: their ms are contended).
 * Writes <out>/<config>.json = { config, rows: [{ set, id, group, outcome, ms, reply, worlds, reading, ... }] } (rows keep the text and the reply so a later step can classify the rescues).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, workerData } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions } from '../src/dialog/runtime-config.mjs';
import { formalize, setProto } from '../src/formalizer/rules/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { groupOf } from './lib/world-groups.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';
import { visibleState } from './lib/visible-state.mjs';
import { causeOf } from './lib/failure-cause.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
applyReasonerFlag();
const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const L = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** The configurations. `mode` picks the base settings of runtime-config (rules | encoder | encoder+n1); `set` overrides single settings; `seg` = 'rules' replaces the model's segmentation by the rules' clause splitter. */
export const CONFIGS = {
  'rules-A': { note: 'no model; rules formalizer; the old rule router (routing A)', mode: 'rules', set: { routing: 'dispatcher' } },
  'rules-C': { note: 'no model; rules formalizer; meta.worlds routing (B, no encoder prior)', mode: 'rules', set: {} },
  'enc-C': { note: 'encoder: segmentation + world prior + validator; reading by rules only; routing C; no normalizer', mode: 'encoder', set: { nxStrategy: 'rules' } },
  'enc-C-segrules': { note: 'as enc-C, the rules clause splitter replaces the model segmentation', mode: 'encoder', set: { nxStrategy: 'rules' }, seg: 'rules' },
  'enc-A': { note: 'as enc-C with routing A (the encoder world head proposes, the rules validate)', mode: 'encoder', set: { nxStrategy: 'rules', routing: 'dispatcher' } },
  'enc-B': { note: 'as enc-C with routing B (symbolic only, the encoder world head unread)', mode: 'encoder', set: { nxStrategy: 'rules', routing: 'symbolic' } },
  'enc-hybrid': { note: 'enc-C plus the NX reading of segments the rules left unparsed (hybrid); no normalizer', mode: 'encoder', set: { nxStrategy: 'hybrid' } },
  'enc-n1': { note: 'enc-C plus the T5 normalizer fallback; reading by rules only', mode: 'encoder+n1', set: { nxStrategy: 'rules' } },
  'shipped': { note: 'the shipped default since 2026-11-14: encoder (segmentation + prior), rules read, no normalizer, routing C', mode: 'encoder', set: {} },
  'shipped-old': { note: 'the shipped default of the ablation report: encoder + normalizer + hybrid reading + routing C', mode: 'encoder+n1', set: { nxStrategy: 'hybrid' } },
  'enc-neural': { note: 'model first (NX neural), no normalizer', mode: 'encoder', set: { nxStrategy: 'neural' } },
  // the symbolic readers that exist in the library and are off by default (spec 16): world-aware reading and the READER-ROUTE library reader (env switches read when the session is made)
  'rules-WAveto': { note: 'no model; world-aware reading = veto (PSYS2_WORLD_AWARE)', mode: 'rules', set: {}, env: { PSYS2_WORLD_AWARE: 'veto' } },
  'rules-WAchoose': { note: 'no model; world-aware reading = choose', mode: 'rules', set: {}, env: { PSYS2_WORLD_AWARE: 'choose' } },
  'rules-RDfill': { note: 'no model; READER-ROUTE = fill (the library reader reads clauses nobody read)', mode: 'rules', set: {}, env: { PSYS2_READER: 'fill' } },
  'rules-RDchoose': { note: 'no model; READER-ROUTE = choose', mode: 'rules', set: {}, env: { PSYS2_READER: 'choose' } },
  'rules-WAchoose-RDchoose': { note: 'no model; world-aware = choose and READER-ROUTE = choose', mode: 'rules', set: {}, env: { PSYS2_WORLD_AWARE: 'choose', PSYS2_READER: 'choose' } },
  'rules-suspect': { note: 'no model; PROTOTYPE suspect-word leniency (a completely read segment with an unknown word one slip from a known word is spell-corrected like an unparsed one)', mode: 'rules', set: { suspectWords: true } },
  'enc-suspect': { note: 'as enc-C plus the suspect-word leniency prototype', mode: 'encoder', set: { nxStrategy: 'rules', suspectWords: true } },
  'rules-also': { note: 'no model; PROTOTYPE "also" joins clauses like "then" in the rules clause splitter', mode: 'rules', set: {}, proto: { also: true } },
  'rules-also-suspect': { note: 'no model; both prototypes (also-joiner, suspect-word leniency)', mode: 'rules', set: { suspectWords: true }, proto: { also: true } },
  // since 2026-11-13 suspect-word leniency, "also" as a joiner and READER-ROUTE fill are on by default (spec 03 7.17); these configurations switch them off one by one for the before / after tables
  'rules-off': { note: 'no model; suspect-word leniency, "also" joiner and READER-ROUTE all OFF (the state of the ablation report)', mode: 'rules', set: { suspectWords: false, reader: 'off' }, proto: { also: false } },
  'rules-d-suspect': { note: 'no model; only the suspect-word leniency on', mode: 'rules', set: { suspectWords: true, reader: 'off' }, proto: { also: false } },
  'rules-d-also': { note: 'no model; only "also" as a clause joiner on', mode: 'rules', set: { suspectWords: false, reader: 'off' }, proto: { also: true } },
  'rules-d-fill': { note: 'no model; only READER-ROUTE fill on', mode: 'rules', set: { suspectWords: false, reader: 'fill' }, proto: { also: false } },
  'rules-d-suspect-also': { note: 'no model; suspect-word leniency and "also" on, READER-ROUTE off', mode: 'rules', set: { suspectWords: true, reader: 'off' }, proto: { also: true } },
  // the card-driven clause cutter (spec 03 7.17) switched off, for the before / after of section 1
  'rules-nocut': { note: 'no model; defaults (suspect, also) but the card-driven clause cutter OFF', mode: 'rules', set: {}, proto: { cutter: false } },
  'enc-C-nocut': { note: 'enc-C with the card-driven clause cutter OFF', mode: 'encoder', set: { nxStrategy: 'rules' }, proto: { cutter: false } },
  'enc-C-segrules-nocut': { note: 'enc-C-segrules with the card-driven clause cutter OFF (the rules splitter as it was)', mode: 'encoder', set: { nxStrategy: 'rules' }, seg: 'rules', proto: { cutter: false } },
  'enc-neural-n1': { note: 'model first (NX neural) with the normalizer', mode: 'encoder+n1', set: { nxStrategy: 'neural' } },
};

// ------------------------------------------------------------------------------------------------ the items
function buildItems({ sets, limit }) {
  const items = [];
  const cut = (arr) => (limit ? arr.slice(0, limit) : arr);
  const want = (s) => !sets || sets.includes(s);
  if (want('operational')) for (const c of cut(L('training/eval/operational.jsonl'))) items.push({ kind: 'case', set: 'operational', c });
  if (sets?.includes('operational-ro')) for (const c of cut(L('training/eval/operational-ro.jsonl'))) items.push({ kind: 'case', set: 'operational-ro', c });   // only when asked for (translation: rules-only vs the model path)
  if (want('minimal-pairs')) for (const c of cut(L('training/eval/minimal-pairs-2026-11-12.jsonl'))) items.push({ kind: 'case', set: 'minimal-pairs', c });
  if (want('knowledge')) for (const c of cut(L('training/eval/knowledge-lookup-2026-11-13.jsonl'))) items.push({ kind: 'knowledge', set: 'knowledge', c });
  if (want('dialogues')) for (const d of cut(L('training/eval/dialogues.jsonl'))) items.push({ kind: 'dialogue', set: 'dialogues', d });
  if (want('wrong-tab')) {
    const f = process.env.ABL_ROUTE_INPUTS ?? arg('route-inputs');
    if (f && existsSync(f)) for (const x of cut(JSON.parse(readFileSync(f, 'utf8')).filter((y) => y.set.startsWith('wrong-tab')))) items.push({ kind: 'world', set: 'wrong-tab', x });
  }
  if (want('typos')) {
    const dirT = join(REPO, 'training/eval/typos');
    const rows = readdirSync(dirT).filter((f) => f.endsWith('.jsonl') && f !== 'proper-names.jsonl').flatMap((f) => readFileSync(join(dirT, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    cut(rows).forEach((r, i) => items.push({ kind: 'equiv', set: 'typos', id: `typo#${i}`, world: r.world, tab: r.tab ?? null, setup: [], message: r.typo, reference: r.original, group: r.kind }));
  }
  if (want('loose-words')) cut(L('training/eval/loose-words.jsonl')).forEach((r, i) => items.push({ kind: 'equiv', set: 'loose-words', id: `loose#${i}`, world: r.world, tab: r.tab ?? null, setup: r.setup ?? [], message: r.message, reference: r.kind === 'junk' ? null : r.intent, group: r.kind }));
  // measurement only (scripts/exp-proposer.mjs): cases written by the proposer experiment (message = a proposal or the original, expect = the paraphrase's gold)
  if (sets?.includes('paraphrases-proposals') && arg('proposals')) for (const c of cut(readFileSync(arg('proposals'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))) items.push({ kind: 'case', set: 'paraphrases-proposals', c });
  // re-judged 2026-11-14: `meaning: same` rows are the paraphrase set (the sentence means what the original meant); `meaning: changed` rows are a separate set, robustness to a WRONG translation (the original's expectation is the goal)
  if (want('paraphrases-rt')) for (const c of cut(L('training/eval/paraphrases-rt-2026-11-12.jsonl').filter((x) => x.meaning !== 'changed'))) items.push({ kind: 'case', set: 'paraphrases-rt', c });
  if (want('paraphrases-rt-changed')) for (const c of cut(L('training/eval/paraphrases-rt-2026-11-12.jsonl').filter((x) => x.meaning === 'changed'))) items.push({ kind: 'case', set: 'paraphrases-rt-changed', c });
  for (const [name, sfx] of [['owner-a', ''], ['owner-b', 'b'], ['owner-c', 'c']]) if (want(name)) items.push({ kind: 'owner', set: name, sfx, limit });
  if (want('ledger')) {
    const rows = L('training/eval/failures.jsonl').filter((r) => r.language === 'en' || r.language === 'ro');
    for (const r of cut(rows)) items.push({ kind: 'ledger', set: 'ledger', r, group: causeOf(r) });
  }
  return items;
}

// ------------------------------------------------------------------------------------------------ the worker side
const strip = (s) => JSON.stringify(visibleState(s));
const CLARIFY = /\?\s*$/;
function outcomeOf(base, { acted, replyText, statuses }) {
  if (base === 'not_understood') return !acted && (statuses.some((x) => x === 'missing' || x === 'ambiguous') || CLARIFY.test(replyText.trim())) ? 'asked' : 'nu';
  return base === 'partly' ? 'wrong' : base;
}
const worldsOf = (reply) => [...new Set((reply?.segments ?? []).map((x) => x.match?.worldId ?? x.world).filter(Boolean))];
const readingOf = (reply) => [...new Set((reply?.segments ?? []).map((x) => x.strategy ?? (x.unparsed ? 'unparsed' : 'rules')))].join(',');
const info = (reply) => ({ worlds: worldsOf(reply), reading: readingOf(reply), corrections: (reply?.segments ?? []).flatMap((x) => (x.corrections ?? []).map((c) => (typeof c === 'string' ? c : c.from ? `${c.from}>${c.to}` : JSON.stringify(c)))).slice(0, 4), normalized: !!(reply?.trace?.normalizer || (reply?.segments ?? []).some((x) => x.dispatch?.variant === 'normalized' || /normaliz/.test(x.dispatch?.variant ?? ''))) });

function newSession(env, tab, init) {
  const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  for (const [w, patch] of Object.entries(init ?? {})) s.setWorldState(w, patch);
  return s;
}

async function sendChecked(s, c, message, sendOpts) {
  const before = s.state();
  const t0 = performance.now();
  let reply = null, error = null;
  try { reply = await s.send(message, sendOpts); } catch (e) { error = e.message; }
  const ms = performance.now() - t0;
  return { reply, error, ms, before, after: reply ? s.state() : null };
}

function judge(c, { reply, before, after }, ro = false) {
  const replyText = ro ? (reply.trace?.replyEnglish ?? reply.text) : reply.text;
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const stateChanged = strip(before) !== strip(after);
  const items = evaluateCase(c, { before, after, replyText, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const effects = reply.effects.filter((e) => e.name !== 'chat.suggest');
  const base = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged, effects });
  const acted = stateChanged || effects.length > 0 || reply.statuses.some((x) => x === 'supported');
  return { outcome: outcomeOf(base, { acted, replyText, statuses: reply.statuses }), replyText, acted, unparsedAll, stateChanged, failing: items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`).slice(0, 3) };
}

const NU_TEXT = /did not (understand|catch)|not sure how|can't find|I can not find|no operation|Please say the whole|could not read|I do not know what|I don't know/i;

async function runItem(env, it) {
  env.engine.setKnowledge(it.kind === 'owner' ? env.factsOwner : env.factsFull);
  const row = (extra) => ({ set: it.set, ...extra });
  if (it.kind === 'case') {
    const c = it.c, ro = c.lang === 'ro' || !!c.sendLanguage;
    const s = newSession(env, c.tab, c.init);
    for (const m of c.setup ?? []) { try { await s.send(m); } catch { /* the setup that fails is part of the case */ } }
    const r = await sendChecked(s, c, c.message, c.sendLanguage ? { language: c.sendLanguage } : ro ? { language: 'auto' } : undefined);
    if (!r.reply) return [row({ id: c.id, world: c.world, group: groupOf(c.world), text: c.message, outcome: 'wrong', ms: r.ms, error: r.error })];
    const j = judge(c, r, ro);
    return [row({ id: c.id, world: c.world, group: groupOf(c.world), families: c.families, text: c.message, outcome: j.outcome, ms: r.ms, reply: j.replyText.slice(0, 160), failing: j.failing, ...info(r.reply) })];
  }
  if (it.kind === 'equiv') {
    // the message must do what the reference sentence does in a fresh session (same visible state and answer values); a junk row (no reference) is right when nothing was executed
    const play = async (text) => {
      const s = newSession(env, it.tab, null);
      for (const m of it.setup ?? []) { try { await s.send(m); } catch { /* keep going */ } }
      const before = s.state();
      const r = await sendChecked(s, null, text);
      if (!r.reply) return { reply: null, ms: r.ms, error: r.error };
      const unparsedAll = r.reply.segments.length === 0 || r.reply.segments.every((y) => y.unparsed);
      const acted = strip(before) !== strip(r.after) || r.reply.statuses.some((y) => y === 'supported') || r.reply.effects.some((e) => e.name !== 'chat.suggest');
      return { reply: r.reply, ms: r.ms, state: strip(r.after), values: JSON.stringify(r.reply.answers.map((a) => a.value)), unparsedAll, acted, text: r.reply.text };
    };
    const got = await play(it.message);
    if (!got.reply) return [row({ id: it.id, world: it.world, group: it.group, text: it.message, outcome: 'wrong', ms: got.ms, error: got.error })];
    let outcome;
    if (it.reference == null) outcome = got.acted ? 'wrong' : 'right';
    else {
      const ref = await play(it.reference);
      if (!ref.reply || ref.unparsedAll || !ref.acted) return [row({ id: it.id, world: it.world, group: it.group, text: it.message, outcome: 'skip', ms: got.ms })];
      outcome = got.state === ref.state && got.values === ref.values ? 'right' : got.unparsedAll || !got.acted ? (CLARIFY.test(got.text.trim()) ? 'asked' : 'nu') : 'wrong';
    }
    return [row({ id: it.id, world: it.world, group: it.group, text: it.message, outcome, ms: got.ms, reply: got.text.slice(0, 160), ...info(got.reply) })];
  }
  if (it.kind === 'knowledge') {
    const c = it.c;
    const s = newSession(env, c.tab, null);
    const r = await sendChecked(s, c, c.message);
    const text = r.reply?.text ?? '';
    const ok = !!r.reply && new RegExp(c.answer, 'i').test(text);
    const acted = !!r.reply && !NU_TEXT.test(text);
    return [row({ id: c.id, world: c.world, group: c.group, text: c.message, outcome: ok ? 'right' : r.reply && CLARIFY.test(text.trim()) ? 'asked' : acted ? 'wrong' : 'nu', ms: r.ms, reply: text.slice(0, 160), ...(r.reply ? info(r.reply) : {}) })];
  }
  if (it.kind === 'dialogue') {
    const d = it.d, s = newSession(env, d.tab, d.init), out = [];
    for (const [i, t] of d.turns.entries()) {
      if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab });
      const c = { world: d.world, expect: t.expect };
      const r = await sendChecked(s, c, t.message, t.mode ? { mode: t.mode } : undefined);
      if (!r.reply) { out.push(row({ id: `${d.id}#${i}`, world: d.world, group: groupOf(d.world), families: d.families, text: t.message, outcome: 'wrong', ms: r.ms, error: r.error })); continue; }
      const j = judge(c, r);
      out.push(row({ id: `${d.id}#${i}`, world: d.world, group: groupOf(d.world), families: d.families, text: t.message, outcome: j.outcome, ms: r.ms, reply: j.replyText.slice(0, 160), failing: j.failing, ...info(r.reply) }));
    }
    return out;
  }
  if (it.kind === 'world') {
    const x = it.x;
    const s = newSession(env, null, null);
    for (const m of x.session ?? []) { try { await s.send(m); } catch { /* keep going */ } }
    if (x.tab) s.setWorldState('ui.shell', { activeTab: x.tab });
    const r = await sendChecked(s, null, x.text);
    const gold = x.gold.world;
    if (!r.reply) return [row({ id: x.id, world: gold, group: x.set, text: x.text, outcome: 'wrong', ms: r.ms, error: r.error })];
    const kn = r.reply.trace?.discourse?.meta?.kind === 'knowledge';
    const seg = (r.reply.segments ?? []).find((y) => !y.unparsed);
    const world = kn ? 'talk' : seg?.match?.worldId ?? seg?.world ?? null;
    const text = r.reply.text;
    const outcome = world ? (world === gold || (gold === 'talk' && /^(kids\.|session\.conversation|common\.sense|user\.profile)/.test(world)) ? 'right' : 'wrong') : CLARIFY.test(text.trim()) ? 'asked' : 'nu';
    return [row({ id: x.id, world: gold, got: world, group: x.set, text: x.text, outcome, ms: r.ms, reply: text.slice(0, 160), ...info(r.reply) })];
  }
  if (it.kind === 'ledger') {
    const r0 = it.r, ro = r0.language !== 'en';
    const tab = r0.tab === 'draw' ? 'art.draw' : r0.tab ?? null;
    const s = newSession(env, tab, null);
    const r = await sendChecked(s, null, r0.text, ro ? { language: 'auto' } : undefined);
    if (!r.reply) return [row({ id: r0.text.slice(0, 40), group: it.group, text: r0.text, outcome: 'nu', ms: r.ms, error: r.error })];
    const replyText = ro ? (r.reply.trace?.replyEnglish ?? r.reply.text) : r.reply.text;
    const unparsedAll = r.reply.segments.length === 0 || r.reply.segments.every((y) => y.unparsed);
    const acted = strip(r.before) !== strip(r.after) || r.reply.statuses.some((y) => y === 'supported');
    const nu = unparsedAll || (!acted && NU_TEXT.test(replyText));
    return [row({ id: r0.text.slice(0, 40), group: it.group, lang: r0.language, text: r0.text, outcome: nu ? (CLARIFY.test(replyText.trim()) && !unparsedAll ? 'asked' : 'nu') : 'answered', ms: r.ms, reply: replyText.slice(0, 160), ...info(r.reply) })];
  }
  if (it.kind === 'owner') {
    const rows = L(`training/eval/owner-log-2026-11-13${it.sfx}.jsonl`).slice(0, it.limit || undefined);
    const chk = it.sfx ? {} : JSON.parse(readFileSync(join(REPO, 'training/eval/owner-log-checks.json'), 'utf8'));
    const out = [];
    let s = null, day = null;
    for (const [i, r] of rows.entries()) {
      if (!s || r.time.slice(0, 10) !== day) s = env.ownerEngine.createSession(sessionOptions(env.settings, { language: 'en' }));
      day = r.time.slice(0, 10);
      s.setWorldState('ui.shell', { activeTab: r.tab });
      if (r.activeWorld && !r.tab) s.setWorldState('ui.shell', { activeTab: 'robot' });
      const before = s.state();
      const t0 = performance.now();
      let reply = null, error = null;
      try { reply = await s.send(r.text, r.lang === 'ro' ? { language: 'ro' } : undefined); } catch (e) { error = e.message; }
      const ms = performance.now() - t0;
      const id = `${it.set}#${i}`;
      if (!reply) { out.push(row({ id, group: r.class ?? 'log', text: r.text, outcome: 'wrong', ms, error })); continue; }
      const english = reply.trace?.replyEnglish ?? reply.text;
      const after = s.state();
      const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
      const acted = strip(before) !== strip(after) || reply.statuses.some((x) => x === 'supported');
      const c = chk[i];
      let outcome;
      if (c) {
        const items = evaluateCase({ world: c.world ?? 'art.draw', expect: c }, { before, after, replyText: english, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
        const bad = items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`);
        if (c.unchanged && strip(before) !== strip(after)) bad.push('unchanged');
        for (const re of [].concat(c.reply_not ?? [])) if (new RegExp(re, 'i').test(english)) bad.push(`reply_not:${re}`);
        if (c.reply_any && ![].concat(c.reply_any).some((re) => new RegExp(re, 'i').test(english))) bad.push(`reply_any:${c.reply_any}`);
        for (const w of [].concat(c.world_not ?? [])) if (worldsOf(reply).includes(w)) bad.push(`world_not:${w}`);
        outcome = bad.length ? (unparsedAll || !acted ? (CLARIFY.test(english.trim()) ? 'asked' : 'nu') : 'wrong') : 'right';
      } else outcome = unparsedAll || (!acted && NU_TEXT.test(english)) ? (CLARIFY.test(english.trim()) && !unparsedAll ? 'asked' : 'nu') : 'answered';
      out.push(row({ id, group: r.class ?? 'log', checked: !!c, text: r.text, outcome, ms, reply: english.slice(0, 160), ...info(reply) }));
    }
    return out;
  }
  throw new Error(`unknown item kind ${it.kind}`);
}

async function setupEnv(wd) {
  const cfg = CONFIGS[wd.config];
  Object.assign(process.env, cfg.env ?? {});
  if (cfg.proto) setProto(cfg.proto);
  // one engine for every set: the owner's browser path (rules translation first, a fixed Romanian line for a reply the rules cannot write) and the repository's knowledge catalog
  // with the crocodile fixture of the owner log (as scripts/eval-owner-log.mjs)
  const translator = createSwitchTranslator({ rules: createTranslator(), getStrategy: () => 'auto', backend: { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' } });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  const kdir = join(REPO, 'knowledge'), fx = join(REPO, 'training/eval/owner-log-knowledge');
  const source = { text: async (p) => {
    if (p === 'vocab.json') { const v = JSON.parse(readFileSync(join(kdir, 'k.objects/vocab.json'), 'utf8')); for (const w of ['crocodile', 'crocodiles']) v[w] = ['k.objects/shards/owner-log']; return JSON.stringify(v); }
    if (p === 'k.objects/shards/owner-log.sop') return readFileSync(join(fx, 'crocodile.sop'), 'utf8');
    const f = join(kdir, p); return existsSync(f) ? readFileSync(f, 'utf8') : null;
  } };
  const factsOwner = createFacts({ source });
  const factsFull = wd.knowledge ? createFacts({ source: createKnowledgeSource(wd.knowledge) }) : factsOwner;   // the catalog checkout (knowledge set, ledger, wrong-tab, operational); the owner log keeps its own copy + fixture
  let segmenter = null;
  if (cfg.seg === 'rules') {
    const scratch = engine.createSession({ formalizer: 'rules', language: 'en' }).isession;
    segmenter = (text) => formalize(text, { worlds: engine.set, router: engine.router, source: 'input', session: scratch }).segments.map((s) => s.span);
  }
  const rt = await openNodeRuntime({ engine, mode: cfg.mode, ortPath: wd.ort, ortThreads: wd.ortThreads, overrides: cfg.set, partsExtra: segmenter ? { segmenter } : null });
  return { engine, ownerEngine: engine, settings: rt.settings, info: rt.info, factsOwner, factsFull };
}

if (!isMainThread && workerData?.__abl) {
  serveShard(async (wd) => {
    const env = await setupEnv(wd);
    let k = 0;
    return async (it) => { if (process.env.ABL_TRACE) console.error(`> ${it.set} ${JSON.stringify(it.r?.text ?? it.c?.message ?? it.x?.text ?? it.d?.id ?? it.sfx)}`); const r = await runItem(env, it); if (process.env.ABL_MEM && ++k % 20 === 0) console.error(`mem ${it.set}/${it.kind} #${k} heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`); return r; };
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const names = arg('configs', 'list');
  if (names === 'list') { for (const [k, v] of Object.entries(CONFIGS)) console.log(k.padEnd(18), v.note); process.exit(0); }
  const out = resolve(arg('out', join(REPO, 'training/runs/model-ablation')));
  mkdirSync(out, { recursive: true });
  const sets = arg('sets') ? arg('sets').split(',') : null;
  const latency = flag('latency');
  const limit = latency ? Number(arg('limit', 25)) : Number(arg('limit', 0));
  const items = buildItems({ sets, limit });
  const jobs = latency ? 1 : Math.max(1, Math.min(parseJobs(), items.length));
  for (const name of names.split(',')) {
    if (!CONFIGS[name]) throw new Error(`unknown config ${name}`);
    const t0 = performance.now();
    const results = await runSharded({ file: SELF, items, jobs, chunk: latency ? 4 : undefined, workerData: { __abl: true, config: name, ort: arg('ort'), knowledge: arg('knowledge'), ortThreads: CONFIGS[name].mode === 'rules' ? 0 : 1 } });
    const rows = results.flat();
    const file = join(out, `${name}${latency ? '.latency' : ''}.json`);
    writeFileSync(file, JSON.stringify({ config: name, note: CONFIGS[name].note, jobs, wall_ms: Math.round(performance.now() - t0), rows }));
    const by = {};
    for (const r of rows) { const k = r.set; by[k] ??= {}; by[k][r.outcome] = (by[k][r.outcome] ?? 0) + 1; }
    console.log(`${name}: ${rows.length} rows in ${Math.round((performance.now() - t0) / 1000)} s ->`, JSON.stringify(by));
  }
}
