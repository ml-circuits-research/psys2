// SPDX-License-Identifier: AGPL-3.0-only
// FAILURES (spec 06 "Learn from use"): which logged turns are failures, the "Failures" filter and "Download failures only" of the history, and the batch that may be sent
// (only when the person turned sending on). Pure functions over the phrase log and the user-action log; browser-safe, no `node:*`, no DOM, no network.
//
// A turn is a FAILURE when one of these holds (each is a REASON stored with it):
//   disliked                 the person pressed "Not what I wanted" (or said "that is wrong") on its answer
//   not-understood-rephrased the reply was "not understood" or a refusal and the next message says the same thing differently
//   undone                   the person undid it at once (the Undo tap / "Show me the right result" right after it, or the next turn is an undo)
//   corrected                the next message is a correction or a complaint about it (the dialogue turn kinds `correction` and `complaint`, the INPUT-HISTORY correction flag, or a spoken "that is wrong")
// A record that is only context (the two turns before and after a failure) carries `context: true` in the failures export.

import { voteOf, isComplaint, exportRecord, summaryStatus, summaryWorlds } from './phrase-log.mjs';
import { reactionOf } from './action-log.mjs';

export const FAILURE_REASONS = Object.freeze(['disliked', 'not-understood-rephrased', 'undone', 'corrected']);
export const FAILURE_REASON_TEXT = Object.freeze({ disliked: 'disliked', 'not-understood-rephrased': 'not understood, then rephrased', undone: 'undone at once', corrected: 'corrected next' });
export const BATCH_FORMAT = 'psys2-failures/1';
export const CONTEXT_TURNS = 2;
const REPHRASE_GAP_MS = 180000, UNDO_GAP_MS = 60000, BATCH_MAX = 50;

const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const when = (r) => Date.parse(r?.time) || 0;
const isPerson = (r) => r && r.source !== 'chip' && !r.ignored;
/** The reply was "not understood" or a refusal (the turn kinds of `outcomeOf`; older records: an unparsed segment or a status other than supported). */
export function wasNotUnderstood(r) {
  if (!r || r.outcome || r.ignored) return false;
  if (r.replyOutcome) return r.replyOutcome === 'not-understood' || r.replyOutcome === 'refused';
  return !!r.unparsed || (r.segments ?? []).some((s) => s.status && !['supported', 'missing'].includes(s.status));
}
/** Two messages that say the same thing differently: not the same text, close in time. (Which phrasing works is the next turn's business; the failure is that the first one did not.) */
const rephrases = (a, b) => isPerson(b) && norm(a.text) !== '' && when(b) - when(a) <= REPHRASE_GAP_MS && when(b) >= when(a);

/** Map record id -> reasons[] (only failures appear). `events` (the user-action log) is optional; without it "undone" is read from the record's own feedback. */
export function failureReasons(list, events = null) {
  const recs = [...(list ?? [])].sort((a, b) => when(a) - when(b)), out = new Map();
  const add = (r, why) => { const s = out.get(r.id) ?? []; if (!s.includes(why)) s.push(why); out.set(r.id, s); };
  recs.forEach((r, i) => {
    if (!r || r.ignored) return;
    const next = recs.slice(i + 1).find(isPerson) ?? null;
    if (voteOf(r) === 'down') add(r, 'disliked');
    if (isPerson(r) && wasNotUnderstood(r) && next && rephrases(r, next) && !isComplaint(next)) add(r, 'not-understood-rephrased');
    if (r.feedback && typeof r.feedback === 'object' && r.feedback.undone === true) add(r, 'undone');
    else if (events && isPerson(r)) { const re = reactionOf(r, events, { gapMs: UNDO_GAP_MS }); if (re?.kind === 'undo') add(r, 'undone'); }
    if (isPerson(r) && next && (next.correction === true || next.turnKind === 'correction' || next.turnKind === 'complaint' || isComplaint(next)) && when(next) - when(r) <= REPHRASE_GAP_MS) add(r, 'corrected');
  });
  return out;
}

export const isFailure = (r, reasons) => reasons.has(r?.id);
/** The "Failures" filter of the history. */
export function filterFailures(list, events = null) { const m = failureReasons(list, events); return (list ?? []).filter((r) => m.has(r.id)); }

