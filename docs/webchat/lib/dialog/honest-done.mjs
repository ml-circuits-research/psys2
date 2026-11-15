// SPDX-License-Identifier: AGPL-3.0-only
/**
 * HONEST REPLIES (owner 2026-11-15, class C; spec 06 "Replies say what changed"): "done" is never said when nothing changed. Whether something changed is read from the state
 * difference of the turn, not from the world's word: a reply line that only claims success ("Done.", "OK.") while no world's CONTENT changed is replaced by "Nothing changed.".
 * Content = a world's state without its memory of the turn (the last act, the log, revision counters, selections, saved copies, undo stacks): a move that went nowhere still
 * writes the log, and the log is not what the user sees. Browser-safe, no imports.
 */
const MEMORY = /^(?:last\w*|log|prev\w*|saved|selected|selection|focus|advised|counter|history|future|undo|redo|rev|seq|edgeSeq|nextId|order|version|pending|clicked|t|time|ts|at|updated|turn)$/i;
const NOT_CONTENT = /^(?:ui\.help|session\.dialogue|session\.conversation|talk)$/;
/** A bare success claim: the whole line says only that it worked. */
export const BARE_DONE = /^\s*(?:done|ok(?:ay)?|all done|ok,? done|there you go)\s*[.!]?\s*$/i;
export const NOTHING_CHANGED = 'Nothing changed.';

const content = (json) => {
  let v; try { v = JSON.parse(json ?? 'null'); } catch { return json; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  return JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k]) => !MEMORY.test(k))));
};
/** Did any world's content change? `before`: { worldId: JSON text } taken at the start of the turn; `state`: the session state now. */
export function contentChanged(before, state) {
  for (const [id, v] of Object.entries(state ?? {})) {
    if (NOT_CONTENT.test(id)) continue;
    const now = JSON.stringify(v);
    if (now === before?.[id]) continue;
    if (content(now) !== content(before?.[id])) return true;
  }
  return false;
}
