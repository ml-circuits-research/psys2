// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SENSITIVE THINGS ARE NEVER OFFERED UNASKED (reviewer 2026-11-15 03:35 (a); knowledge Q76; owner export 2026-11-14 22:43: the chip "Add a weapon." after a sunny scene).
 * The catalog marks a lemma `k.kinds.sensitivity name=<lemma> sensitive=weapon|drug|alcohol|tobacco` (shard k.kinds/shards/sensitive). Before a suggestion chip, an example chip
 * or any random choice (the dice too), a thing found there is dropped unless the user named it in the turn. One general filter: the sampler applies it to every world's lists
 * and to every sampled item. Browser-safe, synchronous on the read side: the one shard is loaded in the background (`prefetchSensitive`, about 90 wires, never awaited by a
 * turn); before it has arrived (or at a catalog commit without the type) nothing is known sensitive and nothing is dropped by it.
 */
export const SENSITIVE_TYPE = 'k.kinds.sensitivity';
const plain = (v) => String(v ?? '').replace(/^"|"$/g, '').toLowerCase().trim();
const loaded = new WeakMap();   // catalog -> Map(lemma -> category) | 'loading'
const SHARD = /(?:^|\/)sensitive(?:\.sop)?$/;   // only the shard that holds the type (not every shard of k.kinds)

/** lemma -> category from wires (`{ f: { name, sensitive } }` or `{ attrs }`). */
export function mapOf(ws) {
  const m = new Map();
  for (const w of ws ?? []) { const f = w?.f ?? w?.attrs ?? {}; const name = plain([].concat(f.name ?? [])[0]); if (name) m.set(name, plain([].concat(f.sensitive ?? [])[0]) || 'yes'); }
  return m;
}

/** Starts loading the type once per catalog (never awaited by a turn). */
export function prefetchSensitive(knowledge) {
  if (!knowledge?.wires || loaded.has(knowledge)) return;
  loaded.set(knowledge, 'loading');
  Promise.resolve().then(() => knowledge.wires(SENSITIVE_TYPE, { shard: (x) => SHARD.test(String(x?.id ?? '')) }))
    .then((ws) => loaded.set(knowledge, mapOf(ws)), () => loaded.delete(knowledge));
}

/** lemma -> category (a Map; empty while the type is not loaded, or at a catalog commit without it). */
export function sensitiveMap(knowledge) {
  const m = knowledge ? loaded.get(knowledge) : null;
  return m instanceof Map ? m : new Map();
}

/** The lemma a chip or list entry is about: "a sword" -> sword, "Add a sword." -> sword (any word of the text is checked). */
const wordsOf = (text) => plain(text).split(/[^a-z]+/).filter(Boolean);
const singular = (w) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('es') && w.length > 4 ? w.slice(0, -2) : w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);

/** Is the text about a sensitive thing the user did not name in `said` (the turn's words)? */
export function unaskedSensitive(text, { map, said = '' } = {}) {
  if (!map?.size) return false;
  const named = new Set(wordsOf(said).flatMap((w) => [w, singular(w)]));
  return wordsOf(text).some((w) => [w, singular(w)].some((x) => map.has(x) && !named.has(x)));
}

/** Drops the entries (strings, or items with `text` / `thing`) about a sensitive thing the user did not name. */
export function dropSensitive(list, { knowledge, map = sensitiveMap(knowledge), said = '' } = {}) {
  if (!Array.isArray(list) || !map.size) return list;
  return list.filter((x) => !unaskedSensitive(typeof x === 'string' ? x : `${x?.text ?? ''} ${x?.thing ?? ''}`, { map, said }));
}
