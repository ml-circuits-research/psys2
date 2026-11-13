// SPDX-License-Identifier: AGPL-3.0-only
// art.draw (pilot, spec 21 and 23): the hooks of the schema world. The acts (make, remove, change, place, group, pick, ask, copy, undo, redo, save, send) are read by the generated
// grammar; what an act DOES on the picture is the scene of worlds/art.draw (ops.mjs: the scene operations, the noun-phrase resolution, the placement over the space module; scene.mjs: the
// renderer's geometry and the drawing from facts). The roles of an act are joined back into the words those operations read. Nothing here names a kind, a colour or a part: kinds and
// stand-ins come from the knowledge catalog through the board (`registerKnown`), colours from the renderer's palette, places and layouts from the space module.
import * as D from '../../worlds/art.draw/ops.mjs';
import * as space from '../../worlds/space/space.mjs';
import { splitThings } from '../../worlds/acts/acts.mjs';
import { partsOf, kindKey, kindName } from '../../worlds/art.draw/scene.mjs';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const TAIL = new Set(['there', 'here', 'now', 'please', 'pls', 'plz', 'thx', 'thanks', 'are', 'is', 'again', 'exactly', 'go']);   // words a role slot took that belong to the frame ("how many trees there are")
const words = (t) => { const w = String(t ?? '').toLowerCase().replace(/_/g, ' ').replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter(Boolean); while (w.length > 1 && TAIL.has(w.at(-1))) w.pop(); return w; };
const PREP = new Set(['with', 'in', 'on', 'at', 'under', 'over', 'next', 'near', 'beside', 'by', 'above', 'below', 'behind', 'between', 'inside', 'to', 'from', 'of', 'for', 'around', 'across', 'and']);
const DET = new Set(['a', 'an', 'the', 'another', 'my', 'this', 'that', 'one']);
const QUANTITY = new Set(['some', 'few', 'several', 'couple', 'many', 'lots', 'loads', 'bunch', 'plenty', 'more']);
const PRONOUN = /^(?:it|them|that|this|those|these|itself|him|her)$/i;
const rel = (r) => String(r.rel ?? '').replace(/_/g, ' ');
/** The thing role as the board reads a noun phrase; a place said with it ("the tree on the left") stays part of the phrase. */
export const tOf = (r) => [r.thing, r.place && r.rel ? `${rel(r)} ${r.place}` : ''].filter(Boolean).join(' ').trim();

/** "a big red house with a blue door next to the tree" -> the arguments of the board's add: count, quantity, up to three modifiers, the kind as said, the tail (parts and place). */
export function addArgs(r) {
  const w = words([r.m1, r.m2, r.thing].filter(Boolean).join(' '));
  const cut = w.findIndex((x, i) => i > 0 && PREP.has(x));
  const head = cut < 0 ? w : w.slice(0, cut), tail = cut < 0 ? [] : w.slice(cut);
  const a = {}; let i = 0;
  while (i < head.length - 1 && DET.has(head[i])) { budget.tick('draw.addArgs'); i++; }
  if (r.amount != null) a.n = String(r.amount);
  else if (/^\d+$/.test(head[i] ?? '') || Object.hasOwn(space.COUNTS, head[i] ?? '') && head[i] !== 'both') { a.n = /^\d+$/.test(head[i]) ? head[i] : String(space.COUNTS[head[i]]); i++; }
  else if (QUANTITY.has(head[i] ?? '') && i < head.length - 1) { a.q = head[i]; i++; }
  const mods = [];
  while (i < head.length - 1 && mods.length < 3 && (D.isShade(head[i]) || D.isColorWord(head[i]) || Object.hasOwn(D.SIZE_WORDS, head[i]) || Object.hasOwn(D.COMPARATIVES, head[i]))) { budget.tick('draw.addArgs'); mods.push(head[i++]); }
  mods.forEach((m, j) => { a[`m${j + 1}`] = m; });
  const kind = head.slice(i).join(' ') || head.at(-1) || '';
  a.kind = kind; a.kt = kind;
  a.where = [...tail, rel(r), r.place].filter(Boolean).join(' ');
  return a;
}
/** The words of a thing role as the board's count / where / select operations read them: the colour and size words and the kind. */
function kindArgs(r) {
  const a = addArgs({ thing: typeof r === 'string' ? r : r.thing, m1: r.value && D.isColorWord(words(r.value)[0]) ? r.value : undefined });
  return { m1: a.m1, m2: a.m2, kind: a.kind, kt: a.kt };
}

const COLOURWORDS = (ws) => ws.length > 0 && ws.every((x) => D.isShade(x) || D.isColorWord(x));
const FILL = new Set(['solid', 'filled', 'full', 'crayon', 'scribbled', 'empty', 'hollow', 'outline', 'outlined', 'unfilled', 'transparent']);
const TIMES = new Set(['night', 'nighttime', 'day', 'daytime', 'morning', 'daylight', 'sunny', 'noon', 'sunset', 'sunrise', 'dusk', 'dawn', 'evening', 'midnight', 'twilight', 'nite']);
const GROUNDS = (w) => Object.hasOwn(D.GROUND_WORDS, w) || w === 'ground' || w === 'floor';

