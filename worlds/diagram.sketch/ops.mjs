// SPDX-License-Identifier: AGPL-3.0-only
// The diagram.sketch world's session seed. Every diagram command runs on its SOP area (worlds/diagram.sketch/area.sop,
// sop-diagram.mjs); this module only gives the session an empty area state to fill.
export { emptyDiagramState as initialState } from './sop-diagram.mjs';
