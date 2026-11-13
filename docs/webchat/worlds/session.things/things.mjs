// SPDX-License-Identifier: AGPL-3.0-only
// session.things (spec 23): one store of things for the session. A thing has an identity, a kind (a word of the knowledge), attributes and the aspects those give it; a tab is a VIEW
// that declares which aspects it shows. Pure and browser-safe: the state is a plain object (the state of the world session.things), knowledge comes in as a settled lookup `th`
// (what `ctx.knowledge.peek(kind)` returns) and as `ancestors(kind)`; no `process`, no `node:*`.
//
//   state: { things: [{ id, kind, name, attrs, parts?, origin, shown: [viewId], aspects: { visual: 'knowledge' | 'schema' | 'attribute' | 'temporary', ... } }], views: { <id>: declaration }, learned: [wire lines], n }

export const ASPECTS = ['visual', 'spatial', 'relational', 'numeric', 'textual', 'geographic', 'temporal', 'social'];
/** What a view says about an aspect to a person ("a table has no picture to show"). */
export const ASPECT_WORDS = { visual: 'picture', spatial: 'place', relational: 'links', numeric: 'numbers', textual: 'name', geographic: 'position on the map', temporal: 'time', social: 'people side' };

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const lc = (s) => String(s ?? '').toLowerCase().trim();

export function ensure(state) {
  state.things ??= []; state.views ??= {}; state.learned ??= []; state.n ??= 0;
  return state;
}

// ---- aspects --------------------------------------------------------------------------------------------------------------------------------------------------
// TEMPORARY (deleted when the knowledge repo's k.attributes says which attributes a kind has): which aspect an attribute belongs to when its schema type does not say.
export const ATTR_ASPECT_TEMPORARY = { colour: 'visual', color: 'visual', shape: 'visual', variant: 'visual', style: 'visual', size: 'spatial', place: 'spatial', x: 'spatial', y: 'spatial', position: 'spatial',
  seats: 'numeric', count: 'numeric', n: 'numeric', value: 'numeric', amount: 'numeric', price: 'numeric', population: 'numeric', name: 'textual', description: 'textual', lat: 'geographic', lon: 'geographic',
  date: 'temporal', time: 'temporal', role: 'social', feeling: 'social', owner: 'social' };
const TYPE_ASPECT = { colour: 'visual', number: 'numeric', text: 'textual' };

/** The aspect an attribute gives its thing: the schema's declaration (`attrAspects`: attribute -> aspect, from the view's schema) first, then the type, then the temporary table. */
export const aspectOfAttr = (name, type = null, attrAspects = {}) => attrAspects[name] ?? TYPE_ASPECT[type] ?? ATTR_ASPECT_TEMPORARY[lc(name)] ?? null;

/**
 * The aspects of a thing, each with where it came from. Sources, strongest first: `knowledge` (what the catalog says about its kind), `learned` (what the user taught about its kind or
 * what it is a kind of), `schema` (what the view that made it declares for its kind), `attribute` (an attribute it carries). Every named thing has `textual` and `relational`: it can be
 * listed and linked. `th` is the settled lookup of the kind (or undefined / null when the catalog does not know it).
 */
