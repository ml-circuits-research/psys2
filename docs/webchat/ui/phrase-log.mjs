// SPDX-License-Identifier: AGPL-3.0-only
// Phrase log (spec 06 "Phrase log"): pure functions that turn what a person typed or said, plus the reply of
// session.send(), into records for training data, and a small localStorage-backed store. Browser-safe, no imports.

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
export function buildRecord({ text, mode = 'typed', language = 'en', tab = null, reply = null, now = Date.now(), id = null, endType = null, waitMs = null }) {
  let segments = [];
  try { segments = segmentOutcomes(reply); } catch { segments = []; }   // a reply with an unexpected shape must never lose the phrase
  let formalizer = null;
  try { const used = reply?.trace?.formalizer?.used; formalizer = (Array.isArray(used) ? used.join('+') : used ? String(used) : null) ?? segments[0]?.strategy ?? null; } catch { formalizer = null; }
  const english = reply?.lang && reply.lang !== 'en' ? (reply.trace?.english ?? null) : null;
  return {
    id: id ?? newId(now), time: new Date(now).toISOString(), text: String(text ?? ''), mode: MODES.includes(mode) ? mode : 'typed',
    source: mode === 'chip' ? 'chip' : 'human', lang: reply?.lang ?? language, english, tab, segments,
    unparsed: segments.some((s) => s.unparsed), formalizer,
    feedback: reply?.feedback ?? reply?.trace?.feedback ?? null,   // 'negative' when the person said the last answer was wrong (spec 11 section 13)
    ...(endType ? { endType, waitMs: waitMs ?? null } : {}),   // VOICE: how a spoken message ended: final | pause-plausible | pause-timeout | mic-stop, and how long the app waited (ms)
  };
}

/** Fills a record written at send time with the outcome of the reply (the phrase is logged before it is answered). */
export function completeRecord(rec, reply, { language = 'en' } = {}) {
  const full = buildRecord({ text: rec.text, mode: rec.mode, language, tab: rec.tab, reply, now: Date.parse(rec.time) || Date.now(), id: rec.id, endType: rec.endType ?? null, waitMs: rec.waitMs ?? null });
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
/** Filters: all | misses (not understood: any segment not supported) | voice. */
export function filterRecords(list, filter = 'all') {
  if (filter === 'misses') return list.filter((r) => r.outcome || r.unparsed || r.segments.some((s) => s.status !== 'supported'));
  if (filter === 'voice') return list.filter((r) => r.mode === 'voice');
  return list;
}
export const summaryStatus = worstStatus;
export const summaryWorlds = (r) => [...new Set(r.segments.map((s) => s.world).filter(Boolean))];

/** Export record, in the spirit of the training records of spec 08. */
export function exportRecord(r) {
  return { text: r.text, lang: r.lang, english: r.english ?? r.text, mode: r.mode, tab: r.tab, worlds: summaryWorlds(r), status: worstStatus(r), time: r.time, ...(r.feedback ? { feedback: r.feedback } : {}), ...(r.endType ? { endType: r.endType, waitMs: r.waitMs ?? null } : {}), ...(r.outcome ? { outcome: r.outcome, stage: r.stage ?? null } : {}) };
}
/** Chips are not human phrasing: excluded unless includeChips. */
export function toJSONL(list, { includeChips = false } = {}) {
  return list.filter((r) => includeChips || r.source !== 'chip').map((r) => JSON.stringify(exportRecord(r))).join('\n') + (list.length ? '\n' : '');
}
export function toText(list, { includeChips = false } = {}) {
  return list.filter((r) => includeChips || r.source !== 'chip').map((r) => r.text.replace(/\s*\n\s*/g, ' ')).join('\n');
}
export const exportFilename = (d = new Date()) => `psys2-phrases-${d.toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`;

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
