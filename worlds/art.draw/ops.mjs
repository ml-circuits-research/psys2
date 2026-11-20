// SPDX-License-Identifier: AGPL-3.0-only
// The art.draw world's session seed. Every drawing command runs on its SOP area (worlds/art.draw/area.sop,
// sop-drawing.mjs); this module only gives the session an empty area state to fill.
export { emptyDrawingState as initialState } from './sop-drawing.mjs';
