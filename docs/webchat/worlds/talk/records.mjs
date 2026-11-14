// SPDX-License-Identifier: AGPL-3.0-only
// The generic reading of the knowledge catalog for Talk (ACTS x SCHEMAS, KNOWLEDGE-ALL-WORLDS): NO table of any world is written here. A thing is the set of wires of the catalog that
// carry its name (any world, any type: `th.wires`, `th.commonsense`, `th.senses` of src/knowledge/facts.mjs thing()); what a question word means is read from the `core.word`
// wires of the schemas (`ctx.knowledge.peekSchema()`: "legs" means k.animals.animal.legs, "capital" means k.geo.country.capital); ordered series (months, planets) come from
// `ctx.knowledge.peekSeries()`. A world added to the catalog is read with no change here. Browser-safe: no `node:*`.

import { askBridge } from '../acts/ask-lib.mjs?v=5e499018bc';   // the value of a slot of a record is asked of the library (sopworld `ask`)

const lc = (s) => String(s ?? '').toLowerCase();
/** The words of a question that ask for a place, a purpose or an action, as the slot names they usually mean: the grammar of the question frames, not a fact of any world. */
export const ASK_HINTS = {
  where: ['habitat', 'at', 'in', 'continent', 'region', 'country', 'located', 'place', 'orbits', 'part_of', 'comes_from', 'grows_on'],
  for: ['used_for', 'does', 'for'],
  do: ['does', 'can', 'used_for'],
  made: ['made_of', 'comes_from'], mean: ['gloss'], kind: ['is_a', 'kind', 'class'], type: ['is_a', 'kind', 'class'],
};
/** The size words in order, for a catalog whose schema does not list them (the schema's own enum wins). */
const SIZE_SCALE = ['tiny', 'small', 'medium', 'large', 'huge'];
const GENERIC_KIND = ['kind', 'class', 'is_a', 'age'];
/** Types that are the catalog's bookkeeping about a name (which worlds carry it, how its picture is coloured), not facts about the thing: never a record that answers, describes or says what a thing is. */
const BOOKKEEPING = /^k\.attributes\.(?:same|found|shows|family|aspect)$/;
const DRAWN = /^k\.attributes\.drawn$/;
const SKIP = /^(?:name|word|drawing|named|pos|n|core\..*|gloss|synonym|shard|reply|expression|mouth|eyebrows|eyes|cheeks)$/;

const sing = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
const humanise = (k) => String(k).replace(/_/g, ' ');
export const first = (w, k) => w?.[k]?.[0] ?? w?.f?.[k]?.[0];

/** The records that carry the name of a thing: [{ type, f, shard }] (the wires of any world, the commonsense fact as one more record). Senses are not records. */
export function records(th, name, { senses = false } = {}) {
  if (!th) return [];
  const n = lc(name ?? th.name);
  const out = [];
  for (const w of th.wires ?? []) {
    if (!w.type || w.type.startsWith('core.') || BOOKKEEPING.test(w.type)) continue;
    const ids = [...(w.f.name ?? []), ...(w.f.word ?? [])].map(lc);
    if (ids.includes(n)) out.push({ type: w.type, f: w.f, shard: w.shard });
  }
  if (senses) for (const s of th.senses ?? []) out.push({ type: 'k.words.sense', f: { gloss: [s.gloss], pos: [s.pos], ...(s.synonyms?.length ? { synonym: s.synonyms } : {}), ...(s.isA?.length ? { is_a: s.isA } : {}) }, shard: s.shard });
  if (th.commonsense) { const { shard, ...f } = th.commonsense; out.push({ type: 'k.commonsense.thing', f, shard }); }
  return out;
}

/** The slots a question word can mean, from the schemas: [{ type, key }] (a word of `core.word`, the name of a slot itself, the hints of a question word). */
export function slotsFor(sc, word) {
  const w = lc(word).trim();
  if (!w) return [];
  const out = [], seen = new Set();
  const add = (type, key) => { if (!seen.has(`${type}#${key}`)) { seen.add(`${type}#${key}`); out.push({ type, key }); } };
  for (const cand of [w, sing(w), `${w}s`, w.replace(/^(?:the|a|an)\s+/, '')]) {   // the third form is the verb as the schemas list it (say -> says)
    for (const m of sc?.slotWords?.get(cand) ?? []) { const i = m.lastIndexOf('.'); if (sc.slots.get(m.slice(0, i))?.[m.slice(i + 1)]) add(m.slice(0, i), m.slice(i + 1)); }
  }
  const keys = [w.replace(/ /g, '_'), sing(w).replace(/ /g, '_'), ...(ASK_HINTS[w] ?? [])];
  for (const [type, slots] of sc?.slots ?? []) for (const k of keys) if (slots[k]) add(type, k);
  for (const k of keys) add('*', k);   // a world with no schema in the catalog yet: the word may still be the name of a slot of its wires
  return out;
}

