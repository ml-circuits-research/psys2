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
import { budget } from './budget.mjs?v=00bce6e369';
import { en } from '../lang/en.mjs?v=9bb300846a';

const tokens = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Closed classes that carry no action: articles, pronouns, copulas and auxiliaries, prepositions, conjunctions, particles of agreement and hedging. */
export const GRAMMAR = new Set(['a', 'an', 'the', 'some', 'any', 'one', 'ones', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her',
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'in', 'on', 'at', 'by', 'with', 'without', 'from', 'into', 'onto', 'to', 'of', 'for', 'under', 'over', 'above', 'below', 'near', 'next', 'between', 'around', 'behind', 'inside', 'outside', 'beside', 'than', 'as',
  'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'if', 'then', 'also', 'too', 'only', 'just', 'still', 'even', 'very', 'more', 'most', 'much', 'all', 'both', 'each', 'every', 'other', 'another', 'same', 'such',
  'yes', 'yeah', 'ok', 'okay', 'maybe', 'perhaps', 'probably', 'please', 'pls', 'plz', 'well', 'now', 'again', 'instead', 'right', 'left', 'up', 'down']);

export const PERSON = new Set(['i', "i'm", 'im', "i've", "i'd", "i'll", 'we', "we're", 'you', "you're", 'my', 'me', 'our', 'your']);   // a clause with a speaker or an addressee is a statement or a request of its own, whatever words follow
const PRONOUN = en.words('pron', 'continuation');   // the personal pronouns that stand for a thing; "this tab" is a noun phrase

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
 * The reading `seg` is a verb-less fragment taken by a world that cannot continue anything (SCENE-NATURAL P1): `{ world, why }`, or null. Read-only.
 * The structural test of the piece (no verb of its own, a pronoun with a scene) is made here from the reading; WHO may take a piece is the first rule set of
 * meta.worlds (`nocontinuation`, worlds/meta.worlds/matrix.sop): the world of the last action, the open tab, a running game or modal, the world that asked,
 * a world with a referent of the piece in its scene, a world the piece names, and the worlds that act anywhere (shell, help, names) are not blocked. `blocked(text)`
 * is the host's call of meta.worlds for a piece (`{ world: [{ rule }] }`); without it nothing is blocked.
 */
export function foreignFragment(dialog, seg, blocked = null) {
  if (seg.unparsed || !seg.wires?.length) return null;
  const world = seg.match?.worldId;
  if (!world || !blocked) return null;
  if (!(seg.wires ?? []).some((w) => w.type === 'core.request')) return null;   // a question or a statement is not a continuation
  // A pronoun stands for the last thing talked about, which lives in the world of the last action or in the open tab: another world has no referent for it
  // ("make it happy" on the Avatar tab, after an avatar change, is not about a shape of the diagram)
  if (tokens(seg.text).some((w) => PERSON.has(w))) return null;
  const pronoun = tokens(seg.text).some((w) => PRONOUN.has(w));
  const scene = typeof dialog.engine.set.get(world)?.ops?.checkReferents === 'function';   // a world with things to point at; a profile or a game has none
  const why = pronoun && scene ? 'pronoun' : ownWords(seg).length ? null : 'no-verb';
  if (!why) return null;
  let b;
  try { b = blocked(seg.text)?.[world]; } catch { return null; }
  if (!b?.some((x) => x.rule === 'nocontinuation')) return null;
  // A world that can act on the piece is not refused: a bare "top left" starts tic-tac-toe, "Osaka in Japan" is a question of the map. Only a world that has
  // nothing to act on (no game running, no such thing in the scene: its dry run says missing or refused) cannot take it.
  try { const st = dialog._dryStatuses([seg]); if (st.length && st.every((x) => x === 'supported')) return null; } catch { return null; }
  return { world, why };
}
