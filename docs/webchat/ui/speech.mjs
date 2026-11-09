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
export const VOICE_TIMING = { plausibleMs: 700, waitMs: 1800, handsFreeMs: 2500, micStopMs: 300, dryRunMs: 400, restartMs: 150, backoffMaxMs: 5000, maxFailures: 6, quickMs: 500, abortMs: 300, debounceMs: 250, startingMs: 4000 };

const sentences = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const never = (ms) => new Promise((r) => setTimeout(() => r(false), ms));

/**
 * Options: getLang, getVoiceName, getRate, onState, onError, onInterim (text heard so far)
 *   onSend({ text, how, waitMs })  a spoken message is ready; `how` is final | pause-plausible | pause-timeout | mic-stop. The older `onFinal(text)` still works.
 *   isBusy()                       true while a turn runs: the text is held (onHold) and sent by `turnEnded()` (one message at a time).
 *   plausible(text)                async dry run: do the rules read the whole text completely? (no effects; bounded by timing.dryRunMs)
 *   onStopCommand(text)            the utterance was a stop-microphone command (isStopMicCommand): it is not sent as a message; the host switches the microphone off.
 *   onHold(text), onCancel(text), onPending({ active, ms, phase })   field text, kept text, countdown ring.
 *   timing                         overrides of VOICE_TIMING.
 */
