#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE REAL SET (owner decision 2026-11-14 22:10: priorities from real problems; synthetic sets are secondary diagnostics, kept, not deleted).
 * Every real user turn the repository holds, in order, per session, in the tab it was typed in:
 *   owner-log a/b/c      training/eval/owner-log-2026-11-13{,b,c}.jsonl   (a: hand checks of owner-log-checks.json; b, c: the owner's class + expectation text)
 *   voice / mobile logs  training/eval/real-phrases-2026-11-09{c,d,e}.jsonl, real-phrases-2026-11-09f-mobile.json   (phrase-log exports: the turns only)
 *   first dialogue notes training/eval/real-dialogue-2026-11-09{,b}.txt   (one typed line each, no tab recorded: read on the avatar tab)
 *   real dialogues       dialogues of training/eval/dialogues.jsonl with the family `real` (authored from real turns, with state / answer expectations per turn)
 *   Romanian originals   training/eval/ro-en-meaning/real-ro.tsv rows of an owner / phrase-log source whose text is in none of the above
 * Live-demo checks (scripts/check-live-demo.mjs) press buttons and read page errors; they send no typed turn, so they add no row here (their findings are ledger rows, flagged real).
 *
 * JUDGING: `judge: "state"` when an expectation exists (owner-log a checks, real dialogue expectations, or an `ok`-class owner turn whose logged outcome was fine: it must still execute) -> verdict right / partly / wrong.
 * Otherwise `judge: "outcome"`: no expectation can be derived, the turn gets an outcome class only (unjudged): executed | refused | asked | not_understood | other_world. For an owner turn the owner reported as a
 * problem (class != ok) the verdict is `open` while the reply is the logged one or nothing was understood, and `changed` when the reply differs and something was done (to be looked at by hand, not counted right).
 *
 *   node scripts/real-set.mjs build                          writes training/eval/real-2026-11-15.jsonl
 *   node scripts/real-set.mjs run --reasoner matrix|ops [--mode shipped|rules] [--ort <onnxruntime-node entry> | PSYS2_ORT] [--seed N]
 *                                                            replays every session (fresh session per session, turns in order). THE HEADLINE is the shipped mode (P1, reviewer 2026-11-15 01:15:
 *                                                            the page's settings, the encoder formalizer, the catalog at the pinned commit, seeded random choices) and writes
 *                                                            training/results/real-2026-11-15-<reasoner>.json; `--mode rules` is the named diagnostic (…-<reasoner>-rules.json)
 *   node scripts/real-set.mjs diff <result a> <result b>     the rows that differ (ms and ticks ignored): two runs of one tree must give none
 *   node scripts/real-set.mjs sites [<result>] [--top N]     the budget ticks per site (scripts/lib/tick-profile.mjs): top sites by total and by growth with the session
 *                                                            (every run row carries `pos` and `tk: { total, sites }`, the file a top-level `ticks` profile; SCAN-PROFILE)
 *   node scripts/real-set.mjs ledger [--write]               closes the open ledger rows of removed worlds (ADR-010) and adds the failing real turns that have no open real row
 *   node scripts/real-set.mjs report                         the outcome table of both reasoners + the REAL failures grouped by cause (training/eval/real-failures-2026-11-15.{json,md})
 *   node scripts/real-set.mjs flag                           adds `real: true|false` to every row of training/eval/failures.jsonl by source (idempotent)
 *   node scripts/real-set.mjs record [--allow-stale]         prints the series for scripts/learning-curve.mjs (right / judged of the REAL set, matrix reasoner); refuses a result file whose
 *                                                            measured tree is not the current one (scripts/lib/measure-build.mjs) unless --allow-stale
 *
 * RETIRED RECORDS (one rule; reviewer 2026-11-15 04:00, Q23): a source record that carries the `retired` field (a dialogue of training/eval/dialogues.jsonl, an owner-log turn)
 * is skipped: its rows stay in the set with `retired` (so the ids of the other rows do not move) and are never replayed, judged or counted. The script has no rule of its own
 * about what is retired; the record says so (`retired: { reason, date }`).
 * Every result file records the build it was measured on (`build`, `tree`).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { causeOf } from './lib/failure-cause.mjs';
import { isRealRow, realDialogueIds } from './lib/real-source.mjs';
import { buildInfo, freshness } from './lib/measure-build.mjs';
import { profileSites, formatProfile } from './lib/tick-profile.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SET = join(REPO, 'training/eval/real-2026-11-15.jsonl');
const RES = (r, tag = '') => join(REPO, `training/results/real-2026-11-15-${r}${tag}.json`);
const jl = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const loggedClass = (s) => (s === 'supported' ? 'executed' : s === 'unsupported' || s === 'conflicting' ? 'refused' : s === 'missing' || s === 'unknown' ? 'asked' : s === 'unparsed' ? 'not_understood' : null);

// ---------------------------------------------------------------- build
export function build() {
  const rows = [];
  const add = (r) => rows.push({ id: `r${String(rows.length + 1).padStart(4, '0')}`, ...r });
  const day = (t) => String(t ?? '').slice(0, 10);

  // owner logs
  const checks = JSON.parse(readFileSync(join(REPO, 'training/eval/owner-log-checks.json'), 'utf8'));
  for (const sfx of ['', 'b', 'c']) {
    const name = `owner-log-2026-11-13${sfx}`;
    jl(`training/eval/${name}.jsonl`).forEach((r, i) => {
      const chk = sfx === '' ? checks[i] : null;
      const tab = r.tab ?? (r.activeWorld ? 'robot' : null);
      const lc = loggedClass(r.got?.status);
      const base = { set: name, session: `${name}@${day(r.time)}`, i, tab, lang: r.lang ?? 'en', text: r.text, class: r.class ?? null, logged: { status: r.got?.status ?? null, answer: (r.got?.answer ?? '').slice(0, 200), outcome: lc }, time: r.time, ...(r.retired ? { retired: r.retired } : {}) };
      if (chk) add({ ...base, judge: 'state', check: { world: chk.world ?? 'art.draw', expect: chk }, source: 'owner-log' });
      else if (r.class === 'ok') add({ ...base, judge: 'state', check: { regress: true, was: lc ?? 'executed' }, source: 'owner-log' });
      else add({ ...base, judge: 'outcome', expected_note: r.expected ?? null, source: 'owner-log' });
    });
  }
  // voice / mobile phrase logs (turns only)
  for (const k of ['c', 'd', 'e']) {
    const name = `real-phrases-2026-11-09${k}`;
    jl(`training/eval/${name}.jsonl`).forEach((r, i) => add({ set: name, session: `${name}@${day(r.time)}`, i, tab: r.tab ?? 'robot', lang: r.lang ?? 'en', mode: r.mode === 'voice' ? 'voice' : undefined, text: r.text, class: null, logged: { status: r.status, outcome: loggedClass(r.status) }, time: r.time, judge: 'outcome', source: 'phrase-log' }));
  }
  JSON.parse(readFileSync(join(REPO, 'training/eval/real-phrases-2026-11-09f-mobile.json'), 'utf8')).records.forEach((r, i) => add({ set: 'real-phrases-2026-11-09f-mobile', session: `real-phrases-2026-11-09f-mobile@${day(r.time)}`, i, tab: r.tab ?? 'robot', lang: r.lang ?? 'en', mode: r.mode === 'voice' ? 'voice' : undefined, text: r.text, class: null, logged: { status: r.status, outcome: loggedClass(r.status) }, time: r.time, judge: 'outcome', source: 'phrase-log' }));
  // first dialogue notes (typed lines; tab not recorded)
  for (const name of ['real-dialogue-2026-11-09', 'real-dialogue-2026-11-09b']) {
    readFileSync(join(REPO, `training/eval/${name}.txt`), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).forEach((text, i) => add({ set: name, session: name, i, tab: 'robot', lang: 'en', text, class: null, logged: {}, judge: 'outcome', source: 'owner-dialogue' }));
  }
  // real dialogues with expectations
  for (const d of jl('training/eval/dialogues.jsonl').filter((x) => (x.families ?? []).includes('real'))) {
    let tab = d.tab ?? null;
    d.turns.forEach((t, i) => { if (t.tab) tab = t.tab; add({ set: `dialogues:${d.id}`, session: `dialogues:${d.id}`, i, tab, lang: 'en', mode: t.mode, text: t.message, class: (d.families ?? []).join(','), logged: {}, init: i === 0 ? d.init : undefined, judge: 'state', check: { world: d.world, expect: t.expect }, source: 'real-dialogue', ...(d.retired ? { retired: d.retired } : {}) }); });
  }
  // Romanian originals of owner / phrase-log sources not already present
  const have = new Set(rows.map((r) => norm(r.text)));
  const ro = readFileSync(join(REPO, 'training/eval/ro-en-meaning/real-ro.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  for (const [rid, tab, src, text] of ro) {
    if (!text || src === 'ledger' || have.has(norm(text))) continue;
    have.add(norm(text));
    add({ set: 'real-ro.tsv', session: `real-ro.tsv:${src}`, i: rows.length, tab: tab || 'robot', lang: 'ro', text, class: null, logged: {}, judge: 'outcome', source: src });
  }
  // owner phrase-log exports (training/eval/owner-exports/*.json, format psys2-phrase-log/3): the typed and spoken turns, appended after everything else so the ids above stay
  const exDir = join(REPO, 'training/eval/owner-exports');
  for (const f of existsSync(exDir) ? readdirSync(exDir).filter((x) => x.endsWith('.json')).sort() : []) {
    const name = `owner-exports/${f.replace(/\.json$/, '')}`;
    (JSON.parse(readFileSync(join(exDir, f), 'utf8')).records ?? []).filter((r) => r.source !== 'dry-run' && r.text).forEach((r, i) => add({ set: name, session: `${name}@${day(r.time)}`, i, tab: r.tab ?? r.routing?.activeTab ?? 'talk', lang: r.lang ?? 'en', mode: r.mode === 'voice' ? 'voice' : undefined, text: r.text, class: null, logged: { status: r.status ?? null, answer: String(r.detail?.answer ?? r.answer ?? '').slice(0, 200), outcome: loggedClass(r.status) }, time: r.time, judge: 'outcome', source: 'owner-export' }));
  }
  for (const r of rows) forbidThieves(r);
  writeFileSync(SET, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return rows;
}

/** An owner-log check that only forbids a reply ("did not understand", "can not find") is met by ANY world's reply: another tab's world answering a transpose question for
 *  "muta si mai la stinga" passed it. Such a check also gets `world_not` for the tab worlds that cannot own the request (all but the check's world and the tab's world). */
function forbidThieves(r) {
  const ex = r.check?.expect;
  if (r.source !== 'owner-log' || r.judge !== 'state' || !ex || !Object.keys(ex).length || !Object.keys(ex).every((k) => k === 'reply_not')) return;
  const own = new Set([r.check.world, tabWorldOfRow(r)].filter(Boolean));
  r.check = { ...r.check, expect: { ...ex, world_not: THIEVES.filter((w) => !own.has(w)) } };
}

// ---------------------------------------------------------------- removed tabs and worlds (ADR-010)
/** The tabs and worlds ADR-010 removed, and the names a user or a reply gives them. */
export const REMOVED = {
  tabs: new Set(['chess', 'tictactoe', 'hangman', 'guess', 'profile', 'reader']),
  worlds: /\b(?:games\.[\w.]+|user\.profile|docs\.reader)\b/,
  names: /\b(?:hangman|tic[- ]?tac[- ]?toe|noughts and crosses|chess|guess the animal|profile)\b/i,
};
/** The surviving worlds with a tab (a forbid-only owner check must not be met by another tab's world). */
const THIEVES = ['art.draw', 'media.music', 'diagram.sketch', 'geo.map', 'data.charts', 'plan.seating', 'plan.timeline', 'docs.editor'];
/** The world of a row's tab. */
const TAB_WORLD = { draw: 'art.draw', drawing: 'art.draw', music: 'media.music', diagram: 'diagram.sketch', map: 'geo.map', charts: 'data.charts', editor: 'docs.editor', documents: 'docs.editor' };
const tabWorldOfRow = (r) => TAB_WORLD[r.tab] ?? null;
/** Old tab names of the logs and their current tab ids (the page renamed `drawing` to `draw`). */
const TAB_ALIAS = { drawing: 'draw' };

// ---------------------------------------------------------------- run
/** The seed of the random choices of a run (P1 a): every session starts its own generator from it and the session key, so two runs give identical rows, and a session's
 *  replies do not depend on the sessions before it. `Math.random` is the only random source of the runtime and the worlds (music's song, the diagram template). */
export const REAL_SEED = 20261115;
const hash32 = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** The fixed clock of a run: `Date.now()` seeds a few choices (textgen's random topics); it reads a constant that moves 1 ms per call, reset per session. Durations are
 *  read from `performance.now()`, which stays real (the run has no turn deadline: hardMs is unset, as in node it is Infinity). */
const RUN_EPOCH = Date.parse('2026-11-15T12:00:00Z');

/** The result file of a run: the shipped mode is the headline (real-2026-11-15-<reasoner>.json); another mode is a named diagnostic (…-<reasoner>-<mode>.json). */
const resultFile = (reasoner, mode, tag) => RES(reasoner, tag || (mode === 'shipped' ? '' : `-${mode}`));

/**
 * Replays the set. `mode`:
 *   shipped  (default, the headline): what the page runs. The webchat's own settings (docs/webchat/ui/settings.mjs DEFAULT_SETTINGS through applyReading: the encoder formalizer
 *            with the DistilBERT dispatcher, fastPath, worldAware veto, nxStrategy rules, the matrix reasoner), the per-turn send options of docs/webchat/app.mjs, and the
 *            knowledge the page loads: the catalog at the pinned commit (src/knowledge/catalog-pin.mjs) layered over the bundled subset, as engine-worker.mjs does.
 *            Needs onnxruntime-node: --ort <entry> or PSYS2_ORT.
 *   rules    (named diagnostic): the same, with the rules formalizer only (no model).
 */
async function run(reasoner, { tag = '', bergamot = null, voice = false, mode = 'shipped', ortPath = process.env.PSYS2_ORT ?? null, seed = REAL_SEED } = {}) {
  if (!['shipped', 'rules'].includes(mode)) throw new Error(`unknown mode ${mode} (shipped | rules)`);
  if (mode === 'shipped' && !ortPath) throw new Error('the shipped mode runs the encoder formalizer: pass --ort <onnxruntime-node entry> (or PSYS2_ORT), or --mode rules for the diagnostic');
  const build0 = buildInfo(REPO);   // the files measured, taken before the run (spec 16 section 14, "Measurement")
  process.env.PSYS2_REASONER = reasoner;
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../src/dialog/index.mjs');
  const { sessionOptions, runtimeSettings } = await import('../src/dialog/runtime-config.mjs');
  const { createTranslator } = await import('../src/translate/index.mjs');
  const { createSwitchTranslator } = await import('../docs/webchat/ui/translation.mjs');
  const { DEFAULT_SETTINGS, applyReading } = await import('../docs/webchat/ui/settings.mjs');
  const { visibleState } = await import('./lib/visible-state.mjs');
  const { evaluateCase, classify } = await import('./lib/operational-check.mjs');
  const { createFacts } = await import('../src/knowledge/facts.mjs');
  const { createKnowledgeSource } = await import('../src/loaders/knowledge-source.mjs');
  const { createLayeredSource } = await import('../src/knowledge/bundled-source.mjs');
  const { pinnedCatalog } = await import('./lib/catalog-pin.mjs');
  const { createBudget } = await import('../src/dialog/budget.mjs');
  const catalog = pinnedCatalog();
  const rules = createTranslator();
  // --bergamot <cacheDir>: the on-device model (Bergamot ro-en / en-ro in node) as the MT source, as the shipped chain has it (the browser Translator API does not exist in node); --voice: the Romanian grammar voice (src/translate/voice-ro.mjs)
  let mt = null;
  if (bergamot) { const { createNodeMt } = await import('./lib/mt-node.mjs'); mt = await createNodeMt({ cacheDir: bergamot }); await mt.ensure('ro'); }
  const roVoice = voice ? (await import('../src/translate/voice-ro.mjs')).createRoGrammarVoice() : null;
  const mtBackend = { translatorKind: () => 'mt', detectorKind: () => null, supports: () => true, sources: async () => ['model'], translate: (t, f, to) => mt?.translate(t, f, to), detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'ready' };
  const translator = createSwitchTranslator({ rules, getStrategy: () => 'auto', voices: () => (roVoice ? [roVoice] : []), backend: mt ? mtBackend : { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' } });
  // the page's settings (a first visit: no saved profile), with the reasoner of this run; the rules diagnostic switches the helper model off as Settings › Reading does
  const settings = applyReading({ ...DEFAULT_SETTINGS, reasoner, ...(mode === 'rules' ? { helperModel: false } : {}) });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator, options: { reasoner: settings.reasoner === 'ops' ? 'ops' : 'matrix' } });
  try { await engine.prepareMeta?.(); } catch { /* the policy router answers alone (spec 20), as on the page */ }
  // the knowledge the page loads (engine-worker.mjs): the catalog, here its checkout at the pinned commit, over the bundled subset
  const catSource = createKnowledgeSource(catalog.dir);
  engine.setKnowledge(createFacts({ source: createLayeredSource({ text: (p) => catSource.text(p).catch(() => null) }) }));
  let model = null;
  if (settings.formalizer === 'encoder') {
    const { openNodeRuntime } = await import('./lib/runtime-node.mjs');
    // one ORT thread: the same scores on every run (a parallel reduction may round differently)
    const rt = await openNodeRuntime({ engine, mode: 'encoder', ortPath, ortThreads: 1, overrides: runtimeSettings(settings) });
    model = rt.info.hashes;
  }
  const rows = jl('training/eval/real-2026-11-15.jsonl'.replace(/^/, ''));
  const META = new Set(['ui.shell', 'ui.help', 'talk', 'kids.common', 'conversation']);
  const bySession = new Map();
  for (const r of rows) if (!r.retired) (bySession.get(r.session) ?? bySession.set(r.session, []).get(r.session)).push(r);   // a retired record is never replayed
  const out = [];
  const strip = (st) => JSON.stringify(visibleState(st));
  const RealDate = Date, realRandom = Math.random;
  let fake = RUN_EPOCH;
  const clock = () => fake++;
  class RunDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock()); } static now() { return clock(); } }
  globalThis.Date = RunDate;
  try {
  for (const [key, turns] of bySession) {
    Math.random = mulberry32(seed ^ hash32(key));   // P1 a: seeded per session
    fake = RUN_EPOCH;
    const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    s.fastPath = settings.fastPath === true;   // as engine-worker.mjs applySettings
    for (const [pos, r] of turns.entries()) {
      if (r.init) for (const [w, patch] of Object.entries(r.init)) s.setWorldState(w, patch);
      // a removed tab (ADR-010) is shown as the page shows it now: the Chat (Talk) tab; an old tab name is the tab's current id
      if (r.tab) s.setWorldState('ui.shell', { activeTab: REMOVED.tabs.has(r.tab) ? 'talk' : (TAB_ALIAS[r.tab] ?? r.tab) });
      const before = s.state();
      const tabWorld = s.context?.().tabWorld ?? tabWorldOfRow(r);   // the tab the turn was typed in (read before the turn: a turn that switches tab and acts there is not "its own tab")
      const t0 = performance.now();
      let reply = null, error = null;
      const tb = createBudget();   // the turn's budget (the default limits), passed in so its ticks per site are read on every outcome (SCAN-PROFILE)
      // the send options of docs/webchat/app.mjs (the page's turn), without the deadline (none in node: a measurement does not depend on the machine's load)
      const opts = { mode: r.mode === 'voice' ? 'voice' : undefined, language: r.lang === 'ro' ? 'ro' : 'en', formalizer: settings.formalizer, spell: settings.spellcheck !== false, partial: settings.partialUnderstanding !== false, bestEffort: settings.bestEffort !== false, worldAware: settings.worldAware ?? 'veto', fastPath: settings.fastPath === true, nx: settings.nxStrategy, budget: tb };
      try { reply = await s.send(r.text, opts); } catch (e) { error = e.message; }
      const ms = Math.round(performance.now() - t0);
      const tk = { total: tb.ticks, sites: { ...tb.bySite } };   // ticks per site of the turn (deterministic; `diff` ignores it like ms)
      if (!reply) { out.push({ id: r.id, outcome: 'not_understood', verdict: r.judge === 'state' ? 'wrong' : 'open', error, ms, pos, tk }); continue; }
      const after = s.state();
      const english = reply.trace?.replyEnglish ?? reply.text;
      const worlds = [...new Set(reply.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean))];
      const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
      const effects = reply.effects.filter((e) => e.name !== 'chat.suggest');
      const stateChanged = strip(before) !== strip(after);
      const acted = stateChanged || effects.length > 0 || reply.statuses.some((x) => x === 'supported');
      const outcome = outcomeOf({ unparsedAll, acted, statuses: reply.statuses, worlds, tabWorld, meta: META });
      const rec = { id: r.id, outcome, ms, reply: english.slice(0, 220), worlds, statuses: reply.statuses, pos, tk, ...(reply.tooComplex ? { budget: reply.budgetExceeded?.site ?? true } : {}) };   // budget: the step budget ran out (deterministic ticks), where
      if (r.judge === 'state' && r.check?.regress) {
        // an owner `ok` turn must still be done by the tab's world: another tab's world taking it (other_world) or nothing understood is never right (P1 b)
        rec.verdict = outcome !== 'not_understood' && outcome !== 'other_world' && (outcome === 'executed' || outcome === r.check.was) ? 'right' : 'wrong';
      } else if (r.judge === 'state') {
        const c = r.check;
        const items = evaluateCase({ world: c.world, expect: c.expect }, { before, after, message: r.text, replyText: english, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
        const bad = items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`);
        const ex = c.expect ?? {};
        if (ex.unchanged && stateChanged) bad.push('unchanged');
        for (const re of [].concat(ex.reply_not ?? [])) if (new RegExp(re, 'i').test(english)) bad.push(`reply_not:${re}`);
        if (ex.reply_any && ![].concat(ex.reply_any).some((re) => new RegExp(re, 'i').test(english))) bad.push(`reply_any:${ex.reply_any}`);
        for (const w of [].concat(ex.world_not ?? [])) if (worlds.includes(w)) bad.push(`world_not:${w}`);
        if ((unparsedAll || reply.tooComplex) && !notUnderstoodOk(ex)) bad.push('not_understood');   // P1 b: a forbid-only check is not met by "I did not understand"
        const cls = classify({ expect: ex }, items, { statuses: reply.statuses, unparsedAll, stateChanged, effects });
        rec.verdict = bad.length ? (cls === 'partly' ? 'partly' : 'wrong') : 'right';
        rec.failing = bad;
      } else if (r.class && r.class !== 'ok' && r.expected_note != null) {
        // the owner reported this turn as a problem: not countable as right by machine
        rec.verdict = outcome === 'executed' && norm(english) !== norm(r.logged?.answer) ? 'changed' : 'open';
      } else rec.verdict = null;   // unjudgeable
      out.push(rec);
    }
  }
  } finally { globalThis.Date = RealDate; Math.random = realRandom; }
  mt?.reset?.();
  const file = resultFile(reasoner, mode, tag);
  mkdirSync(dirname(file), { recursive: true });
  // P1 c: the result carries what was measured: the build and tree, the mode and its settings, the catalog commit, the model files, the seed
  const head = { reasoner, mode, tag, mt: !!mt, voice, date: new RealDate().toISOString().slice(0, 10), ...build0, catalog: { commit: catalog.commit, url: catalog.url }, seed, settings: runtimeSettings(settings), model };
  const profile = profileSites(out);   // from every site of every turn; a row then keeps its 12 busiest sites (the file stays small)
  for (const x of out) if (x.tk) x.tk.sites = Object.fromEntries(Object.entries(x.tk.sites).sort((p, q) => q[1] - p[1]).slice(0, 12));
  writeFileSync(file, `${JSON.stringify({ ...head, ticks: { total: profile.total, sites: profile.sites }, rows: out }, null, 1)}\n`);
  console.log(formatProfile(profile));
  console.log(`wrote ${file} (${out.length} turns; mode ${mode}, catalog ${catalog.short}, seed ${seed}, build ${build0.build}, tree ${build0.tree})`);
}

/** The outcome class of a reply. A turn another tab's world took (done, refused or asked) is `other_world`: music answering the Romanian "o" on the drawing tab is theft, not
 *  an answer (P1 b; architecture review finding 3); the shell, help, talk and conversation worlds answer on every tab. */
export function outcomeOf({ unparsedAll, acted, statuses, worlds, tabWorld, meta }) {
  const foreign = !!tabWorld && worlds.length > 0 && !worlds.includes(tabWorld) && !worlds.every((w) => meta.has(w));
  if (unparsedAll || (!acted && !statuses.some((x) => ['unsupported', 'conflicting', 'missing', 'unknown'].includes(x)))) return 'not_understood';
  if (foreign) return 'other_world';
  if (!acted) return statuses.some((x) => x === 'unsupported' || x === 'conflicting') ? 'refused' : 'asked';
  return 'executed';
}

/** A judged turn may be met by "I did not understand" only when its check says nothing should happen (`unchanged`, the owner's hand check of a garbled or out-of-scope turn)
 *  or asks for the not-understood status itself; a check that only forbids (reply_not, world_not, forbid_answer) is not met by it (P1 b: r0043 "sa fie diferite"). */
export const notUnderstoodOk = (ex) => ex.unchanged === true || [].concat(ex.status ?? []).includes('unparsed');

// ---------------------------------------------------------------- report
const OUTCOMES = ['executed', 'refused', 'asked', 'not_understood', 'other_world'];
export function tableOf(setRows, res) {
  const by = new Map(res.rows.map((x) => [x.id, x]));
  const t = { turns: 0, judged: 0, right: 0, partly: 0, wrong: 0, open: 0, changed: 0, unjudged: 0, outcome: Object.fromEntries(OUTCOMES.map((o) => [o, 0])), by_source: {}, retired: 0 };
  for (const r of setRows) {
    if (r.retired) { t.retired++; continue; }   // a retired record: skipped (counted as skipped turns only)
    const x = by.get(r.id); if (!x) continue;
    t.turns++; t.outcome[x.outcome]++;
    const s = (t.by_source[r.set.replace(/^dialogues:.*/, 'real dialogues')] ??= { turns: 0, judged: 0, right: 0 });
    s.turns++;
    if (x.verdict === 'right' || x.verdict === 'partly' || x.verdict === 'wrong') { t.judged++; t[x.verdict]++; s.judged++; if (x.verdict === 'right') s.right++; }
    else if (x.verdict === 'open') t.open++; else if (x.verdict === 'changed') t.changed++; else t.unjudged++;
  }
  return t;
}

/** A failing turn (a work item): judged wrong / partly; an owner-reported turn still open; an unjudged turn nobody understood, refused, or that a world other than the tab's took. */
const isFailure = (r, x) => !r.retired && (x.verdict === 'wrong' || x.verdict === 'partly' || x.verdict === 'open' || (x.verdict === null && ['not_understood', 'refused', 'other_world'].includes(x.outcome)));

const GENERIC = new Set(['other / wrong result', 'not understood (no cause key)']);
/** The cause of a real failing turn: the ledger's causeOf, refined for the generic groups by what the reply says. */
export function realCause(row) {
  const c = causeOf(row);
  if (!GENERIC.has(c)) return c;
  const h = row.happened ?? '', words = String(row.text).trim().split(/\s+/).length;
  if (/did not know the words?|do not know what|don't know what|did not know the word/i.test(h)) return 'unknown word (a word of the request is not known)';
  if (row.language !== 'en') return 'Romanian turn not read (translation or reader)';
  if (/\[outcome: \w+; (wrong|partly)/.test(h)) return `judged wrong (state / answer expected is not there): ${String(row.set).replace(/#.*/, '').replace(/^real-phrases.*/, 'phrase log')}`;
  if (/\[outcome: other_world\]/.test(h)) return 'a world other than the open tab took the turn';
  if (/\[outcome: refused\]/.test(h)) return 'refused: the request names something the world does not support';
  if (words <= 2) return 'bare word or two-word fragment not read';
  if (/\[outcome: not_understood\]/.test(h)) return 'sentence not read by any world (no cause key)';
  return c;
}

export function failureRows(setRows, res, tag) {
  const by = new Map(res.rows.map((x) => [x.id, x]));
  const out = [];
  for (const r of setRows) {
    const x = by.get(r.id); if (!x || !isFailure(r, x)) continue;
    out.push({ id: r.id, text: r.text, tab: r.tab, language: r.lang ?? 'en', set: r.set, class: r.class ?? '', happened: `${x.reply ?? '(no reply)'} [outcome: ${x.outcome}${x.verdict ? `; ${x.verdict}` : ''}${x.failing?.length ? `; ${x.failing.join(' ')}` : ''}]`, reasoner: tag });
  }
  return out;
}

function report() {
  const setRows = jl('training/eval/real-2026-11-15.jsonl');
  const res = { matrix: JSON.parse(readFileSync(RES('matrix'), 'utf8')), ops: JSON.parse(readFileSync(RES('ops'), 'utf8')) };
  const tables = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, tableOf(setRows, v)]));
  // causes: failures on the matrix reasoner (the default); a turn failing on ops only is counted in `ops_only`
  const fm = failureRows(setRows, res.matrix, 'matrix'), fo = failureRows(setRows, res.ops, 'ops');
  const opsIds = new Set(fo.map((r) => r.id));
  const groups = new Map();
  for (const r of fm) { const c = realCause(r); (groups.get(c) ?? groups.set(c, []).get(c)).push({ ...r, both: opsIds.has(r.id) }); }
  const ids = new Set(fm.map((r) => r.id));
  const opsOnly = fo.filter((r) => !ids.has(r.id));
  // ledger rows flagged real that are not turns of the set (feedback exports, live-demo findings): listed as extra evidence
  const have = new Set(setRows.map((r) => norm(r.text)));
  const dlg = realDialogueIds(REPO);
  const extra = jl('training/eval/failures.jsonl').filter((r) => (r.real ?? isRealRow(r, dlg)) && !have.has(norm(r.text)));
  const top = [...groups.entries()].map(([cause, rows]) => ({ cause, count: rows.length, both_reasoners: rows.filter((x) => x.both).length, examples: rows.slice(0, 4).map((x) => ({ text: x.text, tab: x.tab, happened: x.happened.slice(0, 160) })) })).sort((a, b) => b.count - a.count);
  // the rules-only diagnostic (P1 a: a named diagnostic, never the headline), when it was run
  const diag = existsSync(RES('matrix', '-rules')) ? JSON.parse(readFileSync(RES('matrix', '-rules'), 'utf8')) : null;
  const diagTable = diag?.mode === 'rules' ? tableOf(setRows, diag) : null;
  const measured = { mode: res.matrix.mode ?? null, build: res.matrix.build ?? null, tree: res.matrix.tree ?? null, catalog: res.matrix.catalog?.commit ?? null, seed: res.matrix.seed ?? null, formalizer: res.matrix.settings?.formalizer ?? null };
  const doc = { date: '2026-11-15', measured, set: setRows.length, tables, ...(diagTable ? { diagnostic_rules_matrix: { right: diagTable.right, judged: diagTable.judged, partly: diagTable.partly, wrong: diagTable.wrong, build: diag.build, tree: diag.tree } } : {}), failing_matrix: fm.length, failing_ops: fo.length, ops_only: opsOnly.length, causes: top, ledger_real_extra: extra.length };
  writeFileSync(join(REPO, 'training/eval/real-failures-2026-11-15.json'), `${JSON.stringify(doc, null, 1)}\n`);
  const md = [`# REAL failures by cause (2026-11-15)`, '', `Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: ${setRows.length} turns (training/eval/real-2026-11-15.jsonl). Replayed in the SHIPPED configuration (mode ${measured.mode}: formalizer ${measured.formalizer}, the webchat's settings and send options; catalog at the pinned commit ${String(measured.catalog).slice(0, 12)}; seed ${measured.seed}; build ${measured.build}, tree ${measured.tree}), matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by \`node scripts/real-set.mjs report\`.`, '',
    `Headline (in scope, judged): ${tables.matrix.right}/${tables.matrix.judged} right (partly ${tables.matrix.partly}, wrong ${tables.matrix.wrong}); ${tables.matrix.retired} turns of retired records skipped.${diagTable ? ` Diagnostic, rules formalizer only: ${diagTable.right}/${diagTable.judged}.` : ''}`, '',
    `Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node: --bergamot runs the on-device model), so part of the Romanian causes is the missing translation backend, not the reader. Lazy world loading is not replayed (every world is loaded, as \`?psys2lazy=0\`).`, '', `Failing turns: matrix ${fm.length}, ops ${fo.length} (${opsOnly.length} fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): ${extra.length}.`, '', '| # | cause | turns | both | examples |', '| --- | --- | ---: | ---: | --- |',
    ...top.slice(0, 15).map((c, i) => `| ${i + 1} | ${c.cause.replace(/\|/g, '/').slice(0, 150)} | ${c.count} | ${c.both_reasoners} | ${c.examples.slice(0, 3).map((e) => `"${String(e.text).replace(/\|/g, '/').slice(0, 60)}" (${e.tab})`).join('; ')} |`), ''].join('\n');
  writeFileSync(join(REPO, 'training/eval/real-failures-2026-11-15.md'), md);
  for (const [k, t] of Object.entries(tables)) console.log(`${k}: turns ${t.turns}, judged ${t.judged} (right ${t.right}, partly ${t.partly}, wrong ${t.wrong}), open ${t.open}, changed ${t.changed}, unjudged ${t.unjudged}; outcome ${JSON.stringify(t.outcome)}; retired records skipped: ${t.retired} turns`);
  if (diagTable) console.log(`diagnostic (rules formalizer only, matrix): judged ${diagTable.judged} (right ${diagTable.right}, partly ${diagTable.partly}, wrong ${diagTable.wrong})`);
  for (const [k, v] of Object.entries(res)) { const f = freshness(REPO, v); if (!f.fresh) console.log(`WARNING ${k}: ${f.why}`); if (v.mode !== 'shipped') console.log(`WARNING ${k}: mode ${v.mode ?? 'unrecorded'}, not the shipped one`); }
  console.log(md);
}

// ---------------------------------------------------------------- ledger hygiene (P1 d)
/** A ledger row of a removed world (ADR-010): typed on a removed tab; a removed world id in what the row records (not in its cause or class, which may only compare);
 *  a removed game named by the user or by the reply; an expectation that needs a removed world (and not one that forbids it: "never hangman" stays). Returns the reason or null. */
export function removedWorldOf(r) {
  if (REMOVED.tabs.has(r.tab)) return `typed on the removed ${r.tab} tab`;
  // the reply as recorded, without the suggestions it offers ("Did you mean ...", "For example: ...": a removed world's example sentence is not the failure) and without the
  // [bracketed] notes of whoever wrote the row (they may tell the history: "before the cut games.hangman took the letter")
  const reply = String(r.happened ?? '').replace(/\[[^\]]*\]/g, '').replace(/Did you mean[^?]*\?|For example:.*$|You can try,? for example:.*$/gi, '');
  const rec = [...['text', 'tab', 'expected', 'source', 'world_test'].map((k) => (typeof r[k] === 'string' ? r[k] : '')), reply].join(' \u0001 ');
  if (REMOVED.worlds.test(rec)) return `names the removed world ${REMOVED.worlds.exec(rec)[0]}`;
  const game = /\b(?:hangman|tic[- ]?tac[- ]?toe|noughts and crosses|chess|guess the animal|twenty questions)\b/i, profile = /^profile:|\b(?:my|the|your) profile\b/i;
  if (game.test(r.text) || profile.test(r.text)) return 'the user asks for a removed game or the profile';
  if (game.test(reply) || /We are not playing|you give up, so I win|Think of an animal/i.test(reply)) return 'the reply came from a removed world (it can not recur)';
  const ex = String(r.expected ?? '');
  if ((game.test(ex) || profile.test(ex)) && !/\b(?:never|no|not)\s+(?:\w+\s+)?(?:hangman|tic[- ]?tac[- ]?toe|chess|guess)/i.test(ex)) return 'the expectation needs a removed world';
  return null;
}

/**
 * P1 d, ledger hygiene (training/eval/failures.jsonl is the one work list):
 *   1. every open row of a removed world is closed (`closed`, `closed_reason` "ADR-010 ..."), kept, never deleted;
 *   2. every failing turn of the real set (the shipped headline run, retired rows excluded) that has no open real row gets one: `real: true`, `real_id`, `cause` (realCause).
 * Prints what it would do; --write writes the ledger.
 */
function ledger({ write = false } = {}) {
  const f = join(REPO, 'training/eval/failures.jsonl');
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const today = new Date().toISOString().slice(0, 10);
  let closed = 0;
  const why = {};
  for (const r of rows) {
    if (r.fixed || r.closed) continue;
    const w = removedWorldOf(r);
    if (!w) continue;
    r.closed = today; r.closed_reason = `ADR-010 tab cut: ${w}`; closed++;
    const k = w.replace(/the removed (?:world|\w+ tab).*$/, 'a removed world or tab'); why[k] = (why[k] ?? 0) + 1;
  }
  const res = JSON.parse(readFileSync(RES('matrix'), 'utf8'));
  if (res.mode !== 'shipped') throw new Error(`${RES('matrix')} is not a shipped-mode result: run the headline first`);
  const setRows = jl('training/eval/real-2026-11-15.jsonl');
  const byId = new Map(setRows.map((r) => [r.id, r]));
  const open = new Set(rows.filter((r) => r.real && !r.fixed && !r.closed).map((r) => `${norm(r.text)}\u0001${r.tab ?? ''}`));
  const openText = new Set(rows.filter((r) => r.real && !r.fixed && !r.closed).map((r) => norm(r.text)));
  const haveId = new Set(rows.map((r) => r.real_id).filter(Boolean));
  const added = [];
  for (const x of failureRows(setRows, res, 'matrix')) {
    if (haveId.has(x.id) || open.has(`${norm(x.text)}\u0001${x.tab ?? ''}`) || openText.has(norm(x.text))) continue;
    const r = byId.get(x.id);
    const expected = r.judge === 'state' ? `the check of the real set: ${JSON.stringify(r.check?.expect ?? r.check).slice(0, 300)}` : r.expected_note ? `owner: ${r.expected_note}` : 'a reading by the open tab\'s world (or a clean answer): the turn was not understood, refused, or taken by another tab\'s world';
    added.push({ text: x.text, tab: x.tab, language: x.language, happened: x.happened, expected, source: `real set 2026-11-15 ${x.id} (${r.set})`, class: realCause(x), cause: realCause(x), first_seen: today, build: res.build, real: true, real_id: x.id });
    open.add(`${norm(x.text)}\u0001${x.tab ?? ''}`); openText.add(norm(x.text));
  }
  console.log(`ledger rows ${rows.length}: closed ${closed} open rows of removed worlds (${JSON.stringify(why)}); real failing turns without an open real row: ${added.length} added (result ${res.build}, tree ${res.tree})`);
  const realOpen = rows.filter((r) => r.real && !r.fixed && !r.closed).length + added.length;
  console.log(`real open rows after: ${realOpen}`);
  if (write) { writeFileSync(f, `${[...rows, ...added].map((r) => JSON.stringify(r)).join('\n')}\n`); console.log(`wrote ${f}`); }
}

// ---------------------------------------------------------------- flag the ledger
function flag() {
  const f = join(REPO, 'training/eval/failures.jsonl'), dlg = realDialogueIds(REPO);
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let t = 0;
  const out = rows.map((r) => { const real = isRealRow(r, dlg); if (real) t++; const { real: _o, ...rest } = r; return { ...rest, real }; });
  writeFileSync(f, `${out.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.log(`ledger rows ${rows.length}: real ${t}, synthetic ${rows.length - t}`);
}

/** The headline point of the learning curve: share right of the judged turns of the real set (matrix reasoner, the default). */
export function headline() {
  const res = JSON.parse(readFileSync(RES('matrix'), 'utf8'));
  const t = tableOf(jl('training/eval/real-2026-11-15.jsonl'), res);
  const f = freshness(REPO, res);
  // the headline is the shipped configuration only (P1 a); a result of another mode, or one without the catalog commit, is not a headline
  const notShipped = res.mode !== 'shipped' ? `the result is of mode ${res.mode ?? 'rules (unrecorded)'}, not the shipped one: node scripts/real-set.mjs run --reasoner matrix --ort <onnxruntime-node>` : !res.catalog?.commit ? 'the result records no catalog commit' : null;
  const stale = [f.fresh ? null : f.why, notShipped].filter(Boolean).join('; ') || null;
  return { right: t.right, total: t.judged, turns: t.turns, retired_skipped: t.retired, build: res.build ?? null, tree: res.tree ?? null, mode: res.mode ?? null, catalog: res.catalog?.commit ?? null, seed: res.seed ?? null, ...(stale ? { stale } : {}) };
}

/** Rows of two result files that differ in anything but the time taken (P1 a: two runs of one tree must give identical rows). */
export function diffRows(a, b) {
  const key = (x) => JSON.stringify({ ...x, ms: undefined, tk: undefined });
  const bb = new Map(b.rows.map((x) => [x.id, x]));
  return a.rows.filter((x) => !bb.has(x.id) || key(x) !== key(bb.get(x.id))).map((x) => ({ id: x.id, a: { ...x, ms: undefined }, b: bb.get(x.id) ? { ...bb.get(x.id), ms: undefined } : null }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'build') { const r = build(); console.log(`real set: ${r.length} turns in ${new Set(r.map((x) => x.session)).size} sessions -> ${SET}`); }
  else if (cmd === 'run') await run(arg('reasoner', 'matrix'), { tag: arg('tag', ''), bergamot: arg('bergamot', null), voice: process.argv.includes('--voice'), mode: arg('mode', 'shipped'), ortPath: arg('ort', process.env.PSYS2_ORT ?? null), seed: Number(arg('seed', REAL_SEED)) });
  else if (cmd === 'diff') {
    const [a, b] = process.argv.slice(3).filter((x) => !x.startsWith('--')).map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
    const d = diffRows(a, b);
    console.log(`${d.length} of ${a.rows.length} rows differ (ms ignored)`);
    for (const x of d.slice(0, 40)) console.log(JSON.stringify(x));
    process.exit(d.length ? 1 : 0);
  }
  else if (cmd === 'sites') {   // the per-site tick profile of a result file (top by total and by growth with the session)
    const f = process.argv.slice(3).find((x) => !x.startsWith('--')) ?? RES('matrix');
    const res = JSON.parse(readFileSync(resolve(f), 'utf8'));
    console.log(formatProfile(res.ticks ? { turns: res.rows.length, ...res.ticks } : profileSites(res.rows), Number(arg('top', 15))));   // the file's own profile (all sites); rows keep their 12 busiest
  }
  else if (cmd === 'report') report();
  else if (cmd === 'ledger') ledger({ write: process.argv.includes('--write') });
  else if (cmd === 'flag') flag();
  else if (cmd === 'record') {
    const h = headline();
    console.log(JSON.stringify(h));
    if (h.stale && !process.argv.includes('--allow-stale')) { console.error(`REFUSED: the matrix result is not from the current files (${h.stale}). node scripts/real-set.mjs run --reasoner matrix`); process.exit(1); }
  }
  else { console.error('usage: real-set.mjs build | run --reasoner matrix|ops [--mode shipped|rules] [--ort <onnxruntime-node entry>] [--seed N] | diff <result a> <result b> | report | ledger [--write] | flag | record'); process.exit(2); }
}