/** The failures with their context: [{ rec, reasons, context: false }] and the turns around them ({ context: true }), in time order, each turn once. */
export function failuresWithContext(list, events = null, { turns = CONTEXT_TURNS } = {}) {
  const recs = [...(list ?? [])].filter((r) => !r.ignored).sort((a, b) => when(a) - when(b)), m = failureReasons(recs, events), keep = new Map();
  recs.forEach((r, i) => {
    if (!m.has(r.id)) return;
    for (let j = Math.max(0, i - turns); j <= Math.min(recs.length - 1, i + turns); j++) if (!keep.has(recs[j].id)) keep.set(recs[j].id, j === i);
    keep.set(r.id, true);
  });
  return recs.filter((r) => keep.has(r.id)).map((r) => ({ rec: r, reasons: m.get(r.id) ?? [], context: !keep.get(r.id) }));
}

/** "Download failures only": export format 3 (`psys2-phrase-log/3`) with only the failure turns and their context turns, and only the events that belong to those turns. */
export function toFailuresJSON(list, { events = null, diagnostics = null, turns = CONTEXT_TURNS, now = Date.now() } = {}) {
  const ev = Array.isArray(events) ? events : [];
  const picked = failuresWithContext(list, ev, { turns });
  const all = [...(list ?? [])].sort((a, b) => when(a) - when(b));
  const inSet = new Set(picked.map((p) => p.rec.id));
  // an event belongs to the latest turn that started before it
  const owner = (e) => { let hit = null; for (const r of all) { if (when(r) <= Date.parse(e.time)) hit = r; else break; } return hit; };
  const kept = ev.filter((e) => { const o = e.recId ?? owner(e)?.id; return o && inSet.has(o); });
  const records = picked.map(({ rec, reasons, context }) => ({ ...exportRecord(rec, ev), ...(context ? { context: true } : { failure: { reasons } }) }));
  return `${JSON.stringify({ format: 'psys2-phrase-log/3', exported: new Date(now).toISOString(), selection: 'failures', contextTurns: turns, count: records.length, failureCount: picked.filter((p) => !p.context).length, ...(diagnostics ? { diagnostics } : {}), eventCount: kept.length, events: kept, records }, null, 1)}\n`;
}
export const failuresFilename = (d = new Date()) => `psys2-failures-${d.toISOString().slice(0, 10).replace(/-/g, '')}.json`;

const clip = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
/**
 * One failure as it is SENT: what the turn was and how it went, nothing about the person. Never included: the rest of the history, the events, the diagnostics, any identity.
 * `next` is the person's next message when it is the correction or the rephrasing (its text only).
 */
export function failureEntry(r, reasons, next = null) {
  const fb = r.feedback && typeof r.feedback === 'object' ? r.feedback : null;
  const readings = Array.isArray(r.detail?.readings) ? r.detail.readings : [];
  return {
    id: r.id, time: r.time, text: clip(r.text, 500), english: r.english ? clip(r.english, 500) : null, lang: r.lang ?? 'en', tab: r.tab ?? null, tabWorld: r.tabWorld ?? null, mode: r.mode ?? 'typed',
    reasons, outcome: r.replyOutcome ?? (wasNotUnderstood(r) ? 'not-understood' : null), turnKind: r.turnKind ?? null,
    reading: readings.slice(0, 6).map((x) => ({ text: clip(x.text, 300), world: x.world ?? null, pattern: x.pattern ?? null, unparsed: !!x.unparsed, wires: clip(x.wires, 800) })),
    worlds: summaryWorlds(r), status: summaryStatus(r),
    changed: (r.happened?.changes ?? []).slice(0, 8), reply: clip(r.detail?.answer ?? (r.happened?.shown ?? [])[0]?.text ?? '', 400),
    expected: fb?.wanted ? clip(fb.wanted, 500) : null, why: fb?.reasons?.length ? fb.reasons : [],
    ...(next ? { next: clip(next.text, 500) } : {}),
  };
}

/**
 * The next batch to send: failure turns that were not sent yet (`sentIds`), oldest first, at most `max`. `identity` is added only when the person typed one.
 * Format `psys2-failures/1` (specs/06 "Learn from use").
 */
