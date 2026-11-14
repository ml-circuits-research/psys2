// SPDX-License-Identifier: AGPL-3.0-only
/**
 * TYPED WORLDS at run time (spec 16 section 13; Q16; sopworld 0.114 `typedWorldFor`, `fitsSlot`). Browser-safe: no `node:*`.
 *
 * Every world with patterns ships `typed.json` (scripts/build-typed-worlds.mjs): the description of its kinds and keys, the words of its own lexicons, the typing of its request
 * arguments and the things of the knowledge types its keys join. `createTypedWorlds({ lib, set })` turns that file into the library's typed world the first time a world is asked for
 * (`typedFor(worldId, { things })`; the session's things are added at run time) and keeps it. The typed world is what completeness (src/formalizer/completeness.mjs), arbitration by
 * coverage (routing.mjs) and the ensemble (`ensemble`) read by types, in place of the untyped pattern heuristic.
 *
 * What a typed world can say about a reading: `unreadBy(typed, match)` = the content words of the free-text slots of the reading that the world's types do not accept (a `thing` that is
 * not a kind of the world, a name that is a question or an act of the world, a value outside its closed set, a number that is not one). A slot nobody typed is free: nothing is unread.
 */
import { FUNCTION_WORDS } from './spell.mjs';
import { lemmaCandidates } from '../knowledge/facts.mjs';

const FREE = new Set(['words', 'noun', 'word', 'rest']);
/**
 * LEFTOVER arguments (spec 16 section 13; owner export 2026-11-14 22:43): `pre` / `post` are the raw words a catch-all pattern swallows around its one literal ("{pre} diagram {post}").
 * Nobody types them, so they are checked against the world's own words in every world, a world with its own reader included: a content word the world does not know is unread.
 */
export const LEFTOVER = new Set(['pre', 'post']);
/** The arguments of a request that carry raw text, not a typed value: the leftovers, the own reader's `rest`, and `text` (the whole clause). */
const RAW_ARGS = new Set(['pre', 'post', 'rest', 'text']);
/**
 * A CATCH-ALL reading: a request whose every captured argument is raw text (leftovers or the whole rest), so nothing in it is typed ("{pre} diagram {post}" handing the sentence to a
 * reader). It is a LAST RESORT: when it leaves words unread it is not executed and the reply says what was not understood (src/dialog/index.mjs).
 */
