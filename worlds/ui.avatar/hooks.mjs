// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar (spec 21): the hooks of the schema world. The acts (make, remove, change, place, ask, undo, redo, save, load) are read by the generated grammar; what an act
// DOES on a face is the face logic over the catalog k.faces (worlds/ui.avatar/facelogic.mjs, state.face), reached through `domain`. The roles are joined back into the words
// the face logic reads (it finds slot, variant, colour, feature, preset and mood by itself over the catalog data). Nothing here names a slot, a variant or an accessory.
import * as F from './facelogic.mjs';
import { DEFAULT_FACE } from './default-face.mjs';
import { animate, dataOf, ensure, setName, askName } from './own.mjs';

const MOMENTS = new Set(['wink', 'nod', 'dance', 'wave', 'spin', 'jump', 'bounce', 'wiggle', 'blink']);
const SIZE = /^(bigger|larger|longer|wider|smaller|tinier|shorter|narrower)$/;
const words = (r, keys) => keys.map((k) => r[k]).filter(Boolean).join(' ');
const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
const moment = (r) => wordsOf(r.thing).find((w) => MOMENTS.has(w));
const SELF = /^(?:yourself|urself|myself|me|you|the avatar|the face|your face|ur face|it)$/i;
const PRONOUN = /^(?:it|them|that|this|those|these)$/i;
/** The focus (what "it" is): the last part talked about, kept in the world state; a pronoun in the thing role is that part. */
const focused = (ctx, r) => (r.thing && PRONOUN.test(String(r.thing).trim()) && ctx.state.face?.lastThing ? { ...r, thing: ctx.state.face.lastThing } : r);
const remember = (ctx, r) => { const t = String(r.thing ?? '').trim(); if (t && !SELF.test(t) && !PRONOUN.test(t) && ctx.state.face) ctx.state.face.lastThing = t; };   // inside state.face: the keys of the legend are what the session keeps
/** Two acts in one sentence ("an angry boy": the preset boy, then the expression angry): each clause of the words that is a preset or an expression is one act; the replies are joined. */
function severalActs(c, text, d) {
  const cl = F.clausesOf(d, F.tokens(text)).filter((x) => x.preset || x.mood);
  if (cl.length < 2) return null;
  const f = F.faceOf(c, d), n = f.history.length;
  const outs = [...cl.filter((x) => x.preset), ...cl.filter((x) => !x.preset)].map((x) => (x.preset ? F.facePreset(c, x.preset, d) : F.faceMood(c, { mood: x.mood }, d)));
  if (f.history.length > n + 1) f.history.splice(n + 1);   // several acts, ONE undo step: the snapshot before the first one is the only one kept
  return { status: outs.every((o) => o?.status === 'supported') ? 'supported' : (outs.find((o) => o?.status !== 'supported')?.status ?? 'unsupported'), value: outs.map((o) => o?.value ?? o?.note).filter(Boolean).join(' ') };
}
/** Runs a face-logic function with the catalog data (or the bundled default face). */
const W = (fn) => (ctx, r) => { ensure(ctx); return fn(ctx, r, dataOf(ctx)); };

/** The things of the face for the session store (spec 23): the face as one composite thing (parts in the 0-100 frame, colours resolved) and each worn optional slot (hat, glasses ...). */
function thingsOf(ctx) {
  const f = ctx.state.face, d = dataOf(ctx);
  if (!f || !d?.slots) return [];
  const rgb = (p) => { const g = String(p.tint ?? '').replace(/_shade$/, ''), c = d.colours?.[g]?.[f.colours?.[g]]; return c ? { ...p, rgb: String(p.tint).endsWith('_shade') ? c.shade : c.rgb } : p; };
  const partsOf = (slot) => (slot.variants.find((v) => v.name === f.slots[slot.name])?.parts ?? []).map((p) => ({ ...rgb(p), z: (slot.z ?? 0) * 10 + (p.z ?? 0) }));
  const worn = d.slots.filter((s) => f.slots[s.name] && f.slots[s.name] !== 'none');
  const out = [{ key: 'face', kind: 'face', name: ctx.state.name || null, attrs: { ...(f.expression ? { feeling: f.expression } : {}), ...(f.colours ?? {}) }, parts: worn.flatMap(partsOf) }];
  for (const s of worn.filter((x) => x.optional)) out.push({ key: s.name, kind: s.name, name: null, attrs: { variant: f.slots[s.name], ...(f.paint?.[s.name] ? { colour: f.paint[s.name] } : {}) }, parts: partsOf(s) });
  return out;
}

