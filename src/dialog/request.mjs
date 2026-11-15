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

/** The attribute names a live world's kinds have (their slot keys) and the words for them (core.word means=<slot key>): "colour", "color", "size". */
export function attributeWords(live) {
  const c = (() => { try { return live?._compiled?.(); } catch { return null; } })();
  const keys = new Set();
  for (const k of ofType(live, 'std.schema.kind')) for (const s of c?.slots?.get(one(k, 'of'))?.values?.() ?? []) if (s.key && !['in', 'name', 'place'].includes(s.key)) keys.add(String(s.key));
  const words = new Map([...keys].map((k) => [k, k]));
  for (const r of ofType(live, 'core.word')) for (const m of r.means ?? []) { const mm = String(m).replace(/^"|"$/g, ''); if (keys.has(mm)) for (const t of r.text ?? []) words.set(String(t).replace(/^"|"$/g, '').toLowerCase(), mm); }
  return words;
}

/**
 * WHAT A TURN REFERS TO in the open state (host stand-in until readRequest marks `refers=present` with the things of the live world, questions.md Q42 [LIB]): one mechanism over
 * the things of `stateWorld` and the dialogue, the same for every world.
 *   names  a run of unread words that is a thing's name ("work done", "results"; `_` and space alike) - the words are then read;
 *   kinds  a kind said (a wanted kind, the target) that the state holds: all of them when said in the plural, the one there is, else the salient (last made or named) ones;
 *   whole  the world's whole said ("the drawing", "the diagram"): every thing;
 *   it     an anaphor read as the last request (refers=last): the things of the last act on things, else the salient things.
 * Returns { ids, how, kinds, consumed: [words read as names] } or null when the turn names nothing that is there.
 */
