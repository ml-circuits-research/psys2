// vss-context.js: the layer AFTER VSS that fills reference gaps from the message's own context (a symbolic attention: closed candidate
// sets, hard filters, a small learned linear ranker, a margin). Browser-ready ES module; nothing in the existing path imports it.
//
// What VSS gives (rawNodes): the reading of one unit turned into command args by the adapter's own mapping (vss-adapter.js toNodes), but
// with NOTHING resolved: "it" / "them" stay the strings "@it" / "@them", a name stays the name the reader read (never a reference to a shape
// created earlier), a description stays a mention node, and the two adapter defaults (create shape "circle", property "color") are flagged.
//
// A GAP is one of (the same test for every entity key of the registry, see entitySpec):
//   pron   the role holds "@it" (one shape) or "@them" (several);
//   vague  the role holds a mention with no shape, colour or quantifier ("this one", "that", "the new one": recency only);
//   desc   the role holds a mention with a shape and/or colour ("the blue one"): filled only by a context shape whose KNOWN attributes
//          confirm it; with no such shape the mention is left to the engine (it resolves descriptions against the canvas);
//   empty  the role is missing although the action needs it: `required` below, learned from the annotated gold args (no hand list).
// For each gap:
//   1 candidates (closed set): every shape the message's context knows: created, read in a role, or acted on by an earlier request of the
//     message; the shapes already on the canvas (row.names); the names written in the text (tokenize: names by capital letter, the
//     mechanical step of front.js). Group candidates: every list read earlier in a role, the last two shapes mentioned, all shapes created.
//   2 hard filters (same for every role): one shape vs several (it -> one, them -> several, empty / vague -> either); a description's
//     constraints (shape, colour must be KNOWN and equal); recency ("the new one" -> created shapes only); not an entity another role of
//     the same frame already holds.
//   3 ranking: score = w . features(candidate) with the features below (shared by all roles), plus a NULL candidate ("nobody in the
//     context": its score is learned too). Weights are learned (training/sketch/train_context.mjs) from the gold args.
//   4 decision: fill with the best candidate only when it beats the runner-up (NULL included) by at least `margin` (chosen once on the
//     training split); otherwise the gap stays and the request becomes a question to the user ("ask"). Output: a context entity or ask.
// ENTITY ROLES AND KEYS ARE NOT WRITTEN HERE (review 2026-11-02, item 1): a reading's entity roles are the roles whose filler is an entity
// (an entity wire of the reader: readingFromWires gives it as {head, attr, det} or a list of them); the entity KEYS (the SOP args that
// hold shapes: target, from, to, anchor, anchor2 ...) are the args the adapter writes from the entity roles of the registry's worlds
// (entitySpec, run once by the composer when it loads; the Context reads them from model.entity).
import { toNodes, SHAPES, PROPERTY } from "./vss-adapter.js";
import { tokenize } from "./front.js";

const PRON = new Set(["it", "them"]);
const low = (s) => String(s).toLowerCase();

// ---------------------------------------------------------------- the entity roles and keys of a registry (from its worlds)
/** worlds (vss-composer.js makeWorld: {id, events, vss}, registry order) -> {roles, keys}.
 *  roles: the roles whose learned schema filler is an entity (vss model schema roles[r].main, learned from the annotated data), in the
 *  order the worlds' legends list them. keys: the SOP args the adapter (toNodes) writes from those roles. Found by running the adapter on
 *  probe readings of every event of every world: each entity role of the event holds a distinct probe name (two for a set role), and the
 *  word roles of the event are filled (a) one at a time with each of their values, (b) all at once with their k-th values, (c) not at all.
 *  The values of a word role are the lexicon words whose kind is one of the role's kinds (and one sample for a pattern kind: NUM, NAME,
 *  TEXT). An arg that holds a probe name is an entity key. Order: the legend order of the first role that writes it. No list is written
 *  by hand; a new world, a new role or a new adapter case changes the result by itself. */
