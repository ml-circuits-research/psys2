// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Where a kind of thing usually is, at the knowledge tier (spec 23, T3 rule transfer): `habitat(knowledge, word)` and the zone of a place value (`zoneOfWord`). Split out of
 * commonsense.mjs (which keeps the sentences said about it: placePhrase, adviceFor, habitatSentence) so that a tool that only places things (the drawing board) reaches no sentence
 * and no word handling (reviewer 2026-11-16 04:00). Every regex here runs on catalog values (kind names, place values), not on a person's words. Pure and browser-safe.
 */
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const lc = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').trim();   // glue-lint: tool-data (kind name)

// TEMPORARY (until k.commonsense has a place hierarchy): which broad zone of a picture a place word belongs to. A zone is where the drawing board puts a thing: the sky, the ground, the water.
export const ZONES = {
  water: ['water', 'sea', 'ocean', 'lake', 'pond', 'river', 'stream', 'bay', 'harbour', 'harbor'],
  sky: ['sky', 'air', 'clouds'],
  ground: ['ground', 'land', 'grass', 'road', 'street', 'field', 'garden', 'forest', 'park', 'town', 'village', 'farm', 'hill', 'mountain', 'meadow', 'beach', 'desert', 'rails', 'track'],
};
export const zoneOfWord = (w) => { const x = lc(w).replace(/^(?:the|a|an)\s+/, ''); return Object.keys(ZONES).find((z) => ZONES[z].includes(x)) ?? null; };   // glue-lint: tool-data (catalog place value)

/**
 * The usual places of a kind: `{ at: ['water'], zones: ['water'], source: 'catalog' | 'scenes' | 'learned', via }` or null when the knowledge says nothing. `via` is the kind whose place it is when it
 * comes from above in the kind-of chain (a villa: house).
 */
export function habitat(knowledge, word, depth = 0) {
  // kept per word while the knowledge answers the same (OVERLAY-MEMO: the drawing board asks for every object near every spot it tries); a copy is handed out
  if (depth === 0 && typeof knowledge?.memo === 'function' && word) {
    const h = knowledge.memo('habitat', lc(word), () => habitatOf(knowledge, word, 0));
    return h ? { ...h, at: [...h.at], zones: [...h.zones] } : null;
  }
  return habitatOf(knowledge, word, depth);
}
function habitatOf(knowledge, word, depth) {
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