export function referTo(q, state, { lastIds = [], wholes = new Set(), words = null, language = null } = {}) {
  const things = state?.things ?? [];
  if (!things.length) return null;
  // a pronoun of the language world that refers to all ("everything", "all of them": w.lang.en.pron refers=all) with no kind said: every thing
  const all = new Set(ofType(language, 'w.lang.en.pron').filter((r) => one(r, 'refers') === 'all').flatMap((r) => (r.text ?? []).map((t) => String(t).replace(/^"|"$/g, '').toLowerCase())));
  const said0 = (q.request?.constraints ?? []).some((c) => c.on === 'kind' && c.want === 'yes' && c.value);
  const low = ` ${String(q.english ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ')} `;
  if (!said0 && !q.target && [...all].some((t) => low.includes(` ${t} `))) return { ids: things.map((t) => t.id), how: 'all', kinds: [...new Set(things.map((t) => t.kind))], consumed: [] };
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
  const toks = [...(words ?? (q.english ?? '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])];
  const unread = new Set(q.unread ?? []);
  const byName = new Map(things.filter((t) => t.name).map((t) => [norm(t.name), t]));
  const named = [], consumed = [];
  for (let i = 0; i < toks.length; i++) {
    budget.tick('door.names');
    for (let n = Math.min(3, toks.length - i); n >= 1; n--) {
      const span = toks.slice(i, i + n);
      const t = byName.get(norm(span.join(' ')));
      if (t && span.every((w) => unread.has(w) || !STOP.has(w))) { if (!named.includes(t)) named.push(t); consumed.push(...span); i += n - 1; break; }
    }
  }
  if (named.length) return { ids: named.map((t) => t.id), how: 'name', kinds: [...new Set(named.map((t) => t.kind))], consumed };
  const said1 = (q.request?.constraints ?? []).some((c) => c.on === 'kind' && c.want === 'yes' && c.value);
  if (q.request?.refers === 'last' && !said1) {   // "it", "them": the things of the last act on things, else the salient ones (the target the reader took from the dialogue is not said)
    const last = things.filter((t) => lastIds.includes(t.id));
    const pick = last.length ? last : things.filter((t) => t.salient);
    if (pick.length) return { ids: pick.map((t) => t.id), how: 'it', kinds: [...new Set(pick.map((t) => t.kind))], consumed: [] };
  }
  const target = q.target ?? null;
  if (target && wholes.has(target) && !things.some((t) => t.kind === target)) return { ids: things.map((t) => t.id), how: 'whole', kinds: [...new Set(things.map((t) => t.kind))], consumed };
  const said = (q.request?.constraints ?? []).filter((c) => c.on === 'kind' && c.want === 'yes' && c.value);
  const kinds = [...new Set([...said.map((c) => c.value), ...(target && !said.length ? [target] : [])])];
  const hit = kinds.flatMap((k) => things.filter((t) => t.kind === k));
  if (hit.length) {
    const plural = said.some((c) => c.plural || c.number !== undefined) || [...all].some((t) => low.includes(` ${t} `));   // "all the fish": the pronoun of all with a kind
    if (plural || hit.length === 1) return { ids: hit.map((t) => t.id), how: 'kind', kinds, consumed };
    const sal = hit.filter((t) => lastIds.includes(t.id) || t.salient);
    return { ids: (sal.length && sal.length < hit.length ? sal : hit).map((t) => t.id), how: sal.length && sal.length < hit.length ? 'kind+salient' : 'kind', kinds, consumed, several: !(sal.length && sal.length < hit.length) };
  }
  if (q.request?.refers === 'last') {
    const last = things.filter((t) => lastIds.includes(t.id));
    const pick = last.length ? last : things.filter((t) => t.salient);
    if (pick.length) return { ids: pick.map((t) => t.id), how: 'it', kinds: [...new Set(pick.map((t) => t.kind))], consumed };
  }
  return null;
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
 * A plan of things of kinds that dropped kinds said beside the first ("a sky and a sun" planned as one sky): each wanted kind is planned as its own request (its own count, the
 * constraints said of every kind), and the item steps are joined. Null when nothing was dropped or a part cannot be planned. Stand-in, questions.md Q42 [LIB].
 */
export function coordinated(lib, live, req, plan, opts) {
  const wanted = [...new Set([...(req.target && req.refers === 'kind' ? [req.target] : []), ...(req.constraints ?? []).filter((c) => c.on === 'kind' && c.want === 'yes' && c.value && c.origin !== 'lineage').map((c) => c.value)])];   // the target said as a kind is one of the things said together
  const planned = new Set((plan.steps ?? []).filter((st) => st.item && st.args?.kind).map((st) => st.args.kind));
  if (wanted.length < 2 || wanted.every((k) => planned.has(k))) return null;
  const steps = [], assumed = [], notHonoured = [];
  for (const k of wanted) {
    budget.tick('door.coordinated');
    const own = (c) => (c.on === 'kind' ? c.want !== 'yes' || c.value === k : c.on === 'count' ? !c.of || c.of === k : true);
    const kept = (req.constraints ?? []).filter(own);
    const sub = { ...req, target: k, constraints: kept.some((c) => c.on === 'kind' && c.value === k) ? kept : [...kept, { on: 'kind', want: 'yes', value: k, words: k, origin: 'said' }] };   // each thing planned as a thing of its kind
    let p = null;
    try { p = lib.planRequest(live, sub, opts); } catch { p = null; }
    if (!p?.ok && !p?.cannot?.length) { try { const p2 = lib.planRequest(live, sub, { ...opts, sources: lib.REQUEST_SOURCES.filter((x) => x !== 'expect') }); if (p2?.ok) p = p2; } catch { /* the first plan stands */ } }   // a kind whose catalog parts the world cannot make is planned as itself (Q40 (9))
    if (!p?.ok) return null;
    steps.push(...(p.steps ?? []).filter((st) => st.item || !steps.length));
    assumed.push(...(p.assumed ?? []).filter((a) => !assumed.some((x) => x.key === a.key)));
    notHonoured.push(...(p.notHonoured ?? []).filter((x) => !notHonoured.some((y) => y.on === x.on && y.words === x.words)));
  }
  return { ...plan, steps, assumed, notHonoured, roles: { ...plan.roles, kinds: wanted, count: steps.filter((st) => st.item).length } };
}

/** The world operation a live world declares for an act (`psys2.op world= act= op=` of request.sop): the one executor path of the door's acts that are not plans (undo, redo). */
export function actOperation(live, act, of = null) {
  const r = ofType(live, 'psys2.op').find((x) => one(x, 'act') === act && (of ? one(x, 'of') === of : !one(x, 'of')));
  return r ? one(r, 'op') : null;
}

/** "in the diagram" on the Diagram: a place that names the open world itself (its std.schema.world name, or a word for it) is where everything of it goes, not a place in it: dropped. */
export function withoutSelfPlace(req, live) {
  const name = one(ofType(live, 'std.schema.world')[0], 'name');
  if (!name || !req?.constraints?.length) return req;
  req.constraints = req.constraints.filter((c) => !(c.on === 'place' && c.want !== 'no' && String(c.value ?? '').toLowerCase() === name.toLowerCase()));
  return req;
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
 * TOOL BINDING (spec 28 section 12; reviewer general-mechanisms item 3): the rows `psys2.tool world= act= op= when= arg= effect= reply=` of a live world, as data. A row binds an
 * act to one operation of the world (a tool with no words); `arg="<tool argument>:<role path>"` takes an argument from the roles of the request (`:=<value>` a constant);
 * `when="<role path>"` (present) or `when="<role path>=<value>"` are its preconditions; `reply` names the reply fact the host says it with (`{<role path>}` filled from the roles).
 * Host stand-in until the library publishes the binding and runPlan carries it out (questions.md Q42 (3), (14)).
 */
const unq = (x) => String(x ?? '').replace(/^"|"$/g, '');
export function toolBindings(live, act) {
  return ofType(live, 'psys2.tool').filter((r) => one(r, 'act') === act).map((r) => ({
    op: one(r, 'op'), when: (r.when ?? []).map(unq), reply: unq(r.reply?.[0] ?? ''), effect: unq(r.effect?.[0] ?? ''),
    args: (r.arg ?? []).map(unq).map((a) => { const k = a.indexOf(':'); return [a.slice(0, k), a.slice(k + 1)]; }),
  }));
}
/** A role of the request by its path ("place.value", "things"), or the constant of a `=value` path. */
export function roleAt(roles, path) {
  if (String(path).startsWith('=')) return String(path).slice(1);
  let v = roles;
  for (const k of String(path).split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
const present = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
/** The first binding of an act whose preconditions hold for the roles, with its arguments and its reply name; null when none holds. */
export function bindingFor(live, act, roles) {
  for (const b of toolBindings(live, act)) {
    budget.tick('door.binding');
    const holds = b.when.every((w) => { const k = w.indexOf('='); return k < 0 ? present(roleAt(roles, w)) : String(roleAt(roles, w.slice(0, k)) ?? '') === w.slice(k + 1); });
    if (!holds) continue;
    const args = Object.fromEntries(b.args.map(([name, path]) => [name, roleAt(roles, path)]).filter(([, v]) => v !== undefined && v !== null));
    const reply = b.reply.replace(/\{([\w.]+)\}/g, (_, p) => String(roleAt(roles, p) ?? ''));
    return { ...b, args, reply: reply.replace(/\.+$/, '') };
  }
  return null;
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
  /** The last act on things of a world ({ act, ids, turn }): what "higher" continues. */
  lastAct(world) { return this.byWorld[world]?.act ?? null; }
  recordAct(world, act) { this.byWorld[world] = { ...(this.byWorld[world] ?? {}), act }; }
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
