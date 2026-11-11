#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SOPWORLD-1 item 8: both reasoner strategies measured on the same sets (spec 15).
 *
 *   node scripts/eval-reasoner.mjs --reasoner ops|matrix [--limit N] [--no-write] [--only parity,audit,coherence]
 *
 * One run = one strategy (rules formalizer, the webchat's runtime settings otherwise). It writes training/results/sopworld1-<strategy>-<date>.json and
 * rewrites the section SOPWORLD-1 of training/RESULTS.md as one table with a column per strategy found in the latest JSON of each.
 *   (a) parity       operational, operational-ro, dialogues: right / partly / wrong / not understood, for the three pilot worlds and for everything else
 *   (b) audit        after EVERY turn of every case that has facts of the three worlds in the session: the whole state is told to a fresh library World
 *                    (the library's validation: denies, conflicts, bounds, dangling references) and the balance is asked; a turn that leaves a violation counts
 *   (c) coherence    training/eval/coherence-2026-11-10.jsonl: every machine hint is checked; hints that cannot be checked mechanically are listed with the transcript
 *   (d) assumptions  answers that relied on a default or a guess, and how many of those said so
 *   (e) cost         ms per turn (p50, p95), bytes shipped (raw, gzip), lines of world code
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
const STRATEGY = applyReasonerFlag();
const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
const { createEngine } = await import('../src/dialog/index.mjs');
const { createTranslator } = await import('../src/translate/index.mjs');
const { sessionOptions, settingsForMode } = await import('../src/dialog/runtime-config.mjs');
const { runCase } = await import('./eval-operational.mjs');
const { runDialogue } = await import('./eval-dialogues.mjs');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const THREE = ['kids.shop', 'kids.arith', 'kids.tasks'];
const isThree = (w) => THREE.includes(w);
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10 : 0; };
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const OUT = ['right', 'partly', 'wrong', 'not_understood'];

const settings = settingsForMode('rules');
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
if (engine.reasonerMode !== STRATEGY) throw new Error(`engine runs ${engine.reasonerMode}, wanted ${STRATEGY}`);
// the checker always has the library: it validates the session wires of either strategy
const checker = STRATEGY === 'matrix' ? engine : await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });

// ---- (b) consistency audit ----------------------------------------------------------------------------------------------------
const FACT = /^(kids\.(shop|arith|tasks)\.|core\.agent$)/;   // the agents of the dialogue are part of the state (owners refer to them)
const THREE_FACT = /^kids\.(shop|arith|tasks)\./;
const audit = { turns: 0, with_violation: 0, kinds: {}, examples: [], dropped_by_library: 0, ms: 0 };
const isRetracted = (w) => w.entries.some((e) => e.key === 'core.status' && e.value.v === 'retracted');
const seqOf = (w) => Number(w.entries.find((e) => e.key === 'core.seq')?.value?.v ?? 1e9);
/**
 * The violations of the whole state of a session, by the library's `check()` (every violation and every standing issue of a World). matrix: the session's own World is
 * checked as it is, nothing is told again. ops: its wires come from elsewhere, so they are told in dialogue order to a fresh World first (what it refuses is a problem).
 */