export function entitySpec(worlds) {
  const roleOrder = [], roles = new Set(), keyRole = new Map();
  for (const w of worlds) {
    const model = w.vss.model, sch = (model.schema && model.schema.roles) || {}, legendRoles = (model.legend.roles || []).map((r) => r.id);
    const sets = new Set((model.legend.reader && model.legend.reader.set_roles) || []);
    for (const r of legendRoles.concat(Object.keys(sch))) if (!roleOrder.includes(r)) roleOrder.push(r);
    const isEnt = (r) => sch[r] && (sch[r].main === "entity" || sets.has(r));
    for (const r of Object.keys(sch)) if (isEnt(r)) roles.add(r);
    const lex = Object.entries(model.lexicon || {}), sample = { NUM: "2", NAME: "n_v", TEXT: "t_v" };
    const valuesOf = (r) => { const ks = new Set(sch[r].kinds || []); const v = lex.filter(([, x]) => ks.has(x.kind)).map(([t]) => t); for (const k of ks) if (sample[k]) v.push(sample[k]); return v; };
    for (const ev of model.legend.events || []) {
      const evRoles = (ev.roles || []).filter((r) => sch[r]), ent = evRoles.filter(isEnt), words = evRoles.filter((r) => !isEnt(r));
      const base = {}; for (const r of ent) base[r] = sets.has(r) ? [{ head: "n_p_" + r + "_1" }, { head: "n_p_" + r + "_2" }] : { head: "n_p_" + r };
      const vals = Object.fromEntries(words.map((r) => [r, valuesOf(r)])), probes = [{}];
      for (const r of words) for (const v of vals[r]) probes.push({ [r]: v });
      const kmax = Math.max(0, ...words.map((r) => vals[r].length));
      for (let k = 0; k < kmax; k++) probes.push(Object.fromEntries(words.filter((r) => vals[r].length).map((r) => [r, vals[r][k % vals[r].length]])));
      for (const p of probes) {
        const out = toNodes({ event: ev.id, roles: Object.assign({}, base, p), verb: null, tokens: [] }, { names: {} }, { names: [], refs: new Map(), last: [] }, { s: 0, m: 0 });
        const main = out.nodes.find((n) => n.type !== "mention"); if (!main) continue;
        for (const [k, v] of Object.entries(main.args)) for (const x of [].concat(v)) {
          const m = typeof x === "string" && /^p_([a-z0-9]+?)(_\d)?$/.exec(x); if (!m) continue;
          if (!keyRole.has(k) || roleOrder.indexOf(m[1]) < roleOrder.indexOf(keyRole.get(k))) keyRole.set(k, m[1]);
        }
      }
    }
  }
  const keys = [...keyRole.keys()].sort((a, b) => roleOrder.indexOf(keyRole.get(a)) - roleOrder.indexOf(keyRole.get(b)) || (a < b ? -1 : 1));
  return { roles: roleOrder.filter((r) => roles.has(r)), keys };
}

// ---------------------------------------------------------------- the VSS layer (nothing resolved)
function patchEnt(e) {
  if (e == null) return e;
  if (Array.isArray(e)) return e.map(patchEnt);
  if (typeof e === "string") return PRON.has(e) ? "n_@" + e : e;
  return PRON.has(e.head) ? Object.assign({}, e, { head: "n_@" + e.head }) : e;
}
/** reading (readingFromWires) -> {nodes, main, defaulted}: the adapter's mapping with no reference resolved (see the head of the file).
 *  An entity role is a role whose filler is an entity (an object or a list: an entity wire of the reader); its pronoun stays a pronoun. */
