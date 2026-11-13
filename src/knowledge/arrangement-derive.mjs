// SPDX-License-Identifier: AGPL-3.0-only
// The pure derivation of the arrangement table from catalog wires (see arrangement.mjs); the bundled-subset generator and the runtime reader use this one function.

const lc = (s) => String(s ?? '').toLowerCase().replace(/[_]+/g, ' ').trim();

/** The table from wires `{ type, f }` of k.scenes.thing, k.layouts.joins, k.layouts.slot (pure; the bundled subset and the catalog use the same function). */
export function deriveArrangement(wires) {
  const supports = [], seen = new Set(), add = (a, b) => { const k = `${a}|${b}`; if (a && b && a !== b && !seen.has(k)) { seen.add(k); supports.push([a, b]); } };
  const slots = [];
  for (const w of wires) {
    if (w.type === 'k.scenes.thing') {
      const name = lc(w.f.name?.[0]);
      for (const on of w.f.on ?? []) add(name, lc(on));
      if (w.f.place?.[0] === 'ground') add(name, 'ground');
    } else if (w.type === 'k.layouts.joins' && ['sits_on', 'attaches_to', 'part_of'].includes(w.f.rel?.[0])) add(lc(w.f.a?.[0]), lc(w.f.b?.[0]));
    else if (w.type === 'k.layouts.slot' && w.f.layout?.[0] === 'face') slots.push(w.f);
  }
  const parts = slots.filter((f) => f.optional?.[0] !== 'true' && (f.holds ?? []).length === 1 && Number(f.h?.[0]) < 30).sort((a, b) => Number(a.y?.[0]) - Number(b.y?.[0]));
  const face = parts.map((f, i) => [lc(f.holds[0]), i + 1, f.pair?.[0] === 'true' ? Math.round(Math.abs(Number(f.x[0]) + Number(f.w[0]) / 2 - 50)) / 100 : 0]);
  return { supports, around: [], face };
}


/**
 * The other names of the parts of a face, from the word senses of the catalog (k.words: the senses of the part's word that say `part_of=face`, their synonyms: a brow is an eyebrow):
 * returns the rows of `face` with the aliases appended ([part, rank, mirror, ...aliases]). `facts` is the generic reading (`wires(type, { key })`).
 */
export async function withFaceAliases(facts, face) {
  const out = [];
  for (const row of face) {
    const aliases = new Set();
    try {
      for (const w of await facts.wires('k.words.sense', { key: row[0] })) {
        if (lc(w.f.word?.[0]) !== row[0] || !(w.f.part_of ?? []).some((p) => lc(p) === 'face')) continue;
        for (const s of w.f.synonym ?? []) if (lc(s) !== row[0] && !/\s/.test(s)) aliases.add(lc(s));
      }
    } catch { /* no aliases is no change */ }
    out.push([...row.slice(0, 3), ...aliases]);
  }
  return out;
}
