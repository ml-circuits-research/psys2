#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E1 (FORMALIZE-FROM-WORLDS): collect phase of the error audit. Runs every message of the audited sets through the real pipeline
 * (rules, or the shipped encoder+n1) and records, per message, the outcome plus everything the classifier needs (segments, routing, translation).
 * Measurement only: no product code is touched. The classification is scripts/e1-audit.mjs.
 *
 *   node scripts/e1-collect.mjs --mode rules|encoder+n1 [--ort <onnxruntime-node entry>] [--out <file.json>] [--jobs N] [--limit N] [--sets a,b]
 *   sets: operational, operational-ro, dialogues, gold, loose, typos, real, mobile
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';
import { wireToRec } from './lib/nx-read.mjs';
import { evaluateRows } from './eval-loose-words.mjs';
import { visibleState } from './lib/visible-state.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const MAIN = '/home/salboaie/work/psys2/';   // untracked data lives in the main checkout
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const pick = (rel) => (existsSync(join(REPO, rel)) ? join(REPO, rel) : join(MAIN, rel));
const strip = (st) => JSON.stringify(visibleState(st));
const normVal = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : String(v).replace(/^\$(e\.)?/, '').toLowerCase().replace(/_/g, ' ').trim().replace(/^(-?\d+)\.0+$/, '$1'));

function buildItems(sets, limit) {
  const items = [];
  const push = (it) => items.push(it);
  const want = (s) => sets.includes(s);
  if (want('operational')) for (const c of jl(pick('training/eval/operational.jsonl'))) push({ kind: 'op', set: 'operational', c });
  if (want('operational-ro')) for (const c of jl(pick('training/eval/operational-ro.jsonl'))) push({ kind: 'op', set: 'operational-ro', c });
  if (want('dialogues')) for (const d of jl(pick('training/eval/dialogues.jsonl'))) push({ kind: 'dlg', set: 'dialogues', d });
  if (want('gold')) for (const g of jl(join(REPO, 'training/nx/gold/pilot-300.jsonl'))) push({ kind: 'rec', set: `gold-${g.subset}`, id: g.id, world: g.world, tab: g.tab, setup: g.context ?? [], text: g.text, gold: { op: g.op, slots: g.slots.map((s) => ({ key: s.key, value: s.value })) } });
  if (want('loose')) jl(pick('training/eval/loose-words.jsonl')).forEach((r, i) => { r.id ??= `${r.world}#L${i + 1}`; push({ kind: 'loose', set: 'loose-words', row: r }); });
  if (want('typos')) {
    const dir = pick('training/eval/typos');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) jl(join(dir, f)).forEach((r, i) => push({ kind: 'typo', set: 'typos', r: { ...r, id: `${r.world}#T${i + 1}` } }));
  }
  if (want('real')) {
    const worlds = new Set(readdirSync(join(REPO, 'worlds')));
    for (const t of ['c', 'd', 'e']) {
      const ex = new Map(jl(pick(`training/eval/expectations-2026-11-09${t}.jsonl`)).map((e) => [e.id, e]));
      for (const e of ex.values()) { const w = /^([a-z][\w.]*):/.exec(e.expect)?.[1]; push({ kind: 'real', set: `real-09${t}`, id: e.id, tab: e.tab, setup: e.context ?? [], text: e.text, lang: e.lang ?? 'en', expectWorld: w && worlds.has(w) ? w : null, expect: e.expect.slice(0, 160) }); }
      const have = new Set([...ex.values()].map((e) => e.text));   // log records without an expectation: unjudged (counted separately)
      jl(pick(`training/eval/real-phrases-2026-11-09${t}.jsonl`)).forEach((r, i) => { if (!have.has(r.text)) push({ kind: 'real', set: `real-09${t}-unjudged`, id: `rp${t}-log${i}`, tab: r.tab, setup: [], text: r.text, lang: r.lang ?? 'en', expectWorld: null, loggedStatus: r.status }); });
    }
  }
  if (want('mobile')) {
    const d = JSON.parse(readFileSync(pick('training/eval/real-phrases-2026-11-09f-mobile.json'), 'utf8'));
    d.records.forEach((r, i) => push({ kind: 'mobile', set: 'mobile-09f', id: `mob${i}`, tab: r.tab, text: r.english, original: r.text, loggedStatus: r.status, loggedWorld: r.worlds?.[0] ?? null }));
  }
  return limit ? items.filter((it) => items.filter((x) => x.set === it.set).indexOf(it) < limit) : items;
}

