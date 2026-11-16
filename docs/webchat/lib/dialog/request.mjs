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
import { budget } from './budget.mjs?v=00bce6e369';
import { BUNDLED_REQUEST } from '../knowledge/bundled-request.mjs?v=0e31cb071d';
import { REQUEST_LOCAL } from '../lang/en.request.local.mjs?v=a812e6edbe';

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
export function readTurn(lib, live, language, english, { dialogue = null, known = null, worlds = [], state = null } = {}) {
  // the slips are one candidate source of the reader (sopworld 0.151 readRequest `spell`: the open world's words, the other live worlds, the dialogue, the language); a word the
  // language has (`known`, the host's dictionary of English) is never a slip, so a reading that would repair one is read again without repair
  const ctx = { language, catalog: [language], dialogue: dialogue ?? {}, ...(state ? { state } : {}) };   // `state`: the tool's view told into the declarations (mirrorState): names of things are read from it (sopworld 0.154)
  let request = lib.readRequest(live, english, { ...ctx, spell: { worlds } });
  if ((request.spell?.repairs ?? []).some((r) => typeof known === 'function' && known(String(r.from ?? r.said ?? '').toLowerCase()))) request = lib.readRequest(live, english, ctx);
  // a value said with one kind and no other ("draw a red house": the reader gives a value with a whole of the catalog no `of`) is that kind's, so the reply says it with the thing
  // made (sopworld 0.162 says a value of no kind only on the acts path, not from a tool's diff; host stand-in, questions.md Q99 [LIB])
  { const kinds = (request.constraints ?? []).filter((c) => c.on === 'kind' && (c.want ?? 'yes') === 'yes' && c.value); if (kinds.length === 1) for (const c of request.constraints) if (c.on === 'attribute' && !c.of && (c.want ?? 'yes') === 'yes') c.of = kinds[0].value; }
  const corrections = (request.spell?.repairs ?? []).map((r) => ({ said: r.from ?? r.said, as: r.to ?? r.as }));
  return {
    request, act: request.act ?? null, target: request.target ?? null, facts: request.facts ?? [], reaction: request.reactions?.[0]?.value ?? null,
    unread: [...new Set((request.unread ?? []).map((u) => String(u.text ?? u.words ?? u).toLowerCase()))].filter((u) => !regionNames(live).has(u) && !STOP.has(u)), used: request.used ?? [], corrections, asks: request.spell?.asks ?? [], english,
  };
}

/**
 * THE OPEN TAB'S STATE AS FACTS OF THE LIVE REQUEST WORLD (owner 2026-11-15 19:10; questions.md Q42 [LIB]): the things a world shows (its `referents` operation, which every
 * schema world has: id, kind, name, attributes) are told into a fork of its live request World as instances of its declared kinds, so that the library sees them (factsOf: the
 * spell repair's world words, the planner's places) and the host resolves references against them. An attribute is told under the slot of its name, or the slot a `core.word`
 * names for it (color -> colour); a value the slot refuses (a size in pixels for a size enum) is left out. A thing of a kind the world does not declare is kept in `things` only.
 * Returns { world, view, things: [{ id, kind, name, attrs, salient, told }] }. No code here is per world.
 */