export function aspectsOf({ kind, attrs = {}, parts = null, th = null, declared = [], attrTypes = {}, attrAspects = {}, ancestors = [], lend = () => [] }) {
  budget.tick('things.aspects');
  const out = { textual: 'schema', relational: 'schema' };
  const add = (a, src) => { if (ASPECTS.includes(a) && !out[a]) out[a] = src; };
  const fromTh = (t, src) => {
    if (!t) return;
    if (t.objects?.length) { add('visual', src); add('spatial', src); }
    const cs = t.commonsense;
    if (cs) { if (cs.at?.length || cs.size?.length) add('spatial', src); if (cs.usually_count?.length) add('numeric', src); }
    for (const w of t.wires ?? []) {
      const ty = String(w.type ?? '');
      if (ty.startsWith('k.geo.')) { add('geographic', src); add('spatial', src); }
      else if (ty.startsWith('k.faces.')) { add('visual', src); add('spatial', src); }
      else if (ty.startsWith('k.time.')) add('temporal', src);
      else if (ty.startsWith('k.people.')) { add('social', src); add('visual', src); }
      else if (ty.startsWith('k.animals.')) { add('numeric', src); }
      else if (ty.startsWith('k.units.')) add('numeric', src);
    }
    if (t.senses?.some((s) => (s.isA ?? []).some((p) => /^(?:person|people|human|man|woman|child)$/.test(String(p))))) add('social', src);
  };
  fromTh(th, th?.learned && !th.shards?.length ? 'learned' : 'knowledge');
  for (const a of declared) add(a, 'schema');
  if (parts?.length) { add('visual', 'attribute'); add('spatial', 'attribute'); }
  for (const [k] of Object.entries(attrs)) { const a = aspectOfAttr(k, attrTypes[k], attrAspects); if (a) add(a, 'attribute'); }
  for (const p of ancestors) for (const x of lend(p) ?? []) add(x, 'learned');   // what it is learned to be a kind of lends its aspects
  return out;
}
// ---- the store ---------------------------------------------------------------------------------------------------------------------------------------------------
export const labelOf = (t) => t.name ?? t.label ?? t.kind;
const plain = (k) => String(k).replace(/_/g, ' ');
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n) ? 'an' : 'a'} ${n}`;

/** Puts the things of one view into the store (the view's whole list: what it no longer lists leaves its `shown`, and a thing no view shows is dropped). Returns { ids: { key: thingId } }. */
export function sync(state, view, items, aspectsFor) {
  ensure(state);
  const ids = {}, keep = new Set();
  for (const it of items ?? []) {
    budget.tick('things.sync');
    let t = it.thingId ? state.things.find((x) => x.id === it.thingId) : null;
    if (!t) { t = { id: `th${++state.n}`, kind: it.kind, name: it.name ?? null, attrs: {}, origin: view, shown: [] }; state.things.push(t); }
    // Who writes what: the view that made a thing owns its kind, name and parts; every view may change an attribute by an act, and that is seen as a difference from what the view
    // published last (`seen`), so a view that holds a stale copy never overwrites what another view changed since.
    const mine = { ...(it.attrs ?? {}), ...(it.place ? { place: it.place } : {}) };
    t.seen ??= {};
    if (t.origin === view) { t.kind = it.kind; t.name = it.name ?? null; if (it.label) t.label = it.label; else delete t.label; t.attrs = { ...mine }; if (it.parts) t.parts = it.parts; else delete t.parts; }
    else if (t.seen[view]) for (const [k, v] of Object.entries(mine)) if (JSON.stringify(t.seen[view][k]) !== JSON.stringify(v)) t.attrs[k] = v;
    t.seen[view] = mine;
    if (!t.shown.includes(view)) t.shown.push(view);
    t.aspects = aspectsFor(t, it);
    ids[it.key ?? t.id] = t.id; keep.add(t.id);
  }
  for (const t of state.things) if (!keep.has(t.id) && t.shown.includes(view)) t.shown = t.shown.filter((v) => v !== view);
  state.things = state.things.filter((t) => t.shown.length);
  if (state.things.length > 400) state.things.splice(0, state.things.length - 400);
  return { ids };
}

/** The things a phrase names: "it" / "that" (the last), a name, a kind word (singular or plural), "all". `last` is the id of the thing the user last talked about. */
export function find(state, phrase, last = null) {
  ensure(state);
  const w = lc(phrase).replace(/\b(?:the|a|an|my|our|this|that|these|those|me)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!w || /^(?:it|them|one)$/.test(w)) return last ? state.things.filter((t) => t.id === last) : state.things.slice(-1);
  if (/^(?:all|everything|all of them|every thing)$/.test(w)) return [...state.things];
  const sing = (x) => x.replace(/(?:ies)$/, 'y').replace(/(?:ses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
  const hit = state.things.filter((t) => lc(t.name) === w || lc(t.label) === w || lc(`${t.kind} ${t.name}`) === w || lc(t.kind) === w || lc(t.kind) === sing(w) || lc(t.name) === sing(w));
  return hit;
}

/** Why a view cannot show a thing, in plain words, or null when it can: the thing must have at least one aspect the view shows. */
export function whyNot(thing, view) {
  const have = Object.keys(thing.aspects ?? {});
  const shown = view.aspects?.length ? view.aspects : ASPECTS;
  if (have.some((a) => shown.includes(a))) return null;
  const need = shown.filter((a) => a !== 'textual' && a !== 'relational').map((a) => ASPECT_WORDS[a]);
  const lead = an(plain(thing.kind)); return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} has no ${need.length ? need.join(' or ') : 'look'} to show in the ${view.noun}, so the ${view.noun} cannot show ${thing.name || thing.label ? labelOf(thing) : 'it'}.`;
}

/** The view a phrase names ("the seating plan", "talk", "my face"): the declaration whose words match, else null. */
export function viewByWords(views, phrase) {
  const stop = new Set(['the', 'my', 'a', 'tab', 'view', 'page', 'window', 'screen', 'to', 'in', 'on', 'into']);
  const toks = (s) => lc(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x && !stop.has(x));
  const want = toks(phrase);
  if (!want.length) return null;
  let best = null, score = 0;
  for (const v of views) {
    for (const word of [v.noun, v.id.split('.').at(-1), ...(v.words ?? [])]) {
      const have = toks(word);
      if (!have.length) continue;
      const s = have.every((x) => want.includes(x)) ? have.length + 1 : want.every((x) => have.includes(x)) ? want.length : 0;
      if (s > score) { score = s; best = v; }
    }
  }
  return best;
}
