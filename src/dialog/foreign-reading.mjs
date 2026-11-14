// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FOREIGN READINGS (spec 16 section 14). Browser-safe: no `node:*`.
 *
 * After the tab cut (ADR-010) the turns that used to belong to a removed world were taken by surviving worlds on a keyword: the drawing drew 2 people for "I have two kids",
 * the music world played the note A for the Romanian article "o". Three general rules, checked on the readings before anything is executed:
 *
 *  1. FULL READING. A world other than the open tab's (and other than the cross-cutting worlds: no tab of their own, or ambient on every tab) acts only on a full reading:
 *     no respelled word (spelling corrections, a voice's rewrite), no dropped word (`ignored`, a subject or gerund reframed as a command), no content word its typed world
 *     does not accept (`unreadStrict`: free text typed too, spec 16 section 13), no empty slot value. A world the message names is exempt (it was asked for by name).
 *  2. MOOD. A first-person statement ("I have ...", "I like ...", "I am ...": `ctx.lang.statement`, phrase group `lang.mood.statement` of lang.common) is not a command:
 *     a request reading of it is refused in every world (navigation too: "I like music" does not open the music tab) unless the world's own frame reads the speaker
 *     (a pattern whose literals or own phrase macros start with "i": "I have to tidy my room" is a to-do, "I am lost" asks for help; the shared lead-ins `$lang.*` do not count); the verbless pieces of the same list ("..., dogs and horses") go with it.
 *  3. FRAGMENT. A clause that is only a letter or an article (what "o" or "a" leaves after translation) is never a slot value of a world other than the open tab's.
 *
 * A refused reading becomes an unparsed clause (the honest not-understood path, the tab world's own `outOfScope` refusal first); `seg.foreign = { world, why }` records it.
 * `PSYS2_FOREIGN=off` turns the review off (A/B runs).
 */
import { FUNCTION_WORDS } from '../formalizer/spell.mjs';
import { lexIndex } from '../worlds/lexicon.mjs';
import { tabOfWorld } from '../worlds/index.mjs';

export const foreignOn = () => globalThis.process?.env?.PSYS2_FOREIGN !== 'off';

/** The reply to a statement about the speaker that no world keeps (there is no profile world since ADR-010). */
export const STATEMENT_SAY = 'That sounds like something about you. I cannot keep facts about you here.';
const ARTICLES = new Set(['a', 'an', 'the']);
const words = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
/** A clause that is only one letter or only articles. */
export const isFragment = (text) => { const w = words(text); return w.length > 0 && w.length <= 2 && w.every((x) => ARTICLES.has(x) || /^\p{L}$/u.test(x)); };

/** The clause of `english` that holds the segment: from the last clause mark before it ("," ";" "." "!" "?") to its end. */
function clauseOf(english, seg) {
  const low = english.toLowerCase(), at = low.indexOf(String(seg.text ?? '').toLowerCase());
  if (at < 0) return seg.bestEffort || seg.variant ? english : seg.text ?? '';   // a rewritten reading: the clause is what was said
  const before = english.slice(0, at), cut = Math.max(...[',', ';', '.', '!', '?'].map((c) => before.lastIndexOf(c)));
  return english.slice(cut + 1, at + seg.text.length).trim();
}

/** A reading whose content words are all inside its slots: a piece of a list with no verb of its own ("dogs" of "I like cats, dogs and horses"). */
function verbless(seg) {
  let rest = ` ${String(seg.text ?? '').toLowerCase()} `;
  for (const s of Object.values(seg.match?.slots ?? {})) if (s?.text) rest = rest.replace(String(s.text).toLowerCase(), ' ');
  return words(rest).every((w) => FUNCTION_WORDS.has(w));
}

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

/** Why a reading of a world other than the open tab's is not a full reading, or null. */
export function notFull(seg) {
  if (seg.corrections?.length) return `respelled ${seg.corrections.map((c) => `"${c.from}"`).join(', ')}`;
  if (seg.variant && seg.variant.via !== 'run-on') return `rewritten by ${seg.variant.via ?? 'a voice'}`;
  if (seg.ignored?.length) return `did not use ${seg.ignored.map((w) => `"${w}"`).join(', ')}`;
  if (seg.reframed) return 'a statement or gerund reframed as a command';
  if (seg.bestEffort || seg.partial) return 'a loose reading';
  const left = seg.match?.unreadStrict ?? seg.match?.unread ?? [];
  if (left.length) return `unread ${left.map((w) => `"${w}"`).join(', ')}`;
  const empty = Object.entries(seg.match?.slots ?? {}).find(([, s]) => s && String(s.value ?? '').trim() === '');
  if (empty) return `empty slot ${empty[0]}`;
  if (isFragment(seg.text)) return 'a fragment (a letter or an article)';
  return null;
}

/**
 * Review the readings of one message. Returns the segments, the refused ones turned into unparsed clauses.
 * @param {object} dialog  the dialog session (context(), engine, _worldsNamedIn)
 */
export function reviewForeign(dialog, segments, { english }) {
  if (!foreignOn() || !segments?.length) return segments;
  const ctx = dialog.context(), set = dialog.engine.set, lang = dialog.engine.interp?.lang;
  const tabWorld = ctx.tabWorld;
  const ambient = new Set(ctx.ambientWorlds ?? []);
  const hasTab = (id) => !!tabOfWorld(set, id);   // a world with a tab of its own (manifest `tab=` or the built-in tab table)
  let named = null;
  const isNamed = (id) => (named ??= dialog._worldsNamedIn?.(english) ?? new Set()).has(id);
  const out = [];
  let moodOf = null;   // the refused statement whose list the next verbless pieces belong to
  for (const seg of segments) {
    const id = seg.match?.worldId;
    if (seg.unparsed || !id) {
      if (moodOf && seg.unparsed && words(seg.text).length <= 3) { moodOf.foreign.with = [...(moodOf.foreign.with ?? []), seg.text]; continue; }   // "... and horses": the rest of the refused statement's list
      const lead = seg.unparsed && !seg.veto?.say ? lang?.statement?.(clauseOf(english, seg)) : null;
      if (lead) { moodOf = { ...seg, veto: { say: STATEMENT_SAY, status: 'unsupported', why: `a first-person statement ("${lead}")` }, foreign: { world: null, why: `a first-person statement ("${lead}"), nobody read it` } }; out.push(moodOf); continue; }   // "I like chess, music and maps": nobody read the statement; its list does not open tabs
      out.push(seg); moodOf = null; continue;
    }
    let why = null, mood = null;
    if (seg.match.kind === 'request' && !readsSpeaker(set, id, seg.match.patternId)) {
      const lead = lang?.statement?.(clauseOf(english, seg));
      if (lead) { why = `a first-person statement ("${lead}"), not a command`; mood = lead; }
      else if (moodOf && verbless(seg)) { why = `part of the statement "${moodOf.text}"`; mood = 'list'; }
    }
    if (!why && tabWorld && id !== tabWorld && hasTab(id) && !ambient.has(id) && !isNamed(id)) why = notFull(seg);
    if (!why) { out.push(seg); moodOf = null; continue; }
    const refused = { ...seg, unparsed: true, wires: [], match: undefined, alternatives: [], corrections: [], ignored: [], bestEffort: undefined, partial: false, worlds: seg.worlds ?? [], foreign: { world: id, why, pattern: seg.match.patternId } };
    if (mood === 'list') { moodOf.foreign.with = [...(moodOf.foreign.with ?? []), seg.text]; continue; }   // one reply for the whole statement
    if (mood) { refused.veto = { say: STATEMENT_SAY, status: 'unsupported', why }; moodOf = refused; }
    else moodOf = null;
    out.push(refused);
  }
  return out;
}
