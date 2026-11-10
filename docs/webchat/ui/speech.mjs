// SPDX-License-Identifier: AGPL-3.0-only
// Speech (ADR-002): Web Speech recognition (push-to-talk, single shot, hands-free) and speechSynthesis output.
// Speech is input/output only; it changes nothing in C2. Missing APIs are reported through `supported`.
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const speechSupport = { recognition: !!Recognition, synthesis: !!synth && typeof SpeechSynthesisUtterance !== 'undefined' };
export const LANG_TAGS = { en: 'en-US', ro: 'ro-RO' };

/** Words after which a sentence is clearly not finished (connectors and prepositions, English and Romanian). */
const OPEN_ENDINGS = new Set(['and', 'then', 'to', 'with', 'or', 'but', 'a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'from', 'by', 'next', 'also', 'plus', 'into', 'onto', 'near', 'behind', 'under', 'over', 'between', 'than', 'that', 'which', 'if', 'because', 'while', 'so',
  'și', 'si', 'apoi', 'la', 'cu', 'pe', 'sau', 'dar', 'un', 'o', 'de', 'din', 'în', 'pentru', 'lângă', 'langa', 'după', 'dupa', 'sub', 'peste', 'între', 'intre', 'că', 'ca', 'care', 'dacă', 'daca', 'iar', 'ci', 'spre', 'către', 'catre', 'prin']);
const fold = (t) => norm(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-]+/g, ' ');
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
/** Word match tolerant to recognizer typos: exact, or a small edit distance for longer words. */
const near = (w, list) => list.some((x) => w === x || (x.length >= 5 && w.length >= 4 && lev(w, x) <= (x.length >= 7 ? 2 : 1)));
const STOP_VERBS = ['stop', 'pause', 'pauza', 'close', 'end', 'quit', 'disable', 'mute', 'kill', 'shut', 'opreste', 'inchide', 'stinge', 'termina', 'dezactiveaza', 'gata'];
const MIC_NOUNS = ['mic', 'mike', 'microphone', 'microfon', 'microfonul', 'listening', 'recording', 'ascultarea', 'asculta', 'ascultare', 'ascultatul'];
const STOP_FILLER = new Set(['the', 'my', 'your', 'a', 'please', 'now', 'ok', 'okay', 'hey', 'te', 'rog', 'va', 'acum', 'cu', 'pls', 'turn', 'switch', 'put', 'let', 's', 'us', 'you', 'can', 'could', 'will', 'would', 'to', 'it', 'is', 'will', 'be', 'that']);
/**
 * True when the whole utterance asks to switch the microphone off (English or Romanian, tolerant to recognizer typos):
 * "stop microphone", "stop the mic", "mic off", "turn off the microphone", "stop listening", "that's all", "oprește microfonul", "gata cu microfonul", "nu mai asculta".
 */
export function isStopMicCommand(text) {
  const w = fold(text).split(' ').filter(Boolean);
  if (!w.length || w.length > 7) return false;
  const j = w.join(' ');
  if (/^(that s all|thats all|that is all|that will be all|that s it for now|that s all for now|thats all for now|that is all for now|asta e tot|atat e tot|gata atat|mute|go to sleep|pune pe mute|taci din ascultat|gata cu ascultatul|microfon oprit|microfonul oprit)$/.test(j)) return true;
  if (/^(mute|pause|stop) (the |my )?(mic|mike|microphone|listening)$/.test(j) || /^(pause|pauza) (ascultarea|microfonul)$/.test(j)) return true;
  if (w.length >= 3 && w[0] === 'nu' && w[1] === 'mai' && near(w[2], ['asculta', 'inregistra'])) return w.length === 3;
  const core = w.filter((x) => !STOP_FILLER.has(x));
  if (!core.length || core.length > 3) return false;
  const noun = core.some((x) => near(x, MIC_NOUNS));
  if (!noun) return false;
  const verb = core.some((x) => near(x, STOP_VERBS) || x === 'off' || x === 'oprit' || x === 'oprire' || near(x, ['opreste']));
  const micOff = core.some((x) => near(x, ['mic', 'mike', 'microphone', 'microfon', 'microfonul'])) && core.some((x) => x === 'off' || x === 'oprit');
  return verb || micOff;
}
/** Words after which a command is clearly not finished: command verbs ("play", "draw a"), determiners and numbers ("add 3"). EOT2: they wait the long pause. */
const OPEN_VERBS = new Set(['play', 'draw', 'add', 'make', 'open', 'show', 'create', 'set', 'delete', 'remove', 'put', 'move', 'change', 'write', 'start', 'give', 'tell', 'find', 'search', 'call', 'name', 'rename', 'select', 'insert', 'append', 'turn', 'switch', 'go', 'take', 'bring', 'place', 'paint', 'color', 'colour', 'fill', 'rotate', 'resize', 'increase', 'decrease', 'sing',
  'cântă', 'canta', 'redă', 'reda', 'desenează', 'deseneaza', 'adaugă', 'adauga', 'fă', 'fa', 'deschide', 'arată', 'arata', 'creează', 'creeaza', 'pune', 'mută', 'muta', 'șterge', 'sterge', 'schimbă', 'schimba', 'scrie', 'caută', 'cauta', 'dă', 'spune', 'numește', 'numeste', 'selectează', 'selecteaza', 'inserează', 'insereaza']);
