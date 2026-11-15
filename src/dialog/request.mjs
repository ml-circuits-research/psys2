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
  const load = (text) => { try { const w = new lib.World(); const r = w.load(text); return r?.ok === false ? null : w; } catch { return null; } };
  world._requestLive = load(world.requestText);
  let extra = '';
  if (world._requestLive) try { extra = catalogWholes(world._requestLive, requestLanguage(lib), world.requestText); } catch { extra = ''; }
  if (extra) world._requestLive = load(`${world.requestText}\n${extra}`) ?? world._requestLive;   // one load: the schema is compiled with the catalog's wholes
  return world._requestLive;
}

/**
 * The wholes the catalog expects made in a live world (k.expect.make made_in = its std.schema.world name: "lake scene", "flowchart") are kinds of that world: each is told as a kind
 * of the world's own whole (its type and its make honours), so that the library reads and plans it like the declared ones. Stand-in until capabilitiesOf reads the catalog's
 * expectations itself (questions.md Q40 [LIB]).
 */
function catalogWholes(live, language, text) {
  const name = one(ofType(live, 'std.schema.world')[0], 'name');
  if (!name || !language) return '';
  const kinds = new Set(ofType(live, 'std.schema.kind').map((r) => one(r, 'of')));
  const types = new Map([...String(text).matchAll(/^@\S+ core\.type of=("[^"]+"|\S+) extends=(\S+)/gm)].map((m) => [m[1].replace(/^"|"$/g, ''), m[2]]));
  const make = ofType(live, 'std.schema.honours').find((h) => one(h, 'act') === 'make');
  if (!make) return '';
  const wholes = [...ofType(live, 'k.expect.make'), ...ofType(language, 'k.expect.make')].filter((r) => one(r, 'made_in') === name).map((r) => one(r, 'thing'));
  const ref = wholes.find((t) => kinds.has(t) && types.has(t));
  if (!ref) return '';
  const parent = types.get(ref) === 'std.schema.thing' ? ref : types.get(ref);
  const on = (make.on ?? []).map((x) => `on=${String(x).replace(/^"|"$/g, '')}`).join(' ');
  const lines = [];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const own = new Set(ofType(live, 'k.expect.make').map((r) => one(r, 'thing')));
  for (const [i, t] of [...new Set(wholes)].entries()) {
    // the world's own wholes keep their declarations; their catalog expectation is copied beside the others', so that the world's first whole stays the default target
    if (t && kinds.has(t) && !own.has(t) && (t === ref || t === parent || types.get(t) === parent) && /^[a-z][a-z_]*$/i.test(t)) for (const m of BUNDLED_REQUEST.matchAll(new RegExp(`^@(\\S+) (k\\.expect\\.make) (.*thing=${esc(t)}(?:\\s.*)?)$`, 'gm'))) {
      lines.push(`@cwo${i} ${m[2]} ${m[3]}`);
      for (const [j, p] of [...BUNDLED_REQUEST.matchAll(new RegExp(`^@\\S+ (k\\.expect\\.part of=${esc(t)}\\s.*)$`, 'gm'))].entries()) lines.push(`@cwo${i}.p${j} ${p[1]}`);
    }
    if (!t || kinds.has(t) || types.has(t) || !/^[a-z][a-z_ ]*$/i.test(t)) continue;
    // a name of several words is not matched by the library when quoted (questions.md Q40 [LIB]): it is the kind `lake_scene`, its words a core.word, its expectations copied
    const id = t.replace(/ /g, '_');
    lines.push(`@cw${i}.t core.type of=${id} extends=${parent} closed=true`, `@cw${i}.k std.schema.kind of=${id} world=${name} acts=make acts=remove`, `@cw${i}.h std.schema.honours world=${name} act=make ${on} of=${id}`, `@cw${i}.d psys2.door world=${name} whole=${id}`);
    if (id !== t) {
      lines.push(`@cw${i}.w core.word text="${t}" means=${id}`);
      const re = new RegExp(`^@(\\S+) (k\\.expect\\.(?:make|part)) (.*(?:thing|of)="${esc(t)}".*)$`, 'gm');
      for (const m of BUNDLED_REQUEST.matchAll(re)) lines.push(`@cw${i}.${m[1].replace(/[^\w.]/g, '_')} ${m[2]} ${m[3].replace(new RegExp(`(thing|of)="${esc(t)}"`), `$1=${id}`)}`);
    }
  }
  return lines.join('\n');
}

/** The facts of a type in a library World, as { attr: [values] } records. */
const ofType = (w, type) => { try { return (w?.ofType?.(type) ?? []).map((x) => x.attrs ?? x.f ?? {}); } catch { return []; } };
const one = (r, k) => { const v = r?.[k]?.[0]; return v == null ? null : String(v).replace(/^"|"$/g, ''); };
const num = (r, k) => (one(r, k) == null || one(r, k) === '' ? null : Number(one(r, k)));

/** The region names a live world declares (std.schema.region): words of a request about its layers, read by the world's executor. */
const regionNames = (live) => new Set(ofType(live, 'std.schema.region').map((r) => one(r, 'name')).filter(Boolean));


/**
 * Read one turn with the library (readRequest) into the host's shape: { act, target, facts (flat: key, value, neg, all, n, min, max, unit, step, of), reaction, unread, used,
 * corrections, request (the library's own) }.
 */
export function readTurn(lib, live, language, english, { dialogue = null, known = null, worlds = [] } = {}) {
  // the slips are one candidate source of the reader (sopworld 0.151 readRequest `spell`: the open world's words, the other live worlds, the dialogue, the language); a word the
  // language has (`known`, the host's dictionary of English) is never a slip, so a reading that would repair one is read again without repair
  const ctx = { language, catalog: [language], dialogue: dialogue ?? {} };
  let request = lib.readRequest(live, english, { ...ctx, spell: { worlds } });
  if ((request.spell?.repairs ?? []).some((r) => typeof known === 'function' && known(String(r.from ?? r.said ?? '').toLowerCase()))) request = lib.readRequest(live, english, ctx);
  const corrections = (request.spell?.repairs ?? []).map((r) => ({ said: r.from ?? r.said, as: r.to ?? r.as }));
  return {
    request, act: request.act ?? null, target: request.target ?? null, facts: request.facts ?? [], reaction: request.reactions?.[0]?.value ?? null,
    unread: [...new Set((request.unread ?? []).map((u) => String(u.text ?? u.words ?? u).toLowerCase()))].filter((u) => !regionNames(live).has(u) && !STOP.has(u)), used: request.used ?? [], corrections, asks: request.spell?.asks ?? [], english,
  };
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

/** Whether the catalog (or the live world) expects a thing to be made in the live world: k.expect.make made_in = the world's std.schema.world name. */
export function madeIn(live, language, thing) {
  const name = one(ofType(live, 'std.schema.world')[0], 'name');
  const t = String(thing ?? '').toLowerCase();
  return !!name && !!t && [...ofType(live, 'k.expect.make'), ...ofType(language, 'k.expect.make')].some((r) => String(one(r, 'thing') ?? '').toLowerCase() === t && one(r, 'made_in') === name);
}

/**
 * A kind not wanted is not wanted with its subkinds and the kinds drawn as it ("no birds" is no duck either): the request gets a `want=no` constraint for each kind of the live
 * world whose type extends it (core.type, through its parents) or that it draws as it (std.schema.drawn). Stand-in until the library excludes the lineage itself (Q40 [LIB] 1).
 */
export function withSubkindsNegated(req, live, text) {
  const parent = new Map([...String(text ?? '').matchAll(/^@\S+ core\.type of=("[^"]+"|\S+) extends=(\S+)/gm)].map((m) => [m[1].replace(/^"|"$/g, ''), m[2].replace(/^"|"$/g, '')]));
  const drawnAs = new Map(ofType(live, 'std.schema.drawn').map((r) => [one(r, 'kind'), one(r, 'as')]));
  const isUnder = (k, x) => { let c = k; for (let i = 0; i < 6 && c; i++) { if (c === x || drawnAs.get(c) === x) return true; c = parent.get(c); } return false; };
  const no = (req.constraints ?? []).filter((c) => c.on === 'kind' && c.want === 'no' && c.value);
  const add = [];
  for (const c of no) for (const k of new Set([...parent.keys(), ...drawnAs.keys()])) if (k && k !== c.value && isUnder(k, c.value) && !no.some((x) => x.value === k) && !add.some((x) => x.value === k)) add.push({ ...c, value: k, origin: 'lineage' });
  if (add.length) req.constraints = [...req.constraints, ...add];
  return req;
}

/** The wholes a live world plans through the door (its `psys2.door whole=` facts, and the catalog's wholes told by catalogWholes). */
export function doorWholes(live) {
  return new Set(ofType(live, 'psys2.door').flatMap((r) => (r.whole ?? []).map((x) => String(x).replace(/^"|"$/g, ''))));
}

/** A constraint the readers cannot honour, so that a request of single things still goes through the door: a kind not wanted, a range or an amount, a manner, a layout, a topic, a length, parts it must have. */
export const strongConstraint = (c) => (c.on === 'kind' && c.want !== 'yes') || (c.on === 'count' && (c.min !== undefined || c.amount !== undefined)) || ['manner', 'layout', 'about', 'length', 'with'].includes(c.on);

/** Whether a word is the unit of a whole made in the live world (k.expect.make unit, made_in = its world name): "nodes" of a diagram. */
export function unitOfWhole(live, language, unit) {
  const name = one(ofType(live, 'std.schema.world')[0], 'name');
  return !!name && [...ofType(live, 'k.expect.make'), ...ofType(language, 'k.expect.make')].some((r) => one(r, 'made_in') === name && one(r, 'unit') === unit);
}

/** A library request as plain data (its enumerable fields: act, target, refers, text, constraints, reactions, unread): what w.dialogue keeps across snapshots. */
export const plainRequest = (r) => { try { return JSON.parse(JSON.stringify(r ?? null)); } catch { return null; } };

/**
 * A question is never a request to make nor a reaction ("how many shapes are there?", "is it red"): a turn ending in "?", or starting with a question word of the language world
 * (w.lang.en.wh at question-start) or an auxiliary of its closed words (w.lang.en.closed class=auxiliary) that is not an imperative lead ("can you draw ..." stays a request).
 */
const questionWords = new WeakMap();
export function isQuestion(english, language) {
  const t = String(english ?? '').trim().toLowerCase();
  if (/\?\s*$/.test(t)) return true;
  if (!language) return false;
  let qw = questionWords.get(language);
  if (!qw) {
    qw = new Set();
    const strip = (x) => String(x).replace(/^"|"$/g, '');
    for (const r of ofType(language, 'w.lang.en.wh')) if ((r.in ?? []).map(strip).includes('question-start')) for (const x of r.text ?? []) qw.add(strip(x));
    for (const r of ofType(language, 'w.lang.en.closed')) if (one(r, 'class') === 'auxiliary' && !(r.from ?? []).map(strip).includes('w.lang.en.imperative.lead')) for (const x of r.text ?? []) qw.add(strip(x));
    questionWords.set(language, qw);
  }
  const ws = t.split(/[\s,]+/);
  return [ws.slice(0, 2).join(' '), ws[0]].some((w) => qw.has(w));
}
