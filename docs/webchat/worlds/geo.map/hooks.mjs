// SPDX-License-Identifier: AGPL-3.0-only
// geo.map (spec 21 section 12): the hooks of the schema world. The acts (make, remove, change, pick, ask, send, undo, redo) are read by the generated grammar; what an act DOES on the map is the
// operations of map.mjs (the projection and zoom fitting, the view state, the distances). The roles of an act are mapped onto those operations here; the places named in them come by lookup from
// the catalog (places.mjs), never from a table of this world. Nothing here lists a place, a verb or a colour: kinds and attributes come from the schema, place words from the catalog vocabulary.
import * as M from './map.mjs?v=40f5cacf40';
import { knowsPlace } from '../../lib/knowledge/open-words.mjs?v=cc592651d5';
import { keyOf } from './places.mjs?v=cf4d58a990';
import * as G from './ops.mjs?v=7a3ecfd5da';
import { ACT_VERBS } from '../../worlds/acts/acts.mjs?v=8e11b6829e';   // circular on purpose: only used inside functions, when the executor exists

const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9_'’-]+/).filter(Boolean);
const DET = /^(?:the|a|an|my|our|this|that|these|those|another|new|all|some|any)\s+/;
const PRONOUN = /^(?:it|them|that|this|those|these|everything|all|each|every|one|ones|here|there)$/;
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
/** A phrase is a place when the catalog vocabulary knows it as a name of k.geo ("new york", "the danube"); a coordination ("Italy and Portugal", "France and its neighbours") when every part is. */
const RELATION = /^(?:capital(?: city)? of (.+)|(.+?)(?:['’]s)? capital(?: city)?)$/;   // "the capital of Sudan", "Sudan's capital", "sudan capital": a place by the relation k.geo states (country.capital)
const one = (text) => {
  let t = String(text ?? '').toLowerCase().trim().replace(DET, '').replace(/[’']s$/, '');
  if (!t) return false;
  const rel = RELATION.exec(t);
  if (rel && !/^(?:the )?capital$/.test(t)) t = (rel[1] ?? rel[2]).replace(DET, '');
  const k = t.replace(/[^a-z0-9 .'-]+/g, ' ').trim().replace(/\s+/g, '_');
  const base = k.replace(/^the_/, '');
  // the sentence reader drops the apostrophe ("Peru's capital" arrives as "perus capital"): a last word that is not a place but is one without its s is a possessive
  return knowsPlace(k, ['k.geo']) || knowsPlace(base, ['k.geo']) || (/[a-z]s$/.test(base) && knowsPlace(base.slice(0, -1), ['k.geo']));
};
export const isPlace = (text) => {
  const t = String(text ?? '').trim();
  if (one(t)) return true;
  const parts = t.replace(/\s+(?:and|with)\s+(?:its|their)\s+neighbou?rs$/i, '').split(/\s*(?:,|\band\b)\s*/i).map((x) => x.replace(/^(?:both|also)\s+/i, '').trim()).filter(Boolean);
  return (parts.length > 1 || parts[0] !== t) && parts.length > 0 && parts.every(one);   // "Romania and its neighbours" is one place with its neighbours
};
/** "Paris and Rome", "Paris, Rome and Oslo" -> up to five keys for the operations that take a, b, c, d, e. */
function placeArgs(text) {
  const parts = String(text ?? '').split(/\s*(?:,|\band\b|\bto\b|\bbetween\b|\bfrom\b)\s*/i).map((p) => p.trim().replace(DET, '')).filter(Boolean).slice(0, 5);
  return Object.fromEntries(parts.map((p, i) => ['abcde'[i], keyOf(p)]));
}
/** The longest leading run of words that names a place ("Japan use" -> "Japan"): a free-words slot may carry the verb that follows the name. */
function placePhrase(text) {
  const ws = String(text ?? '').trim().replace(DET, '').replace(/[?!.]+$/, '').split(/\s+/).filter(Boolean);
  for (let n = ws.length; n >= 1; n--) { const x = ws.slice(0, n).join(' '); if (!PRONOUN.test(x) && isPlace(x)) return x; }
  return null;
}
const firstPlace = (...texts) => { for (const t of texts) { const x = placePhrase(t); if (x) return x; } return null; };
const verbOf = (text) => wordsOf(text).find((w) => !['please', 'can', 'you', 'could', 'would', 'pls', 'now'].includes(w)) ?? '';
const attrOf = (w0) => { const w = String(w0 ?? '').toLowerCase(), sing = w.replace(/s$/, ''); const a = Object.values(G.executor?.schema?.attrs ?? {}).find((x) => [w, sing].some((y) => x.name === y || (x.words ?? []).includes(y))); return a?.name ?? null; };

/** The thing phrase may carry its place ("the marker on Paris", "the pins off the map"): split it at the preposition so that thing and place are what the schema says. */
function norm(r0) {
  const r = { ...r0 };
  const m = /^(.*?)\s+(on|in|at|of|from|off|for|near|to)\s+(.+)$/i.exec(String(r.thing ?? '').trim());
  if (m && kindOf(m[1]) && !r.place) { r.thing = m[1]; r.place = /^the map$/i.test(m[3].trim()) ? null : m[3]; }
  if (/^(?:the )?(?:map|atlas)$/i.test(String(r.place ?? '').trim())) r.place = null;
  return r;
}
const domain0 = {
  make: (ctx, r) => {
    const k = kindOf(r.thing);
    if (k?.name === 'pin' || (!k && /\b(?:marker|pin|flag)s?\b/i.test(String(r.text)))) {
      const where = firstPlace(r.place, r.value) ?? r.place ?? r.value;
      if (!where || PRONOUN.test(String(where).trim()) || /\bhere\b/i.test(String(r.thing ?? ''))) return M.markHere(ctx, {});
      return M.mark(ctx, placeArgs(where));
    }
    if (k?.name === 'route') {
      const ab = placeArgs(r.place ?? r.value ?? r.thing);
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
    if (r.mode === 'all' || /\b(?:everything|all)\b/.test(said) && !k) return M.clearAll(ctx);
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
    if (!firstPlace(r.place, r.thing) && /\b(?:back|out|away|farther|further)\b/i.test(String(r.text))) return M.zoom(ctx, { dir: 'out', ...(/\ba bit\b/i.test(String(r.text)) ? { amt: 'a_bit' } : {}) });
    if (!firstPlace(r.place, r.thing) && /\b(?:closer|in)\b/i.test(String(r.text))) return M.zoom(ctx, { dir: 'in' });
    if (PRONOUN.test(String(r.place ?? '').trim()) && !k) return M.markHere(ctx, {});
    const p = firstPlace(r.place, r.thing);
    return p ? (isPlace(r.place) && String(r.place).match(/\band\b|,/) ? M.showPlace(ctx, placeArgs(r.place)) : M.showPlace(ctx, { a: keyOf(p) })) : no('Centre the map on which place?', 'missing');
  },
  pick: (ctx, r) => {
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
    if (['why', 'last'].includes(r.mode)) return no('I can say what is on the map, not why: ask me to describe the map.', 'missing');
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
  if (said.some((x) => placePhrase(x))) return open ? 'focus' : true;   // the open tab owns its acts first (spec 20): "highlight Spain and Portugal" is the map's, not the document's
  const k = said.map(kindOf).find(Boolean);
  if (k && (open || /\bmap\b/i.test(String(text ?? '')) || k.name === 'view')) return true;
  if (/\b(?:on|in|from|off) the map\b/i.test(String(text ?? ''))) return true;
  if (!said.length && open) return true;
  if (said.length && open && said.every((x) => PRONOUN.test(x.replace(DET, '')))) return 'focus';
  return false;
}

export const hooks = { domain, accepts, noState: true };