/** DECLINE (spec 21): the words of a reading must be of a face (a slot, a variant, a preset, an expression) or of the stage (a moment) or about the avatar itself; "draw a house" is not, so the next world reads it. */
function accepts({ action, mode, roles, state, claim, tab, text }) {
  const said0 = String(text ?? '').toLowerCase();
  // a claim needs an explicit word for this world in the sentence itself: "my name is", "who are you", "I am" are not the avatar's unless the sentence says yourself / your / the avatar / the face
  if (claim) return !text || /\b(yourself|your|urself|ur|the avatar|the robot|the face|this avatar)\b/.test(said0);   // the sentence says "yourself" / "the avatar" itself: it is about this world whatever the other words are ("I cannot look scared yet" is its answer)
  const act = String(action ?? '').split('.').pop();
  if (['undo', 'redo'].includes(act)) return true;
  if (act === 'save') return /\b(?:face|avatar|yourself|myself)\b/.test(said0) || /^(?:please\s+)?(?:save|store|keep|remember)\s+(?:this|it|me)\b/.test(said0);   // "save this as Grandma", "save this face as X"; "write down milk" and "remember that I am 34" are not
  if (['random', 'all', 'describe', 'state'].includes(mode)) return true;   // no thing is said: "surprise me", "reset", "describe yourself"
  if (['why', 'last'].includes(mode)) return false;                        // the discourse layer explains what was done; the avatar does not take every why
  if (/^name$/i.test(roles.attribute ?? '') || mode === 'what' && !roles.thing && !roles.attribute) return true;   // the name of the avatar
  const said = (act === 'place' ? [roles.thing] : [roles.pre, roles.thing, roles.value, roles.attribute, roles.rest]).filter(Boolean).join(' ');
  if (!said) return true;
  if (act === 'load') { const k = Object.keys(state?.face?.saved ?? {}); if (!(k.some((n) => said.toLowerCase().includes(n)) || F.clausesOf(DEFAULT_FACE, F.tokens(said)).some((c) => c.preset))) return false; }   // "open the weather tab" is not a face
  if (roles.thing && PRONOUN.test(String(roles.thing).trim()) && state?.face?.lastThing && F.read(DEFAULT_FACE, F.tokens(said)).some((m) => m.type === 'colour' || m.type === 'feature' || m.type === 'slot')) return 'focus';   // "make it red" right after the hat: the avatar holds the focus, it does not yield
  if (PRONOUN.test(said.trim()) || SELF.test(said.trim())) return true;
  if (roles.thing && SELF.test(String(roles.thing).trim()) && !roles.value) return true;
  if (wordsOf(said).some((w) => MOMENTS.has(w))) return true;
  const saved = Object.keys(state?.face?.saved ?? {});
  if (saved.some((k) => said.toLowerCase().includes(k))) return true;        // "be Grandma": a face the user saved
  // most of the words must be face words (a slot, a variant, a colour, a feature, a preset, an expression): "Place a medium white ellipse named Cloud at 198, 98" has two of seven
  const read = F.read(DEFAULT_FACE, F.tokens(said)), known = read.filter((m) => m.type !== 'word' && m.type !== 'neg').length, unknown = read.filter((m) => m.type === 'word').length;
  if (known < unknown || ((act === 'ask' || act === 'place' || act === 'remove') && unknown > 0)) return false;   // a question about the face uses only face words
  if (roles.thing && PRONOUN.test(String(roles.thing).trim()) && state?.face?.lastThing && read.some((m) => m.type === 'colour' || m.type === 'feature')) return 'focus';   // "make it red" right after the hat
  const cl = F.clausesOf(DEFAULT_FACE, F.tokens(said));
  return cl.some((c) => c.slots.length || c.preset || c.mood || (act !== 'ask' && c.variant?.length) || (c.colours?.length && (!roles.thing || SELF.test(String(roles.thing).trim()) || (PRONOUN.test(String(roles.thing).trim()) && state?.face?.lastThing))));
}

