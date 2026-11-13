// SPDX-License-Identifier: AGPL-3.0-only
// The drawn face (AVATAR-FROM-PARTS): the operations of ui.avatar on a face made of replaceable parts (facedata.mjs: the `k.faces` data, facedraw.mjs: the drawing).
//
// State (ctx.state.face): { active, slots: { face, hair, eyes, eyebrows, nose, beard, mouth, glasses: <variant id> }, colours: { skin, hair, iris, lips, glass, shirt, brow?, beard?: hex },
//   adj: { <slot>: { s: scale, dx, dy } } (size and place inside the face frame, set through the SPACE module), expression, base (the preset it started from), name,
//   saved: { <name>: { slots, colours, adj } }, options: { slot, variants } (what "what noses are there?" shows, for the host), n (a counter for "another") }.
// While `active`, the operations of the DiceBear characters that mean "change a part of me" are answered here (ops.mjs hands them over): the same sentences work for both
// kinds of avatar, in both reasoners. Every reply is plain words. Browser-safe: imports only its siblings and the shared space module.
import { getFaces } from './facedata.mjs?v=129f43f6f1';
import { shadeHex, COLOUR_ROLES } from './facedraw.mjs?v=f4cb696f65';
import * as space from '../space/space.mjs?v=27b9e9b571';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const ok = (value) => ({ status: 'supported', value });
const no = (note) => ({ status: 'unsupported', note });
const words = (t) => String(t ?? '').toLowerCase().replace(/_/g, ' ').replace(/[^a-z0-9\s'-]+/g, ' ').split(/\s+/).filter(Boolean);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const joinOr = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a.at(-1)}`);
const art = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const plain = (id) => String(id).replace(/_/g, ' ');

// ---- the state ------------------------------------------------------------------------------------------------------------------------------------------
export const DEFAULT_PRESET = 'girl';
const DEFAULT_COLOUR = { lips: 'pink', glass: 'black', skin: 'light', hair: 'brown', iris: 'brown', shirt: 'blue', background: 'blue', hat: 'red', jewel: 'gold' };
const SPEC_MIN = 0.6, SPEC_MAX = 1.5, STEP_SCALE = 1.15;
/** How far a part may move from its place (frame units): it must stay a face. */
const LIMITS = { face: { dx: [0, 0], dy: [0, 0] }, hair: { dx: [-4, 4], dy: [-6, 8] }, eyes: { dx: [-8, 6], dy: [-8, 8] }, eyebrows: { dx: [-8, 6], dy: [-8, 8] }, nose: { dx: [-4, 4], dy: [-6, 6] }, beard: { dx: [-3, 3], dy: [-5, 5] }, hat: { dx: [-3, 3], dy: [-4, 6] }, earrings: { dx: [-2, 2], dy: [-4, 4] }, mouth: { dx: [-5, 5], dy: [-6, 6] }, glasses: { dx: [-3, 3], dy: [-6, 6] } };

export function newFace(preset = DEFAULT_PRESET, data = getFaces()) {
  const p = data.presets[preset] ?? Object.values(data.presets)[0];
  const f = { active: true, slots: {}, colours: {}, adj: {}, expression: 'neutral', base: p?.name ?? '', name: '', saved: {}, options: null, n: 0 };
  for (const s of data.slots) f.slots[s.name] = p?.slots[s.name] ?? (s.optional ? 'none' : s.variants.find((v) => v.pick)?.id);
  for (const r of COLOUR_ROLES) f.colours[r] = colourHex(data, r, p?.colours[r] ?? DEFAULT_COLOUR[r]) ?? '888888';
  return f;
}
export function faceOf(ctx) {
  const s = ctx.state;
  if (!s.face || typeof s.face !== 'object') s.face = newFace();
  const f = s.face, d = newFace();
  f.slots = { ...d.slots, ...f.slots }; f.colours = { ...d.colours, ...f.colours }; f.adj ??= {}; f.saved ??= {}; f.expression ??= 'neutral';
  return f;
}
export const isActive = (ctx) => !!ctx.state?.face?.active;
const startOf = (f) => ({ slots: { ...f.slots }, colours: { ...f.colours }, adj: structuredClone(f.adj ?? {}) });
const clean = (f) => { f.options = null; };

// ---- words ------------------------------------------------------------------------------------------------------------------------------------------------
const PART_SLOT = { eye: 'eyes', eyes: 'eyes', eyebrow: 'eyebrows', eyebrows: 'eyebrows', brow: 'eyebrows', brows: 'eyebrows', hair: 'hair', hairstyle: 'hair', hair_style: 'hair', haircut: 'hair', beard: 'beard', facial_hair: 'beard', moustache: 'beard', mustache: 'beard',
  glass: 'glasses', glasses: 'glasses', accessory: 'glasses', spectacles: 'glasses', hat: 'hat', hats: 'hat', cap: 'hat', beanie: 'hat', earring: 'earrings', earrings: 'earrings', face: 'face', head: 'face', face_shape: 'face', nose: 'nose', mouth: 'mouth', lip: 'mouth', lips: 'mouth' };
const PART_ROLE = { hat: 'hat', earrings: 'jewel', face: 'skin', hair: 'hair', eyes: 'iris', eyebrows: 'brow', mouth: 'lips', glasses: 'glass', beard: 'beard', nose: 'skin' };
const BACKGROUND_WORDS = new Set(['background', 'backdrop', 'backround']);
const SKIN_WORDS = new Set(['skin', 'complexion']), SHIRT_WORDS = new Set(['shirt', 'clothes', 'clothing', 'sweater', 'jacket', 'main', 'body']);
const KINDS = { robot: 'robot', android: 'robot', bot: 'robot', emoji: 'emoji', smiley: 'emoji', girl: 'girl', boy: 'boy', woman: 'woman', women: 'woman', lady: 'woman', man: 'man', men: 'man', gentleman: 'man', grandma: 'grandma', grandmother: 'grandma', grandpa: 'grandpa', grandfather: 'grandpa', child: 'girl', kid: 'boy' };
const OLD = new Set(['old', 'elderly', 'aged']);
const STOP = new Set(['a', 'an', 'the', 'with', 'and', 'has', 'have', 'having', 'who', 'that', 'is', 'are', 'of', 'her', 'his', 'their', 'its', 'my', 'your', 'me', 'yourself', 'i', 'want', 'to', 'see', 'draw', 'sketch', 'make', 'build', 'create', 'give', 'show', 'describe', 'paint', 'please', 'pls', 'like', 'some', 'face', 'portrait', 'picture', 'drawing', 'person', 'looking', 'it', 'this', 'one', 'ones', 'also', 'plus', 'too', 'very', 'really', 'quite', 'on', 'in', 'for', 'be', 'get', 'put', 'wearing', 'wear', 'got', 'can', 'could', 'you', 'would', 'u', 'ur', 'whose', 'which', 'what', 'where', 'then', 'but', 'as', 'its']);
const NEG = new Set(['no', 'without', 'not', 'never']);
const SHADE_WORDS = { dark: -0.3, deep: -0.3, light: 0.3, pale: 0.35, bright: 0.2 };
const BOUNDARY = new Set(['with', 'and', 'who', 'has', 'have', 'having', 'plus', 'also', 'but', 'wearing', 'wears', ',']);

function slotOfWord(data, w) {
  if (PART_SLOT[w]) return PART_SLOT[w];
  for (const s of data.slots) if (s.words.includes(w)) return s.name;
  return null;
}
export const slotOfPart = (part, data = getFaces()) => slotOfWord(data, String(part ?? '').toLowerCase());
const slotOf = (data, name) => data.slots.find((s) => s.name === name);
const pickable = (data, name) => slotOf(data, name)?.variants.filter((v) => v.pick) ?? [];
const synonym = (data, w) => data.synonyms[w] ?? w;

/** The colour a name means for a role (hex), or null. A colour a role has no name for falls back to the general names. */
export function colourHex(data, role, name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  const r = role === 'brow' || role === 'beard' ? 'hair' : role === 'nose' ? 'skin' : role;
  return data.colours[r]?.[n] ?? data.colours[r]?.[synonym(data, n)] ?? data.colours.any?.[n] ?? null;
}
export function colourName(data, role, hex) {
  const r = role === 'brow' || role === 'beard' ? 'hair' : role;
  const h = String(hex ?? '').replace('#', '');
  const own = Object.entries(data.colours[r] ?? {}), all = own.length ? own : Object.entries(data.colours.any ?? {});
  const rgb = (x) => [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  const dist = (a, b) => rgb(a).reduce((s, v, i) => s + (v - rgb(b)[i]) ** 2, 0);
  return all.map(([n, x]) => [n, dist(h, x)]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? h;
}

/** Scores the variants of a slot against plain words (features, synonyms); the best one, or none when nothing matches. A tie keeps the current variant. */
export function matchVariant(data, slot, ws, current) {
  const list = pickable(data, slot);
  const toks = ws.map((w) => synonym(data, w));
  const scored = list.map((v, i) => ({ v, i, score: toks.filter((w) => v.features.includes(w) || v.id === w).length }));
  const top = Math.max(0, ...scored.map((x) => x.score));
  if (!top) return { id: null, matched: [], unmatched: ws };
  const best = scored.filter((x) => x.score === top);
  const chosen = best.find((x) => x.v.id === current) ?? best[0];
  const matched = ws.filter((w) => chosen.v.features.includes(synonym(data, w)) || chosen.v.id === synonym(data, w));
  return { id: chosen.v.id, matched, unmatched: ws.filter((w) => !matched.includes(w)) };
}

// ---- describing a face ------------------------------------------------------------------------------------------------------------------------------------
/**
 * Reads a description ("a woman with a long face, small green eyes, thick eyebrows and curly red hair, with glasses") into per-slot choices: the words before a slot's
 * noun belong to it; a word that names a kind (woman, grandpa) picks the preset to start from; an expression word is the expression. { kind, expression, picks: { slot: id },
 * colours: { role: hex }, unmatched: [text], untouched }.
 */
export function readDescription(text, face = null, data = getFaces()) {
  const toks = String(text ?? '').toLowerCase().replace(/[,;]/g, ' , ').replace(/[^a-z0-9\s,'-]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = { kind: null, expression: null, picks: {}, colours: {}, unmatched: [], mentioned: [] };
  let pend = [], neg = false, old = false;
  const flush = () => { pend = []; neg = false; };
  for (let i = 0; i < toks.length; i++) {
    budget.tick('faces.read');
    const w = toks[i];
    if (BOUNDARY.has(w) || w === ',') { flush(); continue; }
    if (NEG.has(w)) { neg = true; continue; }
    if (OLD.has(w) && toks.slice(i + 1, i + 3).some((x) => KINDS[x])) { old = true; continue; }
    if (KINDS[w] && !pend.some((x) => slotOfWord(data, x))) { out.kind = KINDS[w]; continue; }
    const exp = Object.values(data.expressions).find((e) => e.name === w || e.words.includes(w));
    if (exp && exp.name !== 'talking') {
      const next = toks[i + 1] ?? '';
      if (!slotOfWord(data, next) || next === 'face') { out.expression = exp.name; continue; }   // "a happy face", "a smiling woman"; but "smiling mouth" is a feature of the mouth
    }
    if (w === 'bald') { out.picks.hair = 'none'; out.mentioned.push('hair'); flush(); continue; }
    if (w === 'bearded') { out.picks.beard = 'full'; out.mentioned.push('beard'); flush(); continue; }
    if (w === 'clean-shaven' || w === 'shaved') { out.picks.beard = 'none'; out.mentioned.push('beard'); flush(); continue; }
    if (SKIN_WORDS.has(w) || SHIRT_WORDS.has(w) || BACKGROUND_WORDS.has(w)) { applyColour(out, data, SKIN_WORDS.has(w) ? 'skin' : BACKGROUND_WORDS.has(w) ? 'background' : 'shirt', pend, face); flush(); continue; }
    const slot = slotOfWord(data, w);
    if (slot) {
      out.mentioned.push(slot);
      let mods = pend.filter((x) => !STOP.has(x));
      if (w === 'sunglasses' || w === 'shades') mods = [...mods, 'sun'];
      if (w === 'moustache' || w === 'mustache') mods = [...mods, 'moustache'];
      if (w === 'smile' || w === 'smiling') mods = [...mods, 'smile', 'smile'];   // "a big smile": the noun itself counts twice, the mouth that smiles wins over a big one
      if (neg) { if (slotOf(data, slot)?.optional) out.picks[slot] = 'none'; else out.unmatched.push(`no ${w}`); flush(); continue; }
      const role = PART_ROLE[slot];
      const rest = applyColour(out, data, role, mods, face);
      const cur = out.picks[slot] ?? face?.slots?.[slot];
      const m = matchVariant(data, slot, rest, cur);
      if (m.id) out.picks[slot] = m.id;
      else if (slotOf(data, slot)?.optional && (!cur || cur === 'none')) out.picks[slot] = pickable(data, slot)[0]?.id;
      for (const u of m.unmatched) out.unmatched.push(`${u} ${plain(slot) === 'eyes' ? 'eyes' : plain(slot)}`);
      flush();
      continue;
    }
    if (data.unsupported.includes(w) || data.unsupported.includes(w.replace(/s$/, ''))) { out.unmatched.push(w); flush(); continue; }
    if (STOP.has(w)) continue;
    pend.push(w);
  }
  if (old && out.kind) out.kind = out.kind === 'woman' ? 'grandma' : out.kind === 'man' ? 'grandpa' : out.kind;
  return out;
}

/** Colour words among the modifiers set the role's colour; the other words are returned. "dark" or "light" alone shade (or name) the colour. */
function applyColour(out, data, role, mods, face) {
  const rest = [];
  const shades = mods.filter((w) => SHADE_WORDS[w] !== undefined && !colourHex(data, role, w));
  let found = null;
  for (const w of mods) {
    const hex = colourHex(data, role, w);
    if (hex) { found = hex; continue; }
    if (SHADE_WORDS[w] !== undefined) continue;
    rest.push(w);
  }
  if (found) { out.colours[role] = shades.length ? shadeHex(found, SHADE_WORDS[shades[0]]) : found; return rest; }
  if (shades.length) {
    const w = shades[0], named = colourHex(data, role, w);
    if (named) out.colours[role] = named;
    else if (role === 'hair' || role === 'brow' || role === 'beard') out.colours[role] = colourHex(data, 'hair', SHADE_WORDS[w] < 0 ? 'black' : 'blonde');
    else out.colours[role] = shadeHex(face?.colours?.[role === 'brow' ? 'hair' : role] ?? '888888', SHADE_WORDS[w]);
  }
  return rest;
}

// ---- saying what a face is -------------------------------------------------------------------------------------------------------------------------------
function phraseOf(face, slot, data = getFaces(), id = face.slots[slot]) {
  const c = (role) => colourName(data, role, face.colours[role]);
  if (slot === 'face' && id === 'robot') return 'a robot with a screen face';
  if (slot === 'face' && id === 'emoji') return 'a round emoji face';
  if (slot === 'hair' && id === 'antenna') return 'an antenna';
  if (slot === 'eyes' && id === 'led') return `glowing ${c('iris')} eyes`;
  if (slot === 'eyes' && id === 'dot') return 'dot eyes';
  if (slot === 'mouth' && id === 'grille') return 'a speaker grille for a mouth';
  switch (slot) {
    case 'face': return `${art(plain(id))} ${plain(id)} face`;
    case 'hair': return id === 'none' ? 'no hair' : `${plain(id)} ${c('hair')} hair`;
    case 'eyes': return `${plain(id)} ${c('iris')} eyes`;
    case 'eyebrows': return `${plain(id)} eyebrows`;
    case 'nose': return `${art(plain(id))} ${plain(id)} nose`;
    case 'mouth': return `${art(plain(id))} ${id === 'smile' ? 'smiling' : plain(id)} mouth`;
    case 'beard': { const bc = colourName(data, 'hair', face.colours.beard ?? face.colours.hair); return id === "none" ? "no beard" : id === "moustache" ? `${art(bc)} ${bc} moustache` : `${art(bc)} ${bc} ${plain(id)} beard`; }
    case 'glasses': return id === 'none' ? 'no glasses' : id === 'sun' ? 'sunglasses' : `${plain(id)} glasses`;
    case 'hat': return id === 'none' ? 'no hat' : `${art(c('hat'))} ${c('hat')} ${id === 'tophat' ? 'top hat' : plain(id)}`;
    case 'earrings': return id === 'none' ? 'no earrings' : `${c('jewel')} ${plain(id)} earrings`;
    default: return `${plain(id)} ${slot}`;
  }
}
export function describeFace(face, data = getFaces()) {
  const order = ['face', 'eyes', 'eyebrows', 'nose', 'mouth', 'hair', 'beard', 'glasses', 'hat', 'earrings'].filter((s) => face.slots[s] !== undefined);
  const special = face.slots.face === 'robot' || face.slots.face === 'emoji';   // the looks of a robot and an emoji say only what they have
  const yes = order.filter((s) => face.slots[s] !== 'none'), none = special ? [] : order.filter((s) => face.slots[s] === 'none' && !['hat', 'earrings'].includes(s));
  const noneSay = none.length ? `, and ${joinAnd(none.map((s) => phraseOf(face, s, data)))}` : '';
  return `${joinAnd(yes.map((s) => phraseOf(face, s, data)))}${noneSay}`;
}
const finish = (ctx, text) => { ctx.request?.('ui.openTab', { tab: 'robot' }); return ok(text); };
const unmatchedSay = (list) => {
  const cannot = list.filter((x) => /^no /.test(x)), none = list.filter((x) => !/^no /.test(x));
  return `${none.length ? ` I have no ${joinAnd(none)} yet.` : ''}${cannot.map((x) => ` I cannot take off the ${x.slice(3)}.`).join('')}`;
};

/** "a woman with a long face and curly red hair": describe a face, choose the variant of each named slot that matches best, say what was chosen and what could not be matched. */
export function faceDescribe(ctx, { words: text, w } = {}) {
  const data = getFaces(), txt = text ?? w, kind0 = readDescription(txt, null, data).kind;
  const r = readDescription(txt, kind0 && data.presets[kind0] ? newFace(kind0, data) : ctx.state.face?.active ? ctx.state.face : null, data);   // a kind starts from its preset: what is "current" is the preset's
  const f = ctx.state.face?.active ? faceOf(ctx) : Object.assign(faceOf(ctx), { active: true });
  const saved = f.saved, name = f.name;
  if (r.kind && data.presets[r.kind]) Object.assign(f, newFace(r.kind, data), { saved, name });
  else if (!ctx.state.face?.active) Object.assign(f, newFace(f.base || DEFAULT_PRESET, data), { saved, name });
  f.active = true; clean(f);
  for (const [slot, id] of Object.entries(r.picks)) f.slots[slot] = id;
  for (const slot of r.mentioned) if (slotOf(data, slot)?.optional && !(slot in r.picks) && f.slots[slot] === 'none') { f.slots[slot] = pickable(data, slot)[0].id; r.picks[slot] = f.slots[slot]; }   // "with glasses": the first glasses I have
  for (const [role, hex] of Object.entries(r.colours)) { f.colours[role] = hex; if (role === 'hair' && f.colours.brow) delete f.colours.brow; if (role === 'hair' && f.colours.beard) delete f.colours.beard; }
  if (r.expression) f.expression = r.expression;
  const named = [...new Set(r.mentioned)].filter((s) => r.picks[s] !== undefined || r.colours[PART_ROLE[s]] !== undefined);
  if (!named.length && !r.kind && !r.expression && !Object.keys(r.colours).length) {
    return no(`I could not find a part of a face in that.${r.unmatched.length ? unmatchedSay(r.unmatched) : ''} Try for example "a woman with a long face, small green eyes and curly red hair".`);
  }
  const bits = named.map((s) => phraseOf(f, s, data));
  const lead = r.kind ? `I drew ${art(r.kind)} ${plain(r.kind)}` : 'I changed the face';
  const exp = r.expression && r.expression !== 'neutral' ? ` It looks ${r.expression}.` : '';
  return finish(ctx, `${lead}${bits.length ? `${r.kind ? ' with' : ':'} ${joinAnd(bits)}` : ''}.${exp}${unmatchedSay(r.unmatched)}${r.kind ? '' : ' The other parts stay as they were.'}`);
}

// ---- one element at a time -------------------------------------------------------------------------------------------------------------------------------
function resolveSlot(f, part, data = getFaces()) {
  const slot = slotOfPart(part, data);
  if (!slot) return { error: `I have no ${plain(part)} on my face yet.` };
  return { slot };
}
const listFor = (data, slot) => [...pickable(data, slot).map((v) => v.id), ...(slotOf(data, slot).optional ? ['none'] : [])];
const nounOf = (slot) => ({ face: 'face', hair: 'hair', eyes: 'eyes', eyebrows: 'eyebrows', nose: 'nose', mouth: 'mouth', beard: 'beard', glasses: 'glasses', hat: 'hat', earrings: 'earrings' }[slot] ?? slot);
/** Sets a variant. A part the expression overrides is the user's choice now: the rest of the expression is kept as chosen parts and the expression is calm again. */
function put(f, data, slot, id) {
  const e = data.expressions[f.expression];
  if (e && Object.keys(e.over).some((k) => k === slot || k.startsWith(`${slot}.`))) {
    for (const [k, v] of Object.entries(e.over)) if (!k.includes('.') && k !== slot) f.slots[k] = v;
    f.expression = 'neutral';
  }
  f.slots[slot] = id;
}
const sayHave = (f, slot, data) => `I have ${phraseOf(f, slot, data)} now.`;

export function faceStep(ctx, { part, dir }) {
  const data = getFaces(), f = faceOf(ctx);
  if (/^expression/.test(part ?? '')) return faceMood(ctx, { mood: 'next', dir });
  const { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  clean(f);
  const list = dir === 'different' ? pickable(data, slot).map((v) => v.id) : listFor(data, slot), cur = Math.max(0, list.indexOf(f.slots[slot]));
  let next;
  if (dir === 'previous') next = list[(cur - 1 + list.length) % list.length];
  else if (dir === 'next') next = list[(cur + 1) % list.length];
  else { f.n = (f.n ?? 0) + 1; next = list[(cur + 1 + (f.n % Math.max(1, list.length - 1))) % list.length]; if (next === list[cur]) next = list[(cur + 1) % list.length]; }
  put(f, data, slot, next);
  return finish(ctx, `${sayHave(f, slot, data)}`);
}

/** A variant named in words ("make the nose small", "sunglasses", "hair 2"): the slot may be missing when the word belongs to one variant only. */
export function faceSetPart(ctx, { part, value, text, words: w, n } = {}) {
  const data = getFaces(), f = faceOf(ctx);
  const ws = words(w ?? text ?? value);
  let slot = part ? slotOfPart(part, data) : null;
  if (part && !slot) return no(`I have no ${plain(part)} on my face yet.`);
  if (!slot) {
    const sl = ws.map((x) => slotOfWord(data, x)).find(Boolean) ?? data.slots.find((s) => matchVariant(data, s.name, ws, null).id)?.name;
    if (!sl) return no(`I do not know "${ws.join(' ')}" for a face yet. Ask me "what noses are there?" to see what I can draw.`);
    slot = sl;
  }
  clean(f);
  if (!w && !text && !value && n !== undefined && n !== '') {
    const list = pickable(data, slot);
    const v = list[Number(n) - 1]; if (!v) return no(`My ${nounOf(slot)} go from 1 to ${list.length}.`);
    put(f, data, slot, v.id); return finish(ctx, `${sayHave(f, slot, data)}`);
  }
  if (n !== undefined && n !== '' && /^\d+$/.test(String(n)) && !ws.some((x) => !/^\d+$/.test(x) && x !== slot)) {
    const v = pickable(data, slot)[Number(n) - 1]; if (v) { put(f, data, slot, v.id); return finish(ctx, `${sayHave(f, slot, data)}`); }
  }
  const role = PART_ROLE[slot], tmp = { colours: {}, picks: {} };
  const rest = applyColour(tmp, data, role, ws.filter((x) => x !== slot && !STOP.has(x)), f);
  if (/^(none|nothing|no|off)$/.test(rest.join(' ')) || (rest.length === 1 && ['none', 'bald', 'shaved'].includes(rest[0]))) {
    if (!slotOf(data, slot).optional) return no(`I cannot take off my ${nounOf(slot)}.`);
    put(f, data, slot, 'none'); return finish(ctx, `${sayHave(f, slot, data)}`);
  }
  if (!rest.length && !Object.keys(tmp.colours).length) {   // "give yourself a beard": the part by its name only
    if (f.slots[slot] !== 'none') return ok(`I already have ${phraseOf(f, slot, data)}.`);
    put(f, data, slot, pickable(data, slot)[0].id); return finish(ctx, `${sayHave(f, slot, data)}`);
  }
  const m = matchVariant(data, slot, rest.map((x) => (x === 'sunglass' ? 'sun' : x)), f.slots[slot]);
  const asMood = expressionOf(rest.join(' '), data);
  if (!m.id && asMood && !Object.keys(tmp.colours).length) return faceMood(ctx, { mood: asMood });   // "make it happy" after "what noses are there?": the pronoun was the nose, the word is an expression
  const exact = pickable(data, slot).find((v) => rest.join(' ') === v.id);
  if (!m.id && !exact && !Object.keys(tmp.colours).length) {
    const names = pickable(data, slot).map((v) => v.id);
    return no(`I do not know ${plain(nounOf(slot))} like "${rest.join(' ')}". My ${nounOf(slot)} can be ${joinOr(names.map(plain))}.`);
  }
  if (m.id || exact) put(f, data, slot, exact?.id ?? m.id);
  if (Object.keys(tmp.colours).length) Object.assign(f.colours, tmp.colours);
  return finish(ctx, `${sayHave(f, slot, data)}${m.unmatched.length && (m.id || exact) ? ` I have no "${m.unmatched.join(' ')}" yet.` : ''}`);
}

export function faceRemove(ctx, { part, value, text } = {}) {
  const data = getFaces(), f = faceOf(ctx);
  const slot = part ? slotOfPart(part, data) : words(value ?? text).map((x) => slotOfWord(data, x)).find(Boolean);
  if (!slot) return no(`I have no ${plain(part ?? value ?? 'part')} on my face yet.`);
  if (!slotOf(data, slot).optional) return no(`I cannot take off my ${nounOf(slot)}: a face needs one.`);
  clean(f);
  if (f.slots[slot] === 'none') return ok(`I have no ${slot === 'hair' ? 'hair' : nounOf(slot)} already.`);
  put(f, data, slot, 'none');
  return finish(ctx, `${sayHave(f, slot, data)}`);
}
export function faceRemoveAll(ctx) {
  const data = getFaces(), f = faceOf(ctx); clean(f);
  for (const s of data.slots) if (s.optional) put(f, data, s.name, 'none');
  return finish(ctx, `I took off the hair, the beard and the glasses.`);
}
export function faceReset(ctx, { part } = {}) {
  const data = getFaces(), f = faceOf(ctx); clean(f);
  const base = data.presets[f.base] ?? Object.values(data.presets)[0];
  if (!part) { const saved = f.saved, name = f.name; Object.assign(f, newFace(f.base, data), { saved, name }); return finish(ctx, `I am back to the ${plain(base.name)} face.`); }
  const { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  put(f, data, slot, base.slots[slot] ?? f.slots[slot]); delete f.adj[slot];
  return finish(ctx, `My ${nounOf(slot)} are back to normal: ${phraseOf(f, slot, data)}.`);
}

// ---- size and place (the SPACE module, inside the face frame, with limits) ----------------------------------------------------------------------------------
const FRAME = (data) => ({ w: data.frame.w, h: data.frame.h, step: 4 });
export function faceResize(ctx, { part, dir } = {}) {
  const data = getFaces(), f = faceOf(ctx), { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  if (slot === 'face') return no('I keep the size of my face. I can make it another shape: "another face".');
  clean(f);
  const a = (f.adj[slot] ??= { s: 1, dx: 0, dy: 0 });
  const up = ['bigger', 'larger', 'longer', 'wider'].includes(dir), before = a.s ?? 1;
  const next = Math.round(Math.min(SPEC_MAX, Math.max(SPEC_MIN, up ? before * STEP_SCALE : before / STEP_SCALE)) * 100) / 100;
  if (next === before) return ok(`My ${nounOf(slot)} cannot get any ${up ? 'bigger' : 'smaller'} and still be a face.`);
  a.s = next;
  return finish(ctx, `I made my ${nounOf(slot)} ${up ? 'bigger' : 'smaller'}.`);
}
const ROLE_NOUN = { background: 'background', hat: 'hat', jewel: 'earrings', iris: 'eyes', brow: 'eyebrows', glass: 'glasses', skin: 'skin', hair: 'hair', lips: 'lips', shirt: 'shirt', beard: 'beard' };
const MOVE_WORDS = { raise: 'up', lift: 'up', raised: 'up', higher: 'up', up: 'up', upwards: 'up', lower: 'down', down: 'down', lowered: 'down', drop: 'down', left: 'left', right: 'right' };
/** "eyes closer together", "raise the eyebrows", "move the nose down a bit": the words become a move of the SPACE module, applied inside the face frame and kept within the limits. */
export function faceMove(ctx, { part, words: w, text } = {}) {
  const data = getFaces(), f = faceOf(ctx), { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  const ws = words(w ?? text), sl = slotOf(data, slot);
  if (slot === 'face') return no('My face stays where it is. I can move my eyes, nose, mouth and the rest.');
  const closer = ws.some((x) => ['closer', 'together', 'nearer', 'narrower'].includes(x)), apart = ws.some((x) => ['apart', 'wider', 'further', 'farther'].includes(x)) && sl.pair && !ws.some((x) => ['up', 'down'].includes(x));
  const flat = ws.map((x) => (sl.pair && closer ? (x === 'closer' || x === 'nearer' || x === 'together' || x === 'narrower' ? 'right' : x) : sl.pair && apart ? (['apart', 'wider', 'further', 'farther'].includes(x) ? 'left' : x) : MOVE_WORDS[x] ?? x));
  if (sl.pair && (closer || apart) && !flat.some((x) => ['left', 'right'].includes(x))) flat.push(closer ? 'right' : 'left');
  const mv = space.parseMove(flat.join(' '));
  if (!mv) return no(`Tell me which way: for example "raise the ${nounOf(slot)}" or "move the ${nounOf(slot)} down a bit".`);
  const cur = boxFor(f, sl), item = { id: slot, kind: slot, x: cur.x, y: cur.y, w: sl.w, h: sl.h, parts: [{ x: 0, y: 0, w: sl.w, h: sl.h }] };   // the slot's anchor box is its surface
  const r = space.planMove([item], FRAME(data), mv, null);
  if (r.error) return no('Tell me which way to move it.');
  const lim = LIMITS[slot] ?? { dx: [-4, 4], dy: [-4, 4] };
  const a = (f.adj[slot] ??= { s: 1, dx: 0, dy: 0 });
  let dx = r.boxes[slot].x - sl.x, dy = r.boxes[slot].y - sl.y;
  const fix = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  const absY = (name) => slotOf(data, name).y + (f.adj[name]?.dy ?? 0);
  if (sl.pair) dx = Math.min(dx, 49 - sl.x - (sl.w * (a.s ?? 1)) / 2);   // the two eyes may not touch in the middle
  dx = fix(dx, lim.dx); dy = fix(dy, lim.dy);
  const between = { eyebrows: [-Infinity, () => absY('eyes') - 8], eyes: [() => absY('eyebrows') + 8, () => absY('nose') - 6], nose: [() => absY('eyes') + 4, () => absY('mouth') - 10], mouth: [() => absY('nose') + 10, Infinity] }[slot];
  if (between) { const lo = typeof between[0] === 'function' ? between[0]() : between[0], hi = typeof between[1] === 'function' ? between[1]() : between[1]; dy = Math.min(hi - sl.y, Math.max(lo - sl.y, dy)); }
  const was = { dx: a.dx ?? 0, dy: a.dy ?? 0 };
  if (Math.abs(dx - was.dx) < 0.01 && Math.abs(dy - was.dy) < 0.01) return ok(`My ${nounOf(slot)} cannot go further that way and still be a face.`);
  clean(f);
  a.dx = Math.round(dx * 10) / 10; a.dy = Math.round(dy * 10) / 10;
  const what = sl.pair && (closer || apart) ? (closer ? 'closer together' : 'further apart') : space.sayMove(mv);
  return finish(ctx, `I moved my ${nounOf(slot)} ${what}.`);
}
const boxFor = (f, sl) => ({ x: sl.x + (f.adj[sl.name]?.dx ?? 0), y: sl.y + (f.adj[sl.name]?.dy ?? 0) });

/** "longer hair", "shorter hair": the next hair of that length; the other parts grow and shrink (faceResize). */
export function faceAdjust(ctx, { part, dir } = {}) {
  const data = getFaces(), f = faceOf(ctx), { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  if (slot === 'hair' && ['longer', 'shorter'].includes(dir)) {
    const list = pickable(data, 'hair').sort((a, b) => a.size - b.size), cur = list.findIndex((v) => v.id === f.slots.hair);
    clean(f);
    if (f.slots.hair === 'none') { put(f, data, 'hair', list[0].id); return finish(ctx, `${sayHave(f, 'hair', data)}`); }
    const to = list[cur + (dir === 'longer' ? 1 : -1)];
    if (!to) return ok(dir === 'longer' ? 'This is the longest hair I have.' : 'This is the shortest hair I have: I can take it off with "no hair".');
    put(f, data, 'hair', to.id);
    return finish(ctx, `${sayHave(f, 'hair', data)}`);
  }
  return faceResize(ctx, { part, dir });
}

// ---- colours ------------------------------------------------------------------------------------------------------------------------------------------------
function roleOfPart(part, data) {
  const p = String(part ?? '').toLowerCase();
  if (SKIN_WORDS.has(p)) return 'skin';
  if (SHIRT_WORDS.has(p)) return 'shirt';
  if (BACKGROUND_WORDS.has(p)) return 'background';
  const slot = slotOfPart(p, data);
  return slot ? PART_ROLE[slot] : null;
}
export function faceColour(ctx, { part, color } = {}) {
  const data = getFaces(), f = faceOf(ctx), role = roleOfPart(part, data);
  if (!role) return no(`I cannot colour my ${plain(part)}: I have no ${plain(part)} on my face yet.`);
  const hex = colourHex(data, role, String(color).toLowerCase().replace(/^(dark|light|pale|deep|bright)_/, ''));
  if (!hex) return no(`I do not have ${plain(color)} for my ${plain(part)} yet.`);
  const shade = SHADE_WORDS[String(color).split('_')[0]];
  clean(f);
  f.colours[role] = shade !== undefined && /_/.test(color) ? shadeHex(hex, shade) : hex;
  if (role === 'hair') { delete f.colours.brow; delete f.colours.beard; }
  const slot = slotOfPart(part, data);
  if (slot && ['hat', 'earrings'].includes(slot) && f.slots[slot] === 'none') put(f, data, slot, pickable(data, slot)[0].id);   // "red earrings": put some on, in that colour
  if (slot && f.slots[slot] === 'none') return finish(ctx, `I have no ${nounOf(slot)} now, but ${['hair', 'hat'].includes(slot) ? 'it' : 'they'} will be ${plain(color)} when I have ${slot === 'hair' ? 'some' : slot === 'earrings' ? 'some' : 'one'}.`);
  return finish(ctx, `${role === 'skin' ? `My skin is ${plain(color)} now.` : role === 'shirt' ? `My shirt is ${plain(color)} now.` : role === 'background' ? `The background is ${plain(color)} now.` : sayHave(f, slot, data)}`);
}
export function faceShift(ctx, { part, dir } = {}) {
  const data = getFaces(), f = faceOf(ctx), role = roleOfPart(part, data);
  if (!role) return no(`I have no ${plain(part)} on my face yet.`);
  clean(f);
  const key = role === 'brow' && !f.colours.brow ? 'hair' : role === 'beard' && !f.colours.beard ? 'hair' : role;
  f.colours[key] = shadeHex(f.colours[key], dir === 'lighter' ? 0.25 : -0.25).slice(1);
  return finish(ctx, `I made my ${plain(part)} ${dir === 'lighter' ? 'lighter' : 'darker'}.`);
}

// ---- expressions ------------------------------------------------------------------------------------------------------------------------------------------
const MOOD_EXTRA = { cheerful: 'happy', laughing: 'happy', smiling: 'happy', glad: 'happy', joyful: 'happy', excited: 'happy', angry: 'angry', mad: 'angry', cross: 'angry', upset: 'sad', unhappy: 'sad', crying: 'sad', tired: 'sleepy', sleeping: 'sleepy', shocked: 'surprised', amazed: 'surprised', winking: 'wink', blink: 'wink', normal: 'neutral', calm: 'neutral' };
const EXPR_NAMES = (data) => Object.keys(data.expressions).filter((n) => n !== 'talking');
export function expressionOf(mood, data = getFaces()) {
  const m = String(mood ?? '').toLowerCase().replace(/ /g, '_');
  const hit = Object.values(data.expressions).find((e) => e.name === m || e.words.includes(m));
  return (hit && hit.name !== 'talking' ? hit.name : null) ?? (data.expressions[MOOD_EXTRA[m]] ? MOOD_EXTRA[m] : null);
}
export function faceMood(ctx, { mood, dir } = {}) {
  const data = getFaces(), f = faceOf(ctx), names = EXPR_NAMES(data);
  let to = expressionOf(mood, data);
  if (mood === 'next') { const i = names.indexOf(f.expression); to = names[(i + (dir === 'previous' ? -1 : 1) + names.length) % names.length]; }
  if (!to) return no(`I cannot look ${plain(mood)} yet. I can look ${joinOr(names.filter((n) => n !== 'neutral').map(plain))}.`);
  clean(f);
  if (f.expression === to) return ok(to === 'neutral' ? 'I already look calm.' : `I already look ${to === 'wink' ? 'like I am winking' : to}.`);
  f.expression = to;
  return finish(ctx, `${to === 'wink' ? 'I am winking.' : to === 'neutral' ? 'I look calm now.' : `Now I look ${to}.`}`);
}
export function faceCheckMood(ctx, { mood } = {}) {
  const f = faceOf(ctx), to = expressionOf(mood);
  if (!to) return no(`I do not know what ${plain(mood)} looks like on a face.`);
  return ok(f.expression === to ? `Yes, I look ${to}.` : `No, I do not look ${to}; I look ${f.expression === 'neutral' ? 'calm' : f.expression}.`);
}
export function faceAskMood(ctx) { const f = faceOf(ctx); return ok(f.expression === 'neutral' ? 'I look calm.' : `I look ${f.expression}.`); }

// ---- questions --------------------------------------------------------------------------------------------------------------------------------------------
export function faceListOptions(ctx, { part } = {}) {
  const data = getFaces(), f = faceOf(ctx), { slot, error } = resolveSlot(f, part, data); if (error) return no(error);
  clean(f);
  const names = pickable(data, slot).map((v) => v.id);
  f.options = { slot, variants: [...names, ...(slotOf(data, slot).optional ? ['none'] : [])] };
  const label = slot === 'hair' ? 'hairstyles' : slot === 'beard' ? 'beards' : slot === 'face' ? 'faces' : slot === 'eyes' ? 'eyes' : slot === 'eyebrows' ? 'eyebrows' : slot === 'glasses' ? 'glasses' : `${slot}s`;
  ctx.request?.('ui.openTab', { tab: 'robot' });
  return ok(`I can draw ${label}: ${joinAnd(names.map(plain))}${slotOf(data, slot).optional ? ', or none' : ''}. Tap one below.`);
}
export function faceAskPart(ctx, { part } = {}) {
  const data = getFaces(), f = faceOf(ctx);
  const slot = slotOfPart(part, data);
  if (!slot) return no(`I have no ${plain(part)} on my face yet.`);
  return ok(`I have ${phraseOf(f, slot, data)}.`);
}
export function faceHas(ctx, { part, value, text } = {}) {
  const data = getFaces(), f = faceOf(ctx), ws = words(value ?? text ?? part);
  const slot = (part && slotOfPart(part, data)) ?? ws.map((x) => slotOfWord(data, x)).find(Boolean);
  if (!slot) return ok(`No, I have no ${ws.join(' ')} on my face.`);
  const has = f.slots[slot] !== 'none';
  return ok(has ? `Yes, I have ${phraseOf(f, slot, data)}.` : `No, I have ${phraseOf(f, slot, data)}.`);
}
export function faceDescribeSelf(ctx) {
  const f = faceOf(ctx), data = getFaces();
  return ok(`I have ${describeFace(f, data)}.${f.expression !== 'neutral' ? ` I look ${f.expression}.` : ''}`);
}
export function faceParts(ctx) {
  const data = getFaces();
  return ok(`I am a drawn face. You can change my ${joinAnd(data.slots.map((s) => nounOf(s.name)))}, their size and place, my colours, and my expression (${joinAnd(EXPR_NAMES(data).filter((n) => n !== 'neutral'))}). Ask "what noses are there?" for the choices, or describe a face.`);
}

// ---- presets, saving ----------------------------------------------------------------------------------------------------------------------------------------
const cleanName = (n) => String(n ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
const keyOf = (n) => cleanName(n).toLowerCase();
export function presetList(data = getFaces()) { return Object.keys(data.presets); }
/** Becomes a preset of k.faces ("a girl", "grandpa"): { ok } or null when the word is none. */
export function facePreset(ctx, kind) {
  const data = getFaces(), name = KINDS[String(kind).toLowerCase()] ?? kind;
  if (!data.presets[name]) return null;
  const f = faceOf(ctx), saved = f.saved, nm = f.name;
  Object.assign(f, newFace(name, data), { saved, name: nm });
  return finish(ctx, `I drew ${art(plain(name))} ${plain(name)}: ${describeFace(f, data)}.`);
}
export function faceStart(ctx) {
  const f = faceOf(ctx);
  if (f.active) return ok('I am already a drawn face.');
  f.active = true; clean(f);
  return finish(ctx, `I am a drawn face now: ${describeFace(f)}. Describe another one, or change one part at a time.`);
}
export function faceSave(ctx, { name } = {}) {
  const f = faceOf(ctx), n = cleanName(name);
  if (!n) return no('What should I call this face?');
  const k = keyOf(n);
  if (getFaces().presets[k]) return no(`"${n}" is one of my own faces. Choose another name.`);
  if (!f.saved[k] && Object.keys(f.saved).length >= 12) return no('I can keep twelve faces. Delete one first.');
  f.saved[k] = { name: n, ...startOf(f) };
  f.name = n;
  return finish(ctx, `I saved this face as ${n}. Say "be ${n}" to bring it back.`);
}
export function faceLoad(ctx, { name } = {}) {
  const f = faceOf(ctx), n = cleanName(name).replace(/^(?:the|my)\s+/i, '').replace(/\s+face$/i, ''), k = keyOf(n);
  if (!k) return no('Which face do you want?');
  const data = getFaces(), mood = expressionOf(k, data);
  if (mood && !f.saved[k]) return faceMood(ctx, { mood: k });
  const hit = f.saved[k];
  if (hit) {
    Object.assign(f, { active: true, slots: { ...hit.slots }, colours: { ...hit.colours }, adj: structuredClone(hit.adj ?? {}), expression: 'neutral', name: hit.name }); clean(f);
    return finish(ctx, `I am ${hit.name} now: ${describeFace(f, data)}.`);
  }
  const p = facePreset(ctx, k);
  if (p) return p;
  const have = [...Object.values(f.saved).map((x) => x.name), ...presetList(data).map(plain)];
  return no(`I do not have a face called ${n}. I know ${joinAnd(have)}. To keep this one, say "save this as ${n}".`);
}
export function faceList(ctx) {
  const f = faceOf(ctx), mine = Object.values(f.saved).map((x) => x.name);
  return ok(`${mine.length ? `Your faces: ${joinAnd(mine)}. ` : 'You have not saved a face yet. '}My own: ${joinAnd(presetList().map(plain))}.`);
}

/** "surprise me": a face of random variants (reproducible from the counter). */
export function faceSurprise(ctx) {
  const data = getFaces(), f = faceOf(ctx); clean(f);
  f.n = (f.n ?? 0) + 1;
  let h = 2166136261 ^ (f.n * 7919 + 13);
  const rnd = (k) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % k; };
  for (const s of data.slots) {
    const list = pickable(data, s.name), opts = s.optional ? [...list.map((v) => v.id), 'none', 'none'] : list.map((v) => v.id);
    put(f, data, s.name, opts[rnd(opts.length)]);
  }
  for (const [role, pal] of Object.entries({ skin: Object.fromEntries(['pale', 'light', 'tan', 'brown', 'dark'].map((n) => [n, data.colours.skin?.[n]]).filter((x) => x[1])), hair: data.colours.hair, iris: data.colours.iris, shirt: data.colours.shirt })) { const v = Object.values(pal ?? {}); if (v.length) f.colours[role] = v[rnd(v.length)]; }
  return finish(ctx, `I drew a new face: ${describeFace(f, data)}.`);
}

/** The wink of the animations is an expression of the drawn face. */
export function faceAnimate(ctx, { anim } = {}) {
  if (!/wink|blink/.test(String(anim ?? ''))) return undefined;
  return faceMood(ctx, { mood: 'wink' });
}

/** Handing over from the DiceBear operations: what to do for each of them while the face is shown ({ r } an answer; undefined: carry on as before). */
export const FACE_DELEGATES = {
  setPart: faceSetPart, setPartUnknown: faceSetPart, step: faceStep, resizePart: faceAdjust, resetPart: (c, a) => faceReset(c, a), removePart: faceRemove, removeAll: faceRemoveAll,
  setColor: faceColour, setPartColored: (c, a) => {
    const part = a.part ?? words(a.value ?? a.text).map((x) => slotOfWord(getFaces(), x)).find(Boolean);
    const r = faceSetPart(c, { part, value: a.value, text: a.text, n: a.n });
    return r.status === 'supported' ? faceColour(c, { part, color: a.color }) : r;
  },
  shiftColor: faceShift, setMood: faceMood, checkMood: faceCheckMood, askMood: faceAskMood, listOptions: faceListOptions, askPart: faceAskPart, hasThing: faceHas, askWearing: faceDescribeSelf, describe: faceDescribeSelf,
  askParts: faceParts, animate: faceAnimate, surprise: faceSurprise, setCharacter: faceCharacter, pickCharacter: (c) => { faceOf(c).active = false; return undefined; }, reset: (c, a) => (a?.scope === 'all' ? undefined : faceReset(c, {})),
  listColors: (c, a) => { const data = getFaces(), role = roleOfPart(a?.part, data); return role ? ok(`My ${plain(a.part)} can be ${joinOr(Object.keys(data.colours[role === 'brow' || role === 'beard' ? 'hair' : role] ?? data.colours.any))}.`) : ok(`I can colour my ${joinAnd(['skin', 'hair', 'eyes', 'eyebrows', 'lips', 'glasses', 'shirt', 'hat', 'earrings', 'background'])}.`); },
  askColor: (c, a) => { const f = faceOf(c), data = getFaces(), role = roleOfPart(a?.part, data); return role ? ok(`My ${ROLE_NOUN[role] ?? plain(a.part)} ${['iris', 'glass', 'brow'].includes(role) ? 'are' : 'is'} ${colourName(data, role, f.colours[role === 'brow' && !f.colours.brow ? 'hair' : role === 'beard' && !f.colours.beard ? 'hair' : role])}.`) : undefined; },
};
/** "become a woman" while the face is shown: a preset of the faces; any other character leaves the face. */
export function faceCharacter(ctx, { kind, who, mood, with: add, without } = {}) {
  const k = String(kind ?? '').replace(/^old_/, '');
  const w = String(who ?? '').toLowerCase().replace(/^(?:a|an|the)_/, '');
  // a robot and an emoji are looks of the drawn face; the other characters are the classic DiceBear ones
  const name = kind === 'old_man' ? 'grandpa' : kind === 'old_woman' ? 'grandma' : KINDS[k] ? KINDS[k] : (['robot', 'emoji'].includes(KINDS[w]) ? KINDS[w] : null);
  if (name && getFaces().presets[name]) {
    if (add || without || mood) return faceDescribe(ctx, { words: `${name} ${mood ? String(mood).replace(/_/g, ' ') : ''} ${add ? `with ${String(add).replace(/_/g, ' ')}` : ''} ${without ? `without ${String(without).replace(/_/g, ' ')}` : ''}` });
    return facePreset(ctx, name);
  }
  if (!who && !kind) return undefined;
  faceOf(ctx).active = false;
  return undefined;
}
