// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch (spec 21): what the schema cannot say and other code needs from this world: the engine's lazy loading (the dialog layer awaits `prepare`), its start state
// and `create` (other worlds hand a sentence to the diagram: ctx.request('diagram.create')). The engine itself and its wrapper (engine.mjs: renderer, layouts, the Datalog
// questions, the 24 templates) execute the acts; the generated grammar reads them.
export { prepare, initialState, engineReady, loadEngine, create } from './engine.mjs?v=eeb6f1fa97';
/** Other worlds (Talk's undo of the last turn of a tab) and the tab's undo button call the diagram by its old action names. */
export { undo as diagramUndo, redo as diagramRedo } from './engine.mjs?v=eeb6f1fa97';
