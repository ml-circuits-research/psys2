// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch (pilot, spec 21): what the schema cannot say and other code needs from this world: the engine's lazy loading (the dialog layer awaits `prepare`), its start state
// and `create` (other worlds hand a sentence to the diagram: ctx.request('diagram.create')). The engine itself and its wrapper stay in worlds/diagram.sketch (renderer, layouts,
// the Datalog questions, the 24 templates).
export { prepare, initialState, engineReady, loadEngine, create } from '../../worlds/diagram.sketch/ops.mjs';