export function auditSession(s) {
  const rs = s.isession.rs;
  const wires = s.isession.memory.sessionWires().filter((w) => !isRetracted(w) && FACT.test(w.type));
  if (!wires.some((w) => THREE_FACT.test(w.type))) return null;
  const t0 = performance.now();
  const problems = [];
  let worlds;
  if (STRATEGY === 'matrix' && rs) {
    worlds = [...rs.insts.values()].map((i) => i.world);
    audit.dropped_by_library = Math.max(audit.dropped_by_library, rs.refused.length);   // what the library refused when told is not in its World: counted apart
  } else {
    const f = checker.reasoner.session();
    for (const w of wires.sort((x, y) => seqOf(x) - seqOf(y))) f.tell([w]);
    for (const r of f.refused) problems.push({ kind: r.violations?.[0]?.kind ?? 'refused', why: r.violations?.[0]?.why ?? r.violations?.[0]?.key ?? '', wire: r.id, type: r.type });
    worlds = [...f.insts.values()].map((i) => i.world);
  }
  const c = { violations: [], issues: [] };
  for (const w of worlds) { const r = w.check(); c.violations.push(...r.violations); c.issues.push(...r.issues); }
  for (const v of c.violations) problems.push({ kind: v.kind, why: v.why ?? '', wire: v.id });
  for (const i of c.issues) problems.push({ kind: /debt/.test(i.rule ?? '') ? 'balance' : 'domain', why: i.why ?? '', wire: i.about?.[0] });
  audit.ms += performance.now() - t0;
  return problems;
}
function onTurn(label) {
  return async (s) => {
    const problems = auditSession(s);
    if (problems === null) return;
    audit.turns++;
    if (problems.length) {
      audit.with_violation++;
      for (const p of problems) audit.kinds[p.kind] = (audit.kinds[p.kind] ?? 0) + 1;
      if (audit.examples.length < 15) audit.examples.push({ at: label, problems: problems.slice(0, 2) });
    }
  };
}

// ---- (d) assumptions ------------------------------------------------------------------------------------------------------------
const assumptions = { answers: 0, relied: 0, said: 0, examples: [] };
const SAYS = /\b(assum\w*|guess\w*|default|i took|i read|i supposed|because|you said)\b/i;
function noteAnswers(reply, s) {
  for (const a of reply.answers ?? []) {
    assumptions.answers++;
    let relied = (a.envelope?.assumptions?.length ?? 0) > 0;
    if (!relied && STRATEGY === 'matrix' && a.envelope?.via === 'core.matrix' && a.envelope.from?.length) {
      try { relied = a.envelope.from.some((id) => JSON.stringify(s.isession.rs.explain(id) ?? {}).includes('"via":"default"')); } catch { /* none */ }
    }
    if (!relied) continue;
    assumptions.relied++;
    if (SAYS.test(a.text)) assumptions.said++;
    if (assumptions.examples.length < 8) assumptions.examples.push({ text: a.text.slice(0, 120), said: SAYS.test(a.text) });
  }
}

// ---- (a) parity -------------------------------------------------------------------------------------------------------------------
function tally(rows, key) {
  const t = { n: rows.length, right: 0, partly: 0, wrong: 0, not_understood: 0 };
  for (const r of rows) t[r[key]]++;
  return t;
}
async function parity(limit) {
  const out = {};
  const msThree = [], msAll = [];
  const cases = {};
  for (const [name, file, ro] of [['operational', 'operational.jsonl', false], ['operational-ro', 'operational-ro.jsonl', true]]) {
    let set = jsonl(join(REPO, 'training/eval', file));
    if (limit) set = set.slice(0, limit);
    const rows = [];
    for (const c of set) {
      const r = await runCase(engine, settings, c, { onTurn: onTurn(`${name}:${c.id}`) });
      rows.push({ id: c.id, world: c.world, outcome: r.outcome, ms: r.ms, reply: r.reply });
      (isThree(c.world) ? msThree : msAll).push(r.ms); msAll.push(r.ms);
    }
    out[name] = { three: tally(rows.filter((r) => isThree(r.world)), 'outcome'), others: tally(rows.filter((r) => !isThree(r.world)), 'outcome') };
    cases[name] = Object.fromEntries(rows.map((r) => [r.id, r.outcome]));
    out[name].replies = Object.fromEntries(rows.filter((r) => isThree(r.world)).map((r) => [r.id, r.reply]));
  }
  let ds = jsonl(join(REPO, 'training/eval/dialogues.jsonl'));
  if (limit) ds = ds.slice(0, limit);
  const turns = [];
  const dcases = {};
  for (const d of ds) {
    const r = await runDialogue(engine, settings, d, { onTurn: onTurn(`dialogue:${d.id}`) });
    r.turns.forEach((t, i) => { turns.push({ world: d.world, outcome: t.outcome, ms: t.ms }); dcases[`${d.id}#${i}`] = t.outcome; if (isThree(d.world)) msThree.push(t.ms); msAll.push(t.ms); });
  }
  out.dialogues = { three: tally(turns.filter((r) => isThree(r.world)), 'outcome'), others: tally(turns.filter((r) => !isThree(r.world)), 'outcome') };
  cases.dialogues = dcases;
  return { out, cases, ms: { three: { p50: quant(msThree, 0.5), p95: quant(msThree, 0.95), n: msThree.length }, all: { p50: quant(msAll, 0.5), p95: quant(msAll, 0.95), n: msAll.length } } };
}