const OPEN_DETERMINERS = new Set(['this', 'these', 'those', 'some', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'another', 'every', 'each', 'any', 'acest', 'această', 'aceasta', 'acești', 'niște', 'nişte', 'nişte', 'meu', 'mea', 'tău', 'tau']);
const NUMBER_WORDS = new Set(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'hundred', 'zece', 'unu', 'doi', 'două', 'doua', 'trei', 'patru', 'cinci', 'șase', 'sase', 'șapte', 'sapte', 'opt', 'nouă', 'noua', 'douăzeci', 'sută', 'suta']);
const isNumberWord = (w) => /^\d+([.,]\d+)?$/.test(w) || NUMBER_WORDS.has(w);
export const CANCEL_WORDS = ['stop', 'cancel', 'anulează', 'anuleaza'];
const norm = (t) => String(t ?? '').toLowerCase().replace(/[.,!?;:"“”'’]+/g, ' ').replace(/\s+/g, ' ').trim();
/** True when the text ends in a connector or a preposition (the speaker is clearly going on). */
export function endsOpen(text) {
  const w = norm(text).split(' ').filter(Boolean);
  if (w.length === 0) return true;
  const last = w[w.length - 1];
  if (OPEN_ENDINGS.has(last) || /[,:;]\s*$/.test(String(text).trim())) return true;
  if (OPEN_VERBS.has(last) || OPEN_DETERMINERS.has(last)) return true;   // "play", "draw a", "add my"
  return isNumberWord(last) && w.length > 1;   // "add 3" goes on; a lone number is a complete answer
}
/** "draw a red house cancel" -> { rest: "draw a red house", word: "cancel" }; the whole text being the word gives rest "". Otherwise null. */
export function splitCancel(text) {
  const w = norm(text).split(' ').filter(Boolean);
  const last = w[w.length - 1];
  if (!last || !CANCEL_WORDS.includes(last)) return null;
  return { rest: w.slice(0, -1).join(' '), word: last };
}
/** Pauses of the end-of-turn detector (ms): plausible sentence, not plausible yet, not plausible in hands-free, after the mic was stopped; the dry run's own deadline. */
export const VOICE_TIMING = { plausibleMs: 700, waitMs: 1800, handsFreeMs: 2500, micStopMs: 300, dryRunMs: 400, restartMs: 150, backoffMaxMs: 5000, maxFailures: 6, quickMs: 500, abortMs: 300, debounceMs: 250, startingMs: 4000,
  finalSettleMs: 700, dupMs: 10000, dupDist: 0.2, rateMs: 2000, fragMax: 4, fragWindowMs: 10000, restartCap: 30, restartWindowMs: 60000, maxWords: 25, slowDryStrikes: 2 };

/** Folded (no diacritics) one-word fragments: articles, pronouns, prepositions, fillers, and words the recogniser cuts out of a longer phrase. */
export const FRAGMENT_WORDS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'he', 'she', 'we', 'they', 'you', 'i', 'me', 'my', 'is', 'are', 'was', 'be', 'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'so', 'if', 'what', 'who', 'why', 'how', 'when', 'where', 'which', 'there', 'here', 'uh', 'um', 'er', 'ah', 'oh', 'hm', 'hmm', 'mm', 'yeah', 'yes', 'no', 'ok', 'okay', 'yep', 'nope', 'sure',
  'o', 'un', 'nista', 'ce', 'de', 'da', 'nu', 'asta', 'aceasta', 'acesta', 'acela', 'aia', 'eu', 'tu', 'el', 'ea', 'noi', 'voi', 'ei', 'ele', 'ma', 'te', 'se', 'si', 'sau', 'dar', 'ca', 'cu', 'la', 'pe', 'din', 'in', 'pentru', 'fi', 'e', 'este', 'sunt', 'am', 'ai', 'au', 'face', 'fac', 'faci', 'mama', 'tata', 'bine', 'hai', 'pai', 'aha', 'uite', 'cum', 'cand', 'unde', 'care', 'cine', 'mai', 'tot', 'foarte', 'scuze', 'enervant', 'mare']);
