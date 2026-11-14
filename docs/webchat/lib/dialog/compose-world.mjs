// SPDX-License-Identifier: AGPL-3.0-only
// The knowledge side of `std.compose` (spec 26): the world the library composes from (the bundled subset of the catalog: k.interest's model and the k.animals facts; the catalog
// replaces it when more worlds are bundled), the choice of a random topic by interest, the genre of a document type (only when the knowledge holds a `k.genres.genre` for it), and the
// English realisation of a frame (TEMPORARY, until the language world realises frames: one clause per attribute of a k.animals fact). Browser-safe: no `node:*`.
import { BUNDLED_ANIMALS } from '../knowledge/bundled-animals.mjs?v=79d9d45ee8';
import { BUNDLED_INTEREST } from '../knowledge/bundled-interest.mjs?v=f2803610a2';

const worlds = new WeakMap();
/** The library World holding k.interest and the bundled facts (built once per library). */
export function knowledgeWorld(lib) {
  if (worlds.has(lib)) return worlds.get(lib);
  const w = new lib.World();
  for (const text of Object.values(BUNDLED_INTEREST.files)) w.tell(text);
  for (const [p, text] of Object.entries(BUNDLED_ANIMALS.files)) if (p.includes('/shards/')) w.tell(text);
  worlds.set(lib, w);
  return w;
}

/** The name of the `k.genres.genre` that holds a document type (`scientific-article` also as `scientific_article`), or null. */
export function genreOf(world, type) {
  const names = new Set([type, String(type).replace(/-/g, '_'), String(type).replace(/-/g, ' ')]);
  for (const g of world.ofType('k.genres.genre')) { const n = String(g.attrs.name?.[0] ?? '').replace(/^"|"$/g, ''); if (names.has(n)) return n; }
  return null;
}

/** The topics the knowledge can be composed about: the names of the subjects of the bundled facts. */
export const topicsOf = (world) => [...new Set(world.ofType('k.animals.animal').map((w) => String(w.attrs.name?.[0] ?? '')).filter(Boolean))].sort();

/** Random topics chosen by interest, best first: the library's k.interest (weights drawn inside their ranges by the seed) over a seeded sample of the subjects with a class (one-word names: a name with a space is not matched as a topic). */
export function randomTopics(lib, world, seed = 1, count = 6) {
  const names = topicsOf(world).filter((n) => /^[a-z]+$/.test(n)); if (!names.length) return [];
  let x = (Number(seed) || 1) >>> 0;
  const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const sample = [...names].sort(() => next() - 0.5).slice(0, 20);
  const scored = sample.map((n) => { const subject = world.ofType('k.animals.animal').find((w) => w.attrs.name?.[0] === n && w.attrs.class); return [n, subject ? lib.interestOf(world, subject, { topic: n, draw: Math.floor(next() * 1e6) }).score : -1]; });
  return scored.sort((a, b) => b[1] - a[1]).slice(0, count).map(([n]) => n);
}

const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const art = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
const clauses = {
  class: (v) => `is ${art(v[0])} ${v[0]}`, covering: (v) => `is covered with ${list(v)}`, legs: (v) => `has ${v[0]} legs`, habitat: (v) => `lives in the ${list(v)}`,
  diet: (v) => `is ${art(v[0])} ${v[0]}`, eats: (v) => `eats ${list(v)}`, can: (v) => `can ${list(v)}`, cannot: (v) => `cannot ${list(v)}`, sound: (v) => `makes the sound ${list(v)}`,
  baby: (v) => `has young called ${list(v)}`, group: (v) => `lives in a ${v[0]}`,
};
/** One English sentence of a frame { move, fact: { type, attrs }, about } of a k.animals fact; null for anything else (no invented wording). */
export function realiseFrame(f) {
  if (f?.fact?.type !== 'k.animals.animal') return null;
  const a = f.fact.attrs, name = a.name?.[0] ?? f.about;
  const parts = Object.entries(a).filter(([k, v]) => clauses[k] && v?.length).map(([k, v]) => clauses[k](v.map(String)));
  if (!parts.length) return null;
  const subject = f.move === 'introduce' ? `The ${name}` : f.move === 'conclude' ? `Finally, the ${name}` : `The ${name}`;
  const text = `${subject} ${list(parts)}.`;
  return text.replace(/ +/g, ' ');
}

/** A chapter's title from the type of the facts it holds ("k.animals.animal" -> "The animal"). */
export const chapterTitle = (type) => { const t = String(type).split('.').at(-1).replace(/_/g, ' '); return `The ${t}`; };
