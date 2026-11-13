// SPDX-License-Identifier: AGPL-3.0-only
// art.draw (pilot, spec 21 and 23): the hooks of the schema world. The acts (make, remove, change, place, group, pick, ask, copy, undo, redo, save, send) are read by the generated
// grammar; what an act DOES on the picture is the scene of worlds/art.draw (ops.mjs: the scene operations, the noun-phrase resolution, the placement over the space module; scene.mjs: the
// renderer's geometry and the drawing from facts). The roles of an act are joined back into the words those operations read. Nothing here names a kind, a colour or a part: kinds and
// stand-ins come from the knowledge catalog through the board (`registerKnown`), colours from the renderer's palette, places and layouts from the space module.
import * as D from './engine.mjs?v=c88a00a02d';
import * as space from '../space/space.mjs?v=f98ca4dd42';
import { splitThings } from '../acts/acts.mjs?v=44954ee850';
import { partsOf, kindKey, kindName } from './scene.mjs?v=94b5cebde0';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const TAIL = new Set(['there', 'here', 'now', 'added', 'drawn', 'too', 'also', 'please', 'pls', 'plz', 'thx', 'thanks', 'are', 'is', 'again', 'exactly', 'go']);   // words a role slot took that belong to the frame ("how many trees there are")
const words = (t) => { const w = String(t ?? '').toLowerCase().replace(/_/g, ' ').replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter(Boolean); while (w.length > 1 && TAIL.has(w.at(-1))) { budget.tick('draw.words'); w.pop(); } return w; };
const PREP = new Set(['with', 'in', 'on', 'at', 'under', 'over', 'next', 'near', 'beside', 'by', 'above', 'below', 'behind', 'between', 'inside', 'to', 'from', 'of', 'for', 'around', 'across', 'and']);
const DET = new Set(['a', 'an', 'the', 'another', 'my', 'this', 'that', 'one']);
const QUANTITY = new Set(['some', 'few', 'several', 'couple', 'many', 'lots', 'loads', 'bunch', 'plenty', 'more']);
const PRONOUN = /^(?:it|them|that|this|those|these|itself|him|her)$/i;
const rel = (r) => String(r.rel ?? '').replace(/_/g, ' ');
/** The thing role as the board reads a noun phrase; a place said with it ("the tree on the left") stays part of the phrase. */
export const tOf = (r) => [r.thing, r.place && r.rel ? `${rel(r)} ${r.place}` : ''].filter(Boolean).join(' ').trim();