/** One-word commands that are never fragments. */
export const KNOWN_ONE_WORD = new Set(['stop', 'undo', 'redo', 'help', 'next', 'back', 'again', 'cancel', 'reset', 'clear', 'pause', 'resume', 'ajutor', 'anuleaza', 'inapoi', 'urmatorul', 'opreste', 'refa', 'sterge']);
/** True for a one- or two-word voice message that is only fragment words (see FRAGMENT_WORDS). `allowShort(text)` says the word answers an open question or a game move. */
export function isFragment(text, { allowShort } = {}) {
  const w = fold(text).split(' ').filter(Boolean);
  if (w.length < 1 || w.length > 2) return false;
  if (w.some((x) => KNOWN_ONE_WORD.has(x))) return false;
  if (!w.every((x) => FRAGMENT_WORDS.has(x) || x.length <= 2)) return false;   // one or two words, all of them articles, pronouns, fillers ("o ce", "de asta")
  return !allowShort?.(text);
}
/** Android returns growing prefixes as separate finals. `next` replaces `prev` when it extends, contains or repeats it (or is a piece of it); otherwise it is appended. */
export function mergeFinal(prev, next) {
  const a = String(prev ?? '').trim(), b = String(next ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  const na = norm(a), nb = norm(b);
  if (na === nb || na.startsWith(nb) || (na.endsWith(nb) && (nb.includes(' ') || nb.length >= 4))) return a.length >= b.length ? a : b;   // a repeat or a piece of what is pending
  if (nb.startsWith(na) || nb.includes(na)) return b;   // an extension
  return `${a} ${b}`;
}
/** Normalised edit distance of two normalised texts (0 equal ... 1 different). */
export const editRatio = (a, b) => (a === b ? 0 : lev(a, b) / Math.max(a.length, b.length, 1));
/** A voice message that equals or nearly equals an earlier one (`m`), or is a prefix or suffix of it. Both normalised. */
export const isNearDuplicate = (n, m, dist = 0.2) => !!n && (n === m || m.startsWith(n) || m.endsWith(n) || editRatio(n, m) <= dist);
/** A few milliseconds of fixed work: a slow device (or a CPU throttle) measures several times slower than a desktop. */
export function measureSpeed() {
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = clock();
  let x = 0;
  for (let i = 1; i < 2.5e6; i++) x += Math.sqrt(i) % 3;
  return { ms: clock() - t0, x };
}

/**
 * One microphone for all tabs of the demo (FREEZE): Chrome serves recognition from one browser-level service, so two tabs that listen abort each other for ever.
 * navigator.locks decides who listens (steal on an explicit take-over); a BroadcastChannel tells the old owner it lost the microphone. Without navigator.locks the channel alone decides.
 */
export function createMicLock({ name = 'psys2-mic', onLost, wait = 120 } = {}) {
  const id = Math.random().toString(36).slice(2);
  let ch = null, owned = false, releaseLock = null;
  const waiters = new Set();
  try { ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null; ch?.unref?.(); } catch { ch = null; }
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const drop = () => { owned = false; const r = releaseLock; releaseLock = null; try { r?.(); } catch { /* ignore */ } };
  if (ch) ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === id) return;
    if (m.type === 'ping' && owned) ch.postMessage({ type: 'owner', from: id });
    else if (m.type === 'owner') for (const w of [...waiters]) w();
    else if (m.type === 'takeover' && owned) { drop(); onLost?.(); }
  };
  const hold = (opts) => new Promise((resolve) => {
    let settled = false, granted = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    // a stolen lock rejects the request: the old owner learns it lost the microphone even when the channel message is late (a slow device)
    Promise.resolve(locks.request(name, opts, (l) => { if (!l) { done(false); return undefined; } granted = true; return new Promise((r) => { releaseLock = r; done(true); }); })).catch(() => { done(false); if (granted && owned) { owned = false; releaseLock = null; onLost?.(); } });
  });
  return {
    owned: () => owned,
    async acquire() {
      if (owned) return true;
      if (locks?.request) { owned = await hold({ ifAvailable: true }); return owned; }
      if (!ch) { owned = true; return true; }
      const other = await new Promise((resolve) => { const w = () => { clearTimeout(t); waiters.delete(w); resolve(true); }; const t = setTimeout(() => { waiters.delete(w); resolve(false); }, wait); waiters.add(w); ch.postMessage({ type: 'ping', from: id }); });
      owned = !other;
      return owned;
    },
    /** Explicit take-over (the person clicked "use it here"): the old owner is told to stop. */
    async takeOver() {
      ch?.postMessage({ type: 'takeover', from: id });
      if (locks?.request) owned = await hold({ steal: true }); else { await new Promise((r) => setTimeout(r, 20)); owned = true; }
      return owned;
    },
    release() { drop(); },
    close() { drop(); try { ch?.close(); } catch { /* ignore */ } },
  };
}

const sentences = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const never = (ms) => new Promise((r) => setTimeout(() => r(false), ms));

