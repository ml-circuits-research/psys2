#!/usr/bin/env node
/**
 * Per-phase end-to-end analysis (does the whole pipeline close, and if not, which phase broke first and why).
 *
 * Every item runs through the real dialog engine in the webchat configuration (dispatcher v2 via onnxruntime-node, rule validation,
 * spellcheck, partial understanding, acceptRefused; same setup as scripts/eval-operational.mjs) and, independently, through an
 * ORACLE: the rule formalizer on the gold text, gold world only, in a session seeded like the item (no dispatcher, no validator).
 * Comparing the two with the gold gives the phase of the first deviation:
 *
 *   P1 translation        not applicable to English training data (counted only when an item is Romanian: tag G8)
 *   P2 expansion          oracle fails on an item of an expansion family (self-correction, shared argument, ellipsis, repetition) or a marker text
 *   P3 segmentation       no segmentation of the dispatcher's beam (4) matches the gold pieces (char IoU >= 0.6)
 *   P4 world proposal     in the matching segmentation a piece has no gold world in its top-3
 *   P5 rule formalizer    oracle (gold text, gold world) does not give the gold SOP: DATA (label noise) or SYSTEM (missing pattern / reads differently)
 *   P6 validation         oracle is right, segmentation and world are available, but the validator picked another reading
 *   P7 execution          SOP right, but the interpreter hit execution_error / unknown_argument (refusals for state reasons are only counted)
 *   P8 reply              SOP right, but the reply holds an unrendered template, a technical fallback or nothing
 *   discourse             the discourse layer (ellipsis, meta dialogue) answered instead of the dispatcher; counted in the funnel as its own bucket
 * An item is "right" when the concatenated id-normalized SOP of all understood pieces equals the concatenation of the gold segment SOPs
 * (negative items: nothing understood). The funnel counts the FIRST deviating phase of each wrong item, in the order above; independent
 * per-phase deviation counts (not only first) are reported too. Data problems are detected from the oracle alone (see classifyOracle).
 * Failures are tagged with the worker task that would fix them (G1 complete-before-partial, G2 self-corrections, G3 captures and spelling,
 * G6 long messages, G8 Romanian).
 *
 *   node scripts/eval-phases.mjs --ort <onnxruntime-node entry> [--data-root <training dir>] [--n 1500] [--workers 20] [--seed 7]
 *        [--name train] [--operational] [--limit N]
 * Modes: default = stratified sample of the training data (training/dataset/<world>/train.jsonl, multicmd train, paraphrase variants of
 * training/paraphrases/out incl. needs_review / fail); --operational = every case of the operational set (training/eval/operational.jsonl), failures traced
 * (no gold SOP there: phases are judged against the case's world and expectations).
 * Writes training/results/phase-analysis-<name>.json (the Markdown report: node scripts/lib/phase-report.mjs).
 * The training data is not tracked in git: --data-root defaults to <repo>/training and falls back to the main checkout.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatcherFormalizer } from '../src/dialog/encoder-dispatch.mjs';
import { createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';
import { formalize } from '../src/formalizer/rules/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop, firmNumbersIn } from './collect-paraphrases.mjs';
import { segmentationMatches } from './lib/dispatch-gold.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';

const POP = {};
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const WEBCHAT = { formalizer: 'encoder', spellcheck: true, partialUnderstanding: true, encoderAcceptRefused: true };
const EXPANSION_FAMILIES = new Set(['self_correct', 'shared_arg', 'ellipsis', 'repeat_undo']);
const MARKER = /(^|[\s,])(no wait|i mean|i meant|scratch that|make that|or rather|actually|oops|sorry)([\s,]|$)|, no[, ]/i;
const RO = /[ăâîșțşţ]/i;
const EXEC_BAD = new Set(['execution_error', 'unknown_argument']);

// ================================================================ worker side =============================================
function restrictedSet(set, ids) {
  const all = [...new Set(ids.flatMap((w) => (set.get(w) ? set.available(w) : [])))];
  const sub = Object.create(set);
  sub._cache = new Map();
  sub.list = () => all.map((i) => set.get(i));
  return sub;
}

async function makeEnv(ortPath, modelDir) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const mod = await import(pathToFileURL(resolve(ortPath)).href);
  const ort = mod.InferenceSession ? mod : mod.default;
  const meta = JSON.parse(readFileSync(join(modelDir, 'meta.json'), 'utf8'));
  const enc = createDispatcherFormalizer({
    waitForModel: true,
    getPolicy: () => ({ acceptRefused: WEBCHAT.encoderAcceptRefused, trySpell: WEBCHAT.spellcheck, acceptPartial: WEBCHAT.partialUnderstanding }),
    load: async () => {
      const session = await ort.InferenceSession.create(join(modelDir, 'model.int8.onnx'), { graphOptimizationLevel: 'all', intraOpNumThreads: 1, interOpNumThreads: 1 });
      let editTags = null;
      if (meta.onnx?.outputs?.includes('edit_logits')) editTags = JSON.parse(readFileSync(join(modelDir, 'edit-vocab.json'), 'utf8')).tags;
      return { ort, session, tokenizer: createWordPieceTokenizer(readFileSync(join(modelDir, 'vocab.txt'), 'utf8')), worlds: meta.worlds, editTags, editTau: meta.edit_threshold ?? 0.5, useContext: meta.context !== false };
    },
  });
  enc.attach(engine);
  engine.formalizers.encoder = enc;
  await enc.prepare();
  return { engine, legends: engine.set.legends };
}

async function seeded(engine, item, opts) {
  const s = engine.createSession(opts);
  if (item.context.tab) s.setWorldState('ui.shell', { activeTab: item.context.tab });
  for (const [w, patch] of Object.entries(item.init ?? {})) s.setWorldState(w, patch);
  if (item.context.recent_worlds?.length) s._recentWorlds = [...item.context.recent_worlds];
  for (const m of item.context.session ?? []) await s.send(m);
  return s;
}

const sopLines = (wires, legends) => normalizedSop(wires, legends);
const asKey = (x) => JSON.stringify(x);
const STRUCT_KEY = /(^|\.)(action|type|seek|via|source|seq|in|mode)$/;
/** Value literals of normalized SOP lines (numbers, quoted strings, bare words, entity names), lower-cased; structural keys skipped. */
const lit = (lines) => {
  const out = new Set();
  for (const l of lines) for (const m of String(l).matchAll(/([\w.]+)=(-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|[\w.$#-]+)/g)) {
    if (STRUCT_KEY.test(m[1])) continue;
    out.add(m[2].replace(/^\$e\./, '').toLowerCase());
  }
  return out;
};
const low = (lines) => lines.map((l) => String(l).toLowerCase());
const sameSop = (a, b) => asKey(low(a)) === asKey(low(b));

/** Oracle: rules only, gold world, original gold text, session seeded like the item and earlier gold pieces committed. */
async function oracle(env, item) {
  const { engine, legends } = env;
  const s = await seeded(engine, item, { language: 'en', formalizer: 'rules' });
  const pieces = [];
  let wires = [];
  for (const [i, g] of item.gold.entries()) {
    const worlds = restrictedSet(engine.set, [g.world]);
    let res;
    try { res = formalize(g.text, { worlds, session: s.isession, source: `g${i}`, context: s.context(), router: engine.router }); }
    catch (e) { pieces.push({ error: e.message, unparsed: 1, parsed: 0 }); continue; }
    const parsed = res.segments.filter((x) => !x.unparsed);
    for (const seg of parsed) s.isession.add(seg.wires);
    wires = wires.concat(parsed.flatMap((x) => x.wires));
    pieces.push({ unparsed: res.segments.length - parsed.length, parsed: parsed.length, expanded: parsed.some((x) => x.expanded), patterns: parsed.map((x) => x.match?.patternId).filter(Boolean) });
  }
  const sop = sopLines(wires, legends);
  // the same gold text over all worlds (the rule router): shows a gold target that was written by another world's rules
  let allSop = null;
  try {
    const s2 = await seeded(engine, item, { language: 'en', formalizer: 'rules' });
    const ws = [];
    for (const [i, g] of item.gold.entries()) {
      const res = formalize(g.text, { worlds: engine.set, session: s2.isession, source: `a${i}`, context: s2.context(), router: engine.router });
      for (const seg of res.segments.filter((x) => !x.unparsed)) { s2.isession.add(seg.wires); ws.push(...seg.wires); }
    }
    allSop = sopLines(ws, legends);
  } catch { allSop = null; }
  return { sop, allSop, pieces, complete: pieces.length > 0 && pieces.every((p) => p.unparsed === 0 && p.parsed > 0), none: pieces.every((p) => p.parsed === 0) };
}

/** Why the oracle disagrees with a gold SOP (DATA vs SYSTEM). */
function classifyOracle(item, orc, goldSop) {
  const text = item.gold.map((g) => g.text).join(' ');
  const gl = lit(goldSop), ol = lit(orc.sop);
  const textLow = text.toLowerCase();
  const numsText = firmNumbersIn(text);
  const stem = (v) => v.replace(/(es|s)$/, '');
  const inText = (v) => (/^-?\d/.test(v) ? numsText.has(Number(v)) || textLow.includes(v) : textLow.includes(v.replace(/^"|"$/g, '').replace(/_/g, ' ')) || textLow.includes(stem(v.replace(/^"|"$/g, ''))));
  const missingInText = [...gl].filter((v) => !ol.has(v) && !inText(v));
  if (item._foreign?.length) return { kind: 'data', reason: 'gold_target_from_another_world', detail: [...new Set(item._foreign)].slice(0, 3) };
  if (orc.allSop && !sameSop(orc.sop, goldSop) && sameSop(orc.allSop, goldSop)) return { kind: 'data', reason: 'gold_target_from_another_world' };
  if (item.xworld > 1) return { kind: 'data', reason: 'same_text_labelled_in_several_worlds', detail: [`${item.xworld} worlds`] };
  if (orc.complete && missingInText.length) return { kind: 'data', reason: 'gold_value_not_in_text', detail: missingInText.slice(0, 3) };
  if (orc.none || !orc.complete) {
    const partial = !orc.none;
    return { kind: 'system', reason: partial ? 'rule_partial_parse' : 'rule_unparsed' };
  }
  if (item.label_status === 'rules-differ' || item.label_status === 'generator-disagrees') return { kind: 'data', reason: 'label_says_rules_differ', detail: [...[...ol].filter((v) => !gl.has(v))].slice(0, 3) };
  if (goldSop.length !== orc.sop.length) return { kind: 'system', reason: 'rule_reads_differently:wire_count' };
  return { kind: 'system', reason: 'rule_reads_differently:structure_or_values' };
}

const tagsFor = (item, ctx) => {
  const t = [];
  const len = item.text.length;
  if (len > 160) t.push('G6');
  if (RO.test(item.text)) t.push('G8');
  const v = ctx.chosenVariants ?? [];
  if (ctx.phase === 'P6' && (v.includes('partial') || v.includes('simplified') || v.includes('normalized')) && ctx.oracleOk) t.push('G1');
  if (v.includes('spell') && ctx.phase === 'P6') t.push('G3');
  if (ctx.reason?.startsWith('rule_reads_differently') && ctx.greedy) t.push('G3');
  if ((item.family === 'self_correct' || MARKER.test(item.text)) && ['P2', 'P5', 'P6', 'discourse'].includes(ctx.phase)) t.push('G2');
  if (ctx.phase === 'P6' && ctx.reason === 'complete_reading_not_chosen') t.push('G1');
  return [...new Set(t)];
};

const short = (lines, n = 6) => lines.slice(0, n).map((l) => String(l).replace(/\s+/g, ' ').slice(0, 170));

async function runTrainItem(env, item) {
  const { engine, legends } = env;
  const t0 = performance.now();
  let goldSop = [];
  let goldBad = false;
  for (const g of item.gold) {
    if (item.review || !g.target) continue;
    const p = parse(g.target, { source: item.id });
    if (p.errors.length) { goldBad = true; break; }
    goldSop.push(...normalizedSop(p.wires, legends));
    // actions of the gold circuit that no operation of the gold world (or its imports) defines: the target was written for another world
    const avail = new Set(engine.set.available(g.world).flatMap((w) => (engine.set.get(w)?.operations ?? []).map((o) => o.action).filter(Boolean)));
    for (const w of p.wires) for (const e of w.entries ?? []) if (e.key === 'core.request.action' && e.value?.v && !avail.has(e.value.v)) (item._foreign ??= []).push(e.value.v);
  }
  if (!goldSop.length && !item.review) item.negative = true;   // an empty gold target means: nothing should be understood
  const row = { id: item.id, set: item.set, world: item.world, family: item.family, nseg: item.gold.length, label_status: item.label_status, negative: item.negative, text: item.text, textLen: item.text.length, tags: [], w: item.w ?? 1 };
  if (goldBad) { return { ...row, right: false, phase: 'data', reason: 'gold_sop_unparsable', ms: 0, tags: [] }; }
  const orc = await oracle(env, item);
  if (item.review) {   // needs_review: no trustworthy gold circuit; run the pipeline and report what it makes of the text
    const s = await seeded(engine, item, { language: 'en', formalizer: 'encoder', spell: WEBCHAT.spellcheck, partial: WEBCHAT.partialUnderstanding });
    let reply, error = null;
    try { reply = await s.send(item.text); } catch (e) { error = e.message; }
    const prod = reply ? reply.segments.filter((x) => !x.unparsed) : [];
    const dd = reply?.trace?.dispatch ?? null;
    const unparsedAny = (reply?.segments ?? []).some((x) => x.unparsed);
    return { ...row, w: item.w, review: { understood: prod.length > 0 && !unparsedAny, partial: prod.length > 0 && unparsedAny, worlds: prod.map((x) => x.match?.worldId).filter(Boolean), gold_world_hit: prod.some((x) => x.match?.worldId === item.gold[0].world), variants: prod.map((x) => x.dispatch?.variant).filter(Boolean), sop: short(sopLines(prod.flatMap((x) => x.wires), legends)), oracle_sop: short(orc.sop), label_reason: item.label_reason, reply: (reply?.text ?? '').slice(0, 140), dispatched: !!dd }, right: null, phase: 'review', reason: 'no_gold_needs_review', ms: 0, error, label_reason: item.label_reason };
  }
  const oracleOk = item.negative ? orc.none : sameSop(orc.sop, goldSop);
  row.oracle_strict = !item.negative && asKey(orc.sop) === asKey(goldSop);
  row.oracle_ok = oracleOk;

  // full pipeline
  const s = await seeded(engine, item, { language: 'en', formalizer: 'encoder', spell: WEBCHAT.spellcheck, partial: WEBCHAT.partialUnderstanding });
  let reply, error = null;
  try { reply = await s.send(item.text); } catch (e) { error = e.message; }
  row.ms = Math.round(performance.now() - t0);
  const produced = reply ? reply.segments.filter((x) => !x.unparsed) : [];
  const prodSop = reply ? sopLines(produced.flatMap((x) => x.wires), legends) : [];
  const right = !error && (item.negative ? produced.length === 0 : sameSop(prodSop, goldSop));
  row.right_strict = !error && !item.negative && asKey(prodSop) === asKey(goldSop);
  row.right = right;
  row.error = error;

  const d = reply?.trace?.dispatch ?? null;
  const statuses = reply?.statuses ?? [];
  const reasons = (reply?.answers ?? []).map((a) => a.envelope?.reason).filter(Boolean);
  const execStatuses = (reply?.answers ?? []).map((a) => a.status);
  row.exec = { statuses: [...new Set(execStatuses)], reasons: [...new Set(reasons)] };
  row.strategies = [...new Set((reply?.segments ?? []).map((x) => x.strategy))];
  row.variants = produced.map((x) => x.dispatch?.variant).filter(Boolean);

  // phase deviation facts (independent of each other)
  const f = { p2: false, p3: false, p4: false, p5: false, p6: false, p7: false, p8: false, bypass: !d };
  let dispatchInfo = null;
  if (d) {
    const gsegs = item.gold.map((g) => ({ start: g.start, end: g.end }));
    const beam = d.segmentations;
    const top1 = beam[0] ? segmentationMatches(beam[0].pieces, gsegs, 0.6) : false;
    const mi = beam.findIndex((g) => segmentationMatches(g.pieces, gsegs, 0.6));
    let w1 = false, w3 = false, goldWorlds = item.gold.map((g) => g.world);
    const worlds = (p) => [...new Set(p.attempts.map((a) => a.world))];
    if (mi >= 0) {
      const ps = beam[mi].pieces;
      w1 = ps.every((p, i) => worlds(p)[0] === goldWorlds[i]);
      w3 = ps.every((p, i) => worlds(p).slice(0, 3).includes(goldWorlds[i]));
    }
    f.p3 = mi < 0; f.p4 = mi >= 0 && !w3 && !item.negative;
    const win = beam[d.winnerIndex ?? 0];
    dispatchInfo = { top1, matchIdx: mi, w1, w3, winnerIndex: d.winnerIndex, nPred: beam[0]?.pieces.length ?? 0, nGold: gsegs.length,
      pieces: (win?.pieces ?? []).map((p) => ({ text: p.text, rank: p.chosen?.rank ?? null, goldRank: worlds(p).indexOf(item.gold[0]?.world) + 1, world: p.chosen?.world ?? null, variant: p.chosen?.variant ?? null, valid: p.valid, attempts: p.attempts.length, reasons: [...new Set(p.attempts.filter((a) => !a.valid).map((a) => a.reason))].slice(0, 2) })) };
    row.dispatch = dispatchInfo;
  }
  f.p5 = !oracleOk;
  const reply_t = reply?.text ?? '';
  f.p7 = right && reasons.some((r) => EXEC_BAD.has(r));
  f.p8 = right && (/\{[\w.]+\}|undefined|NaN|\[object|Something went wrong/.test(reply_t) || (!reply_t.trim() && produced.length > 0));
  row.dev = f;
  row.refused = right && execStatuses.some((x) => x !== 'supported') ? [...new Set(reasons)] : [];

  if (right) {
    if (f.p7) { row.phase = 'P7'; row.reason = reasons.find((r) => EXEC_BAD.has(r)); }
    else if (f.p8) { row.phase = 'P8'; row.reason = 'reply_artifact'; row.reply = reply_t.slice(0, 160); }
    else row.phase = null;
    row.tags = tagsFor(item, { phase: row.phase });
    row.case_only = !row.right_strict && !item.negative;
    return row;
  }

  // first deviating phase of a wrong item
  const oc = oracleOk ? null : classifyOracle(item, orc, goldSop);
  const isExpansionItem = EXPANSION_FAMILIES.has(item.family) || MARKER.test(item.text);
  let phase, reason, extra = {};
  const chosenVariants = (dispatchInfo?.pieces ?? []).map((p) => p.variant).filter(Boolean);
  if (error) { phase = 'P6'; reason = 'exception'; extra.error = error; }
  else if (oc?.kind === 'data' && !item.negative) { phase = 'P5'; reason = oc.reason; extra.kind = 'data'; extra.detail = oc.detail; }
  else if (!oracleOk && isExpansionItem && oc.kind === 'system' && !f.p3 && !(d && f.p4)) {
    phase = 'P2'; reason = orc.pieces.some((p) => p.expanded) ? 'expansion_wrong' : 'expansion_missing';
  } else if (d && f.p3) {
    phase = 'P3';
    const np = dispatchInfo.nPred, ng = dispatchInfo.nGold;
    reason = np > ng ? 'segmentation_splits_too_much' : np < ng ? 'segmentation_merges_pieces' : 'segmentation_boundary_shift';
  } else if (d && f.p4) {
    phase = 'P4'; reason = 'gold_world_not_in_top3';
  } else if (!oracleOk) {
    if (item.negative) { phase = 'P5'; reason = 'negative_parsed_by_rules'; }
    else { phase = 'P5'; reason = oc.reason; extra.kind = oc.kind; extra.detail = oc.detail; }
    // a data item that the pipeline reads differently is attributed to its data problem
    if (oc?.kind === 'data') extra.kind = 'data';
  } else if (!d) {
    phase = 'discourse'; reason = 'discourse_or_meta_answered_instead';
  } else {
    phase = 'P6';
    const dp = dispatchInfo;
    const bad = dp.pieces.find((p) => !p.valid);
    const wrongWorld = dp.pieces.some((p, i) => p.world && dp.matchIdx >= 0 && p.world !== item.gold[i]?.world);
    if (item.negative) reason = 'negative_accepted_by_validator';
    else if (dp.winnerIndex !== dp.matchIdx) reason = 'other_segmentation_won';
    else if (bad) reason = 'right_reading_not_validated';
    else if (wrongWorld) reason = 'wrong_world_chosen';
    else if (chosenVariants.includes('partial')) reason = 'complete_reading_not_chosen';
    else if (chosenVariants.some((v) => v === 'spell' || v === 'simplified' || v === 'normalized')) reason = `generated_reading_won:${chosenVariants.find((v) => v !== 'original')}`;
    else reason = 'same_text_different_wires';
    extra.chosen = dp.pieces.map((p) => `${p.world}/${p.variant}${p.valid ? '' : '/invalid'}(rank ${p.rank}, gold rank ${p.goldRank})`);
    if (bad) extra.why = bad.reasons;
  }
  row.phase = phase; row.reason = reason; Object.assign(row, extra);
  row.oracle_cause = oc ? `${oc.kind}:${oc.reason}` : null;
  const greedy = (() => { const g = [...lit(goldSop)], o = [...lit(orc.sop)]; return o.some((v) => /^"/.test(v) && g.some((x) => /^"/.test(x) && v.length > x.length && v.includes(x.slice(1, -1)))); })();
  row.tags = tagsFor(item, { phase, reason, chosenVariants, oracleOk, greedy });
  row.gold_sop = short(goldSop);
  row.got_sop = short(prodSop);
  row.oracle_sop = short(orc.sop);
  row.reply = (reply?.text ?? '').slice(0, 160);
  if (item.negative) delete row.gold_sop;
  return row;
}

/** Operational-set cases: no gold SOP, judged by the case's expectations; phases are judged against the case's world. */
async function runOperationalItem(env, c) {
  const { engine } = env;
  const item = { context: { tab: c.tab ?? null, session: c.setup ?? [], recent_worlds: [] }, init: c.init };
  const s = await seeded(engine, item, { language: 'en', formalizer: 'encoder', spell: WEBCHAT.spellcheck, partial: WEBCHAT.partialUnderstanding });
  const before = s.state();
  let reply, error = null;
  try { reply = await s.send(c.message); } catch (e) { error = e.message; }
  const row = { id: c.id, set: 'operational', world: c.world, families: c.families ?? [], text: c.message, textLen: c.message.length };
  if (!reply) return { ...row, outcome: 'wrong', phase: 'P6', reason: 'exception', error, tags: [] };
  const strip = (st) => { const { 'ui.help': _h, ...rest } = st; return JSON.stringify(rest); };
  const after = s.state();
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const items = evaluateCase(c, { before, after, replyText: reply.text, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged: strip(before) !== strip(after), effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
  row.outcome = outcome;
  row.reply = reply.text.slice(0, 200);
  row.failing = items.filter((x) => !x.ok && !x.trivial).map((x) => `${x.kind}:${x.spec}${x.actual !== undefined ? ` (got ${String(x.actual).slice(0, 50)})` : ''}`).slice(0, 3);
  const d = reply.trace?.dispatch ?? null;
  const prod = reply.segments.filter((x) => !x.unparsed);
  row.worlds = prod.map((x) => x.match?.worldId).filter(Boolean);
  row.variants = prod.map((x) => x.dispatch?.variant).filter(Boolean);
  row.exec = { statuses: [...new Set(reply.answers.map((a) => a.status))], reasons: [...new Set(reply.answers.map((a) => a.envelope?.reason).filter(Boolean))] };
  if (outcome === 'right') { row.phase = null; row.tags = []; return row; }
  let phase, reason;
  const win = d?.segmentations?.[d.winnerIndex ?? 0];
  const allAttempts = (win?.pieces ?? []).flatMap((p) => p.attempts);
  const goldWorldSeen = allAttempts.some((a) => a.world === c.world);
  const goldWorldValid = allAttempts.some((a) => a.world === c.world && a.valid);
  if (reply.segments.length === 0 && !reply.trace?.discourse?.meta && !reply.trace?.discourse?.resolved) { phase = 'P5'; reason = 'nothing_formalized'; }
  else if (!d && (reply.trace?.discourse?.meta || reply.trace?.discourse?.resolved)) { phase = 'discourse'; reason = 'discourse_or_meta_answered'; }
  else if (d && win && win.pieces.length > 1 && (c.families ?? []).length === 0 && !/\b(and|then)\b|[,;]/.test(c.message)) { phase = 'P3'; reason = 'segmentation_splits_too_much'; }
  else if (d && !goldWorldSeen) { phase = 'P4'; reason = 'gold_world_not_in_top3'; }
  else if (unparsedAll) { phase = 'P5'; reason = goldWorldSeen ? 'rules_do_not_parse_in_gold_world' : 'nothing_parsed'; }
  else if (row.exec.reasons.some((r) => EXEC_BAD.has(r))) { phase = 'P7'; reason = row.exec.reasons.find((r) => EXEC_BAD.has(r)); }
  else if (prod.some((x) => x.dispatch?.partial)) { phase = 'P6'; reason = 'partial_reading_used'; }
  else if (prod.some((x) => x.dispatch?.variant && x.dispatch.variant !== 'original')) { phase = 'P6'; reason = `generated_reading_won:${prod.find((x) => x.dispatch?.variant !== 'original').dispatch.variant}`; }
  else if (prod.length && c.world && !row.worlds.includes(c.world)) { phase = 'P6'; reason = goldWorldValid ? 'wrong_world_chosen_gold_world_valid' : 'wrong_world_chosen'; }
  else { phase = 'P5_or_P7'; reason = 'parsed_but_result_differs_no_gold_sop'; }
  row.phase = phase; row.reason = reason;
  row.tags = tagsFor({ text: c.message, family: (c.families ?? [])[0] }, { phase, reason, chosenVariants: row.variants, oracleOk: true });
  return row;
}

if (!isMainThread && workerData?.phaseWorker) {
  const env = await makeEnv(workerData.ort, workerData.modelDir);
  parentPort.postMessage({ ready: true });
  const out = [];
  for (const item of workerData.items) {
    let r;
    try { r = workerData.mode === 'operational' ? await runOperationalItem(env, item) : await runTrainItem(env, item); }
    catch (e) { r = { id: item.id, set: item.set, world: item.world, text: item.text ?? item.message, right: false, phase: 'harness', reason: `harness_error: ${e.message}`.slice(0, 120), tags: [] }; }
    out.push(r);
    if (out.length % 20 === 0) parentPort.postMessage({ progress: 20 });
  }
  parentPort.postMessage({ done: out });
  process.exit(0);
}

// ================================================================ main side ===============================================
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** Quotas for groups of given sizes: proportional to weight, at least `min` (capped at size), summing to n (water-filling). */
function allocate(sizes, weights, n, min = 1) {
  const keys = Object.keys(sizes);
  const q = Object.fromEntries(keys.map((k) => [k, Math.min(sizes[k], min)]));
  let left = n - Object.values(q).reduce((a, b) => a + b, 0);
  while (left > 0) {
    const open = keys.filter((k) => q[k] < sizes[k]);
    if (!open.length) break;
    const tw = open.reduce((a, k) => a + weights[k], 0);
    let given = 0;
    for (const k of open) { const add = Math.min(sizes[k] - q[k], Math.max(0, Math.floor((left * weights[k]) / tw))); q[k] += add; given += add; }
    if (!given) { const k = open.sort((a, b) => weights[b] - weights[a])[0]; q[k]++; given = 1; }
    left -= given;
  }
  return q;
}
function stratified(items, n, keyOf, weightOf, r, min = 1) {
  const groups = {};
  for (const it of items) (groups[keyOf(it)] ??= []).push(it);
  const sizes = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
  const q = allocate(sizes, Object.fromEntries(Object.keys(groups).map((k) => [k, weightOf(k, sizes[k])])), n, min);
  return Object.entries(groups).flatMap(([k, v]) => shuffle(v, r).slice(0, q[k]).map((x) => ({ ...x, _w: v.length / q[k] })));
}

function buildSample(root, n, seed) {
  const r = rng(seed);
  const dsRoot = join(root, 'dataset');
  const worlds = readdirSync(dsRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'multicmd').map((d) => d.name).sort();
  const all = new Map();   // id -> per-world record (any split), for multicmd source lookups
  const train = [];
  for (const split of ['train', 'dev', 'test']) for (const w of worlds) {
    const f = join(dsRoot, w, `${split}.jsonl`);
    if (!existsSync(f)) continue;
    for (const x of readJsonl(f)) { if (!all.has(x.id)) all.set(x.id, x); if (split === 'train') train.push(x); }
  }
  // texts labelled in several worlds with different targets (the label then depends on context the record may not carry)
  const textKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const byText = new Map();
  for (const x of all.values()) { if (x.negative || !x.target) continue; const m = byText.get(textKey(x.text)) ?? new Map(); m.set(x.world, new Set([...(m.get(x.world) ?? []), x.target.replace(/msg\d+#\d+-\d+/g, '').replace(/core\.seq=\d+/g, '')])); byText.set(textKey(x.text), m); }
  const xworldOf = (t) => { const m = byText.get(textKey(t)); if (!m || m.size < 2) return 1; const all2 = new Set([...m.values()].flatMap((v) => [...v])); return all2.size > 1 ? m.size : 1; };
  const trainPositive = train.filter((x) => !x.negative && x.target);
  const xwPop = trainPositive.filter((x) => xworldOf(x.text) > 1).length;
  POP.xworld = { train_positive_records: trainPositive.length, text_in_several_worlds_with_different_targets: xwPop, pct: Math.round((1000 * xwPop) / trainPositive.length) / 10 };
  POP.train_records = train.length;
  const mkSingle = (x, set, gold) => ({ id: x.id, set, world: x.world, family: x.phenomenon ?? 'unknown', label_status: x.label_status, negative: !!x.negative, text: x.text, context: { tab: x.tab ?? null, recent_worlds: [], session: x.context ?? [] }, gold: [{ start: 0, end: x.text.length, text: x.text, world: x.world, target: x.negative ? '' : x.target }], ...gold });
  const nMulti = Math.round(n * 0.4), nPara = Math.round(n * 0.2), nSingle = n - nMulti - nPara;
  // pool 1: per-world train records (rule-derived, generator, paraphrase variants, negatives)
  const cat = (x) => (x.negative ? 'negative' : x.label_status);
  const CATW = { 'rules-fail': 3, 'rules-differ': 3, 'generator-disagrees': 3, negative: 1.5 };
  const per = stratified(train.filter((x) => !x.negative || x.world), nSingle, (x) => `${x.world}|${cat(x)}`, (k, sz) => Math.pow(sz, 0.5) * (CATW[k.split('|')[1]] ?? 1), r, 1);
  const picked = new Set(per.map((x) => x.id));
  const singles = per.map((x) => ({ ...mkSingle(x, 'train'), w: x._w, xworld: xworldOf(x.text) }));
  // pool 2: paraphrase variants with F1 labels (needs_review and fail oversampled; needs_review never reaches train.jsonl)
  const para = [];
  for (const f of readdirSync(join(root, 'paraphrases', 'out')).filter((x) => x.endsWith('.jsonl')).sort()) {
    for (const x of readJsonl(join(root, 'paraphrases', 'out', f))) {
      if (x.split !== 'train' || picked.has(x.example_id) || x.mode === 'canonical') continue;
      if (!x.expected_circuit && !x.needs_review) continue;
      para.push({ id: x.example_id, set: 'paraphrase', world: x.world ?? f.replace('.jsonl', ''), family: x.phenomenon ?? 'paraphrase', label_status: x.needs_review ? `needs_review(${x.label_status})` : x.label_status, negative: false, review: !x.expected_circuit, label_reason: x.label_reason ?? null, xworld: xworldOf(x.text), text: x.text, context: { tab: x.tab ?? null, recent_worlds: [], session: x.context ?? [] }, gold: [{ start: 0, end: x.text.length, text: x.text, world: x.world ?? f.replace('.jsonl', ''), target: x.expected_circuit || null }] });
    }
  }
  const PW = { 'rules-fail': 3, 'rules-differ': 3 };
  const paraS = stratified(para, nPara, (x) => `${x.label_status.startsWith('needs_review') ? 'needs_review' : x.label_status}|${x.world}`, (k, sz) => Math.pow(sz, 0.5) * (k.startsWith('needs_review') ? 4 : PW[k.split('|')[0]] ?? 1), r, 1);
  // pool 3: multi-command train
  const multi = [];
  for (const m of readJsonl(join(dsRoot, 'multicmd', 'train.jsonl'))) {
    const segs = m.segments.map((s) => ({ start: s.start, end: s.end, text: s.text, world: s.world, target: all.get(s.source_id)?.target ?? null, neg: !!all.get(s.source_id)?.negative }));
    if (segs.some((s) => !s.target || s.neg)) continue;
    multi.push({ id: m.id, set: 'multicmd', world: segs[0].world, family: m.family, label_status: m.variant, negative: false, text: m.text, context: { tab: m.context?.tab ?? null, recent_worlds: m.context?.recent_worlds ?? [], session: m.context?.session ?? [] }, gold: segs, _k: `${m.family}|${m.n_segments}|${m.variant}` });
  }
  const multiS = stratified(multi, nMulti, (x) => x._k, (k, sz) => Math.pow(sz, 0.5), r, 3);
  POP.pools = { train_per_world: train.length, paraphrase_variants: para.length, multicmd: multi.length };
  return [...singles, ...paraS.map((x) => ({ ...x, w: x._w })), ...multiS.map((x) => ({ ...x, w: x._w, xworld: Math.max(...x.gold.map((g) => xworldOf(g.text))) }))];
}

async function main() {
  const ort = arg('ort');
  if (!ort) throw new Error('--ort <onnxruntime-node entry> is required');
  let root = resolve(arg('data-root', join(REPO, 'training')));
  if (!existsSync(join(root, 'dataset', 'kids.arith'))) root = '/home/salboaie/work/psys2/training';
  const operational = flag('operational');
  const name = arg('name', operational ? 'operational' : 'train');
  const workers = Number(arg('workers', 20));
  let items;
  if (operational) {
    items = readJsonl(join(REPO, 'training/eval/operational.jsonl'));   // every case runs; the failures are the rows with a phase
  } else items = buildSample(root, Number(arg('n', 1500)), Number(arg('seed', 7)));
  if (arg('limit')) items = shuffle(items, rng(1)).slice(0, Number(arg('limit')));
  const modelDir = resolve(arg('model-dir', join(REPO, 'docs/webchat/models/dispatcher')));
  const nw = Math.min(workers, items.length);
  const shards = Array.from({ length: nw }, (_, i) => items.filter((_, k) => k % nw === i));
  console.error(`${items.length} items, ${nw} workers`);
  let doneN = 0;
  const t0 = Date.now();
  const rows = (await Promise.all(shards.map((sh) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { phaseWorker: true, items: sh, ort, modelDir, mode: operational ? 'operational' : 'train' } });
    w.on('message', (m) => { if (m.progress) { doneN += m.progress; if (doneN % 100 === 0) console.error(`  ${doneN}/${items.length} (${Math.round((Date.now() - t0) / 1000)}s)`); } if (m.done) res(m.done); });
    w.on('error', rej);
    w.on('exit', (c) => { if (c) rej(new Error(`worker exit ${c}`)); });
  })))).flat();
  const out = summarize(rows, { name, operational, root, seed: Number(arg('seed', 7)), seconds: Math.round((Date.now() - t0) / 1000) });
  mkdirSync(join(REPO, 'training/results'), { recursive: true });
  writeFileSync(join(REPO, `training/results/phase-analysis-${name}.json`), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${name}: n=${rows.length} right=${out.overall.right}/${out.overall.n} (${out.overall.right_pct}%)  funnel ${JSON.stringify(out.funnel_first_failing_phase_wrong_items)}`);
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
export function summarize(allRows, meta) {
  const review = allRows.filter((r) => r.phase === 'review');
  const rows = allRows.filter((r) => r.phase !== 'review');
  const isRight = (r) => (r.set === 'operational' ? r.outcome === 'right' : r.right);
  const wsum = (rs, f = () => true) => rs.filter(f).reduce((a, r) => a + (r.w ?? 1), 0);
  const tally = (rs) => ({ n: rs.length, right: rs.filter(isRight).length, right_pct: pct(rs.filter(isRight).length, rs.length), clean_pct: pct(rs.filter((r) => isRight(r) && !r.phase).length, rs.length), weighted_right_pct: pct(wsum(rs, isRight), wsum(rs)) });
  const by = (keyOf) => Object.fromEntries(Object.entries(Object.groupBy(rows, keyOf)).sort().map(([k, v]) => [k, tally(v)]));
  const wrong = rows.filter((r) => !isRight(r));
  const order = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'discourse', 'harness', 'P5_or_P7'];
  const funnelWrong = Object.fromEntries(order.map((p) => [p, wrong.filter((r) => r.phase === p).length]));
  const funnelWeighted = Object.fromEntries(order.map((p) => [p, Math.round(wsum(wrong, (r) => r.phase === p))]));
  const funnelRightFlagged = { P7: rows.filter((r) => isRight(r) && r.phase === 'P7').length, P8: rows.filter((r) => isRight(r) && r.phase === 'P8').length };
  const causes = {};
  for (const r of rows.filter((x) => x.phase)) {
    const k = `${r.phase}:${r.reason}`;
    const c = (causes[k] ??= { phase: r.phase, reason: r.reason, n: 0, weighted_n: 0, kinds: {}, tags: {}, worlds: {}, label_status: {}, examples: [] });
    c.n++; c.weighted_n += r.w ?? 1;
    const kind = r.kind ?? 'system';
    c.kinds[kind] = (c.kinds[kind] ?? 0) + 1;
    for (const t of r.tags ?? []) c.tags[t] = (c.tags[t] ?? 0) + 1;
    c.worlds[r.world] = (c.worlds[r.world] ?? 0) + 1;
    c.label_status[r.label_status ?? '-'] = (c.label_status[r.label_status ?? '-'] ?? 0) + 1;
    if (c.examples.length < 8) c.examples.push(r);
  }
  for (const c of Object.values(causes)) c.weighted_n = Math.round(c.weighted_n);
  const dev = {};
  for (const p of ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) dev[p] = rows.filter((r) => r.dev?.[p]).length;
  const refusals = {};
  for (const r of rows) for (const x of r.refused ?? []) refusals[x] = (refusals[x] ?? 0) + 1;
  const tags = {};
  for (const r of wrong) for (const t of r.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
  // data problems: every wrong item whose oracle disagrees with the gold for a DATA reason, plus case-only and review items
  const dataRows = rows.filter((r) => r.kind === 'data' || r.oracle_cause?.startsWith('data:') || r.phase === 'data');
  const dataBy = {};
  for (const r of dataRows) {
    const k = r.reason?.startsWith('gold') || r.reason?.startsWith('same') || r.reason?.startsWith('label') || r.phase === 'data' ? r.reason : r.oracle_cause.replace('data:', '');
    const d = (dataBy[k] ??= { n: 0, weighted_n: 0, by_label_status: {}, by_set: {} });
    d.n++; d.weighted_n += r.w ?? 1; d.by_label_status[r.label_status] = (d.by_label_status[r.label_status] ?? 0) + 1; d.by_set[r.set] = (d.by_set[r.set] ?? 0) + 1;
  }
  for (const d of Object.values(dataBy)) d.weighted_n = Math.round(d.weighted_n);
  const caseOnly = rows.filter((r) => r.case_only);
  const rv = review.length ? {
    n: review.length, understood_complete: review.filter((r) => r.review.understood).length, partial: review.filter((r) => r.review.partial).length,
    not_understood: review.filter((r) => !r.review.understood && !r.review.partial).length,
    understood_in_gold_world: review.filter((r) => r.review.understood && r.review.gold_world_hit).length,
    understood_original_variant: review.filter((r) => r.review.understood && r.review.variants.every((v) => v === 'original')).length,
    by_label_reason: Object.fromEntries(Object.entries(Object.groupBy(review, (r) => r.label_reason ?? '-')).map(([k, v]) => [k, v.length])),
    examples: review.slice(0, 12).map((r) => ({ world: r.world, text: r.text, label_reason: r.label_reason, understood: r.review.understood, worlds: r.review.worlds, variants: r.review.variants, sop: r.review.sop })),
  } : null;
  return {
    meta: { ...meta, items: allRows.length, scored_items: rows.length, population: POP },
    overall: tally(rows), by_set: by((r) => r.set), by_world: by((r) => r.world), by_family: by((r) => `${r.set}/${r.family ?? (r.families ?? [])[0] ?? '-'}`),
    by_segments: by((r) => String(r.nseg ?? 1)), by_label_status: by((r) => r.label_status ?? '-'),
    funnel_first_failing_phase_wrong_items: funnelWrong, funnel_weighted_to_population: funnelWeighted, right_items_flagged_p7_p8: funnelRightFlagged,
    independent_deviation_counts: dev, refusal_reasons_on_right_items: refusals, wrong_by_task_tag: tags,
    data_problems: { items: dataRows.length, weighted_items: Math.round(wsum(dataRows)), by_reason: dataBy, case_only_mismatch_items: caseOnly.length },
    needs_review: rv,
    causes: Object.values(causes).sort((a, b) => b.n - a.n),
    rows: allRows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && isMainThread) await main();
