// SPDX-License-Identifier: AGPL-3.0-only
// FB: thumbs up / down under an answer, the inline form of the thumbs-down, and the "Show me the right result" undo.
// A pure UI module: it keeps no log. The host passes callbacks (`onChange`, `onUndo`) and stores the result in the phrase-log record.
import { h } from './util.mjs';
import { FEEDBACK_REASONS } from './phrase-log.mjs';

/**
 * @param feedback   the stored feedback object or null ({ vote, reasons, wanted, correction })
 * @param onChange   (patch) -> feedback   the host stores the patch ({ vote } | { reasons } | { wanted }) and returns the new feedback object
 * @param canUndo    () -> boolean         whether "Show me the right result" is offered (the answer is the latest and the turn can be taken back)
 * @param onUndo     () -> void            takes the turn back (the host links the next accepted phrasing as the correction)
 * Returns { el, set(feedback, { open }), openForm(), form }.
 */
export function createFeedback({ feedback = null, onChange, canUndo = () => false, onUndo = () => {}, uid = Math.random().toString(36).slice(2, 7) } = {}) {
  let fb = feedback, open = false, undone = false;
  const mk = (vote, glyph, text) => h('button', {
    class: 'p2-fb-btn', type: 'button', 'data-vote': vote, 'aria-pressed': 'false', 'aria-label': text, title: text,
    onclick: () => { if (fb?.vote === vote) { fb = onChange({ vote: null }); open = false; } else { fb = onChange({ vote }); open = vote === 'down'; } render(); },
  }, glyph);
  const up = mk('up', '▲', 'Good answer');
  const down = mk('down', '▼', 'Not what I wanted');
  const bar = h('span', { class: 'p2-fb', role: 'group', 'aria-label': 'Rate this answer' }, up, down);
  const form = h('div', { class: 'p2-fb-form', role: 'group', 'aria-label': 'What went wrong?', hidden: true });
  const el = h('span', { class: 'p2-fb-wrap' }, bar);

  // bounded: render() only appears as an event-handler callback that rebuilds the panel; it does not call itself synchronously
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
    const ta = h('textarea', { class: 'p2-fb-wanted', id, rows: '2', maxlength: '500', placeholder: 'What did you want? (optional)', 'aria-label': 'What did you want?' });
    ta.value = fb.wanted ?? '';
    ta.addEventListener('change', () => { fb = onChange({ wanted: ta.value.trim() }); });
    ta.addEventListener('blur', () => { if (ta.value.trim() !== (fb.wanted ?? '')) fb = onChange({ wanted: ta.value.trim() }); });
    const actions = [];
    if (!undone && canUndo()) actions.push(h('button', { class: 'p2-btn-text p2-fb-undo', type: 'button', onclick: () => { undone = true; onUndo(); render(); } }, 'Show me the right result'));
    if (undone) actions.push(h('small', { class: 'p2-fb-note', role: 'status' }, 'Taken back. Do it by hand or say it differently; your next phrasing is saved as the correction.'));
    actions.push(h('button', { class: 'p2-btn-text p2-fb-done', type: 'button', onclick: () => { if (ta.value.trim() !== (fb.wanted ?? '')) fb = onChange({ wanted: ta.value.trim() }); open = false; render(); } }, 'Done'));
    form.replaceChildren(h('div', { class: 'p2-fb-chips' }, chips), ta, h('div', { class: 'p2-fb-actions' }, actions));
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
