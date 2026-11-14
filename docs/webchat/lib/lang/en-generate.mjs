// SPDX-License-Identifier: AGPL-3.0-only
// ENGLISH GENERATION (specs/26-summary-and-composition.md, specs/25-random-as-a-world.md): the host's half of the library's realisation. The library fills the templates of the
// language world (`w.lang.en.discourse` for composition, `w.lang.en.template` for the acts) and leaves to the host what is the language's: how a name becomes a noun phrase, a fact
// a clause, a word its plural, and an article its form. This module does only that, from the facts of the world (irregular plurals, the auxiliaries, the article and its onsets, the
// joins of the schemas) and the library's own functions (`morphOf`, `templateFor`, `realise`, `discourseRealiser`): it has NO sentence of its own. What it cannot say it returns as
// null, and the library then lists the sentence as short. Browser-safe: no `node:*`.

const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
const words = (s) => String(s).replace(/_/g, ' ');
const META = new Set(['name', 'about', 'thing', 'source', 'own', 'cite', 'derived', 'named']);
const TYPE_KEYS = new Set(['class', 'kind', 'is']);   // the keys that say what a thing is: "is a bird"

/** The generator of a language world: `lib` is the sopworld namespace, `world` the library World that holds w.lang.en's templates, irregular plurals, auxiliaries and onsets. */
export function englishOf(lib, world) {
  const irregular = new Map(world.ofType('w.lang.en.irregular').map((w) => [bare(w.attrs.singular?.[0]), bare(w.attrs.plural?.[0])]));
  const preps = new Set(world.ofType('w.lang.en.prep').map((w) => bare(w.attrs.text?.[0])));
  const aux = new Set(world.ofType('w.lang.en.aux').map((w) => bare(w.attrs.text?.[0])));
  const verbs = new Set(world.ofType('k.actions.action').map((w) => bare(w.attrs.name?.[0])));
  const joins = new Set(world.ofType('core.slot').filter((w) => w.attrs.type && w.attrs.key).map((w) => `${bare(w.attrs.of?.[0])}:${bare(w.attrs.key[0])}`));
  const places = new Set(world.ofType('k.geo.country').concat(world.ofType('k.geo.city')).map((w) => bare(w.attrs.name?.[0])));

  /** The plural of a noun: an irregular one the world holds, else the regular spelling (s, es, ies). */
  const plural = (w) => {
    const x = String(w);
    if (irregular.has(x)) return irregular.get(x);
    if (/[^aeiou]y$/.test(x)) return `${x.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/.test(x)) return `${x}es`;
    return `${x}s`;
  };
  /** a before a consonant sound, an before a vowel sound: the library's `articleFor` over the world's det and onset facts. */
  const article = (w) => lib.articleFor(world, w) ?? 'a';
  const inflect = (w, feats = {}) => (feats.num === 'pl' ? plural(w) : w);
  const np = (name) => (places.has(bare(name)) ? bare(name) : `the ${words(bare(name))}`);
  const ownKey = (type) => (k) => joins.has(`${type}:${k}`);

  /** A verb-like key (eats, can, cannot): the key is said as it is after the subject; any other key is a noun (the colour of the house is red). */
  const verbLike = (k) => aux.has(k) || (k.endsWith('not') && aux.has(k.slice(0, -3))) || verbs.has(k) || verbs.has(k.replace(/es$/, '')) || verbs.has(k.replace(/s$/, ''));
  const list = (a) => lib.joinList(a);   // the library's (0.102)
  /** One clause for a fact: the library's `clauseOf` (0.102; the verbs, prepositions, types, counts and nouns of the language world). */
  const clause = (f) => lib.clauseOf(world, f, { names: places });

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

  // ---- the acts: the library's `actSentence` (0.102) fills the act templates of the language world
  const actSentence = (act, roles) => lib.actSentence(world, act, roles);
  return { list, plural, article, inflect, np, clause, realiser, actSentence };
}
