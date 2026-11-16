// SPDX-License-Identifier: AGPL-3.0-only
/**
 * COMPLETENESS (spec 16 section 12, Q15 items 2 and 3): a reading is FINAL only when every content word of the clause is read by something: a literal of the pattern, a typed
 * slot, or a free-text role. The words a pattern's `...` skipped, and the content words of a free-text capture that are words of the readers themselves (question words, the verbs of
 * other acts), are UNREAD; with the typed worlds (spec 16 section 13, the default source) a free-text slot is unread when its world's types do not accept its words. Browser-safe. `PSYS2_COMPLETE=off` turns the consequences off for A/B runs (the measurement is still recorded on the segment).
 */
import { FUNCTION_WORDS, worldVocabulary } from './spell.mjs?v=3898ce1a32';
import { unreadBy, thingWordsOf } from './typed-world.mjs?v=3898ce1a32';

const word = (t) => (t.kind === 'word' || t.kind === 'number') && !t.filler;
/** Content words (not function words, not fillers) of a token list. */
export const contentWordsOf = (tokens) => tokens.filter(word).map((t) => t.lower ?? String(t.raw).toLowerCase()).filter((w) => !FUNCTION_WORDS.has(w));

/**
 * The switch (PSYS2_COMPLETE): `off` (no consequence: the earlier behaviour), `hold` (the readers run on an incomplete reading, a destructive one is not executed, arbitration is by coverage),
 * `ask` (as `hold`, and an incomplete reading no voice completed is not executed: a clarifying ask). Default: DEFAULT_MODE (`hold` since the typed worlds, spec 16 section 13).
 */
export const DEFAULT_MODE = 'hold';
export const completeMode = () => { const v = globalThis.process?.env?.PSYS2_COMPLETE; return v === 'off' || v === 'hold' || v === 'ask' ? v : DEFAULT_MODE; };
export const completeOn = () => completeMode() !== 'off';
/**
 * Where the free-text part of `unread` comes from (PSYS2_COMPLETE_SRC): `typed` (default: the typed world of the reading's world, spec 16 section 13: a slot is unread when the world's types do not
 * accept its words) or `heuristic` (the earlier untyped test: a question word inside a free capture, or a word another world's reading reads). The skipped ranges (`...`) count in both.
 */
export const completeSource = () => (globalThis.process?.env?.PSYS2_COMPLETE_SRC === 'heuristic' ? 'heuristic' : 'typed');
/** A segment the rules read, but not completely (content words unread, no voice completed it). */
export const isIncomplete = (seg) => completeOn() && !!seg && !seg.unparsed && !seg.variant && !!seg.match?.unread?.length;

