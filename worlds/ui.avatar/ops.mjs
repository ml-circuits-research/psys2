// SPDX-License-Identifier: AGPL-3.0-only
// The ui.avatar world's session seed. Every avatar command runs on its SOP area (worlds/ui.avatar/area.sop,
// sop-avatar.mjs); this module only gives the session an empty area state to fill.
export { emptyAvatarState as initialState } from './sop-avatar.mjs';
