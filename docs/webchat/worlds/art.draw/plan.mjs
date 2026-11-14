// SPDX-License-Identifier: AGPL-3.0-only
// art.draw executes PLANS (specs/24-plans-from-knowledge.md): a request that is a goal ("draw a farm", "a person on the swing", "a family photo", "a doctor", "a cup on the table") is not composed by
// code in this world. The methods are knowledge (k.procedures), the planner is the library's (src/plan/host.mjs); what is left here is what only the board can do: run one act of a plan on the
// picture (make = the board's add, place at an anchor or a slot = the boxes k.layouts and k.wearables state, in the frame of the thing), all or nothing, one undo step, and say it in words.
// No kind, scene, role, anchor or slot is named in this file.
import * as D from './engine.mjs?v=5c10fe69c0';
import { kindKey, kindName, W, H } from './scene.mjs?v=0882bbcd68';
import { planHostOf } from '../../lib/plan/host.mjs?v=30c3a981b6';
import { knowsKind } from '../../lib/knowledge/open-words.mjs?v=3eed01f9f5';
import { COUNTS } from '../space/space.mjs?v=f98ca4dd42';

const REL = { on: 'on', 'on top of': 'on', onto: 'on', in: 'in', inside: 'in', into: 'in', around: 'around', at: 'at' };
const DET = new Set(['a', 'an', 'the', 'some', 'my', 'this', 'that']);
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter((w) => w && !DET.has(w)).join(' ');
const sing = (w) => w.replace(/ies$/, 'y').replace(/(?:ses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1');
const plural = (kind, n) => (n === 1 ? kind : D.pluralOfKind(kind, n));
const an = (k) => (/[^s]s$/.test(k) ? k : `${/^[aeiou]/.test(k) ? 'an' : 'a'} ${k}`);   // "boots" take no article
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** The catalog words that name a goal: the scenes, the roles of people and the named tasks (the same `catalog=` lines as the kinds lexicon of schema.sop). */
const GOAL_CATALOGS = ['k.wearables/shards/wearables', 'k.people/shards/roles', 'k.scenes/shards/scenes', 'k.procedures/shards/tasks'];
/** True when the phrase (or its last word) is a goal word of the catalog: "farm", "doctor", "family photo". Synchronous (the vocabulary is loaded before the sentence is read). */
export const goalWord = (phrase) => { const w = norm(phrase).replace(/\s+for\s+(?:\d+|\w+)$/, (m) => (/^\d+$/.test(m.trim().split(' ')[1]) || Object.hasOwn(COUNTS, m.trim().split(' ')[1]) ? '' : m)).split(' ').filter(Boolean), tries = [w.join('_'), w.at(-1)]; return tries.some((x) => x && [x, sing(x)].some((y) => knowsKind(y, GOAL_CATALOGS))); };
const GROUND = new Set(['ground', 'sky', 'background', 'horizon']);

/** The goal of a reading, in the planner's terms, or null: `a` = the board's add arguments (kind, n, where), `r` = the act's roles. Pure. */
export function goalOf(act, a = {}, r = {}) {
  let kind = a.raw ? String(a.kind) : norm(a.kind ?? r.thing), count = null;
  const per = /^(.*\S)\s+for\s+(\d+|\w+)$/.exec(kind);   // "table setting for four": the number of people
  if (per && (/^\d+$/.test(per[2]) || Object.hasOwn(COUNTS, per[2]))) { kind = per[1]; count = /^\d+$/.test(per[2]) ? Number(per[2]) : COUNTS[per[2]]; }
  if (!kind || /^(?:it|them|one|things?|something)$/.test(kind)) return null;
  const rel = REL[String(r.rel ?? '').replace(/_/g, ' ')];
  const place = r.place ? norm(r.place) : '';
  // "a queen with a crown": "with" is no place but a second thing the first has; for a kind that is itself a goal (a role, a scene) the goal is that kind and `also` the thing it should have (the plan of the kind may already have it)
  if (String(r.rel ?? '') === 'with' && place && !a.raw && goalWord(kind) && !place.includes(' and ') && !place.includes(',')) return { act, roles: { kind, ...(Number(a.n ?? r.amount) > 1 ? { number: Number(a.n ?? r.amount) } : {}) }, also: place };
  const parts = /^(.*\S)\s+from\s+parts?$/.exec(kind);   // "a house from parts"
  if (parts) return { act, roles: { kind: parts[1], material: 'parts' } };
  const roles = { kind };
  if (/^from$/.test(String(r.rel ?? '')) && /^parts?$/.test(place)) { roles.material = 'parts'; return { act, roles }; }   // "build a house from parts"
  const n = Number(a.n ?? r.amount ?? count);
  if (n > 1) roles.number = n;
  if (place && rel) roles.place = { value: place, rel };
  else if (place || r.rel) return null;   // a place the plan has no relation for: the board's own reading places it
  return { act, roles };
}
/** The goal of a sentence by its own words when the roles do not give one ("set a table for four": the verb is a place verb to the reader): the words after the polite and drawing verbs. */
export function goalFromText(text) {
  const t = String(text ?? '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/^\s*(?:please|can you|could you)\s+/, '').replace(/^(?:draw|make|create|build|show|paint|sketch)\s+(?:me\s+)?/, '').replace(/\s+/g, ' ').trim();   // the user's words, determiners kept: the task names ("set a table") have them
  return t && t.split(' ').length <= 5 ? goalOf('make', { kind: t, raw: true }, {}) : null;
}
/** The things of the picture as the planner's live world: [{ id, kind }]. */
export const liveOf = (state) => (state?.objects ?? []).filter((o) => !o.tag).map((o) => ({ id: o.id, kind: String(kindName(kindKey(o))).toLowerCase().replace(/ /g, '_') }));
/** The words a goal can be found by in the catalog index (its keys). */
export const goalWords = (goal) => [goal.roles.kind, ...goal.roles.kind.split(' '), goal.roles.place?.value, goal.also].filter(Boolean).flatMap((w) => [w, sing(w)]);

/** The goal with its kind said as the knowledge names it ("group photo" is the "family photo" of k.procedures). */
export function canonGoal(ctx, goal) {
  const host = planHostOf(ctx.knowledge);
  return host?.ready() && goal.roles.kind ? { ...goal, roles: { ...goal.roles, kind: host.canonical(goal.roles.kind) } } : goal;
}
/** The second thing of "a queen with a crown", after the plan of the queen is done: the goal of that thing on the thing the plan made first, or null when the plan already made it (a queen wears a crown). */
export function alsoGoal(ctx, goal) {
  if (!goal.also) return null;
  const made = ctx.state.last ?? [], first = ctx.state.objects.find((o) => o.id === made[0]);
  if (!first || made.some((id) => String(kindName(kindKey(ctx.state.objects.find((o) => o.id === id) ?? {}))).toLowerCase() === goal.also)) return null;
  return { act: 'make', roles: { kind: goal.also, place: { value: String(kindName(kindKey(first))).toLowerCase().replace(/ /g, '_'), rel: 'on' } } };
}
/** The plan of a goal in this picture, or null (nothing loaded, no method fits, a role is missing). */
export function planFor(ctx, goal) {
  const host = planHostOf(ctx.knowledge);
  if (!host?.ready()) return null;
  const p = host.plan(goal, liveOf(ctx.state));
  return p && p.method && !p.refused && !p.asks?.length && p.requests.length ? { p, host } : null;
}
/** The kinds a plan makes (for the catalog to be asked before the board runs it, once). */
export const kindsOf = (p) => [...new Set(p.requests.filter((q) => q.action === 'make' && q.args.kind).map((q) => String(q.args.kind)))];

// ---- the geometry: boxes in the 0-100 frame of a thing (k.layouts anchors and slots, k.wearables places) ------------------------------------------------------
const boxOfFact = (f) => (f ? { x: +f.attrs.x[0], y: +f.attrs.y[0], w: +f.attrs.w[0], h: +f.attrs.h[0] } : null);
function frameBox(host, targetKind, names) {
  for (const name of [].concat(names)) { const f = frameBox1(host, targetKind, name); if (f) return f; }   // an anchor said as several names ("branch", "crown"): the first the thing has
  return null;
}
function frameBox1(host, targetKind, name) {
  const a = host.facts('k.layouts.anchor').find((f) => f.attrs.of?.[0] === targetKind && f.attrs.name?.[0] === name);
  if (a) return { box: boxOfFact(a), resting: true };
  const wp = host.facts('k.wearables.place').find((f) => f.attrs.name?.[0] === name);
  return wp ? { box: boxOfFact(wp), resting: false } : null;
}
const px = (b, box) => ({ x: b.x0 + (box.x / 100) * b.w, y: b.y0 + (box.y / 100) * b.h, w: (box.w / 100) * b.w, h: (box.h / 100) * b.h });
const clampXY = (o) => { const b = D.bbox(o); o.x = Math.round(Math.min(W - b.w / 2, Math.max(b.w / 2, o.x))); o.y = Math.round(Math.min(H - b.h / 2, Math.max(b.h / 2, o.y))); };

/** The kind the board draws for a kind of the plan the board cannot draw itself: the `drawing` of a role or kind of k.people ("doctor" is drawn as a person). */
const standIn = (host, kind) => ['k.people.role', 'k.people.kind'].flatMap((t) => host.facts(t)).find((f) => f.attrs.name?.[0] === kind && f.attrs.drawing?.[0])?.attrs.drawing[0] ?? null;

/** Runs a plan on the picture: one request, one undo step, all or nothing. Returns { status, value } like any operation of the board. */
export function runPlan(ctx, goal, { p, host }, said0) {
  let said = said0;
  return D.oneStep(ctx, `drew ${said0}`, (s) => {
    const ids = new Map(), made = [], placed = [], left = [], pending = new Map(), counts = new Map();
    const byId = (id) => { const real = ids.get(id) ?? id; return s.objects.find((o) => o.id === real); };
    const base = (k) => String(k).replace(/\s+/g, '_');
    const kindOf = (o) => String(kindName(kindKey(o))).replace(/_/g, ' ');
    const slots = new Map();   // group plan id -> { name, members: [plan ids], slot: Map(slot name -> [plan ids]) }
    for (const q of p.requests) {
      const a = q.args, list = (v) => [].concat(v ?? []);
      if (q.action === 'make') {
        const kind = String(a.kind), n = Number(a.number ?? 1) || 1, before = new Set(s.objects.map((o) => o.id));
        if (a.of && !byId(a.of)) { left.push(`${kind} (nothing to put it on)`); continue; }   // what it was for is not there: a step that depends on a step left out is left out
        const draw = (k) => (GROUND.has(a.place) && !a.rel && /^(?:grass|sand|snow|sea|water)$/.test(k) ? D.ground(ctx, { g: k }) : D.add(ctx, { ...(n > 1 ? { n: String(n) } : {}), kind: k, kt: k, where: '' }));
        let r = draw(kind);
        if (r?.status !== 'supported' && standIn(host, kind)) r = draw(standIn(host, kind));   // a doctor is drawn as a person
        const fresh = s.objects.filter((o) => !before.has(o.id) && !o.tag);
        if (r?.status !== 'supported' && !fresh.length) { left.push(`${an(kind)} (I cannot draw it yet)`); continue; }
        const nth = counts.get(base(kind)) ?? 0;
        fresh.forEach((o, i) => { ids.set(`${base(kind)}${nth + i + 1}`, o.id); made.push(o); });
        counts.set(base(kind), nth + Math.max(fresh.length, 1));
        if (!fresh.length) continue;
        const of = a.of ? byId(a.of) : null;
        if (of && a.rel === 'around') {   // around a thing: on a ring (an ellipse) about its centre, the front ones below it
          const b = D.bbox(of);
          fresh.forEach((o, i) => { const t = (2 * Math.PI * i) / fresh.length + Math.PI / 2, ob = D.bbox(o); o.x = b.cx + Math.cos(t) * (b.w / 2 + ob.w * 0.4); o.y = b.cy + Math.sin(t) * (b.h / 2 + ob.h * 0.3); o.z = (o.z ?? 0) + (Math.sin(t) > 0 ? 1 : -1); clampXY(o); });
        } else if (of && a.place) { for (const o of fresh) placeIn(o, of, a.place, a.rel); }
      } else if (q.action === 'place') {
        const items = list(a.thing).map((id) => byId(id)).filter(Boolean), of = a.of ? byId(a.of) : null;
        if (!items.length) { left.push(`${list(a.thing).join(' and ')} (not there)`); continue; }
        if (a.of && /^group/.test(String(a.of)) && slots.has(a.of)) { const g = slots.get(a.of); for (const id of list(a.thing)) { const arr = g.slot.get(a.place) ?? g.slot.set(a.place, []).get(a.place); arr.push(id); } continue; }
        if (!of || !a.place) { left.push(`${kindOf(items[0])} (nowhere to put it)`); continue; }
        for (const o of items) if (!placeIn(o, of, a.place, a.rel)) left.push(`${kindOf(o)} on the ${a.place} of the ${kindOf(of)}`);
      } else if (q.action === 'group') {
        const members = list(a.thing), gid = `group${slots.size + 1}`;
        slots.set(gid, { name: String(a.group ?? 'group'), members, slot: new Map() });
      } else left.push(`${q.action} (not a step of the drawing board)`);
    }
    function placeIn(o, of, name, rel) {
      const f = frameBox(host, String(kindName(kindKey(of))).replace(/_/g, ' '), name);
      if (!f?.box) return false;
      const b = D.bbox(of), at = px(b, f.box), ob = D.bbox(o);
      if (f.resting) { o.x = at.x + at.w / 2; o.y = at.y - ob.h / 2; o.z = Math.max(o.z ?? 0, of.z ?? 0) + 1; }   // rests on the line the anchor states
      else { const k = Math.min(2, Math.max(0.15, at.w / ob.w)); o.size = Math.max(4, Math.round(o.size * k)); o.x = at.x + at.w / 2; o.y = at.y + at.h / 2; o.z = Math.max(o.z ?? 0, of.z ?? 0) + 1; }
      clampXY(o);
      placed.push({ o, of, name });
      return true;
    }
    // the layouts: the slots' rows of a group, across a frame as wide as its members need, then the group itself (a thing of its own, taken apart like any other)
    for (const g of slots.values()) {
      const lay = host.facts('k.layouts.slot').filter((f) => f.attrs.layout?.[0] === g.name);
      const mem = g.members.map((id) => byId(id)).filter(Boolean);
      if (!mem.length) continue;
      const width = Math.min(W * 0.8, Math.max(260, mem.reduce((t, o) => t + D.bbox(o).w, 0) * 1.15)), tall = Math.max(...mem.map((o) => D.bbox(o).h));
      const frame = { x0: (W - width) / 2, y0: H * 0.5 - tall * 1.2, w: width, h: tall * 2.4 };
      for (const [name, idList] of g.slot) {
        const box = boxOfFact(lay.find((f) => f.attrs.name?.[0] === name));
        const row = idList.map((id) => byId(id)).filter(Boolean);
        if (!box || !row.length) continue;
        const at = px({ x0: frame.x0, y0: frame.y0, w: frame.w, h: frame.h }, box);
        row.forEach((o, i) => { const ob = D.bbox(o); o.x = at.x + (at.w * (i + 0.5)) / row.length; o.y = at.y + at.h - ob.h / 2; o.z = (o.z ?? 0) + Math.round(box.y); clampXY(o); });
      }
      s.last = mem.map((o) => o.id);
      const gr = D.group(ctx, { t: 'it', name: g.name });
      if (gr?.status !== 'supported') left.push(`the ${g.name} as one thing`); else placed.push({ group: g.name });
    }
    if (!made.length && !placed.length) return { status: 'unsupported', note: `I could not do that: ${andList([...new Set(left)])}.` };
    // the words: what was made (as many of each kind as there are), what was put where, what was left out
    const tally = new Map();
    for (const o of made) tally.set(kindOf(o), (tally.get(kindOf(o)) ?? 0) + 1);
    const made_ = [...tally].map(([k, n]) => (n === 1 ? an(k) : `${n} ${plural(k, n)}`));
    const putBy = new Map();   // the same kind put the same way is one phrase with its number
    for (const x of placed.filter((y) => y.of)) { const k = `${kindOf(x.o)}|${[].concat(x.name)[0]}|${kindOf(x.of)}`; putBy.set(k, (putBy.get(k) ?? 0) + 1); }
    const put = [...putBy].slice(0, 4).map(([k, n]) => { const [what, name, on] = k.split('|'); return `the ${n > 1 ? `${n} ${plural(what, n)}` : what} on the ${name} of the ${on}`; });
    const grouped = placed.filter((x) => x.group).map((x) => `They are one thing now: a ${x.group}.`);
    const pv = goal.roles.place?.value;
    const isPv = (id) => { const x = String(id ?? ''); if (x.replace(/\d+$/, '') === pv) return true; const o = byId(x); return !!o && kindOf(o).replace(/ /g, '_') === pv.replace(/ /g, '_'); };   // the place is a plan id ("swing1") or a thing of the picture
    if (pv && !p.requests.some((q) => (q.action === 'make' && q.args.kind === pv) || (q.action === 'place' && isPv(q.args.of)) || (q.action === 'make' && isPv(q.args.of)))) {   // the method has nothing to do with the place said: say so, do not claim it
      said = `${an(goal.roles.kind)}`;
      left.push(`putting it ${goal.roles.place.rel} the ${pv} (my knowledge has no way for that yet)`);
    }
    const lead = made.length ? `I drew ${said}: ${andList(made_)}.` : '';
    const left_ = left.length ? ` I left out ${andList([...new Set(left)])}.` : '';
    const how = put.length ? `${made.length ? ' ' : ''}I put ${andList(put)}.` : '';
    s.lastPlan = { goal, said, method: p.method, methods: p.methods, requests: p.requests, left: [...new Set(left)] };
    s.last = made.map((o) => o.id);
    const text = (`${lead}${how}${grouped.length ? ` ${grouped[0]}` : ''}${left_}` || `I arranged ${said}.`).trim();
    return { status: 'supported', value: text, note: text };
  });
}

/** The words of a place goal for the reply: "the girl on the swing". */
export const placeSaid = (r) => `the ${norm(r.said ?? r.thing)} ${REL[String(r.rel ?? '').replace(/_/g, ' ')] ?? 'on'} the ${norm(r.place)}`;
/** A layout said in a place act ("arrange them like a family photo", "put them in a family photo"): the goal of making that arrangement of what is there, or null. */
export function layoutGoal(r) {
  const m = /\b(?:like|as|into|in)\s+(?:an?\s+|the\s+)?([a-z][a-z ]*?)\s*$/i.exec(String(r.text ?? '').trim().replace(/[.!?]+$/, ''));
  return m && goalWord(m[1]) ? { act: 'make', roles: { kind: norm(m[1]) } } : null;
}
/** The words of a goal for the reply: "a farm", "a person on the swing". */
export const goalSaid = (goal) => `${an(goal.roles.kind)}${goal.roles.place ? ` ${goal.roles.place.rel} the ${goal.roles.place.value}` : ''}`;

/** A step of a plan in plain words: "make 3 cows", "put the person on the seat of the swing". */
const stepWords = (q) => {
  const a = q.args, bare = (id) => String(id).replace(/\d+$/, '').replace(/_/g, ' ');
  if (q.action === 'make') return `make ${a.number > 1 ? `${a.number} ${D.pluralOfKind(a.kind, a.number)}` : a.kind}${a.of ? ` at the ${a.place} of the ${bare(a.of)}` : ''}`;
  if (q.action === 'place') return `put the ${[].concat(a.thing).map(bare)[0]} ${a.rel} the ${a.place} of the ${bare(a.of)}`;
  if (q.action === 'group') return `group them as ${an(String(a.group))}`;
  return q.action;
};
/** "why": from the plan of the newest change, in the words of the knowledge that holds the method: which method (and which inside it), then the steps. */
export function whyPlan(ctx) {
  const lp = ctx.state?.lastPlan;
  if (!lp || lp.at !== ctx.state.history?.length) return undefined;   // only while the plan is the newest change
  const [top, ...inner] = lp.methods;
  const steps = lp.requests.map(stepWords);
  const text = `I made ${lp.said ?? goalSaid(lp.goal)} the way my knowledge says: the method "${top}"${inner.length ? `, and inside it ${andList([...new Set(inner)].map((m) => `"${m}"`))}` : ''}. The steps were: ${steps.slice(0, 6).join('; ')}${steps.length > 6 ? `; and ${steps.length - 6} more` : ''}.`;
  return { status: 'supported', value: text, note: text };
}
