/**
 * Pure logic of the learning loop (D5, scripts/learn-from-logs.mjs; training/README.md "Learning loop"). Node, no models: everything here
 * works on plain objects so it can be tested on small fixtures (tests/learn-logs.test.mjs).
 *
 *   loadLogRecords(files)            phrase-log exports (RD7 format, docs/webchat/ui/phrase-log.mjs `exportRecord`) -> records (chips excluded)
 *   recordsFromGold(rows)            held-out paraphrase records -> fake log records (with `gold`)
 *   recordsFromEval(report, cases)   the non-right cases of an eval-operational report -> fake log records (with `gold.world`)
 *   sessionsOf(records)              records grouped into replayable sessions
 *   correctionSignals(records)       per record: was it corrected by the user afterwards, is it itself feedback / a correction
 *   summarizeReply(reply, extra)     the validator trace of one replayed message, reduced to what the decision needs
 *   decideSelfLabel(summary, opts)   { ok, reasons } : "resolved validly with a clear margin" (see SELF_LABEL_RULES)
 *   labelledRows / queueRow          the output rows
 *   buildPatternIndex / nearestExample   closest pattern example (canonical marks preferred on ties) of the candidate worlds
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const SELF_LABEL_RULES = Object.freeze({
  minWorldScore: 0.8,    // every piece: the dispatcher's probability of the chosen world
  minPieceMargin: 2.0,   // every piece: score of the chosen reading minus the best valid reading of ANOTHER world (log units; x7.4)
  minSegGap: 1.0,        // whole message: score of the winning segmentation minus the best other valid segmentation with other cuts (log units; x2.7)
  allowSpell: false,     // a reading that needed a spelling correction is a typo, not a clear reading (the typo sets cover those)
});

const sha = (s) => createHash('sha256').update(s).digest('hex');
export const idOf = (...parts) => sha(parts.join('\n')).slice(0, 14);
export const normText = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

/** *.jsonl files of a directory (not recursive: labelled/ and review.jsonl are outputs), or the file itself. */
export function listLogFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).filter((f) => f.endsWith('.jsonl') && f !== 'review.jsonl').sort().map((f) => join(path, f));
}

/** Records of one export file. Chips and button presses are not human phrasing and never enter the loop. */
export function loadLogRecords(file) {
  return readJsonl(file).filter((r) => r && typeof r.text === 'string' && r.source !== 'chip' && r.mode !== 'chip')
    .map((r, i) => ({ ...r, _file: file, _line: i + 1, _id: idOf(file, r.time ?? '', r.text) }));
}

/** Held-out / gold paraphrase records as fake logs. The setup messages become earlier turns of the same session (replayed, never labelled). */
export function recordsFromGold(rows, { file = 'gold' } = {}) {
  const out = [];
  for (const r of rows) {
    if (r.needs_review || !r.text) continue;
    const session = `${file}#${r.example_id ?? idOf(r.text)}`;
    (r.setup ?? r.context ?? []).forEach((m, k) => out.push({ text: String(m), lang: 'en', tab: r.tab ?? null, time: `2026-01-01T00:00:${String(k).padStart(2, '0')}Z`, session, replayOnly: true, _file: file, _id: idOf(session, 'setup', k, m) }));
    out.push({ text: r.text, lang: r.language ?? 'en', tab: r.tab ?? null, time: '2026-01-01T00:01:00Z', session, source: 'gold', gold: { world: r.world ?? r.lineage?.world ?? null, circuit: r.expected_circuit ?? null }, _file: file, _id: idOf(session, r.text) });
  }
  return out;
}

/** The non-right cases of an eval-operational report (`report.cases`, joined to the case file by id) as fake logs. Gold = the case's world only. */
export function recordsFromEval(report, cases, { file = 'eval', only = (o) => o !== 'right' } = {}) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const out = [];
  for (const row of report.cases ?? []) {
    const c = byId.get(row.id);
    if (!c || !only(row.outcome)) continue;
    const session = `${file}#${c.id}`;
    (c.setup ?? []).forEach((m, k) => out.push({ text: String(m), lang: c.lang ?? 'en', tab: c.tab ?? null, time: `2026-01-01T00:00:${String(k).padStart(2, '0')}Z`, session, replayOnly: true, init: c.init, _file: file, _id: idOf(session, 'setup', k, m) }));
    out.push({ text: c.message, lang: c.lang ?? 'en', tab: c.tab ?? null, time: '2026-01-01T00:01:00Z', session, source: 'eval-failure', init: c.init, eval: { id: c.id, outcome: row.outcome, tags: c.tags ?? [] }, gold: { world: c.world ?? null, circuit: null, multi: (c.families ?? []).includes('multi') || (c.tags ?? []).length > 0 }, _file: file, _id: idOf(session, c.message) });
  }
  return out;
}

