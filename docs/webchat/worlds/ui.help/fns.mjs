// SPDX-License-Identifier: AGPL-3.0-only
// ui.help on the matrix reasoner (spec 15). The operations (ops.mjs: the examples to show and their rotation, "how do I ...?", the rules of the games, why a sentence was not
// understood) are unchanged and keep working on the session state; the state is also one wire of the library (matrix.sop). "What can you do in the map?" is a question
// the library answers from the knowledge base (kb.sop). The library is the record: `toState` derives the state ops.mjs keeps from the wire, `adopt` says which value to
// set for a state the operations (or the dialog layer, after a sentence it did not understand) changed, `undoWords` says what an undo took back. Browser-safe; it imports
// its sibling ops.mjs for the initial state.
import { initialState } from './ops.mjs?v=b403960299';

const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const first = (w, k) => w?.attrs?.[k]?.[0];
const tokens = (o) => JSON.stringify(o);

/** The state ops.mjs keeps, derived from the wire (the initial state when the help was never used). */
export function toState({ find }) {
  const w = find('ui.help.state')[0];
  return w ? { ...initialState(), ...JSON.parse(dec(first(w, 'rest'))) } : initialState();
}

/** The library wires for a state the operations changed: the one wire is told when the state first leaves the initial one and set in place after that. */
export function adopt({ state, find }) {
  const have = find('ui.help.state')[0];
  const rest = str(tokens(state));
  if (!have) return tokens(state) === tokens(initialState()) ? { retract: [], tell: '', sets: [] } : { retract: [], tell: `@hp.state ui.help.state rest=${rest}`, sets: [] };
  return first(have, 'rest') === rest ? { retract: [], tell: '', sets: [] } : { retract: [], tell: '', sets: [{ id: have.id, key: 'rest', value: rest }] };
}

/** What "undo that" says after a help request: the examples are back where they were. */
export function undoWords({ before, after, said }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  if (tokens(before.pos) !== tokens(after.pos)) return { value: 'OK, the examples are back where they were.' };
  return { value: `OK, I took that back${said ? `: "${said}"` : ''}.` };
}
