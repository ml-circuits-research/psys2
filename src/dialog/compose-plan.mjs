// SPDX-License-Identifier: AGPL-3.0-only
// THE PLAN OF A LONG COMPOSITION (spec 26, "Size and long topics"; owner request 2026-11-15: "I asked for 5,000 words and got a few short paragraphs").
// `std.compose` writes about ONE topic from the facts that name it (a dozen for an animal, a score for a country), so a size beyond that cannot come from the topic alone.
// This module plans the rest from the knowledge, never from padding:
//   relatedTopics   the names the topic's facts link to (what a penguin eats, where it lives; a country's neighbours and cities), the names whose facts name the topic,
//                   and the topic's siblings (other birds), each with the fact that links it (so the section opens with a traced sentence saying why it is there)
//   readLongTopic   a topic written as a paragraph: its phrases, the names the knowledge knows in it (the subject, the subtopics), the keys of facts it names (eat -> eats),
//                   and the phrases nothing was taken from (said back to the person)
// The sentences stay the library's (`std.compose` over the language world's templates, `clauseOf` for a linking fact): this module chooses WHAT to write about, not how.
// Browser-safe: no `node:*`.

const bare = (v) => String(v ?? '').replace(/^"|"$/g, '').replace(/^\$/, '');
const META = new Set(['name', 'about', 'source', 'own', 'cite', 'derived', 'named', 'code', 'code2', 'lat', 'lon', 'drawing', 'count', 'where', 'example', 'result']);
const SKIP_TYPE = /^(?:core\.|k\.genres|k\.interest|w\.lang|k\.story|joins)/;
const SIB_KEYS = ['class', 'kind', 'continent', 'region', 'group'];
/** The subject types a section can be about (one kind of thing per section). */
export const PRIMARY = /^k\.(?:animals\.animal|geo\.country|geo\.city)$/;
const subjectOf = (w) => bare(w.attrs.name?.[0] ?? w.attrs.about?.[0] ?? '');

const indexes = new WeakMap();
/** The names of the knowledge (lowercase -> { name, facts: [wire] }) and the other spellings the knowledge gives them (core.word text -> means: "penguins" -> penguin). */
export function nameIndex(kw) {
  if (indexes.has(kw)) return indexes.get(kw);
  const names = new Map(), spell = new Map(), keys = new Set();
  for (const w of kw.wires.values()) {
    if (SKIP_TYPE.test(w.type)) continue;
    const n = subjectOf(w);
    if (n) { const k = n.toLowerCase(); (names.get(k) ?? names.set(k, { name: n, facts: [] }).get(k)).facts.push(w); }
    for (const k of Object.keys(w.attrs)) if (!k.startsWith('core.') && !META.has(k)) keys.add(k);
  }
  for (const w of kw.ofType('core.word')) { const m = bare(w.attrs.means?.[0]).toLowerCase(); if (!names.has(m)) continue; for (const t of w.attrs.text ?? []) spell.set(bare(t).toLowerCase(), m); }
  const ix = { names, spell, keys };
  indexes.set(kw, ix);
  return ix;
}

/** What there is to say about a name: the (key, values) of its facts beyond the meta keys and what it is (a count of keys, not of wires: a city's one wire holds its population and its country). */
const sayable = (kw, name) => (nameIndex(kw).names.get(String(name).toLowerCase())?.facts ?? []).flatMap((w) => Object.keys(w.attrs).filter((k) => !k.startsWith('core.') && !META.has(k) && k !== 'class' && k !== 'kind'));

/** A name as the knowledge writes it, from a word or phrase of the person (case, a plural or another spelling the knowledge lists): null when unknown. */
export function knownName(kw, text) {
  const { names, spell } = nameIndex(kw);
  const t = String(text ?? '').toLowerCase().replace(/^(?:the|a|an)\s+/, '').trim();
  if (!t) return null;
  for (const c of [t, spell.get(t), t.replace(/ies$/, 'y'), t.replace(/es$/, ''), t.replace(/s$/, '')]) if (c && names.has(c)) return names.get(c).name;
  return null;
}

