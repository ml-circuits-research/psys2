// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The knowledge world `k.faces` (slots of a face with anchor boxes, variants with plain features and drawable parts, presets, expressions, colours) read through the
 * generic catalog access of facts.mjs (`wires`: the index says which shards hold a type; no path or slot name is written here). Browser-safe: no `node:*`.
 *
 *   const data = await buildFaces(facts);   // null when the catalog has no k.faces (offline, first visit): the avatar then says so, there is no local copy
 *   data = { frame, style, slots: [{ name, x, y, w, h, z, mirror, optional, variants: [{ name, features, parts }] }], presets, expressions, colours, aliases }
 *
 * One style is used (a face does not mix styles): the style of the presets. Its shards are the shards of the world with the same `sources` as the presets' shard (the
 * hand-written core); the imported styles keep their own shards and are not loaded. `aliases` are the other names of each slot, all from the catalog: the
 * `holds` words of the face layout (k.layouts) and the synonyms of the slot's noun in k.words, so "eyeglasses" reaches the slot `glasses` with no list of ours.
 */
const FACE_TYPES = ['slot', 'variant', 'part', 'point', 'colour', 'preset', 'expression'].map((t) => `k.faces.${t}`);
const one = (w, k) => w.f[k]?.[0];
const num = (w, k, d = 0) => (w.f[k] ? Number(w.f[k][0]) : d);
const many = (w, k) => w.f[k] ?? [];
const lc = (t) => String(t).toLowerCase();

/** The base word of a slot name ("hair_back" -> "hair"): where the catalog's words for it are looked up. */
const nounOf = (slot) => slot.split('_')[0];

/** Builds the faces data; every read goes through `facts`. Never throws: no catalog is `null`. */
export async function buildFaces(facts) {
  try {
    const world = await facts.world('k.faces');
    if (!world) return null;
    const presetWires = await facts.wires('k.faces.preset');
    if (!presetWires.length) return null;
    const home = world.shards.find((s) => s.id === presetWires[0].shard);
    const same = (sh) => sh.sources?.length === home.sources?.length && sh.sources.every((x) => home.sources.includes(x));
    const read = (type) => facts.wires(type, { shard: same });
    const [slotW, variantW, partW, pointW, colourW, expressionW] = await Promise.all(['k.faces.slot', 'k.faces.variant', 'k.faces.part', 'k.faces.point', 'k.faces.colour', 'k.faces.expression'].map(read));
    const style = one(presetWires[0], 'style');
    const points = new Map();
    for (const p of pointW) { const id = one(p, 'part').replace(/^\$/, ''); (points.get(id) ?? points.set(id, []).get(id)).push([num(p, 'n'), num(p, 'x'), num(p, 'y')]); }
    const parts = new Map();   // "slot\tvariant" -> parts in draw order
    partW.forEach((w, i) => {
      const key = `${one(w, 'slot')}\t${one(w, 'of')}`;
      const part = { name: one(w, 'name'), kind: one(w, 'kind'), shape: one(w, 'shape'), x: num(w, 'x'), y: num(w, 'y'), w: num(w, 'w'), h: num(w, 'h'), z: num(w, 'z'), colour: many(w, 'colour'), rgb: one(w, 'rgb'), tint: one(w, 'tint'), pointing: one(w, 'pointing'), opens: one(w, 'opens'), order: i,
        points: (points.get(w.id) ?? []).sort((a, b) => a[0] - b[0]).map((q) => [q[1], q[2]]) };
      (parts.get(key) ?? parts.set(key, []).get(key)).push(part);
    });
    for (const list of parts.values()) list.sort((a, b) => a.z - b.z || a.order - b.order);
    const variantsOf = new Map();
    for (const w of variantW) {
      const features = {};
      for (const k of ['shape', 'size', 'length', 'feel', 'age', 'kind']) if (w.f[k]) features[k] = many(w, k).map(lc);
      (variantsOf.get(one(w, 'slot')) ?? variantsOf.set(one(w, 'slot'), []).get(one(w, 'slot'))).push({ name: one(w, 'name'), features, parts: parts.get(`${one(w, 'slot')}\t${one(w, 'name')}`) ?? [] });
    }
    const slots = slotW.filter((w) => one(w, 'style') === style).map((w) => ({ name: one(w, 'name'), x: num(w, 'x'), y: num(w, 'y'), w: num(w, 'w'), h: num(w, 'h'), z: num(w, 'z'), mirror: one(w, 'mirror') === 'true', optional: one(w, 'optional') === 'true', variants: variantsOf.get(one(w, 'name')) ?? [] }))
      .sort((a, b) => a.z - b.z);
    if (!slots.length || slots.some((s) => !s.variants.length)) return null;
    const presets = {};
    for (const w of presetWires.filter((x) => one(x, 'style') === style)) {
      const p = { name: one(w, 'name'), slots: {}, colours: { skin: one(w, 'skin'), hair: one(w, 'hair_colour'), eyes: one(w, 'eye_colour'), clothes: one(w, 'clothes') } };
      for (const s of slots) if (w.f[s.name]) p.slots[s.name] = one(w, s.name);
      presets[p.name] = p;
    }
    const expressions = {};
    for (const w of expressionW.filter((x) => one(x, 'style') === style)) {
      const e = { name: one(w, 'name'), over: {}, oneEye: one(w, 'one_eye') ?? null, mouthAlt: one(w, 'mouth_alt') ?? null };
      for (const k of ['mouth', 'eyebrows', 'eyes']) if (w.f[k]) e.over[k] = one(w, k);
      expressions[e.name] = e;
    }
    const colours = {};
    for (const w of colourW) (colours[one(w, 'of')] ??= {})[one(w, 'name')] = { rgb: one(w, 'rgb'), shade: one(w, 'shade'), natural: one(w, 'natural') === 'true' };
    const data = { frame: { w: 100, h: 100 }, style, layout: null, slots, presets, expressions, colours, aliases: {} };
    await addAliases(facts, data);
    return data;
  } catch { return null; }
}

/** The other names of each slot, from the catalog: the `holds` words of the face layout and the synonyms of the slot's noun (k.words). A failed read leaves the names the slots already have. */
async function addAliases(facts, data) {
  const add = (slot, w) => { const x = lc(w).replace(/_/g, ' '); if (x && x.length > 1) (data.aliases[slot] ??= new Set()).add(x); };
  try {
    // the layout of the catalog that has our slots (the most of them by name): its name is what the whole is called ("face"), its `holds` words are other names of the slots
    const all = await facts.wires('k.layouts.slot'), mine = new Set(data.slots.map((s) => s.name)), score = new Map();
    for (const w of all) if (mine.has(one(w, 'name'))) score.set(one(w, 'layout'), (score.get(one(w, 'layout')) ?? 0) + 1);
    data.layout = [...score].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    for (const w of all) if (one(w, 'layout') === data.layout) for (const h of many(w, 'holds')) add(one(w, 'name'), h);
  } catch { /* no layout words */ }
  await Promise.all(data.slots.map(async (s) => {
    try {
      for (const sense of await facts.wires('k.words.sense', { key: nounOf(s.name) })) {
        if (lc(one(sense, 'word')) !== nounOf(s.name) || one(sense, 'pos') !== 'noun' || num(sense, 'n') !== 1) continue;   // the first sense only: the others are other things (a hair's breadth)
        for (const syn of many(sense, 'synonym')) add(s.name, syn);
      }
    } catch { /* no word senses */ }
  }));
  for (const k of Object.keys(data.aliases)) data.aliases[k] = [...data.aliases[k]];
}
