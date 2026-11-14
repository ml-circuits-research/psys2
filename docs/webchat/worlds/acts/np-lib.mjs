// SPDX-License-Identifier: AGPL-3.0-only
// The thin adapter between the acts executor and sopworld `resolve(phrase) -> ids + tier` (0.31, over `std.grammar` reading the facts of handover/lang.en in place).
// The library reads the phrase with the grammar (determiners, ordinals, numbers, "all/both", names, "next to", pronouns) and looks the things up among `std.schema.thing` wires; this module
// only (1) puts the executor's things on a World as wires, (2) says which words of the phrase are kinds, values and names (the open classes: the executor's schema owns them), and
// (3) turns the library's answer into the executor's result shape ({ ids, source, kind, guess } | { ask, candidates }). What the library does not read (it returns no ids, or a
// reading the executor's own rules refuse) is left to the executor: it keeps the failure classes of its replies (no such kind, none of that kind, nothing in focus).
// Browser-safe: no `node:*`.
import { World, resolve as libResolve } from '../../lib/vendor/sopworld/sopworld.mjs?v=b94d7a689a';
import { LANG_EN_FACTS } from '../../lib/lang/en.facts.generated.mjs?v=1ec6c20720';

// the grammar of the catalog world w.lang.en (shards of the bundle): the productions and the closed classes of English noun phrases
const SHARDS = ['grammar', 'determiners', 'numbers', 'prepositions', 'pronouns'];
const LIB_TYPES = { rule: 'w.lang.en.rule', word: 'w.lang.en.word', coord: 'lib.coord' };
const CATS = { det: 'DET', num: 'NUM', mod: 'MOD', head: 'N', pp: 'PP', ord: 'ORD', name: 'NAME', pron: 'PRON' };
// the constructions of noun phrases the library resolves by its own rules; the host-shaped ones (the tails of coordination, relative clauses, anaphora) are not loaded: the library coordinates by the words the facts name as `coord`
// (and, the comma, "or" = choice), reads "two of the tables" by `NP -> NUM PP` and "the other one" by a modifier that means `std.other` (0.40.0: choice asked, elliptic parts, parts of a set, the other one)
const HOST_READ = /^(coord|anaphora|ellipsis|q)\.|^np\.(relative|quant-of)$|^helper\.(?!MODS$|NOUNS$)/;
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
let BASE = null, GRAMMAR = null, PARTS = null;   // the grammar world: the facts of English noun phrases, loaded once, forked per call; its options: which category is which type (the world's own `w.lang.en.cat` facts)
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
  GRAMMAR = { digits, types: LIB_TYPES, classes };
  // the words the library coordinates by, from the same facts: the separators (and, &), the choice words (or: `kind=choice`, asked); the comma is turned into "and" before the call
  const sep = [...new Set(w.ofType('w.lang.en.coord.sep').flatMap((x) => (x.attrs.text ?? []).map((t) => String(t).replace(/^"|"$/g, ''))).filter((t) => /^[a-z&]+$/.test(t)))];
  const choice = w.ofType('w.lang.en.choice').flatMap((x) => (x.attrs.text ?? []).map((t) => String(t).replace(/^"|"$/g, '')));
  w.tell([...sep.map((t, i) => `@lib.coord.${i} lib.coord word=${atom(t)}`), ...choice.map((t, i) => `@lib.choice.${i} lib.coord word=${atom(t)} kind=choice`),
    '@lib.rule.part w.lang.en.rule lhs=NP rhs=NUM rhs=PP head=NP'].join('\n'));   // "two of the tables": a count and a PP with no noun of its own
  // the partitive and "other" words, by mode (facts of the same shard): all = the quantifier alone, ask = which ones; the others are modifiers that mean `std.other`
  PARTS = { coord: new Set([...sep, ...choice]), dets: new Set(w.ofType('w.lang.en.det').flatMap((x) => (x.attrs.text ?? []).map((t) => String(t).replace(/^"|"$/g, '').toLowerCase()))), all: new Set(), ask: new Set(), other: new Set(), pron: new Set(w.ofType(classes.PRON ?? 'w.lang.en.pron').flatMap((x) => (x.attrs.text ?? []).map((t) => String(t).replace(/^"|"$/g, '').toLowerCase()))) };
  for (const x of w.ofType('w.lang.en.partitive')) for (const t of x.attrs.text ?? []) { const m = x.attrs.mode?.[0]; if (m === 'all' || m === 'ask') PARTS[m].add(String(t).replace(/^"|"$/g, '').toLowerCase()); }
  for (const x of w.ofType('w.lang.en.other')) for (const t of x.attrs.text ?? []) { const word = String(t).replace(/^"|"$/g, '').toLowerCase().replace(/^the /, ''); PARTS.other.add(word); }
  w.tell([...PARTS.other].map((t, i) => `@lib.other.${i} core.word text=${atom(t)} means=std.other`).join('\n'));
  return (BASE = w);
};
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const atom = (s) => String(s).toLowerCase().replace(/[^a-z0-9_.-]+/g, '_');
const wireOf = (it) => `${atom(it.kind)}${it.n ?? ''}${it.n == null ? `_${atom(it.id)}` : ''}`;