/**
 * The topics related to `topic`, best first, each { name, key, dir: 'out' | 'in' | 'sib', link: { type, attrs } (the linking fact, projected on its subject and the one key), cites (its wire) }.
 * out: a value of one of the topic's facts that the knowledge knows (penguin eats fish); in: a name whose fact names the topic (Germany: neighbour France); sib: a name of the same
 * kind (robin: class bird). `prefer`: names and keys the person asked for (a long topic) come first. Only names with at least `min` facts to say are offered.
 */
export function relatedTopics(kw, topic, { prefer = [], keys: wantKeys = [], min = 2, max = 80, caps = { in: 25, sib: 25 } } = {}) {
  const { names } = nameIndex(kw);
  const T = String(topic), t = T.toLowerCase();
  const own = names.get(t)?.facts ?? [];
  // the values of a verb-like key are acts, not things ("cannot fly" names no fly): the auxiliaries of the language world and their negations
  const aux = new Set(kw.ofType('w.lang.en.aux').map((w) => bare(w.attrs.text?.[0])));
  const actKey = (k) => aux.has(k) || (k.endsWith('not') && aux.has(k.slice(0, -3)));
  // what the topic is like: its (key, value) pairs, so a sibling that shares more of them comes first (a penguin's siblings: the birds of the sea before the birds of the garden)
  const traits = new Set(own.flatMap((w) => Object.entries(w.attrs).filter(([k]) => !k.startsWith('core.') && !META.has(k)).flatMap(([k, vs]) => vs.map((v) => `${k}=${bare(v)}`))));
  const shared = (name) => (names.get(String(name).toLowerCase())?.facts ?? []).reduce((n, w) => n + Object.entries(w.attrs).filter(([k]) => !k.startsWith('core.') && !META.has(k) && !SIB_KEYS.includes(k)).reduce((m, [k, vs]) => m + vs.filter((v) => traits.has(`${k}=${bare(v)}`)).length, 0), 0);
  const out = new Map();
  const add = (name, key, dir, w, value) => {
    const k = String(name).toLowerCase();
    if (k === t || out.has(k) || !names.has(k) || sayable(kw, name).length < min) return;
    if (names.get(k).facts.every((x) => /^k\.(?:actions|people\.role)/.test(x.type))) return;   // an act (lift, remember) or a role is not a thing to write a section about
    const subj = dir === 'out' ? T : names.get(k).name;
    // the kind of thing the section is about, when the name is two things (Luxembourg the country and the city): the linking fact's own type, else the name's richest subject type
    const prim = names.get(k).facts.filter((x) => PRIMARY.test(x.type)).sort((a, b) => Object.keys(b.attrs).length - Object.keys(a.attrs).length)[0]?.type ?? null;
    out.set(k, { name: names.get(k).name, key, dir, cites: w.id, type: dir !== 'out' && PRIMARY.test(w.type) ? w.type : prim, shared: dir === 'sib' ? shared(name) : 0, link: { type: w.type, attrs: { name: [subj], [key]: [value ?? (dir === 'out' ? names.get(k).name : T)] } } });
  };
  for (const w of own) for (const [key, vs] of Object.entries(w.attrs)) if (!key.startsWith('core.') && !META.has(key) && !SIB_KEYS.includes(key) && !actKey(key)) for (const v of vs) add(bare(v), key, 'out', w);
  for (const w of kw.wires.values()) {
    if (SKIP_TYPE.test(w.type) || w.type === 'core.word' || /^k\.actions\./.test(w.type)) continue;   // an act that names the topic (slide: who penguin) links no thing to it
    const s = subjectOf(w); if (!s || s.toLowerCase() === t) continue;
    for (const [key, vs] of Object.entries(w.attrs)) if (!key.startsWith('core.') && !META.has(key) && !actKey(key) && vs.some((v) => bare(v) === T)) { add(s, key, 'in', w); break; }
  }
  // siblings by the narrow kind of the topic's own subject type (an animal's class, a country's region), never by a broad one (k.attributes kind=animal names every animal)
  for (const w of own.filter((x) => /^k\.(?:animals\.animal|geo\.country|geo\.city)$/.test(x.type))) for (const key of SIB_KEYS) for (const v of w.attrs[key] ?? []) {
    const val = bare(v);
    for (const x of kw.ofType(w.type)) if (x !== w && (x.attrs[key] ?? []).some((y) => bare(y) === val)) add(subjectOf(x), key, 'sib', x, val);
  }
  const pref = new Set(prefer.map((p) => String(p).toLowerCase())), wk = new Set(wantKeys);
  const tier = { out: 0, in: 1, sib: 2 };
  const seen = { in: 0, sib: 0 };
  const all = [...out.values()].sort((a, b) => b.shared - a.shared).filter((r) => pref.has(r.name.toLowerCase()) || !(r.dir in caps) || (seen[r.dir] < 10 || r.dir !== 'sib' || r.shared >= 2) && seen[r.dir]++ < caps[r.dir]);
  const rank = (r) => (pref.has(r.name.toLowerCase()) ? -100 : 0) + (wk.has(r.key) ? -50 : 0) + tier[r.dir] * 10 - Math.min(1, sayable(kw, r.name).length / 20) - (r.dir === 'sib' ? Math.min(0.9, r.shared / 10) : 0);
  // grouped by relation (the sections of one key stand together: one chapter), the groups in the order of their best member
  const byKey = new Map();
  for (const r of all.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))) (byKey.get(`${r.dir}:${r.key}`) ?? byKey.set(`${r.dir}:${r.key}`, []).get(`${r.dir}:${r.key}`)).push(r);
  return [...byKey.values()].flat().slice(0, max);
}

