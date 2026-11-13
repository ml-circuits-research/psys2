// SPDX-License-Identifier: AGPL-3.0-only
// The avatar's face: reading words over the slots of `k.faces` and changing the one state (state.face). Nothing here names a slot, a variant or an accessory: the slots, the
// variants, their kinds and features, the presets, the expressions, the colours and the other names of every slot come from the catalog data (src/knowledge/faces.mjs)
// that the host hands in. One generic operation set works over any slot: add, remove, change, which ones, colour, size, position, expression, describe, presets.
//
// State (state.face): { slots: { <slot>: <variant name> | 'none' }, colours: { skin, hair, eyes, clothes: <colour name> }, paint: { <slot>: <colour name> } (a colour for a part without a tint),
//   adj: { <slot>: { s: scale, dx, dy } }, expression, base (the preset it started from), name, saved: { <key>: { name, slots, colours, paint, adj } }, options (what "which hats are there"
//   shows), refs (the things of the face: the referents of this world), history / future (undo, redo), n (a counter) }.
// Browser-safe: imports only the shared space module.
import * as space from '../space/space.mjs?v=f98ca4dd42';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
export const NONE = 'none';
const ok = (value) => ({ status: 'supported', value });
const no = (note) => ({ status: 'unsupported', note });
// No interjection openers (M4: replies are plain English, translated whole).
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const joinOr = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a.at(-1)}`);
const plain = (t) => String(t).replace(/_/g, ' ');
const lc = (t) => String(t).toLowerCase();
const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const FUNCTION_WORDS = new Set('a an the my your his her their its me you yourself myself please pls plz some one of on to for with and also now just it that this these those i want would like can could do does is are be has have having who then too very really'.split(' '));
const NEGATIONS = new Set(['no', 'without', 'not', 'never', 'lose', 'minus']);
const HISTORY = 40;

/** Words of a text: lowercase, letters, digits and the hyphen. */
export const tokens = (t) => lc(t).replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').split(/\s+/).filter(Boolean);
/** The forms a word may be written in: itself and without a plural ending (rule, no vocabulary). */
export function forms(w) {
  const out = [w];
  if (/ies$/.test(w)) out.push(`${w.slice(0, -3)}y`);
  if (/(?:ses|xes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  return out;
}

// ---- the index of the data: every word the user may say, from the catalog -------------------------------------------------------------------------------------
const indexes = new WeakMap();
const add = (map, key, v) => { const k = lc(key).replace(/[_-]/g, ' ').trim(); if (k) { const a = map.get(k) ?? []; if (!a.some((x) => JSON.stringify(x) === JSON.stringify(v))) a.push(v); map.set(k, a); } };
/** { slotWords: Map(phrase -> [slot]), variantWords: Map(phrase -> [{ slot, name }]), colourWords: Map(phrase -> [{ of, name }]), featureWords: Set, presetWords, moodWords, roleOf: { slot: tint role } } */
export function indexOf(data) {
  if (indexes.has(data)) return indexes.get(data);
  const ix = { slotWords: new Map(), variantWords: new Map(), colourWords: new Map(), featureWords: new Set(), presetWords: new Map(), moodWords: new Map(), roleOf: {}, partColours: new Map() };
  for (const s of data.slots) {
    budget.tick('faces.index');
    add(ix.slotWords, s.name, s.name);
    add(ix.slotWords, s.name.split('_')[0], s.name);
    for (const a of data.aliases[s.name] ?? []) add(ix.slotWords, a, s.name);
    ix.roleOf[s.name] = s.variants.flatMap((v) => v.parts).map((p) => p.tint?.replace(/_shade$/, '')).find(Boolean) ?? null;
    for (const v of s.variants) {
      add(ix.variantWords, v.name, { slot: s.name, name: v.name });
      for (const k of v.features.kind ?? []) add(ix.variantWords, k, { slot: s.name, name: v.name });
      for (const f of Object.values(v.features).flat()) ix.featureWords.add(lc(f));
      for (const p of v.parts) for (const c of p.colour) add(ix.partColours, `${s.name}:${c}`, v.name);
    }
  }
  // "the face": the slot whose box holds most of the other slots (by geometry, no name), called by the name of the face layout the catalog gives its slots
  const holds = (s) => data.slots.filter((o) => o !== s && o.x + o.w / 2 > s.x && o.x + o.w / 2 < s.x + s.w && o.y + o.h / 2 > s.y && o.y + o.h / 2 < s.y + s.h).length;
  const faceSlot = data.slots.filter((s) => !s.optional && !s.mirror).sort((a, b) => holds(b) - holds(a))[0];
  if (faceSlot && data.layout) add(ix.slotWords, data.layout, faceSlot.name);
  for (const [of, list] of Object.entries(data.colours)) for (const name of Object.keys(list)) add(ix.colourWords, name, { of, name });
  for (const c of new Set([...ix.partColours.keys()].map((k) => k.split(':')[1]))) add(ix.colourWords, c, { of: null, name: c });
  for (const p of Object.values(data.presets)) add(ix.presetWords, p.name, p.name);
  for (const e of Object.values(data.expressions)) if (e.name !== 'talking') add(ix.moodWords, e.name, e.name);
  indexes.set(data, ix);
  return ix;
}

/** What a word list says, left to right, longest phrase first: { type: slot | variant | colour | feature | preset | mood | neg | word, ... }. */
export function read(data, words) {
  const ix = indexOf(data), ws = words.filter((w) => !FUNCTION_WORDS.has(w) || NEGATIONS.has(w));
  const out = [];
  const has = (map, phrase) => { for (const f of forms(phrase.split(' ').at(-1))) { const p = [...phrase.split(' ').slice(0, -1), f].join(' '); if (map.has(p)) return map.get(p); } return null; };
  for (let i = 0; i < ws.length;) {
    budget.tick('faces.read');
    let hit = null;
    for (let n = Math.min(3, ws.length - i); n >= 1 && !hit; n--) {
      const phrase = ws.slice(i, i + n).join(' ');
      let m;
      if (n === 1 && NEGATIONS.has(ws[i])) hit = { n, m: { type: 'neg' } };
      else if ((m = has(ix.presetWords, phrase)) && (n > 1 || !has(ix.variantWords, phrase) && !has(ix.slotWords, phrase))) hit = { n, m: { type: 'preset', name: m[0] } };
      else if ((m = has(ix.variantWords, phrase))) hit = { n, m: { type: 'variant', options: m, word: n === 1 ? phrase : null } };
      else if ((m = has(ix.slotWords, phrase))) hit = { n, m: { type: 'slot', slots: m } };
      else if ((m = has(ix.moodWords, phrase))) hit = { n, m: { type: 'mood', name: m[0] } };
      else if ((m = has(ix.colourWords, phrase))) hit = { n, m: { type: 'colour', options: m } };
      else if (n === 1 && ix.featureWords.has(phrase)) hit = { n, m: { type: 'feature', word: phrase } };
    }
    if (hit) { out.push(hit.m); i += hit.n; } else { out.push({ type: 'word', word: ws[i] }); i++; }
  }
  return out;
}

/** Clauses: the modifiers before a noun (a slot, a variant) belong to it. { slots: [candidate slots], variant?: [options], features, colours, neg, unknown, text }. */
export function clausesOf(data, words) {
  const out = [], ms = read(data, words), ix = indexOf(data);
  let pend = { features: [], colours: [], neg: false, unknown: [] };
  const flush = () => { pend = { features: [], colours: [], neg: false, unknown: [] }; };
  ms.forEach((m, i) => {   // a word that is a variant of one slot and a feature of another ("curly", "small") before a noun is a modifier of it
    if (m.type !== 'variant' || !m.word || !ix.featureWords.has(m.word)) return;
    const next = ms.slice(i + 1).find((x) => !['colour', 'feature', 'word'].includes(x.type));
    if (next && (next.type === 'slot' || next.type === 'variant')) { m.type = 'feature'; m.modifier = true; }
  });
  for (const m of ms) {
    if (m.type === 'neg') pend.neg = true;
    else if (m.type === 'feature') pend.features.push(m.word);
    else if (m.type === 'colour') pend.colours.push(...m.options);
    else if (m.type === 'word') pend.unknown.push(m.word);
    else if (m.type === 'slot') { out.push({ ...pend, slots: m.slots }); flush(); }
    else if (m.type === 'variant') { out.push({ ...pend, slots: [...new Set(m.options.map((o) => o.slot))], variant: m.options }); flush(); }
    else if (m.type === 'preset' || m.type === 'mood') out.push({ ...pend, [m.type]: m.name, slots: [] }), flush();
  }
  if (pend.features.length || pend.colours.length || pend.unknown.length || pend.neg) out.push({ ...pend, slots: [], dangling: true });
  return out;
}

// ---- the state ----------------------------------------------------------------------------------------------------------------------------------------------------
export const DEFAULT_PRESET = 'girl';
const slotOf = (data, name) => data.slots.find((s) => s.name === name);
export function newFace(data, preset = DEFAULT_PRESET) {
  const p = data.presets[preset] ?? data.presets[DEFAULT_PRESET] ?? Object.values(data.presets)[0];
  const f = { v: 2, slots: {}, colours: { ...p.colours }, paint: {}, adj: {}, expression: '', base: p.name, name: '', saved: {}, options: null, n: 0, history: [], future: [], refs: [] };
  for (const s of data.slots) f.slots[s.name] = p.slots[s.name] ?? NONE;
  return f;
}
/** The face of the state, complete (a state of an earlier version is filled in; an old saved avatar of the DiceBear characters maps once to the nearest preset). */
export function faceOf(ctx, data) {
  const s = ctx.state;
  if (!s.face || typeof s.face !== 'object' || s.face.v !== 2) {
    const old = s.face ?? null;
    s.face = newFace(data, nearestPreset(data, s));
    if (old?.saved && typeof old.saved === 'object') s.face.saved = old.saved;
    for (const k of Object.keys(s)) if (!['face', 'name'].includes(k)) delete s[k];
  }
  const f = s.face, d = newFace(data, f.base);
  for (const k of Object.keys(d.slots)) f.slots[k] ??= NONE;
  f.colours = { ...d.colours, ...f.colours }; f.paint ??= {}; f.adj ??= {}; f.saved ??= {}; f.history ??= []; f.future ??= []; f.expression ??= '';
  return f;
}
/** The preset named like the character of an old saved avatar (robot, ...), else the default; the one place that knows the old state. */
function nearestPreset(data, s) {
  for (const w of [s?.character, s?.kind]) if (w && data.presets[lc(w).replace(/_/g, ' ')]) return lc(w).replace(/_/g, ' ');
  return DEFAULT_PRESET;
}
const snap = (f) => ({ slots: { ...f.slots }, colours: { ...f.colours }, paint: { ...f.paint }, adj: structuredClone(f.adj), expression: f.expression, base: f.base });
/** Takes a snapshot for undo before a change (one step per request); the redo list is dropped. */
function mark(f) { f.history.push(snap(f)); if (f.history.length > HISTORY) f.history.shift(); f.future = []; f.options = null; }
const apply = (f, s) => Object.assign(f, structuredClone(s));

// ---- saying what the face is ------------------------------------------------------------------------------------------------------------------------------------
const nounOf = (slot) => slot.split('_')[0];
const isPlural = (w) => /s$/.test(w) && !/ss$/.test(w);
/** "a cap", "round glasses", "short hair": the variant in words, from its kind or its name and the noun of its slot. */
export function phraseOf(data, face, slot, name = face.slots[slot]) {
  if (!name || name === NONE) return `no ${plain(nounOf(slot))}`;
  const v = slotOf(data, slot)?.variants.find((x) => x.name === name), kind = v?.features.kind?.[0];
  const noun = plain(nounOf(slot)), base = plain(kind ?? name);
  const own = kind && (data.aliases[slot] ?? []).includes(lc(kind));   // a kind the catalog gives as another name of the slot (cap, for hat) says it alone
  let words = (own || lc(base).includes(lc(noun)) ? base : `${base} ${noun}`).split(' ');
  const role = indexOf(data).roleOf[slot], tint = role && role !== 'skin' ? face.colours[role] : null, paint = face.paint?.[slot];
  if (tint) words.splice(Math.max(0, words.length - 1), 0, plain(tint));
  if (paint && face.slots[slot] === name) words.unshift(plain(paint));
  const text = words.join(' '), last = words.at(-1);
  const shared = data.slots.filter((o) => nounOf(o.name) === nounOf(slot)).length > 1;   // hair: two slots, one mass noun
  return isPlural(last) || shared ? text : `${article(text)} ${text}`;
}
export function describeFace(data, face) {
  const have = data.slots.filter((s) => face.slots[s.name] && face.slots[s.name] !== NONE);
  return joinAnd(have.map((s) => phraseOf(data, face, s.name)));
}
/** The things of the face, the referents of this world: the other names of its slots and what it wears now (meta.worlds: the scene of the Avatar tab). */
export function thingsOf(data, face) {
  const ix = indexOf(data), out = new Set();
  for (const [phrase, slots] of ix.slotWords) if (slots.some((s) => face.slots[s] !== undefined)) out.add(phrase);
  for (const s of data.slots) { const n = face.slots[s.name]; if (n && n !== NONE) { out.add(lc(n)); for (const k of slotOf(data, s.name).variants.find((v) => v.name === n)?.features.kind ?? []) out.add(k); } }
  return [...out].filter((x) => /^[a-z][a-z -]*$/.test(x));
}
const finish = (ctx, data, f, text) => { f.refs = thingsOf(data, f).map((thing) => ({ thing })); ctx.request?.('ui.openTab', { tab: 'robot' }); return ok(text); };

// ---- choosing a variant -------------------------------------------------------------------------------------------------------------------------------------------
/** The best variant of a slot for plain feature words: the most words matched; a tie keeps the current one; none when nothing matches. */
export function bestVariant(data, slot, features, current) {
  const list = slotOf(data, slot).variants;
  const score = (v) => features.filter((w) => Object.values(v.features).flat().includes(w) || lc(v.name) === w).length;
  const top = Math.max(0, ...list.map(score));
  if (!top) return null;
  const best = list.filter((v) => score(v) === top);
  return (best.find((v) => v.name === current) ?? best[0]).name;
}
const choices = (data, slot) => [...slotOf(data, slot).variants.map((v) => v.name), ...(slotOf(data, slot).optional ? [NONE] : [])];

/** The slot a clause means among its candidates (a word like "hair" may be two slots): the one a given variant or the features fit, else the one the face shows, else the first. */
function pickSlot(data, face, c, { wantPresent = false } = {}) {
  const cands = c.slots;
  if (cands.length === 1) return cands[0];
  const fit = c.features.length ? cands.find((s) => bestVariant(data, s, c.features, null)) : null;
  if (fit) return fit;
  const shown = cands.filter((s) => face.slots[s] !== NONE);
  return (wantPresent ? shown[0] : cands.find((s) => face.slots[s] === NONE) ?? shown[0]) ?? cands[0];
}
const colourRole = (data, c, slot) => c.colours.find((x) => x.of === indexOf(data).roleOf[slot] || x.of === null) ?? c.colours[0] ?? null;

/** Sets a slot to a variant; a variant the expression overrides is the user's choice now (the rest of the expression is kept as chosen parts). */
function put(data, face, slot, name) {
  const e = data.expressions[face.expression];
  if (e && slot in e.over) { for (const [k, v] of Object.entries(e.over)) if (k !== slot) face.slots[k] = v; face.expression = ''; }
  face.slots[slot] = name;
}
function paintSlot(data, face, slot, col) {
  const role = indexOf(data).roleOf[slot];
  if (role && col.of === role) { face.colours[role] = col.name; return `${plain(col.name)} ${plain(nounOf(slot))}`.trim(); }
  const v = slotOf(data, slot).variants.find((x) => x.name === face.slots[slot]);
  if (v && v.parts.some((p) => !p.tint && p.colour.includes(col.name))) { face.paint[slot] = col.name; return ''; }
  return null;
}

// ---- the operations ------------------------------------------------------------------------------------------------------------------------------------------------
const wordsOf = (a) => tokens(a?.words ?? a?.w ?? a?.text ?? a?.value ?? '');
const noFaces = () => no('I cannot reach the face catalog right now, so I cannot change my face. Try again in a moment.');

/** Wear / add / put on / give yourself: each noun of the words, with its features and colour. */
export function faceAdd(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length || c.preset || c.mood);
  if (!cl.length) return no(`I do not know ${plain(wordsOf(a).join(' ') || 'that')} for a face. Ask me "what hats are there?" to see what I can draw.`);
  const before = snap(f), said = [], missed = [];
  mark(f);
  for (const c of cl) {
    if (c.preset || c.mood) { const r = c.preset ? facePreset(ctx, c.preset, data, true) : faceMood(ctx, { mood: c.mood }, data, true); if (r) said.push(r); continue; }
    if (c.neg) { const r = removeClause(data, f, c); said.push(...r.said); missed.push(...r.missed); continue; }
    const slot = pickSlot(data, f, c);
    const cur = f.slots[slot];
    let name = c.variant?.find((o) => o.slot === slot)?.name ?? bestVariant(data, slot, c.features, cur === NONE ? null : cur);
    const col = colourRole(data, c, slot);
    if (!name && cur !== NONE) name = cur;
    if (!name) name = slotOf(data, slot).variants[0].name;
    if (c.features.length && !bestVariant(data, slot, c.features, null) && !c.variant) missed.push(c.features.join(' '));
    if (cur === name && !col && !c.features.length) { said.push(`I already have ${phraseOf(data, f, slot)}`); continue; }
    put(data, f, slot, name);
    let colourSaid = '';
    if (col) { const r = paintSlot(data, f, slot, col); if (r === null) missed.push(`${plain(col.name)} ${plain(nounOf(slot))}`); else colourSaid = r; }
    said.push(`I put on ${phraseOf(data, f, slot)}`.replace('I put on no ', 'I took off the ').replace(/^I put on (?=a|an) /, 'I put on '));
  }
  const changed = JSON.stringify(before) !== JSON.stringify(snap(f));
  if (!changed) f.history.pop();
  const tail = missed.length ? ` I have no ${joinAnd(missed)} yet.` : '';
  if (!changed) return ok(`${joinAnd(said) || 'Nothing changed'}.${tail}`);
  return finish(ctx, data, f, `${joinAnd(said)}.${tail}`);
}

function removeClause(data, f, c) {
  const said = [], missed = [];
  const slots = c.variant ? [pickSlot(data, f, c, { wantPresent: true })] : c.slots;
  for (const slot of slots) {
    const s = slotOf(data, slot);
    if (c.variant && !c.variant.some((o) => o.slot === slot && o.name === f.slots[slot])) { if (f.slots[slot] === NONE) said.push(`I have no ${plain(nounOf(slot))} on`); else said.push(`I am not wearing ${phraseOf(data, f, slot, c.variant.find((o) => o.slot === slot)?.name)}, I have ${phraseOf(data, f, slot)}`); continue; }
    if (f.slots[slot] === NONE) { said.push(`I have no ${plain(nounOf(slot))} already`); continue; }
    if (!s.optional) { missed.push(`I cannot take off my ${plain(slot)}: a face needs one.`); continue; }
    const was = phraseOf(data, f, slot);
    put(data, f, slot, NONE);
    said.push(`I took off ${was}`);
  }
  return { said, missed };
}
/** Remove / take off / without / no: every noun of the words, for every slot it can mean (hair is two slots). */
export function faceRemove(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length);
  if (!cl.length) return no(`I have nothing like ${plain(wordsOf(a).join(' ') || 'that')} on my face. Ask me "what do you have on?".`);
  const before = snap(f), said = [], missed = [];
  mark(f);
  for (const c of cl) { const r = removeClause(data, f, c); said.push(...r.said); missed.push(...r.missed); }
  if (JSON.stringify(before) === JSON.stringify(snap(f))) { f.history.pop(); return missed.length ? no(missed.join(' ')) : ok(`${joinAnd(said)}.`); }
  return finish(ctx, data, f, `${joinAnd(said)}.${missed.length ? ` ${missed.join(' ')}` : ''}`);
}
/**
 * A phrase with no verb of its own ("eyeglasses", "a red hat", "a woman with curly hair"): a face described in several parts, or one with modifiers, is drawn; a bare name of a
 * part puts it on, or takes it off when it is on.
 */
export function faceBare(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), all = clausesOf(data, wordsOf(a)), cl = all.filter((c) => c.slots.length);
  if (!cl.length) return no(`I do not know ${plain(wordsOf(a).join(' '))}.`);
  if (all.some((c) => c.preset || c.mood) || cl.length > 1) return faceDescribe(ctx, a, data);
  if (cl[0].features.length || cl[0].colours.length || cl[0].neg) return cl[0].neg ? faceRemove(ctx, a, data) : faceAdd(ctx, a, data);
  const c = cl[0], slot = pickSlot(data, f, c, { wantPresent: true });
  return f.slots[slot] === NONE || (c.variant && !c.variant.some((o) => o.slot === slot && o.name === f.slots[slot])) ? faceAdd(ctx, a, data) : faceRemove(ctx, a, data);
}

/** Change / another / next / previous / different: the next variant of the slot, going round (and the empty one for an optional slot). */
export function faceChange(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), dir = a.dir ?? 'different', cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length);
  if (!cl.length) return no(`Which part should change? For example "another hat" or "the next nose".`);
  const c = cl[0], slot = pickSlot(data, f, c, { wantPresent: true }), cur = f.slots[slot];
  const list = dir === 'different' ? slotOf(data, slot).variants.map((v) => v.name) : choices(data, slot), i = Math.max(0, list.indexOf(cur));
  mark(f);
  let next;
  if (dir === 'previous') next = list[(i - 1 + list.length) % list.length];
  else if (dir === 'next') next = list[(i + 1) % list.length];
  else { f.n = (f.n ?? 0) + 1; next = list[(i + 1 + (f.n % Math.max(1, list.length - 1))) % list.length]; if (next === cur) next = list[(i + 1) % list.length]; }
  put(data, f, slot, next);
  const col = colourRole(data, c, slot); if (col) paintSlot(data, f, slot, col);
  return finish(ctx, data, f, `I have ${phraseOf(data, f, slot)} now.`);
}
/** "What hats are there?" / "which noses can you have": the variants of the slot, as small pictures to tap. */
export function faceWhich(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length);
  if (!cl.length) return ok(`I can change my ${joinAnd(data.slots.map((s) => plain(s.name)))}. Ask "what hats are there?" for the choices.`);
  const slot = pickSlot(data, f, cl[0], { wantPresent: true }), names = choices(data, slot);
  f.options = { slot, variants: names };
  ctx.request?.('ui.openTab', { tab: 'robot' });
  return ok(`I can draw ${joinAnd(names.map((n) => (n === NONE ? 'none' : plain(n))))} for my ${plain(nounOf(slot))}. Tap one below.`);
}
/** Colour: "make the hat red", "green eyes", "darker hair": the colour a part takes, from the colours of the catalog (face colours by their tint; the colours a part offers). */
export function faceColour(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, [...wordsOf(a), ...tokens(a.part ?? ''), ...tokens(a.color ?? '')]);
  const c = cl.find((x) => x.slots.length) ?? null, cols = cl.flatMap((x) => x.colours);
  if (!c) return no('Which part should get the colour? For example "make the hat red".');
  const slot = pickSlot(data, f, c, { wantPresent: true });
  const col = colourRole(data, { colours: cols.length ? cols : c.colours }, slot);
  if (!col) return no(`Which colour for my ${plain(nounOf(slot))}?`);
  mark(f);
  if (f.slots[slot] === NONE && slotOf(data, slot).optional) put(data, f, slot, bestVariant(data, slot, c.features, null) ?? slotOf(data, slot).variants[0].name);
  const r = paintSlot(data, f, slot, col);
  if (r === null) { f.history.pop(); const offered = [...new Set(slotOf(data, slot).variants.flatMap((v) => v.parts.filter((p) => !p.tint).flatMap((p) => p.colour)))]; return no(`I have no ${plain(col.name)} ${plain(nounOf(slot))}.${offered.length ? ` It can be ${joinOr(offered)}.` : ''}`); }
  return finish(ctx, data, f, col.of && indexOf(data).roleOf[slot] === col.of ? `My ${plain(col.of)} ${col.of === 'clothes' ? 'are' : 'is'} ${plain(col.name)} now.` : `I have ${phraseOf(data, f, slot)} now.`);
}

// ---- size and place ---------------------------------------------------------------------------------------------------------------------------------------------------
const SCALE_MIN = 0.6, SCALE_MAX = 1.5, STEP = 1.15;
const centre = (s, face) => { const a = face.adj[s.name] ?? {}, k = a.s ?? 1; return { x: s.x + s.w / 2 + (a.dx ?? 0), y: s.y + s.h / 2 + (a.dy ?? 0), w: s.w * k, h: s.h * k }; };
/** The slots that follow a resized slot, by where their boxes lie (no names): those inside it keep their place in it; those resting on its top edge ride on it. */
export function neighbours(data, slot) {
  const inside = [], riders = [];
  for (const o of data.slots) {
    if (o.name === slot.name) continue;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (cx > slot.x && cx < slot.x + slot.w && cy > slot.y && cy < slot.y + slot.h && o.w < slot.w) inside.push(o);
    else if (o.y < slot.y && o.y + o.h > slot.y && o.x < slot.x + slot.w && o.x + o.w > slot.x && o.w >= slot.w * 0.6 && o.z > slot.z) riders.push(o);
  }
  return { inside, riders };
}
export function faceResize(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length);
  if (!cl.length) return no('Which part should change size? For example "a bigger nose".');
  const slot = pickSlot(data, f, cl[0], { wantPresent: true }), s = slotOf(data, slot), up = ['bigger', 'larger', 'longer', 'wider'].includes(a.dir);
  const ad = (f.adj[slot] ??= { s: 1, dx: 0, dy: 0 }), before = ad.s ?? 1;
  const next = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, up ? before * STEP : before / STEP)) * 100) / 100;
  if (next === before) return ok(`My ${plain(nounOf(slot))} cannot get any ${up ? 'bigger' : 'smaller'} and still be a face.`);
  mark(f);
  const r = next / before, c0 = centre(s, f);
  ad.s = next;
  const { inside, riders } = neighbours(data, s);
  for (const o of inside) { const d = (f.adj[o.name] ??= { s: 1, dx: 0, dy: 0 }), oc = centre(o, f); d.dx = Math.round((d.dx + (oc.x - c0.x) * (r - 1)) * 10) / 10; d.dy = Math.round((d.dy + (oc.y - c0.y) * (r - 1)) * 10) / 10; d.s = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, (d.s ?? 1) * r)) * 100) / 100; }
  for (const o of riders) { const d = (f.adj[o.name] ??= { s: 1, dx: 0, dy: 0 }); d.dy = Math.round((d.dy - (c0.h / 2) * (r - 1)) * 10) / 10; d.s = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, (d.s ?? 1) * r)) * 100) / 100; }
  return finish(ctx, data, f, `I made my ${plain(nounOf(slot))} ${up ? 'bigger' : 'smaller'}${inside.length || riders.length ? `, and the parts around it follow` : ''}.`);
}
const CLOSER = ['closer', 'together', 'nearer', 'narrower'], APART = ['apart', 'wider', 'further', 'farther'];
/** "eyes closer together", "raise the eyebrows", "move the nose down": the SPACE module's move (frame = the face), a part stays within half its size of its anchor. */
export function faceMove(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), ws = wordsOf(a), cl = clausesOf(data, ws).filter((c) => c.slots.length);
  if (!cl.length) return no('Which part should move? For example "raise the eyebrows".');
  const slot = pickSlot(data, f, cl[0], { wantPresent: true }), s = slotOf(data, slot);
  const closer = ws.some((x) => CLOSER.includes(x)), apart = ws.some((x) => APART.includes(x)) && s.mirror && !ws.some((x) => ['up', 'down', 'higher', 'lower'].includes(x));
  const dirs = ws.map((x) => (s.mirror && closer && CLOSER.includes(x) ? 'right' : s.mirror && apart && APART.includes(x) ? 'left' : ({ raise: 'up', lift: 'up', lower: 'down', drop: 'down', raised: 'up', lowered: 'down' })[x] ?? x));
  if (s.mirror && (closer || apart) && !dirs.some((x) => ['left', 'right'].includes(x))) dirs.push(closer ? 'right' : 'left');
  const mv = space.parseMove(dirs.join(' '));
  if (!mv) return no(`Tell me which way: for example "raise the ${plain(nounOf(slot))}" or "move the ${plain(nounOf(slot))} down a bit".`);
  const c0 = centre(s, f), item = { id: slot, kind: slot, x: c0.x, y: c0.y, w: c0.w, h: c0.h, parts: [{ x: 0, y: 0, w: c0.w, h: c0.h }] };
  const r = space.planMove([item], { w: data.frame.w, h: data.frame.h, step: 4 }, mv, null);
  if (r.error) return no('Tell me which way to move it.');
  const ad = (f.adj[slot] ??= { s: 1, dx: 0, dy: 0 });
  let dx = r.boxes[slot].x - (s.x + s.w / 2), dy = r.boxes[slot].y - (s.y + s.h / 2);
  dx = Math.max(-s.w / 2, Math.min(s.w / 2, dx)); dy = Math.max(-s.h / 2, Math.min(s.h / 2, dy));
  if (s.mirror) dx = Math.min(dx, 49 - (s.x + s.w / 2) - c0.w / 2);   // the two sides of a pair may not touch in the middle
  if (Math.abs(dx - (ad.dx ?? 0)) < 0.01 && Math.abs(dy - (ad.dy ?? 0)) < 0.01) return ok(`My ${plain(nounOf(slot))} cannot go further that way and still be a face.`);
  mark(f);
  ad.dx = Math.round(dx * 10) / 10; ad.dy = Math.round(dy * 10) / 10;
  return finish(ctx, data, f, `I moved my ${plain(nounOf(slot))} ${s.mirror && (closer || apart) ? (closer ? 'closer together' : 'further apart') : space.sayMove(mv)}.`);
}

// ---- expressions, presets, saving, describing -------------------------------------------------------------------------------------------------------------------------
export function faceMood(ctx, a, data, inline = false) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), names = Object.keys(data.expressions).filter((n) => n !== 'talking');
  const ws = tokens(a.mood ?? a.words ?? ''), hit = ws.map((w) => forms(w).map((x) => indexOf(data).moodWords.get(x)?.[0])).flat().find(Boolean) ?? (data.expressions[lc(a.mood ?? '')] ? lc(a.mood) : null);
  const to = a.mood === 'next' ? names[(Math.max(0, names.indexOf(f.expression)) + 1) % names.length] : hit;
  if (!to) return no(`I cannot look ${plain(a.mood ?? ws.join(' '))} yet. I can look ${joinOr(names.map(plain))}.`);
  if (f.expression === to && !inline) return ok(`I already look ${to === 'wink' ? 'like I am winking' : to}.`);
  if (!inline) mark(f);
  f.expression = to;
  const text = to === 'wink' ? 'I am winking.' : `Now I look ${to}.`;
  return inline ? text.replace(/\.$/, '') : finish(ctx, data, f, text);
}
export function faceAskMood(ctx, a, data) { if (!data) return noFaces(); const f = faceOf(ctx, data); return ok(f.expression ? `I look ${f.expression}.` : 'I look calm.'); }
export function faceCheckMood(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), to = (tokens(a.mood ?? '').map((w) => indexOf(data).moodWords.get(w)?.[0]).find(Boolean)) ?? null;
  if (!to) return no(`I do not know what ${plain(a.mood ?? 'that')} looks like on a face.`);
  return ok(f.expression === to ? `Yes, I look ${to}.` : `No, I do not look ${to}; I look ${f.expression || 'calm'}.`);
}
/** Becomes a preset of the catalog ("be a woman"). `inline`: just do it and return the words. */
export function facePreset(ctx, kind, data, inline = false) {
  if (!data) return noFaces();
  const name = data.presets[kind] ? kind : data.presets[lc(kind).replace(/_/g, ' ')] ? lc(kind).replace(/_/g, ' ') : null;
  if (!name) return null;
  const f = faceOf(ctx, data), keep = { saved: f.saved, history: f.history, future: f.future, n: f.n, name: f.name };
  if (!inline) mark(f);
  Object.assign(f, newFace(data, name), keep, { options: null });
  return inline ? `I drew ${article(name)} ${plain(name)}` : finish(ctx, data, f, `I drew ${article(name)} ${plain(name)}: ${describeFace(data, f)}.`);
}
/** "draw a face with ...", "a woman with a long face and curly red hair": a preset to start from (when named) and the nouns of the words. */
export function faceDescribe(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)), pre = cl.find((c) => c.preset);
  mark(f);
  const keep = { saved: f.saved, history: f.history, future: f.future, n: f.n, name: f.name };
  if (pre) Object.assign(f, newFace(data, pre.preset), keep, { options: null });
  const said = [], missed = [];
  for (const c of cl) {
    if (c.mood) { f.expression = c.mood; continue; }
    if (!c.slots.length) { if (c.neg || c.features.length || c.unknown.length) missed.push(...c.features, ...c.unknown); continue; }
    if (c.neg) { removeClause(data, f, c); continue; }
    const slot = pickSlot(data, f, c);
    const name = c.variant?.find((o) => o.slot === slot)?.name ?? bestVariant(data, slot, c.features, f.slots[slot] === NONE ? null : f.slots[slot]) ?? (f.slots[slot] === NONE ? slotOf(data, slot).variants[0].name : f.slots[slot]);
    if (c.features.some((x) => !bestVariant(data, slot, [x], null))) missed.push(...c.features.filter((x) => !bestVariant(data, slot, [x], null)).map((x) => `${x} ${plain(nounOf(slot))}`));
    put(data, f, slot, name);
    const col = colourRole(data, c, slot); if (col && paintSlot(data, f, slot, col) === null) missed.push(`${plain(col.name)} ${plain(nounOf(slot))}`);
    said.push(slot);
  }
  if (!pre && !said.length && !cl.some((c) => c.mood)) { f.history.pop(); return no('I could not find a part of a face in that. Try for example "a woman with a long face, small green eyes and curly red hair".'); }
  return finish(ctx, data, f, `${pre ? `I drew ${article(pre.preset)} ${plain(pre.preset)}` : 'I changed the face'}${said.length ? `${pre ? ' with' : ':'} ${joinAnd([...new Set(said)].map((x) => phraseOf(data, f, x)))}` : ''}.${missed.length ? ` I have no ${joinAnd([...new Set(missed)])} yet.` : ''}`);
}
export function faceSelf(ctx, a, data) { if (!data) return noFaces(); const f = faceOf(ctx, data); return ok(`I have ${describeFace(data, f)}.${f.expression ? ` I look ${f.expression}.` : ''}`); }
/** "do you have glasses?", "are you wearing a hat?": the slot of the words, is it filled. */
export function faceHas(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), cl = clausesOf(data, wordsOf(a)).filter((c) => c.slots.length);
  if (!cl.length) return ok(`No, I have no ${plain(wordsOf(a).join(' '))} on my face.`);
  const c = cl[0], slot = pickSlot(data, f, c, { wantPresent: true }), has = f.slots[slot] !== NONE && (!c.variant || c.variant.some((o) => o.name === f.slots[slot]));
  return ok(has ? `Yes, I have ${phraseOf(data, f, slot)}.` : `No, I have ${f.slots[slot] === NONE ? `no ${plain(nounOf(slot))}` : phraseOf(data, f, slot)}.`);
}
export function faceParts(ctx, a, data) {
  if (!data) return noFaces();
  return ok(`I am a drawn face. You can change my ${joinAnd(data.slots.map((s) => plain(s.name)))}, their size and place, my colours, and my expression (${joinAnd(Object.keys(data.expressions).filter((n) => n !== 'talking'))}). Ask "what hats are there?" for the choices.`);
}
const keyOf = (n) => String(n ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).toLowerCase();
export function faceSave(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), n = String(a.name ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24), k = keyOf(n);
  if (!k) return no('What should I call this face?');
  if (data.presets[k]) return no(`"${n}" is one of my own faces. Choose another name.`);
  if (!f.saved[k] && Object.keys(f.saved).length >= 12) return no('I can keep twelve faces. Delete one first.');
  f.saved[k] = { name: n, ...structuredClone(snap(f)) };
  f.name = n;
  return finish(ctx, data, f, `I saved this face as ${n}. Say "be ${n}" to bring it back.`);
}
export function faceLoad(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), k = keyOf(String(a.name ?? '').replace(/^(?:the|my)\s+/i, '').replace(/\s+face$/i, ''));
  if (!k) return no('Which face do you want?');
  const mood = tokens(k).map((w) => indexOf(data).moodWords.get(w)?.[0]).find(Boolean);
  if (mood && !f.saved[k] && !data.presets[k]) return faceMood(ctx, { mood }, data);
  const hit = f.saved[k];
  if (hit) { mark(f); apply(f, { slots: hit.slots, colours: hit.colours, paint: hit.paint ?? {}, adj: hit.adj ?? {}, expression: '', base: hit.base ?? f.base }); f.name = hit.name; return finish(ctx, data, f, `I am ${hit.name} now: ${describeFace(data, f)}.`); }
  const p = facePreset(ctx, k, data);
  if (p) return p;
  const have = [...Object.values(f.saved).map((x) => x.name), ...Object.keys(data.presets)];
  return no(`I do not have a face called ${plain(k)}. I know ${joinAnd(have.map(plain))}. To keep this one, say "save this as ${plain(k)}".`);
}
export function faceList(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), mine = Object.values(f.saved).map((x) => x.name);
  return ok(`${mine.length ? `Your faces: ${joinAnd(mine)}. ` : 'You have not saved a face yet. '}My own: ${joinAnd(Object.keys(data.presets).map(plain))}.`);
}
/** "surprise me": a face of random variants (reproducible from the counter). */
export function faceSurprise(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data); mark(f);
  f.n = (f.n ?? 0) + 1;
  let h = 2166136261 ^ (f.n * 7919 + 13);
  const rnd = (k) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % k; };
  for (const s of data.slots) { budget.tick('faces.surprise'); const opts = s.optional ? [...s.variants.map((v) => v.name), NONE, NONE] : s.variants.map((v) => v.name); put(data, f, s.name, opts[rnd(opts.length)]); }
  for (const [of, list] of Object.entries(data.colours)) { const natural = Object.entries(list).filter(([, c]) => c.natural).map(([n]) => n); const pool = natural.length ? natural : Object.keys(list); f.colours[of] = pool[rnd(pool.length)]; }
  f.paint = {};
  return finish(ctx, data, f, `I drew a new face: ${describeFace(data, f)}.`);
}
/** Back to the preset the face started from (or to the preset's variant for one part). */
export function faceReset(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data);
  mark(f);
  const keep = { saved: f.saved, history: f.history, future: f.future, n: f.n, name: f.name };
  Object.assign(f, newFace(data, f.base), keep, { options: null });
  return finish(ctx, data, f, `I am back to the ${plain(f.base)} face.`);
}
export function faceUndo(ctx, a, data) {
  if (!ctx.state.face?.history?.length) return { status: 'missing', note: 'There is nothing to undo.' };
  if (!data) return noFaces();
  const f = faceOf(ctx, data), prev = f.history.pop();
  if (!prev) return { status: 'missing', note: 'There is nothing to undo.' };
  f.future.push(snap(f)); apply(f, prev); f.options = null;
  return finish(ctx, data, f, 'I went back to how I was before.');
}
export function faceRedo(ctx, a, data) {
  if (!ctx.state.face?.future?.length) return { status: 'missing', note: 'There is nothing to redo.' };
  if (!data) return noFaces();
  const f = faceOf(ctx, data), next = f.future.pop();
  if (!next) return { status: 'missing', note: 'There is nothing to redo.' };
  f.history.push(snap(f)); apply(f, next); f.options = null;
  return finish(ctx, data, f, 'I did it again.');
}

/** "make it red", "make it happy", "become a woman", "be Grandma", "change the nose": the words decide what is meant: a saved face, a preset, an expression, a colour, or the next variant of a part. */
export function faceRestyle(ctx, a, data) {
  if (!data) return noFaces();
  const f = faceOf(ctx, data), ws = wordsOf(a), text = ws.join(' ');
  if (f.saved[keyOf(text)] || f.saved[keyOf(ws.filter((w) => !FUNCTION_WORDS.has(w)).join(' '))]) return faceLoad(ctx, { name: text }, data);
  const cl = clausesOf(data, ws);
  const slotC = cl.find((c) => c.slots.length), colourC = cl.some((c) => c.colours.length), pre = cl.find((c) => c.preset), mood = cl.find((c) => c.mood);
  if (pre && !slotC) return facePreset(ctx, pre.preset, data);
  if (mood && !colourC) return faceMood(ctx, { mood: mood.mood }, data);
  if (slotC && colourC) return faceColour(ctx, a, data);
  if (slotC) return faceChange(ctx, { ...a, dir: 'different' }, data);
  if (colourC) return no('Which part should get the colour? For example "make the hat red".');
  return faceLoad(ctx, { name: text }, data);
}
