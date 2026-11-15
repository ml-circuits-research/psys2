// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FOREIGN READINGS AND GUESSED RESPELLINGS (spec 16 section 14). Browser-safe: no `node:*`.
 *
 * The decision is the library's reader contract (sopworld 0.120+): every reading of a message is handed to `readText` as one candidate
 * `{ frame, unread, repaired }` built from the host's segment; the library reads the mood of the clause (`moodOf`: question, imperative,
 * statement, fragment) and says whether the reading is complete and why not. A typed slot value is checked by `fitsSlot` (an empty value, an
 * article alone or a single letter is a fragment). The host keeps only what the library cannot see: its own patterns (does the frame read the
 * speaker?), its segments (which words were ignored, respelled, reframed), its tab table, and the polite lead-ins of lang.common.
 *
 *  1. FULL READING. A world other than the open tab's (and other than the cross-cutting worlds: no tab of their own, or ambient on every tab)
 *     acts only on a complete reading: no word unread (strict typed reading, ignored words), no repair (respelling, voice rewrite, reframed
 *     command, loose reading), no fragment. A world the message names is exempt.
 *  2. MOOD. A first-person statement ("I have two kids", "I like cats") is not a command: a request reading of it is refused in every world
 *     unless the world reads statements in that frame (`readsStatement`: the frame reads the speaker, "I have to tidy my room" is a to-do; or
 *     one of the pattern's own examples is a statement, "My dog is called Rex"). A wish is a request: the shared pattern lead of lang.common
 *     ("i mean", "i want", "i would like", "i need" ...) is stripped before the mood is read.
 *  3. FRAGMENT. A clause that is only a letter or an article is never read by a world other than the open tab's.
 *  4. GUESSED RESPELLING (any world, the open tab's too). A respelled content word that is not a confident typo of a word the world knows
 *     (`confidentTypo`) leaves the reading incomplete: it is not executed; the reply says what was not understood (a sound-alike of voice
 *     input or a real word read as another is offered as "Did you mean"). A confident typo is executed and the reply names it
 *     ("(I read "hosue" as "house")").
 *
 * A refused reading becomes an unparsed clause (the honest not-understood path); `seg.foreign = { world, why }` records it.
 * `PSYS2_FOREIGN=off` turns the review off (A/B runs).
 */
import { FUNCTION_WORDS, spellVocabulary, isKnownWord, spellBudget, sameStem } from '../formalizer/spell.mjs?v=8c59dedcf0';
import { targetsOf } from '../formalizer/typed-world.mjs?v=8c59dedcf0';
import { slipDistance, stemsOf } from './scene-referents.mjs?v=c5d9d4fd36';
import { lexIndex } from '../worlds/lexicon.mjs?v=435219812a';
import { tabOfWorld } from '../worlds/index.mjs?v=5804bce0d9';

export const foreignOn = () => globalThis.process?.env?.PSYS2_FOREIGN !== 'off';

/** The reply to a statement about the speaker that no world keeps (there is no profile world since ADR-010). */
export const STATEMENT_SAY = 'That sounds like something about you. I cannot keep facts about you here.';
const words = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** The clause of `english` that holds the segment: from the last clause mark before it ("," ";" "." "!" "?") to its end. */
function clauseOf(english, seg) {
  const low = english.toLowerCase(), at = low.indexOf(String(seg.text ?? '').toLowerCase());
  if (at < 0) return seg.bestEffort || seg.variant ? english : seg.text ?? '';   // a rewritten reading: the clause is what was said
  const before = english.slice(0, at), cut = Math.max(...[',', ';', '.', '!', '?'].map((c) => before.lastIndexOf(c)));
  const end = at + seg.text.length, mark = /^\s*\?/.exec(english.slice(end));   // a question mark right after the clause is part of its mood
  return (english.slice(cut + 1, end) + (mark ? "?" : "")).trim();
}

/** A reading whose content words are all inside its slots: a piece of a list with no verb of its own ("dogs" of "I like cats, dogs and horses"). */
function verbless(seg) {
  let rest = ` ${String(seg.text ?? '').toLowerCase()} `;
  for (const s of Object.values(seg.match?.slots ?? {})) if (s?.text) rest = rest.replace(String(s.text).toLowerCase(), ' ');
  return words(rest).every((w) => FUNCTION_WORDS.has(w));
}

/**
 * The clause without its filler and its polite request lead (`ctx.lang.stripPolite`: "i want", "i would like you to", "can you"): a wish is a request, its mood is the rest's.
 * Lowercase: the rule is about the speaker (a first-person subject); the library's second statement test, a capitalised name then an auxiliary ("Tom has 5 apples"),
 * also takes "Here is my tune" and "Done is red" (a diagram's node) and is not asked (questions.md Q22 L5).
 */
const moodText = (lang, clause) => String(lang?.stripPolite?.(clause) ?? clause).trim().toLowerCase();

/** The library's mood of a clause (question | imperative | statement | fragment), wishes read as requests, a statement only with a first-person subject; null without the library. */
export const moodOfClause = (lib, lang, clause) => {
  if (!lib?.moodOf) return null;
  const t = moodText(lang, clause), mood = lib.moodOf(null, t);
  return mood === 'statement' && words(t).length < 2 ? 'fragment' : mood;   // "my" alone (Romanian "meu") is a fragment, not a statement (questions.md Q22 L4)
};

const SUBJECT = new Set(['i', 'im', "i'm"]);
const SUBJ_MEMO = new WeakMap();
/** Does the pattern's own frame read the speaker: an inline literal or an alternative of the world's own phrase macros (not the shared `$lang.*` lead-ins) that starts with "i"? */
export function readsSpeaker(set, worldId, patternId) {
  const p = set.get(worldId)?.patterns?.find((x) => x.id === patternId);
  if (!p) return false;
  if (SUBJ_MEMO.has(p)) return SUBJ_MEMO.get(p);
  let phrases = null;
  try { phrases = lexIndex(set).phrases; } catch { phrases = null; }
  let yes = false;
  for (const part of String(p.match ?? '').split(/\s+/)) {
    const m = /^\[([^\]]+)\]\??$/.exec(part);
    for (const a of m ? m[1].split('|') : [part]) {
      if (a.startsWith('{')) continue;
      const alts = a.startsWith('$') ? (a.startsWith('$lang.') ? [] : (phrases?.get(a.slice(1))?.alts ?? [])) : [a.split('_')];
      if (alts.some((ws) => SUBJECT.has(String(ws[0] ?? '').toLowerCase()))) { yes = true; break; }
    }
    if (yes) break;
  }
  SUBJ_MEMO.set(p, yes);
  return yes;
}

const STMT_MEMO = new WeakMap();
/** Does the world read statements in this frame: the frame reads the speaker, or one of the pattern's own examples is a statement by the library's mood ("Start is red" in the diagram, "My dog is called Rex" in session.things)? */
export function readsStatement(set, lib, lang, worldId, patternId) {
  if (readsSpeaker(set, worldId, patternId)) return true;
  const p = set.get(worldId)?.patterns?.find((x) => x.id === patternId);
  if (!p || !lib?.moodOf) return false;
  if (STMT_MEMO.has(p)) return STMT_MEMO.get(p);
  const yes = [...(p.examples ?? []), ...(p.example ?? [])].some((e) => moodOfClause(lib, lang, String(e)) === 'statement');
  STMT_MEMO.set(p, yes);
  return yes;
}

/**
 * Is the respelling `from` -> `to` a confident typo (spec 16 section 14 rule 4)? All of:
 *  - the typed word is not a word the system knows (a real word is not a typo of another: "hint" is not "mint");
 *  - the slip distance (insert, delete, substitute, swap of two neighbours: 1 each; spaces ignored, so a split or a merge costs nothing) between
 *    the whole words, or between their stems when both stems keep 4 letters or more ("corcodilii" / "crocodiles"), is within the spelling budget
 *    of the typed word (1 up to 6 letters, 2 from 7; a word under 3 letters has none);
 *  - the first letter is kept, or the first two letters are swapped.
 * `known(word)`: a word the system knows. Abbreviations and corrections into a function word are not respelled content words (always confident).
 */
export function confidentTypo(c, known = () => false) {
  if (c.kind === 'abbreviation' || c.kind === 'stutter' || c.kind === 'send') return true;
  const from = String(c.from ?? '').toLowerCase().replace(/\s+/g, ''), to = String(c.to ?? '').toLowerCase().replace(/\s+/g, '');
  if (!to || from === to) return true;
  if (words(c.to).every((w) => FUNCTION_WORDS.has(w))) return true;
  if (words(c.from).length === 1 && known(from)) return sameStem(from, to);   // a real word is not a typo of another, but two inflected forms of one stem are one word mis-inflected ("flyes" -> "flies")
  const budget = spellBudget(from);
  if (!budget) return false;
  if (from[0] !== to[0] && !(from[0] === to[1] && from[1] === to[0])) return false;
  let d = slipDistance(from, to, budget);
  for (const a of stemsOf(from)) for (const b of stemsOf(to)) if (a.length >= 4 && b.length >= 4) d = Math.min(d, slipDistance(a, b, budget));
  return d <= budget;
}

/** The respellings of a reading that are guesses, not confident typos. */
function guessedRespellings(set, seg) {
  if (!seg.corrections?.length) return [];
  let vocab = null;
  const known = (w) => {
    try { vocab ??= spellVocabulary(set); } catch { vocab = new Set(); }
    return isKnownWord(w, vocab) || !!globalThis[Symbol.for('psys2.catalogWords')]?.(w) || !!globalThis[Symbol.for('psys2.bundledWords')]?.(w);
  };
  return seg.corrections.filter((c) => !confidentTypo(c, known)).map((c) => ({ ...c, real: words(c.from).length === 1 && known(String(c.from).toLowerCase()) }));
}

/** The slots of a reading whose typed value the library refuses as a fragment or as empty (`fitsSlot`); an untyped slot: an empty value. */
function fragmentSlot(set, seg) {
  const m = seg.match;
  let tw = null, targets = {};
  try { tw = set.typedFor?.(m.worldId) ?? null; targets = m.pattern ? targetsOf(m.pattern) : {}; } catch { tw = null; }
  for (const [name, s] of Object.entries(m.slots ?? {})) {
    if (!s) continue;
    const value = String(s.value ?? '');
    const target = targets[name];
    if (tw?.fits && target && tw.slots?.has(target)) {
      const fit = tw.fits(target, value);
      if (!fit.ok && /fragment|needs a value|single letter/.test(fit.why ?? '')) return `${name}: ${fit.why}`;
    } else if (value.trim() === '') return `empty slot ${name}`;
  }
  return null;
}

/**
 * The reading as one candidate of the library's contract: `strict` (a world other than the open tab's) counts every repair and every unread
 * word; otherwise only the guessed respellings (rule 4) are repairs, and the open tab's unread words stay with sections 12 and 13.
 */
function candidateOf(set, seg, { strict, speaker }) {
  const repaired = strict ? (seg.corrections ?? []).map((c) => ({ from: c.from, to: c.to })) : guessedRespellings(set, seg).map((c) => ({ from: c.from, to: c.to, kind: c.kind, real: c.real }));
  const unread = [];
  if (strict) {
    if (seg.variant && seg.variant.via !== 'run-on') repaired.push({ from: seg.text, to: seg.variant.text ?? seg.text, via: seg.variant.via ?? 'a voice' });
    if (seg.reframed) repaired.push({ from: seg.text, to: 'a command', via: 'reframed' });
    if (seg.bestEffort || seg.partial) repaired.push({ from: seg.text, to: seg.text, via: 'a loose reading' });
    unread.push(...(seg.ignored ?? []), ...(seg.match?.unreadStrict ?? seg.match?.unread ?? []));
  }
  const act = seg.match?.kind === 'request' && !speaker;
  return { frame: { is: act ? 'act' : 'ask', world: seg.match?.worldId, pattern: seg.match?.patternId }, unread, repaired, cost: 0, specificity: 0 };
}

/** Why a reading of a world other than the open tab's is not a full reading, or null (the library's `why`, then a fragment slot). Kept for tests and tools. */
export function notFull(seg, { lib, set = null, clause = seg.text } = {}) {
  if (!lib?.readText) return null;
  const r = lib.readText(null, clause, { reader: () => [candidateOf(set ?? new Map(), seg, { strict: true, speaker: true })] });
  if (!r.complete) return r.why;
  return set ? fragmentSlot(set, seg) : null;
}

/**
 * Review the readings of one message. Returns the segments, the refused ones turned into unparsed clauses.
 * @param {object} dialog  the dialog session (context(), engine, _worldsNamedIn)
 */
export function reviewForeign(dialog, segments, { english }) {
  if (!foreignOn() || !segments?.length) return segments;
  const lib = dialog.engine.sopworld;
  if (!lib?.readText) return segments;   // no library: nothing to decide with
  const ctx = dialog.context(), set = dialog.engine.set, lang = dialog.engine.interp?.lang;
  const tabWorld = ctx.tabWorld;
  const ambient = new Set(ctx.ambientWorlds ?? []);
  const hasTab = (id) => !!tabOfWorld(set, id);   // a world with a tab of its own (manifest `tab=` or the built-in tab table)
  let named = null;
  const isNamed = (id) => (named ??= dialog._worldsNamedIn?.(english) ?? new Set()).has(id);
  const lead = (clause) => words(clause).slice(0, 2).join(' ');
  const out = [];
  let stmt = null;   // the refused statement whose list the next verbless pieces belong to
  for (const seg of segments) {
    const id = seg.match?.worldId;
    if (seg.unparsed || !id) {
      if (stmt && seg.unparsed && words(seg.text).length <= 3) { stmt.foreign.with = [...(stmt.foreign.with ?? []), seg.text]; continue; }   // "... and horses": the rest of the refused statement's list
      const clause = seg.unparsed && !seg.veto?.say ? clauseOf(english, seg) : null;
      if (clause && moodOfClause(lib, lang, clause) === 'statement') { stmt = { ...seg, veto: { say: STATEMENT_SAY, status: 'unparsed', why: `a first-person statement ("${lead(clause)}")` }, foreign: { world: null, why: `a first-person statement ("${lead(clause)}"), nobody read it` } }; out.push(stmt); continue; }   // "I like chess, music and maps": nobody read the statement; its list does not open tabs
      out.push(seg); stmt = null; continue;
    }
    const clause = clauseOf(english, seg);
    const speaker = readsStatement(set, lib, lang, id, seg.match.patternId);
    const strict = !!tabWorld && id !== tabWorld && hasTab(id) && !ambient.has(id) && !isNamed(id);
    const r = lib.readText(null, moodText(lang, clause), { reader: () => [candidateOf(set, seg, { strict, speaker })] });
    let why = null, mood = null, guessed = null;
    if (r.mood === 'statement' && seg.match.kind === 'request' && !speaker) { why = `a first-person statement ("${lead(clause)}"), not a command`; mood = 'statement'; }
    else if (stmt && seg.match.kind === 'request' && !speaker && verbless(seg)) { why = `part of the statement "${stmt.text}"`; mood = 'list'; }
    else if (strict && !r.complete) why = r.why;
    else if (strict) why = fragmentSlot(set, seg);
    else if (r.repaired.length) { why = `a guess, not a confident typo: ${r.repaired.map((c) => `"${c.from}" as "${c.to}"`).join(', ')}`; guessed = r.repaired; }
    if (!why) { out.push(seg); stmt = null; continue; }
    const refused = { ...seg, unparsed: true, wires: [], match: undefined, alternatives: [], corrections: [], ignored: [], bestEffort: undefined, partial: false, worlds: seg.worlds ?? [], foreign: { world: id, why, pattern: seg.match.patternId, ...(guessed ? { guessed } : {}) } };
    let guess = String(seg.text ?? '');
    if (guessed) {   // the clause quoted is what the user said; the suggestion is the guess (a segment's text may carry either spelling)
      const swap = (t, a, b) => { const i = t.toLowerCase().search(new RegExp(`\\b${String(a).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)); return i >= 0 ? t.slice(0, i) + b + t.slice(i + String(a).length) : t; };
      let said = guess;
      for (const c of guessed) said = swap(said, c.to, c.from);
      for (const c of seg.corrections ?? []) if (c.to) guess = swap(guess, c.from, c.to);
      refused.text = said;
    }
    if (guessed?.some((c) => c.kind === 'voice' || c.real) && !refused.suggestions?.length && guess.toLowerCase() !== refused.text.toLowerCase()) refused.suggestions = [guess.replace(/^./, (x) => x.toUpperCase()) + '.'];   // a sound-alike of spoken input (RP3) or a real word read as another ("clean" as "clear"): offered as "Did you mean", never executed; an unknown word stays "not understood"
    if (mood === 'list') { stmt.foreign.with = [...(stmt.foreign.with ?? []), seg.text]; continue; }   // one reply for the whole statement
    if (mood) { refused.veto = { say: STATEMENT_SAY, status: 'unsupported', why }; stmt = refused; }
    else stmt = null;
    out.push(refused);
  }
  return out;
}
