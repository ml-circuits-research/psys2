// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WHAT WAS ASKED IS A WORLD (spec 28; owner GO 2026-11-15 14:00, 14:40). Browser-safe: no `node:*` imports.
 *
 * The host side of the library's request mechanisms (sopworld 0.149: readRequest, reviseRequest, planRequest, sayRequest, capabilitiesOf). One mechanism for every live world:
 *   the language   one library World of the published words (w.lang.en cues, closed words, numbers, inflection, replies; k.actions verbs; k.expect; w.dialogue revisions; colours),
 *                  bundled from the catalog pin (src/knowledge/bundled-request.mjs);
 *   the live world one library World per tab world, loaded from its `request.sop`: its kinds and slots (std.schema), what each act honours (std.schema.honours), its own
 *                  expectations (k.expect.make / k.expect.part) where the catalog has none, and declarations its executor reads (std.schema.fill, std.schema.region);
 *   w.dialogue     the session's RequestDialogue: per tab world the last request, its result (count, kinds), the state before it.
 * No code here is per world: what a world can do is what its request.sop declares, and it carries out a plan with its own operation `planRequest(ctx, goal)`.
 */
import { budget } from './budget.mjs';
import { BUNDLED_REQUEST } from '../knowledge/bundled-request.mjs';
import { REQUEST_LOCAL } from '../lang/en.request.local.mjs';

const STOP = new Set('a an the of to in on at for with and or but is are was were be been being it its this that these those there here i you he she we they me my your our his her their them us do does did please just also so then very some any can could would should will shall may might must have has had am get got let lets want like one'.split(' '));

/** The language World of the requests (built once per library module). */
const languages = new WeakMap();
export function requestLanguage(lib) {
  if (!lib?.World) return null;
  if (languages.has(lib)) return languages.get(lib);
  let w = null;
  try { w = new lib.World(); w.tell(BUNDLED_REQUEST); w.tell(REQUEST_LOCAL); } catch { w = null; }   // the catalog's words, then the local rows the catalog lacks yet
  languages.set(lib, w);
  return w;
}

/** The live request World of a tab world (its request.sop), built once per world; null when the world declares nothing. */
export function liveWorld(lib, world) {
  if (!lib?.World || !world?.requestText) return null;
  if (world._requestLive !== undefined) return world._requestLive;
  try { const w = new lib.World(); const r = w.load(world.requestText); world._requestLive = r?.ok === false ? null : w; } catch { world._requestLive = null; }
  return world._requestLive;
}

/** The facts of a type in a library World, as { attr: [values] } records. */
const ofType = (w, type) => { try { return (w?.ofType?.(type) ?? []).map((x) => x.attrs ?? x.f ?? {}); } catch { return []; } };
const one = (r, k) => { const v = r?.[k]?.[0]; return v == null ? null : String(v).replace(/^"|"$/g, ''); };
const num = (r, k) => (one(r, k) == null || one(r, k) === '' ? null : Number(one(r, k)));

/** The region names a live world declares (std.schema.region): words of a request about its layers, read by the world's executor. */
const regionNames = (live) => new Set(ofType(live, 'std.schema.region').map((r) => one(r, 'name')).filter(Boolean));

/** The kind names a live world declares (its std.schema.kind, the parts of its expectations): the vocabulary of the slips the host corrects before the library reads. */
export function kindNames(live) {
  const out = new Set();
  for (const r of ofType(live, 'std.schema.kind')) { const k = one(r, 'of'); if (k) out.add(k); }
  for (const r of ofType(live, 'core.word')) for (const t of r.text ?? []) out.add(String(t).replace(/^"|"$/g, ''));
  return out;
}

/**
 * The expectation of a thing (spec 28 section 8): the live world's own k.expect facts first, then the catalog's, as the host's check shape: { count: [min, max], chapters, kinds,
 * words, with: ['arrow'] when its links are needed, small / big count factors of k.expect.scale }. Used to check what a reader already did; the plan itself is the library's.
 */
