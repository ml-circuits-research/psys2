// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The MT keep-list (ROUND-TRIP-MINING step 3, spec 05 section "Keep-list"): app words the machine translator must not change. They are protected
 * as placeholders before the model sees the text and put back after it ("5 lei" must not become "5 rents", "Twinkle Twinkle" must not become "sparkle sparkle").
 * Browser-safe (no node:* imports). The list is derived from the worlds' English side, never written per language:
 *   - names:     every lexicon of class `name` (people, pets). A name is protected only when written with a capital letter and when no other lexicon holds
 *                the same word (so "Will" or "Spot" as common words are left to the model);
 *   - verbatim:  every lexicon that carries `keep=verbatim` (the currency unit "lei"); protected whatever the case;
 *   - tabs:      the tab id, title and aliases of every manifest, protected only as "the <Name> tab" (a bare "draw" is a verb);
 *   - titles:    the `title` and `aka` values of knowledge entities that have a `title` (song titles), whatever the case;
 *   - session:   names the user told this session (`extra`), protected with a capital letter.
 * Numbers need no placeholder: the translation checker already requires them to survive.
 */

const LETTER = '\\p{L}\\p{N}';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const val = (e) => (e?.value?.v ?? '');
const words = (s) => String(s).toLowerCase().trim().split(/[\s_]+/).filter(Boolean).join(' ');

const cache = new WeakMap();

/** The keep-list of a world set: `{ verbatim: string[], names: string[], tabs: string[] }` (lowercase, longest first). Memoized per set. */
export function keepListOf(set) {
  if (cache.has(set)) return cache.get(set);
  const verbatim = new Set(), names = new Set(), tabs = new Set(), common = new Set();
  const worlds = set.list();
  for (const w of worlds) {
    for (const l of w.lexicons ?? []) {
      const keep = (l.wire?.entries ?? []).some((e) => e.key === 'keep' && val(e) === 'verbatim');
      if (keep) for (const x of l.words ?? []) verbatim.add(words(x));
      else if (l.class === 'name') for (const x of l.words ?? []) names.add(words(x));
      else for (const x of l.words ?? []) common.add(words(x));
    }
    for (const e of w.manifest?.entries ?? []) if (e.key === 'tab' || e.key === 'tabTitle' || e.key === 'tabAlias') tabs.add(words(val(e)));
    for (const k of w.kbRaw ?? []) if ((k.entries ?? []).some((e) => e.key === 'title')) for (const e of k.entries) if (e.key === 'title' || e.key === 'aka') (w.id === 'ui.shell' || k.entries.some((x) => x.key === 'world') ? tabs : verbatim).add(words(val(e)));   // a titled work (a song): its aka names too; a titled entity bound to a world (a tab of ui.shell) is a tab name, not a verbatim word
  }
  for (const x of common) names.delete(x);
  const byLength = (a, b) => b.length - a.length || (a < b ? -1 : 1);
  const out = { verbatim: [...verbatim].filter((x) => x.length >= 3).sort(byLength), names: [...names].filter((x) => x.length >= 3).sort(byLength), tabs: [...tabs].filter((x) => x.length >= 3).sort(byLength) };
  cache.set(set, out);
  return out;
}

/** Names the session knows (told by the user), from the dialog session: [] when there are none. */
export function sessionNames(session) {
  const agents = session?.isession?.form?.agents;
  if (!agents) return [];
  return [...agents.values()].filter((a) => !a.special && a.name).map((a) => String(a.name));
}

const PLACE = (i) => {
  let s = '', n = i;
  do { s = 'abcdefghijklmnopqrstuvwxyz'[n % 26] + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `Zorq${s}`;   // letters only (digits would mix with the numbers the checker compares); survived every model tried
};

const re = (alts, flags) => alts.length ? new RegExp(`(?<![${LETTER}])(?:${alts.map((a) => a.split(' ').map(escapeRe).join('[\\s_]+')).join('|')})(?![${LETTER}])`, flags) : null;

/**
 * Replaces the keep-list words of `text` by placeholders. `keep` = { verbatim, names, tabs } (keepListOf), `extra` = names told in the session.
 * Returns { text, found: [[placeholder, surface]...], restore(out) } where restore returns null when a placeholder did not survive the model.
 */
export function protectText(text, keep, { extra = [] } = {}) {
  let s = String(text ?? '');
  const found = [];
  const put = (m) => { const p = PLACE(found.length); found.push([p, m]); return p; };
  if (keep) {
    const v = re(keep.verbatim, 'giu');
    if (v) s = s.replace(v, put);
    // tabs: only "the <name> tab" / "<name> tab"
    const t = keep.tabs.length ? new RegExp(`(?<![${LETTER}])(?:${keep.tabs.map((a) => a.split(' ').map(escapeRe).join('[\\s_]+')).join('|')})(?=\\s+tab(?![${LETTER}]))`, 'giu') : null;
    if (t) s = s.replace(t, put);
    const n = re([...keep.names, ...extra.map(words).filter((x) => x.length >= 3)], 'giu');   // the capital letter is checked on the match
    if (n) s = s.replace(n, (m) => (/^\p{Lu}/u.test(m) ? put(m) : m));
  } else if (extra.length) {
    const n = re(extra.map(words).filter((x) => x.length >= 3), 'giu');
    if (n) s = s.replace(n, (m) => (/^\p{Lu}/u.test(m) ? put(m) : m));
  }
  const restore = (out) => {
    let r = String(out ?? '');
    for (const [p, surface] of found) {
      const rx = new RegExp(`(?<![${LETTER}])${p}(?![${LETTER}])`, 'i');
      if (!rx.test(r)) return null;
      r = r.replace(new RegExp(`(?<![${LETTER}])${p}(?![${LETTER}])`, 'gi'), () => surface);
    }
    return r;
  };
  return { text: s, found, restore };
}

/**
 * Wraps `translate(text, from, to) -> Promise<string>`: the keep-list words are placeholders for the model. When the model loses a placeholder the
 * unprotected translation is used (the checker of the translation layer still judges it). `getKeep()` = { keep, extra } is read at every call.
 */
export function protectedTranslate(translate, getKeep) {
  return async (text, from, to) => {
    let info;
    try { info = getKeep?.(); } catch { info = null; }
    if (!info || (!info.keep && !(info.extra?.length))) return translate(text, from, to);
    const p = protectText(text, info.keep, { extra: info.extra ?? [] });
    if (!p.found.length) return translate(text, from, to);
    const out = await translate(p.text, from, to);
    const back = p.restore(out);
    return back ?? translate(text, from, to);
  };
}