export function stateWorld(lib, live, referents = []) {
  const things = (referents ?? []).filter((r) => r && r.id != null && r.kind).map((r) => ({ id: String(r.id), kind: String(r.kind), name: r.name != null ? String(r.name) : null, attrs: r.attrs ?? {}, salient: !!r.salient, told: null }));
  if (!live || typeof live.fork !== 'function') return { world: live, view: null, things };
  const fork = live.fork();
  const c = (() => { try { return live._compiled?.(); } catch { return null; } })();
  const kinds = new Set(ofType(live, 'std.schema.kind').map((r) => one(r, 'of')));
  const alias = new Map();
  for (const r of ofType(live, 'core.word')) for (const m of r.means ?? []) for (const t of r.text ?? []) alias.set(String(t).replace(/^"|"$/g, ''), String(m).replace(/^"|"$/g, ''));
  const q = (v) => `"${String(v).replace(/["\\]/g, ' ')}"`;
  for (const [i, t] of things.entries()) {
    budget.tick('door.state');
    if (!kinds.has(t.kind)) continue;
    const slots = c?.slots?.get(t.kind);
    const keys = [];
    if (t.name && slots?.get?.('name')) keys.push(`name=${q(t.name)}`);
    for (const [k, v] of Object.entries(t.attrs)) {
      const key = slots?.get?.(k) ? k : slots?.get?.(alias.get(k)) ? alias.get(k) : null;
      const s = key ? slots.get(key) : null;
      if (!s || v == null || typeof v === 'object') continue;
      const en = (s.enum ?? []).map((x) => String(x).replace(/^"|"$/g, ''));
      if (en.length && !en.includes(String(v))) continue;
      keys.push(`${key}=${en.length ? v : q(v)}`);
    }
    const id = `st${i}_${t.id.replace(/[^\w]/g, '_')}`;
    let r = null;
    try { r = fork.tell(`@${id} ${t.kind} ${keys.join(' ')}`); } catch { r = null; }
    if (!r?.ok) { try { r = fork.tell(`@${id} ${t.kind}`); } catch { r = null; } }
    if (r?.ok) t.told = id;
  }
  let view = null;
  try { view = typeof lib?.factsOf === 'function' ? lib.factsOf(fork) : null; } catch { view = null; }
  return { world: fork, view, things };
}

/**
 * The clauses of a turn as typed, cut at the joiners of the language world (w.lang.en.closed class=conjunction from w.lang.en.joiner, and the comma), each with whether a word of
 * it is unread: what the honest reply names as understood and not understood ("I understood "clear everything", but not "zork the plimp""). Never a host list of English words.
 */
