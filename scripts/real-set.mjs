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
 *   node scripts/real-set.mjs run --reasoner matrix|ops      replays every session on the current main (fresh session per session, turns in order), writes training/results/real-2026-11-15-<reasoner>.json
 *   node scripts/real-set.mjs report                         the outcome table of both reasoners + the REAL failures grouped by cause (training/eval/real-failures-2026-11-15.{json,md})
 *   node scripts/real-set.mjs flag                           adds `real: true|false` to every row of training/eval/failures.jsonl by source (idempotent)
 *   node scripts/real-set.mjs record                         prints the series for scripts/learning-curve.mjs (right / judged of the REAL set, matrix reasoner)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { causeOf } from './lib/failure-cause.mjs';
import { isRealRow, realDialogueIds } from './lib/real-source.mjs';

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
      const base = { set: name, session: `${name}@${day(r.time)}`, i, tab, lang: r.lang ?? 'en', text: r.text, class: r.class ?? null, logged: { status: r.got?.status ?? null, answer: (r.got?.answer ?? '').slice(0, 200), outcome: lc }, time: r.time };
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
    d.turns.forEach((t, i) => { if (t.tab) tab = t.tab; add({ set: `dialogues:${d.id}`, session: `dialogues:${d.id}`, i, tab, lang: 'en', mode: t.mode, text: t.message, class: (d.families ?? []).join(','), logged: {}, init: i === 0 ? d.init : undefined, judge: 'state', check: { world: d.world, expect: t.expect }, source: 'real-dialogue' }); });
  }
  // Romanian originals of owner / phrase-log sources not already present
  const have = new Set(rows.map((r) => norm(r.text)));
  const ro = readFileSync(join(REPO, 'training/eval/ro-en-meaning/real-ro.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  for (const [rid, tab, src, text] of ro) {
    if (!text || src === 'ledger' || have.has(norm(text))) continue;
    have.add(norm(text));
    add({ set: 'real-ro.tsv', session: `real-ro.tsv:${src}`, i: rows.length, tab: tab || 'robot', lang: 'ro', text, class: null, logged: {}, judge: 'outcome', source: src });
  }
  writeFileSync(SET, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return rows;
}

// ---------------------------------------------------------------- run
async function run(reasoner, { tag = '', bergamot = null, voice = false } = {}) {
  process.env.PSYS2_REASONER = reasoner;
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../src/dialog/index.mjs');
  const { settingsForMode, sessionOptions } = await import('../src/dialog/runtime-config.mjs');
  const { createTranslator } = await import('../src/translate/index.mjs');
  const { createSwitchTranslator } = await import('../docs/webchat/ui/translation.mjs');
  const { visibleState } = await import('./lib/visible-state.mjs');
  const { evaluateCase, classify } = await import('./lib/operational-check.mjs');
  const { createFacts } = await import('../src/knowledge/facts.mjs');
  const rules = createTranslator();
  // --bergamot <cacheDir>: the on-device model (Bergamot ro-en / en-ro in node) as the MT source, as the shipped chain has it (the browser Translator API does not exist in node); --voice: the Romanian grammar voice (src/translate/voice-ro.mjs)
  let mt = null;
  if (bergamot) { const { createNodeMt } = await import('./lib/mt-node.mjs'); mt = await createNodeMt({ cacheDir: bergamot }); await mt.ensure('ro'); }
  const roVoice = voice ? (await import('../src/translate/voice-ro.mjs')).createRoGrammarVoice() : null;
  const mtBackend = { translatorKind: () => 'mt', detectorKind: () => null, supports: () => true, sources: async () => ['model'], translate: (t, f, to) => mt?.translate(t, f, to), detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'ready' };
  const translator = createSwitchTranslator({ rules, getStrategy: () => 'auto', voices: () => (roVoice ? [roVoice] : []), backend: mt ? mtBackend : { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' } });
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  const kdir = join(REPO, 'knowledge'), fx = join(REPO, 'training/eval/owner-log-knowledge');   // the owner's catalog: repository copy plus the crocodile fixture (as scripts/eval-owner-log.mjs)
  const source = { text: async (p) => {
    if (p === 'vocab.json') { const v = JSON.parse(readFileSync(join(kdir, 'k.objects/vocab.json'), 'utf8')); for (const w of ['crocodile', 'crocodiles']) v[w] = ['k.objects/shards/owner-log']; return JSON.stringify(v); }
    if (p === 'k.objects/shards/owner-log.sop') return readFileSync(join(fx, 'crocodile.sop'), 'utf8');
    const f = join(kdir, p); return existsSync(f) ? readFileSync(f, 'utf8') : null;
  } };
  engine.setKnowledge(createFacts({ source }));
  const settings = settingsForMode('rules');
  const rows = jl('training/eval/real-2026-11-15.jsonl'.replace(/^/, ''));
  const META = new Set(['ui.shell', 'ui.help', 'talk', 'kids.common', 'conversation']);
  const bySession = new Map();
  for (const r of rows) (bySession.get(r.session) ?? bySession.set(r.session, []).get(r.session)).push(r);
  const out = [];
  const strip = (st) => JSON.stringify(visibleState(st));
  for (const [, turns] of bySession) {
    const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    for (const r of turns) {
      if (r.init) for (const [w, patch] of Object.entries(r.init)) s.setWorldState(w, patch);
      if (r.tab) s.setWorldState('ui.shell', { activeTab: r.tab });
      const before = s.state();
      const t0 = performance.now();
      let reply = null, error = null;
      const opts = { ...(r.lang === 'ro' ? { language: 'ro' } : {}), ...(r.mode ? { mode: r.mode } : {}) };
      try { reply = await s.send(r.text, Object.keys(opts).length ? opts : undefined); } catch (e) { error = e.message; }
      const ms = Math.round(performance.now() - t0);
      if (!reply) { out.push({ id: r.id, outcome: 'not_understood', verdict: r.judge === 'state' ? 'wrong' : 'open', error, ms }); continue; }
      const after = s.state();
      const english = reply.trace?.replyEnglish ?? reply.text;
      const worlds = [...new Set(reply.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean))];
      const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
      const effects = reply.effects.filter((e) => e.name !== 'chat.suggest');
      const stateChanged = strip(before) !== strip(after);
      const acted = stateChanged || effects.length > 0 || reply.statuses.some((x) => x === 'supported');
      const tabWorld = s.context?.().tabWorld ?? null;
      let outcome;
      if (unparsedAll || (!acted && !reply.statuses.some((x) => ['unsupported', 'conflicting', 'missing', 'unknown'].includes(x)))) outcome = 'not_understood';
      else if (!acted) outcome = reply.statuses.some((x) => x === 'unsupported' || x === 'conflicting') ? 'refused' : 'asked';
      else if (tabWorld && worlds.length && !worlds.includes(tabWorld) && !worlds.every((w) => META.has(w))) outcome = 'other_world';
      else outcome = 'executed';
      const rec = { id: r.id, outcome, ms, reply: english.slice(0, 220), worlds, statuses: reply.statuses };
      if (r.judge === 'state' && r.check?.regress) {
        rec.verdict = outcome === 'executed' || outcome === r.check.was ? 'right' : 'wrong';
      } else if (r.judge === 'state') {
        const c = r.check;
        const items = evaluateCase({ world: c.world, expect: c.expect }, { before, after, message: r.text, replyText: english, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
        const bad = items.filter((x) => !x.ok).map((x) => `${x.kind}:${x.spec}`);
        const ex = c.expect ?? {};
        if (ex.unchanged && stateChanged) bad.push('unchanged');
        for (const re of [].concat(ex.reply_not ?? [])) if (new RegExp(re, 'i').test(english)) bad.push(`reply_not:${re}`);
        if (ex.reply_any && ![].concat(ex.reply_any).some((re) => new RegExp(re, 'i').test(english))) bad.push(`reply_any:${ex.reply_any}`);
        for (const w of [].concat(ex.world_not ?? [])) if (worlds.includes(w)) bad.push(`world_not:${w}`);
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
  mt?.reset?.();
  mkdirSync(dirname(RES(reasoner, tag)), { recursive: true });
  writeFileSync(RES(reasoner, tag), `${JSON.stringify({ reasoner, tag, mt: !!mt, voice, date: new Date().toISOString().slice(0, 10), rows: out }, null, 1)}\n`);
  console.log(`wrote ${RES(reasoner, tag)} (${out.length} turns)`);
}

// ---------------------------------------------------------------- report
const OUTCOMES = ['executed', 'refused', 'asked', 'not_understood', 'other_world'];
export function tableOf(setRows, res) {
  const by = new Map(res.rows.map((x) => [x.id, x]));
  const t = { turns: 0, judged: 0, right: 0, partly: 0, wrong: 0, open: 0, changed: 0, unjudged: 0, outcome: Object.fromEntries(OUTCOMES.map((o) => [o, 0])), by_source: {} };
  for (const r of setRows) {
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
const isFailure = (r, x) => x.verdict === 'wrong' || x.verdict === 'partly' || x.verdict === 'open' || (x.verdict === null && ['not_understood', 'refused', 'other_world'].includes(x.outcome));

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
  const doc = { date: '2026-11-15', set: setRows.length, tables, failing_matrix: fm.length, failing_ops: fo.length, ops_only: opsOnly.length, causes: top, ledger_real_extra: extra.length };
  writeFileSync(join(REPO, 'training/eval/real-failures-2026-11-15.json'), `${JSON.stringify(doc, null, 1)}\n`);
  const md = [`# REAL failures by cause (2026-11-15)`, '', `Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: ${setRows.length} turns (training/eval/real-2026-11-15.jsonl). Replayed on the current main, matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by \`node scripts/real-set.mjs report\`.`, '',
    `Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node), so part of the Romanian causes (1, 2) is the missing translation backend, not the reader.`, '', `Failing turns: matrix ${fm.length}, ops ${fo.length} (${opsOnly.length} fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): ${extra.length}.`, '', '| # | cause | turns | both | examples |', '| --- | --- | ---: | ---: | --- |',
    ...top.slice(0, 15).map((c, i) => `| ${i + 1} | ${c.cause.replace(/\|/g, '/').slice(0, 150)} | ${c.count} | ${c.both_reasoners} | ${c.examples.slice(0, 3).map((e) => `"${String(e.text).replace(/\|/g, '/').slice(0, 60)}" (${e.tab})`).join('; ')} |`), ''].join('\n');
  writeFileSync(join(REPO, 'training/eval/real-failures-2026-11-15.md'), md);
  for (const [k, t] of Object.entries(tables)) console.log(`${k}: turns ${t.turns}, judged ${t.judged} (right ${t.right}, partly ${t.partly}, wrong ${t.wrong}), open ${t.open}, changed ${t.changed}, unjudged ${t.unjudged}; outcome ${JSON.stringify(t.outcome)}`);
  console.log(md);
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
  const t = tableOf(jl('training/eval/real-2026-11-15.jsonl'), JSON.parse(readFileSync(RES('matrix'), 'utf8')));
  return { right: t.right, total: t.judged, turns: t.turns };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'build') { const r = build(); console.log(`real set: ${r.length} turns in ${new Set(r.map((x) => x.session)).size} sessions -> ${SET}`); }
  else if (cmd === 'run') await run(arg('reasoner', 'matrix'), { tag: arg('tag', ''), bergamot: arg('bergamot', null), voice: process.argv.includes('--voice') });
  else if (cmd === 'report') report();
  else if (cmd === 'flag') flag();
  else if (cmd === 'record') console.log(JSON.stringify(headline()));
  else { console.error('usage: real-set.mjs build | run --reasoner matrix|ops | report | flag | record'); process.exit(2); }
}