/**
 * The values of the first slot among `slots` that some record of the thing has: { key, type, values, rec } or null. Values are strings (the catalog's text). The records of the thing are projected to wires
 * (one `record` thing each, keys prefixed `f_`: `kind`, `name` and `world` are the library's own) and the value is ASKED of the library (`ask thing= attr=`, worlds/acts/ask-lib.mjs); the order in which
 * records and slots are tried is this module's: the strong records answer before the weak ones.
 */
let ASK = null;   // the bridge, made on first use
const projection = new WeakMap();   // the records of one question -> their wires
export function valuesOf(recs, slots) {
  const weak = (r) => /^k\.(?:scenes|commonsense)\./.test(r.type) || DRAWN.test(r.type);   // the world that is about the thing itself answers before the one that only places it in a picture
  let things = projection.get(recs);
  if (!things) projection.set(recs, (things = recs.map((r, i) => ({ id: `r${i}`, attrs: Object.fromEntries(Object.entries(r.f).map(([k, v]) => [`f_${k}`, v])) }))));
  for (const group of [recs.filter((r) => !weak(r)), recs.filter(weak)]) for (const { key } of slots) for (const rec of group) {   // every slot of the strong records first
    if (!rec.f[key]?.length) continue;
    const v = (ASK ??= askBridge('record', null)).ask(things, { thing: `r${recs.indexOf(rec)}`, attr: `f_${key}` }).values;
    if (v.length) return { key, type: rec.type, values: v, rec };
  }
  return null;
}

/** "an animal", "a body part": the noun a record's type stands for (the last word of the type id, with its world when that word says too little). */
export function typeNoun(type) {
  const p = String(type).split('.');
  const local = p.at(-1), world = p.at(-2) ?? '';
  return /^(?:part|kind|thing|body|unit|sense|quantity|feeling|role)$/.test(local) && world !== 'k' && sing(world) !== local ? `${world} ${local}` : local;
}

const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const num = (v) => (/^-?\d+(?:\.\d+)?$/.test(String(v)) ? Number(v) : null);
const show = (key, values) => `${humanise(key)}: ${listOf(values.map((v) => humanise(v)))}`;

/** What a record says about its thing, in one short sentence plus a few facts: "An animal (arachnid). Legs 8; habitat web." Generic over slots; null when the record holds nothing to say. */
export function describe(recs, name, an, cap, { lead: wantLead = true } = {}) {
  const rec = recs.find((r) => !r.type.startsWith('k.commonsense') && !r.type.startsWith('k.scenes') && !DRAWN.test(r.type)) ?? recs[0];
  if (!rec) return null;
  const kindKey = GENERIC_KIND.find((k) => rec.f[k]?.length);
  const noun = typeNoun(rec.type);
  const lead = `${cap(an(name))} is ${an(noun)}${kindKey && lc(rec.f[kindKey][0]) !== lc(noun.split(' ').at(-1)) ? ` (${humanise(rec.f[kindKey][0])})` : ''}.`;
  const facts = [];
  for (const [k, v] of Object.entries(rec.f)) {
    if (SKIP.test(k) || k === kindKey || facts.length >= 4) continue;
    if (v.length > 4 || v.every((x) => x === 'true' || x === 'false')) continue;
    facts.push(show(k, v));
  }
  const rest = facts.length ? `${cap(facts.join('; '))}.` : '';
  return wantLead ? (rest ? `${lead} ${rest}` : lead) : rest || null;
}

/** Categories a thing belongs to, in the catalog's words: the values of its kind-like slots, the noun of its record types, the is-a of its senses. Lower case. */
export function categories(th, recs) {
  const own = new Set(), all = new Set();
  for (const r of recs) { if (!/^k\.(?:scenes|commonsense)\./.test(r.type) && !DRAWN.test(r.type)) { for (const v of [...GENERIC_KIND.flatMap((k) => r.f[k] ?? []), typeNoun(r.type).split(' ').at(-1)]) own.add(lc(v)); } for (const v of r.f.botanically ?? []) all.add(lc(v)); }
  for (const v of own) all.add(v);
  for (const s of th?.senses ?? []) for (const v of s.isA ?? []) all.add(lc(v));
  return { own, all };
}