const GAP_MS = 30 * 60 * 1000;
/** Records grouped into sessions: an explicit `session` field, else one file split at gaps of more than 30 minutes. Each session is time-ordered. */
export function sessionsOf(records) {
  const explicit = new Map(), timed = [];
  for (const r of records) { if (r.session) { if (!explicit.has(r.session)) explicit.set(r.session, []); explicit.get(r.session).push(r); } else timed.push(r); }
  const sessions = [...explicit.values()];
  const byFile = new Map();
  for (const r of timed) { if (!byFile.has(r._file)) byFile.set(r._file, []); byFile.get(r._file).push(r); }
  for (const recs of byFile.values()) {
    recs.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
    let cur = [], last = null;
    for (const r of recs) {
      const t = Date.parse(r.time ?? '');
      if (cur.length && last != null && Number.isFinite(t) && t - last > GAP_MS) { sessions.push(cur); cur = []; }
      cur.push(r); if (Number.isFinite(t)) last = t;
    }
    if (cur.length) sessions.push(cur);
  }
  return sessions;
}

const CORRECTION = /^\s*(no\b|nope\b|wrong\b|not that\b|that'?s (wrong|not|incorrect)|that is (wrong|not|incorrect)|i (meant|said|wanted)\b|undo\b|never ?mind\b|not what i)/i;
export const isCorrectionText = (t) => CORRECTION.test(String(t ?? ''));

/**
 * Per record of a session: { feedback: the record itself is feedback (negative feedback flag or a correction phrase), correctedBy: the record
 * index of the correction that follows within the next two turns, or -1 }.  A message that is corrected afterwards is never self-labelled;
 * the message that restates it is kept as a label (`corrects`).
 */
export function correctionSignals(session) {
  const live = session.map((r, i) => ({ r, i })).filter(({ r }) => !r.replayOnly);
  const sig = session.map(() => ({ feedback: false, correctedBy: -1, corrects: -1 }));
  live.forEach(({ r, i }) => { sig[i].feedback = r.feedback === 'negative' || isCorrectionText(r.text); });
  live.forEach(({ i }, k) => {
    for (let d = 1; d <= 2 && k + d < live.length; d++) {
      const j = live[k + d].i;
      if (sig[j].feedback && !sig[i].feedback) {
        sig[i].correctedBy = j;
        const restated = live[k + d + 1];   // the message after the correction restates what the person meant
        if (restated && !sig[restated.i].feedback) sig[restated.i].corrects = i;
        break;
      }
    }
  });
  return sig;
}

/**
 * The validator trace of a replayed message reduced to what the label decision needs. `reply` is session.send()'s reply; `extra.stateChanged` says
 * whether the world state changed (ui.help ignored). Margins come from reply.trace.dispatch (spec 03 section 7: tier = validity class, score =
 * dispatcher log-prob + sum of piece scores).
 */
export function summarizeReply(reply, { stateChanged = false } = {}) {
  const d = reply?.trace?.dispatch ?? null;
  const segs = reply?.segments ?? [];
  const out = {
    dispatch: !!d, status: d?.status ?? null, partial: !!d?.partial, statuses: reply?.statuses ?? [], tier: null, gap: null, pieces: [],
    effect: !!(stateChanged || (reply?.answers ?? []).length || (reply?.effects ?? []).some((e) => e.name !== 'chat.suggest')),
    discourse: !!(reply?.trace?.discourse?.resolved || reply?.trace?.discourse?.meta || reply?.trace?.intercepted),
    lang: reply?.lang ?? 'en',
    // a message that went through the translator is stored only when the English reading is fully English (no word the translator did not know, no non-ASCII leftover)
    untranslated: !!(reply?.lang && reply.lang !== 'en' && ((reply.translation?.unknown ?? []).length || /[^\x00-\x7f]/.test(segs.map((x) => x.text ?? '').join(' ')))),
    feedback: reply?.feedback ?? null, nSegments: segs.length, unparsed: segs.filter((s) => s.unparsed).length, english: reply?.trace?.english ?? null,
  };
  if (!d) return out;
  const evals = d.segmentations ?? [];
  const win = evals.find((e) => e.index === d.winnerIndex) ?? null;
  out.tier = win?.tier ?? null;
  // gap to the best other VALID segmentation with other cuts (the same cuts with another reading are the same message read twice)
  const cuts = (e) => (e.pieces ?? []).map((p) => `${p.start}-${p.end}`).join('|');
  const others = evals.filter((e) => e !== win && e.valid && win && cuts(e) !== cuts(win));
  out.gap = win && others.length ? win.score - Math.max(...others.map((e) => e.score)) : Infinity;
  const ps = win?.pieces ?? [];
  const clip = (t) => String(t ?? '').replace(/[\s.?!,;:]+$/u, '');   // the formalizer drops the closing punctuation of a segment
  out.pieces = segs.map((s, k) => {
    const p = ps.length === segs.length ? ps[k] : ps.find((x) => clip(x.text) === clip(s.text));
    const dd = s.dispatch ?? null;
    const chosen = p?.chosen ?? null;
    const rivals = (p?.attempts ?? []).filter((a) => a.valid && a.world !== chosen?.world);
    return {
      text: s.text, world: s.match?.worldId ?? dd?.world ?? null, pattern: s.match?.patternId ?? null, strategy: s.strategy ?? null, unparsed: !!s.unparsed,
      variant: dd?.variant ?? chosen?.variant ?? null, rank: dd?.rank ?? chosen?.rank ?? null, corrections: (dd?.corrections ?? chosen?.corrections ?? []).length,
      partial: !!(dd?.partial ?? chosen?.partial), worldScore: dd?.worldScore ?? null,
      margin: chosen && p ? (rivals.length ? chosen.score - Math.max(...rivals.map((a) => a.score)) : Infinity) : null,
      tie: !!p?.tie, bestEffort: !!s.bestEffort, ignored: (s.ignored ?? []).length, found: !!p, discourse: !!s.discourse,
    };
  });
  return out;
}

/** The self-label decision. `signals` = { corrected, feedback } of the session position. Returns { ok, reasons } (reasons empty when ok). */
export function decideSelfLabel(sum, signals = {}, opts = {}) {
  const o = { ...SELF_LABEL_RULES, ...opts };
  const why = [];
  if (signals.feedback) why.push('is_feedback');
  if (signals.corrected) why.push('user_corrected');
  if (!sum.dispatch) why.push(sum.discourse ? 'discourse_or_modal' : 'no_dispatcher_trace');
  else {
    if (sum.status !== 'understood') why.push('not_understood');
    if (sum.partial || sum.pieces.some((p) => p.partial)) why.push('partial_reading');
    if (sum.tier !== 0) why.push(sum.tier === 2 ? 'partial_reading' : 'generated_or_invalid_reading');
    if (sum.unparsed || sum.pieces.some((p) => p.unparsed)) why.push('unparsed_piece');
    if (!sum.pieces.length) why.push('no_pieces');
    for (const p of sum.pieces) {
      if (!p.found) why.push('piece_not_in_trace');
      if (p.bestEffort) why.push('best_effort');
      if (p.ignored) why.push('ignored_words');
      if (p.strategy !== 'encoder') why.push('not_dispatcher_reading');
      if (p.variant === 'normalized') why.push('normalizer_reading');
      else if (p.variant === 'simplified') why.push('simplified_reading');
      else if (p.variant !== 'original' && !(o.allowSpell && p.variant === 'spell')) why.push(p.variant === 'spell' || p.corrections ? 'spelling_correction' : 'not_original_text');
      if (p.corrections && !o.allowSpell) why.push('spelling_correction');
      if (p.rank !== 1) why.push('not_top_world');
      if (p.worldScore != null && p.worldScore < o.minWorldScore) why.push('low_world_score');
      if (p.tie) why.push('world_tie');
      if (p.margin != null && p.margin < o.minPieceMargin) why.push('small_world_margin');
    }
    if (sum.gap != null && sum.gap < o.minSegGap) why.push('small_segmentation_gap');
  }
  if (sum.untranslated) why.push('untranslated_text');
  if (sum.statuses.length === 0 || sum.statuses.some((s) => s !== 'supported')) why.push('status_not_supported');
  if (!sum.effect) why.push('no_observable_effect');
  const reasons = [...new Set(why)];
  return { ok: reasons.length === 0, reasons };
}

/** One labelled row per piece, in the dataset-record format of build-dataset (example_id, world, text, context, expected_circuit, label_status, lineage). */
export function labelledRows({ rec, sum, sops, context = [], correctsId = null }) {
  const group = `self-validated/${rec._id}`;
  return sum.pieces.map((p, k) => ({
    example_id: `sv${idOf(rec._id, k, p.text)}`, world: p.world, text: p.text, context, expected_circuit: sops[k], label_status: 'self-validated',
    lineage: { kind: 'self-validated', world: p.world }, group: `${p.world}/${group}`, tab: rec.tab ?? null, mode: 'self-validated', lang: rec.lang ?? 'en',
    needs_review: false, target_from: 'validator',
    source_ref: { file: rec._file ?? null, id: rec._id, time: rec.time ?? null, segment: k }, ...(correctsId ? { corrects: correctsId } : {}),
    margin: { world_score: p.worldScore, piece_margin: Number.isFinite(p.margin) ? +p.margin.toFixed(3) : 'only-reading', seg_gap: Number.isFinite(sum.gap) ? +sum.gap.toFixed(3) : 'only-segmentation', tier: sum.tier },
  }));
}

/** Review-queue row of a message that was not self-labelled (English only; the original text stays in the source record). */
export function queueRow({ rec, text, reasons, sum, candidates, nearest }) {
  const world = candidates[0]?.world ?? 'unknown';
  return {
    id: rec._id, text, lang: rec.lang ?? 'en', tab: rec.tab ?? null, reasons, world_candidate: world, candidates: candidates.slice(0, 3),
    status: sum.status, tier: sum.tier, strategy: [...new Set(sum.pieces.map((p) => p.strategy).filter(Boolean))].join(',') || null,
    nearest: nearest ?? null, group: `${world}::${nearest?.pattern ?? 'none'}`, source_ref: { file: rec._file ?? null, id: rec._id, time: rec.time ?? null },
    ...(rec.feedback ? { feedback: rec.feedback } : {}), ...(rec.eval ? { eval: rec.eval } : {}),
  };
}

/** World candidates of a message: the worlds of its pieces, else the worlds the dispatcher tried (best world score first), reported with their scores. */
export function candidateWorlds(reply, sum) {
  const best = new Map();
  const add = (w, s) => { if (w && (!best.has(w) || best.get(w) < s)) best.set(w, s); };
  for (const p of sum.pieces) if (p.world && !p.unparsed) add(p.world, p.worldScore ?? 1);
  const d = reply?.trace?.dispatch;
  const win = d?.segmentations?.find((e) => e.index === d.winnerIndex) ?? d?.segmentations?.[0];
  for (const p of win?.pieces ?? []) for (const a of p.attempts ?? []) add(a.world, a.worldScore ?? 0);
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([world, score]) => ({ world, score: +score.toFixed(4) }));
}

