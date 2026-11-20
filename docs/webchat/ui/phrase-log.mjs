// SPDX-License-Identifier: AGPL-3.0-only
// Phrase log (spec 06 "Phrase log"): pure functions that turn what a person typed or said, plus the reply of
// session.send(), into records for training data, and a small localStorage-backed store. Browser-safe, no imports.

import { reactionOf } from './action-log.mjs';

export const LOG_KEY = 'psys2.webchat.phrases';
export const LOG_CAP = 5000;
export const MODES = ['typed', 'voice', 'chip', 'form'];   // form: a message a tab's form or control composed and sent (host.send: the Documents "Write it" form)

const newId = (now) => `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Per-segment outcome from a reply: status, matched world and pattern, unparsed flag, strategy. */
export function segmentOutcomes(reply) {
  // a world's modal input (interceptInput: docs.editor dictation) takes the whole message: no segments, but the world handled it
  const icpt = reply?.trace?.intercepted;
  if (icpt && !(reply?.segments ?? []).length) return [{ text: reply?.trace?.english ?? reply?.trace?.original ?? '', status: 'supported', world: icpt, pattern: null, unparsed: false, strategy: 'modal' }];
  const answers = reply?.answers ?? [];
  // the reader-based engine answers without segments: one outcome for the whole message, from its statuses (unparsed when the reader admitted no reading)
  if (!(reply?.segments ?? []).length && (reply?.statuses ?? []).length) {
    const st = reply.statuses.includes('supported') ? 'supported' : reply.statuses[0];
    const unread = reply.trace?.readerRouting ? reply.trace.readerRouting.selected == null : st !== 'supported';
    return [{ text: reply.trace?.english ?? reply.trace?.original ?? '', status: unread ? 'unparsed' : st, world: null, pattern: null, unparsed: unread, strategy: reply.trace?.readerRouting?.primary ?? null }];
  }
  return (reply?.segments ?? []).map((s) => {
    const wireIds = new Set((s.wires ?? []).map((w) => w.id));
    const mine = answers.filter((a) => wireIds.has(a.to));
    const status = s.unparsed ? 'unparsed' : (mine.find((a) => a.status && a.status !== 'supported')?.status ?? mine[0]?.status ?? (s.match ? 'supported' : 'unparsed'));
    return { text: s.text ?? '', status, world: s.match?.worldId ?? null, pattern: s.match?.patternId ?? null, unparsed: !!s.unparsed, strategy: s.strategy ?? null };
  });
}

/** Builds one log record. `mode` is typed | voice | chip; `tab` the active tab id; `reply` may be null (failed send). */
export function buildRecord({ text, mode = 'typed', language = 'en', tab = null, reply = null, now = Date.now(), id = null, endType = null, waitMs = null, example = false, recLang = null, correction = null }) {
  let segments = [];
  try { segments = segmentOutcomes(reply); } catch { segments = []; }   // a reply with an unexpected shape must never lose the phrase
  let formalizer = null;
  try { const used = reply?.trace?.formalizer?.used; formalizer = (Array.isArray(used) ? used.join('+') : used ? String(used) : null) ?? segments[0]?.strategy ?? null; } catch { formalizer = null; }
  const english = reply?.lang && reply.lang !== 'en' ? (reply.trace?.english ?? null) : null;
  // RO-TRANSLATE-FALLBACK: the turns that needed the Translator or the fixed Romanian line: 'translator-in' | 'translator-out' | 'rules-translate' | 'ro-generic'
  let via = [];
  try { via = [reply?.trace?.via, ...(reply?.trace?.replyVia ?? [])].filter(Boolean); } catch { via = []; }
  return {
    ...(via.length ? { via: [...new Set(via)] } : {}),
    ...(reply?.trace?.candidates?.length ? { candidates: reply.trace.candidates.slice(0, 8).map((c) => ({ ...c, text: String(c.text ?? '').slice(0, 300), ...(c.repaired ? { repaired: String(c.repaired).slice(0, 300) } : {}) })) } : {}),   // M4: every candidate English, which one was chosen, and why the others were not (source words, checker, issues)
    id: id ?? newId(now), time: new Date(now).toISOString(), text: String(text ?? ''), mode: MODES.includes(mode) ? mode : 'typed',
    source: mode === 'chip' ? 'chip' : mode === 'form' ? 'form' : 'human', lang: reply?.lang ?? language, english, tab, segments,
    unparsed: segments.some((s) => s.unparsed), formalizer,
    feedback: reply?.feedback ?? reply?.trace?.feedback ?? null,   // 'negative' when the person said the last answer was wrong (spec 11 section 13)
    selectedLang: language,   // LANG-FIXED: the language selected in the interface when the phrase was sent
    ...(mode === 'voice' ? { recLang: recLang ?? null } : {}),   // LANG-FIXED: the BCP-47 tag the speech recognizer actually used; a mismatch with selectedLang is visible at once in an export
    ...(correction ? { correction: true, correctionOf: String(correction.of ?? '') } : {}),   // INPUT-HISTORY: an edited recalled message sent right after a failed turn
    ...(example ? { example: true } : {}),   // SURPRISE: the text came from the die button (a canonical example), not from the person; source stays 'chip'
    ...(endType ? { endType, waitMs: waitMs ?? null } : {}),   // VOICE: how a spoken message ended: final | pause-plausible | pause-timeout | mic-stop, and how long the app waited (ms)
  };
}

/** FNV-1a hash of a JSON value, 8 hex digits: the state before and after a turn, so that a reviewer can tell whether a replay reaches the same state. */
export function hashState(value) {
  let h = 0x811c9dc5, str = '';
  try { str = JSON.stringify(value) ?? ''; } catch { str = ''; }
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const clip = (v, n) => { const t = String(v ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
/**
 * What a reviewer needs to replay a turn (FB): the readings tried per segment, the SOP Lang wires that ran, the worlds, the state hashes before and after,
 * the timings. Bounded (the log is kept in localStorage). `serialize(wires)` turns wires into SOP Lang text; `state` = { before, after } hashes.
 */
export function buildDetail(reply, { serialize = null, state = null, tab = null } = {}) {
  if (!reply) return null;
  const d = reply.trace?.dispatch ?? null;
  const readings = (reply.segments ?? []).slice(0, 12).map((sg, i) => {
    let wires = '';
    try { wires = serialize ? clip(serialize((sg.wires ?? []).filter((w) => w.type !== 'core.agent')), 1500) : ''; } catch { wires = ''; }
    const piece = d?.segmentations?.[d.winnerIndex ?? 0]?.pieces?.[i] ?? null;
    return {
      text: clip(sg.text, 300), world: sg.match?.worldId ?? null, pattern: sg.match?.patternId ?? null, strategy: sg.strategy ?? null, unparsed: !!sg.unparsed,
      complete: sg.match ? !sg.partial : false, refusal: sg.refusal ?? sg.reason ?? null,
      candidates: (piece?.attempts ?? []).slice(0, 4).map((a) => ({ world: a.world, score: a.worldScore != null ? +Number(a.worldScore).toFixed(3) : null, valid: !!a.valid, variant: a.variant ?? null })),
      wires,
    };
  });
  return {
    tab, worlds: [...new Set(readings.map((r) => r.world).filter(Boolean))], status: d?.status ?? null, readings,
    answer: clip(reply.text, 400), ...(reply.assumptions?.length ? { assumptions: reply.assumptions.slice(0, 8) } : {}), ...(reply.warnings?.length ? { warnings: reply.warnings.slice(0, 8) } : {}), effects: (reply.effects ?? []).slice(0, 8).map((e) => ({ name: e.name ?? e.effect ?? null })),
    budget: reply.budget ?? null, budgetExceeded: reply.budgetExceeded ?? null,   // COMPUTE-BUDGET: ticks per site, and where a loop tripped the budget (site, ticks, table, input, tab, stage, stack)
    state: state ?? null, perf: reply.perf ? { totalMs: reply.perf.totalMs ?? null, engineMs: reply.perf.engineMs ?? null, stages: reply.perf.stages ?? null } : null,
  };
}

export const FEEDBACK_REASONS = [
  ['wrong-action', 'wrong action'], ['wrong-object', 'wrong thing / object'], ['wrong-value', 'wrong place / value'], ['too-much', 'did too much'],
  ['too-little', 'did too little'], ['wrong-tab', 'wrong tab / world'], ['misheard', 'misheard (voice)'], ['too-slow', 'too slow'], ['other', 'other'],
];
/** The vote of a record: 'up' | 'down' | null (the older spoken-feedback flag `feedback: 'negative'` belongs to the message that complained, not to a vote). */
export const voteOf = (r) => (r?.feedback && typeof r.feedback === 'object' ? r.feedback.vote ?? null : null);
/** True for a message that is itself a complaint ("that is wrong", spoken or typed), in either storage form. */
export const isComplaint = (r) => r?.feedback === 'negative' || (r?.feedback && typeof r.feedback === 'object' && r.feedback.spoken === true);
/** A new feedback object from the old one and a patch; `time` is set when the vote changes. A complaint's flag survives as `spoken: true`. */
export function nextFeedback(old, patch, now = Date.now()) {
  const base = old && typeof old === 'object' ? old : { vote: null, reasons: [], wanted: '', correction: null, ...(old === 'negative' ? { spoken: true } : {}) };
  const fb = { ...base, ...patch };
  fb.reasons = [...new Set((fb.reasons ?? []).filter((x) => FEEDBACK_REASONS.some(([k]) => k === x)))];
  if (fb.vote !== 'down') { fb.reasons = []; fb.wanted = ''; fb.correction = null; }
  if (patch.vote !== undefined && patch.vote !== base.vote) fb.time = new Date(now).toISOString(); else fb.time ??= new Date(now).toISOString();
  return fb;
}

/** Fills a record written at send time with the outcome of the reply (the phrase is logged before it is answered). */
export function completeRecord(rec, reply, { language = 'en' } = {}) {
  const full = buildRecord({ text: rec.text, mode: rec.mode, language, tab: rec.tab, reply, now: Date.parse(rec.time) || Date.now(), id: rec.id, endType: rec.endType ?? null, waitMs: rec.waitMs ?? null, example: rec.example === true, recLang: rec.recLang ?? null });
  if (rec.feedback && typeof rec.feedback === 'object') full.feedback = rec.feedback;   // a vote given before the record was completed survives
  if (rec.queueMs != null) full.queueMs = rec.queueMs;
  return full;
}

/** Marks a record as ended without an answer: `reason` is 'stopped' (Stop button) or 'timeout' (watchdog), `stage` the pipeline stage it was in. */
export function completeStopped(rec, { reason = 'stopped', stage = null, ms = null } = {}) {
  return { ...rec, outcome: reason === 'stopped' ? 'stopped' : 'timeout', stage, ms, segments: [], unparsed: false };
}

/** Appends a record and drops the oldest entries beyond the cap. Returns a new array. */
export function appendCapped(list, rec, cap = LOG_CAP) {
  const next = [...list, rec];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

const turnStatus = (t) => (!t ? null : t.compiled?.refused ? (t.compiled.refused.stage === 'reader' ? 'unparsed' : 'unsupported') : 'supported');
const worstStatus = (r) => (r.outcome ?? (r.segments ?? []).find((s) => s.status !== 'supported')?.status ?? r.segments?.[0]?.status ?? turnStatus(r.turn) ?? 'unknown');
/** Filters: all | misses (not understood: any segment not supported) | voice | down (thumbs down: "Not what I wanted") | up. */
export function filterRecords(list, filter = 'all') {
  if (filter === 'down' || filter === 'up') return list.filter((r) => voteOf(r) === filter);
  if (filter === 'misses') return list.filter((r) => r.outcome || r.unparsed || r.segments.some((s) => s.status !== 'supported'));
  if (filter === 'voice') return list.filter((r) => r.mode === 'voice');
  return list;
}
export const summaryStatus = worstStatus;
export const summaryWorlds = (r) => [...new Set(r.segments.map((s) => s.world).filter(Boolean))];

/** Export record: every detail of the logged record (segments, readings and wires, timings, feedback, endType, outcome), plus the summary fields. */
export function exportRecord(r, events = null) {
  const { segments, ...rest } = r;
  const reaction = events ? reactionOf(r, events) : null;
  return { text: r.text, lang: r.lang, english: r.english ?? r.text, mode: r.mode, tab: r.tab, worlds: summaryWorlds(r), status: worstStatus(r), time: r.time, routing: routingOf(r), ...rest, ...(reaction ? { reaction } : {}), segments };
}
/**
 * Routing of one message (SETTINGS-COHERENT item 7), for the wrong-world analysis (scripts/analyze-phrase-log.mjs): the tab that was open (id and its world),
 * per piece of the message the candidate worlds with their scores and the world finally chosen, and the set of chosen worlds.
 */
export function routingOf(r) {
  const readings = Array.isArray(r?.detail?.readings) ? r.detail.readings : [];
  const pieces = readings.length
    ? readings.map((x) => ({ text: x.text ?? null, chosen: x.world ?? null, pattern: x.pattern ?? null, candidates: (x.candidates ?? []).map((c) => ({ world: c.world, score: c.score, valid: c.valid })) }))
    : (r?.segments ?? []).map((s) => ({ text: s.text ?? null, chosen: s.world ?? null, pattern: s.pattern ?? null, candidates: [] }));
  return { activeTab: r?.tab ?? null, activeWorld: r?.tabWorld ?? null, chosen: [...new Set(pieces.map((p) => p.chosen).filter(Boolean))], pieces };
}
/**
 * The records of an export: EVERY message is a record (owner export 2026-11-15T11:43: the chip turns and a Documents story with its "Not what I wanted" text were left out),
 * whatever its mode (typed, voice, a chip, an example, a tab form's message), with its feedback; a record keeps its `source` ('human' | 'chip' | 'form') so a reader can tell them apart.
 */
export function selectForExport(list) { return (list ?? []).filter((r) => r && typeof r === 'object'); }
// ---------- format 4: one entry per turn: asked, read, compiled, happened, feedback (diagnostics only on request) ----------
export const EXPORT_FORMAT = 'psys2-phrase-log/4';
const sopValue = (v) => (typeof v === 'number' || typeof v === 'boolean' || /^[A-Za-z_][\w.:#-]*$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));
const singular = (k) => (k.endsWith('ies') ? `${k.slice(0, -3)}y` : k.endsWith('s') ? k.slice(0, -1) : k);
/** The reader's raw output (the cutter's requests with spans: act, target, constraints) as SOP Lang wires, untruncated: `@r0 std.request act=make …`, one child wire per object. */
export function rawReadingSop(requests) {
  const lines = [];
  const emit = (id, type, obj, link, depth = 0) => {
    if (depth > 12) return;   // a reader's request nests a few levels; a deeper (or cyclic) value is not a reading
    const attrs = link ? [link] : [], kids = [];
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v == null || v === '') continue;
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) kids.push([k, v.filter((x) => x && typeof x === 'object'), true]);
      else if (v && typeof v === 'object' && !Array.isArray(v)) kids.push([k, [v], false]);
      else for (const x of [].concat(v)) attrs.push(`${k}=${sopValue(x)}`);
    }
    lines.push(`@${id} ${type}${attrs.length ? ` ${attrs.join(' ')}` : ''}`);
    for (const [k, list, many] of kids) list.forEach((x, i) => emit(`${id}.${singular(k)}${many ? i : ''}`, `${type}.${singular(k)}`, x, `${type === 'std.request' ? 'request' : 'of'}=$${id}`, depth + 1));
  };
  (Array.isArray(requests) ? requests : []).forEach((r, i) => emit(`r${i}`, 'std.request', r, null));
  return lines.join('\n');
}
/** The traces of the steps of a turn: a composed message (several requests) has one per step, else the reply's own trace. */
const stepTraces = (t) => (t?.composition?.steps?.length ? t.composition.steps.map((x) => x.trace ?? {}) : [t ?? {}]);
const failureText = (f) => [f?.reason, f?.detail?.reason, f?.detail?.key].filter(Boolean).join(':');
const failuresText = (list) => [...new Set((list ?? []).map(failureText).filter(Boolean))].join(', ');
/** A reading's wires on one line, without the source line and the request links: `std.request act=make mood=do; std.request.target kind=k.objects.lake …`. */
const oneLine = (wires) => String(wires ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^@\S+\s+std\.request\.source\b/.test(l))
  .map((l) => l.replace(/^@\S+\s+/, '').replace(/\s(?:source|request)=\$\S+/g, '')).join('; ');
/** Which reading was used and why, one line each: the admission decision, context retries, interpretation notes, admitted alternatives that were not used. */
function readVia(t, rr) {
  const out = [];
  if (!rr) return out;
  const adm = rr.admission ?? {};
  if (adm.mode || rr.reason) out.push(`admission: ${rr.selected ? 'admitted' : 'refused'}${adm.mode ? ` (${adm.mode}${adm.uncertain ? ', uncertain' : ''})` : ''}${rr.reason ? ` — ${rr.reason}` : ''}`);
  const cr = rr.contextRetry;
  if (cr) {
    if (cr.primary) out.push(`reading with context: ${cr.used ? 'not used' : 'used'}${cr.primary.failures?.length ? ` — ${failuresText(cr.primary.failures)}` : ''}`);
    for (const a of cr.attempts ?? []) out.push(`retry ${a.profile}: ${a.used ? 'used' : 'not used'}${a.failures?.length ? ` — ${failuresText(a.failures)}` : ''}`);
  }
  if (rr.interpretation?.profile) out.push(`interpretation ${rr.interpretation.profile}${rr.interpretation.note ? `: ${rr.interpretation.note}` : ''}`);
  const used = new Set(stepTraces(t).map((x) => x.reading?.wires).filter(Boolean));
  const alts = (adm.alternatives ?? []).filter((a) => a?.wires && !used.has(a.wires));
  for (const a of alts.slice(0, 6)) out.push(`alternative not used${t.readingComparison ? ' (ranked lower by the reading comparison)' : ''}: ${oneLine(a.wires)}`);
  if (alts.length > 6) out.push(`… ${alts.length - 6} more alternatives`);
  if (!rr.selected && rr.unresolved?.length) out.push(`unresolved: ${failuresText(rr.unresolved)}`);
  return out;
}
/** The circuit a step compiled and dispatched: the capability result with its call and arguments, the placement with its call, a query or history circuit. */
function compiledOf(s) {
  const sop = s.compiledSop ?? s.placement ?? s.controlIntent ?? null;
  if (!sop) return null;
  return { sop: typeof sop === 'string' ? sop : JSON.stringify(sop), kind: s.placement ? 'placement' : s.readOnly ? 'query' : s.history ? 'history' : 'capability' };
}
const GROUNDING = /target|value|ground|ambig|selector|anchor|not-?found|no-object|unknown-(?:kind|object)|missing-referent/i;
/** Where a turn that did not succeed stopped: reader | routing | grounding | binding | compilation | execution, with the reason code. */
export function refusalOf(reply) {
  const t = reply?.trace ?? {}, rr = t.readerRouting ?? null, steps = stepTraces(t);
  const reason = steps.map((x) => x.reason).find(Boolean) ?? t.reason ?? rr?.reason ?? null;
  const circuit = (x) => String(x.compiledSop ?? x.placement ?? '');
  let stage;
  if (!rr ? !steps.some((x) => x.reading || compiledOf(x)) : rr.selected == null) return { stage: 'reader', reason: rr?.reason ?? reason ?? 'reading', ...(rr?.unresolved?.length ? { detail: failuresText(rr.unresolved) } : {}) };
  if (steps.some((x) => x.receipt || x.effectVerification || /\bstatus=compiled\b/.test(circuit(x)))) stage = 'execution';
  else if (steps.some((x) => x.compiledSop || x.placement)) stage = GROUNDING.test(reason ?? '') ? 'grounding' : 'binding';
  else if (!steps.some((x) => x.executionRoute)) stage = GROUNDING.test(reason ?? '') ? 'grounding' : 'routing';
  else stage = 'compilation';
  const ver = steps.map((x) => x.effectVerification).find((v) => v && v.status !== 'verified');
  return { stage, reason: reason ?? 'unknown', ...(ver ? { detail: `effect ${ver.status}${ver.reason ? `: ${ver.reason}` : ''}` } : {}) };
}
/**
 * The compact account of one turn, captured when the reply arrives (stored on the record as `turn`):
 *   read      { cut: the reader's requests as SOP wires, sop: the admitted std.request reading, via: [why this reading] }
 *   compiled  { sop: the dispatched circuit(s), kind } or { refused: { stage, reason, detail } } (both when it compiled and then failed)
 *   happened  { reply, changes: SOP diff lines of the instance worlds, solver, verified }
 * `changes` comes from the caller (ui/state-diff.mjs sopChanges). Nothing is truncated.
 */
export function turnOf(reply, { changes = null } = {}) {
  if (!reply) return null;
  const t = reply.trace ?? {}, rr = t.readerRouting ?? null, steps = stepTraces(t);
  const raw = rr?.rawReading, reading = steps.map((x) => x.reading?.wires).filter(Boolean).join('\n'), via = readVia(t, rr);
  const read = { ...(raw?.length ? { cut: rawReadingSop(raw) } : {}), ...(reading ? { sop: reading } : {}), ...(via.length ? { via } : {}) };
  if (!rr && t.intercepted) read.via = [`modal input of ${t.intercepted}`];
  const circuits = steps.map(compiledOf).filter(Boolean);
  const supported = (reply.statuses ?? []).includes('supported');
  const compiled = { ...(circuits.length ? { kind: [...new Set(circuits.map((c) => c.kind))].join('+'), sop: circuits.map((c) => c.sop.trim()).join('\n\n') } : {}), ...(supported ? {} : { refused: refusalOf(reply) }) };
  const solver = steps.map((x) => x.solver?.provider ?? /\bprovider=(\w+)/.exec(String(x.placement ?? ''))?.[1]).find(Boolean) ?? null;
  const verified = steps.map((x) => x.effectVerification?.status).filter(Boolean);
  const happened = { reply: String(reply.text ?? ''), ...(changes?.length ? { changes } : {}), ...(solver ? { solver } : {}), ...(verified.length ? { verified: verified.join('+') } : {}),
    ...(t.composition ? { steps: `${t.composition.supported}/${t.composition.total} supported` } : {}) };
  return { read, compiled, happened };
}
/** A record logged before format 4 (no `turn`): what its detail and happened fields still say. */
function legacyTurn(r) {
  const wires = (r.detail?.readings ?? []).map((x) => x.wires).filter(Boolean).join('\n');
  const changes = (r.happened?.changes ?? []).flatMap((c) => (c.changes ?? []).map((x) => `~ ${c.world}: ${x}`));
  const reply = r.detail?.answer ?? r.happened?.shown?.[0]?.text ?? '';
  return { read: wires ? { sop: wires } : {}, compiled: {}, happened: { reply, ...(changes.length ? { changes } : {}) }, legacy: true };
}
/** The person's feedback on a turn: vote, reasons, expected text, correction; a spoken complaint; null when there is none. */
function feedbackOf(r) {
  if (isComplaint(r) && voteOf(r) == null) return { complaint: true };
  const fb = r.feedback && typeof r.feedback === 'object' ? r.feedback : null;
  if (!fb || (!fb.vote && !fb.spoken)) return null;
  return { ...(fb.vote ? { vote: fb.vote } : {}), ...(fb.reasons?.length ? { reasons: fb.reasons } : {}), ...(fb.wanted ? { wanted: fb.wanted } : {}), ...(fb.correction ? { correction: fb.correction } : {}), ...(fb.spoken ? { complaint: true } : {}) };
}
/** One export entry: { id, asked, read, compiled, happened, feedback? }. */
export function exportEntry(r) {
  const t = r.turn ?? legacyTurn(r);
  const asked = { text: r.text, tab: r.tab ?? null, time: r.time ?? null, ...(r.mode && r.mode !== 'typed' ? { mode: r.mode } : {}), ...(r.source && r.source !== 'human' && r.source !== r.mode ? { source: r.source } : {}),
    ...(r.lang && r.lang !== 'en' ? { lang: r.lang, english: r.english ?? null } : {}), ...(r.correction ? { correctionOf: r.correctionOf } : {}), ...(r.example ? { example: true } : {}) };
  const happened = r.ignored ? { outcome: 'ignored' } : r.outcome ? { outcome: r.outcome, stage: r.stage ?? null, ms: r.ms ?? null } : t.happened ?? {};
  const fb = feedbackOf(r);
  return { id: r.id ?? null, asked, read: t.read ?? {}, compiled: t.compiled ?? {}, happened, ...(fb ? { feedback: fb } : {}), ...(t.legacy ? { legacy: true } : {}) };
}
/**
 * The export (Settings > History > Export JSON): `psys2-phrase-log/4`, one entry per turn in order. Diagnostics (budget, perf, engine stats, long tasks, load steps, UI events,
 * the full stored record) are added only with `includeDiagnostics`, in a separate `diagnostics` section at the end.
 */
export function toJSON(list, { diagnostics = null, events = null, app = null, includeDiagnostics = false } = {}) {
  const recs = selectForExport(list), ev = Array.isArray(events) ? events : null;
  const entries = recs.map((r, i) => ({ n: i + 1, ...exportEntry(r) }));
  const doc = { format: EXPORT_FORMAT, app: app ? { build: app.commit ?? null, version: app.version ?? null } : null, exported: new Date().toISOString(), turns: entries.length, typed: recs.filter((r) => r.source === 'human').length, entries };
  if (includeDiagnostics) doc.diagnostics = { ...(diagnostics ? { app: diagnostics } : {}), ...(ev ? { events: ev } : {}), records: recs.map((r) => { const { turn, ...rest } = exportRecord(r, ev); return rest; }) };
  return `${JSON.stringify(doc, null, 1)}\n`;
}
/**
 * The records of any export, in the record shape the learning scripts read ({ id, text, tab, time, lang, mode, source, status, feedback, failure, detail: { answer } }):
 * format 4 entries are mapped back (with their `turn`), formats 2 and 3 (`records`), a bare array and JSONL lines are taken as they are.
 */
export function exportRecords(doc) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') return [];
  if (Array.isArray(doc.entries)) {
    const full = new Map((doc.diagnostics?.records ?? []).map((r) => [r.id, r]));
    return doc.entries.map((e) => {
      const r = full.get(e.id) ?? {}, refused = e.compiled?.refused;
      const status = e.happened?.outcome ?? (refused ? (refused.stage === 'reader' ? 'unparsed' : 'unsupported') : 'supported');
      return { ...r, id: e.id, text: e.asked?.text ?? r.text ?? '', tab: e.asked?.tab ?? r.tab ?? null, time: e.asked?.time ?? r.time ?? null, lang: e.asked?.lang ?? r.lang ?? 'en', english: e.asked?.english ?? r.english ?? e.asked?.text,
        mode: e.asked?.mode ?? r.mode ?? 'typed', source: e.asked?.source ?? r.source ?? (e.asked?.mode === 'chip' || e.asked?.mode === 'form' ? e.asked.mode : 'human'), status: r.status && r.status !== 'unknown' ? r.status : status,
        feedback: e.feedback ?? r.feedback ?? null, segments: r.segments ?? [], detail: { ...(r.detail ?? {}), answer: e.happened?.reply ?? r.detail?.answer ?? '' }, turn: { read: e.read, compiled: e.compiled, happened: e.happened } };
    });
  }
  return Array.isArray(doc.records) ? doc.records : [];
}
export function toJSONL(list) {
  const out = selectForExport(list);
  return out.map((r) => JSON.stringify(exportRecord(r))).join('\n') + (out.length ? '\n' : '');
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The history file's name (owner 2026-11-15): the LOCAL day and the English month abbreviation, `psys2-15Nov.json`; the n-th export of the same day `psys2-15Nov-<n>.json`. */
export const exportFilename = (d = new Date(), n = 1) => `psys2-${d.getDate()}${MONTHS[d.getMonth()]}${n > 1 ? `-${n}` : ''}.json`;
/** The local day of a date as YYYY-MM-DD (the key of the per-day export counter). */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The next number of an export on day `day`, from the stored counter `{ day, n }` (another day starts again at 1). Pure: returns { n, next } where `next` is what to store. */
export function nextExportNumber(stored, day) {
  const n = stored && stored.day === day && Number.isInteger(stored.n) ? stored.n + 1 : 1;
  return { n, next: { day, n } };
}

/** localStorage-backed store; every storage access is guarded. */
export function createStore(storage = globalThis.localStorage, { cap = LOG_CAP, key = LOG_KEY } = {}) {
  let list = [];
  try { const v = JSON.parse(storage?.getItem(key) ?? '[]'); if (Array.isArray(v)) list = v.filter((r) => r && typeof r.text === 'string' && Array.isArray(r.segments)); } catch { list = []; }
  const sync = () => {
    try {
      const v = JSON.parse(storage?.getItem(key) ?? '[]'); if (!Array.isArray(v)) return;
      const have = new Set(list.map((r) => r.id));
      const theirs = v.filter((r) => r && typeof r.text === 'string' && Array.isArray(r.segments) && !have.has(r.id));
      if (theirs.length) list = [...list, ...theirs].sort((a, b) => String(a.time).localeCompare(String(b.time)));
    } catch { /* keep what we have */ }
  };
  // full storage: the oldest fifth is dropped until the list fits (a full quota must not lose every new turn)
  const persist = () => { for (let i = 0; i < 8; i++) { try { storage?.setItem(key, JSON.stringify(list)); return; } catch (e) { if (!/quota/i.test(`${e?.name} ${e?.message}`) || list.length < 2) return; list = list.slice(Math.ceil(list.length / 5)); } } };
  return {
    all: () => list,
    // Several pages of the same browser share one storage key: merge with what the others wrote instead of overwriting it.
    add(rec) { sync(); list = appendCapped(list, rec, cap); persist(); },
    update(id, patch) { sync(); list = list.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)); persist(); },
    remove(id) { sync(); list = list.filter((r) => r.id !== id); persist(); },
    clear() { list = []; persist(); },
  };
}