/**
 * Options: getLang, getVoiceName, getRate, onState, onError, onInterim (text heard so far)
 *   onSend({ text, how, waitMs })  a spoken message is ready; `how` is final | pause-plausible | pause-timeout | mic-stop. The older `onFinal(text)` still works.
 *   isBusy()                       true while a turn runs: the text is held (onHold) and sent by `turnEnded()` (one message at a time).
 *   plausible(text, { signal })    async dry run: do the rules read the whole text completely? (no effects; bounded by timing.dryRunMs; at most one in flight, a newer text aborts the older run)
 *   onStopCommand(text)            the utterance was a stop-microphone command (isStopMicCommand): it is not sent as a message; the host switches the microphone off.
 *   onHold(text), onCancel(text), onPending({ active, ms, phase })   field text, kept text, countdown ring.
 *   onIgnored({ text, reason })    a voice message was dropped: fragment | duplicate | rate.
 *   allowShort(text)               a one-word message answers an open question or a game move: it is not a fragment.
 *   pauseWhileWorking              after a send the microphone pauses until `setWorking(false)` (MOBILE-VOICE: no listening while a request is processed).
 *   cumulative                     the recogniser returns growing prefixes as separate finals (Android): a final waits `finalSettleMs` and replaces the pending text. Also switched on when seen.
 *   slow                           true / () => boolean: a slow device; the per-pause dry run is off (the browser final and the text's plausibility end the turn).
 *   lock                           createMicLock(): only one tab listens (the host builds it with onLost = () => speech.lost()). onBlocked() / onLost() tell the host.
 *   timing                         overrides of VOICE_TIMING.
 */
