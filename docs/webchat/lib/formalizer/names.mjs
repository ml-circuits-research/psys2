/**
 * Proper names from lexicons in the correction vocabulary (RD10, spec 03 section 7.9b). Browser-safe, no dependencies.
 *
 * Every multi-letter lexicon value (places, people, animals, songs, ...; entries are lowercase, words joined by `_`) is indexed by
 * length. A window of 1 to 4 consecutive words of the message ("Pariss", "New Youk") is matched against the WHOLE value with the
 * usual edit budget, capitalized or not. The wrappers around a value ("Bern city", "the city of Bern", "the town of X", "X country")
 * are the `lang.wrap.<kind>.before|after` phrases of `lang.common`; they are removed when they stand next to a value of that kind.
 *
 * Safety rules:
 *   - a window that already is a value, or that has no word unknown to every world, is never moved (never move away from an existing value);
 *   - the result is only a candidate text: the caller keeps it when the rules read it completely;
 *   - the work is limited: lookups are length-bucketed with a letter-count prefilter, and `maxWindows`, `maxPerWindow`, `maxTexts` and a
 *     time budget (`budgetMs`, the best candidates found so far are returned) cap the effort whatever the message looks like.
 */
import { lexIndex } from '../worlds/lexicon.mjs?v=e3316469a7';
import { editDistance } from './rules/index.mjs?v=f273240139';
import { isKnownWord, spellBudget, spellVocabulary } from './spell.mjs?v=8c10eddd4b';

const WORD = /[A-Za-zÀ-ɏ]+/g;
const QUOTE = /"[^"]*"|“[^”]*”/g;
export const NAME_LIMITS = { maxWindows: 16, maxPerWindow: 3, maxTexts: 6, maxSteps: 4000, maxWords: 4, minLength: 4 };

/** Wrapper kind of a lexicon id: which `lang.wrap.<kind>.*` phrases apply to its values. */
export const WRAP_KINDS = [['place', /\.places$/], ['song', /songtitles$/], ['document', /\.docs$/]];

const bag = (s) => { const b = new Uint8Array(27); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i) - 97; b[c >= 0 && c < 26 ? c : 26]++; } return b; };
const bagDiff = (a, b) => { let d = 0; for (let i = 0; i < 27; i++) d += Math.abs(a[i] - b[i]); return d; };

/** Index (memoized per set): values by length, exact lookup, wrapper phrases by kind. */
export function nameIndex(set) {
  return set.memo('name-index', () => {
    const lex = lexIndex(set);
    const byLen = new Map(), exact = new Map();
    for (const l of lex.lexicons.values()) {
      const kind = WRAP_KINDS.find(([, re]) => re.test(l.id))?.[0] ?? null;
      for (const w of l.words) {
        const key = w.replace(/_/g, ' ');
        if (!/^[a-z ]+$/.test(key) || key.length < NAME_LIMITS.minLength) continue;
        let e = exact.get(key);
        if (!e) { e = { key, worlds: new Set(), kinds: new Set(), bag: bag(key) }; exact.set(key, e); const a = byLen.get(key.length) ?? []; a.push(e); byLen.set(key.length, a); }
        e.worlds.add(l.worldId);
        if (kind) e.kinds.add(kind);
      }
    }
    const wrap = { before: new Map(), after: new Map() };
    for (const ph of lex.phrases.values()) {
      const m = /^lang\.wrap\.(\w+)\.(before|after)$/.exec(ph.id);
      if (m) wrap[m[2]].set(m[1], ph.alts.map((a) => a.map((x) => x.toLowerCase())));
    }
    return { byLen, exact, wrap };
  });
}

/**
 * Candidate texts for `text` in which a name-like window is replaced by the closest lexicon value and/or the wrappers of a value are removed.
 * `worldOrder` lists world ids, the active one first: among equal distances their values rank first.
 * @returns {{ text: string, worlds: string[], corrections: { from: string, to: string, span: [number, number], kind: 'name'|'wrapper' }[] }[]}
 */