export function buildBatch(list, { events = null, sentIds = new Set(), identity = '', build = null, max = BATCH_MAX, now = Date.now() } = {}) {
  const recs = [...(list ?? [])].sort((a, b) => when(a) - when(b)), m = failureReasons(recs, events);
  const failures = [];
  recs.forEach((r, i) => {
    if (!m.has(r.id) || sentIds.has(r.id) || failures.length >= max) return;
    const why = m.get(r.id), nxt = why.includes('not-understood-rephrased') || why.includes('corrected') ? recs.slice(i + 1).find(isPerson) ?? null : null;   // the next message is part of the failure only when it is the rephrasing or the correction
    failures.push(failureEntry(r, why, nxt));
  });
  return { format: BATCH_FORMAT, sent: new Date(now).toISOString(), app: { build: build ?? null }, ...(String(identity ?? '').trim() ? { sender: clip(identity, 120) } : {}), count: failures.length, failures };
}

/** An endpoint is accepted when it is https, or http to this machine (a local receiver). */
export function validEndpoint(url) {
  try { const u = new URL(String(url ?? '').trim()); return u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname)); } catch { return false; }
}

/** The plain-words text of what is sent (shown in the setting; the test checks that it names the real fields). */
export const WHAT_IS_SENT = 'Only the turns that failed (not understood and then rephrased, disliked, undone at once, or corrected next), one record each: the message, the language, the tab, how I read it, my reply, what changed, and what you said you expected. No other history, no events, no identity unless you type a name below. Nothing is sent while this switch is off.';

/**
 * The sender. `settings()` returns { sendFailures, sendFailuresUrl, sendFailuresName }; `fetchFn` is injected (tests); `storage` keeps the ids already sent.
 * Nothing is sent, and no request is made, unless `sendFailures === true` and the endpoint is valid. Browser-safe.
 */
export function createFailureSender({ settings, records, events = () => null, fetchFn = (...a) => globalThis.fetch?.(...a), storage = globalThis.localStorage, build = null, now = () => Date.now(), key = 'psys2.webchat.failures.sent', onResult = () => {} } = {}) {
  let sent = new Set();
  try { const v = JSON.parse(storage?.getItem(key) ?? '[]'); if (Array.isArray(v)) sent = new Set(v); } catch { sent = new Set(); }
  const save = () => { try { storage?.setItem(key, JSON.stringify([...sent].slice(-5000))); } catch { /* storage unavailable */ } };
  const enabled = () => settings().sendFailures === true && validEndpoint(settings().sendFailuresUrl);
  const batch = () => buildBatch(records(), { events: events(), sentIds: sent, identity: settings().sendFailuresName ?? '', build, now: now() });
  let busy = false, timer = 0, last = null;
  async function sendNow() {
    if (settings().sendFailures !== true) return { sent: 0, reason: 'off' };
    if (!validEndpoint(settings().sendFailuresUrl)) return { sent: 0, reason: 'bad-endpoint' };
    if (busy) return { sent: 0, reason: 'busy' };
    const b = batch();
    if (!b.count) return { sent: 0, reason: 'nothing' };
    busy = true;
    try {
      const res = await fetchFn(String(settings().sendFailuresUrl).trim(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), keepalive: false, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' });
      if (!res || res.ok === false) throw new Error(`HTTP ${res?.status ?? '?'}`);
      for (const f of b.failures) sent.add(f.id);
      save(); last = { at: new Date(now()).toISOString(), count: b.count, ok: true };
    } catch (e) { last = { at: new Date(now()).toISOString(), count: 0, ok: false, error: String(e?.message ?? e) }; }
    finally { busy = false; }
    onResult(last);
    return last.ok ? { sent: last.count, reason: 'ok' } : { sent: 0, reason: 'failed', error: last.error };
  }
  return {
    enabled, preview: batch, sendNow, pending: () => batch().count, sentCount: () => sent.size, get last() { return last; },
    /** Periodic batches: only when the switch is on (checked at every tick, so turning it off stops them at once). */
    start(everyMs = 600000) { clearInterval(timer); timer = setInterval(() => { if (enabled()) sendNow(); }, everyMs); return () => clearInterval(timer); },
    stop() { clearInterval(timer); },
  };
}
