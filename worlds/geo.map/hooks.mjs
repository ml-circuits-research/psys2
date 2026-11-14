// SPDX-License-Identifier: AGPL-3.0-only
// geo.map (spec 21 section 12): the hooks of the schema world. The acts (make, remove, change, pick, ask, send, undo, redo) are read by the generated grammar; what an act DOES on the map is the
// operations of map.mjs (the projection and zoom fitting, the view state, the distances). The roles of an act are mapped onto those operations here; the places named in them come by lookup from
// the catalog (places.mjs), never from a table of this world. Nothing here lists a place, a verb or a colour: kinds and attributes come from the schema, place words from the catalog vocabulary.
import * as M from './map.mjs';
import { knowsPlace } from '../../src/knowledge/open-words.mjs';
import { keyOf, lookup, peekIndex } from './places.mjs';
import * as G from './ops.mjs';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
import { ACT_VERBS } from '../../worlds/acts/acts.mjs';   // circular on purpose: only used inside functions, when the executor exists

const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9_'’-]+/).filter(Boolean);
const DET = /^(?:the|a|an|my|our|this|that|these|those|another|new|all|some|any)\s+/;
const PRONOUN = /^(?:it|them|that|this|those|these|everything|all|each|every|one|ones|here|there|(?:whole|entire|complete) (?:thing|lot|map|view)|all of it|the lot)$/;   // a reference with no name: the whole of what is on the map
const ok = (value) => ({ status: 'supported', value });
const no = (note, status = 'unsupported') => ({ status, note });
const ACTS = new Set(['make', 'remove', 'change', 'place', 'pick', 'ask', 'copy', 'send', 'undo', 'redo']);
const VERB1 = new Set(Object.entries(ACT_VERBS).filter(([a]) => !['ask', 'apart', 'undo'].includes(a)).flatMap(([, v]) => v).filter((v) => !v.includes('_') && !['name', 'list', 'count'].includes(v)));
const THAT_ONE = /\b(?:that|this|the last|the previous)\b/i;

