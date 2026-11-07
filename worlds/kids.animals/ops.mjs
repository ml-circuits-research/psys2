// Operations of kids.animals (browser-safe: no imports).
//
// Facts about one animal can sit on several wires (knowledge base plus things taught in the
// dialog), so every operation first merges all `kids.animals.animal` wires of that name.
// "Yes" and "no" are separate operations (…Yes / …No): an explicit statement that something is
// not so (refuted) is a supported answer, a missing statement is `missing` (unknown).

const T = 'kids.animals.animal';
const DIETS = new Set(['herbivore', 'carnivore', 'omnivore']);

const HABITAT_PHRASE = {
  sea: 'in the sea', farm: 'on a farm', forest: 'in the forest', river: 'in or near rivers', jungle: 'in the jungle',
  desert: 'in the desert', polar: 'in the polar regions', home: 'at home', garden: 'in the garden',
  savanna: 'on the savanna', grassland: 'in grasslands', mountain: 'in the mountains',
};
const COVER_PHRASE = {
  fur: 'covered in fur', feather: 'covered in feathers', scale: 'covered in scales', skin: 'covered in skin',
  shell: 'protected by a shell', wool: 'covered in wool', spine: 'covered in spines',
};
const COVER_NOUN = { feather: 'feathers', scale: 'scales', spine: 'spines', shell: 'a shell' };
const CLASS_PLURAL = {
  mammal: 'mammals', bird: 'birds', fish: 'fish', insect: 'insects', reptile: 'reptiles', amphibian: 'amphibians',
  arachnid: 'arachnids', crustacean: 'crustaceans', mollusc: 'molluscs', invertebrate: 'invertebrates',
};

const words = (s) => String(s).replace(/_/g, ' ');
const uniq = (a) => [...new Set(a)];
const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const stem = (w) => String(w).toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');

/** Merged facts of every animal: Map name -> { wires, <key>: [values...] }. */
function profiles(ctx) {
  const map = new Map();
  for (const w of ctx.find(T)) {
    const name = ctx.val(w, 'name');
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, wires: [], class: [], legs: [], diet: [], food: [], habitat: [], covering: [], sound: [], baby: [], can_fly: [], can_swim: [] });
    const p = map.get(name);
    p.wires.push(w.id);
    for (const k of Object.keys(p)) if (k !== 'name' && k !== 'wires') p[k].push(...ctx.vals(w, k));
  }
  for (const p of map.values()) for (const k of Object.keys(p)) if (k !== 'name' && k !== 'wires') p[k] = uniq(p[k]);
  return map;
}
const profileOf = (ctx, name) => (name ? profiles(ctx).get(name) : undefined);
const missingKey = (k) => ({ status: 'missing', missing: [`${T}.${k}`] });

// ---- abilities ----------------------------------------------------------------------------------
function ability(ctx, name, key, want) {
  const p = profileOf(ctx, name);
  if (!p || p[key].length === 0) return missingKey(key);
  const yes = p[key].includes(true), no = p[key].includes(false);
  if (yes && no) return { status: 'conflicting', alternatives: ['yes', 'no'], from: p.wires, note: `different statements about ${key}` };
  if (want === yes) return { status: 'supported', value: want ? 'yes' : 'no', from: p.wires };
  return missingKey(key);
}
export const canFlyYes = (ctx, { name }) => ability(ctx, name, 'can_fly', true);
export const canFlyNo = (ctx, { name }) => ability(ctx, name, 'can_fly', false);
export const canSwimYes = (ctx, { name }) => ability(ctx, name, 'can_swim', true);
export const canSwimNo = (ctx, { name }) => ability(ctx, name, 'can_swim', false);

// ---- is a <class or diet> -----------------------------------------------------------------------
function kindOf(ctx, name, asked, wantYes) {
  const p = profileOf(ctx, name);
  const dim = DIETS.has(asked) ? 'diet' : 'class';
  if (!p || !asked || p[dim].length === 0) return missingKey(dim);
  const known = p[dim];
  if (known.length > 1) return { status: 'conflicting', alternatives: known, from: p.wires, note: `different statements about the ${dim}` };
  const yes = known[0] === asked;
  if (wantYes === yes) return { status: 'supported', value: wantYes ? 'yes' : known[0], from: p.wires };
  return missingKey(dim);
}
export const isAYes = (ctx, { name, is_a }) => kindOf(ctx, name, is_a, true);
export const isANo = (ctx, { name, is_a }) => kindOf(ctx, name, is_a, false);