export function isCatchAll(pattern) {
  if (!pattern) return false;
  const emit = String(pattern.emit ?? '');
  if (!/\baction=/.test(emit)) return false;
  const captured = [...emit.matchAll(/\barg\.(\w+)=\\?"?\{(\w+)\}/g)].map((m) => m[1]);
  return captured.some((a) => LEFTOVER.has(a) || a === 'rest') && captured.every((a) => RAW_ARGS.has(a));
}
const lower = (t) => String(t.lower ?? t.raw ?? '').toLowerCase();
const isWord = (t) => (t.kind === 'word' || t.kind === 'number') && !t.filler;

/** The typed target a slot of a pattern fills, from the pattern's emit: `<type>|<key>` of a state fact (`@{_} kids.animals.animal name={a}`) or `<action>|<arg>` of a request (`action=a.b arg.thing="{thing}"`). */
const TARGETS = new WeakMap();
export function targetsOf(pattern) {
  let r = TARGETS.get(pattern);
  if (r) return r;
  r = {};
  const emit = String(pattern.emit ?? '');
  const act = /\baction=([\w.]+)/.exec(emit)?.[1];
  for (const line of emit.split(/\\n|\n/)) {
    const m = /^@\{[^}]*\}\s+([\w.]+)\s+(.*)$/.exec(line.trim());
    if (m && m[1] !== 'core.request') for (const t of m[2].matchAll(/([\w.]+)=\\?"?\{(\w+)\}/g)) r[t[2]] ??= `${m[1]}|${t[1]}`;
  }
  if (act) for (const t of emit.matchAll(/\barg\.([\w]+)=\\?"?\{(\w+)\}/g)) r[t[2]] ??= `${act}|${t[1]}`;
  TARGETS.set(pattern, r);
  return r;
}

/** One world's typed bundle: { world (library World), slots, lexicon, known (Set), args, counts }, or null (no typed.json, no library, or a description the library refused). */
function buildTyped(lib, raw, things) {
  let j;
  try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!j?.description || !lib?.typedWorldFor) return null;
  const know = { ofType: (t) => (j.knowledge?.[t] ?? []).map((x) => ({ attrs: { name: [x.name], ...(x.kind ? { kind: [x.kind] } : {}) } })) };
  try {
    const t = lib.typedWorldFor(j.description, know, { things: things ?? [] });
    return { ...t, known: new Set(j.known ?? []), args: j.args ?? {}, raw: !!j.rawArgs, open: new Set(j.openSlots ?? []), views: new Set(j.views ?? []), worldId: j.world, fits: (target, text) => { const i = target.indexOf('|'); return lib.fitsSlot(t, target.slice(0, i), target.slice(i + 1), text); } };
  } catch { return null; }
}

/** The typed worlds of a world set, built lazily and kept. `typedFor(id, { things })`: with the session's things the bundle is rebuilt (memoised by the things' signature). */
export function createTypedWorlds({ lib, set }) {
  const base = new Map(), withThings = new Map();
  const rawOf = (id) => set.get(id)?.raw?.typed ?? null;
  return {
    typedFor(id, { things = null } = {}) {
      const raw = rawOf(id);
      if (raw == null || !lib?.typedWorldFor) return null;
      if (!things?.length) { if (!base.has(id)) base.set(id, buildTyped(lib, raw, [])); return base.get(id); }
      const sig = `${id}\u0001${JSON.stringify(things)}`;
      if (!withThings.has(sig)) { if (withThings.size > 8) withThings.clear(); withThings.set(sig, buildTyped(lib, raw, things)); }
      return withThings.get(sig);
    },
    has: (id) => rawOf(id) != null,
  };
}

/** The words of the things the session holds in a world (the names and kinds of its referents): the run-time part of a typed world, cheap (no rebuild). Null when the world has none to give. */
export function thingWordsOf(set, id, context) {   // not cached by the state object: worlds change their state in place; the caller memoises per reading (annotateUnread)
  const ex = set?.get?.(id)?.ops?.executor, st = context?.states?.[id];
  if (!ex?.referents || !st || typeof st !== 'object') return null;
  let r = new Set();
  try {
    const add = (x) => { for (const w of String(x ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) r.add(w); };
    for (const t of ex.referents({ state: st, knowledge: null }) ?? []) for (const x of [t.name, t.kind, t.label, t.id, t.noun, ...(t.words ?? []), ...Object.values(t.attrs ?? {}).filter((v) => typeof v === 'string' && v.length < 40)]) add(x);
    for (const it of Array.isArray(st.items) ? st.items : []) { add(it?.name); add(it?.label); }   // the names of the things of a schema world (spec 21: `items`), which its referents keep in their signature only
  } catch { r = null; }
  return r;
}

/** Is `w` (lowercase) a word the typed world knows: of its lexicons, kinds, attributes and values, a thing of its knowledge or session, or an inflection of one. */
function knows(tw, w, extra) {
  if (tw.known.has(w) || tw.lexicon.has(w) || extra?.has(w)) return true;
  return lemmaCandidates(w).some((f) => tw.known.has(f) || tw.lexicon.has(f) || extra?.has(f));
}

/**
 * The content words of the free-text slots of a reading (`m`: a candidate match with `slots`, `view`, `pattern`) that the typed world of the pattern's world does not accept.
 * `typedFor(id)` gives the bundle. Returns [] when the world has no typed bundle or no slot is typed.
 * `strict` (the FULL reading a world other than the open tab's needs, spec 16 section 14): a `rest` capture is typed like any other free text (dictation is free only in the tab's own world).
 */
export function unreadBy(typedFor, m, things = null, { strict = false, readsWhole = null } = {}) {   // `readsWhole(worldId, view)`: the world's own reader reads the whole clause (leftovers are then read)
  const tw = typedFor?.(m.pattern.worldId);
  if (!tw) return [];
  const targets = targetsOf(m.pattern), view = m.view ?? [], out = [], extra = things?.(m.pattern.worldId) ?? null;
  // a world with its own reader whose reading captured only free text (no lexicon or typed slot): the reading is a catch-all too (the engine reads the words, nothing else typed them)
  if (tw.raw) { const caps = Object.entries(m.slots ?? {}).filter(([n, sl]) => sl?.tokens && targets[n] && !targets[n].endsWith('|text')); if (caps.length && caps.every(([, sl]) => FREE.has(sl.class))) m.rawOnly = true; }
  for (const [name, sl] of Object.entries(m.slots ?? {})) {
    if (!sl?.tokens || !FREE.has(sl.class)) continue;
    const target = targets[name];
    if (!target) continue;
    const words = view.slice(sl.tokens[0], sl.tokens[1]).filter(isWord);
    if (!words.length) continue;
    const text = words.map((t) => String(t.raw)).join(' ');
    if (tw.open.has(target)) continue;
    const sig = tw.slots.get(target);
    const [act, arg] = target.split('|');
    if ((LEFTOVER.has(arg) || (tw.raw && arg !== "text")) && !sig) {   // raw leftover words (or any free text of a world with its own reader): unread unless the world knows them, or its own reader reads the whole clause (hook `readsWhole`)
      const left = words.map(lower).filter((w, i) => words[i].kind === 'word' && !FUNCTION_WORDS.has(w) && !knows(tw, w, extra));
      if (left.length && !readsWhole?.(m.pattern.worldId, view)) out.push(...left);
      continue;
    }
    const argType = tw.args[`${act.split('.').pop()}.${arg}`] ?? tw.args[arg];   // an act's own typing of an argument first (send.place: a view), then the world's
    if (!sig && argType === 'view') {   // another view: a tab, a world or a view word
      for (const t of words) { const w = lower(t); if (t.kind === 'word' && !FUNCTION_WORDS.has(w) && !tw.views.has(w) && !knows(tw, w, extra)) out.push(w); }
      continue;
    }
    if (!sig && (argType === 'place' || (argType === 'phrase' && (strict || sl.class !== 'rest')))) {   // a noun phrase of the world's kinds: every content word is typed by the world
      for (const t of words) { const w = lower(t); if (t.kind === 'word' && !FUNCTION_WORDS.has(w) && !knows(tw, w, extra)) out.push(w); }
      continue;
    }
    if (!sig || !strict && sl.class === 'rest' && sig.expects !== 'thing' && sig.expects !== 'value') continue;
    const fit = tw.fits?.(target, text) ?? null;
    if (fit && !fit.ok) for (const t of words) { const w = lower(t); if (!FUNCTION_WORDS.has(w)) out.push(w); }
  }
  return [...new Set(out)];
}
