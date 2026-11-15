// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The state the user can see, for the judges (A/B, eval-*): `session.state()` without what is not a change of the user's world.
 *   - `ui.help` only remembers the last unparsed text.
 *   - `kids.arith.holdings` is the matrix reasoner's view of the facts it was told (spec 15: `toState`); `ops` keeps the same facts in wires the state does not show. A
 *     fact that was told shows in the reply in both modes ("OK, Zoe ate 8 marbles."), so comparing the view would call a half-understood turn "wrong" in matrix and
 *     "not understood" in ops (REGRESSION-AB, dlg.kidsA#010). Comparing it is a representation test, not a behaviour test.
 *   - a world whose state is an empty object shows nothing: a world that creates its state lazily on a turn (`undefined` -> `{}`) has not changed what the user sees. The
 *     same at any depth: an empty record created lazily inside a state (`person: null` -> `{ me: {}, lines: [], said: {}, asking: null, paused: false }`, w.person's record of
 *     the session, made on the first turn whatever it says) shows nothing. A value is empty when it is null, false, "", an empty list, or an object whose values are all empty;
 *     a number is never empty (a count of 0 is shown), and a list that had items and has none is a change (the items were shown).
 * The other worlds show the same keys in both modes (art.draw keeps `history` and `future` as empty lists in the matrix view, the undo history being the library's).
 */
const HIDDEN = { 'ui.help': null, 'kids.arith': ['holdings'] };

/** The value as shown: empty records (null, false, "", [], objects of empty values only) are dropped at any depth (undefined); a list keeps its items as they are. */
export function shown(v) {
  if (v === null || v === undefined || v === false || v === '') return undefined;
  if (Array.isArray(v)) return v.length ? v : undefined;
  if (typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) { const y = shown(x); if (y !== undefined) out[k] = y; }
  return Object.keys(out).length ? out : undefined;
}

export function visibleState(st) {
  const out = {};
  for (const [k, v0] of Object.entries(st ?? {})) {
    const v = v0 && typeof v0 === 'object' && !Array.isArray(v0) ? shown(v0) : v0;
    if (v === undefined) continue;
    if (!(k in HIDDEN)) { out[k] = v; continue; }
    const drop = HIDDEN[k];
    if (drop === null || !v || typeof v !== 'object') continue;
    const rest = Object.fromEntries(Object.entries(v).filter(([kk]) => !drop.includes(kk)));
    if (Object.keys(rest).length) out[k] = rest;
  }
  return out;
}
