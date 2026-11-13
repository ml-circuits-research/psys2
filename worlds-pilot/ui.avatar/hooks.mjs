// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar (pilot, spec 21): the hooks of the schema world. The acts (make, remove, change, place, ask, undo, redo, save, load) are read by the generated grammar; what an act
// DOES on a face is the face logic over the catalog k.faces (worlds/ui.avatar/facelogic.mjs, state.face), reached through `domain`. The roles are joined back into the words
// the face logic reads (it finds slot, variant, colour, feature, preset and mood by itself over the catalog data). Nothing here names a slot, a variant or an accessory.
import * as F from '../../worlds/ui.avatar/facelogic.mjs';
import { animate, dataOf, ensure, setName, askName } from './own.mjs';

const MOMENTS = new Set(['wink', 'nod', 'dance', 'wave', 'spin', 'jump', 'bounce', 'wiggle', 'blink']);
const SIZE = /^(bigger|larger|longer|wider|smaller|tinier|shorter|narrower)$/;
const words = (r, keys) => keys.map((k) => r[k]).filter(Boolean).join(' ');
const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
const moment = (r) => wordsOf(r.thing).find((w) => MOMENTS.has(w));
const SELF = /^(?:yourself|urself|myself|me|you|the avatar|the face|your face|ur face|it)$/i;
/** Runs a face-logic function with the catalog data (or the bundled default face). */
const W = (fn) => (ctx, r) => { ensure(ctx); return fn(ctx, r, dataOf(ctx)); };

export const hooks = {
  domain: {
    make: (ctx, r) => {
      if (r.mode === 'random') return W((c, q, d) => F.faceSurprise(c, {}, d))(ctx, r);
      const m = moment(r); if (m) return animate(ctx, { anim: m });
      if (r.mode === 'bare') return W((c, q, d) => F.faceBare(c, { words: words(q, ['thing']) }, d))(ctx, r);
      return W((c, q, d) => F.faceAdd(c, { words: words(q, ['value', 'thing']) }, d))(ctx, r);
    },
    remove: (ctx, r) => (r.mode === 'all' ? W((c, q, d) => F.faceReset(c, {}, d))(ctx, r) : W((c, q, d) => F.faceRemove(c, { words: words(q, ['thing']) }, d))(ctx, r)),
    change: (ctx, r) => {
      if (/^name$/i.test(r.attribute ?? '')) return setName(ctx, { name: r.value });
      return W((c, q, d) => {
        const dir = { other: 'different', next: 'next', prev: 'previous' }[q.mode];
        if (dir) return F.faceChange(c, { dir, words: words(q, ['thing']) }, d);
        if (q.mode === 'be') return F.faceRestyle(c, { words: words(q, ['value']) }, d);
        if (q.mode === 'more' || q.mode === 'less') return F.faceResize(c, { words: words(q, ['thing']), dir: SIZE.test(q.value ?? '') ? q.value : q.mode === 'less' ? 'smaller' : 'bigger' }, d);
        if (!q.thing || SELF.test(String(q.thing).trim())) return F.faceRestyle(c, { words: `face ${q.value ?? ''}` }, d);   // "paint yourself green", "make yourself happy"
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
