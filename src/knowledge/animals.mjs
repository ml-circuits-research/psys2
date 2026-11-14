// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The animals of the knowledge catalog (k.animals) for the games, read SYNCHRONOUSLY from a bundle generated from the catalog at build time (`bundled-animals.mjs`, written by the library's
 * own tools/build-bundle.mjs through scripts/build-bundled-subset.mjs). The games need the whole set at once, inside a turn, so they cannot wait for a lookup; the bundle is the catalog, not a copy
 * written by hand: a new catalog is bundled by one command. Browser-safe: no `node:*`.
 *
 *   animals()      Map(name -> { name, class[], legs[], covering[], habitat[], diet[], eats[], can[], cannot[], sound[], baby[], group[] })   the facts of one animal merged over the shards;
 *                  a key an animal does not state is filled from its class (k.animals.class: a bird has 2 legs and feathers)
 *   animalNames()  the names, in the catalog's order
 *   ask({ seek, where, mode })   the answers the worlds that use animals (the document editor's animal tables and reports, the chart of legs) used to ask the kids.animals world: `seek: 'matching'` with
 *                  `where` (class, legs, diet, food, habitat, covering, sound, can_fly, can_swim) -> { status, values (names, a name with a space joined by `_`), note, from }; `seek: 'summary'` or a key
 *                  (legs, food, diet, habitat, class, sound, covering, baby) with `where: { name }` -> { status, value | values, from }. Read from the catalog's bundle, by lookup.
 */
import { BUNDLED_ANIMALS } from './bundled-animals.mjs';
import { parseLine } from './catalog.mjs';

const KEYS = ['class', 'legs', 'covering', 'habitat', 'diet', 'eats', 'can', 'cannot', 'sound', 'baby', 'group'];
let memo = null;

export function animals() {
  if (memo) return memo;
  const map = new Map(), classes = new Map();
  for (const [path, text] of Object.entries(BUNDLED_ANIMALS.files)) {
    if (!path.includes('/shards/')) continue;
    for (const line of text.split('\n')) {
      if (line.charCodeAt(0) !== 64) continue;
      const w = parseLine(line);
      if (!w) continue;
      const name = w.attrs.name?.[0];
      if (!name) continue;
      if (w.type === 'k.animals.class') { classes.set(name, w.attrs); continue; }
      if (w.type !== 'k.animals.animal') continue;
      if (!map.has(name)) map.set(name, { name, ...Object.fromEntries(KEYS.map((k) => [k, []])) });
      const p = map.get(name);
      for (const k of KEYS) for (const v of w.attrs[k] ?? []) if (!p[k].includes(v)) p[k].push(v);
    }
  }
  for (const p of map.values()) {
    const c = classes.get(p.class[0]);
    if (!c) continue;
    if (!p.legs.length && c.legs) p.legs.push(...c.legs);
    if (!p.covering.length && c.covering) p.covering.push(...c.covering);
  }
  return (memo = map);
}

export const animalNames = () => [...animals().keys()];

// ---- the questions of the worlds that use animals ---------------------------------------------------------------------------------------------------------------------------------------------
const FROM = ['k.animals'];
const words = (x) => String(x).replace(/_/g, ' ');
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const stem = (w) => String(w).toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');
const ALIAS = { home: ['house'], polar: ['ice', 'tundra'] };   // the habitat words of a child's book that the catalog says in other words
const PREP_ON = new Set(['farm', 'savanna', 'ice', 'beach', 'tundra', 'cliff', 'island']);
const where_ = (h) => (PREP_ON.has(h) ? `on ${h === 'farm' ? 'a farm' : `the ${h}`}` : h === 'house' ? 'in a house' : `in the ${words(h)}`);
const keyOf = (p, k) => (k === 'food' ? p.eats : k === 'can_fly' || k === 'can_swim' ? [] : p[k] ?? []);
const profile = (p) => ({ ...p, name: p.name.replace(/ /g, '_') });
const byName = (name) => { const n = String(name).replace(/_/g, ' '); const a = animals().get(n); return a ? profile(a) : null; };
const test = (p, k, v) => {
  if (k === 'legs') return p.legs.includes(String(v));
  if (k === 'food') return p.eats.some((x) => stem(x) === stem(v));
  if (k === 'can_fly' || k === 'can_swim') { const verb = k.slice(4); return v === 'true' ? p.can.includes(verb) : p.cannot.includes(verb); }
  if (k === 'habitat') return [v, ...(ALIAS[v] ?? [])].some((h) => p.habitat.includes(h));
  return (p[k] ?? []).includes(v);
};
export function ask({ seek, where = {}, mode } = {}) {
  void mode;
  if (seek === 'matching') {
    const active = Object.entries(where).filter(([, v]) => v !== undefined && v !== '');
    if (!active.length) return { status: 'missing', note: 'nothing to look for' };
    const hits = [...animals().values()].filter((p) => active.every(([k, v]) => test(p, k, v))).map(profile);
    const f = where;
    const that = [];
    if (f.habitat) that.push(`that live ${where_(f.habitat)}`);
    if (f.food) that.push(`that eat ${f.food}`);
    if (f.can_fly) that.push(f.can_fly === 'true' ? 'that can fly' : 'that cannot fly');
    if (f.can_swim) that.push(f.can_swim === 'true' ? 'that can swim' : 'that cannot swim');
    let note = [f.class ? `${f.class}s` : f.diet ? `${f.diet}s` : 'animals', ...that].join(' ');
    if (!hits.length) return { status: 'missing', note };
    const shown = hits.slice(0, 12);
    if (hits.length > shown.length) note += ` (showing ${shown.length} of ${hits.length})`;
    return { status: 'supported', values: shown.map((p) => p.name), note, from: FROM };
  }
  const p = byName(where.name);
  if (!p) return { status: 'missing' };
  if (seek === 'summary') {
    const known = ['class', 'legs', 'diet', 'eats', 'habitat', 'covering'].some((k) => p[k].length);
    if (!known) return { status: 'missing' };
    const noun = p.class[0] ?? 'animal';
    let first = `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
    if (p.habitat.length) first += ` that lives ${joinAnd(p.habitat.slice(0, 2).map(where_))}`;
    const parts = [];
    if (p.legs.length) parts.push(p.legs[0] === '0' ? 'has no legs' : `has ${p.legs[0]} ${p.legs[0] === '1' ? 'leg' : 'legs'}`);
    if (p.covering.length) parts.push(`is covered in ${words(p.covering[0])}`);
    if (p.eats.length) parts.push(`eats ${joinAnd(p.eats.slice(0, 3).map(words))}`);
    else if (p.diet.length) parts.push(`is ${/^[aeiou]/.test(p.diet[0]) ? 'an' : 'a'} ${p.diet[0]}`);
    const abil = ['fly', 'swim'].filter((v) => p.can.includes(v));
    if (abil.length) parts.push(`can ${abil.join(' and ')}`);
    return { status: 'supported', value: `${first}.${parts.length ? ` It ${joinAnd(parts)}.` : ''}`, from: FROM };
  }
  const values = keyOf(p, seek);
  if (!values.length) return { status: 'missing' };
  return { status: 'supported', value: values[0], values, from: FROM };
}