/**
 * resolvePhrase(items, text, { kindOf, valueOf, nameOf, focus }) -> result | null
 *   items    the executor's things { id, kind, n, name, attrs, place: { ref } }
 *   kindOf(word)   the kind name a word stands for (name, plural, synonym, the knowledge's word for it) or null; { kind, plural }
 *   valueOf(word)  the canonical value a word stands for in any attribute (a colour, an enum value, a number) or undefined
 *   nameOf(word)   the name of a thing the word spells, or null
 *   focus          ids of the dialogue focus, newest first (only a pronoun and "the other one" read it; "the tables" with one in focus is still every table)
 * result: { ids, tier, kind } | { ask: [ids], how: 'choice' | 'part' | 'kind', n?, kind } | { ids, tier, kind, other: { plural } }; null: the library did not read it as a set of things (the executor decides what to say).
 * A phrase that is one set of things, a coordination of them, a choice ("table 1 or table 2": asked), a part of a set ("two of the tables") or "the other one" is read by the library. "some of the tables" (the partitive
 * words of mode ask) reads the set and asks which ones, "all of the tables" is "all the tables" (the facts' `w.lang.en.partitive` modes: the library takes a number as a part, not a word like "some").
 */
export function resolvePhrase(items, text, opts) {
  budget.tick('acts.np-lib.phrase');   // the phrase may be read again ("all of", "some of"): each reading is charged
  const { kindOf, valueOf, nameOf, focus = [] } = opts;
  base();
  const raw = String(text).toLowerCase().replace(/\s*,\s*(?=(?:and|or)\b)/g, ' ').trim();
  const ws0 = raw.replace(/[^a-z0-9\s'_&-]+/g, ' ').split(/\s+/).filter(Boolean);
  // "some of the tables": the set, then which ones; "all of the tables": the set
  for (const n of [2, 1]) {
    const lead = ws0.slice(0, n).join(' ');
    if (ws0[n] !== 'of' || ws0.length < n + 2) continue;
    if (PARTS.all.has(lead)) return resolvePhrase(items, `${lead} ${ws0.slice(n + 1).join(' ')}`, opts);
    if (PARTS.ask.has(lead)) return partOfSet(items, ws0.slice(n + 1).join(' '), opts);
  }
  if (ws0[0] === 'of' && ws0.length > 1) return partOfSet(items, ws0.slice(1).join(' '), opts);
  const sepr = / or /.test(` ${raw} `) ? ' or ' : ' and ';
  let phrase = raw.replace(/\s*,\s*/g, sepr);
  for (const o of PARTS.other) if (PARTS.dets.has(o)) phrase = phrase.replace(new RegExp(`\\b${o}\\b`, 'g'), 'the other');   // "another table" is "the other table" (a word that is also a determiner is not read as one here)
  const words = phrase.replace(/[^a-z0-9\s'_&-]+/g, ' ').split(/\s+/).filter(Boolean);
  const lexicon = {};
  const plurals = new Set();
  let other = null;
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (PARTS.other.has(w)) { lexicon[w] = { cat: 'MOD', lemma: w }; other = { plural: w.endsWith('s') && w !== 'as' }; continue; }
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
  let ph = phrase;
  if (other && !words.some((x) => lexicon[x]?.cat === 'N')) {   // "the other one": the things of the kind of the focus that are not in focus
    const fk = items.find((x) => x.id === focus[0])?.kind;
    if (fk) { ph = `${ph.replace(/\bones?\b/g, '').replace(/\s+/g, ' ').trim()} one`; lexicon.one = { cat: 'N', lemma: fk }; }
  }
  const focusIds = (other || words.some((x) => PARTS.pron.has(x)) ? focus : []).map((id) => items.find((x) => x.id === id)).filter(Boolean).map(wireOf);
  const r = libResolve(w, ph, { grammar: { ...GRAMMAR, lexicon }, cats: CATS, focus: focusIds });
  const kind = words.map((x) => lexicon[x]).find((x) => x?.cat === 'N')?.lemma ?? null;
  const ids = (xs) => xs.map((x) => idOf.get(x));
  if (r.ask === true && r.which?.length === 1) return { ids: ids(r.which), tier: 'user', kind };   // "table 1 or table 1" is one thing
  if (r.ask === true && r.which?.length) {   // a choice or a part of a set: the library asks, with the things it could be
    const part = /^which (\d+) of/.exec(r.why ?? '');
    return { ask: ids(r.which), how: part ? 'part' : 'choice', ...(part ? { n: Number(part[1]) } : {}), kind };
  }
  if (other && !r.ids?.length && r.which?.length) return { ids: ids(r.which), tier: 'focus', kind, other };   // the things that are not in focus: the executor takes one or asks, as the number says
  if (!r.ids?.length && r.which?.length && words.some((x) => PARTS.coord.has(x))) return null;   // a part of a coordination that names several ("the tables or the guests"): the host reads the parts, one by one
  if (!r.ids?.length && r.which?.length) {
    // several of the kind remain: with a modifier or a name said, or a plural noun, they are all meant; otherwise the executor asks which one ("tables" is every table, "the table" is a question)
    const said = words.some((x) => lexicon[x] && lexicon[x].cat !== 'N') || words.some((x) => plurals.has(x)) || /\d/.test(text);
    if (said && !r.why?.includes('not two')) return { ids: ids(r.which), tier: 'user', kind };
    return { ask: ids(r.which), how: 'kind', kind };
  }
  if (!r.ids?.length && other) {   // "the other table" with none of the kind in focus: the library asks "other than what?"; every one of the kind is meant, not the one in focus
    const k = kind ?? items.find((x) => x.id === focus[0])?.kind;
    const pool = k ? items.filter((x) => x.kind === k && !focus.includes(x.id)) : [];
    return pool.length ? { ids: pool.map((x) => x.id), tier: 'focus', kind: k, other } : k ? { none: true, kind: k } : { missing: true };
  }
  if (!r.ids?.length) return null;
  // "table 3" names the thing numbered 3; the library falls back to the third table when none is numbered 3, the executor says there is none
  const at = words.findIndex((x, i) => /^\d+$/.test(x) && lexicon[words[i - 1]]?.cat === 'N');
  if (at > 0 && r.ids.length === 1 && items.find((x) => idOf.get(wireOf(x)) === idOf.get(r.ids[0]))?.n !== Number(words[at])) return null;
  return { ids: ids(r.ids), tier: r.tier, kind, ...(other ? { other } : {}) };
}

/** "some of the tables": the set the part is taken from, then which ones (never guessed). */
function partOfSet(items, text, opts) {
  const r = resolvePhrase(items, text, opts);
  if (!r?.ids || r.ids.length < 2) return r;
  return { ask: r.ids, how: 'part', kind: r.kind };
}
