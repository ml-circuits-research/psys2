// SPDX-License-Identifier: AGPL-3.0-only
// The thin adapter between the acts executor and sopworld `resolve(phrase) -> ids + tier` (0.31, over `std.grammar` reading the facts of handover/lang.en in place).
// The library reads the phrase with the grammar (determiners, ordinals, numbers, "all/both", names, "next to", pronouns) and looks the things up among `std.schema.thing` wires; this module
// only (1) puts the executor's things on a World as wires, (2) says which words of the phrase are kinds, values and names (the open classes: the executor's schema owns them), and
// (3) turns the library's answer into the executor's result shape ({ ids, source, kind, guess } | { ask, candidates }). What the library does not read (it returns no ids, or a
// reading the executor's own rules refuse) is left to the executor: it keeps the failure classes of its replies (no such kind, none of that kind, nothing in focus).
// Browser-safe: no `node:*`.
import { World, resolve as libResolve } from '../../src/vendor/sopworld/sopworld.mjs';
import { LANG_EN_FACTS } from '../../src/lang/en.facts.generated.mjs';

// the grammar of the catalog world w.lang.en (shards of the bundle): the productions and the closed classes of English noun phrases
const SHARDS = ['grammar', 'determiners', 'numbers', 'prepositions', 'pronouns'];
const CATS = { det: 'DET', num: 'NUM', mod: 'MOD', head: 'N', pp: 'PP', ord: 'ORD', name: 'NAME', pron: 'PRON' };
// the constructions of noun phrases the library resolves; the others (coordination, "or", "some of", "the other one", relative clauses, anaphora) are read by the host first (src/lang/np-resolve.mjs, en.nounPhrase / splitThings)
const HOST_READ = /^(coord|anaphora|ellipsis|q)\.|^np\.relative$|^helper\.(?!MODS$|NOUNS$)/;
/**
 * The grammar text the library gets: the rules it resolves, and the quantifier category QALL (all, every, each, both) written as the literal alternatives `[all|every|each|both]`, which is how the library
 * finds a quantifier over a whole set (a category of words is no quantifier to it yet: [LIB] docs/lessons.md).
 */
function onlyConstructions(text) {
  const qall = text.split('\n').filter((l) => / w\.lang\.en\.word /.test(l) && / cat=QALL\b/.test(l)).map((l) => /\btext="?([^"\s]+)/.exec(l)[1]);
  return text.split('\n').filter((l) => !/^@\S+ w\.lang\.en\.rule /.test(l) || !HOST_READ.test(/ construction=(\S+)/.exec(l)?.[1] ?? ''))
    .map((l) => (/^@\S+ w\.lang\.en\.rule /.test(l) ? l.replace(/\brhs=QALL\b/g, `rhs="[${qall.join("|")}]"`) : l)).join('\n');
}
// the closed classes the library reads as words (the others words of the catalog, partitives, relative pronouns, auxiliaries, are read by the host: a word in two classes, "all", is not ambiguous to the host)
const CLOSED = new Set(['DET', 'NUM', 'ORD', 'PREP', 'TPREP', 'PRON']);
let BASE = null, GRAMMAR = null;   // the grammar world: the facts of English noun phrases, loaded once, forked per call; its options: which category is which type (the world's own `w.lang.en.cat` facts)
const base = () => {
  if (BASE) return BASE;
  const w = new World();
  for (const s of SHARDS) w.tell(s === 'grammar' ? onlyConstructions(LANG_EN_FACTS[s]) : LANG_EN_FACTS[s]);
  const classes = {};
  let digits;
  for (const c of w.ofType('w.lang.en.cat')) {
    if (c.attrs.digits) digits = c.attrs.name[0];
    if (c.attrs.type && c.attrs.type[0] !== 'w.lang.en.word' && CLOSED.has(c.attrs.name[0])) classes[c.attrs.name[0]] = c.attrs.type[0];
  }
  GRAMMAR = { digits, types: { rule: 'w.lang.en.rule', word: 'w.lang.en.word' }, classes };
  return (BASE = w);
};
const atom = (s) => String(s).toLowerCase().replace(/[^a-z0-9_.-]+/g, '_');
const wireOf = (it) => `${atom(it.kind)}${it.n ?? ''}${it.n == null ? `_${atom(it.id)}` : ''}`;