/** "a big red house with a blue door next to the tree" -> the arguments of the board's add: count, quantity, up to three modifiers, the kind as said, the tail (parts and place). */
export function addArgs(r) {
  const w = words([r.m1, r.m2, r.thing].filter(Boolean).join(' ').replace(/\b(couple|bunch|lot|lots|loads|plenty|few) of\b/gi, '$1'));   // "a couple of stars": the quantity word, no preposition
  const cut = w.findIndex((x, i) => i > 0 && PREP.has(x));
  const head = cut < 0 ? w : w.slice(0, cut), tail = cut < 0 ? [] : w.slice(cut);
  const a = {}; let i = 0;
  while (i < head.length - 1 && DET.has(head[i])) { budget.tick('draw.addArgs'); i++; }
  if (r.amount != null) a.n = String(r.amount);
  else if (/^\d+$/.test(head[i] ?? '') || Object.hasOwn(space.COUNTS, head[i] ?? '') && head[i] !== 'both') { a.n = /^\d+$/.test(head[i]) ? head[i] : String(space.COUNTS[head[i]]); i++; }
  else if (head[i] === 'couple' && i < head.length - 1) { a.n = '2'; i++; }
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
// In the open tab the board holds the focus of the dialogue: a reading it accepts does not yield to another world's reading without free text ("draw a sea" is not a chart palette).
const accepts = (info) => { const v = acceptsWords(info); return v === true && info.tab === 'art.draw' ? 'focus' : v; };
function acceptsWords({ action, mode, roles, text, state, kindWord }) {
  const act = String(action ?? '').split('.').pop();
  if (!['make', 'remove', 'change', 'place', 'group', 'pick', 'ask', 'copy'].includes(act)) return true;
  const said = roles.thing ?? roles.rest ?? '';
  if (act === 'ask' && ['describe', 'options'].includes(mode)) return true;
  if (act === 'ask' && !said && !roles.place) return false;
  if ((act === 'make' || act === 'change') && !roles.place && TIMES.has(words(said).at(-1) ?? '') && words(said).every((x) => TIMES.has(x) || DET.has(x) || /^(?:it|its|so|be|bright|nice|sunny|a|the)$/.test(x))) return true;   // "make it a sunny day", "change it so its day"
  if (act === 'change' && /^(?:scene|mood|time|sky|picture|drawing|background)$/.test(words(said).at(-1) ?? '') && TIMES.has(words(roles.value).at(-1) ?? '')) return true;   // "change the scene to dawn"
  if (!said) return true;
  const t = words(text).join(' ');
  if (act === 'make' && /^(?:please |can you |could you )?(?:draw|sketch|paint|doodle)\b/.test(t)) return true;
  const np = D.parseNP(said);
  if (D.drawingNP(np) || np.pron || np.special || (PRONOUN.test(words(said)[0] ?? '') && act !== 'make')) return true;   // "it upside down": a pronoun first, the rest is how
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
      if (r.rel === 'to' && PRONOUN.test(String(r.place ?? '').trim())) r = { ...r, rel: undefined, place: undefined };   // "it needs a rainbow": the pronoun is no owner, the sentence is a wish
      if (r.mode === 'random') return D.scene(ctx, {});
      if (r.pre && r.mode === 'bare' && !/\b(?:between|under|over|above|below|behind|next to|beside|near|in front of|left|right|top|bottom)\b/.test(words(r.pre).join(' '))) {   // a bare kind after words the form did not name: "yo could you sketch a purple" -> the colour and size words are the modifiers
        const pw = words(r.pre), mods = pw.filter((x) => D.isShade(x) || D.isColorWord(x) || Object.hasOwn(D.SIZE_WORDS, x)), n = pw.find((x) => /^\d+$/.test(x));
        if (mods.length || n) r = { ...r, m1: r.m1 ?? mods[0], m2: r.m2 ?? mods[1], amount: r.amount ?? n };
      }
      if (r.pre && r.mode === 'bare') {   // "left side for the house", "cat between the two trees": a place said before the kind
        const pre = words(r.pre).join(' '), k = words(r.thing).join(' ');
        const side = /^(?:the )?(left|right|top|bottom)(?: side| corner)?(?: for| of)?(?: the)?$/.exec(pre);
        if (side) return D.move(ctx, { phrase: `${k} on the ${side[1]}` });
        if (/\b(?:between|under|over|above|below|behind|next to|beside|near|in front of)\b/.test(pre) && /\b(?:the|two|both)\s*$/.test(pre)) return D.move(ctx, { phrase: `${pre} ${k}` });
      }
      if (!r.thing) return D.askKind(ctx, {});
      const np = D.parseNP([r.thing, r.place && /^(?:to|on|for)$/.test(rel(r)) ? `of ${r.place}` : ''].join(' '));   // "give the house a blue door", "add a black door to the house": a part of a thing of the picture
      if (np.part && (np.kind || r.place) && !(np.partKinds && !np.kind && !r.place)) return D.givePart(ctx, { t: np.partOf ? r.place : np.kind ?? r.place, color: np.color ?? undefined, part: np.part });
      const a = addArgs(r), last = words(a.kind).at(-1) ?? '';
      // a modifier before a kind that is in the picture, with no verb and no "a" / number: "solid star", "big red house" is a change of that thing ("star outline only" ...)
      if (r.m1 && !r.amount && !/\b(?:draw|drawing|make|add|paint|sketch|doodle|create|give|gimme|get|whip|want|wanna|need|like|put|place|set|turn|show|sketching)\b/.test(words(r.text).join(' ')) && !DET.has(words(r.text)[0] ?? '') && !/^\d/.test(words(r.text)[0] ?? '') && (ctx.state.objects ?? []).some((o) => kindName(kindKey(o)) === last || kindKey(o) === last)) { const ch = hooks.domain.change(ctx, { ...r, mode: 'set', value: [r.m1, r.m2].filter(Boolean).join(' '), thing: r.thing }); if (ch) return ch; }
      if (GROUNDS(last) && (!a.where || /^(?:on|in|to|at|under)\s+(?:the\s+)?(?:ground|floor|bottom|everything|picture|drawing)/.test(a.where))) return D.ground(ctx, { g: last });
      if (last === 'sky' && !a.where) return D.ground(ctx, { g: 'sky' });
      if (TIMES.has(last) && !a.where && words(a.kind).every((x) => TIMES.has(x) || DET.has(x) || x === 'bright' || x === 'it' || x === 'its' || x === 'be')) return D.setMood(ctx, { w: words(a.kind).find((x) => TIMES.has(x) && x !== 'day') ?? last });   // "make it a sunny day"
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
      if (r.mode === 'turn') {   // "turn it into sunset", "turn the house into a tiny one": the turn verb of a change of value
        const into = /\b(?:turn|turns|turned)\s+(.+?)\s+into\s+(?:an?\s+|the\s+)?(.+?)\s*$/.exec(words(r.text).join(' '));
        if (into) r = { ...r, mode: 'set', thing: into[1], value: into[2].replace(/\s+(?:one|size|sized)$/, ''), place: undefined, rel: undefined };
      }
      const t = tOf(r) || 'it', vw = words(r.value), v = vw.join(' ');
      if (r.mode === 'same') return D.matchSize(ctx, { t, o: words(r.value).join(' ') });
      if ((r.mode === 'more' || r.mode === 'less') && /^(?:please |can you |could you )?(?:i want |draw |make )?(?:a|an)\s/i.test(String(r.text ?? '').trim()) && r.value && !/\b(?:it|them)\b/.test(t)) return D.add(ctx, addArgs({ thing: `${r.value} ${r.thing}` }));   // "a bigger house": a new one, compared with the old
      if (r.mode === 'turn') {
        const tw = words(t); const how = []; while (tw.length > 1 && /^(?:around|over|back|round|upside|down|the|other|way|backwards|clockwise|counter|to|left|right|degrees|degree|\d+)$/.test(tw.at(-1))) { budget.tick('draw.how'); how.unshift(tw.pop()); }
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
      { // the thing the generic reading took may carry the noise of the sentence: "house needs to be on the" (+ left), "house over" (+ to the right)
        const tw = words(r.thing); const cut = tw.findIndex((x, i) => i > 0 && /^(?:needs|need|should|must|has|so|which|that)$/.test(x));
        const onThe = cut >= 0 && /\bon\b/.test(tw.slice(cut).join(' ')) || /\bon (?:the)?$/.test(tw.join(' '));
        const head = (cut >= 0 ? tw.slice(0, cut) : tw); while (head.length > 1 && /^(?:over|on|in|at|the|to|be|a|an|it|its|is|go|goes)$/.test(head.at(-1))) { budget.tick('draw.head'); head.pop(); }
        if (head.join(' ') !== tw.join(' ') && head.length) r = { ...r, thing: head.join(' '), ...(onThe && !r.place && rel(r) && /^(?:left|right|top|bottom|up|down)$/.test(rel(r)) ? { place: `the ${rel(r)}`, rel: 'on' } : {}) };
      }
      { const tw = words(r.thing); const last = tw.at(-1) ?? ''; if (GROUNDS(last) && tw.length <= 2 && /^(?:ground|floor|bottom|everything|picture|drawing)$/.test(words(r.place).at(-1) ?? '') && !(ctx.state.objects ?? []).some((o) => kindName(kindKey(o)) === last)) return D.ground(ctx, { g: last }); }   // "I need water on the floor": the ground, not a thing to move
      if (r.mode === 'layout') return D.spatial(ctx, { text: r.text });
      if (!r.place && !rel(r) && /(?:^|\s)(?:place|put|set|add)\s+(?:a|an|another|some|\d+|two|three|four|five)\s/.test(words(r.text).join(' ') + ' ')) return hooks.domain.make(ctx, r);   // "place a road": no place said, an indefinite thing: it is drawn
      if (rel(r) === 'apart' && !r.place) return D.takeApart(ctx, { t: tOf({ thing: r.thing }) });
      if (rel(r) === 'together' && !r.place) return D.group(ctx, { t: r.thing, name: /\bas\s+(?:a\s+|an\s+|the\s+)?(.+?)\s*$/i.exec(String(r.text ?? ''))?.[1] });
      if (r.place && new RegExp(`\\b(?:a|an|another|some|\\d+|two|three|four|five)\\s+${String(r.thing ?? '').replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '\\s+')}`, 'i').test(String(r.text ?? ''))) return hooks.domain.make(ctx, r);   // "put a sun in the corner": an indefinite thing is a new one (the act `place` reread as `make`)
      if (rel(r) === 'over' && /^(?:to|towards)\b/.test(String(r.place ?? ''))) r = { ...r, rel: undefined, place: String(r.place).replace(/^(?:to|towards)\s+(?:the\s+)?/, '') };   // "slide it over to the right"
      if (!r.place && /^(?:left|right)$/.test(rel(r))) r = { ...r, rel: `to the ${rel(r)}` };   // a bare direction is "to the left"
      return D.move(ctx, { phrase: [r.thing, r.amount, rel(r), r.amount2, r.place].filter(Boolean).join(' ').replace(/_/g, ' ') });
    },
    group: (ctx, r) => (r.mode === 'apart' ? D.takeApart(ctx, { t: tOf(r) }) : D.group(ctx, { t: tOf(r) })),
    pick: (ctx, r) => (r.mode === 'none' ? D.deselect(ctx, {}) : D.select(ctx, { t: tOf(r) })),
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
    save: (ctx, r) => D.save(ctx, { f: words(r.value).filter((x) => !DET.has(x)).at(-1) }),
  },
};
