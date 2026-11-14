// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Taught statements read BY TYPE (spec 23 section "Taught statements by type"; plan H3, until the library's L5 gives them): a sentence that states a fact about a thing ("a zebra has 4 legs",
 * "zebras are black and white", "a ruler is a rectangle", "black and red make brown", "zebras eat grass", "a baby numbat is called a pup") is written as a wire of the CATALOG's own type
 * (`k.animals.animal name="zebra" legs="4"`, `k.attributes.thing name="zebra" colour="black" colour="white"`, `k.shapes.shape name="rectangle" thing="ruler"`, `k.colours.mix a="black" b="red"
 * gives="brown"`), so that every reader of the catalog reads the lesson at the taught tier (src/knowledge/learned.mjs overlays it first). No table of any world: the slot is found through the
 * schemas of the catalog (`core.slot`, `core.word`: `ctx.knowledge.peekSchema()`), the type through the records the catalog already has for the thing.
 *
 * Forms (in this order):
 *   count   "X has N W"               W means an integer slot (legs, sides, corners, wheels)
 *   value   "X is/are/has V (and V2)" V is a declared value (enum) of a slot of a type X has a record of (colour of k.attributes.thing, class / diet / covering of k.animals.animal);
 *                                     a thing with no record takes the only type that holds V, or the type whose local name is "thing"
 *   member  "X is a Y"                Y names a record whose type has a `thing` slot (the things that are Y: a shape, a colour): X is added to it
 *   mix     "A and B make C"          the verb means a type with two id slots and one other required slot (k.colours.mix a / b / gives)
 *   verb    "X V Y (and Z)"           V is a word of a slot (eats, says -> sound); "a baby X is called Y" (baby); "X is covered in Y" (covering)
 * Returns { form, subject, object, lines: [wire without id], say } or null. Browser-safe: no `node:*`.
 */
import { numberValue } from './values.mjs?v=a137742733';

const lc = (s) => String(s ?? '').toLowerCase().trim();
const sing = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes|oes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
const q = (s) => JSON.stringify(String(s));
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n) ? 'an' : 'a'} ${n}`;
const STOP = /^(?:i|you|we|they|he|she|it|its|this|that|these|those|there|what|who|which|how|where|when|why|my|your|our|today|tomorrow|yesterday|now|yes|no|ok|okay|well|so|and|but)$/;
const num = (w) => (/^\d+$/.test(w) ? Number(w) : numberValue(w, 'cardinal'));
const isNum = (w) => { const n = num(w); return n !== null && Number.isFinite(n); };

/** The slots a word means in the schemas, from `core.word` first, then the slot names: [{ type, key, def }]. */
function slotsOf(sc, word, { wordsOnly = false } = {}) {
  const out = [], seen = new Set(), w = lc(word);
  const add = (type, key) => { const def = sc?.slots?.get(type)?.[key]; if (def && !seen.has(`${type}#${key}`)) { seen.add(`${type}#${key}`); out.push({ type, key, def }); } };
  for (const c of new Set([w, sing(w), `${w}s`])) for (const m of sc?.slotWords?.get(c) ?? []) { const i = m.lastIndexOf('.'); add(m.slice(0, i), m.slice(i + 1)); }
  if (!wordsOnly) for (const [type, slots] of sc?.slots ?? []) for (const k of new Set([w.replace(/ /g, '_'), sing(w).replace(/ /g, '_')])) if (slots[k]) add(type, k);
  return out;
}
/** The slots whose declared values include a word: [{ type, key, def }]. */
function holding(sc, word) {
  const w = lc(word), s = sing(w), out = [];
  for (const [type, slots] of sc?.slots ?? []) for (const [key, def] of Object.entries(slots)) if (def.enum?.some((v) => lc(v) === w || lc(v) === s)) out.push({ type, key, def });
  return out;
}
const numeric = (d) => (d.kind ?? []).some((k) => k === 'integer' || k === 'number');
/** The candidate the thing's own records decide (a type it has a record of), else the only one, else the type named "thing"; null when the records say it is none of them. */
function pick(cands, mine, { strict = false } = {}) {
  if (!cands.length) return null;
  const own = cands.filter((c) => mine.includes(c.type));
  if (own.length) return own[0];
  if (mine.length && strict) return null;
  if (cands.length === 1) return cands[0];
  return cands.find((c) => c.type.split('.').at(-1) === 'thing') ?? cands[0];
}
const strip = (s) => lc(s).replace(/^(?:an?|the|some|all)\s+/, '');
const VERBISH = /\b(?:is|are|was|were|has|have|had|can|cannot|do|does|did|of|and|or|not|kind|type|sort)\b/;
const subjectOf = (s, max = 3) => { const t = strip(s); return t && !/[,;:]/.test(t) && !t.split(' ').some((w) => STOP.test(w)) && t.split(' ').length <= max && !STOP.test(t.split(' ')[0]) && !VERBISH.test(t) ? t : null; };

