// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Common sense at the knowledge tier (spec 23, T3 rule transfer): where a kind of thing usually is, read from the knowledge a world is given (`ctx.knowledge`: the catalog with what the session
 * was taught laid over it), so that one fact ("fish live in water", "a house stands on the ground", "lighthouses stand on the ground" taught in a sentence) gives the right behaviour in every
 * view: the drawing board puts the thing where it belongs and says so when the user puts it elsewhere, Talk says where it is found, the diagram can refuse or label with the reason.
 * A world asks `habitat(knowledge, word)`; it keeps no table of kinds. Pure and browser-safe (no `node:*`); the lookup is the settled one (`peek`), so nothing here waits.
 *
 * Sources, all read through `peek`: `k.commonsense.thing at=` (a catalog fact or a taught one, the overlay merges them), `k.scenes.thing place=` (the usual place in a picture, `th.wires`). The kind-of chain
 * is followed (`ancestors`): a villa stands where a house stands, unless it has a place of its own.
 */
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const lc = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').trim();

// TEMPORARY (until k.commonsense has a place hierarchy): which broad zone of a picture a place word belongs to. A zone is where the drawing board puts a thing: the sky, the ground, the water.
export const ZONES = {
  water: ['water', 'sea', 'ocean', 'lake', 'pond', 'river', 'stream', 'bay', 'harbour', 'harbor'],
  sky: ['sky', 'air', 'clouds'],
  ground: ['ground', 'land', 'grass', 'road', 'street', 'field', 'garden', 'forest', 'park', 'town', 'village', 'farm', 'hill', 'mountain', 'meadow', 'beach', 'desert', 'rails', 'track'],
};
export const zoneOfWord = (w) => { const x = lc(w).replace(/^(?:the|a|an)\s+/, ''); return Object.keys(ZONES).find((z) => ZONES[z].includes(x)) ?? null; };
const PREP = { water: 'in', sky: 'in the', ground: 'on the' };
/** "in water", "in the sky", "on the ground", "on the road": a place word with its preposition. */
export const placePhrase = (w) => { const x = lc(w).replace(/^(?:the|a|an)\s+/, ''); const z = zoneOfWord(x); if (z === 'water') return x === 'water' ? 'in water' : `in the ${x}`; if (z === 'sky') return 'in the sky'; return `${/^(?:road|street|rails|track|beach|field|ground|grass)$/.test(x) ? 'on' : 'in'} the ${x}`; };

/**
 * The usual places of a kind: `{ at: ['water'], zones: ['water'], source: 'catalog' | 'scenes' | 'learned', via }` or null when the knowledge says nothing. `via` is the kind whose place it is when it
 * comes from above in the kind-of chain (a villa: house).
 */
export function habitat(knowledge, word, depth = 0) {
  budget.tick('commonsense.habitat');
  const k = knowledge;
  if (!k?.peek || !word || depth > 4) return null;
  const w = lc(word);
  const th = k.peek(w);
  const at = [];
  let source = th?.learned && th?.commonsense?.shard === 'session.learned' ? 'learned' : 'catalog';
  for (const x of th?.wires ?? []) { if (String(x.type).startsWith('k.scenes.thing')) for (const p of x.f?.place ?? []) { const v = lc(p); if (v && v !== 'on thing' && v !== 'indoors' && !at.includes(v)) { at.push(v); if (source === 'catalog') source = 'scenes'; } } }   // the usual place of a picture first: it is one of the broad zones
  for (const v of (th?.commonsense?.at ?? []).map(lc)) if (!at.includes(v)) at.push(v);
  if (at.length) return { at, zones: [...new Set(at.map(zoneOfWord).filter(Boolean))], source, via: null };
  for (const p of (k.ancestors?.(w) ?? []).slice(0, 3)) {
    const h = habitat(k, p, depth + 1);
    if (h) return { ...h, via: h.via ?? p };
  }
  return null;
}

/** What to say, short, when a thing of a kind is put in a place its usual places do not include; null when it is fine or the knowledge says nothing. `name` is the kind as the user says it. */
export function adviceFor(knowledge, name, placeWord) {
  const zone = zoneOfWord(placeWord);
  if (!zone) return null;
  const h = habitat(knowledge, name);
  if (!h || !h.zones.length || h.zones.includes(zone)) return null;
  const a = /^[aeiou]/.test(lc(name)) ? 'An' : 'A';
  return `${a} ${lc(name)} is usually found ${placePhrase(h.at[0])}, not ${placePhrase(placeWord)}.`;
}

/** "You find it in water." for Talk: the usual places of a kind as a sentence, or '' when none. */
export function habitatSentence(knowledge, name) {
  const h = habitat(knowledge, name);
  if (!h) return '';
  return `You find it ${h.at.slice(0, 3).map(placePhrase).join(' or ')}.`;
}