// ---- (c) coherence set --------------------------------------------------------------------------------------------------------------
const sig = (s, types) => JSON.stringify(types.flatMap((t) => s.isession.memory.find(t)).map((w) => [w.id, w.entries.filter((e) => !e.key.startsWith('core.')).map((e) => `${e.key}=${e.value.v}`)]));
const SIG = { money: ['kids.shop.money', 'kids.shop.income', 'kids.shop.expense', 'kids.shop.purchase'], list: ['kids.tasks.entry'], lists: ['kids.tasks.entry'] };
const has = (text, x) => (/^-?\d+(\.\d+)?$/.test(String(x)) ? new RegExp(`(^|[^\\d.])${String(x).replace('-', '\\-')}($|[^\\d])`).test(text) : text.toLowerCase().includes(String(x).toLowerCase()));
const PROBLEM = /\b(cannot|can't|not enough|only had|impossible|does not add up|conflict|too many|more than)\b/i;

/** Runs one coherence case; returns { turns: [{ message, reply, statuses }], hints: [{ hint, ok | manual }] }. */
async function runCoherence(c) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  const turns = [];
  let beforeLast = null;
  const moneyBalance = () => { try { const f = checker.reasoner.session(); f.tell(s.isession.memory.sessionWires().filter((w) => !isRetracted(w) && FACT.test(w.type)).sort((a, b) => seqOf(a) - seqOf(b))); return f.of('kids.shop').query({ type: 'kids.shop.balance', seek: 'amount' }); } catch { return null; } };
  let negativeMoney = false;
  for (const [i, m] of c.turns.entries()) {
    if (i === c.turns.length - 1) beforeLast = { money: sig(s, SIG.money), list: sig(s, SIG.list) };
    const r = await s.send(m, {});
    noteAnswers(r, s);
    turns.push({ message: m, reply: r.text, statuses: r.statuses, assumptions: r.assumptions ?? [] });
    await onTurnCoh(s);
    const b = moneyBalance();
    if (b && (b.status === 'refused' || b.status === 'conflicting' || (b.status === 'supported' && Number(b.value) < 0))) negativeMoney = true;
  }
  const last = turns.at(-1), k = c.check;
  const hints = [];
  const add = (hint, ok, manual = false) => hints.push({ hint, ...(manual ? { manual: true } : { ok }) });
  for (const [h, v] of Object.entries(k)) {
    switch (h) {
      case 'final_answer_contains': add(h, has(last.reply, v)); break;
      case 'final_answer_not_contains': add(h, !has(last.reply, v)); break;
      case 'final_answer_yes': add(h, /\byes\b/i.test(last.reply)); break;
      case 'final_answer_no': add(h, /\bno\b/i.test(last.reply) && !/\byes\b/i.test(last.reply)); break;
      case 'never_state': add(h, !negativeMoney); break;
      case 'asks_question': add(h, /\?/.test(last.reply) || last.statuses.includes('missing')); break;
      case 'state_unchanged': add(h, sig(s, SIG[v]) === beforeLast[v === 'money' ? 'money' : 'list']); break;
      case 'answer_mentions': add(h, v.every((x) => turns.some((t, i) => i === turns.length - 1 && has(t.reply, x)))); break;
      case 'answer_mentions_any': add(h, v.some((x) => has(last.reply, x))); break;
      case 'answers_contain': add(h, v.every((x, i) => x === null || has(turns[i].reply, x))); break;
      case 'single_value': add(h, !turns.some((t) => t.statuses.includes('conflicting'))); break;
      case 'status': add(h, last.statuses.includes(v)); break;
      case 'status_in': add(h, last.statuses.some((x) => v.includes(x))); break;
      case 'never_answer': add(h, !turns.some((t) => t.reply.includes(v))); break;
      case 'never_answer_name_only': add(h, last.statuses.includes('ambiguous') || /\b(tied|same|equal|both|neither|ambiguous)\b/i.test(last.reply)); break;
      case 'followup': {
        const f = await s.send(v[0], {});
        turns.push({ message: v[0], reply: f.text, statuses: f.statuses });
        add(h, /added|put|on your/i.test(f.text) && has(f.text, v[0])); break;
      }
      case 'followup_state': add(h, s.isession.memory.find('kids.tasks.entry').some((w) => w.entries.some((e) => e.key.endsWith('.text') && has(String(e.value.v), 'milk')) && w.entries.some((e) => e.key.endsWith('.list') && /shopping/.test(e.value.v)))); break;
      // certainty (SOPWORLD-1b item 4): true = the last answer rests on an assumed value (reply.assumptions, from the tiers) and says "I assumed ..." exactly once;
      // 'once' = across the dialogue the sentence is said in exactly one reply, which carries the assumption; 'none' = no turn rests on an assumption and none says it
      case 'assumption_visible': case 'assumption-visible': {
        const says = (t) => (t.reply.match(/\b(I assumed|Am presupus)\b/g) ?? []).length;
        if (v === 'none') add(h, turns.every((t) => !t.assumptions.length && !says(t)));
        else if (v === 'once') add(h, turns.filter((t) => says(t) === 1 && t.assumptions.length).length === 1 && turns.every((t) => says(t) <= 1));
        else add(h, last.assumptions.length > 0 && says(last) === 1);
        break;
      }
      case 'flags_problem': add(h, last.statuses.includes('conflicting') || PROBLEM.test(last.reply) || turns.some((t) => t.statuses.includes('conflicting')), true); break;
      case 'not_supported_number': case 'not_plain_certain': add(h, null, true); break;
      default: add(h, null, true);
    }
  }
  return { id: c.id, kind: c.kind, world: c.world, expect: c.expect, turns, hints };
}
const onTurnCoh = onTurn('coherence');
async function coherence(limit) {
  let set = jsonl(join(REPO, 'training/eval/coherence-2026-11-10.jsonl'));
  if (limit) set = set.slice(0, limit);
  const rows = [];
  for (const c of set) rows.push(await runCoherence(c));
  const byKind = {};
  for (const r of rows) {
    const mech = r.hints.filter((h) => !h.manual);
    r.passed = mech.every((h) => h.ok);
    r.needs_review = r.hints.some((h) => h.manual);
    const k = (byKind[r.kind] ??= { passed: 0, total: 0, review: 0 });
    k.total++; if (r.passed) k.passed++; if (r.needs_review) k.review++;
  }
  const total = { passed: rows.filter((r) => r.passed).length, total: rows.length, review: rows.filter((r) => r.needs_review).length };
  // the reviewer's transcripts: every case with a hint no machine can check, and every failed case
  const transcripts = rows.filter((r) => r.needs_review || !r.passed).map((r) => ({ id: r.id, kind: r.kind, expect: r.expect, passed: r.passed, hints: r.hints, turns: r.turns.map((t) => `> ${t.message}\n  ${t.reply}`) }));
  return { total, byKind, rows: rows.map(({ id, kind, world, passed, needs_review, hints }) => ({ id, kind, world, passed, needs_review, hints })), transcripts };
}

