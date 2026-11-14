// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch (pilot, spec 21): the hooks of the schema world. The acts are read by the generated grammar; EXECUTING them is the engine of diagram-vss-demo through its wrapper
// (worlds/diagram.sketch/engine.mjs): the engine reads the sentence the user said (`req.text`, the same way the old cue patterns handed it over) and runs it on its own state.
// The act only says which engine command family the sentence belongs to. `unread`: when no form of the grammar read a sentence in the open Diagram tab, the engine's own
// reader gets it (its legend knows layouts, templates, queries, facts and rules that the act grammar does not have yet: those are the holes the coverage grid lists).
import * as E from './engine.mjs';
import SOPKit from './engine/logic.mjs';

const by = { make: 'create', remove: 'delete', change: 'set', place: 'move', connect: 'connect', pick: 'select', copy: 'duplicate' };
/** A clause that depends on the one before it ("... and connect A to it", cut at the "and"): the pronoun is the thing the last command made or named (state.last, the engine's own "it"). */
const deref = (ctx, text) => {
  const last = Array.isArray(ctx.state?.last) ? ctx.state.last.filter((x) => typeof x === 'string') : [];
  if (!last.length) return text;
  return String(text).replace(/\b(it|them)\b/gi, (w) => (/^it$/i.test(w) ? last[last.length - 1] : last.join(' and ')));
};
const run = (fn, pron = false) => (ctx, r) => {
  const out = fn(ctx, { text: pron ? deref(ctx, r.text) : r.text });   // the pronoun is the last thing only for a clause that cannot stand alone (connect X to it); "flip it", "fit it" mean what the engine says
  return out && typeof out.then !== 'function' ? out : undefined;
};
const domain = {};
for (const [act, op] of Object.entries(by)) domain[act] = (ctx, r) => run(E[op], act === 'connect')(ctx, r);
// "Place a medium white ellipse named Cloud at 198, 98": the verb of placing, but a thing that is named is a thing that is made
domain.place = (ctx, r) => run(/\b(?:named|called)\b/i.test(String(r.text)) ? E.create : E.move)(ctx, r);
domain.group = (ctx, r) => run(r.mode === 'apart' ? E.ungroup : E.group)(ctx, r);
// every question is the engine's to answer (it reads the sentence: path, extreme, cycle, rules, members ...); only "why" and "what did you do" are the executor's own log
domain.ask = (ctx, r) => (['why', 'last'].includes(r.mode) ? undefined : run(E.ask_describe)(ctx, r));
/** The world's own reader (act `own`): the engine reads the sentence itself, a question or a command. */
domain.own = (ctx, r) => {
  const sh = SHAPED.exec(String(r.text ?? ''));
  if (sh) return E.shapedLike(ctx, { o: sh[1] ?? sh[2] });
  const n = engineNode(String(r.text ?? ''), ctx.state);
  const fn = !n ? null : n.type === 'question' ? E.ask_describe : n.type === 'command' ? E[n.args?.action] : null;   // the family the engine names is the function that runs it (a name or an unknown one is the engine's to refuse)
  const text = String(r.text ?? '').trim();
  return run(typeof fn === 'function' ? fn : /\?\s*$|^(?:is|are|does|do|did|how|what|which|who|whom|where|can|why|list|show|tell|count|any)\b/i.test(text) ? E.ask_describe : E.create)(ctx, r);
};
const engineNode = (text, state) => { try { return (E.read(text, state ?? {})?.nodes ?? []).find((x) => ['command', 'question', 'rule', 'fact'].includes(x.type)) ?? null; } catch { return null; } };
/** The engine reads a verb of a nonsense sentence as a command ("... could trade ..." is a swap); a command whose targets it cannot find in the diagram is not a reading to own. */
const noTarget = (text, state) => { try { return (E.read(text, state ?? {})?.notes ?? []).some((x) => /no target found/.test(x)); } catch { return true; } };
/** What the engine's reader makes of a sentence is a command or question of a family; these families are what the acts and other worlds read as well, and the engine reads them generously ("draw a red house", "what is a comet"). */
const GENEROUS = new Set(['create', 'delete', 'move', 'set', 'group', 'ungroup', 'connect', 'duplicate', 'select', 'list', 'exists', 'count', 'describe', 'undo', 'redo', undefined, null]);
/**
 * DECLINE: the own reader is the diagram's only when its engine names a family for the sentence that the acts do not read themselves (forget, swap, snap, flip, check, path,
 * extreme, cycle, a default rule ...); the engine reads generously, so everything else is left to the forms of the schema and the other worlds. A fact ("Done is red") is the
 * diagram's only when the diagram has shapes (it states something about one of them).
 */
