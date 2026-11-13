// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A fragment continues the conversation in the active tab (SCENE-NATURAL P1). Browser-safe: no `node:*` imports.
 *
 * A message with no verb of its own ("the crocodiles", "it is different", "the water"), or a clause cut from a longer message, is a piece of a request, not
 * a request. It is first the missing piece of the last turn of the open tab (a corrected word, an answer to a question the app asked) or a change to the
 * last action, and only the open tab, a running game or an open modal can take it. A world that is not any of these, has nothing running and has no
 * referent of the piece in its state, cannot: "the crocodiles" is not a word to guess in a hangman game nobody started.
 *
 * The test is structural, no phrase lists: what the user said outside the slots of the reading and outside the closed grammar classes is his own verb
 * (or noun-verb); when nothing is left the clause is only an argument. The rest is read from the context (`dialog.context()`) and the reading's own world.
 */
import { budget } from './budget.mjs';

const tokens = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Closed classes that carry no action: articles, pronouns, copulas and auxiliaries, prepositions, conjunctions, particles of agreement and hedging. */
const GRAMMAR = new Set(['a', 'an', 'the', 'some', 'any', 'one', 'ones', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her', 'we', 'us', 'our', 'i', 'me', 'my', 'you', 'your',
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'in', 'on', 'at', 'by', 'with', 'without', 'from', 'into', 'onto', 'to', 'of', 'for', 'under', 'over', 'above', 'below', 'near', 'next', 'between', 'around', 'behind', 'inside', 'outside', 'beside', 'than', 'as',
  'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'if', 'then', 'also', 'too', 'only', 'just', 'still', 'even', 'very', 'more', 'most', 'much', 'all', 'both', 'each', 'every', 'other', 'another', 'same', 'such',
  'yes', 'yeah', 'ok', 'okay', 'maybe', 'perhaps', 'probably', 'please', 'pls', 'plz', 'well', 'now', 'again', 'instead', 'right', 'left', 'up', 'down']);

const PRONOUN = new Set(['it', 'them', 'they']);   // the personal pronouns that stand for a thing; "this tab" is a noun phrase

/**
 * The words of the clause that are neither inside a slot of the reading nor grammar: what the user said with a word of his own ("draw", "move", "make"). A
 * clause with none of them has no verb of its own: its whole content is an argument ("the crocodiles", "it is different").
 */
export function ownWords(seg) {
  const inSlot = new Map();
  for (const sl of Object.values(seg.match?.slots ?? {})) for (const w of tokens(sl.text)) inSlot.set(w, (inSlot.get(w) ?? 0) + 1);
  const out = [];
  for (const w of tokens(seg.text)) {
    budget.tick('continuation.words');
    if (inSlot.get(w) > 0) { inSlot.set(w, inSlot.get(w) - 1); continue; }
    if (!GRAMMAR.has(w)) out.push(w);
  }
  return out;
}

/**
 * The reading `seg` is a verb-less fragment taken by a world that is not the open tab's, with nothing running there (no game, no modal): `{ world }`, or null.
 * Read-only. A message that names the world ("the hangman game") is for that world, whatever tab is open.
 */
export function foreignFragment(dialog, seg) {
  if (seg.unparsed || !seg.wires?.length) return null;
  const world = seg.match?.worldId;
  if (!world) return null;
  const ctx = dialog.context();
  const last = dialog.discourse?.frames?.[0]?.world ?? null;
  if (last === world) return null;   // the world of the last action continues its own conversation ("now in a women" after an avatar change)
  if (!ctx.tabWorld || ctx.tabWorld === world || ctx.gameWorld === world || ctx.modalWorld === world) return null;
  if (!(seg.wires ?? []).some((w) => w.type === 'core.request')) return null;   // a question or a statement is not a continuation
  try { if (seg.text && dialog._worldsNamedIn(seg.text).has(world)) return null; } catch { /* keep going */ }
  // A pronoun stands for the last thing talked about, which lives in the world of the last action or in the open tab: another world has no referent for it
  // ("make it happy" on the Avatar tab, after an avatar change, is not about a shape of the diagram)
  const pronoun = tokens(seg.text).some((w) => PRONOUN.has(w));
  if (pronoun && !String(world).startsWith('games.') && (last || ctx.tabWorld)) return { world, why: 'pronoun' };
  if (ownWords(seg).length) return null;
  return { world, why: 'no-verb' };
}
