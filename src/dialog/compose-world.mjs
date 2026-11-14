// SPDX-License-Identifier: AGPL-3.0-only
// The knowledge side of `std.compose` (spec 26): the world the library composes from (the bundled subset of the catalog: k.genres, k.interest, k.story and what it fills from, the
// facts about the animals and the countries, and w.lang.en's generation templates; the live catalog adds to it, see `addCatalog`), the choice of a random topic by interest, and the
// genre of a document type. The sentences are the library's (`discourseRealiser` over the language world's templates); the host's part is src/lang/en-generate.mjs. Browser-safe: no `node:*`.
import { BUNDLED_ANIMALS } from '../knowledge/bundled-animals.mjs';
import { BUNDLED_INTEREST } from '../knowledge/bundled-interest.mjs';
import { BUNDLED_GENRES } from '../knowledge/bundled-genres.mjs';
import { BUNDLED_GEO } from '../knowledge/bundled-geo.mjs';
import { BUNDLED_COMPOSE } from '../knowledge/bundled-compose.mjs';

const worlds = new WeakMap();
/** The library World holding k.interest and the bundled facts (built once per library). */
export function knowledgeWorld(lib) {
  if (worlds.has(lib)) return worlds.get(lib);
  const w = new lib.World();
  for (const text of Object.values(BUNDLED_INTEREST.files)) w.tell(text);
  for (const [p, text] of Object.entries(BUNDLED_ANIMALS.files)) if (p.includes('/shards/')) w.tell(text);
  for (const text of Object.values(BUNDLED_GENRES.files)) w.tell(text);   // k.genres: the document types as structure (genre, parts, steps, moves, registers)
  w.tell(BUNDLED_GEO.text);   // k.geo: the countries, their neighbours and areas
  for (const text of Object.values(BUNDLED_COMPOSE.files)) w.tell(text);   // k.story and its fills, w.lang.en's templates, what the catalog says about the animals
  worlds.set(lib, w);
  return w;
}

/** The name of the `k.genres.genre` that holds a document type (`scientific-article` also as `scientific_article`), or null. */
export function genreOf(world, type) {
  const names = new Set([type, String(type).replace(/-/g, '_'), String(type).replace(/-/g, ' ')]);
  for (const g of world.ofType('k.genres.genre')) { const n = String(g.attrs.name?.[0] ?? '').replace(/^"|"$/g, ''); if (names.has(n)) return n; }
  return null;
}

/** The topics the knowledge can be composed about: the names of the animals and of the countries (lowercase -> the name as the knowledge writes it). */
export function topicIndex(world) {
  const m = new Map();
  for (const t of ['k.animals.animal', 'k.geo.country']) for (const w of world.ofType(t)) { const n = String(w.attrs.name?.[0] ?? ''); if (n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), { name: n, type: t }); }
  return m;
}
export const topicsOf = (world) => [...topicIndex(world).values()].map((x) => x.name).sort();

/** Random topics chosen by interest, best first: the library's k.interest (weights drawn inside their ranges by the seed) over a seeded sample of the subjects with a one-word name. */
export function randomTopics(lib, world, seed = 1, count = 14) {
  const names = [...topicIndex(world).values()].filter((t) => /^[A-Za-z]+$/.test(t.name)); if (!names.length) return [];
  let x = (Number(seed) || 1) >>> 0;
  const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const sample = [...names].sort(() => next() - 0.5).slice(0, 24);
  const scored = sample.map((t) => { const subject = world.ofType(t.type).find((w) => w.attrs.name?.[0] === t.name); return [t.name, subject ? lib.interestOf(world, subject, { topic: t.name, draw: Math.floor(next() * 1e6) }).score : -1]; });
  return scored.sort((a, b) => b[1] - a[1]).slice(0, count).map(([n]) => n);
}

const langWorlds = new WeakMap();
/** The library World of the language alone: the generation templates of w.lang.en (acts and discourse), its irregular plurals, auxiliaries and prepositions, the verbs of k.actions and the joins of the schemas: what `englishOf` reads (src/lang/en-generate.mjs). Small: the dice and the summary do not need the rest of the knowledge. */
export function languageWorld(lib) {
  if (langWorlds.has(lib)) return langWorlds.get(lib);
  const w = new lib.World();
  for (const [p, text] of Object.entries(BUNDLED_COMPOSE.files)) if (/^w\.lang\.en|^k\.actions$|^joins$/.test(p)) w.tell(text);
  langWorlds.set(lib, w);
  return w;
}
