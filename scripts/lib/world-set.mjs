/**
 * A dialog engine restricted to some worlds (and their imports): the rules of the LABELLED world read a text, never another
 * world's. Used by the paraphrase collector and by scripts/lib/relabel.mjs, so that a label is always the reading of the world it names.
 */

/** A rule set restricted to some worlds (and their imports). */
export function restrictedSet(set, ids) {
  const all = [...new Set(ids.flatMap((w) => (set.get(w) ? set.available(w) : [])))];
  const sub = Object.create(set);
  sub._cache = new Map();
  sub.list = () => all.map((i) => set.get(i));
  return sub;
}

/** An engine view whose sessions see only `ids` (the engine's other parts are shared). Memoized per engine. */
export function restrictedEngine(engine, ids) {
  const cache = (engine._restricted ??= new Map());
  const k = ids.join('|');
  if (!cache.has(k)) cache.set(k, Object.assign(Object.create(engine), { set: restrictedSet(engine.set, ids) }));
  return cache.get(k);
}
