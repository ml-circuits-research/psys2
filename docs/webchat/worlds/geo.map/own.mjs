// SPDX-License-Identifier: AGPL-3.0-only
// geo.map (spec 21 section 12): what the schema cannot say and other code needs from this world. The operations that are not acts (navigation, comparisons, distances, the questions that are not about
// one attribute), the state, the view declaration of the transfer slice and the host hooks `needs` / `openSlots` (the catalog wires the map reads before an operation runs). The places themselves are
// looked up in the catalog (places.mjs); the view state, the projection and the distances are map.mjs.
import { NEEDS, namesOf } from './places.mjs?v=cf4d58a990';
export { initialState, showPlace, coords, zoom, zoomTo, pan, world, reset, markHere, markSet, layer, locate, here, distance, distanceFrom, compare, compareYN, borderYN, isIn, isCapital, capitalOfWhich, superlative, listOp, count, info, markers, highlights, describe, askPlace, unknown, view, adopt, onObservation, undo as mapUndo, redo as mapRedo } from './map.mjs?v=40f5cacf40';

/** Host hook: the collections of k.geo the operations read synchronously (countries, cities, groups, the other names of countries), loaded before the operation runs. */
export function needs() { return NEEDS; }
/** Host hook: the names a request mentions, looked up in the catalog before the operation (a river, a mountain: features that are not in the collections above). */
export function openSlots(_ctx, { args } = {}) { return namesOf(args); }