export function createSpeech({ getLang, getVoiceName, getRate, onFinal, onSend, onInterim, onState, onError, onHold, onCancel, onPending, onStopCommand, onIgnored, onBlocked, onLost, allowShort, isBusy, plausible, timing, lock = null, pauseWhileWorking = false, cumulative = false, slow = false, now = () => Date.now() }) {
  const T = { ...VOICE_TIMING, ...(timing ?? {}) };
  let rec = null, mode = null /* 'ptt' | 'once' | 'hands-free' */, handsFree = false, speaking = 0, wantRestart = false, restartTimer = 0;
  // conversation mode keeps the recognizer alive: failures since the last result drive the backoff; `paused` is the visible give-up state
  let failures = 0, startedAt = 0, gotResult = false, lastErr = '', paused = null;
  // MIC2: the visible state flips on the click (optimistic); `starting` lasts until the recognizer's onstart, `stopping` until its onend (abort after abortMs); clicks within debounceMs of a flip are ignored
  let starting = false, stopping = false, abortTimer = 0, startTimer = 0, lastFlip = 0;
  // end-of-turn detector: the interim text of the current utterance, when it last changed, the timers, a token that invalidates stale async decisions
  let text = '', lastChange = 0, timer = 0, stopTimer = 0, token = 0, held = null, sentNorm = '', sentAt = 0;   // sentNorm: the text just sent, kept for a short time (a late final may repeat it even after a restart)
  // FREEZE: one recognizer object per page; a session id invalidates the events of an older start; our own aborts are not failures
  let recObj = null, sess = 0, ownAbort = false, starts = [];
  // MOBILE-VOICE: the pending final text (cumulative finals), filters, the working pause
  let pendFin = '', cumulativeSeen = false, lastFinalNorm = '', working = false, recent = [], lastSendAt = 0, drops = [];
  // lifecycle and cross-tab lock
  let hidden = false, hiddenResume = false, acquiring = false, blocked = false;
  // dry run: one in flight, a newer text aborts it; a device that misses the deadline twice is slow
  let dryCtl = null, dryBusy = false, dryStrikes = 0;
  const isSlow = () => (typeof slow === 'function' ? !!slow() : !!slow) || dryStrikes >= T.slowDryStrikes;

  const emit = () => onState?.({ listening: !!rec && !stopping, starting: (starting && !!rec && !stopping) || acquiring, stopping, speaking: speaking > 0, mode, handsFree, paused, working: working && handsFree, hidden, blocked, pending: !!(timer || stopTimer) });
  const ring = (active, ms, phase) => { onPending?.({ active, ms, phase }); emit(); };
  const abortRec = (r = rec) => { ownAbort = true; try { r?.abort(); } catch { /* ignore */ } };
  const detach = (r) => { if (!r) return; for (const k of ['onstart', 'onresult', 'onerror', 'onend']) { try { r[k] = null; } catch { /* ignore */ } } };
  function clearTimers() { clearTimeout(timer); clearTimeout(stopTimer); timer = 0; stopTimer = 0; token++; dryCtl?.abort(); }
  function reset() { clearTimers(); text = ''; pendFin = ''; ring(false, 0, null); }
  const sendNow = (m) => (onSend ?? ((x) => onFinal?.(x.text)))(m);
  const canListen = () => handsFree && !paused && !working && !hidden && !blocked && speaking === 0;
  /** Stops the recognizer without a restart and drops what was pending (hidden tab, working, fragments). */
  function stopForPause() {
    clearTimeout(restartTimer); wantRestart = false;
    clearTimers(); text = ''; pendFin = ''; ring(false, 0, null); onInterim?.('');
    if (rec) abortRec();
  }
  function maybeRelease() { if (lock && !rec && !handsFree && !acquiring) lock.release(); }

  function noteDrop(t, reason) {
    onIgnored?.({ text: t, reason });
    if (reason === 'rate') return;   // a message that came too soon is not a recogniser gone wild
    const tn = Date.now();
    drops = drops.filter((x) => tn - x < T.fragWindowMs); drops.push(tn);
    if (drops.length > T.fragMax && handsFree && !paused) {   // the recogniser is going wild: never loop, tell the person
      drops = [];
      paused = { reason: 'I am hearing fragments — tap the mic to continue' };
      stopForPause(); emit();
      onError?.('I am hearing fragments — tap the mic to continue.');
    }
  }
  /** One send per utterance. Returns false when the text is empty, only repeats what was just sent, or is dropped by a filter. */
  function deliver(raw, how) {
    let t = String(raw ?? '').trim();
    if (!t) return false;
    let n = norm(t);
    if (sentNorm && Date.now() - sentAt > 2500) sentNorm = '';
    if (sentNorm && (n === sentNorm || n.startsWith(`${sentNorm} `))) {   // the browser's own final for an utterance the timer already sent
      t = n === sentNorm ? '' : t.split(/\s+/).slice(sentNorm.split(' ').length).join(' ').trim();
      if (!t) return false;
      n = norm(t);
    }
    const tn = Date.now();
    if (isFragment(t, { allowShort })) { noteDrop(t, 'fragment'); return false; }
    recent = recent.filter((r) => tn - r.at <= T.dupMs);
    if (T.dupMs > 0 && recent.some((r) => isNearDuplicate(n, r.n, T.dupDist))) { noteDrop(t, 'duplicate'); return false; }
    if (T.rateMs > 0 && lastSendAt && tn - lastSendAt < T.rateMs) { noteDrop(t, 'rate'); return false; }
    const waitMs = lastChange ? Math.max(0, now() - lastChange) : 0;
    if (isBusy?.()) {   // one message at a time: the spoken text waits in the field
      held = { text: held ? `${held.text} ${t}` : t, how, waitMs };
      onHold?.(held.text);
      return true;
    }
    sentNorm = n; sentAt = tn; lastSendAt = tn; recent.push({ n, at: tn });
    if (pauseWhileWorking) { working = true; emit(); }
    sendNow({ text: t, how, waitMs });
    return true;
  }
  const restartRec = () => { if (rec && mode === 'hands-free') { wantRestart = true; abortRec(); } };
  function flush(how) {
    const t = text;
    reset();
    const sent = deliver(t, how);
    if (mode === 'hands-free') { if (sent || t) { if (working) stopForPause(); else restartRec(); } }   // the utterance is over: a fresh recognition session starts at once (no dead zone, no merged text, a cumulative result list is reset)
    else if (sent && rec) abortRec();   // a single-shot recognizer is done
    return sent;
  }
  /** A stop-microphone command is handled here, never sent: the text and the timers are dropped and the host is told. */
  function tryStop(t) {
    if (!onStopCommand || !isStopMicCommand(t)) return false;
    clearTimers(); text = ''; pendFin = ''; ring(false, 0, null);
    onInterim?.('');
    onStopCommand(String(t).trim());
    return true;
  }
  /** The dry run: one in flight, bounded, cancellable. Slow devices skip it. */
  async function dry(x) {
    if (!plausible || isSlow()) return true;   // slow device: the end of turn is the browser final plus the text's plausibility
    if (x.split(/\s+/).length > T.maxWords) return false;
    if (dryBusy) return false;
    dryCtl?.abort();
    const ctl = dryCtl = new AbortController();
    dryBusy = true;
    let ended = false;
    const run = Promise.resolve().then(() => plausible(x, { signal: ctl.signal })).catch(() => false).finally(() => { ended = true; dryBusy = false; });
    const r = await Promise.race([run, never(T.dryRunMs)]);
    if (!ended) { ctl.abort(); dryStrikes++; return false; }
    dryStrikes = 0;
    return !!r;
  }
  async function decide(my, how = 'pause-plausible') {
    if (my !== token || !text) return;
    if (tryStop(text)) return;
    const t = text, cancel = splitCancel(t);
    if (cancel && !cancel.rest && held) { cancelPending(); return; }
    let ok = false;
    const read = async (x) => !endsOpen(x) && await dry(x);
    try {
      if (cancel?.rest && !isBusy?.() && await read(cancel.rest)) { if (my === token) cancelPending(cancel.rest); return; }
      ok = !isBusy?.() && await read(t);
    } catch { ok = false; }
    if (my !== token || !text) return;
    if (ok) { timer = 0; flush(how); return; }
    const total = handsFree ? T.handsFreeMs : T.waitMs;
    const left = Math.max(0, total - (now() - lastChange));
    ring(true, left, 'timeout');
    timer = setTimeout(() => { timer = 0; if (my === token && text) flush('pause-timeout'); }, left);
  }
  function schedule(ms = T.plausibleMs, how = 'pause-plausible') {
    clearTimeout(timer); dryCtl?.abort(); const my = ++token;
    ring(true, ms, 'plausible');
    timer = setTimeout(() => { timer = 0; decide(my, how); }, ms);
  }
  /** A cumulative final waits a short settle for the next, longer final of the same utterance, then ends like any other pause. */
  function scheduleFinal() {
    clearTimeout(timer); dryCtl?.abort(); const my = ++token;
    ring(true, T.finalSettleMs, 'plausible');
    timer = setTimeout(() => {
      timer = 0;
      if (my !== token || !text) return;
      if (tryStop(text)) return;
      if (!endsOpen(text) && !isBusy?.()) { flush('final'); return; }
      decide(my, 'final');
    }, T.finalSettleMs);
  }
  /** Typing, tapping the field, "stop": the text stays in the field for editing and nothing is sent. `keep` replaces the heard text (a trailing cancel word removed). */
  function cancelPending(keep) {
    const kept = keep ?? held?.text ?? text;
    const had = !!(text || held || timer);
    held = null; reset();
    if (rec) { if (mode === 'hands-free') wantRestart = true; abortRec(); }
    if (had && kept) onCancel?.(kept);
    return had;
  }
  /** The turn ended: a spoken message that waited in the field is sent now. */
  function turnEnded() {
    if (!held) return false;
    const m = held; held = null;
    sentNorm = norm(m.text); sentAt = Date.now();
    sendNow(m);
    return true;
  }
  function getRecognizer(fresh) {
    if (fresh || !recObj) { detach(recObj); recObj = new Recognition(); }
    return recObj;
  }

  function start(newMode, { barge = false } = {}) {
    if (!Recognition) return false;
    if (hidden) { if (newMode === 'hands-free') hiddenResume = true; return true; }   // resumes when the tab is visible again
    let fresh = false;
    if (rec && stopping) { const old = rec; rec = null; stopping = false; clearTimeout(abortTimer); abortRec(old); detach(old); recObj = null; fresh = true; }   // a recognizer that is still ending must not block the next start
    if (rec) return true;
    if (acquiring) return true;
    if (newMode === 'hands-free' && working) { emit(); return true; }   // a request is being processed: listening starts when it is done
    if (speaking > 0 && newMode === 'hands-free' && !barge) return true; // resumes when speech ends
    if (lock && !lock.owned()) {   // FREEZE: only one tab of the demo listens
      acquiring = true; blocked = false; emit();
      lock.acquire().then((ok) => {
        acquiring = false;
        if (newMode === 'hands-free' && !handsFree) { emit(); return; }
        if (ok) start(newMode, { barge });
        else { blocked = true; if (newMode === 'hands-free') handsFree = false; emit(); onBlocked?.(); }
      });
      return true;
    }
    blocked = false;
    stopSpeaking();
    mode = newMode;
    text = ''; pendFin = ''; lastFinalNorm = '';
    startedAt = Date.now(); gotResult = false; lastErr = ''; ownAbort = false;
    rec = getRecognizer(fresh);
    const my = rec, mySess = ++sess;
    const live = () => mySess === sess && rec === my;
    starting = true; stopping = false; clearTimeout(startTimer);
    startTimer = setTimeout(() => { if (live() && starting) { starting = false; emit(); } }, T.startingMs);
    rec.onstart = () => { if (!live()) return; starting = false; clearTimeout(startTimer); emit(); };
    rec.lang = getLang();
    rec.continuous = newMode === 'hands-free';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      if (!live()) return;
      if (starting) { starting = false; clearTimeout(startTimer); }
      let interim = '', fin = '', finals = 0;
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) interim += r[0].transcript;
        else { finals++; if (i >= ev.resultIndex) fin += (fin ? ' ' : '') + r[0].transcript.trim(); }
      }
      if (finals > 1) cumulativeSeen = true;   // the result list keeps earlier finals: Android
      if (fin.trim()) {   // the browser decided
        gotResult = true; failures = 0; paused = null;
        if (tryStop(fin)) return;
        const c = splitCancel(fin);
        if (c && !c.rest && (held || text)) { cancelPending(); return; }
        const nf = norm(fin);
        if (lastFinalNorm && (nf.startsWith(lastFinalNorm) || nf.includes(lastFinalNorm) || lastFinalNorm.includes(nf))) cumulativeSeen = true;   // a final that extends or repeats the previous one: growing prefixes
        lastFinalNorm = nf;
        if (cumulative || cumulativeSeen) {   // one utterance = one message: the new final replaces the pending text, the end of the turn decides
          pendFin = mergeFinal(pendFin, fin);
          text = mergeFinal(text, pendFin); lastChange = now();
          onInterim?.(text);
          scheduleFinal();
          return;
        }
        const had = text; clearTimers(); text = '';   // deduplicated against an earlier timer send
        if (!deliver(fin, 'final') && had) onInterim?.('');
        reset();
        return;
      }
      interim = interim.trim();
      if (interim) { gotResult = true; failures = 0; if (paused) { paused = null; emit(); } }
      if (!interim && pendFin) return;
      const cand = pendFin && interim ? mergeFinal(pendFin, interim) : interim;
      if (cand === text) return;
      text = cand; lastChange = now();
      onInterim?.(text);
      if (text) schedule(); else reset();
    };
    rec.onerror = (ev) => {
      if (!live()) return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        handsFree = false; wantRestart = false;
        onError?.('Microphone access was denied. Allow it in the browser address bar to use speech input.');
      } else if (ev.error === 'aborted') {
        if (!ownAbort) lastErr = 'aborted';   // another tab or the browser took the service: a failure, so the backoff applies
      } else if (ev.error !== 'no-speech') {
        lastErr = ev.error;   // audio-capture and the rest
        if (!(handsFree && mode === 'hands-free')) onError?.(`Speech recognition error: ${ev.error}`);   // conversation mode retries and reports only when it gives up
      }
    };
    rec.onend = () => {
      if (!live()) return;
      rec = null; starting = false; stopping = false; clearTimeout(abortTimer); clearTimeout(startTimer);
      const m = mode; mode = null;
      if (text && !stopTimer) { lastChange ||= now(); flush('mic-stop'); }   // the recognizer ended on interim text without a final: send what was heard
      else if (!text && !held) onInterim?.('');
      emit();
      const again = wantRestart; wantRestart = false;
      if (!(handsFree && m === 'hands-free')) { maybeRelease(); return; }
      if (!gotResult) {   // cap on idle restarts (a session that ended without a single result): 30 a minute, then a visible pause; restarts after a message do not count
        const tn = Date.now();
        starts = starts.filter((x) => tn - x < T.restartWindowMs); starts.push(tn);
        if (starts.length > T.restartCap) {
          starts = [];
          paused = { reason: 'too many restarts in a minute' };
          emit();
          onError?.(`Microphone paused — tap to resume (${paused.reason}).`);
          return;
        }
      }
      const failed = !!lastErr || (!gotResult && !again && Date.now() - startedAt < T.quickMs);
      if (failed) failures++; else failures = 0;
      if (failures >= T.maxFailures) {   // never give up silently: a visible paused state with the reason; a tap resumes
        paused = { reason: lastErr || 'the recognizer stops right after starting' };
        emit();
        onError?.(`Microphone paused — tap to resume (${paused.reason}).`);
        return;
      }
      if (canListen()) restartSoon(failures ? Math.min(T.restartMs * 2 ** failures, T.backoffMaxMs) : again ? 0 : T.restartMs);
    };
    try { rec.start(); } catch (e) { detach(rec); rec = null; recObj = null; starting = false; onError?.(`Could not start the microphone: ${e.message}`); }
    emit();
    return true;
  }
  function restartSoon(ms = 0) {
    clearTimeout(restartTimer);
    const go = () => { if (canListen() && !rec) start('hands-free'); };
    if (ms <= 0) go(); else restartTimer = setTimeout(go, ms);
  }
  function stopListening() {
    clearTimeout(restartTimer);
    if (!rec) { maybeRelease(); return; }
    if (text && !stopTimer) {   // mic stop: send what was heard unless a final arrives within micStopMs
      clearTimeout(timer); timer = 0; const my = ++token;
      stopTimer = setTimeout(() => { stopTimer = 0; if (my === token && text) flush('mic-stop'); }, T.micStopMs);
      ring(true, T.micStopMs, 'mic-stop');
    }
    const my = rec;
    try { rec.stop(); } catch { /* ignore */ }
    stopping = true; clearTimeout(abortTimer);
    abortTimer = setTimeout(() => { if (rec === my && stopping) abortRec(my); }, T.abortMs);   // Chrome's onend after stop() can take seconds: abort() ends it now
    emit();
  }
  const snapshot = () => ({ on: handsFree, rec: !!rec, starting: starting && !!rec, stopping, speaking: speaking > 0, paused: !!paused, working: working && handsFree, blocked });
  /**
   * One click on the mic (MIC2): always acts at once. Returns { action, before, after } for the click log.
   * Paused: resume. Mic on while the answer is read aloud: barge-in (stop the speech, listen now). Mic on: off. One-shot listening: stop. Off: on
   * (`single`: one message only). Clicks within `debounceMs` of the last flip are ignored.
   */
  function toggle({ single = false } = {}) {
    const before = snapshot(), t = Date.now();
    if (t - lastFlip < T.debounceMs) return { action: 'ignored', before, after: before };
    lastFlip = t;
    let action;
    if (paused) { api.resume(); action = 'resume'; }
    else if (handsFree && speaking > 0) { stopSpeaking(); working = false; start('hands-free', { barge: true }); action = 'barge-in'; }
    else if (handsFree) { api.setHandsFree(false); action = 'off'; }
    else if (rec && !stopping) { stopListening(); action = 'stop-once'; }
    else if (single) { start('once'); action = 'once'; }
    else { api.setHandsFree(true, { barge: true }); action = 'on'; }
    return { action, before, after: snapshot() };
  }
  /** The recognition language may have changed (session language, setting): an idle hands-free recognizer restarts with the new language. */
  function refreshLang() {
    if (!rec || rec.lang === getLang() || mode !== 'hands-free' || text) return false;
    wantRestart = true;
    abortRec();
    return true;
  }

  function pickVoice(lang) {
    const voices = synth?.getVoices?.() ?? [];
    const wanted = getVoiceName?.();
    return (wanted && voices.find((v) => v.name === wanted)) || voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
  }
  function speak(text, { lang } = {}) {
    if (!speechSupport.synthesis || !String(text).trim() || hidden) return Promise.resolve(false);
    // recognition must not hear the speaker
    if (rec) { wantRestart = handsFree; abortRec(); }
    const tag = lang ?? getLang();
    return new Promise((resolve) => {
      const parts = sentences(text);
      let left = parts.length;
      for (const part of parts) {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = tag; u.rate = getRate?.() ?? 1;
        const v = pickVoice(tag);
        if (v) u.voice = v;
        speaking++;
        const done = () => {
          speaking = Math.max(0, speaking - 1);
          if (--left === 0) resolve(true);
          emit();
          if (speaking === 0 && canListen()) restartSoon(0);
        };
        u.onend = done; u.onerror = done;
        synth.speak(u);
      }
      emit();
    });
  }
  function stopSpeaking() { if (synth && speaking > 0) { speaking = 0; synth.cancel(); emit(); } }

  const api = {
    supported: speechSupport,
    start, stopListening, toggle, snapshot, cancelPending, turnEnded, refreshLang, hasPending: () => !!(text || held || timer || stopTimer), held: () => held?.text ?? null,
    listenOnce: () => start('once'),
    pushToTalkStart: () => start('ptt'),
    pushToTalkStop: () => { if (mode === 'ptt') stopListening(); },
    setHandsFree(on, { barge = false } = {}) {
      handsFree = !!on; paused = null; failures = 0; blocked = false;
      if (on) { hiddenResume = hidden; start('hands-free', { barge }); }
      else { hiddenResume = false; working = false; if (mode === 'hands-free') stopListening(); clearTimeout(restartTimer); maybeRelease(); }
      emit();
    },
    resume() { if (!handsFree) return false; paused = null; failures = 0; starts = []; drops = []; clearTimeout(restartTimer); if (!rec) start('hands-free'); emit(); return true; },
    /** MOBILE-VOICE: the host is processing a request (turn, effects, spoken answer): the microphone pauses; false resumes it (only if it was on). */
    setWorking(b) {
      b = !!b;
      if (b === working) return;
      working = b;
      if (b) { if (handsFree && rec) { clearTimeout(restartTimer); wantRestart = false; if (!text) abortRec(); } }
      else if (canListen() && !rec) restartSoon(0);
      emit();
    },
    isWorking: () => working,
    /** The person clicked "use it here": the other tab loses the microphone and this one listens. */
    async takeOver() {
      if (!lock) return false;
      const ok = await lock.takeOver();
      blocked = false;
      if (ok) api.setHandsFree(true, { barge: true });
      return ok;
    },
    /** The old owner of the microphone was told to stop (another tab took it over). */
    lost() { handsFree = false; blocked = true; stopForPause(); stopSpeaking(); emit(); maybeRelease(); onLost?.(); },
    /** FREEZE: a hidden tab neither listens nor speaks; visible again, it resumes only if the microphone was on. */
    pageHidden() {
      if (hidden) return;
      hidden = true; hiddenResume = handsFree && !paused;
      stopForPause(); stopSpeaking(); lock?.release(); emit();
    },
    pageVisible() {
      if (!hidden) return;
      hidden = false;
      const again = hiddenResume && handsFree && !paused; hiddenResume = false;
      emit();
      if (again && canListen()) start('hands-free');
    },
    /** pagehide: release everything; nothing resumes by itself. */
    pageHide() { hiddenResume = false; handsFree = false; working = false; stopForPause(); stopSpeaking(); lock?.release(); emit(); },
    isPaused: () => !!paused,
    isListening: () => !!rec,
    speak, stopSpeaking,
    isSpeaking: () => speaking > 0,
    voices: () => synth?.getVoices?.() ?? [],
    onVoicesChanged(fn) { synth?.addEventListener?.('voiceschanged', fn); },
    destroy() { clearTimeout(restartTimer); clearTimeout(abortTimer); clearTimeout(startTimer); clearTimers(); handsFree = false; sess++; if (rec) abortRec(); detach(recObj); stopSpeaking(); lock?.close?.(); },
  };
  return api;
}