// ---- nearest pattern example ---------------------------------------------------------------------------------------------------------
const toks = (t) => normText(t).replace(/\d+/g, '#').split(' ').filter(Boolean);
const grams = (t) => { const s = ` ${normText(t).replace(/\d+/g, '#')} `; const g = new Set(); for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3)); return g; };
const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n ? n / (a.size + b.size - n) : 0; };

/** Index of every pattern example of a world set (`set.list()` of the engine: { id, patterns: [{ id, examples, canonical }] }). */
export function buildPatternIndex(worlds) {
  const byWorld = new Map();
  for (const w of worlds) {
    const items = [];
    for (const p of w.patterns ?? []) {
      const canon = new Set(p.canonical ?? []);
      for (const ex of p.examples ?? []) items.push({ world: w.id, pattern: p.id, example: ex, canonical: canon.has(ex), tokens: new Set(toks(ex)), grams: grams(ex) });
    }
    byWorld.set(w.id, items);
  }
  return byWorld;
}

/** Closest example (word set + character trigrams; a canonical example wins a tie) among `worlds` (all worlds when none is given). */
export function nearestExample(text, index, worlds = []) {
  const q = new Set(toks(text)), qg = grams(text);
  let best = null;
  const pool = worlds.length ? worlds.filter((w) => index.has(w)) : [...index.keys()];
  for (const w of pool) for (const it of index.get(w)) {
    let shared = false; for (const t of q) if (it.tokens.has(t)) { shared = true; break; }
    if (!shared) continue;
    const sim = 0.5 * jac(q, it.tokens) + 0.5 * jac(qg, it.grams) + (it.canonical ? 0.01 : 0);
    if (!best || sim > best.sim) best = { world: it.world, pattern: it.pattern, example: it.example, canonical: it.canonical, sim };
  }
  return best && { ...best, sim: +best.sim.toFixed(3) };
}
