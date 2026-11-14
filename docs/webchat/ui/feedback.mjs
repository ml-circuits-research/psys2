// SPDX-License-Identifier: AGPL-3.0-only
// FB: thumbs up / down under an answer, the inline form of the thumbs-down, and the "Show me the right result" undo.
// A pure UI module: it keeps no log. The host passes callbacks (`onChange`, `onUndo`) and stores the result in the phrase-log record.
import { h } from './util.mjs';
import { FEEDBACK_REASONS } from './phrase-log.mjs';

const dictationSupported = () => !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);

/**
 * @param feedback   the stored feedback object or null ({ vote, reasons, wanted, correction })
 * @param onChange   (patch) -> feedback   the host stores the patch ({ vote } | { reasons } | { wanted }) and returns the new feedback object
 * @param canUndo    () -> boolean         whether "Show me the right result" is offered (the answer is the latest and the turn can be taken back)
 * @param onUndo     () -> void            takes the turn back (the host links the next accepted phrasing as the correction)
 * @param dictation  { lang: () => BCP-47 tag, available: () => boolean }   the optional spoken form of "what did you expect?" (one short phrase, the browser's recognizer; hidden when unsupported, disabled while the main microphone listens)
 * Returns { el, set(feedback, { open }), openForm(), form }.
 */
export function createFeedback({ feedback = null, onChange, canUndo = () => false, onUndo = () => {}, dictation = null, uid = Math.random().toString(36).slice(2, 7) } = {}) {
  let fb = feedback, open = false, undone = false;
  const mk = (vote, glyph, text) => h('button', {
    class: 'p2-fb-btn', type: 'button', 'data-vote': vote, 'aria-pressed': 'false', 'aria-label': text, title: text,
    onclick: () => { if (fb?.vote === vote) { fb = onChange({ vote: null }); open = false; say.textContent = 'Rating removed.'; } else { fb = onChange({ vote }); open = vote === 'down'; say.textContent = vote === 'down' ? 'Noted as not what you wanted. You can say what you expected below the answer.' : 'Noted as a good answer.'; } render(); },
  }, glyph);
  const up = mk('up', '▲', 'Good answer');
  const down = mk('down', '▼', 'Not what I wanted');
  const bar = h('span', { class: 'p2-fb', role: 'group', 'aria-label': 'Rate this answer' }, up, down);
  const form = h('div', { class: 'p2-fb-form', role: 'group', 'aria-label': 'What went wrong?', hidden: true });
  const say = h('span', { class: 'p2-sr-only', role: 'status', 'aria-live': 'polite' });
  const el = h('span', { class: 'p2-fb-wrap' }, bar, say);

  function render() {
    const vote = fb?.vote ?? null;
    up.setAttribute('aria-pressed', String(vote === 'up')); down.setAttribute('aria-pressed', String(vote === 'down'));
    bar.dataset.vote = vote ?? '';
    const wasOpen = !form.hidden;
    form.hidden = !(open && vote === 'down');
    if (form.hidden) { form.replaceChildren(); return; }
    const chips = FEEDBACK_REASONS.map(([k, text]) => {
      const on = (fb.reasons ?? []).includes(k);
      return h('button', {
        class: `p2-fb-chip${on ? ' is-on' : ''}`, type: 'button', 'data-reason': k, 'aria-pressed': String(on),
        onclick: () => { const cur = new Set(fb.reasons ?? []); if (cur.has(k)) cur.delete(k); else cur.add(k); fb = onChange({ reasons: [...cur] }); render(); },
      }, text);
    });
    const id = `p2-fbw-${uid}`;
    const ta = h('textarea', { class: 'p2-fb-wanted', id, rows: '2', maxlength: '500', placeholder: 'What did you expect? (optional)', 'aria-label': 'What did you expect? (optional)' });
    ta.value = fb.wanted ?? '';
    ta.addEventListener('change', () => { fb = onChange({ wanted: ta.value.trim() }); });
    ta.addEventListener('blur', () => { if (ta.value.trim() !== (fb.wanted ?? '')) fb = onChange({ wanted: ta.value.trim() }); });
    const actions = [];
    if (!undone && canUndo()) actions.push(h('button', { class: 'p2-btn-text p2-fb-undo', type: 'button', onclick: () => { undone = true; onUndo(); render(); } }, 'Show me the right result'));
    if (undone) actions.push(h('small', { class: 'p2-fb-note', role: 'status' }, 'Taken back. Do it by hand or say it differently; your next phrasing is saved as the correction.'));
    actions.push(h('button', { class: 'p2-btn-text p2-fb-done', type: 'button', onclick: () => { if (ta.value.trim() !== (fb.wanted ?? '')) fb = onChange({ wanted: ta.value.trim() }); open = false; render(); } }, 'Done'));
    const field = [ta];
    if (dictation && dictationSupported()) {
      let rec = null;
      const mic = h('button', { class: 'p2-btn-text p2-fb-mic', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Say what you expected', title: 'Say what you expected (the browser listens once)' }, 'Speak');
      const stop = () => { try { rec?.stop(); } catch { /* ignore */ } rec = null; mic.setAttribute('aria-pressed', 'false'); mic.textContent = 'Speak'; };
      mic.addEventListener('click', () => {
        if (rec) { stop(); return; }
        if (dictation.available && !dictation.available()) { say.textContent = 'The microphone is in use for the conversation. Turn it off to speak here, or type.'; return; }
        const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
        try {
          rec = new R(); rec.lang = dictation.lang?.() ?? 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
          rec.onresult = (e) => { const t = [...e.results].map((r) => r[0]?.transcript ?? '').join(' ').trim(); if (t) { ta.value = `${ta.value.trim()} ${t}`.trim().slice(0, 500); fb = onChange({ wanted: ta.value.trim() }); } };
          rec.onerror = () => { say.textContent = 'I could not hear you. Type it instead.'; stop(); };
          rec.onend = () => stop();
          rec.start(); mic.setAttribute('aria-pressed', 'true'); mic.textContent = 'Listening… tap to stop'; say.textContent = 'Listening.';
        } catch { rec = null; say.textContent = 'Speech input is not available here. Type it instead.'; }
      });
      field.push(mic);
    }
    form.replaceChildren(h('div', { class: 'p2-fb-chips' }, chips), h('div', { class: 'p2-fb-field' }, ...field), h('div', { class: 'p2-fb-actions' }, actions));
    if (!wasOpen) form.scrollIntoView?.({ block: 'nearest' });
  }
  render();
  return {
    el, form,
    /** Replaces the stored feedback (for example a spoken "that is wrong") and opens the form when asked. */
    set(next, { open: o = false } = {}) { fb = next; open = o && next?.vote === 'down'; render(); if (open) form.querySelector('.p2-fb-chip')?.focus?.(); },
    openForm() { if (fb?.vote === 'down') { open = true; render(); } },
    get feedback() { return fb; },
  };
}