/**
 * Reads one statement by type. `sc` is the schema (`peekSchema()`), `typesOf(word)` the types of the catalog records of a word (settled lookup; [] when unknown), `lemma(word)` its singular.
 */
export function parseTeachTyped(text, { sc, typesOf = () => [], lemma = sing } = {}) {
  if (!sc?.slots?.size) return null;
  const t = lc(text).replace(/[.!?]+$/, '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').replace(/^(?:please |remember that |remember |note that |i tell you that |you should know that |did you know that )/, '');
  if (!t || t.length > 120 || /\?$/.test(String(text).trim())) return null;
  let m;
  // count: X has N W
  if ((m = /^(.+?) (?:has|have|has got|have got|got) (\S+) ([a-z]+(?: [a-z]+)?)$/.exec(t)) && isNum(m[2])) {
    const x = subjectOf(m[1]); if (!x) return null;
    const subject = lemma(x), n = num(m[2]), what = m[3];
    const c = pick(slotsOf(sc, what).filter((s) => numeric(s.def)), typesOf(subject));
    if (!c) return null;
    return { form: 'count', subject, object: String(n), type: c.type, key: c.key, lines: [`${c.type} name=${q(subject)} ${c.key}=${q(n)}`], say: `OK, ${an(subject)} has ${n} ${what}.` };
  }
  // mix: A and B make C
  if ((m = /^(?:mixing |if you mix |when you mix )?([a-z]+) (?:and|with|plus) ([a-z]+) (make|makes|give|gives|is|equals|become|becomes) ([a-z]+(?: [a-z]+)?)$/.exec(t))) {
    const verb = ['is', 'equals', 'become', 'becomes'].includes(m[3]) ? 'make' : m[3];
    const types = [...new Set([verb, sing(verb), `${verb}s`].flatMap((c) => [...(sc.slotWords?.get(c) ?? [])]).filter((m) => sc.slots.has(m)))];   // the verb means a TYPE (make -> k.colours.mix)
    for (const type of types) {
      const c = { type }, slots = sc.slots.get(type) ?? {};
      const ids = Object.entries(slots).filter(([, d]) => d.id).map(([k]) => k), out = Object.entries(slots).filter(([k, d]) => !d.id && k !== 'name').map(([k]) => k);
      if (ids.length !== 2 || !out.length) continue;
      const give = out.find((k) => sc.slotWords?.get('gives')?.has?.(`${c.type}.${k}`)) ?? out[0];
      return { form: 'mix', subject: m[1], object: m[4], type: c.type, lines: [`${c.type} ${ids[0]}=${q(m[1])} ${ids[1]}=${q(m[2])} ${give}=${q(m[4])}`], say: `OK, ${m[1]} and ${m[2]} make ${m[4]}.` };
    }
    return null;
  }
  // baby: a baby X is called (a) Y
  if ((m = /^(?:an? |the )?(baby|young) (.+?) (?:is|are) called (?:an? )?([a-z]+)$/.exec(t))) {
    const x = subjectOf(m[2]); if (!x) return null;
    const subject = lemma(x), c = pick(slotsOf(sc, m[1]).filter((s) => !numeric(s.def)), typesOf(subject));
    if (!c) return null;
    return { form: 'verb', subject, object: m[3], type: c.type, key: c.key, lines: [`${c.type} name=${q(subject)} ${c.key}=${q(m[3])}`], say: `OK, a baby ${subject} is called ${an(m[3])}.` };
  }
  // value / member: X is|are (a|an)? V (and W)
  if ((m = /^(.+?) (is|are|has|have|is covered in|are covered in) (?:an? )?([a-z]+)(?: and (?:an? )?([a-z]+))?$/.exec(t))) {
    const x = subjectOf(m[1]); if (!x) return null;
    const subject = lemma(x), vals = [m[3], m[4]].filter(Boolean), mine = typesOf(subject);
    const covered = /covered/.test(m[2]);
    const pool = covered ? slotsOf(sc, 'covered') : null;
    const cands = (pool ?? holding(sc, vals[0])).filter((s) => !numeric(s.def) && (!vals[1] || holding(sc, vals[1]).some((h) => h.type === s.type && h.key === s.key) || pool));
    const value = (c) => {
      const plural = m[2] === 'are' || m[2] === 'have' || /^are /.test(m[2]);
      const said = `${plural ? x : an(subject)} ${m[2]} ${vals.map((v) => (c.def.many || /has|have|covered/.test(m[2]) ? v : an(v))).join(' and ')}`;
      return { form: 'value', subject, object: vals.join(' and '), type: c.type, key: c.key, lines: [`${c.type} name=${q(subject)} ${vals.map((v) => `${c.key}=${q(v)}`).join(' ')}`], say: `OK, ${said}.` };
    };
    const own = pick(cands, mine, { strict: true });
    if (own && mine.includes(own.type)) return value(own);   // a slot of a type the thing has a record of
    if (/^(?:is|are)$/.test(m[2]) && !m[4]) {   // member: the record Y names keeps the things that are Y (a shape, a colour)
      const y = lemma(m[3]);
      for (const type of typesOf(y)) {
        const def = sc.slots.get(type)?.thing;
        if (def?.many) return { form: 'member', subject, object: y, type, key: 'thing', lines: [`${type} name=${q(y)} thing=${q(subject)}`], say: `OK, ${an(subject)} is ${an(y)}.` };
      }
    }
    const theirs = new Set(vals.flatMap((v) => typesOf(lemma(v))));   // a slot of the values' own type describes the values (a colour's family), not the thing
    const any = pick(cands.filter((c) => !theirs.has(c.type)), [], {});
    return any ? value(any) : null;
  }
  // verb: X V Y (and Z)   (the verb is a word of a slot: eat -> eats, say -> sound)
  if ((m = /^(.+?) ([a-z]+) ([a-z]+(?: [a-z]+)?)(?: and ([a-z]+))?$/.exec(t))) {
    const x = subjectOf(m[1], 2); if (!x) return null;
    if (/^(?:is|are|was|were|has|have|had|can|cannot|do|does|did|will|would|should|must|may|might|live|lives|make|makes|kind|type)$/.test(m[2])) return null;
    const subject = lemma(x), mine = typesOf(subject);
    const c = pick(slotsOf(sc, m[2], { wordsOnly: true }).filter((s) => !numeric(s.def) && !s.def.id && !(s.def.kind ?? []).includes('boolean')), mine, { strict: true });
    if (!c) return null;
    const vals = [m[3], m[4]].filter(Boolean);
    return { form: 'verb', subject, object: vals.join(' and '), type: c.type, key: c.key, lines: [`${c.type} name=${q(subject)} ${vals.map((v) => `${c.key}=${q(v)}`).join(' ')}`], say: `OK, ${x} ${m[2]} ${vals.join(' and ')}.` };
  }
  return null;
}
