// SPDX-License-Identifier: AGPL-3.0-only
// INPUT-HISTORY (owner): arrow up / down in the chat box recalls the messages the person sent (typed and spoken), like a shell. The unsent draft is kept and comes back
// at the end of the walk. Up only when the caret is on the first line, down only when it is on the last line (the box is one line today; the rule keeps a multi-line box right).
// Per page session, in memory only (nothing is stored or leaves the device). On touch a tap on a sent message copies it into the box for editing.
// A recalled message that is sent right after a failed turn is a CORRECTION of that turn: the host puts `correction` on the turn for the dialogue module (M1).
// No `process`, no node:* imports: this file runs in the browser only.

/** The line rule: is the caret of `el` (a text input or textarea) on its first / last line, with nothing selected? */
export function caretLine(el) {
  const v = String(el.value ?? ''), a = el.selectionStart ?? v.length, b = el.selectionEnd ?? a;
  if (a !== b) return { first: false, last: false };   // a selection: the arrow keys keep their normal job
  return { first: !v.slice(0, a).includes('\n'), last: !v.slice(a).includes('\n') };
}

export function createInputHistory(input, { limit = 200 } = {}) {
  const items = [];
  let pos = 0;            // items.length = the draft (not in the history)
  let draft = '';
  let recalled = null;    // { text } while the box holds a recalled message, until it is sent
  let lastFailed = false; // the turn before the next send did not go well
  let lastText = '';

  const show = (text) => { input.value = text; try { input.setSelectionRange(text.length, text.length); } catch { /* not a text field */ } input.dispatchEvent(new Event('input', { bubbles: true })); };

  function up() {
    if (!items.length || pos === 0) return false;
    if (pos === items.length) draft = input.value;
    pos -= 1; recalled = { text: items[pos] }; show(items[pos]); return true;
  }
  function down() {
    if (pos >= items.length) return false;
    pos += 1;
    if (pos === items.length) { recalled = null; show(draft); } else { recalled = { text: items[pos] }; show(items[pos]); }
    return true;
  }
  function onKeydown(e) {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const { first, last } = caretLine(input);
    if (e.key === 'ArrowUp' && first && up()) e.preventDefault();
    else if (e.key === 'ArrowDown' && last && down()) e.preventDefault();
  }

  return {
    onKeydown,   // the host adds it with its own listener helper (so that destroy removes it)
    /** A message was sent (typed or spoken): it joins the history (a repeat of the last one is not added twice); the walk starts again from the draft. Returns the correction flag for this send. */
    push(text) {
      const t = String(text ?? '').trim();
      if (!t) return null;
      const edited = recalled ? t !== recalled.text : false;
      const correction = lastFailed && recalled !== null && edited ? { of: lastText } : null;   // recalled, edited, and sent right after a failed turn
      if (items.at(-1) !== t) { items.push(t); if (items.length > limit) items.shift(); }
      pos = items.length; draft = ''; recalled = null; lastText = t; lastFailed = false;
      return correction;
    },
    /** The reply to the last message arrived: did the turn fail (not understood, nothing done, an error)? */
    noteOutcome(failed) { lastFailed = !!failed; },
    /** Touch: copy a past message into the box. */
    recallText(text) { const t = String(text ?? ''); if (!t) return false; if (pos === items.length) draft = input.value; recalled = { text: t }; show(t); try { input.focus(); } catch { /* ignore */ } return true; },
    list: () => [...items],
    state: () => ({ pos, draft, recalled: recalled?.text ?? null, lastFailed }),
  };
}

/** Did a reply fail? Any status other than supported, an unparsed clause, or no reply at all. */
export function replyFailed(reply) {
  if (!reply) return true;
  const st = reply.statuses ?? [];
  return !st.length || st.some((s) => s !== 'supported') || (reply.segments ?? []).some((sg) => sg.unparsed);
}
