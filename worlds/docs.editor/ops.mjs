// SPDX-License-Identifier: AGPL-3.0-only
// The docs.editor world's session seed. Every Documents command runs on its SOP area (worlds/docs.editor/area.sop,
// sop-document.mjs); this module only gives the session an empty area state to fill.
export { emptyDocumentArea as initialState } from './sop-document.mjs';
