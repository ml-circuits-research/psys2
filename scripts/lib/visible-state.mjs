// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The state the user can see, for the judges (A/B, eval-*): `session.state()` without what is not a change of the user's world.
 *   - `ui.help` only remembers the last unparsed text.
 *   - `kids.arith.holdings` is the matrix reasoner's view of the facts it was told (spec 15: `toState`); `ops` keeps the same facts in wires the state does not show. A
 *     fact that was told shows in the reply in both modes ("OK, Zoe ate 8 marbles."), so comparing the view would call a half-understood turn "wrong" in matrix and
 *     "not understood" in ops (REGRESSION-AB, dlg.kidsA#010). Comparing it is a representation test, not a behaviour test.
 * The other worlds show the same keys in both modes (art.draw keeps `history` and `future` as empty lists in the matrix view, the undo history being the library's).
 */
const HIDDEN = { 'ui.help': null, 'kids.arith': ['holdings'] };

export function visibleState(st) {
  const out = {};
  for (const [k, v] of Object.entries(st ?? {})) {
    if (!(k in HIDDEN)) { out[k] = v; continue; }
    const drop = HIDDEN[k];
    if (drop === null || !v || typeof v !== 'object') continue;
    const rest = Object.fromEntries(Object.entries(v).filter(([kk]) => !drop.includes(kk)));
    if (Object.keys(rest).length) out[k] = rest;
  }
  return out;
}