/**
 * A topic written as text (a sentence or a paragraph). Returns { topic, subtopics, keys, phrases: [{ text, used: [names / keys] }], unused: [phrases nothing was taken from] }.
 * The topic is the known name said most often (the first on a tie), preferring one the composer has as a subject (`subjects`: lowercase names); the rest are subtopics.
 */
export function readLongTopic(kw, text, { subjects = null } = {}) {
  const { keys } = nameIndex(kw);
  const phrases = String(text ?? '').split(/[.!?;:\n]+|,\s*|\s+(?:and|but|or|because|so|then|while|with)\s+/i).map((p) => p.trim()).filter(Boolean);
  const count = new Map(), first = new Map(), keySet = new Set(), out = [];
  for (const [pi, p] of phrases.entries()) {
    const toks = p.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter(Boolean);
    const used = [];
    for (let i = 0; i < toks.length;) {
      let hit = null, len = 0;
      for (let n = Math.min(3, toks.length - i); n >= 1 && !hit; n--) { const name = knownName(kw, toks.slice(i, i + n).join(' ')); if (name && !/^\d+$/.test(name) && toks[i].length > 2 && isThing(kw, name)) { hit = name; len = n; } }
      if (hit) { used.push(hit); count.set(hit, (count.get(hit) ?? 0) + 1); if (!first.has(hit)) first.set(hit, pi * 100 + i); i += len; continue; }
      const w = toks[i];
      const key = w.length > 2 && [w, `${w}s`, `${w}es`, w.replace(/ing$/, 's'), w.replace(/s$/, '')].find((k) => keys.has(k));
      if (key) { keySet.add(key); used.push(key); }
      i++;
    }
    out.push({ text: p, used: [...new Set(used)] });
  }
  const known = [...count.keys()];
  const score = (n) => (subjects?.has(n.toLowerCase()) ? 1000 : 0) + count.get(n) * 10 - first.get(n) / 1000;
  const ordered = known.sort((a, b) => score(b) - score(a));
  return { topic: ordered[0] ?? null, subtopics: ordered.slice(1), keys: [...keySet], phrases: out, unused: out.filter((p) => !p.used.length).map((p) => p.text) };
}

/** Is this topic text long enough to be read as a paragraph (more than a name: several words, or sentences)? */
export const isLongTopic = (text) => /[.!?;\n]/.test(String(text ?? '').trim().replace(/[.!?]+$/, '')) || String(text ?? '').trim().split(/\s+/).length > 4;

/** A name that stands for a thing, not only an act or a role of the knowledge ("know", "eat" are acts of k.actions; "teacher" a role). */
export const isThing = (kw, name) => !(nameIndex(kw).names.get(String(name).toLowerCase())?.facts ?? []).every((x) => /^k\.(?:actions|people\.role)/.test(x.type));

/** Words of a text (for the size the person asked: the words actually written). */
export const wordCount = (s) => (String(s ?? '').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
