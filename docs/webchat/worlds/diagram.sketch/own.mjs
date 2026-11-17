// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch (spec 21): what the schema cannot say and other code needs from this world: the engine's lazy loading (the dialog layer awaits `prepare`), its start state
// and `create` (other worlds hand a sentence to the diagram: ctx.request('diagram.create')). The engine itself and its wrapper (engine.mjs: renderer, layouts, the Datalog
// questions, the 24 templates) execute the acts; the generated grammar reads them.
export { prepare, initialState, engineReady, loadEngine, create } from './engine.mjs?v=0958c07105';
/** Other worlds (Talk's undo of the last turn of a tab) and the tab's undo button call the diagram by its old action names. */
export { undo as diagramUndo, redo as diagramRedo } from './engine.mjs?v=0958c07105';
import { checkReferents as engineCheck } from './engine.mjs?v=0958c07105';
const ENGINE_OP = { make: 'create', remove: 'delete', change: 'set', place: 'move', connect: 'connect', pick: 'select', copy: 'duplicate' };
/** The read-only referent check the dialog layer calls before an act runs (world-aware veto): a name the diagram does not have is a missing referent, with the offer to add it for a connection. The engine reads the words of the clause (`args.text`). */
export function checkReferents(ctx, { action, args = {} } = {}) {
  const op = ENGINE_OP[String(action ?? '').split('.').pop()];
  return op ? engineCheck(ctx, { action: `diagram.${op}`, args }) : undefined;
}
/**
 * Discourse hook (spec 14 section 9): a request for a diagram of a kind about a topic, or a random one ("make a mind map about bees"): the words the live catalog is asked about before the
 * request runs, { words } (the candidate topics' words; none for a random diagram), or null for any other sentence.
 */
import { parseDiagramRequest, topicCandidates } from '../../lib/knowledge/diagram-world.mjs?v=d56960bb18';
export function diagramGoal(ctx, { args = {} } = {}) {
  const req = parseDiagramRequest(args.text);
  return req ? { words: req.topic ? [...new Set(topicCandidates(req.topic).flatMap((c) => c.split(' ')))] : [] } : null;
}
/** Spec 28 section 14: the tool primitives, the view and the declared search the request door calls (bound by request.sop's std.tool wires; tool.mjs). */
export * from './tool.mjs?v=6a5c4eeb62';