// ---- recording ---------------------------------------------------------------------------------------------------------------------
const segInfo = (x) => ({
  text: x.text, unparsed: !!x.unparsed, world: x.match?.worldId ?? null, pattern: x.match?.patternId ?? null, strategy: x.strategy ?? null,
  candidates: (x.worlds ?? []).map((w) => `${w.id}:${w.score}`), contested: !!x.routing?.contested, tier: x.routing?.tierName ?? null,
  winner: x.routing?.winner?.worldId ?? null, runnerUp: x.routing?.runnerUp?.worldId ?? null, tabWorld: x.routing?.context?.tabWorld ?? null,
  activeTab: x.routing?.context?.activeTab ?? null, errors: (x.errors ?? []).slice(0, 2).map((e) => String(e).slice(0, 120)),
  alts: (x.alternatives ?? []).length, partial: !!x.partial, nxFrom: x.nxFrom ?? null, reader: x.reader ?? null, wa: x.wa ?? null, veto: x.veto ?? null, pick: x.pick ?? null,
});

function newSession(env, c) {
  const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  return s;
}

async function turn(s, c, message, opts) {   // one message: outcome by the operational checker + the record
  const before = s.state();
  const t0 = performance.now();
  let reply, error = null;
  try { reply = await s.send(message, opts); } catch (e) { error = e.message; }
  const ms = Math.round(performance.now() - t0);
  if (!reply) return { outcome: 'wrong', error, ms, segments: [] };
  const after = s.state();
  const ro = opts?.language === 'auto';
  const replyText = ro ? (reply.trace?.replyEnglish ?? reply.text) : reply.text;
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const items = evaluateCase(c, { before, after, replyText, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged: strip(before) !== strip(after), effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
  return {
    outcome, ms, reply: replyText.slice(0, 260), lang: reply.lang, english: reply.trace?.english ?? null, statuses: reply.statuses,
    failing: items.filter((x) => !x.ok && !(x.trivial && items.some((y) => !y.trivial))).map((x) => `${x.kind}:${x.spec}${x.actual !== undefined ? ` (got ${String(x.actual).slice(0, 60)})` : ''}`).slice(0, 3),
    segments: reply.segments.map(segInfo),
  };
}

async function runOp(env, it) {
  const c = it.c;
  const s = newSession(env, c);
  for (const m of c.setup ?? []) await s.send(m);
  const t = await turn(s, c, c.message, c.lang === 'ro' ? { language: 'auto' } : undefined);
  return { id: c.id, world: c.world, tab: c.tab ?? null, message: c.message, lang: c.lang ?? 'en', setup: c.setup ?? [], source_id: c.source_id ?? null, families: c.families ?? [], known_gap: !!c.known_gap, expect: c.expect, ...t };
}

async function runDlg(env, it) {
  const d = it.d;
  const s = newSession(env, d);
  const turns = [];
  const prev = [];
  for (const [i, t] of d.turns.entries()) {
    if (t.tab) s.setWorldState('ui.shell', { activeTab: t.tab });
    const r = await turn(s, { world: d.world, expect: t.expect }, t.message, t.mode ? { mode: t.mode } : undefined);
    turns.push({ id: `${d.id}#t${i}`, world: d.world, tab: t.tab ?? d.tab ?? null, message: t.message, lang: 'en', setup: prev.slice(), families: d.families ?? [], turn: i, expect: t.expect, ...r });
    prev.push(t.message);
  }
  return { turns };
}

const parsedSegs = (reply) => (reply?.segments ?? []).filter((x) => !x.unparsed && x.wires?.length);

async function runRec(env, it) {
  const s = newSession(env, it);
  for (const m of it.setup ?? []) await s.send(m);
  let reply, error = null;
  try { reply = await s.send(it.text); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const base = { id: it.id, world: it.world, tab: it.tab ?? null, message: it.text, lang: 'en', setup: it.setup ?? [], goldOp: it.gold.op, reply: reply?.text?.slice(0, 200), segments: (reply?.segments ?? []).map(segInfo), statuses: reply?.statuses };
  if (!segs.length) return { ...base, outcome: 'not_understood', error };
  const main = segs[0].wires.find((w) => w.type !== 'core.agent');
  if (!main) return { ...base, outcome: 'not_understood' };
  let got; try { got = wireToRec(env.engine.set, main); } catch { return { ...base, outcome: 'wrong', gotOp: '?' }; }
  const key = (x) => `${x.key.replace(/^core\.request\./, '')}=${normVal(x.value)}`;
  const g = new Set(it.gold.slots.map(key)), a = new Set(got.slots.map(key));
  const ok = got.op === it.gold.op && g.size === a.size && [...g].every((x) => a.has(x));
  return { ...base, outcome: ok ? 'right' : 'wrong', gotOp: got.op, gotWorld: segs[0].match?.worldId ?? null, failing: ok ? [] : [`gold ${it.gold.op} ${[...g].join(' ')} | got ${got.op} ${[...a].join(' ')}`.slice(0, 200)] };
}

async function runReal(env, it) {
  const s = newSession(env, it);
  for (const m of it.setup ?? []) await s.send(m);
  let reply, error = null;
  try { reply = await s.send(it.text, it.lang === 'ro' ? { language: 'auto' } : undefined); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const worlds = segs.map((x) => x.match?.worldId).filter(Boolean);
  const base = { id: it.id, world: it.expectWorld, tab: it.tab ?? null, message: it.text, lang: it.lang ?? 'en', setup: it.setup ?? [], expectProse: it.expect, reply: reply?.text?.slice(0, 200), english: reply?.trace?.english ?? null, segments: (reply?.segments ?? []).map(segInfo), statuses: reply?.statuses, loggedStatus: it.loggedStatus };
  if (!segs.length) return { ...base, outcome: 'not_understood', error };
  if (!it.expectWorld) return { ...base, outcome: 'unjudged' };
  return { ...base, outcome: worlds.includes(it.expectWorld) ? 'right' : 'wrong', gotWorlds: worlds };
}

async function runMobile(env, it) {
  const s = newSession(env, it);
  let reply, error = null;
  try { reply = await s.send(it.text, { language: 'en' }); } catch (e) { error = e.message; }
  const segs = parsedSegs(reply);
  const worlds = segs.map((x) => x.match?.worldId).filter(Boolean);
  const base = { id: it.id, world: it.loggedWorld, tab: it.tab ?? null, message: it.text, lang: 'ro-voice', original: it.original, setup: [], reply: reply?.text?.slice(0, 200), segments: (reply?.segments ?? []).map(segInfo), loggedStatus: it.loggedStatus };
  if (!segs.length) return { ...base, outcome: 'not_understood', error };
  if (it.loggedStatus === 'supported' && !worlds.includes(it.loggedWorld)) return { ...base, outcome: 'wrong', gotWorlds: worlds };
  return { ...base, outcome: it.loggedStatus === 'supported' ? 'right' : 'unjudged', gotWorlds: worlds };
}

async function runLoose(env, it) {
  const [r] = await evaluateRows(env.engine, env.settings, [it.row]);
  if (r.invalid) return { id: r.id, world: r.world, outcome: 'invalid', message: it.row.message, setup: [] };
  const o = r.on.outcome;
  const outcome = o === 'recovered' || o === 'right' ? 'right' : o === 'misled' ? 'wrong' : 'not_understood';
  return { id: r.id, world: r.world, tab: it.row.tab ?? null, message: it.row.message, intent: it.row.intent, junk: it.row.kind === 'junk', lang: 'en', setup: it.row.setup ?? [], outcome, off: r.off.outcome, reply: r.on.reply, segments: [] };
}

async function typoRead(env, text, tab) {
  const s = env.engine.createSession(sessionOptions(env.settings, { language: 'en' }));
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  const reply = await s.send(text);
  return { understood: reply.segments.some((x) => !x.unparsed), viaReader: reply.segments.some((x) => x.reader?.used), sig: reply.segments.map((x) => `${x.match?.worldId ?? '-'}:${x.match?.patternId ?? '-'}`).join('+'), state: strip(s.state()), reply, text: reply.text };
}
const plain = (t) => String(t).replace(/\s*\(I read [^)]*\)/g, '').trim();   // the note that says a word was spelled another way is no part of the answer
async function runTypo(env, it) {
  const r = it.r;
  const o = await typoRead(env, r.original, r.tab);
  if (!o.understood) return { id: r.id, world: r.world, outcome: 'invalid', message: r.typo, setup: [] };
  const t = await typoRead(env, r.typo, r.tab);
  // a reading of the reader (READER-ROUTE) has no pattern id of the rules: it is the same reading when the world state and the reply are the same
  const same = t.sig === o.sig || ((t.viaReader || o.viaReader) && plain(t.text) === plain(o.text));
  const outcome = !t.understood ? 'not_understood' : same && t.state === o.state ? 'right' : 'wrong';
  return { id: r.id, world: r.world, tab: r.tab ?? null, message: r.typo, original: r.original, typoKind: r.kind, lang: 'en', setup: [], outcome, reply: t.text.slice(0, 200), segments: t.reply.segments.map(segInfo) };
}

const RUN = { op: runOp, dlg: runDlg, rec: runRec, real: runReal, mobile: runMobile, loose: runLoose, typo: runTypo };

async function buildEnv({ mode, ort }) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const rt = await openNodeRuntime({ engine, mode, ortPath: ort, dispatcherDir: join(REPO, 'docs/webchat/models/dispatcher'), normalizerDir: join(REPO, 'docs/webchat/models/normalizer'), ortThreads: mode === 'rules' ? 0 : 1 });
  return { engine, settings: rt.settings };
}

if (!isMainThread) {
  serveShard(async (wd) => {
    const env = await buildEnv(wd);
    return async (it) => {
      try { return { kind: it.kind, set: it.set, ...(await RUN[it.kind](env, it)) }; } catch (e) { return { kind: it.kind, set: it.set, id: it.id ?? it.c?.id ?? it.d?.id ?? it.row?.id ?? it.r?.id, outcome: 'wrong', error: `crash: ${String(e?.message ?? e).slice(0, 120)}`, segments: [] }; }
    };
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const mode = arg('mode', 'rules');
  if (arg('reader')) process.env.PSYS2_READER = arg('reader');   // READER-ROUTE (spec 16 section 7): off | fill | choose
  if (arg('world-aware')) process.env.PSYS2_WORLD_AWARE = arg('world-aware');   // E2: off | veto | choose | observe (worker threads inherit the environment)
  const sets = arg('sets', 'operational,operational-ro,dialogues,gold,loose,typos,real,mobile').split(',');
  const items = buildItems(sets, arg('limit') ? Number(arg('limit')) : 0);
  const t0 = Date.now();
  const raw = await runSharded({ file: SELF, items, jobs: Math.max(1, Math.min(parseJobs(), items.length)), workerData: { mode, ort: arg('ort') }, chunk: 4 });
  const rows = raw.flatMap((r) => (r.turns ? r.turns.map((t) => ({ kind: 'dlg', set: 'dialogues', ...t })) : [r]));
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify({ mode, date: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), rows }));
  const by = {};
  for (const r of rows) { const b = (by[r.set] ??= { n: 0 }); b.n++; b[r.outcome] = (b[r.outcome] ?? 0) + 1; }
  console.log(mode, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(by));
}