/** Words that open a question: inside a free-text capture they mean the capture swallowed another clause ("what sound does a cow make what 7"). */
const STRUCTURAL = new Set(['what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'whats', "what's"]);

/**
 * Unread content words of every candidate reading of one clause (sets `m.unread`; returns nothing). A word is unread by a reading when
 *  - a `...` skip of its pattern passed over it;
 *  - it is a question word inside a free-text capture (`words`: the capture swallowed another clause: "what sound does a cow make what 7");
 *  - it is inside a free-text capture of this reading while a reading of ANOTHER world reads the very same word with its own literal or typed slot ("move the house upsides" in the
 *    music world: the drawing world has the house). This is the evidence of competition, not a word list: free text that nobody else reads stays free text.
 * `rest` captures are dictation (free by design) and never count.
 */
/** The phrase groups of the loaded worlds (lang.common), for a world whose own reader reads its words through them (memoized on the set). */
function phraseOfSet(set) {
  if (!set?.list) return null;
  if (!set._phraseOf) { const m = new Map(); for (const w of set.list()) for (const ph of w.phrases ?? []) m.set(ph.id, ph.alts.map((x) => x.join(' '))); set._phraseOf = (id) => m.get(id); }
  return set._phraseOf;
}
const CATALOG_WORLDS = new Set(['art.draw', 'talk']);   // the two worlds that take any thing of the knowledge catalog (the `catalog=yes` cards of meta.worlds)
export function annotateUnread(matches, set = null, context = null) {
  const foreign = set && globalThis.process?.env?.PSYS2_COMPLETE_FOREIGN === '1';
  const typed = completeSource() === 'typed';
  const typedFor = typed && set?.typedFor ? (id) => set.typedFor(id) : null;
  // once per world per sentence: the words of the session's things of the world; for a world with no typed bundle (a generated or test world) also its own vocabulary (patterns, lexicons)
  const thingMemo = new Map(), things = (id) => {
    if (!thingMemo.has(id)) {
      let r = thingWordsOf(set, id, context);
      if (typedFor && !typedFor(id)) { try { const v = worldVocabulary(set, id); if (v?.has) { const base = r; r = { has: (w) => !!base?.has(w) || v.has(w) }; } } catch { /* the things alone */ } }
      thingMemo.set(id, r);
    }
    return thingMemo.get(id);
  };
  // the world's own reader reads the clause whole (hook readsWhole), the raw words `words` (the ones the world's words did not read) included: once per world, sentence and words.
  // A hook that cannot tell (an engine still loading) answers false: an unread word is never accepted on trust.
  const wholeMemo = new Map(), readsWhole = (id, view, words = []) => {
    // the clause as typed: tokens that touch are joined ("a1" is one name, not "a 1")
    const spaced = view.map((t, i) => (i && Number.isFinite(t.start) && t.start === view[i - 1].end ? '' : i ? ' ' : '') + String(t.raw ?? '')).join('');
    const key = `${id}\u0001${spaced}\u0001${words.join(' ')}`;
    if (!wholeMemo.has(key)) { const ex = set?.get?.(id)?.ops?.executor; let r = false; try { r = ex?.readsWhole?.({ text: spaced, words, state: context?.states?.[id] ?? null, phrase: phraseOfSet(set) }) === true; } catch { r = false; } wholeMemo.set(key, r); }
    return wholeMemo.get(key);
  };
  const lowerOf = (t) => t.lower ?? String(t.raw).toLowerCase();
  const content = (t) => word(t) && !FUNCTION_WORDS.has(lowerOf(t));
  const info = matches.map((m) => {
    const view = m.view ?? [], hidden = new Set();   // token indexes this reading does not read by structure (skips and free text)
    for (const [a, b] of m.skipped ?? []) for (let i = a; i < b; i++) hidden.add(i);
    const loose = [];
    for (const sl of Object.values(m.slots ?? {})) if ((sl.class === 'words' || sl.class === 'rest') && sl.tokens) for (let i = sl.tokens[0]; i < sl.tokens[1]; i++) { hidden.add(i); if (sl.class === 'words') loose.push(i); }
    const read = new Set(); view.forEach((t, i) => { if (!hidden.has(i) && content(t)) read.add(lowerOf(t)); });
    return { m, view, loose, read };
  });
  for (const x of info) {
    const out = [];
    for (const [a, b] of x.m.skipped ?? []) for (const t of x.view.slice(a, b)) if (content(t)) out.push(lowerOf(t));
    if (typed) { const skip = [...out]; for (const w of unreadBy(typedFor, x.m, things, { readsWhole })) out.push(w); x.m.unread = out; x.m.unreadStrict = [...new Set([...skip, ...unreadBy(typedFor, x.m, things, { strict: true, readsWhole })])]; if (globalThis.process?.env?.DBG_UNREAD) console.error('unread', x.m.pattern.id, JSON.stringify(out)); continue; }   // the typed world decides what its slots accept; unreadStrict: what a world other than the open tab's leaves unread (rest typed too, spec 16 section 14)
    for (const i of x.loose) {
      const t = x.view[i]; if (!word(t)) continue;
      const w = lowerOf(t);
      if (STRUCTURAL.has(w)) out.push(w);
      else if (foreign && content(t) && !CATALOG_WORLDS.has(x.m.pattern.worldId) && (() => { try { const v = worldVocabulary(set, x.m.pattern.worldId); return v.nouns?.has(w) && !v.has(w); } catch { return false; } })()) out.push(w);
      else if (content(t) && info.some((o) => o.m.pattern.worldId !== x.m.pattern.worldId && o.read.has(w))) out.push(w);
    }
    x.m.unread = out; x.m.unreadStrict = out; if (globalThis.process?.env?.DBG_UNREAD) console.error('unread', x.m.pattern.id, JSON.stringify(out));
  }
}
