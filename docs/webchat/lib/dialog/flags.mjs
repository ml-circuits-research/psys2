// SPDX-License-Identifier: AGPL-3.0-only
// Feature flags of the dialog engine (data, no logic). A host or a test may override them per engine: createEngine({ options: { flags: { ... } } }).
export const FLAGS = Object.freeze({
  /**
   * Q96 [DECISION] (spec 28 section 21): when ON, a turn typed while the avatar popup is open (the host tells `view: 'avatar'` in the send options) goes through the door as the avatar
   * tab's turns do (tab world ui.avatar); when OFF the popup's turns are the old patterns' of the ambient world. Default OFF: the owner decides.
   */
  avatarPopupThroughDoor: false,
});