export function rawNodes(reading, info, names, seq) {
  if (!reading || !reading.event) return { nodes: [], main: null, defaulted: [] };
  const roles = {};
  for (const [k, v] of Object.entries(reading.roles || {})) roles[k] = v && typeof v === "object" ? patchEnt(v) : v;
  const tokens = (reading.tokens || []).map((t) => (PRON.has(t) ? "n_@" + t : t));
  const out = toNodes(Object.assign({}, reading, { roles, tokens }), info, { names: names || [], refs: new Map(), last: [] }, seq);
  const main = out.nodes.find((n) => n.type !== "mention") || null, defaulted = [];
  const obj = reading.roles && reading.roles.object;
  if (main && reading.event === "create" && !(obj && typeof obj === "object" && Object.hasOwn(SHAPES, obj.head))) defaulted.push("shape");
  if (main && reading.event === "property" && !Object.hasOwn(PROPERTY, reading.verb)) defaulted.push("property");
  return { nodes: out.nodes, main, defaulted };
}

// ---------------------------------------------------------------- what the actions need (learned from the gold args)
const arity = (v) => (v == null ? null : Array.isArray(v) ? "n" : typeof v === "object" && v.quantifier === "all" ? "n" : /,(?![^(]*\))/.test(String(v)) || String(v).includes("quantifier=all") ? "n" : "1");
const actKey = (type, args) => `${type}:${args.action || args.ask || ""}`;
/** gold wires, the entity keys (entitySpec) -> {required: {act: [[signature, count]]}, plist: {act: {key: share of gold values that are lists}}} */
export function deriveNeeds(wires, keys) {
  const sig = {}, pl = {};
  for (const w of wires) {
    const a = w.args || {}, act = actKey(w.type, a), s = {};
    for (const k of keys) if (a[k] != null) s[k] = arity(a[k]);
    if (a.position != null) s.position = String(a.position);
    const key = JSON.stringify(s); (sig[act] = sig[act] || {})[key] = ((sig[act] || {})[key] || 0) + 1;
    for (const k of keys) if (a[k] != null) { const p = ((pl[act] = pl[act] || {})[k] = pl[act][k] || [0, 0]); p[1]++; if (arity(a[k]) === "n") p[0]++; }
  }
  const required = Object.fromEntries(Object.entries(sig).map(([a, m]) => [a, Object.entries(m)]));
  const plist = Object.fromEntries(Object.entries(pl).map(([a, m]) => [a, Object.fromEntries(Object.entries(m).map(([k, [n, d]]) => [k, +(n / d).toFixed(3)]))]));
  return { required, plist };
}
/** the entity roles an action still needs, given the roles it has: a role is needed when at least THRESH of the gold wires of that action
 *  that agree with the present roles (same roles with the same one/several arity, same position value when one is present) have it */
export const NEED_THRESH = 0.9, NEED_SUPPORT = 10;
export function missingRoles(needs, act, args, mentionArgs, keys) {
  const sigs = (needs.required || {})[act]; if (!sigs) return [];
  const q = {};
  for (const k of keys) if (args[k] != null) q[k] = Array.isArray(args[k]) ? "n" : args[k] && typeof args[k] === "object" && args[k].ref && mentionArgs && mentionArgs(args[k].ref) && mentionArgs(args[k].ref).quantifier === "all" ? "n" : "1";
  const pos = args.position != null ? String(args.position) : null;
  let match = sigs.map(([s, c]) => [JSON.parse(s), c]).filter(([s]) => Object.entries(q).every(([k, a]) => s[k] === a));
  if (pos != null) { const m2 = match.filter(([s]) => s.position === pos); if (m2.reduce((x, [, c]) => x + c, 0) >= NEED_SUPPORT) match = m2; }
  const n = match.reduce((x, [, c]) => x + c, 0); if (n < NEED_SUPPORT) return [];
  return keys.filter((k) => q[k] == null && match.reduce((x, [s, c]) => x + (s[k] != null ? c : 0), 0) / n >= NEED_THRESH);
}