export const hooks = {
  thingsOf,
  accepts,
  domain: {
    make: (ctx, r0) => {
      const r = focused(ctx, r0);
      if (r.mode === 'random') return W((c, q, d) => F.faceSurprise(c, {}, d))(ctx, r);
      const m = moment(r); if (m) return animate(ctx, { anim: m });
      if (r.mode === 'bare') return W((c, q, d) => F.faceBare(c, { words: words(q, ['pre', 'thing']) }, d))(ctx, r);
      return W((c, q, d) => F.faceAdd(c, { words: words(q, ['value', 'thing']) }, d))(ctx, r);
    },
    remove: (ctx, r0) => { const r = focused(ctx, r0); return (r.mode === 'all' ? W((c, q, d) => F.faceReset(c, {}, d))(ctx, r) : W((c, q, d) => F.faceRemove(c, { words: words(q, ['thing']) }, d))(ctx, r)); },
    change: (ctx, r0) => {
      const r = focused(ctx, r0);
      if (/^name$/i.test(r.attribute ?? '')) return setName(ctx, { name: r.value });
      return W((c, q, d) => {
        const dir = { other: 'different', next: 'next', prev: 'previous' }[q.mode];
        if (dir) return F.faceChange(c, { dir, words: words(q, ['thing']) }, d);
        if (q.mode === 'be') return severalActs(c, words(q, ['value']), d) ?? F.faceRestyle(c, { words: words(q, ['value']) }, d);
        if (q.mode === 'more' || q.mode === 'less') return F.faceResize(c, { words: words(q, ['thing']), dir: SIZE.test(q.value ?? '') ? q.value : q.mode === 'less' ? 'smaller' : 'bigger' }, d);
        if (!q.thing || SELF.test(String(q.thing).trim())) return severalActs(c, q.value ?? '', d) ?? F.faceRestyle(c, { words: `face ${q.value ?? ''}` }, d);   // "paint yourself green", "make yourself happy"
        const cl = F.clausesOf(d, F.tokens(q.value ?? ''));
        if (cl.some((x) => x.colours.length) && !cl.some((x) => x.slots.length)) return F.faceColour(c, { words: words(q, ['thing', 'value']) }, d);
        if (SIZE.test(q.value ?? '')) return F.faceResize(c, { words: words(q, ['thing']), dir: q.value }, d);
        return F.faceAdd(c, { words: words(q, ['value', 'thing']) }, d);   // "change the hat to a crown"
      })(ctx, r);
    },
    place: W((c, q, d) => F.faceMove(c, { words: words(q, ['thing', 'rel']) }, d)),
    ask: (ctx, r) => {
      if (r.mode === 'what' && /^name$/i.test(r.attribute ?? '')) return askName(ctx);
      if (r.mode === 'has') return W((c, q, d) => F.faceHas(c, { words: words(q, ['thing']) }, d))(ctx, r);
      if (r.mode === 'options') return W((c, q, d) => (q.thing ? (/\bfaces?\b/.test(q.thing) ? F.faceList(c, {}, d) : F.faceWhich(c, { words: q.thing }, d)) : F.faceParts(c, {}, d)))(ctx, r);
      if (r.mode === 'state') return W((c, q, d) => F.faceAskMood(c, {}, d))(ctx, r);
      if (r.mode === 'describe') return W((c, q, d) => F.faceSelf(c, {}, d))(ctx, r);
      return undefined;   // count, why, last, what at a place: the generic executor
    },
    undo: W((c, q, d) => F.faceUndo(c, {}, d)),
    redo: W((c, q, d) => F.faceRedo(c, {}, d)),
    save: W((c, q, d) => F.faceSave(c, { name: q.value }, d)),
    load: W((c, q, d) => F.faceLoad(c, { name: q.value }, d)),
  },
};

// the focus: what a make or a change talked about is what "it" means next
for (const act of ['make', 'change']) { const f = hooks.domain[act]; hooks.domain[act] = (ctx, r) => { const out = f(ctx, r); remember(ctx, focused(ctx, r)); return out; }; }