export function createSpeech({ getLang, getVoiceName, getRate, onFinal, onSend, onInterim, onState, onError, onHold, onCancel, onPending, onStopCommand, isBusy, plausible, timing, now = () => Date.now() }) {
  const T = { ...VOICE_TIMING, ...(timing ?? {}) };
  let rec = null, mode = null /* 'ptt' | 'once' | 'hands-free' */, handsFree = false, speaking = 0, wantRestart = false, restartTimer = 0;
  // conversation mode keeps the recognizer alive: failures since the last result drive the backoff; `paused` is the visible give-up state
  let failures = 0, startedAt = 0, gotResult = false, lastErr = '', paused = null;
  // MIC2: the visible state flips on the click (optimistic); `starting` lasts until the recognizer's onstart, `stopping` until its onend (abort after abortMs); clicks within debounceMs of a flip are ignored
  let starting = false, stopping = false, abortTimer = 0, startTimer = 0, lastFlip = 0;
  // end-of-turn detector: the interim text of the current utterance, when it last changed, the timers, a token that invalidates stale async decisions
  let text = '', lastChange = 0, timer = 0, stopTimer = 0, token = 0, held = null, sentNorm = '', sentAt = 0;   // sentNorm: the text just sent, kept for a short time (a late final may repeat it even after a restart)

  const emit = () => onState?.({ listening: !!rec && !stopping, starting: starting && !!rec && !stopping, stopping, speaking: speaking > 0, mode, handsFree, paused, pending: !!(timer || stopTimer) });
  const ring = (active, ms, phase) => { onPending?.({ active, ms, phase }); emit(); };
  function clearTimers() { clearTimeout(timer); clearTimeout(stopTimer); timer = 0; stopTimer = 0; token++; }
  function reset() { clearTimers(); text = ''; ring(false, 0, null); }
  const sendNow = (m) => (onSend ?? ((x) => onFinal?.(x.text)))(m);

  /** One send per utterance. Returns false when the text is empty or only repeats what was just sent. */
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
    const waitMs = lastChange ? Math.max(0, now() - lastChange) : 0;
    if (isBusy?.()) {   // one message at a time: the spoken text waits in the field
      held = { text: held ? `${held.text} ${t}` : t, how, waitMs };
      onHold?.(held.text);
      return true;
    }
    sentNorm = n; sentAt = Date.now();
    sendNow({ text: t, how, waitMs });
    return true;
  }
  const restartRec = () => { if (rec && mode === 'hands-free') { wantRestart = true; try { rec.abort(); } catch { /* ignore */ } } };
  function flush(how) {
    const t = text;
    reset();
    const sent = deliver(t, how);
    if (sent) {   // the utterance is over: hands-free starts a fresh one at once (no dead zone, no merged text); a single-shot recognizer is done
      if (mode === 'hands-free') restartRec(); else if (rec) { try { rec.abort(); } catch { /* ignore */ } }
    }
    return sent;
  }
  /** A stop-microphone command is handled here, never sent: the text and the timers are dropped and the host is told. */
  function tryStop(t) {
    if (!onStopCommand || !isStopMicCommand(t)) return false;
    clearTimers(); text = ''; ring(false, 0, null);
    onInterim?.('');
    onStopCommand(String(t).trim());
    return true;
  }
  async function decide(my) {
    if (my !== token || !text) return;
    if (tryStop(text)) return;
    const t = text, cancel = splitCancel(t);
    if (cancel && !cancel.rest && held) { cancelPending(); return; }
    let ok = false;
    const read = async (x) => !endsOpen(x) && (!plausible || !!(await Promise.race([plausible(x), never(T.dryRunMs)])));
    try {
      if (cancel?.rest && !isBusy?.() && await read(cancel.rest)) { if (my === token) cancelPending(cancel.rest); return; }
      ok = !isBusy?.() && await read(t);
    } catch { ok = false; }
    if (my !== token || !text) return;
    if (ok) { timer = 0; flush('pause-plausible'); return; }
    const total = handsFree ? T.handsFreeMs : T.waitMs;
    const left = Math.max(0, total - (now() - lastChange));
    ring(true, left, 'timeout');
    timer = setTimeout(() => { timer = 0; if (my === token && text) flush('pause-timeout'); }, left);
  }
  function schedule() {
    clearTimeout(timer); const my = ++token;
    ring(true, T.plausibleMs, 'plausible');
    timer = setTimeout(() => { timer = 0; decide(my); }, T.plausibleMs);
  }
  /** Typing, tapping the field, "stop": the text stays in the field for editing and nothing is sent. `keep` replaces the heard text (a trailing cancel word removed). */
  function cancelPending(keep) {
    const kept = keep ?? held?.text ?? text;
    const had = !!(text || held || timer);
    held = null; reset();
    if (rec) { if (mode === 'hands-free') wantRestart = true; try { rec.abort(); } catch { /* ignore */ } }
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

  function start(newMode, { barge = false } = {}) {
    if (!Recognition) return false;
    if (rec && stopping) { const old = rec; rec = null; stopping = false; clearTimeout(abortTimer); try { old.abort(); } catch { /* ignore */ } }   // a recognizer that is still ending must not block the next start
    if (rec) return true;
    if (speaking > 0 && newMode === 'hands-free' && !barge) return true; // resumes when speech ends
    stopSpeaking();
    mode = newMode;
    text = '';
    startedAt = Date.now(); gotResult = false; lastErr = '';
    rec = new Recognition();
    const my = rec;
    starting = true; stopping = false; clearTimeout(startTimer);
    startTimer = setTimeout(() => { if (rec === my && starting) { starting = false; emit(); } }, T.startingMs);
    rec.onstart = () => { if (rec !== my) return; starting = false; clearTimeout(startTimer); emit(); };
    rec.lang = getLang();
    rec.continuous = newMode === 'hands-free';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      if (rec !== my) return;
      if (starting) { starting = false; clearTimeout(startTimer); }
      let interim = '', fin = '';
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) interim += r[0].transcript;
        else if (i >= ev.resultIndex) fin += (fin ? ' ' : '') + r[0].transcript.trim();
      }
      if (fin.trim()) {   // the browser decided: send at once (deduplicated against an earlier timer send)
        gotResult = true; failures = 0; paused = null;
        if (tryStop(fin)) return;
        const c = splitCancel(fin);
        if (c && !c.rest && (held || text)) { cancelPending(); return; }
        const had = text; clearTimers(); text = '';
        if (!deliver(fin, 'final') && had) onInterim?.('');
        reset();
        return;
      }
      interim = interim.trim();
      if (interim) { gotResult = true; failures = 0; if (paused) { paused = null; emit(); } }
      if (interim === text) return;
      text = interim; lastChange = now();
      onInterim?.(text);
      if (text) schedule(); else reset();
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        handsFree = false; wantRestart = false;
        onError?.('Microphone access was denied. Allow it in the browser address bar to use speech input.');
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        lastErr = ev.error;
        if (!(handsFree && mode === 'hands-free')) onError?.(`Speech recognition error: ${ev.error}`);   // conversation mode retries and reports only when it gives up
      }
    };
    rec.onend = () => {
      if (rec !== my) return;
      rec = null; starting = false; stopping = false; clearTimeout(abortTimer); clearTimeout(startTimer);
      const m = mode; mode = null;
      if (text && !stopTimer) { lastChange ||= now(); flush('mic-stop'); }   // the recognizer ended on interim text without a final: send what was heard
      else if (!text && !held) onInterim?.('');
      emit();
      const again = wantRestart; wantRestart = false;
      if (!(handsFree && m === 'hands-free')) return;
      const failed = !!lastErr || (!gotResult && !again && Date.now() - startedAt < T.quickMs);
      if (failed) failures++; else failures = 0;
      if (failures >= T.maxFailures) {   // never give up silently: a visible paused state with the reason; a tap resumes
        paused = { reason: lastErr || 'the recognizer stops right after starting' };
        emit();
        onError?.(`Microphone paused — tap to resume (${paused.reason}).`);
        return;
      }
      if (speaking === 0) restartSoon(failures ? Math.min(T.restartMs * 2 ** failures, T.backoffMaxMs) : again ? 0 : T.restartMs);
    };
    try { rec.start(); } catch (e) { rec = null; starting = false; onError?.(`Could not start the microphone: ${e.message}`); }
    emit();
    return true;
  }
  function restartSoon(ms = 0) {
    clearTimeout(restartTimer);
    const go = () => { if (handsFree && !rec && speaking === 0 && !paused) start('hands-free'); };
    if (ms <= 0) go(); else restartTimer = setTimeout(go, ms);
  }
  function stopListening() {
    clearTimeout(restartTimer);
    if (!rec) return;
    if (text && !stopTimer) {   // mic stop: send what was heard unless a final arrives within micStopMs
      clearTimeout(timer); timer = 0; const my = ++token;
      stopTimer = setTimeout(() => { stopTimer = 0; if (my === token && text) flush('mic-stop'); }, T.micStopMs);
      ring(true, T.micStopMs, 'mic-stop');
    }
    const my = rec;
    try { rec.stop(); } catch { /* ignore */ }
    stopping = true; clearTimeout(abortTimer);
    abortTimer = setTimeout(() => { if (rec === my && stopping) { try { my.abort(); } catch { /* ignore */ } } }, T.abortMs);   // Chrome's onend after stop() can take seconds: abort() ends it now
    emit();
  }
  const snapshot = () => ({ on: handsFree, rec: !!rec, starting: starting && !!rec, stopping, speaking: speaking > 0, paused: !!paused });
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
    else if (handsFree && speaking > 0) { stopSpeaking(); start('hands-free', { barge: true }); action = 'barge-in'; }
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
    try { rec.abort(); } catch { /* ignore */ }
    return true;
  }

  function pickVoice(lang) {
    const voices = synth?.getVoices?.() ?? [];
    const wanted = getVoiceName?.();
    return (wanted && voices.find((v) => v.name === wanted)) || voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
  }
  function speak(text, { lang } = {}) {
    if (!speechSupport.synthesis || !String(text).trim()) return Promise.resolve(false);
    // recognition must not hear the speaker
    if (rec) { wantRestart = handsFree; try { rec.abort(); } catch { /* ignore */ } }
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
          if (speaking === 0 && handsFree) restartSoon(0);
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
      handsFree = !!on; paused = null; failures = 0;
      if (on) start('hands-free', { barge }); else { if (mode === 'hands-free') stopListening(); clearTimeout(restartTimer); }
      emit();
    },
    resume() { if (!handsFree) return false; paused = null; failures = 0; clearTimeout(restartTimer); if (!rec) start('hands-free'); emit(); return true; },
    isPaused: () => !!paused,
    isListening: () => !!rec,
    speak, stopSpeaking,
    isSpeaking: () => speaking > 0,
    voices: () => synth?.getVoices?.() ?? [],
    onVoicesChanged(fn) { synth?.addEventListener?.('voiceschanged', fn); },
    destroy() { clearTimeout(restartTimer); clearTimeout(abortTimer); clearTimeout(startTimer); clearTimers(); handsFree = false; if (rec) try { rec.abort(); } catch { /* ignore */ } stopSpeaking(); },
  };
  return api;
}