const joinerWords = new WeakMap();
export function clausesOf(english, language, unread = []) {
  let jw = joinerWords.get(language ?? {});
  if (!jw) { jw = new Set(); for (const r of ofType(language, 'w.lang.en.closed')) if (one(r, 'class') === 'conjunction' && (r.from ?? []).map((x) => String(x).replace(/^"|"$/g, '')).includes('w.lang.en.joiner')) for (const t of r.text ?? []) jw.add(String(t).replace(/^"|"$/g, '').toLowerCase()); if (language) joinerWords.set(language, jw); }
  const out = []; let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (const m of String(english ?? '').matchAll(/[\p{L}\p{N}'_-]+|[,;]/gu)) { const w = m[0]; if (w === ',' || w === ';' || jw.has(w.toLowerCase())) flush(); else cur.push(w); }
  flush();
  const un = new Set(unread.map((x) => String(x).toLowerCase()));
  return out.map((ws) => ({ text: ws.join(' '), unread: ws.some((w) => un.has(w.toLowerCase())) }));
}

/**
 * THE DECLARED TOOL BINDING (sopworld 0.152.1 std.tool; reviewer 2026-11-15 20:45): the std.tool wires of a live world, read and checked once (the library's toolBindings), or
 * null when the world binds no act to a primitive. No code here is per world.
 */
export function boundTools(lib, live, language) {
  if (!live || typeof lib?.toolBindings !== 'function') return null;
  if (Object.hasOwn(live, '_psys2Tools')) return live._psys2Tools;
  let B = null;
  try { B = lib.toolBindings(live, { catalog: language ? [language] : [] }); } catch { B = null; }
  Object.defineProperty(live, '_psys2Tools', { value: B?.binds?.length ? B : null, enumerable: false });
  return live._psys2Tools;
}

/** The world operation a live world declares for an act (`psys2.op world= act= op=` of request.sop): the one executor path of the door's acts that are not plans (undo, redo). */
export function actOperation(live, act, of = null) {
  const r = ofType(live, 'psys2.op').find((x) => one(x, 'act') === act && (of ? one(x, 'of') === of : !one(x, 'of')));
  return r ? one(r, 'op') : null;
}

/**
 * A make of the world's own whole and nothing else ("start a new drawing": the reading marks a kind that names the world itself `world: true`, and nothing is said of it: no count,
 * manner, part, topic or value) is the world's own make operation when it declares one (request.sop `psys2.op act=make of=<page>`): a fresh page, never a whole sampled among
 * its subkinds (questions.md Q93 (6)). The kind is said afresh: sopworld 0.159 marks a kind after a modifier of the language world's `det meaning=one-more` ("new") `fresh`,
 * so "start a new drawing" is the page and "draw a drawing" is not (Q94 (1)). Returns the operation's name or null.
 */
export function worldWholeOperation(live, request) {
  const cs = request?.constraints ?? [];
  if (request?.act !== 'make' || !cs.length || !cs.every((c) => c.on === 'kind' && c.want === 'yes' && c.world)) return null;
  if (!request.fresh && !cs.some((c) => c.fresh)) return null;
  const r = ofType(live, 'psys2.op').find((x) => one(x, 'act') === 'make' && one(x, 'of'));
  return r ? one(r, 'op') : null;
}

/** The parent of each declared type of a live world (core.type extends=), read from the world's facts. */
export function typeParents(live) {
  const m = new Map();
  let c = null;
  try { c = live?._compiled?.(); } catch { c = null; }
  for (const [k, t] of c?.types ?? []) { const ext = t?.attrs?.extends?.[0]; if (k && ext) m.set(String(k).replace(/^"|"$/g, ''), String(ext).replace(/^"|"$/g, '')); }
  return m;
}

/** The world's own whole: the kind its std.schema.world name names (a kind of that name, or the kind a core.word of that name means): "the diagram", "the drawing". */
export function worldWholes(live) {
  const name = one(ofType(live, 'std.schema.world')[0], 'name');
  const out = new Set();
  if (!name) return out;
  if (ofType(live, 'std.schema.kind').some((r) => one(r, 'of') === name)) out.add(name);
  for (const r of ofType(live, 'core.word')) if ((r.text ?? []).map((t) => String(t).replace(/^"|"$/g, '')).includes(name)) for (const m of r.means ?? []) out.add(String(m).replace(/^"|"$/g, ''));
  return out;
}

/** Whether a kind said is named definitely: the determiner before its words is one the language world marks definite (w.lang.en.det definite=yes: the, this, that, these, those). */
const definites = new WeakMap();
export function definiteKind(english, constraints, language, target = null) {
  let d = definites.get(language ?? {});
  if (!d) { d = new Set(); for (const r of ofType(language, 'w.lang.en.det')) if (one(r, 'definite') === 'yes') for (const t of r.text ?? []) d.add(String(t).replace(/^"|"$/g, '').toLowerCase()); if (language) definites.set(language, d); }
  const toks = String(english ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const said = [...(constraints ?? []).filter((c) => c.on === 'kind' && c.want === 'yes' && c.words).map((c) => String(c.words).toLowerCase().split(/\s+/)[0]), ...(target ? [String(target).toLowerCase().replace(/_/g, ' ').split(' ').pop()] : [])];
  return said.some((w) => {
    const i = toks.findIndex((t) => t === w || (t.startsWith(w) && t.length - w.length <= 2));   // the word or its plural
    return i > 0 && (d.has(toks[i - 1]) || (i > 1 && d.has(toks[i - 2])));
  });
}

/** Whether the turn names its thing by an indefinite pronoun of the language world ("something", "whatever you want": w.lang.en.pron refers=any): the world's own whole is meant. */
export function saysAnything(english, language) {
  const any = ofType(language, 'w.lang.en.pron').filter((r) => one(r, 'refers') === 'any').flatMap((r) => (r.text ?? []).map((t) => String(t).replace(/^"|"$/g, '').toLowerCase()));
  const low = ` ${String(english ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ')} `;
  return any.some((t) => low.includes(` ${t} `));
}

/**
 * A sentence of the language world's reply facts (`w.lang.en.reply name= role= text=`, through the library's replyFrom), trying the name and then the names it extends
 * ("done.change.size.up", "done.change.size", "done.change"); null when there is none (the caller then has nothing to say from data, and says so).
 */
export function replyOf(lib, language, name, roles) {
  const given = Object.fromEntries(Object.entries(roles ?? {}).filter(([, v]) => v != null && v !== ''));
  for (let n = String(name ?? ''); n; n = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : '') {
    budget.tick('door.reply');
    let t = null;
    try { t = lib.replyFrom?.(language, n, given) ?? null; } catch { t = null; }
    if (t) return { name: n, text: typeof t === 'string' ? t : t.text ?? String(t) };
  }
  return null;
}

/** The live w.dialogue of a session: per tab world { request, result, before }. JSON in the memory and the snapshot. */
export class RequestDialogue {
  constructor() { this.byWorld = {}; }
  last(world) { const r = this.byWorld[world]; return r?.request ? r : null; }
  record(world, rec) { this.byWorld[world] = { ...rec, act: null }; }
  /** The library's timeline of a world's plans run through its binding (sopworld toolTimeline: one entry per plan, a revision replaces the last), kept with the dialogue. */
  timeline(world) { this.timelines ??= {}; return (this.timelines[world] ??= { done: [], undone: [] }); }
  /** At most the last 12 entries are kept (each holds the world's state before and after). */
  trimTimeline(world) { const t = this.timeline(world); if (t.done.length > 12) t.done.splice(0, t.done.length - 12); t.undone.length = Math.min(t.undone.length, 12); }
  /** The last act on things of a world ({ act, ids, turn }): what "higher" continues. */
  lastAct(world) { return this.byWorld[world]?.act ?? null; }
  recordAct(world, act) { this.byWorld[world] = { ...(this.byWorld[world] ?? {}), act }; }
  toJSON() { return { v: 1, byWorld: structuredClone(this.byWorld), ...(this.timelines ? { timelines: JSON.parse(JSON.stringify(this.timelines)) } : {}) }; }
  load(j) { this.byWorld = j?.v === 1 ? structuredClone(j.byWorld ?? {}) : {}; this.timelines = j?.v === 1 && j.timelines ? JSON.parse(JSON.stringify(j.timelines)) : {}; return this; }
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
  const regions = ofType(live, 'std.schema.region').map((r) => ({ name: one(r, 'name'), kinds: (r.holds ?? []).map((k) => String(k).replace(/^"|"$/g, '')), at: text.search(new RegExp(`\\b${one(r, 'name')}\\b`)) }))
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

/**
 * WHAT WAS MADE AGAINST WHAT WAS SAID (spec 28 section 20; sopworld 0.159 `outcome.short`, "the host's own"): after a run through the bindings, a count said of a kind
 * (`count of=K`, or a length in a unit that is a kind of the made things: "in 7 chapters") of which fewer things were made, and a length said in another unit ("500 words")
 * more than the made whole's `length` in the view, are `short` entries `{ made, asked, kind | unit }` (said by `short_of`). Never an assumed value. And the title the tool gave
 * the whole it made (its `title` in the view) is the whole's title for `done.title` when none was said (host stand-in, questions.md Q96 [LIB]). No world is named: every bound
 * world whose view says these keys gets them.
 */
export function madeAgainstSaid(lib, live, language, request, plan, run, view) {
  if (!run?.ok || run.same) return {};
  const ids = new Set([...(run.result?.things ?? []), ...(run.diff?.added ?? []).map((t) => t.id)].map(String));
  const made = (view ?? []).filter((t) => ids.has(String(t.id)));
  if (!made.length) return {};
  const whole = made.find((t) => String(t.id) === String(run.result?.whole ?? '')) ?? null;
  const lineage = (k) => { try { return lib.kindLineage(k, { live, catalog: [language] }); } catch { return [k]; } };
  const ofKind = (k) => made.filter((t) => lineage(t.kind).includes(k)).length;
  const short = [];
  for (const c of request?.constraints ?? []) {
    if ((c.origin ?? 'said') !== 'said' || (c.want ?? 'yes') !== 'yes' || c.det || !Number.isFinite(Number(c.number))) continue;   // the number of a determiner ("a girl") is no count asked
    const asked = Number(c.number);
    if (c.on === 'count' && c.of) { const n = ofKind(c.of); if (n < asked) short.push({ made: n, asked, kind: c.of }); }
    else if (c.on === 'length' && c.unit) {
      if (made.some((t) => lineage(t.kind).includes(c.unit))) { const n = ofKind(c.unit); if (n < asked) short.push({ made: n, asked, kind: c.unit }); }
      else if (whole && Number.isFinite(Number(whole.length)) && Number(whole.length) < asked) short.push({ made: Number(whole.length), asked, unit: c.unit });
    }
  }
  const out = {};
  if (short.length) out.short = [...short, ...[].concat(plan?.short ?? []).filter((x) => x && !short.some((y) => (y.kind ?? y.unit) === (x.kind ?? x.unit)))];
  const first = plan?.steps?.[0];
  if (whole?.title && first?.args && first.args.kind === whole.kind && first.args.title === undefined) out.steps = [{ ...first, args: { ...first.args, title: `\u201c${whole.title}\u201d` } }, ...plan.steps.slice(1)];
  return out;
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