// ---------------------------------------------------------------- features (shared by every role)
/** the feature names for the entity keys of a registry (entitySpec keys): role_<key> for every key, the rest fixed */
export function featureNames(keys) {
  const F = [
  "null", "null_pron", "null_vague", "null_desc", "null_empty",          // the NULL candidate ("nobody in the context"), by gap kind
  "d1", "d2", "d3p", "dnone",                                              // requests since it was last in a role (1 = the previous request); never
  ...keys.map((k) => "role_" + k), "role_created", "role_member",        // the role it had where it was last in a role
  "same_role", "same_action", "prev_main", "log_count",                   // same role as the gap; same action; the previous request's main shape; ln(1+times in a role)
  "text_last", "text_named", "in_unit", "canvas", "created",              // last name written before the unit; written before; written inside the unit; on the canvas; created
  "group", "group_plist", "confirmed",                                    // several shapes; x share of lists for this role (data); constraints confirmed
  // where a group candidate comes from (a group may come from several): read as a list in a role; the last two shapes in a role; all
  // shapes created; the shapes of the trailing run of requests with one action; all shapes in a role so far; all shapes on the canvas;
  // the names that share the stem of a plural word of the unit ("the tiles" -> Tile1..Tile4); the last two names written before the unit
  "g_list", "g_last2", "g_created", "g_run", "g_all", "g_canvas", "g_stem", "g_text2",
  ];
  // every candidate feature also has a copy per gap kind ("pron:d1", "empty:in_unit", ...): one shared weight plus a correction per gap kind
  for (const k of F.filter((f) => !f.startsWith("null"))) for (const g of GAP_KINDS) F.push(g + ":" + k);
  return F;
}
export const GAP_KINDS = ["pron", "empty", "vague", "desc"];
export function score(w, f) { let s = 0; for (const [k, v] of Object.entries(f)) s += (w[k] || 0) * v; return s; }