export function nameCandidates(text, { set, vocab = spellVocabulary(set), worldOrder = [], limits = {} } = {}) {
  const L = { ...NAME_LIMITS, ...limits };
  const idx = nameIndex(set);   // built once per world set, outside the time budget
  let steps = 0;   // work counted in steps (windows looked at, edit distances computed), never in milliseconds: the result must not depend on machine speed
  const quoted = [...text.matchAll(QUOTE)].map((m) => [m.index, m.index + m[0].length]);
  const toks = [...text.matchAll(WORD)].map((m) => ({ raw: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length })).filter((t) => !quoted.some(([a, b]) => t.start >= a && t.end <= b)).slice(0, 80);
  if (!toks.length) return [];
  const rank = (e) => { const r = worldOrder.findIndex((w) => e.worlds.has(w)); return r < 0 ? 99 : r; };
  const unknown = (w) => !(vocab ? isKnownWord(w, vocab) : false);
  const contiguous = (a, b) => /^[\s,'-]*$/.test(text.slice(a.end, b.start)) && !/[,]/.test(text.slice(a.end, b.start));
  const found = [];   // { i, n, from, to, dist, kinds, rank, replace }
  let windows = 0;
  outer: for (let i = 0; i < toks.length; i++) {
    for (let n = Math.min(L.maxWords, toks.length - i); n >= 1; n--) {
      if (n > 1 && !contiguous(toks[i + n - 2], toks[i + n - 1])) continue;
      if (++steps > L.maxSteps) break outer;
      const win = toks.slice(i, i + n);
      const key = win.map((t) => t.lower).join(' ');
      if (key.length < L.minLength || key.length > 40) continue;
      const exact = idx.exact.get(key);
      if (exact) { found.push({ i, n, from: key, to: key, dist: 0, kinds: exact.kinds, rank: rank(exact) }); continue; }
      if (!win.some((t) => t.lower.length >= 3 && unknown(t.lower))) continue;   // every word is valid somewhere: nothing to fix
      if (++windows > L.maxWindows) break outer;
      const maxEdits = spellBudget(key);
      if (!maxEdits) continue;
      const kb = bag(key), hits = [];
      for (let len = key.length - maxEdits; len <= key.length + maxEdits; len++) {
        for (const e of idx.byLen.get(len) ?? []) {
          if (bagDiff(kb, e.bag) > 2 * maxEdits) continue;
          steps++;
          const d = editDistance(key, e.key, maxEdits);
          if (d <= maxEdits) hits.push({ e, d });
        }
      }
      hits.sort((a, b) => a.d - b.d || rank(a.e) - rank(b.e) || a.e.key.localeCompare(b.e.key));
      for (const h of hits.slice(0, L.maxPerWindow)) found.push({ i, n, from: win.map((t) => t.raw).join(' '), to: h.e.key, dist: h.d, kinds: h.e.kinds, rank: rank(h.e), worlds: [...h.e.worlds] });
    }
  }
  // wrappers next to a value of the right kind
  const wordsAt = (k) => toks[k]?.lower;
  const extend = (f) => {
    let lo = f.i, hi = f.i + f.n - 1;
    for (const kind of f.kinds) {
      for (const alt of idx.wrap.before.get(kind) ?? []) {
        const s = lo - alt.length;
        if (s >= 0 && alt.every((w, k) => wordsAt(s + k) === w)) { lo = s; break; }
      }
      for (const alt of idx.wrap.after.get(kind) ?? []) {
        if (hi + alt.length < toks.length && alt.every((w, k) => wordsAt(hi + 1 + k) === w)) { hi += alt.length; break; }
      }
    }
    return [lo, hi];
  };
  const out = [], seen = new Set();
  const push = (f) => {
    const [lo, hi] = extend(f);
    const changed = f.dist > 0 || lo < f.i || hi > f.i + f.n - 1;
    if (!changed) return;
    const a = toks[lo].start, b = toks[hi].end;
    const kept = f.dist > 0 ? f.to : text.slice(toks[f.i].start, toks[f.i + f.n - 1].end);
    const result = text.slice(0, a) + kept + text.slice(b);
    if (seen.has(result)) return;
    seen.add(result);
    out.push({ text: result, worlds: f.worlds ?? [], dist: f.dist, rank: f.rank, size: f.n, corrections: [{ from: text.slice(a, b), to: kept, span: [a, b], kind: f.dist > 0 ? 'name' : 'wrapper' }] });
  };
  for (const f of found) push(f);
  out.sort((x, y) => x.dist - y.dist || x.rank - y.rank || y.size - x.size);
  return out.slice(0, L.maxTexts).map(({ text: t, corrections, worlds }) => ({ text: t, corrections, worlds }));
}
