// SPDX-License-Identifier: AGPL-3.0-only
// kids.animals on the matrix reasoner (spec 15). The facts are wires of the library (the knowledge base and what the dialogue teaches); the questions are
// answered by the library, the five the library cannot say are left to ops.mjs (`ops=` in world.sop). This file derives the state the hooks read from the
// wires (`toState`: what a child taught, the pets they told about) and says what "undo that" took back in the world's words (`undoWords`). Browser-safe.

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const tok = (w, k) => (w?.attrs?.[k] ?? []).map(un);
/** The name of an entity a wire refers to (`$e.rex` -> Rex). */
const nameOf = (ref) => (ref ? String(ref).replace(/^\$?e\./, '').replace(/^./, (c) => c.toUpperCase()).replace(/_/g, ' ') : null);
const FACT_KEYS = ['class', 'legs', 'diet', 'food', 'habitat', 'covering', 'sound', 'baby', 'can_fly', 'can_swim'];

/** { taught: [{ name, facts }], pets: [{ kind, called }] }: the animals the dialogue told the library about (not the knowledge base) and the pets. */
export function toState({ find }) {
  const taught = find('kids.animals.animal').filter((w) => !String(w.id).startsWith('kb.')).map((w) => ({
    name: tok(w, 'name')[0] ?? null,
    facts: FACT_KEYS.flatMap((k) => tok(w, k).map((v) => `${k}=${v}`)),
  }));
  const pets = find('kids.animals.pet').map((w) => ({ kind: tok(w, 'kind')[0] ?? null, called: nameOf(tok(w, 'called')[0]) }));
  return { taught, pets };
}

/** What "undo that" says once the library went back: a taught fact, a pet. */
export function undoWords({ before, after, said }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  const key = (x) => JSON.stringify(x);
  const lost = (a, b) => a.filter((x) => !b.some((y) => key(y) === key(x)));
  const pet = lost(before.pets, after.pets)[0];
  if (pet) return { value: `OK, I forgot your ${pet.kind ?? 'pet'}${pet.called ? ` ${pet.called}` : ''}.` };
  const fact = lost(before.taught, after.taught)[0];
  if (fact?.name) return { value: `OK, I forgot what you taught me about ${fact.name}${fact.name.endsWith('s') ? '' : 's'}.` };
  return { value: `OK, I took that back${said ? `: "${said}"` : ''}.` };
}
