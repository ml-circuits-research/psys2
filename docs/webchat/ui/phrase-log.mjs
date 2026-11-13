// SPDX-License-Identifier: AGPL-3.0-only
// Phrase log (spec 06 "Phrase log"): pure functions that turn what a person typed or said, plus the reply of
// session.send(), into records for training data, and a small localStorage-backed store. Browser-safe, no imports.

import { reactionOf } from './action-log.mjs';

export const LOG_KEY = 'psys2.webchat.phrases';
export const LOG_CAP = 5000;
export const MODES = ['typed', 'voice', 'chip'];

const newId = (now) => `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Per-segment outcome from a reply: status, matched world and pattern, unparsed flag, strategy. */
export function segmentOutcomes(reply) {
  // a world's modal input (interceptInput: user.profile interview, docs.editor dictation, games) takes the whole message: no segments, but the world handled it
  const icpt = reply?.trace?.intercepted;
  if (icpt && !(reply?.segments ?? []).length) return [{ text: reply?.trace?.english ?? reply?.trace?.original ?? '', status: 'supported', world: icpt, pattern: null, unparsed: false, strategy: 'modal' }];
  const answers = reply?.answers ?? [];
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
    source: mode === 'chip' ? 'chip' : 'human', lang: reply?.lang ?? language, english, tab, segments,
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

const worstStatus = (r) => (r.outcome ?? r.segments.find((s) => s.status !== 'supported')?.status ?? r.segments[0]?.status ?? 'unknown');
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
/** Chips are not human phrasing: excluded unless includeChips. */
export function selectForExport(list, { includeChips = false } = {}) { return list.filter((r) => includeChips || r.source !== 'chip'); }
/** One JSON document: { format, exported, count, records } (the learning loop reads this and the older JSONL alike). */
export function toJSON(list, { includeChips = false, diagnostics = null, events = null } = {}) {
  const ev = Array.isArray(events) ? events : null;
  const records = selectForExport(list, { includeChips }).map((r) => exportRecord(r, ev));
  // format 3 adds `events` (every user action and progress step, in order); format 2 files (no `events`) still load everywhere
  return `${JSON.stringify({ format: ev ? 'psys2-phrase-log/3' : 'psys2-phrase-log/2', exported: new Date().toISOString(), count: records.length, ...(diagnostics ? { diagnostics } : {}), ...(ev ? { eventCount: ev.length, events: ev } : {}), records }, null, 1)}\n`;
}
export function toJSONL(list, { includeChips = false } = {}) {
  return selectForExport(list, { includeChips }).map((r) => JSON.stringify(exportRecord(r))).join('\n') + (list.length ? '\n' : '');
}
export const exportFilename = (d = new Date()) => `psys2-phrases-${d.toISOString().slice(0, 10).replace(/-/g, '')}.json`;

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
  const persist = () => { try { storage?.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable or full */ } };
  return {
    all: () => list,
    // Several pages of the same browser share one storage key: merge with what the others wrote instead of overwriting it.
    add(rec) { sync(); list = appendCapped(list, rec, cap); persist(); },
    update(id, patch) { sync(); list = list.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)); persist(); },
    remove(id) { sync(); list = list.filter((r) => r.id !== id); persist(); },
    clear() { list = []; persist(); },
  };
}
