// Speech (ADR-002): Web Speech recognition (push-to-talk, single shot, hands-free) and speechSynthesis output.
// Speech is input/output only; it changes nothing in C2. Missing APIs are reported through `supported`.
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const speechSupport = { recognition: !!Recognition, synthesis: !!synth && typeof SpeechSynthesisUtterance !== 'undefined' };
export const LANG_TAGS = { en: 'en-US', ro: 'ro-RO' };

const sentences = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

export function createSpeech({ getLang, getVoiceName, getRate, onFinal, onInterim, onState, onError }) {
  let rec = null, mode = null /* 'ptt' | 'once' | 'hands-free' */, handsFree = false, speaking = 0, wantRestart = false, restartTimer = 0;

  function emit() { onState?.({ listening: !!rec, speaking: speaking > 0, mode, handsFree }); }

  function start(newMode) {
    if (!Recognition) return false;
    if (rec) return true;
    if (speaking > 0 && newMode === 'hands-free') return true; // resumes when speech ends
    stopSpeaking();
    mode = newMode;
    rec = new Recognition();
    rec.lang = getLang();
    rec.continuous = newMode === 'hands-free';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) onFinal?.(t); } else interim += r[0].transcript;
      }
      onInterim?.(interim);
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        handsFree = false; wantRestart = false;
        onError?.('Microphone access was denied. Allow it in the browser address bar to use speech input.');
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') onError?.(`Speech recognition error: ${ev.error}`);
    };
    rec.onend = () => {
      rec = null; onInterim?.('');
      const m = mode; mode = null;
      emit();
      if (handsFree && m === 'hands-free' && speaking === 0) restartSoon();
    };
    try { rec.start(); } catch (e) { rec = null; onError?.(`Could not start the microphone: ${e.message}`); }
    emit();
    return true;
  }
  function restartSoon() {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (handsFree && !rec && speaking === 0) start('hands-free'); }, 350);
  }
  function stopListening() { clearTimeout(restartTimer); if (rec) { try { rec.stop(); } catch { /* ignore */ } } }

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
          if (speaking === 0 && handsFree) restartSoon();
        };
        u.onend = done; u.onerror = done;
        synth.speak(u);
      }
      emit();
    });
  }
  function stopSpeaking() { if (synth && speaking > 0) { speaking = 0; synth.cancel(); emit(); } }

  return {
    supported: speechSupport,
    start, stopListening,
    listenOnce: () => start('once'),
    pushToTalkStart: () => start('ptt'),
    pushToTalkStop: () => { if (mode === 'ptt') stopListening(); },
    setHandsFree(on) {
      handsFree = !!on;
      if (on) start('hands-free'); else { if (mode === 'hands-free') stopListening(); clearTimeout(restartTimer); }
      emit();
    },
    isListening: () => !!rec,
    speak, stopSpeaking,
    isSpeaking: () => speaking > 0,
    voices: () => synth?.getVoices?.() ?? [],
    onVoicesChanged(fn) { synth?.addEventListener?.('voiceschanged', fn); },
    destroy() { clearTimeout(restartTimer); handsFree = false; if (rec) try { rec.abort(); } catch { /* ignore */ } stopSpeaking(); },
  };
}