/** Frames only the diagram has: a sentence that names the diagram ("add a star to the diagram") or says what a diagram is shaped like ("shaped like a house", "in the form of a house"): the diagram's whatever tab is open; the drawing board declines them. */
const SIGNAL = /\b(?:rectangles?|boxe?s?|circles?|squares?|diamonds?|ellipses?|triangles?|hexagons?|nodes?|shapes?)\s+(?:called|named)\b|\barrows?\s+(?:from|between|to)\b|\b(?:flow\s?chart|org(?:anisation|anization)?\s+chart|mind\s?map|diagram)\b/i;   // words only a diagram says: named shapes, arrows between names, chart words
const namesShape = (text, state) => { const w = new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []); return (state?.shapes ?? []).some((x) => x.name && w.has(String(x.name).toLowerCase())); };
const FRAME = /\bdiagram\b|\b(?:chart|layout|graph|box|boxes)\s+(?:shaped|laid out|arranged)\s+(?:like|as)\b|\ban? (?:shape|box) in the (?:shape|form) of\b/i;
const SHAPED = /\b(?:shaped|laid out|arranged|drawn|made|built)\s+(?:like|as|in the (?:shape|form) of)\s+(?:an?|the)?\s*(.+?)\s*[.!?]*$|\bin the (?:shape|form) of\s+(?:an?|the)?\s*(.+?)\s*[.!?]*$/i;
function accepts({ action, text: joined, state, tab, roles }) {
  // the own reader's words as they were typed: `text` is the tokens joined, so a list "snap Start, Process and Pay" has lost its commas and reads as the shapes "start process" and "pay"
  const text = String(action ?? '').endsWith('.own') && roles?.rest ? roles.rest : joined;
  // outside its own tab the diagram reads only what says "diagram": a signal word, named shapes, arrows, or the name of a shape it has (the Drawing board keeps "draw a sky and a sun")
  if (tab !== 'diagram.sketch' && !FRAME.test(String(text ?? '')) && !SIGNAL.test(String(text ?? '')) && !namesShape(String(text ?? ''), state)) return false;
  if (!String(action ?? '').endsWith('.own')) return tab !== 'diagram.sketch' ? 'focus' : true;   // signalled outside its tab: it does not yield to the open tab's world
  if (FRAME.test(String(text ?? ''))) return 'focus';
  try {
    const n = engineNode(String(text ?? ''), state);
    if (!n || noTarget(String(text ?? ''), state)) return false;
    const family = n.type === 'rule' || n.type === 'fact' ? n.type : n.args?.action ?? n.args?.ask;
    if (family === 'fact') return (state?.shapes ?? []).length > 0 ? 'focus' : false;
    return GENEROUS.has(family) ? false : 'focus';
  } catch { return false; }
}
domain.undo = (ctx) => E.undo(ctx, {});
domain.redo = (ctx) => E.redo(ctx, {});

/** The colours this world draws (the names of its palette): the dice names these, not every colour of k.values (a colour the palette lacks is a question back). */
const sampleKnowledge = () => ({ colours: Object.keys(SOPKit.COLOR_HEX).filter((c) => /^[a-z]+$/.test(c)) });
/**
 * COORDINATION AS ONE ACT (spec 03): a layout or a grouping is done to the named shapes together ("arrange Problem, Solution and Market in a row" is one arrangement of three shapes,
 * not an arrangement of two followed by one of the third). Also the engine's own acts that take a list of shapes (snap, align, distribute ...), when the engine reads the whole sentence as one.
 */
function coordinates({ action, mode, roles = {}, text }) {
  const act = String(action ?? '').split('.').pop();
  const said = String(roles.thing ?? roles.rest ?? '').trim();
  if (!/\band\b|,/i.test(said)) return false;
  if (act === 'group' || (act === 'place' && mode === 'layout')) return true;
  // the engine's own reader names the family from the words alone (no shapes needed): the ones that act on all the named shapes together
  if (act === 'own') { const n = engineNode(said, {}); return ['arrange', 'align', 'snap', 'group', 'distribute'].includes(n?.args?.action); }
  return false;
}
export const hooks = {
  coordinates,
  sampleKnowledge,
  domain,
  accepts,
  referents: (ctx) => E.referents(ctx),   // the shapes a person can point at (the dice and the pronouns read them)
  /** The engine's own reader for a sentence of the open tab that no form read: a string reply, or undefined. */
  unread: (ctx, text) => {
    // a question and a command are the two families (act ask, any other act); the engine's reader decides the rest from the sentence
    const out = (/\?\s*$|^(?:is|are|does|do|did|how|what|which|who|whom|where|can|why|list|show|tell|count)\b/i.test(String(text).trim()) ? E.ask_describe : E.create)(ctx, { text });
    return out && out.status === 'supported' ? (out.value ?? out.note) : undefined;
  },
};