// ---- where does it live / what covers it ---------------------------------------------------------
export function livesWhere(ctx, { name }) {
  const p = profileOf(ctx, name);
  if (!p || p.habitat.length === 0) return missingKey('habitat');
  return { status: 'supported', value: joinAnd(p.habitat.map((h) => HABITAT_PHRASE[h] ?? `in the ${words(h)}`)), from: p.wires };
}
export function coveredIn(ctx, { name }) {
  const p = profileOf(ctx, name);
  if (!p || p.covering.length === 0) return missingKey('covering');
  return { status: 'supported', value: joinAnd(p.covering.map((c) => COVER_PHRASE[c] ?? `covered in ${words(c)}`)), from: p.wires };
}

// ---- describe an animal --------------------------------------------------------------------------
export function describeAnimal(ctx, { name }) {
  const p = profileOf(ctx, name);
  const known = p && ['class', 'legs', 'diet', 'food', 'habitat', 'covering', 'can_fly', 'can_swim'].some((k) => p[k].length);
  if (!known) return { status: 'missing', missing: [`${T}.class`] };
  const noun = p.class[0] ?? 'animal';
  let first = `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
  if (p.habitat.length) first += ` that lives ${joinAnd(p.habitat.map((h) => HABITAT_PHRASE[h] ?? `in the ${words(h)}`))}`;
  const parts = [];
  if (p.legs.length) parts.push(p.legs[0] === 0 ? 'has no legs' : `has ${p.legs[0]} ${p.legs[0] === 1 ? 'leg' : 'legs'}`);
  if (p.covering.length) parts.push(`is ${COVER_PHRASE[p.covering[0]] ?? `covered in ${words(p.covering[0])}`}`);
  if (p.food.length) parts.push(`eats ${joinAnd(p.food.slice(0, 3).map(words))}`);
  else if (p.diet.length) parts.push(`is ${/^[aeiou]/.test(p.diet[0]) ? 'an' : 'a'} ${p.diet[0]}`);
  const abil = [p.can_fly.includes(true) && 'fly', p.can_swim.includes(true) && 'swim'].filter(Boolean);
  if (abil.length) parts.push(`can ${abil.join(' and ')}`);
  const value = first + '.' + (parts.length ? ` It ${joinAnd(parts)}.` : '');
  return { status: 'supported', value, from: p.wires };
}

// ---- which animals ... ---------------------------------------------------------------------------
const LIMIT = 12;
export function searchAnimals(ctx, args) {
  const f = {
    class: args.class, legs: args.legs, diet: args.diet, food: args.food, habitat: args.habitat,
    covering: args.covering, sound: args.sound, can_fly: args.can_fly, can_swim: args.can_swim,
  };
  const active = Object.entries(f).filter(([, v]) => v !== undefined && v !== '');
  if (!active.length) return { status: 'missing', missing: [`${T}.name`], note: 'nothing to look for' };
  const test = (p, k, v) => {
    switch (k) {
      case 'legs': return p.legs.includes(Number(v));
      case 'food': return p.food.some((x) => stem(x) === stem(v));
      case 'can_fly': case 'can_swim': return p[k].includes(v === 'true');
      default: return p[k].includes(v);
    }
  };
  const hits = [...profiles(ctx).values()].filter((p) => active.every(([k, v]) => test(p, k, v)));
  // description of the question, e.g. "birds that cannot fly"
  let subject = f.class ? (CLASS_PLURAL[f.class] ?? `${f.class}s`) : f.diet ? `${f.diet}s` : 'animals';
  const that = [];
  if (f.class && f.diet) that.push(`that are ${f.diet}s`);
  if (f.habitat) that.push(`that live ${HABITAT_PHRASE[f.habitat] ?? `in the ${words(f.habitat)}`}`);
  if (f.legs !== undefined) that.push(`with ${f.legs === '0' ? 'no' : f.legs} legs`);
  if (f.food) that.push(`that eat ${f.food}`);
  if (f.covering) that.push(`that have ${COVER_NOUN[f.covering] ?? f.covering}`);
  if (f.sound) that.push(`that say ${f.sound}`);
  if (f.can_fly) that.push(f.can_fly === 'true' ? 'that can fly' : 'that cannot fly');
  if (f.can_swim) that.push(f.can_swim === 'true' ? 'that can swim' : 'that cannot swim');
  let note = [subject, ...that].join(' ');
  if (!hits.length) return { status: 'missing', missing: [`${T}.name`], note };
  const shown = hits.slice(0, LIMIT);
  if (hits.length > shown.length) note += ` (showing ${shown.length} of ${hits.length})`;
  return { status: 'supported', values: shown.map((p) => p.name), note, from: shown.flatMap((p) => p.wires) };
}
