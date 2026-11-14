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
    return { ...t, known: new Set(j.known ?? []), args: j.args ?? {}, open: new Set(j.openSlots ?? []), views: new Set(j.views ?? []), worldId: j.world, fits: (target, text) => { const i = target.indexOf('|'); return lib.fitsSlot(t, target.slice(0, i), target.slice(i + 1), text); } };
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
 */
export function unreadBy(typedFor, m, things = null) {
  const tw = typedFor?.(m.pattern.worldId);
  if (!tw) return [];
  const targets = targetsOf(m.pattern), view = m.view ?? [], out = [], extra = things?.(m.pattern.worldId) ?? null;
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
    const argType = tw.args[`${act.split('.').pop()}.${arg}`] ?? tw.args[arg];   // an act's own typing of an argument first (send.place: a view), then the world's
    if (!sig && argType === 'view') {   // another view: a tab, a world or a view word
      for (const t of words) { const w = lower(t); if (t.kind === 'word' && !FUNCTION_WORDS.has(w) && !tw.views.has(w) && !knows(tw, w, extra)) out.push(w); }
      continue;
    }
    if (!sig && (argType === 'place' || (argType === 'phrase' && sl.class !== 'rest'))) {   // a noun phrase of the world's kinds: every content word is typed by the world
      for (const t of words) { const w = lower(t); if (t.kind === 'word' && !FUNCTION_WORDS.has(w) && !knows(tw, w, extra)) out.push(w); }
      continue;
    }
    if (!sig || sl.class === 'rest' && sig.expects !== 'thing' && sig.expects !== 'value') continue;
    const fit = tw.fits?.(target, text) ?? null;
    if (fit && !fit.ok) for (const t of words) { const w = lower(t); if (!FUNCTION_WORDS.has(w)) out.push(w); }
  }
  return [...new Set(out)];
}
