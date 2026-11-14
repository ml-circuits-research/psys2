// SPDX-License-Identifier: AGPL-3.0-only
// ENGLISH GENERATION (specs/26-summary-and-composition.md, specs/25-random-as-a-world.md): the host's half of the library's realisation. The library fills the templates of the
// language world (`w.lang.en.discourse` for composition, `w.lang.en.template` for the acts) and leaves to the host what is the language's: how a name becomes a noun phrase, a fact
// a clause, a word its plural, and an article its form. This module does only that, from the facts of the world (irregular plurals, the auxiliaries, the article and its onsets, the
// joins of the schemas) and the library's own functions (`morphOf`, `templateFor`, `realise`, `discourseRealiser`): it has NO sentence of its own. What it cannot say it returns as
// null, and the library then lists the sentence as short. Browser-safe: no `node:*`.

const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
const words = (s) => String(s).replace(/_/g, ' ');
const META = new Set(['name', 'about', 'thing', 'source', 'own', 'cite', 'derived', 'named']);
const VOWELS = 'aeiou';
/** "a, b and c": the English way to join a list. */
export const joinList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const TYPE_KEYS = new Set(['class', 'kind', 'is']);   // the keys that say what a thing is: "is a bird"

/** The generator of a language world: `lib` is the sopworld namespace, `world` the library World that holds w.lang.en's templates, irregular plurals, auxiliaries and onsets. */
export function englishOf(lib, world) {
  const irregular = new Map(world.ofType('w.lang.en.irregular').map((w) => [bare(w.attrs.singular?.[0]), bare(w.attrs.plural?.[0])]));
  const preps = new Set(world.ofType('w.lang.en.prep').map((w) => bare(w.attrs.text?.[0])));
  const aux = new Set(world.ofType('w.lang.en.aux').map((w) => bare(w.attrs.text?.[0])));
  const verbs = new Set(world.ofType('k.actions.action').map((w) => bare(w.attrs.name?.[0])));
  const joins = new Set(world.ofType('core.slot').filter((w) => w.attrs.type && w.attrs.key).map((w) => `${bare(w.attrs.of?.[0])}:${bare(w.attrs.key[0])}`));
  const onsets = world.ofType('w.lang.en.onset').map((w) => [bare(w.attrs.begins?.[0]), bare(w.attrs.sound?.[0])]).sort((a, b) => b[0].length - a[0].length);
  const places = new Set(world.ofType('k.geo.country').concat(world.ofType('k.geo.city')).map((w) => bare(w.attrs.name?.[0])));

  /** The plural of a noun: an irregular one the world holds, else the regular spelling (s, es, ies). */
  const plural = (w) => {
    const x = String(w);
    if (irregular.has(x)) return irregular.get(x);
    if (/[^aeiou]y$/.test(x)) return `${x.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/.test(x)) return `${x}es`;
    return `${x}s`;
  };
  /** a before a consonant sound, an before a vowel sound (the world's det facts say which; its onsets say which words begin otherwise than they are spelled). */
  const article = (w) => {
    const x = String(w).toLowerCase();
    const o = onsets.find(([b]) => x.startsWith(b));
    return (o ? o[1] === 'vowel' : VOWELS.includes(x[0])) ? 'an' : 'a';
  };
  const inflect = (w, feats = {}) => (feats.num === 'pl' ? plural(w) : w);
  const np = (name) => (places.has(bare(name)) ? bare(name) : `the ${words(bare(name))}`);
  const ownKey = (type) => (k) => joins.has(`${type}:${k}`);

  /** A verb-like key (eats, can, cannot): the key is said as it is after the subject; any other key is a noun (the colour of the house is red). */
  const verbLike = (k) => aux.has(k) || (k.endsWith('not') && aux.has(k.slice(0, -3))) || verbs.has(k) || verbs.has(k.replace(/es$/, '')) || verbs.has(k.replace(/s$/, ''));
  const list = joinList;
  /** One clause for a fact { type, attrs }: the verbs first, then the other keys, at most three parts; null when the fact says nothing a sentence can (no subject, only joins). */
  function clause(f) {
    const a = f?.attrs ?? {};
    const subject = a.name?.[0] ?? a.about?.[0];
    if (!subject) return null;
    const join = ownKey(f.type);
    const keys = Object.keys(a).filter((k) => !META.has(k) && !k.startsWith('core.') && !join(k) && a[k]?.length);
    const say = (k) => {
      const vs = a[k].map((v) => words(bare(v)));
      if (verbLike(k)) return `${k} ${list(vs)}`;
      if (preps.has(k)) return `is ${k} ${list(vs.map(np))}`;
      if (TYPE_KEYS.has(k)) return `is ${article(vs[0])} ${vs[0]}`;
      if (vs.length === 1 && /^(true|false)$/.test(vs[0])) return `is ${vs[0] === "true" ? "" : "not "}${k}`;   // a yes-or-no attribute: "is landlocked"
      if (vs.length === 1 && /^\d+$/.test(vs[0]) && /s$/.test(k)) return `has ${vs[0]} ${vs[0] === '1' ? k.replace(/s$/, '') : k}`;   // a count of things: "has 2 legs"
      return `has ${article(k)} ${k} of ${list(vs)}`;   // any other attribute: "has a habitat of sea and ice", "has an area of 622984"
    };
    const parts = [...keys.filter(verbLike), ...keys.filter((k) => !verbLike(k))].slice(0, 3).map(say);
    return parts.length ? `${np(subject)} ${parts.join(', ')}` : null;
  }

  /** The realiser of composition frames over the world's discourse templates (the library's, with this language's noun phrase, clause and inflection). */
  const FACT_SLOTS = new Set(['fact', 'claim', 'evidence', 'thesis', 'example', 'thing', 'attribute', 'value']);
  const plain = (w) => ({ type: w.type, attrs: Object.fromEntries(Object.entries(w.attrs).filter(([k]) => !k.startsWith('core.')).map(([k, vs]) => [k, vs.map(bare)])) });
  /** The fact a slot is filled from: the frame's own, else the claim it restates. */
  const factOf = (frame, ctx) => frame.fact ?? (frame.recalls && world.get(frame.recalls) ? plain(world.get(frame.recalls)) : ctx.claims?.length && world.get(ctx.claims[0]) ? plain(world.get(ctx.claims[0])) : null);
  /** The key a sentence about one attribute names ("the colour of the house is red"): the first key that is a noun, not a verb, a preposition or a join. */
  const nounKey = (f) => Object.keys(f.attrs).find((k) => !META.has(k) && !TYPE_KEYS.has(k) && !k.startsWith('core.') && !verbLike(k) && !preps.has(k) && !ownKey(f.type)(k) && f.attrs[k]?.length);
  /** The host's filler, tried first: what a slot takes from a fact is said only when the fact is about the topic (a fact that merely names the topic among its values is not a claim about it), and the outline of relation types has no name to say. */
  const fill = (slot, frame, ctx) => {
    if (['parts', 'part', 'count'].includes(slot)) return null;
    if (!FACT_SLOTS.has(slot)) return undefined;
    const f = factOf(frame, ctx);
    if (!f) return undefined;
    if ((f.attrs.name?.[0] ?? f.attrs.about?.[0]) !== ctx.topic) return null;
    if (slot === 'attribute') return nounKey(f) ? words(nounKey(f)) : null;
    if (slot === 'value' || slot === 'example') { const k = nounKey(f); return k ? words(f.attrs[k][0]) : null; }
    return undefined;
  };
  const realiser = (seed) => lib.discourseRealiser(world, { seed, clause, np, inflect, fill });

  // ---- the acts: the generation templates of the language world, filled by the library's realise
  const acts = world.ofType('w.lang.en.template').map((t) => ({ act: bare(t.attrs.act?.[0]), shape: bare(t.attrs.shape?.[0] ?? ''), text: bare(t.attrs.text?.[0] ?? ''), mode: t.attrs.mode?.[0] ?? null }));
  const slotsOf = (text) => [...text.matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map((m) => m[1]);
  let morph = null;
  /**
   * A sentence for an act and its roles ({ kind, thing, attribute, value ... }): the template of the act whose slots are exactly the roles given (the most specific that fits),
   * filled by the library's `realise` (the plural of a `{role:num=pl}` is this language's), the articles in the form their word asks. null when no template fits.
   */
  function actSentence(act, roles, { mode = null } = {}) {
    const given = Object.keys(roles).filter((k) => roles[k] != null && roles[k] !== '');
    const fit = acts.filter((t) => t.act === act && (mode == null || t.mode == null || t.mode === mode)).filter((t) => { const s = slotsOf(t.text); return s.length === given.length && s.every((x) => given.includes(x)); });
    const t = fit[0];
    if (!t) return null;
    morph ??= lib.morphOf(world, { types: { template: 'w.lang.en.template' } });
    const r = { ...roles };
    for (const m of t.text.matchAll(/\{(\w+):num=pl\}/g)) r[m[1]] = plural(String(r[m[1]]));
    const out = lib.realise(morph, t.text, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, words(String(v))])));
    if (!out) return null;
    const fixed = out.replace(/\b(a|an) ([A-Za-z]\w*)/g, (_, _a, w) => `${article(w)} ${w}`);
    return fixed.charAt(0).toUpperCase() + fixed.slice(1);
  }
  return { list, plural, article, inflect, np, clause, realiser, actSentence };
}