/**
 * resolvePhrase(items, text, { kindOf, valueOf, nameOf, focus }) -> { ids, tier, plural } | null
 *   items    the executor's things { id, kind, n, name, attrs, place: { ref } }
 *   kindOf(word)   the kind name a word stands for (name, plural, synonym, the knowledge's word for it) or null; { kind, plural }
 *   valueOf(word)  the canonical value a word stands for in any attribute (a colour, an enum value, a number) or undefined
 *   nameOf(word)   the name of a thing the word spells, or null
 *   focus          ids of the dialogue focus, newest first (only a pronoun uses it)
 * null: the library did not read it as a set of things (the executor decides what to say).
 */
export function resolvePhrase(items, text, { kindOf, valueOf, nameOf, focus = [] }) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s'_-]+/g, ' ').split(/\s+/).filter(Boolean);
  const lexicon = {};
  const plurals = new Set();
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    const k = kindOf(w);
    if (k) { lexicon[w] = { cat: 'N', lemma: k.kind }; if (k.plural) plurals.add(w); continue; }
    const nm = nameOf(w);
    if (nm != null) { lexicon[w] = { cat: 'NAME', lemma: String(nm).toLowerCase() }; continue; }
    const v = valueOf(w);
    if (v !== undefined) lexicon[w] = { cat: 'MOD', lemma: String(v).toLowerCase() };
  }
  const w = base().fork();
  const idOf = new Map();
  let wires = '';
  for (const it of items) {
    const id = wireOf(it);
    idOf.set(id, it.id);
    let line = `@${id} std.schema.thing kind=${atom(it.kind)}`;
    if (it.name) line += ` name=${atom(it.name)}`;
    for (const [k, v] of Object.entries(it.attrs ?? {})) if (v !== true && v !== false && v != null) line += ` ${atom(k)}=${atom(v)}`;
    if (it.place?.ref) line += ` at=$${wireOf(items.find((x) => x.id === it.place.ref) ?? it)}`;
    wires += `${line}\n`;
  }
  if (wires) w.tell(wires);
  const focusIds = focus.map((id) => items.find((x) => x.id === id)).filter(Boolean).map(wireOf);
  const r = libResolve(w, text, { grammar: { ...GRAMMAR, lexicon }, cats: CATS, focus: focusIds });
  const kind = words.map((x) => lexicon[x]).find((x) => x?.cat === 'N')?.lemma ?? null;
  if (!r.ids?.length && r.which?.length) {
    // several of the kind remain: with a modifier or a name said, or a plural noun, they are all meant; otherwise the executor asks which one ("tables" is every table, "the table" is a question)
    const said = words.some((x) => lexicon[x] && lexicon[x].cat !== 'N') || words.some((x) => plurals.has(x)) || /\d/.test(text);
    if (said && !r.why?.includes('not two')) return { ids: r.which.map((x) => idOf.get(x)), tier: 'user', kind };
    return { ask: r.which.map((x) => idOf.get(x)), kind };
  }
  if (!r.ids?.length) return null;
  // "table 3" names the thing numbered 3; the library falls back to the third table when none is numbered 3, the executor says there is none
  const at = words.findIndex((x, i) => /^\d+$/.test(x) && lexicon[words[i - 1]]?.cat === 'N');
  if (at > 0 && r.ids.length === 1 && items.find((x) => idOf.get(wireOf(x)) === idOf.get(r.ids[0]))?.n !== Number(words[at])) return null;
  return { ids: r.ids.map((x) => idOf.get(x)), tier: r.tier, kind };
}