/** The things of the picture for the session store (spec 23): each drawn thing with its kind, colour, size and place, and its parts in the 0-100 frame of the store. */
function thingsOf(ctx) {
  const s = ctx.state;
  return (s.objects ?? []).filter((o) => !o.tag).map((o) => {
    const key = kindKey(o), k = kindName(key);
    let parts = null;
    try { parts = partsOf(o) ?? null; } catch { parts = null; }
    return { key: o.id, kind: k, name: o.name ?? null, attrs: { ...(D.effectiveColor(o) ? { colour: D.effectiveColor(o) } : {}), size: Math.round(o.size), place: D.placePhrase(o) }, parts };
  });
}

/** DECLINE: a reading is the drawing board's when its words are things the board draws (a kind of its own or of the catalog, a part, the sky, the ground, "it") or when the sentence says "draw". */
function accepts({ action, mode, roles, text, state, kindWord }) {
  const act = String(action ?? '').split('.').pop();
  if (!['make', 'remove', 'change', 'place', 'group', 'pick', 'ask', 'copy'].includes(act)) return true;
  const said = roles.thing ?? roles.rest ?? '';
  if (act === 'ask' && ['describe', 'options'].includes(mode)) return true;
  if (act === 'ask' && !said && !roles.place) return false;
  if (!said) return true;
  const t = words(text).join(' ');
  if (act === 'make' && /^(?:please |can you |could you )?(?:draw|sketch|paint|doodle)\b/.test(t)) return true;
  const np = D.parseNP(said);
  if (D.drawingNP(np) || np.pron || np.special) return true;
  if (act === 'make') { const k = words(roles.thing).filter((x) => !DET.has(x) && !/^\d+$/.test(x)).at(-1); return !!k && (D.kindOfWord(k) != null || D.kindOfWord(k.replace(/s$/, '')) != null || kindWord?.(k) === true); }   // a word of the catalog vocabulary (the schema's kind lexicon) is a thing to draw even before the lookup found its picture
  return !!np.known && (state?.objects ?? []).length > 0;
}