/** The kind of the schema a phrase names: its last word is a word of the kind ("the markers", "a river"). */
function kindOf(text) {
  const sch = G.executor?.schema;
  const ws = wordsOf(String(text ?? '').replace(DET, ''));
  if (!sch || !ws.length) return null;
  const hit = (w) => { const sing = w.replace(/ies$/, 'y').replace(/s$/, ''); return Object.values(sch.kinds).find((k) => [k.name, k.plural, ...(k.words ?? [])].some((x) => x === w || x === sing)); };
  return hit(ws.at(-1)) ?? (ws.length > 1 ? hit(ws[0]) : null);   // "marker here": the kind is the first word when the last is not one
}
/** The index of places names what the vocabulary may not (the aliases of the regions: "EU", two letters, are not looked up by the vocabulary reader, which wants three). */
const aliasOf = (key) => { const D = peekIndex(); return !!(D && key.length >= 2 && lookup(D, key)?.kind === 'region'); };
/** A phrase is a place when the catalog vocabulary knows it as a name of k.geo ("new york", "the danube"); a coordination ("Italy and Portugal", "France and its neighbours") when every part is. */
const RELATION = /^(?:capital(?: city)? of (.+)|(.+?)(?:['’]s)? capital(?: city)?)$/;   // "the capital of Sudan", "Sudan's capital", "sudan capital": a place by the relation k.geo states (country.capital)
/** The country a demonym names ("japanese", "brazilians", "japanese people"): the table is the map's (the catalog has no demonyms yet: catalog-lacks.md). */
const demonym = (t) => { const w = String(t).toLowerCase().replace(/\s+(?:people|folks|citizens)$/, '').replace(/[^a-z]/g, ''); return M.DEMONYM[w] ?? M.DEMONYM[w.replace(/s$/, '')] ?? null; };
const one = (text) => {
  let t = String(text ?? '').toLowerCase().trim().replace(DET, '').replace(/[’']s$/, '');
  if (!t || directionOf(t)) return false;
  if (demonym(t)) return true;   // "Japanese people", "Brazilians": the people of a country stand for the country   // "back", "away": direction words of the view, not names of places
  const rel = RELATION.exec(t);
  if (rel && !/^(?:the )?capital$/.test(t)) t = (rel[1] ?? rel[2]).replace(DET, '');
  const k = t.replace(/[^a-z0-9 .'-]+/g, ' ').trim().replace(/\s+/g, '_');
  const base = k.replace(/^the_/, '');
  // the sentence reader drops the apostrophe ("Peru's capital" arrives as "perus capital"): a last word that is not a place but is one without its s is a possessive
  return knowsPlace(k, ['k.geo']) || knowsPlace(base, ['k.geo']) || aliasOf(base) || (/[a-z]s$/.test(base) && knowsPlace(base.slice(0, -1), ['k.geo']));
};
export const isPlace = (text) => {
  const t = String(text ?? '').trim();
  if (one(t)) return true;
  const parts = t.replace(/\s+(?:and|with)\s+(?:its|their)\s+neighbou?rs$/i, '').split(/\s*(?:,|\band\b)\s*/i).map((x) => x.replace(/^(?:both|also)\s+/i, '').trim()).filter(Boolean);
  return (parts.length > 1 || parts[0] !== t) && parts.length > 0 && parts.every(one);   // "Romania and its neighbours" is one place with its neighbours
};
/**
 * A SET OF PLACES named by a relation of a place (one rule for every verb that takes places): "the neighbours of Hungary", "the countries of South America", "the capitals in Africa", "Europe's capitals",
 * "3 biggest japanese cities", "Europe smallest country". The head is a word of the schema (the attribute `neighbours`, the attribute `capital`, the kind words of `place`: country, city), the scope
 * a place (a name, a region, a demonym). Returns { head: neighbours|capitals|countries|cities, scope, sup, n } or null.
 */
export function setPhrase(text) {
  let t = String(text ?? '').toLowerCase().replace(/[?!.]+$/, '').replace(/\b(?:please|pls)\b/g, '').replace(/\s+/g, ' ').trim().replace(/^(?:all|every|each)\s+(?:the\s+)?/, '').replace(DET, '');
  if (!t) return null;
  const sch = G.executor?.schema;
  const headOf = (w) => {
    const sing = w.replace(/ies$/, 'y').replace(/s$/, '');
    const a = Object.values(sch?.attrs ?? {}).find((x) => x.name === 'neighbours' && [x.name, ...x.words].some((y) => y === w || y === sing));
    if (a) return 'neighbours';
    if (Object.values(sch?.attrs ?? {}).some((x) => x.name === 'capital' && [x.name, ...x.words].some((y) => y === w || y === sing))) return 'capitals';
    const k = Object.values(sch?.kinds ?? {}).find((x) => x.name === 'place' && x.words.some((y) => y === w || y === sing));
    if (k && /^(?:countr|nation|cit|town)/.test(sing === 'countr' ? 'countr' : w)) return /^(?:cit|town)/.test(w) ? 'cities' : 'countries';
    return null;
  };
  const sup = Object.keys(M.SUPER).map((x) => x.replace(/_/g, ' '));
  const supRe = sup.sort((a, b) => b.length - a.length).join('|');
  const scoped = (x) => { const y = String(x ?? '').replace(DET, '').trim(); return y && (isPlace(y) || M.DEMONYM[y.replace(/[^a-z]/g, '')]) ? y : null; };
  let m;
  // "the capitals of Europe", "3 biggest cities in Japan", "the neighbours of Hungary"
  if ((m = new RegExp(`^(?:(\\d+)\\s+)?(?:(${supRe})\\s+)?([a-z]+)\\s+(?:of|in|from|across|around)\\s+(.+)$`).exec(t)) && headOf(m[3]) && scoped(m[4])) return { head: headOf(m[3]), scope: scoped(m[4]), sup: m[2], n: m[1], plural: /s$|ies$/.test(m[3]) };
  // "Europe's capitals", "europes capitals", "Europe smallest country", "Hungary neighbours"
  if ((m = new RegExp(`^(.+?)(?:['’]s|s)?\\s+(?:(\\d+)\\s+)?(?:(${supRe})\\s+)?([a-z]+)$`).exec(t)) && headOf(m[4]) && (scoped(m[1]) || scoped(`${m[1]}s`))) return { head: headOf(m[4]), scope: scoped(m[1]) ?? scoped(`${m[1]}s`), sup: m[3], n: m[2], plural: /s$|ies$/.test(m[4]) };
  // "3 biggest japanese cities": the adjective is the scope
  if ((m = new RegExp(`^(?:(\\d+)\\s+)?(?:(${supRe})\\s+)?([a-z]+)\\s+([a-z]+)$`).exec(t)) && headOf(m[4]) && M.DEMONYM[m[3]]) return { head: headOf(m[4]), scope: m[3], sup: m[2], n: m[1], plural: /s$|ies$/.test(m[4]) };
  return null;
}
/** "the centre of the view": a word of the attribute `centre` of the schema, of the view or the map; the point the view is centred on. */
function isViewCentre(text) {
  const c = G.executor?.schema?.attrs?.centre;
  const ws = wordsOf(String(text ?? '').replace(DET, ''));
  return !!c && ws.length >= 2 && [c.name, ...c.words].includes(ws[0]) && ws[1] === 'of' && ws.slice(2).every((w) => ['the', 'view', 'map', 'screen'].includes(w));
}
/** What a verb does to a set of places: highlight the countries (a region's members, a country's neighbours), mark the capitals or cities, rank or list them. */
function applySet(ctx, sp, how) {
  const p = keyOf(sp.scope);
  if (how === 'ask') {
    const k = sp.head === 'cities' ? 'city' : sp.head === 'countries' ? 'country' : null;
    if (!k) return no(`I can list cities and countries, but not ${sp.head}.`);
    if (sp.sup) return M.superlative(ctx, { m: sp.sup.replace(/ /g, '_'), k, p, ...(sp.n ? { n: sp.n } : {}), ...(sp.plural ? { plural: 'true' } : {}) });
    return M.listOp(ctx, { k: sp.head, p });
  }
  if (sp.head === 'neighbours') return how === 'mark' ? no('I can highlight the neighbours of a country, not mark them.') : M.highlightPlaces(ctx, { a: p, nb: 'true', self: 'false' });
  if (sp.head === 'countries') return how === 'mark' ? no('I can highlight countries, but marking a whole region is for its capitals or cities.') : M.highlightPlaces(ctx, { a: p, ind: 'true' });
  return M.markSet(ctx, { what: sp.head, r: p, ...(sp.n ? { n: sp.n } : {}) });
}

/** "Paris and Rome", "Paris, Rome and Oslo" -> up to five keys for the operations that take a, b, c, d, e. */
function placeArgs(text) {
  const parts = String(text ?? '').split(/\s*(?:,|\band\b|\bto\b|\bbetween\b|\bfrom\b)\s*/i).map((p) => p.trim().replace(/^(?:both|also)\s+/i, '').replace(DET, '')).filter(Boolean).slice(0, 5);
  return Object.fromEntries(parts.map((p, i) => ['abcde'[i], keyOf(p)]));
}
/** The longest leading run of words that names a place ("Japan use" -> "Japan"): a free-words slot may carry the verb that follows the name. */
function placePhrase(text) {
  const ws = String(text ?? '').trim().replace(DET, '').replace(/[?!.]+$/, '').split(/\s+/).filter(Boolean);
  for (let n = ws.length; n >= 1; n--) { const x = ws.slice(0, n).join(' '); if (!PRONOUN.test(x) && isPlace(x)) return x; }
  return null;
}
/** Every place a sentence names, in order ("Madrid Lisbon km", "Madrid to Lisbon distance", "between London and Paris"): the longest run of words that names a place, then the next. */
function placesIn(text) {
  const ws = wordsOf(String(text ?? '').replace(/[?!.,]/g, ' ')), out = [];
  for (let i = 0; i < ws.length;) {
    budget.tick('geo.placesIn');
    let n = Math.min(4, ws.length - i);
    for (; n >= 1; n--) { budget.tick('geo.placesIn'); const x = ws.slice(i, i + n).join(' '); if (!/\b(?:and|to|with)\b/.test(x) && !PRONOUN.test(x) && !directionOf(x) && isPlace(x)) { out.push(x); break; } }
    i += n >= 1 ? n : 1;
  }
  return out;
}
const firstPlace = (...texts) => { for (const t of texts) { const x = placePhrase(t); if (x) return x; } return null; };
const verbOf = (text) => wordsOf(text).find((w) => !['please', 'can', 'you', 'could', 'would', 'pls', 'now'].includes(w)) ?? '';
const attrOf = (w0) => { const w = String(w0 ?? '').toLowerCase(), sing = w.replace(/s$/, ''); const a = Object.values(G.executor?.schema?.attrs ?? {}).find((x) => [w, sing].some((y) => x.name === y || (x.words ?? []).includes(y))); return a?.name ?? null; };

/**
 * A direction word of an attribute is read before a place of the same spelling (a general rule of "a place word claims only with a place frame"): the words the schema gives the zoom of
 * the view (`more`, `less`: closer, farther, back, away ...) are never claimed as the name of a place when what is said is only those words and an amount ("pull back a bit", "move away").
 * A place of the catalog that is spelt like such a word (a river "Back") is still reached with its kind word or a place frame ("the river Back", "show me Back").
 */
const AMOUNT = /^(?:a|bit|little|lot|much|way|slightly|some|somewhat|more|again|please|pls|just|now|the|map|view)$/;
function directionOf(text) {
  const z = G.executor?.schema?.attrs?.zoom;
  if (!z) return null;
  const ws = wordsOf(text).filter((w) => !AMOUNT.test(w));
  if (!ws.length || !ws.every((w) => z.less.includes(w) || z.more.includes(w))) return null;
  return ws.some((w) => z.less.includes(w)) ? 'out' : 'in';
}
const viewDirection = (r) => directionOf([r.thing, r.place, r.rel].filter(Boolean).join(' '));

/** The thing phrase may carry its place ("the marker on Paris", "the pins off the map"): split it at the preposition so that thing and place are what the schema says. */
function norm(r0) {
  const r = { ...r0 };
  const m = /^(.*?)\s+(on|in|at|of|from|off|for|near|to)\s+(.+)$/i.exec(String(r.thing ?? '').trim());
  if (m && kindOf(m[1]) && !r.place && !setPhrase(r.thing)) { r.thing = m[1]; r.place = /^the map$/i.test(m[3].trim()) ? null : m[3]; }
  if (/^(?:the )?(?:map|atlas)$/i.test(String(r.place ?? '').trim())) r.place = null;
  return r;
}
const domain0 = {
  make: (ctx, r) => {
    const k = kindOf(r.thing);
    if (k?.name === 'pin' || (!k && /\b(?:marker|pin|flag)s?\b/i.test(String(r.text)))) {
      const sp = setPhrase(r.place ?? r.value);
      if (sp) return applySet(ctx, sp, 'mark');
      const where = firstPlace(r.place, r.value) ?? r.place ?? r.value;
      if (!where || PRONOUN.test(String(where).trim()) || /\bhere\b/i.test(String(r.thing ?? '')) || isViewCentre(r.place ?? r.value)) return M.markHere(ctx, {});
      return M.mark(ctx, placeArgs(where));
    }
    if (k?.name === 'route') {
      const said = [r.thing, r.rel, r.place].filter(Boolean).join(' '), from = /\b(?:from|between)\s+(.+)$/i.exec(said);   // "a line from Oslo to Rome": the endpoints are in the thing phrase and the place together
      const ab = placeArgs(from ? from[1] : r.place ?? r.value ?? r.thing);
      return ab.b ? M.distance(ctx, ab) : no('Between which two places should I draw the line?', 'missing');
    }
    if (k?.name === 'view') return M.world(ctx);
    if (!k && isPlace(r.thing)) return M.mark(ctx, placeArgs(r.thing));
    return no(`I can put pins and lines on the map, but I cannot make ${/^[aeiou]/i.test(String(r.thing)) ? 'an' : 'a'} ${String(r.thing ?? 'that').replace(DET, '')}.`);
  },
  remove: (ctx, r) => {
    // a layer named by a form (the frames `layer`: highlights, pins, lines): `what` says which, the place (if any) which part of it
    if (r.what) {
      const p = firstPlace(r.thing);
      if (r.what === 'highlight') return M.clearHighlight(ctx, p ? { p: keyOf(p) } : {});
      if (r.what === 'route') return M.clearLines(ctx);
      return M.clearMarkers(ctx, p ? { p: keyOf(p) } : r.mode === 'last' ? { last: 'true' } : {});
    }
    const k = kindOf(r.thing);
    const said = String(r.thing ?? '').toLowerCase();
    if (r.mode === 'all' || /\b(?:everything|all)\b/.test(said) && !k || /^(?:whole|entire|complete) (?:thing|lot|map|view)$/.test(said.replace(DET, ''))) return M.clearAll(ctx);
    if (k?.name === 'route') return M.clearLines(ctx);
    if (/\bhighlight/.test(said)) return M.clearHighlight(ctx, {});
    if (k?.name === 'pin') {
      const where = firstPlace(r.place);
      if (where) return M.clearMarkers(ctx, { p: keyOf(where) });
      return M.clearMarkers(ctx, THAT_ONE.test(said) || /\blast\b/.test(said) ? { last: 'true' } : {});
    }
    if (k?.name === 'view') return M.clearAll(ctx);
    const p = firstPlace(r.thing);
    if (p) return ctx.state.markers.some((m) => keyOf(m.name) === keyOf(p)) ? M.clearMarkers(ctx, { p: keyOf(p) }) : M.clearHighlight(ctx, { p: keyOf(p) });
    return no('Say what to remove from the map: a marker, a highlight or a line.', 'missing');
  },
  change: (ctx, r) => {
    const k = kindOf(r.thing);
    if (r.mode === 'default') return k?.name === 'view' || !k ? M.reset(ctx, {}) : no(`I can put the view back to normal, but not a ${k.name}.`);   // "put the view back to normal": every attribute has its default (the schema's), the view's are the whole world
    const attr = r.attribute ? attrOf(r.attribute) : attrOf(String(r.value ?? '').split(/\s+/).pop()) ?? (k?.name === 'view' ? null : null);
    const value = r.value == null ? null : String(r.value).replace(DET, '');
    if (attr === 'zoom' || (k?.name === 'view' && /\d/.test(String(value ?? r.amount ?? '')))) {
      if (r.mode === 'more' || r.mode === 'less') return M.zoom(ctx, { dir: r.mode === 'more' ? 'in' : 'out', ...(r.amount != null && /^\d+(?:\.\d+)?$/.test(String(r.amount)) ? { n: r.amount } : {}) });
      return M.zoomTo(ctx, { n: String(value ?? r.amount).match(/\d+(?:\.\d+)?/)?.[0] });
    }
    if (attr === 'layer' || (k?.name === 'view' && /^(?:street|osm|offline)$/.test(String(value)))) return M.layer(ctx, { l: keyOf(value) });
    if (attr === 'centre') { const p = firstPlace(value, r.place); return p ? M.showPlace(ctx, { a: keyOf(p) }) : no('Centre the map on which place?', 'missing'); }
    const p = firstPlace(r.thing);
    if (p && (attr === 'colour' || (value && !attr))) return M.highlightPlaces(ctx, { a: keyOf(p) });
    if (attr === 'name' || attr === 'label') return no('I cannot rename a place, but I can put a marker on it.');
    return no(`I cannot change the ${attr ?? 'that'} of ${p ? p : 'a place'} on the map.`);
  },
  place: (ctx, r) => {
    const k = kindOf(r.thing);
    if (k?.name === 'pin') return domain.make(ctx, r);
    if (k?.name === 'route') return domain.make(ctx, r);
    // "move a bit to the west", "slide the view north": the view of the map is moved in a direction of the engine's own table (M.DIR); "pull back a bit" is the other zoom
    const dirs = wordsOf([r.rel, r.place, r.thing].filter(Boolean).join(' '));
    const d = dirs.find((w) => M.DIR[w]);
    if (d && (!k || k.name === 'view') && !firstPlace(r.place, r.thing)) return M.pan(ctx, { d, ...(dirs.find((w) => M.AMT[w]) ? { amt: dirs.find((w) => M.AMT[w]) } : {}) });
    const dir = viewDirection(r);
    if (dir) return M.zoom(ctx, { dir, ...(/\ba (?:bit|little)\b/i.test(String(r.text)) ? { amt: 'a_bit' } : {}) });
    if (!firstPlace(r.place, r.thing) && /\b(?:back|out|away|farther|further)\b/i.test(String(r.text))) return M.zoom(ctx, { dir: 'out' });
    if (!firstPlace(r.place, r.thing) && /\b(?:closer|in)\b/i.test(String(r.text))) return M.zoom(ctx, { dir: 'in' });
    if (PRONOUN.test(String(r.place ?? '').trim()) && !k) return M.markHere(ctx, {});
    const p = firstPlace(r.place, r.thing);
    return p ? (isPlace(r.place) && String(r.place).match(/\band\b|,/) ? M.showPlace(ctx, placeArgs(r.place)) : M.showPlace(ctx, { a: keyOf(p) })) : no('Centre the map on which place?', 'missing');
  },
  pick: (ctx, r) => {
    const sp = setPhrase(r.thing);
    if (sp) { const v0 = verbOf(r.text); return applySet(ctx, sp, r.what === 'pin' || /^(?:mark|pin|flag|tag|point)$/.test(v0) ? 'mark' : 'highlight'); }
    const p = firstPlace(r.thing);
    if (r.what && p) {
      const args = placeArgs(String(r.thing).replace(/\s+(?:and|with)\s+(?:its|their)\s+neighbou?rs$/i, '').replace(/^(?:both|also)\s+/i, ''));
      return r.what === 'highlight' ? M.highlightPlaces(ctx, args) : M.mark(ctx, args);
    }
    if (r.mode === 'none') return M.clearHighlight(ctx, {});
    if (!p) return kindOf(r.thing)?.name === 'pin' ? M.markers(ctx) : no(`I do not know a place called ${String(r.thing ?? '').replace(DET, '')}.`);
    const v = verbOf(r.text), args = placeArgs(String(r.thing).replace(/\s+(?:and|with)\s+(?:its|their)\s+neighbou?rs$/i, '')), nb = /\bneighbou?rs\b/i.test(String(r.thing)) ? { nb: 'true' } : {};
    if (/^(?:mark|pin|flag|tag|point)$/.test(v)) return M.mark(ctx, args);
    if (/^(?:highlight|colou?r|shade|light)$/.test(v)) return M.highlightPlaces(ctx, { ...args, ...nb });
    return M.showPlace(ctx, args);
  },
  ask: (ctx, r) => {
    if (/^(?:(?:i|me|we|us|myself)|(?:am i|are we|i am|we are)\b.*)$/i.test(String(r.thing ?? r.place ?? '').replace(/\s+(?:on|in|at) the (?:map|atlas)$/i, '').trim()) && (r.mode === 'where' || /\bwhere\b/i.test(String(r.text)))) return M.locate(ctx);   // "where am I on the map": the place of the speaker is the browser's
    if ((r.attribute ? attrOf(r.attribute) : null) === 'distance' || (/\b(?:between|from)\b/.test(String(r.rel ?? '')) && attrOf(wordsOf(r.thing).at(-1)) === 'distance')) {   // "how many kilometres are there between London and Paris": the distance is the attribute of two places
      const ps = placesIn(r.text ?? [r.thing, r.rel, r.place].filter(Boolean).join(' '));
      if (ps.length >= 2) return M.distance(ctx, Object.fromEntries(ps.slice(0, 5).map((x, i) => ['abcde'[i], keyOf(x)])));
    }
    if (['why', 'last'].includes(r.mode)) return no('I can say what is on the map, not why: ask me to describe the map.', 'missing');
    const spJoined = setPhrase([r.thing, r.attribute].filter(Boolean).join(' '));   // "Europe smallest" + the attribute word "country": a ranking only when it names one ("what country is Cluj in" asks the attribute)
    const spAsk = setPhrase(r.thing) ?? (spJoined?.sup ? spJoined : null);
    if (spAsk && ['cities', 'countries'].includes(spAsk.head) && !/\bhow many\b/i.test(String(r.text)) && r.mode !== 'count') return applySet(ctx, spAsk, 'ask');
    const k = kindOf(r.thing);
    const attr = r.attribute ? attrOf(r.attribute) : null;
    const p = firstPlace(r.thing, r.place);
    if (r.mode === 'describe' || r.mode === 'state' || (k?.name === 'view' && !attr)) return M.describe(ctx);
    if (k?.name === 'pin') return M.markers(ctx);
    if (wordsOf(r.thing).some((w) => /^highlight/.test(w)) && !p) return M.highlights(ctx);   // "list the highlighted countries": the state's own kind (the schema's word highlight)
    if ((r.mode === 'count' || /\bhow many\b/i.test(String(r.text))) && (!attr || attr === 'country')) {   // "how many countries are in Europe": the kind counted (the kind word is also the attribute `country`), then the scope
      const ws = wordsOf([r.attribute, r.thing].join(' ')), at = ws.findIndex((w) => /^(?:countr|cit|town)/.test(w));
      if (at >= 0) {
        const scope = firstPlace(ws.slice(at + 1).join(' ').replace(/^(?:(?:are|is|there|in|of|do|does|have|has|on)\s+)+/, ''), r.place) ?? 'world';
        return M.count(ctx, { k: /^(?:cit|town)/.test(ws[at]) ? 'cities' : 'countries', p: keyOf(scope) });
      }
    }
    if (r.mode === 'count' && !p) {
      const kw = wordsOf(r.thing).at(-1) ?? '';
      const scope = firstPlace(r.place) ?? 'world';
      return M.count(ctx, { k: /cit|town/.test(kw) ? 'cities' : 'countries', p: keyOf(scope) });
    }
    if (!attr && p && placesIn(r.thing).length > 1 && /\band\b|,/.test(String(r.thing)) && !setPhrase(r.thing)) return M.showPlace(ctx, placeArgs(r.thing));   // "Show Paris and Rome": several places named and nothing asked of them are shown together
    if (r.mode === 'where' || (!attr && p)) return p ? M.where(ctx, { p: keyOf(p) }) : no('Where is what?', 'missing');
    if (!p) return no('About which place?', 'missing');
    const a = { p: keyOf(p), c: keyOf(p) };
    if (r.rel === 'reverse') return attr === 'capital' ? M.capitalOfWhich(ctx, a) : no('I can look a place up by its capital only.');
    if (r.mode === 'count' && attr === 'neighbours') return M.neighbourCount(ctx, a);
    switch (attr) {
      case 'country': return M.country(ctx, a);
      case 'capital': return M.capital(ctx, a);
      case 'population': return M.population(ctx, a);
      case 'area': return M.area(ctx, a);
      case 'currency': return M.currency(ctx, a);
      case 'language': return M.languages(ctx, a);
      case 'continent': return M.continent(ctx, a);
      case 'neighbours': return M.borders(ctx, a);
      case 'landlocked': return M.landlocked(ctx, a);
      case 'location': return M.where(ctx, { p: a.p });
      default: return M.info(ctx, a);
    }
  },
  send: () => no('I cannot send places from the map to another tab yet.'),
  undo: (ctx) => M.undo(ctx),
  redo: (ctx) => M.redo(ctx),
};

const domain = Object.fromEntries(Object.entries(domain0).map(([act, f]) => [act, (ctx, r) => f(ctx, norm(r))]));

/**
 * DECLINE (spec 20, 21): a sentence is the map's when it names a place of the catalog's geography or a kind of the map (a pin, a line, the map), or when the map is the open tab and it says
 * "it". A bare word that is also a colour or a thing of another world is not a place: the vocabulary check excludes colours and the words of the schema's docs.
 */
function accepts({ action, roles = {}, tab, text }) {
  const act = String(action ?? '').split('.').pop();
  if (!ACTS.has(act)) return true;   // the operations that are not acts (navigation, comparisons, distances) are read by patterns that name the map's own frames
  const open = tab === 'geo.map';
  if (['undo', 'redo'].includes(act)) return open;
  // a question whose subject starts with a verb of another act ("Highlight Romania and its" + the attribute word "neighbours") is that act's sentence, not a question about the attribute
  if (act === 'ask' && VERB1.has(wordsOf(roles.thing)[0])) return false;
  const said = [roles.thing, roles.place, roles.value, roles.noun].filter(Boolean).map((x) => String(x).trim());
  if (act === 'send') return !!placePhrase(roles.thing) && !kindOf(roles.place);   // "send it to the map" is the other view's act (things.show), not the map's; only a place sent away is
  if (open && ['place', 'change'].includes(act) && said.some((x) => directionOf(x))) return true;   // "pull back a bit", "move away": the open map's view
  if (said.some((x) => placePhrase(x) || setPhrase(x))) return open ? 'focus' : true;   // the open tab owns its acts first (spec 20): "highlight Spain and Portugal" is the map's, not the document's
  const k = said.map(kindOf).find(Boolean);
  if (k && (open || /\bmap\b/i.test(String(text ?? '')) || k.name === 'view')) return true;
  if (/\b(?:on|in|from|off) the map\b/i.test(String(text ?? ''))) return true;
  if (!said.length && (open || /\b(?:map|atlas)\b/i.test(String(text ?? '')))) return true;
  if (said.length && open && said.every((x) => PRONOUN.test(x.replace(DET, '')))) return 'focus';
  return false;
}

/**
 * COORDINATION AS ONE ACT: the acts that take places and nothing else ask of them are done to all the named places together (show, pin and highlight take "Paris, Rome and Madrid" as one set;
 * a view cannot be at two places one after the other). An act that asks an attribute of each ("the population of France and Spain") stays distributed.
 */
function coordinates({ action, mode, roles = {} }) {
  const act = String(action ?? '').split('.').pop();
  if (!['pick', 'place', 'make'].includes(act) && !(act === 'ask' && mode === 'options')) return false;
  const said = String(roles.thing ?? '').trim();
  return /\band\b|,/i.test(said) && !roles.attribute && placesIn(said).length > 1 && isPlace(said);
}

export const hooks = { domain, accepts, coordinates, noState: true };
