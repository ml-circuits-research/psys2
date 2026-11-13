// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch (pilot, spec 21): the hooks of the schema world. The acts are read by the generated grammar; EXECUTING them is the engine of diagram-vss-demo through its wrapper
// (worlds/diagram.sketch/ops.mjs): the engine reads the sentence the user said (`req.text`, the same way the old cue patterns handed it over) and runs it on its own state.
// The act only says which engine command family the sentence belongs to. `unread`: when no form of the grammar read a sentence in the open Diagram tab, the engine's own
// reader gets it (its legend knows layouts, templates, queries, facts and rules that the act grammar does not have yet: those are the holes the coverage grid lists).
import * as E from '../../worlds/diagram.sketch/ops.mjs';

const by = { make: 'create', remove: 'delete', change: 'set', place: 'move', connect: 'connect', pick: 'select', copy: 'duplicate' };
const run = (fn) => (ctx, r) => {
  const out = fn(ctx, { text: r.text });
  return out && typeof out.then !== 'function' ? out : undefined;
};
const domain = {};
for (const [act, op] of Object.entries(by)) domain[act] = (ctx, r) => run(E[op])(ctx, r);
domain.group = (ctx, r) => run(r.mode === 'apart' ? E.ungroup : E.group)(ctx, r);
domain.ask = (ctx, r) => (r.mode === 'what' || r.mode === 'count' || r.mode === 'where' ? run(E.ask_describe)(ctx, r) : undefined);
domain.undo = (ctx) => E.undo(ctx, {});
domain.redo = (ctx) => E.redo(ctx, {});

export const hooks = {
  domain,
  /** The engine's own reader for a sentence of the open tab that no form read: a string reply, or undefined. */
  unread: (ctx, text) => {
    // a question and a command are the two families (act ask, any other act); the engine's reader decides the rest from the sentence
    const out = (/\?\s*$|^(?:is|are|does|do|did|how|what|which|who|whom|where|can|why|list|show|tell|count)\b/i.test(String(text).trim()) ? E.ask_describe : E.create)(ctx, { text });
    return out && out.status === 'supported' ? (out.value ?? out.note) : undefined;
  },
};
