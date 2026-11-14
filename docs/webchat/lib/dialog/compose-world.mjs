// SPDX-License-Identifier: AGPL-3.0-only
// The knowledge side of `std.compose` (spec 26): the world the library composes from (the bundled subset of the catalog: k.interest's model and the k.animals facts; the catalog
// replaces it when more worlds are bundled), the choice of a random topic by interest, the genre of a document type (only when the knowledge holds a `k.genres.genre` for it), and the
// English realisation of a frame (TEMPORARY, until the language world realises frames: one clause per attribute of a k.animals fact). Browser-safe: no `node:*`.
import { BUNDLED_ANIMALS } from '../knowledge/bundled-animals.mjs?v=79d9d45ee8';
import { BUNDLED_INTEREST } from '../knowledge/bundled-interest.mjs?v=f2803610a2';
import { BUNDLED_GENRES } from '../knowledge/bundled-genres.mjs?v=0c50f1191f';
import { BUNDLED_GEO } from '../knowledge/bundled-geo.mjs?v=69830abbea';

const worlds = new WeakMap();
/** The library World holding k.interest and the bundled facts (built once per library). */
export function knowledgeWorld(lib) {
  if (worlds.has(lib)) return worlds.get(lib);
  const w = new lib.World();
  for (const text of Object.values(BUNDLED_INTEREST.files)) w.tell(text);
  for (const [p, text] of Object.entries(BUNDLED_ANIMALS.files)) if (p.includes('/shards/')) w.tell(text);
  for (const text of Object.values(BUNDLED_GENRES.files)) w.tell(text);   // k.genres: the document types as structure (genre, parts, steps, moves, registers)
  w.tell(BUNDLED_GEO.text);   // k.geo: the countries, their neighbours and areas
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

const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const art = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
const clauses = {
  class: (v) => `is ${art(v[0])} ${v[0]}`, covering: (v) => `is covered with ${list(v)}`, legs: (v) => (v[0] === '0' ? 'has no legs' : `has ${v[0]} legs`), habitat: (v) => `lives in the ${list(v)}`,
  diet: (v) => `is ${art(v[0])} ${v[0]}`, eats: (v) => `eats ${list(v)}`, can: (v) => `can ${list(v)}`, cannot: (v) => `cannot ${list(v)}`, sound: (v) => `makes the sound ${list(v)}`,
  baby: (v) => `has young called ${list(v)}`, group: (v) => `lives in a ${v[0]}`,
};
const nm = (v) => String(v);
/** One English sentence of a frame { move, fact: { type, attrs }, about } of a k.animals or k.geo fact; null for anything else (no invented wording). */
export function realiseFrame(f) {
  const a = f?.fact?.attrs ?? {}, about = nm(f?.about ?? '');
  if (f?.fact?.type === 'k.animals.animal') {
    const name = a.name?.[0] ?? about;
    const parts = Object.entries(a).filter(([k, v]) => clauses[k] && v?.length).map(([k, v]) => clauses[k](v.map(String)));
    if (!parts.length) return null;
    return `${f.move === 'conclude' ? 'Finally, the' : 'The'} ${name} ${list(parts)}.`.replace(/ +/g, ' ');
  }
  if (f?.fact?.type === 'k.geo.country') {
    const name = nm(a.name?.[0] ?? about), nb = (a.neighbour ?? []).map(nm);
    if (name !== about) return nb.includes(about) ? `${name} borders ${about}.` : null;   // a neighbour's fact that names the topic
    const parts = [];
    if (a.neighbour) parts.push(nb.length ? `borders ${list(nb)}` : 'has no land neighbours');
    if (a.area?.[0]) parts.push(`covers ${Number(a.area[0]).toLocaleString('en-US')} square kilometres`);
    if (a.landlocked?.[0] === 'true') parts.push('has no coast'); else if (a.landlocked?.[0] === 'false') parts.push('has a coast');
    if (a.currency?.length) parts.push(`uses the ${list(a.currency.map(nm))}`);
    if (a.language?.length) parts.push(`speaks ${list(a.language.map(nm))}`);
    return parts.length ? `${f.move === 'conclude' ? 'Finally, ' : ''}${name} ${list(parts)}.` : null;
  }
  if (f?.fact?.type === 'k.geo.city') {
    const name = nm(a.name?.[0] ?? ''), country = nm(a.country?.[0] ?? '');
    if (!name || !country) return null;
    const cap = a.capital_of?.[0] ? `the capital of ${nm(a.capital_of[0])}` : `a city in ${country}`;
    return `${name} is ${cap}${a.population?.[0] ? ` with ${Number(a.population[0]).toLocaleString('en-US')} people` : ''}.`;
  }
  return null;
}

/** A chapter's title from the type of the facts it holds ("k.animals.animal" -> "The animal"). */
export const chapterTitle = (type) => ({ 'k.animals.animal': 'The animal', 'k.geo.country': 'The country and its neighbours', 'k.geo.city': 'Its cities' })[type] ?? `The ${String(type).split('.').at(-1).replace(/_/g, ' ')}`;