/**
 * A comparable size of a thing, from any slot of its records, best first: a numeric measure (`area`, `population`, `elevation`, `factor`), a rank slot (`*_rank`, smaller = bigger),
 * the `size` enum in the order the schema declares it. { value (bigger = larger), shown, slot } or null.
 */
export function measureOf(recs, sc) {
  for (const key of ['factor', 'area', 'population', 'elevation', 'length']) for (const r of recs) { const v = num(r.f[key]?.[0]); if (v !== null) return { value: v, shown: `${humanise(key)} ${v}`, slot: key, quantity: first(r.f, 'quantity') }; }
  for (const r of recs) for (const [k, v] of Object.entries(r.f)) if (/_rank$/.test(k) && num(v[0]) !== null) return { value: 100 - num(v[0]), shown: `${humanise(k.replace(/_rank$/, ''))} rank ${v[0]}`, slot: k };
  for (const r of recs) { const v = r.f.size?.[0]; if (!v) continue; const declared = sc?.slots.get(r.type)?.size?.enum; const order = declared?.length ? declared : SIZE_SCALE; const i = order.indexOf(v); if (i >= 0) return { value: i + 1, shown: `${v}`, slot: 'size', word: v }; }
  return null;
}

/** The count of a part of a thing, from the catalog's slots only: a numeric slot of the thing itself (legs, moons), the `count` of a record that is a part of it, a `count` of a unit it holds. */
export function countFrom(th, recs, what, sc) {
  const w = lc(what).trim(), s1 = sing(w);
  const slots = slotsFor(sc, w);
  for (const { key } of slots) for (const r of recs) { const v = r.f[key]?.[0]; if (num(v) !== null) return { n: num(v), from: 'fact', slot: key }; }
  for (const r of recs) for (const [k, v] of Object.entries(r.f)) if ((k === s1 || k === w || k.startsWith(`${s1}_`)) && num(v[0]) !== null) return { n: num(v[0]), from: 'fact', slot: k, about: /_about$/.test(k) };
  for (const x of th?.wires ?? []) {
    if (!x.f.name || ![s1, w].includes(lc(x.f.name[0]))) continue;
    if (lc(x.f.part_of?.[0]) === lc(th.name) && num(x.f.count?.[0]) !== null) return { n: num(x.f.count[0]), from: 'fact', slot: 'count' };
  }
  for (const r of recs) if (num(r.f.count?.[0]) !== null && lc(r.f.unit?.[0]) === s1) return { n: num(r.f.count[0]), from: 'fact', slot: 'count' };
  return null;
}

/** The slots whose declared values (enum) include a word, in the schemas: [{ type, key }] ("carnivore" is a value of k.animals.animal.diet, "primary" of k.colours.colour.kind, "mammal" of ...class). */
export function slotsHolding(sc, word, types = null) {
  const w = lc(word).trim(), out = [];
  if (!w) return out;
  for (const [type, slots] of sc?.slots ?? []) {
    if (types && !types.includes(type)) continue;
    for (const [key, def] of Object.entries(slots)) if (def.enum?.some((v) => lc(v) === w || lc(v) === sing(w))) out.push({ type, key });
  }
  return out;
}

/** The types a word means in the schemas ("animals" -> k.animals.animal), only those with slots. */
export function typesFor(sc, word) {
  const w = lc(word).trim(), out = [];
  for (const cand of new Set([w, sing(w)])) for (const m of sc?.slotWords?.get(cand) ?? []) if (sc.slots.has(m) && !out.includes(m)) out.push(m);
  return out;
}

/** The distinct names of the wires of some types whose slot `key` holds `value` (or its singular), in the catalog's order: [{ name, type }]. */
export function namesWith(wiresByType, picks, value) {
  const v = lc(value), s = sing(v), out = [], seen = new Set();
  for (const { type, key } of picks) for (const w of wiresByType(type) ?? []) {
    if (!w.f[key]?.some((x) => lc(x) === v || lc(x) === s)) continue;
    const n = first(w, 'name');
    if (n && !seen.has(lc(n))) { seen.add(lc(n)); out.push({ name: n, type }); }
  }
  return out;
}