// ---------------------------------------------------------------- the context of one message
export class Context {
  /** text: the whole message; canvas: names already on the canvas (row.names); model: {weights, margin, needs} (weights.json) plus
   *  entity: entitySpec(worlds) of the registry (the composer adds it to the weights it loads) */
  constructor({ text = "", canvas = [], model = {} }) {
    if (!model.entity || !Array.isArray(model.entity.keys)) throw new Error("vss-context: the model has no entity keys (model.entity = entitySpec(worlds); the composer adds it)");
    this.text = text; this.model = model; this.needs = model.needs || { required: {}, plist: {} }; this.keys = model.entity.keys;
    this.ents = new Map();      // key -> {key, name, id, created, canvas, attrs, last, role, action, count}
    this.groups = new Map();    // key -> {key, members: [keys], last, role, action, count}
    this.t = 0; this.prevMain = null; this.createdOrder = [];
    for (const n of canvas) this.ent(low(n), { name: String(n), canvas: true });
    const [toks, info] = tokenize(text, canvas); this.textNames = toks.filter(([t]) => t.startsWith("n_")).map(([t, s, e]) => [t.slice(2), s, e]);
    // names written in the text (the tokenizer's capital-letter rule; "I'm", "I'd" ... are the pronoun I, a tokenization artefact)
    for (const [, raw] of Object.entries(info.names || {})) if (!this.ents.has(low(raw)) && !/^i['’]/i.test(raw)) this.ent(low(raw), { name: String(raw) });
    this.textNames = this.textNames.filter(([n]) => !/^i_/.test(n) || this.ents.has(n));
    this.firstPos = new Map(); for (const [n, s] of this.textNames) if (!this.firstPos.has(n)) this.firstPos.set(n, s);
    this.hist = [];             // per request: {act, keys} (the shapes in its roles, created included)
  }
  ent(key, init) { if (!this.ents.has(key)) this.ents.set(key, Object.assign({ key, name: null, id: null, created: false, canvas: false, attrs: {}, last: null, role: null, action: null, count: 0 }, init)); return this.ents.get(key); }
  slugOf(e) { return e.name ? low(e.name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : null; }
  /** an entity value of the args (string name, {ref} to a created shape, array) -> list of entity keys, or null (a description / pronoun) */
  keysOf(v) {
    if (v == null) return null;
    if (Array.isArray(v)) { const ks = v.map((x) => this.keysOf(x)); return ks.every((k) => k && k.length === 1) ? ks.map((k) => k[0]) : null; }
    if (typeof v === "string") return v.startsWith("@") ? null : [low(v)];
    if (v.ref && this.byId && this.byId.has(v.ref)) return [this.byId.get(v.ref)];
    return null;
  }
  /** shapes in the order they first appear in the message (text position), else the order they were first in a role, else name order
   *  with numbers compared as numbers (Rack2 before Rack10) */
  ordered(keys) {
    const pos = (k) => { const e = this.ents.get(k), sl = e && this.slugOf(e); return sl != null && this.firstPos.has(sl) ? this.firstPos.get(sl) : Infinity; };
    const first = (k) => { const e = this.ents.get(k); return e && e.first != null ? e.first : Infinity; };
    return keys.slice().sort((a, b) => (pos(a) - pos(b)) || (first(a) - first(b)) || String(a).localeCompare(String(b), "en", { numeric: true }));
  }
  valueOf(key) { const e = this.ents.get(key); return e.id ? { ref: e.id } : e.name; }

  candidates(gap, frameKeys, c0, c1) {
    const out = [], t = this.t, plist = ((this.needs.plist || {})[gap.act] || {})[gap.key] || 0;
    const textBefore = this.textNames.filter(([, s]) => s < c0), inUnit = new Set(this.textNames.filter(([, s]) => s >= c0 && s < c1).map(([n]) => n));
    const lastText = textBefore.length ? textBefore[textBefore.length - 1][0] : null, named = new Set(textBefore.map(([n]) => n));
    const base = (x) => {
      const f = {}, d = x.last == null ? null : t - x.last;
      if (d == null) f.dnone = 1; else if (d <= 1) f.d1 = 1; else if (d === 2) f.d2 = 1; else f.d3p = 1;
      if (x.role) f["role_" + x.role] = 1;
      if (x.role === gap.key) f.same_role = 1;
      if (x.action && x.action === gap.act) f.same_action = 1;
      if (x.count) f.log_count = Math.log(1 + x.count);
      return f;
    };
    const single = gap.kind !== "pron" || gap.plural === false, several = gap.kind === "empty" || (gap.kind === "pron" && gap.plural === true) || (gap.kind === "vague" && gap.plural === true);
    if (single) for (const e of this.ents.values()) {
      if (frameKeys.has(e.key)) continue;
      if (gap.recency && !e.created) continue;
      let conf = 0, bad = false;
      for (const [k, v] of Object.entries(gap.constraints || {})) { if (e.attrs[k] == null) bad = true; else if (low(e.attrs[k]) !== low(v)) bad = true; else conf++; }
      if (bad) continue;
      const s = this.slugOf(e), f = base(e);
      if (s && s === lastText) f.text_last = 1; if (s && named.has(s)) f.text_named = 1; if (s && inUnit.has(s)) f.in_unit = 1;
      if (e.canvas) f.canvas = 1; if (e.created) f.created = 1; if (this.prevMain === e.key) f.prev_main = 1; if (conf) f.confirmed = conf;
      if (e.last == null && !f.text_named && !f.in_unit && !e.created && !gap.constraints) { if (!e.canvas) continue; }   // known only by name
      out.push({ kind: "single", keys: [e.key], f });
    }
    if (several && !gap.constraints && !gap.recency) {
      const G = new Map(), add = (members, flag, info) => {
        const ks = [...new Set(members)].filter((k) => this.ents.has(k)); if (ks.length < 2 || ks.some((k) => frameKeys.has(k))) return;
        const id = ks.slice().sort().join("|"), natural = flag === "g_stem" || flag === "g_canvas";   // a group named by a stem / the canvas has no text order: name order
        const g = G.get(id) || { members: natural ? ks.slice().sort((x, y) => String(x).localeCompare(String(y), "en", { numeric: true })) : this.ordered(ks), flags: {}, last: null, role: null, action: null, count: 0 };
        g.flags[flag] = 1; if (info && info.last != null && (g.last == null || info.last > g.last)) Object.assign(g, { last: info.last, role: info.role, action: info.action, count: Math.max(g.count, info.count || 0) });
        G.set(id, g);
      };
      for (const g of this.groups.values()) add(g.members, "g_list", g);
      const inRole = [...this.ents.values()].filter((e) => e.last != null).sort((a, b) => b.last - a.last || b.order - a.order);
      if (inRole.length >= 2) add(inRole.slice(0, 2).map((e) => e.key), "g_last2", { last: inRole[0].last, role: "member" });
      if (this.createdOrder.length >= 2) add(this.createdOrder, "g_created", { last: this.ents.get(this.createdOrder[this.createdOrder.length - 1]).last, role: "created" });
      if (this.hist.length) { const a0 = this.hist[this.hist.length - 1].act, run = []; for (let k = this.hist.length - 1; k >= 0 && this.hist[k].act === a0; k--) run.push(...this.hist[k].keys); add(run, "g_run", { last: t, role: "member", action: a0 }); }
      add(inRole.map((e) => e.key), "g_all", { last: inRole.length ? inRole[0].last : null, role: "member" });
      add([...this.ents.values()].filter((e) => e.canvas).map((e) => e.key), "g_canvas", null);
      for (const wd of gap.unitWords || []) { if (wd.length < 4 || !wd.endsWith("s")) continue; const stem = wd.replace(/e?s$/, ""); if (stem.length < 2) continue;
        add([...this.ents.values()].filter((e) => { const n = this.slugOf(e); return n && n.length > stem.length && n.startsWith(stem) && /^[_0-9a-z]{1,3}$/.test(n.slice(stem.length)) && /\d|^_?[a-z]$/.test(n.slice(stem.length)); }).map((e) => e.key), "g_stem", null); }
      { const tb = [...new Set(textBefore.map(([n]) => n).reverse())].filter((n) => this.ents.has(n)).slice(0, 2); if (tb.length === 2) add(tb, "g_text2", null); }
      for (const g of G.values()) {
        const f = base(g); f.group = 1; f.group_plist = plist; Object.assign(f, g.flags);
        if (g.members.includes(this.prevMain)) f.prev_main = 1;
        out.push({ kind: "group", keys: g.members, f });
      }
    }
    for (const c of out) for (const [k, v] of Object.entries(c.f)) c.f[gap.kind + ":" + k] = v;
    const nf = { null: 1 }; nf["null_" + gap.kind] = 1;
    out.push({ kind: "null", keys: [], f: nf });
    return out;
  }

  /** decide one gap: oracle(cands) -> index (training: teacher forcing) or the model; -> {cands, scores, best, margin, decision} */
  decide(cands, oracle) {
    const w = this.model.weights || {}, scores = cands.map((c) => score(w, c.f));
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const best = order[0][1], margin = order.length > 1 ? order[0][0] - order[1][0] : Infinity;
    if (oracle) { const k = oracle(cands); return { scores, best, margin, pick: k >= 0 && cands[k].kind !== "null" ? k : -1, decision: k >= 0 && cands[k].kind !== "null" ? "fill" : "ask" }; }
    const m = this.model.margin != null ? this.model.margin : 0;
    if (cands[best].kind === "null" || margin < m) return { scores, best, margin, pick: -1, decision: "ask" };
    return { scores, best, margin, pick: best, decision: "fill" };
  }

  /** one produced request: raw = rawNodes(...) of its unit; span [c0, c1] of the unit in the message; opts.oracle(gap, cands) -> index;
   *  opts.dry: try the request without entering it into the context (chooseReading).
   *  -> {main (resolved, ids of raw nodes), gaps: [{key, kind, cands, ...decision}], asked} */
  step(raw, c0, c1, opts = {}) {
    if (!raw || !raw.main) return null;
    this.byId = this.byId || new Map();
    const mentions = new Map(raw.nodes.filter((n) => n.type === "mention").map((n) => [n.id, n.args]));
    const main = { id: raw.main.id, type: raw.main.type, args: JSON.parse(JSON.stringify(raw.main.args)) }, a = main.args, act = actKey(main.type, a);
    for (const k of raw.defaulted || []) if (k === "property") { /* the adapter's default stays: not an entity role */ }
    // names read by VSS that are shapes created earlier in the message -> those shapes (what the adapter does today with ctx.refs)
    const toCreated = (v) => { if (typeof v === "string" && !v.startsWith("@")) { const e = this.ents.get(low(v)); return e && e.id ? { ref: e.id } : v; } return Array.isArray(v) ? v.map(toCreated) : v; };
    for (const k of this.keys) if (a[k] != null) a[k] = toCreated(a[k]);
    const gaps = [], frameKeys = new Set();
    for (const k of this.keys) for (const x of [].concat(a[k] == null ? [] : a[k])) { const ks = this.keysOf(x); if (ks) ks.forEach((y) => frameKeys.add(y)); }
    if (a.action === "create" && a.name != null) frameKeys.add(low(a.name));      // the shape this request creates is not its own anchor
    const findGaps = () => {
      const gs = [];
      for (const k of this.keys) {
        const v = a[k]; if (v == null) continue;
        if (typeof v === "string" && v.startsWith("@")) gs.push({ key: k, act, kind: "pron", plural: v === "@them", word: v });
        else if (Array.isArray(v)) {
          const named = v.filter((x) => this.keysOf(x)).length;
          // a pronoun inside a list that already names two or more shapes points back to that list ("A to B to C, chain them"): dropped
          v.forEach((x, i) => { if (typeof x === "string" && x.startsWith("@")) gs.push(named >= 2 ? { key: k, act, kind: "pron", word: x, index: i, decision: "dropped", rule: "pronoun inside a named list", cands: [] } : { key: k, act, kind: "pron", plural: x === "@them", word: x, index: i }); });
        }
        else if (typeof v === "object" && v.ref && mentions.has(v.ref)) {
          const m = mentions.get(v.ref);
          if (m.quantifier === "all" || m.recency) continue;                          // a set description, or "the newest / oldest ...": the engine's
          const cons = {}; if (m.shape) cons.shape = m.shape; if (m.color) cons.color = m.color;
          if (Object.keys(cons).length) gs.push({ key: k, act, kind: "desc", constraints: cons, plural: false, mention: v.ref });
          else gs.push({ key: k, act, kind: "vague", plural: false, recency: m.recency || null, mention: v.ref });
        }
      }
      for (const k of missingRoles(this.needs, act, a, (id) => mentions.get(id), this.keys)) gs.push({ key: k, act, kind: "empty", plural: null });
      return gs;
    };
    for (let pass = 0; pass < 2; pass++) {
      const gs = findGaps().filter((g) => !gaps.some((h) => h.key === g.key && h.index === g.index));
      if (!gs.length) break;
      for (const g of gs) {
        if (g.decision === "dropped") { gaps.push(g); continue; }
        g.unitWords = (opts.unitText != null ? opts.unitText : this.text.slice(c0, c1)).toLowerCase().match(/[a-z]+/g) || [];
        const cands = this.candidates(g, frameKeys, c0, c1);
        const d = this.decide(cands, opts.oracle ? (cs) => opts.oracle(g, cs) : null);
        Object.assign(g, d, { cands });
        if (d.decision === "fill") {
          const c = cands[d.pick], val = c.kind === "group" ? c.keys.map((x) => this.valueOf(x)) : this.valueOf(c.keys[0]);
          if (g.index != null) a[g.key][g.index] = val; else a[g.key] = val;
          c.keys.forEach((x) => frameKeys.add(x));
        } else if (g.kind === "desc") { g.decision = "left"; }                         // a description with no confirmed shape: the engine's
        else if (g.kind === "vague" && !this.needed(act, g.key, a, mentions)) g.decision = "dropped";   // "the diagram", "this" in a role the action does not need: dropped, the request runs
        gaps.push(g);
      }
    }
    // dropped references leave the args (list elements first, from the end)
    for (const g of gaps.filter((x) => x.decision === "dropped").sort((x, y) => (y.index ?? -1) - (x.index ?? -1))) {
      if (g.index != null && Array.isArray(a[g.key])) { a[g.key].splice(g.index, 1); if (a[g.key].length === 1) a[g.key] = a[g.key][0]; } else delete a[g.key];
    }
    const asked = gaps.some((g) => g.decision === "ask");
    if (!opts.dry) this.update(main, act);
    return { main, gaps, asked };
  }

  /** does the action need role `key`, given its other roles? (missingRoles on the args without that role) */
  needed(act, key, args, mentions) { const b = Object.assign({}, args); delete b[key]; return missingRoles(this.needs, act, b, (id) => mentions.get(id), this.keys).includes(key); }

  /** the request's resolved args enter the context */
  update(main, act) {
    const a = main.args, t = ++this.t;
    this.byId = this.byId || new Map();
    const keysHere = [], touch = (key, role) => { const e = this.ents.get(key) || this.ent(key, { name: key }); e.last = t; e.role = role; e.action = act; e.count++; e.order = (this.ord = (this.ord || 0) + 1); if (e.first == null) e.first = e.order; keysHere.push(key); return e; };
    let mainKey = null;
    if (a.action === "create") {
      const key = a.name != null && !a.count ? low(a.name) : main.id;
      const e = this.ent(key, { name: a.name != null ? String(a.name) : null }); e.id = main.id; e.created = true;
      for (const k of ["shape", "color", "size"]) if (a[k] != null) e.attrs[k] = a[k];
      this.byId.set(main.id, key); this.createdOrder.push(key); touch(key, "created"); mainKey = key;
    }
    for (const k of this.keys) {
      const ks = this.keysOf(a[k]); if (!ks) continue;
      for (const x of ks) { const e = touch(x, ks.length > 1 ? "member" : k); if (!e.name && !e.id) e.name = x; }
      if (ks.length > 1) { const id = ks.join("|"), g = this.groups.get(id) || { key: id, members: ks, count: 0 }; g.last = t; g.role = k; g.action = act; g.count++; this.groups.set(id, g); }
      if (mainKey == null && (k === "target" || k === "from") && ks.length === 1) mainKey = ks[0];
    }
    if (a.action === "set" || a.action === "fact") { const ks = this.keysOf(a.target); if (ks) for (const x of ks) for (const k of ["shape", "color", "size"]) if (a[k] != null) this.ents.get(x).attrs[k] = a[k]; }
    this.prevMain = mainKey; this.hist.push({ act, keys: keysHere });
  }
}

// ---------------------------------------------------------------- a tie of readings (the composer with router "cutter", ROUTER_V2.md)
/** Several VSS readings of one unit that leave the same fewest words not understood (vss-composer.js, router "cutter"): the VSS layer
 *  does not ask; this layer decides from the message context. Each reading (raw = rawNodes(...)) is tried on the context without changing
 *  it (step, dry). A reading FITS when the context completes it (no gap left to ask). One reading fits -> it wins ("context"). Several
 *  fit, or none -> the first of them in the given order wins ("order": the caller's order is the cutter's rank; as with margin 0 for the
 *  gaps, the first-ranked is taken rather than asking; when none fits, the step that follows asks about its gap).
 *  -> {index, by: "context" | "order", fits: [bool]} */
export function chooseReading(ctx, raws, c0, c1) {
  const fits = raws.map((raw) => { const st = ctx.step(raw, c0, c1, { dry: true }); return !!st && !st.asked; });
  const ok = fits.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (ok.length === 1) return { index: ok[0], by: "context", fits };
  return { index: ok.length ? ok[0] : 0, by: "order", fits };
}