// ---- (e) cost -----------------------------------------------------------------------------------------------------------------------
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !/^\s*(#|\/\/)/.test(l)).length : 0);
function cost() {
  const sz = (f) => { const b = readFileSync(join(REPO, f)); return { raw: b.length, gzip: gzipSync(b, { level: 9 }).length }; };
  const world = (id, files) => files.reduce((a, f) => a + lines(join(REPO, 'worlds', id, f)), 0);
  const web = 'docs/webchat';
  const lib = existsSync(join(REPO, web, 'lib/vendor/sopworld/sopworld.mjs')) ? sz(`${web}/lib/vendor/sopworld/sopworld.mjs`) : null;
  const host = existsSync(join(REPO, web, 'lib/reasoner/index.mjs')) ? sz(`${web}/lib/reasoner/index.mjs`) : null;
  return {
    bytes: { library: lib, host_layer: host, worlds_index: sz(`${web}/worlds/index.json`) },
    lines: Object.fromEntries(THREE.map((id) => [id, { ops: world(id, ['ops.mjs']), matrix: world(id, ['matrix.sop', 'fns.mjs', 'matrix.patterns.sop', 'matrix.templates.sop', 'matrix.operations.sop']) }])),
    host_layer_lines: lines(join(REPO, 'src/reasoner/index.mjs')),
  };
}

// ---- main -----------------------------------------------------------------------------------------------------------------------------
const only = (arg('only', 'parity,audit,coherence')).split(',');
const limit = Number(arg('limit', 0)) || 0;
const result = { strategy: STRATEGY, date: new Date().toISOString().slice(0, 10), limit: limit || null };
const t0 = performance.now();
if (only.includes('coherence')) result.coherence = await coherence(limit ? Math.min(limit, 30) : 0);
if (only.includes('parity') || only.includes('audit')) { const p = await parity(limit); result.parity = p.out; result.ms_per_turn = p.ms; result.cases = p.cases; }
result.audit = { ...audit, ms: Math.round(audit.ms), violation_rate_pct: pct(audit.with_violation, audit.turns) };
result.assumptions = assumptions;
result.cost = cost();
result.elapsed_s = Math.round((performance.now() - t0) / 1000);
if (STRATEGY === 'matrix') result.refused_by_library = 'see session.rs.refused (statements the library dropped, listed in the log)';

const resDir = join(REPO, 'training/results');
if (!flag('no-write')) {
  const name = `sopworld1-${STRATEGY}-${result.date}.json`;
  writeFileSync(join(resDir, name), `${JSON.stringify(result, null, 1)}\n`);
  writeSection();
  console.log(`wrote training/results/${name} and the SOPWORLD-1 section of training/RESULTS.md`);
}
if (process.env.AUDIT_DEBUG) console.log(JSON.stringify(audit.examples, null, 1));
console.log(JSON.stringify({ strategy: STRATEGY, parity: result.parity, audit: { turns: audit.turns, with_violation: audit.with_violation, kinds: audit.kinds }, coherence: result.coherence?.total, byKind: result.coherence?.byKind, assumptions: { answers: assumptions.answers, relied: assumptions.relied, said: assumptions.said }, ms: result.ms_per_turn }, null, 1));
for (const t of result.coherence?.transcripts ?? []) console.log(`\n--- ${t.id} (${t.kind}) ${t.passed ? 'needs review' : 'FAILED'}: ${t.expect}\n${t.hints.map((h) => `   ${h.manual ? 'manual' : h.ok ? 'ok    ' : 'FAIL  '} ${h.hint}`).join('\n')}\n${t.turns.join('\n')}`);

function latest(strategy) {
  const f = existsSync(resDir) ? readdirSync(resDir).filter((x) => x.startsWith(`sopworld1-${strategy}-`) && x.endsWith('.json')).sort().at(-1) : null;
  return f ? JSON.parse(readFileSync(join(resDir, f), 'utf8')) : null;
}
function writeSection() {
  const R = { ops: latest('ops'), matrix: latest('matrix') };
  const c = (fn) => ['ops', 'matrix'].map((k) => (R[k] ? fn(R[k]) : 'not run')).join(' | ');
  const row = (label, fn) => `| ${label} | ${c(fn)} |`;
  const par = (set, who) => (r) => { const t = r.parity?.[set]?.[who]; return t ? `${t.right}/${t.n} right, ${t.partly} partly, ${t.wrong} wrong, ${t.not_understood} not understood` : 'n/a'; };
  const kinds = [...new Set([...(R.ops?.coherence?.rows ?? []), ...(R.matrix?.coherence?.rows ?? [])].map((x) => x.kind))];
  const identical = R.ops?.cases && R.matrix?.cases ? Object.entries(R.ops.cases).flatMap(([set, m]) => Object.entries(m).filter(([id, o]) => R.matrix.cases[set]?.[id] !== o).map(([id, o]) => `${set}:${id} ${o} -> ${R.matrix.cases[set][id]}`)) : null;
  const dif = identical ? identical.length : 'n/a';
  const lines3 = (r) => THREE.map((id) => `${id.split('.')[1]} ${r.cost.lines[id].ops}/${r.cost.lines[id].matrix}`).join(', ');
  const body = [
    '## SOPWORLD-1: the two reasoner strategies on the same sets',
    '',
    `Written by \`node scripts/eval-reasoner.mjs --reasoner ops|matrix\` (rules formalizer, no model). Latest run per strategy: ${['ops', 'matrix'].map((k) => `${k} ${R[k]?.date ?? 'not run'}`).join(', ')}. JSON: \`training/results/sopworld1-<strategy>-<date>.json\`.`,
    '',
    '| | ops (default) | matrix |',
    '| --- | --- | --- |',
    row('(a) operational, three worlds', par('operational', 'three')),
    row('(a) operational, all other worlds', par('operational', 'others')),
    row('(a) operational-ro, three worlds', par('operational-ro', 'three')),
    row('(a) operational-ro, all other worlds', par('operational-ro', 'others')),
    row('(a) dialogues (turns), three worlds', par('dialogues', 'three')),
    row('(a) dialogues (turns), all other worlds', par('dialogues', 'others')),
    `| (a) cases whose outcome differs between the strategies | ${dif} | |`,
    row('(b) turns audited (session holds facts of the three worlds)', (r) => String(r.audit.turns)),
    row('(b) turns that leave a violation (library check of the whole state)', (r) => `${r.audit.with_violation} (${r.audit.violation_rate_pct}%) ${JSON.stringify(r.audit.kinds)}`),
    row('(c) coherence set passed / total (mechanical hints)', (r) => `${r.coherence?.total.passed}/${r.coherence?.total.total} (+${r.coherence?.total.review} with a hint for the reviewer)`),
    ...kinds.map((k) => row(`(c) kind ${k}`, (r) => { const x = r.coherence?.byKind[k]; return x ? `${x.passed}/${x.total}` : 'n/a'; })),
    row('(d) answers that relied on a default or a guess / said so', (r) => `${r.assumptions.relied} / ${r.assumptions.said} (of ${r.assumptions.answers} answers)`),
    row('(e) ms per turn, three worlds p50 / p95', (r) => `${r.ms_per_turn.three.p50} / ${r.ms_per_turn.three.p95}`),
    row('(e) ms per turn, everything p50 / p95', (r) => `${r.ms_per_turn.all.p50} / ${r.ms_per_turn.all.p95}`),
    row('(e) lines of world code (three worlds: ops.mjs / matrix + fns + extras)', lines3),
    row('(e) bytes added to the webchat: library raw / gzip, host layer raw', (r) => (r.cost.bytes.library ? `${r.cost.bytes.library.raw} / ${r.cost.bytes.library.gzip}, ${r.cost.bytes.host_layer?.raw ?? 0}` : 'n/a')),
    '',
    'The audit tells the fact wires of the session (and its agents), in dialogue order, to a fresh library World and counts the wires it refuses (a deny, a conflict, a broken bound, a reference to an agent that is not there) and a refused balance. `ops`: every wire the operations replay. `matrix`: the wires the library holds; the ones it refused when told are not in its World and are counted apart (`audit.dropped_by_library` in the JSON, the largest number in one session). A purchase the library accepted that leaves the money negative is a violation of both columns: the matrix only says so when asked.',
    '',
  ].join('\n');
  const f = join(REPO, 'training/RESULTS.md');
  const text = readFileSync(f, 'utf8');
  const B = '<!-- sopworld1:begin -->', E = '<!-- sopworld1:end -->';
  const block = `${B}\n${body}\n${E}`;
  const a = text.indexOf(B), b = text.indexOf(E);
  writeFileSync(f, a >= 0 && b > a ? text.slice(0, a) + block + text.slice(b + E.length) : `${text.trimEnd()}\n\n${block}\n`);
}