export function expectOf(live, language, thing) {
  if (!thing) return null;
  const t = String(thing).toLowerCase();
  const find = (w) => ofType(w, 'k.expect.make').find((r) => String(one(r, 'thing') ?? '').toLowerCase() === t);
  const m = find(live) ?? find(language);
  if (!m) return null;
  const parts = [...ofType(live, 'k.expect.part'), ...ofType(language, 'k.expect.part')].filter((r) => String(one(r, 'of') ?? '').toLowerCase() === t);
  const factor = (step) => num(ofType(language, 'k.expect.scale').find((s) => one(s, 'step') === step), 'count_factor');
  const length = num(m, 'length');
  const chaptered = one(m, 'unit') === 'chapter';
  return {
    of: t, count: chaptered ? null : [num(m, 'min'), num(m, 'max')], chapters: chaptered ? [num(m, 'min'), num(m, 'max')] : null, kinds: num(m, 'kinds_min') ?? 1,
    words: length && one(m, 'length_unit') === 'word' ? [Math.round(length * 0.75), Math.round(length * 1.25)] : null,
    with: parts.some((p) => one(p, 'group') === 'link' && (num(p, 'min') ?? 0) > 0) ? ['arrow'] : [], small: factor('small'), big: factor('big'),
  };
}

/** Edit distance with a cap (above the cap: cap + 1). */
function editDistance(a, b, cap) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), j > 1 && i > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? prev[j - 2] + 1 : Infinity); low = Math.min(low, cur[j]); }
    if (low > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Slips of the request's own words ("ndes", "arraws", "eiagram", "expectatiom", "creare"): a word no dictionary has, one edit from a word of the request vocabulary (two for long words),
 * is that word. The vocabulary is data: the live world's kinds and words, the verbs of k.actions, the words of the cues. Returns { text, corrections }.
 */
export function correctSlips(english, { live, language, known = null } = {}) {
  const vocab = new Set();
  for (const k of kindNames(live)) { vocab.add(k); vocab.add(`${k}s`); }
  for (const r of ofType(language, 'k.actions.verb')) for (const k of ['name', 'text', 'base']) { const v = one(r, k); if (v) vocab.add(v.toLowerCase()); }
  for (const r of ofType(language, 'w.lang.en.cue')) for (const k of ['lead', 'trail', 'between']) for (const p of r[k] ?? []) for (const w of String(p).replace(/^"|"$/g, '').toLowerCase().split(/\s+/)) vocab.add(w);
  for (const w of ['nodes', 'arrows', 'chapters', 'expectation']) vocab.add(w);
  const words = [...vocab].filter((w) => w.length >= 4 && /^[a-z]+$/.test(w));
  const corrections = [];
  const text = String(english).replace(/[A-Za-z]+/g, (raw) => {
    budget.tick('request.slip');
    const w = raw.toLowerCase();
    if (w.length < 4 || vocab.has(w) || STOP.has(w) || (typeof known === 'function' && known(w))) return raw;
    let best = null;
    for (const v of words) { if (Math.abs(v.length - w.length) > 2) continue; const d = editDistance(w, v, 2); if (d <= (w.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { v, d }; }
    if (!best) return raw;
    corrections.push({ said: w, as: best.v });
    return best.v;
  }).replace(/([a-z])(\d)/gi, '$1 $2');   // "eiagram5-10": a word glued to a number
  return { text, corrections };
}

/**
 * Read one turn with the library (readRequest) into the host's shape: { act, target, facts (flat: key, value, neg, all, n, min, max, unit, step, of), reaction, unread, used,
 * corrections, request (the library's own) }.
 */
export function readTurn(lib, live, language, english, { dialogue = null, known = null } = {}) {
  const fix = correctSlips(english, { live, language, known });
  const request = lib.readRequest(live, fix.text, { language, catalog: [language], dialogue: dialogue ?? {} });
  return {
    request, act: request.act ?? null, target: request.target ?? null, facts: request.facts ?? [], reaction: request.reactions?.[0]?.value ?? null,
    unread: [...new Set((request.unread ?? []).map((u) => String(u.text ?? u.words ?? u).toLowerCase()))].filter((u) => !regionNames(live).has(u)), used: request.used ?? [], corrections: fix.corrections, english: fix.text,
  };
}

const STEP_FACTOR = { tiny: 0.4, small: 0.6, default: 1, big: 1.5, huge: 2.2 };
/** The range of parts a request asks for: an explicit count or range, else the expectation of the target scaled by the size step and the count step. */
export function wantedRange(q, exp) {
  const c = q.facts.find((f) => f.key === 'count' && (f.n != null || f.min != null));
  if (c) return c.n != null ? [c.n, c.n] : [c.min, c.max];
  if (!exp?.count) return null;
  let [lo, hi] = exp.count;
  const size = q.facts.find((f) => f.key === 'size' || f.key === 'extent')?.step;
  const step = q.facts.find((f) => f.key === 'count' && f.step)?.step;
  if (size === 'small' || step === 'few') { const k = exp.small ?? STEP_FACTOR.small; hi = Math.max(1, Math.min(lo - 1, Math.round(hi * k))); lo = Math.max(1, Math.round(lo * k)); if (hi < lo) hi = lo; }
  if (size === 'big' || step === 'many') { const k = exp.big ?? STEP_FACTOR.big; lo = hi + 1; hi = Math.round(hi * k) + 1; }
  return [lo, hi];
}

/**
 * Check what a reader already did against the request: the violations. `res` the open world's measure of what the turn made ({ parts, kinds: {k: n}, links, words, chapters, composed }),
 * `exp` the expectation of the request's target (or null). A violation hands the request to the library's plan.
 */
export function violations(q, res, exp) {
  const out = [];
  if (!res) return out;
  const kinds = res.kinds ?? {};
  const kindN = Object.values(kinds).filter((n) => n > 0).length;
  for (const f of q.facts) {
    if (f.key === 'kind' && f.neg && !f.all && (kinds[f.value] ?? 0) > 0) out.push({ key: 'kind', fact: f });
    if (f.key === 'kind' && f.neg && f.all && kindN < 2) out.push({ key: 'kind', fact: f });
    if (f.key === 'length' && f.unit === 'chapter' && res.chapters != null && res.chapters !== f.n) out.push({ key: 'length', fact: f });
  }
  const explicitCount = q.facts.some((f) => f.key === 'count' && (f.n != null || f.min != null));
  const r = res.composed && !explicitCount ? null : q.target || explicitCount ? wantedRange(q, exp) : null;
  const wantedKind = q.facts.find((f) => f.key === 'kind' && !f.neg && f.value !== q.target)?.value;
  const parts = wantedKind && !q.target ? (kinds[wantedKind] ?? res.parts) : res.parts;
  if (r && parts != null && (parts < r[0] || parts > r[1])) out.push({ key: 'count', range: r });
  if (q.target && exp && (exp.with ?? []).includes('arrow') && !res.composed && res.links === 0 && (res.parts ?? 0) > 1) out.push({ key: 'with', value: 'arrow' });   // a composed diagram's links are its kind's
  if (q.facts.some((f) => f.key === 'manner' && f.value === 'random') && !res.composed && !wantedKind && kindN < 2 && (res.parts ?? 0) > 2) out.push({ key: 'manner', value: 'random' });   // random is varied
  if (q.facts.some((f) => f.key === 'with' && /^(?:arrows?|links?)$/.test(String(f.value))) && res.links === 0 && (res.parts ?? 0) > 1) out.push({ key: 'with', value: 'arrow' });
  const len = q.facts.find((f) => f.key === 'size' || (f.key === 'length' && f.step));
  if (len && exp?.words && res.words != null) {
    const [lo, hi] = exp.words;
    if (len.step === 'small' && res.words > Math.round(lo * (exp.small ?? 0.6))) out.push({ key: 'length', step: 'small' });
    if (len.step === 'big' && res.words <= hi) out.push({ key: 'length', step: 'big' });
  }
  return out;
}

/** The live w.dialogue of a session: per tab world { request, result, before }. JSON in the memory and the snapshot. */
export class RequestDialogue {
  constructor() { this.byWorld = {}; }
  last(world) { return this.byWorld[world] ?? null; }
  record(world, rec) { this.byWorld[world] = rec; }
  toJSON() { return { v: 1, byWorld: structuredClone(this.byWorld) }; }
  load(j) { this.byWorld = j?.v === 1 ? structuredClone(j.byWorld ?? {}) : {}; return this; }
}

/**
 * The goal a world's executor receives from the library's plan (one shape for every world): the plan's roles and steps, plus the request's own words the executor needs (the kinds
 * not wanted, the topic). Nothing here fills a gap: every default is the plan's (said > dialogue > world > expect > sampled).
 */
export function goalOf(plan, request, { seed } = {}) {
  const f = request.facts ?? [];
  const roles = plan.roles ?? {};
  return {
    plan, steps: plan.steps ?? [], roles, request: { facts: f, target: plan.target ?? request.target ?? null },
    target: plan.target ?? request.target ?? null, count: roles.count ?? null, range: roles.count ? [roles.count, roles.count] : null,
    kinds: roles.kinds ?? [], not: f.filter((x) => x.key === 'kind' && x.neg && !x.all).map((x) => x.value), notAll: f.find((x) => x.key === 'kind' && x.neg && x.all)?.value ?? null,
    arrows: (roles.links ?? 0) > 0, layout: roles.layout && !['free', 'better'].includes(roles.layout) ? roles.layout : null, regions: roles.regions ?? null,
    topic: roles.about ?? f.find((x) => x.key === 'about')?.value ?? null, size: roles.extent && roles.extent !== 'default' ? roles.extent : roles.size && roles.size !== 'default' ? roles.size : null,
    place: roles.place ?? null, length: f.find((x) => x.key === 'length') ?? null, seed: plan.seed ?? seed, assumedFrom: plan.assumed ?? [],
  };
}

/**
 * The declarations a world's executor reads, from its live request World (one shape for every world): `drawn` (a kind of the expectations drawn as one of the world's own kinds,
 * std.schema.drawn), `regions` (std.schema.region: the named regions of the world with their kinds, in the order the user named them in `english`), `fill` (std.schema.fill).
 */
export function declarationsOf(live, english = '') {
  const drawn = {};
  for (const r of ofType(live, 'std.schema.drawn')) if (one(r, 'kind') && one(r, 'as')) drawn[one(r, 'kind')] = one(r, 'as');
  const text = ` ${String(english).toLowerCase()} `;
  const regions = ofType(live, 'std.schema.region').map((r) => ({ name: one(r, 'name'), kinds: (r.kind ?? []).map((k) => String(k).replace(/^"|"$/g, '')), at: text.search(new RegExp(`\\b${one(r, 'name')}\\b`)) }))
    .filter((r) => r.name).sort((a, b) => (a.at < 0) - (b.at < 0) || a.at - b.at);
  const fill = ofType(live, 'std.schema.fill').map((r) => ({ of: one(r, 'of'), from: one(r, 'from') }));
  return { drawn, regions, named: regions.filter((r) => r.at >= 0).map((r) => r.name), fill };
}

/** A library request as plain data (its enumerable fields: act, target, refers, text, constraints, reactions, unread): what w.dialogue keeps across snapshots. */
export const plainRequest = (r) => { try { return JSON.parse(JSON.stringify(r ?? null)); } catch { return null; } };
