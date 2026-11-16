// SPDX-License-Identifier: AGPL-3.0-only
// THE AVATAR POPUP'S ROUTE (spec 28 section 21; questions.md Q96). Everything about the popup's turns is here and behind the flag `avatarPopupThroughDoor` (flags.mjs):
// the view the host tells while the popup is open, and the world of that view. To retire the old popup path for good: set the flag to true, delete this file and flags.mjs,
// the lines marked POPUP-ROUTE in index.mjs, and the old popup answering (the ambient patterns of worlds/ui.avatar/patterns.sop, the ambient exemption in _send).
export const POPUP_VIEW = 'avatar';

/** The view a turn is read in: the popup's when the flag is ON and the host says the popup is open; otherwise null (the shell's tab alone decides). */
export function popupView(flags, opts) {
  return flags?.avatarPopupThroughDoor === true && opts?.view === POPUP_VIEW ? POPUP_VIEW : null;
}