export const hooks = {
  thingsOf,
  afterGroup: (st) => { st.prev = st.history.at(-1) ?? null; },   // one undo step per message: the picture before the newest step is the one the grouped step left
  accepts,
  referents: D.referents,
  know: { colour: (w) => D.isShade(w) || D.isColorWord(w) },
  domain: {
    make: (ctx, r) => {
      if (r.mode === 'random') return D.scene(ctx, {});
      if (!r.thing) return D.askKind(ctx, {});
      const np = D.parseNP([r.thing, r.place && /^(?:to|on|for)$/.test(rel(r)) ? `of ${r.place}` : ''].join(' '));   // "give the house a blue door", "add a black door to the house": a part of a thing of the picture
      if (np.part && (np.kind || r.place) && !(np.partKinds && !np.kind && !r.place)) return D.givePart(ctx, { t: np.partOf ? r.place : np.kind ?? r.place, color: np.color ?? undefined, part: np.part });
      const a = addArgs(r), last = words(a.kind).at(-1) ?? '';
      if (GROUNDS(last) && (!a.where || /^(?:on|in|to|at|under)\s+(?:the\s+)?(?:ground|floor|bottom)/.test(a.where))) return D.ground(ctx, { g: last });
      if (last === 'sky' && !a.where) return D.ground(ctx, { g: 'sky' });
      if (splitThings(r.thing).length < 2 && !D.kindOfWord(a.kind) && (!D.kindOfWord(last) || words(a.kind).length > 1) && !D.UNDRAWABLE.has(last.replace(/s$/, '')) && !/^(?:\d+|one|two|three)$/.test(last)) return D.add(ctx, { ...a, open: [a.m1, a.m2, a.m3, a.kind].filter(Boolean).join(' ') });   // a word the board does not draw: the catalog is asked, then a part of a thing of the picture ("add a third window"), else "I don't know how to draw X yet"
      return D.add(ctx, a);
    },
    remove: (ctx, r) => {
      if (r.mode === 'new') return D.newDrawing(ctx, {});
      if (r.mode === 'all') return D.clearEverything(ctx, {});
      const t = tOf(r);
      if (/^(?:everything|all|all of it|the picture|the drawing)$/i.test(t)) return D.clearEverything(ctx, {});
      if (PRONOUN.test(t)) return D.removeIt(ctx, {});
      return D.remove(ctx, { phrase: t });
    },
    change: (ctx, r) => {
      const t = tOf(r) || 'it', vw = words(r.value), v = vw.join(' ');
      if ((r.mode === 'more' || r.mode === 'less') && /^(?:please |can you |could you )?(?:i want |draw |make )?(?:a|an)\s/i.test(String(r.text ?? '').trim()) && r.value && !/\b(?:it|them)\b/.test(t)) return D.add(ctx, addArgs({ thing: `${r.value} ${r.thing}` }));   // "a bigger house": a new one, compared with the old
      if (r.mode === 'turn') {
        const tw = words(t); const how = []; while (tw.length > 1 && /^(?:around|over|back|round|upside|down|the|other|way|backwards|clockwise|counter|to|left|right|degrees|degree|\d+)$/.test(tw.at(-1))) how.unshift(tw.pop());
        return D.turn(ctx, { verb: words(r.text)[0], phrase: `${tw.join(' ')} ${[r.amount ? `${r.amount} degrees` : '', v, ...how].filter(Boolean).join(' ')}`.trim() });
      }
      if (vw.length === 1 && /^(?:twice|double|half)$/.test(vw[0])) return D.resize(ctx, { t, d: `${vw[0] === 'half' ? 'half' : 'twice'}_as_big` });
      if (r.mode === 'more' || r.mode === 'less') return D.resize(ctx, { t, d: D.COMPARATIVES[v] ? v : r.mode === 'more' ? 'bigger' : 'smaller', amt: words(r.amount).join('_') || undefined });
      if (/^(?:grass|sand|snow|sea|water)$/.test(v) && /ground|floor|^it$/.test(t)) return D.ground(ctx, { g: v });
      if (vw.length === 1 && TIMES.has(vw[0])) return D.setMood(ctx, { w: vw[0] });
      if (vw.length === 1 && FILL.has(vw[0])) return D.fillMode(ctx, { t, mode: vw[0] });
      if (vw.length === 1 && D.COMPARATIVES[vw[0]]) return D.resize(ctx, { t, d: vw[0] });
      if (vw.length === 1 && Object.hasOwn(D.SIZE_WORDS, vw[0])) return D.setSize(ctx, { t, s: vw[0] });
      if (COLOURWORDS(vw)) return D.recolor(ctx, { t, shade: D.isShade(vw[0]) && vw.length > 1 ? vw[0] : undefined, color: vw.at(-1) });
      return undefined;
    },
    place: (ctx, r) => {
      if (r.mode === 'layout') return D.spatial(ctx, { text: r.text });
      if (rel(r) === 'apart' && !r.place) return D.takeApart(ctx, { t: tOf({ thing: r.thing }) });
      if (rel(r) === 'together' && !r.place) return D.group(ctx, { t: r.thing, name: /\bas\s+(?:a\s+|an\s+|the\s+)?(.+?)\s*$/i.exec(String(r.text ?? ''))?.[1] });
      if (r.place && new RegExp(`\\b(?:a|an|another|some|\\d+|two|three|four|five)\\s+${String(r.thing ?? '').replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '\\s+')}`, 'i').test(String(r.text ?? ''))) return hooks.domain.make(ctx, r);   // "put a sun in the corner": an indefinite thing is a new one (the act `place` reread as `make`)
      return D.move(ctx, { phrase: [r.thing, r.amount, rel(r), r.amount2, r.place].filter(Boolean).join(' ').replace(/_/g, ' ') });
    },
    group: (ctx, r) => (r.mode === 'apart' ? D.takeApart(ctx, { t: tOf(r) }) : D.group(ctx, { t: tOf(r) })),
    pick: (ctx, r) => D.select(ctx, { t: tOf(r) }),
    copy: (ctx, r) => {
      const t = tOf(r) || 'it';
      const probe = D.parseNP(t);
      if (r.thing && probe.kind && probe.kind !== '*' && !(ctx.state.objects ?? []).some((o) => kindKey(o) === probe.kind || kindName(kindKey(o)) === kindName(probe.kind))) return D.add(ctx, addArgs({ thing: t }));   // nothing of that kind to copy: a new one
      return D.duplicate(ctx, { t, n: r.amount });
    },
    ask: (ctx, r) => {
      if (r.mode === 'count') return D.count(ctx, /^(?:everything|all|all things)$/.test(words(r.thing).join(' ')) ? { kind: 'thing', kt: 'thing' } : kindArgs(r));
      if (r.mode === 'where') return D.whereIs(ctx, kindArgs(r));
      if (r.mode === 'has' && r.value) return D.colorOfThing(ctx, { t: r.thing });
      if (r.mode === 'has') return D.exists(ctx, kindArgs(r));
      if (r.mode === 'describe') return D.describe(ctx, {});
      if (r.mode === 'options') return /colou?r|shade|paint|crayon/.test(String(r.thing ?? '')) ? D.colors(ctx, {}) : D.help(ctx, {});
      if (r.mode === 'what' && r.thing && /^colou?r$/.test(String(r.attribute ?? ''))) return D.colorOfThing(ctx, { t: tOf(r) });
      if (r.mode === 'what' && r.place && /^(?:next to|near|beside|by|around|close to)$/.test(rel(r))) return D.whatsNear(ctx, { t: r.place });
      if (r.mode === 'what' && r.place) return D.spatial(ctx, { text: r.text });
      return undefined;   // why, last: the generic executor
    },
    undo: (ctx) => D.undo(ctx, {}),
    redo: (ctx) => D.redo(ctx, {}),
    save: (ctx, r) => D.save(ctx, { f: r.value }),
  },
};
