// reader.js — kinds, the chart, the decoder, the residual / status and the frame -> wires step (mirrors tool/sop/infer.py Reader,
// tool/sop/legend.py Legend.kind / tokenize and tool/sop/world.py Compiler). One call: reader.formalize(text, sentence, ids).
import { Wire, line } from "./soplang.js";
import { sigmoid } from "./routebook.js";

const PUNCT = /([.,;:!?](?=\s|$))/g;
export function tokenize(text) { return text.replace(PUNCT, " $1 ").split(/\s+/).filter(Boolean); }

const OPERATOR_KEYS = { not: ["scope"], must: ["scope"], may: ["scope"], if: ["condition", "consequence"], says: ["speaker", "scope"], and: ["items"] };
const ENTITY_KEYS = ["head", "attr", "quantity", "unit", "det"];
export const fmt = (x) => x.toFixed(3);

// ---------------- complex vector helpers ({re, im} Float64Array)
const cz = (D) => ({ re: new Float64Array(D), im: new Float64Array(D) });
function cmul(a, b) { const D = a.re.length, o = cz(D); for (let i = 0; i < D; i++) { o.re[i] = a.re[i] * b.re[i] - a.im[i] * b.im[i]; o.im[i] = a.re[i] * b.im[i] + a.im[i] * b.re[i]; } return o; }
function cconj(a) { return { re: a.re, im: a.im.map((x) => -x) }; }
function cmulc(a, b) { const D = a.re.length, o = cz(D); for (let i = 0; i < D; i++) { o.re[i] = a.re[i] * b.re[i] + a.im[i] * b.im[i]; o.im[i] = a.im[i] * b.re[i] - a.re[i] * b.im[i]; } return o; }   // a * conj(b)
function cadd(a, b, s = 1) { const D = a.re.length, o = cz(D); for (let i = 0; i < D; i++) { o.re[i] = a.re[i] + s * b.re[i]; o.im[i] = a.im[i] + s * b.im[i]; } return o; }
function cscale(a, s) { return { re: a.re.map((x) => x * s), im: a.im.map((x) => x * s) }; }
function cnorm(a) { let s = 0; for (let i = 0; i < a.re.length; i++) s += a.re[i] * a.re[i] + a.im[i] * a.im[i]; return Math.sqrt(s); }
function cone(D) { const o = cz(D); o.re.fill(1); return o; }
function cpow(a, k) { let o = cone(a.re.length); for (let i = 0; i < k; i++) o = cmul(o, a); return o; }
function cdotRe(m, x) { let s = 0; for (let i = 0; i < x.re.length; i++) s += m.re[i] * x.re[i] + m.im[i] * x.im[i]; return s; }   // Re(conj(m) . x)
export { cnorm };

// ---------------- legend
export class Legend {
  constructor(model) {
    const d = model.legend; this.raw = d; this.sha = model.legend_sha256;
    this.roles = (d.roles || []).map((r) => r.id); this.events = {}; for (const e of d.events || []) this.events[e.id] = e.verbs || [];
    // per-event role sets (infer.py / legend.py, Q12 / D19): roles = the roles the event takes, required = the roles it cannot do without
    this.eventRoles = {}; this.eventRequired = {};
    for (const e of d.events || []) { if (e.roles != null) this.eventRoles[e.id] = [...e.roles]; if (e.required != null) this.eventRequired[e.id] = [...e.required]; }
    this.operators = d.operators || []; this.moods = d.moods || ["statement"]; this.reader = model.reader;
    this.values = (d.values || []).map((v) => [v.kind, new RegExp("^(?:" + v.pattern + ")$")]);
    this.lexicon = new Map(); this.lemmaMap = new Map();
    for (const [w, e] of Object.entries(model.lexicon || {})) { this.lexicon.set(w, e.kind); if (e.lemma) this.lemmaMap.set(w, e.lemma); }
    this.verbEvent = new Map(); for (const [e, vs] of Object.entries(this.events)) for (const v of vs) this.verbEvent.set(v, e);
  }
  kind(tok) {
    if (this.lexicon.has(tok)) return this.lexicon.get(tok);
    if (this.lexicon.has(tok.toLowerCase())) return this.lexicon.get(tok.toLowerCase());
    for (const [k, re] of this.values) if (re.test(tok)) return k;
    return null;
  }
  lemmaOf(tok) { return this.lemmaMap.has(tok) ? this.lemmaMap.get(tok) : (this.lemmaMap.has(tok.toLowerCase()) ? this.lemmaMap.get(tok.toLowerCase()) : tok); }
  eventOfLemma(l) { return this.verbEvent.has(l) ? this.verbEvent.get(l) : null; }
  allVerbs() { return [...this.verbEvent.keys()].sort(); }
  keysFor(t) {
    if (Object.hasOwn(this.events, t)) return new Set(this.roles);
    if (t === "entity") return new Set(ENTITY_KEYS);
    if (Object.hasOwn(OPERATOR_KEYS, t)) return new Set(OPERATOR_KEYS[t]);
    if (t === "verdict") return new Set(["left", "right"]);
    return new Set();
  }
}

// ---------------- frames (world.frame_of / filler_words subset used by the reader)
export function fillerWords(fl) {
  if (!fl) return [];
  if (fl[0] === "word" || fl[0] === "negword") return [fl[1]];
  if (fl[0] === "entity") return [fl[1], fl[3]].filter((x) => x) .concat(fillerWords(fl[2]));
  if (fl[0] === "set" || fl[0] === "alt") return fl.slice(1).flatMap(fillerWords);
  if (fl[0] === "not") return fillerWords(fl[1]);
  return [];
}

export class Reader {
  constructor(model, rb, stars, opts = {}) {
    this.model = model; this.cfg = model.config; this.rb = rb; this.st = stars; this.D = rb.D; this.legend = new Legend(model);
    this.words = new Map(Object.entries(model.catalog.words)); this.schema = model.schema; this.th = this.cfg.thresholds || {};
    this.tau = this.th.tau !== undefined ? this.th.tau : 0.05; this.contentKinds = new Set(this.schema.content_kinds || []);
    const rr = this.legend.reader; this.closed = rr.closed_values || {}; this.tableRoles = new Set(rr.table_roles || []); this.setRoles = new Set(rr.set_roles || []);
    if (this.tableRoles.size || rr.value_identity === "bundle_alnum")
      throw new Error("vss.js: table roles and bundle_alnum value identities (the WikiSQL world) are not ported");   // set roles: ported here (diagram-vss-demo)
    this.sentenceCandidates = !!opts.sentenceCandidates; this.sentTokens = []; this._cands = new Map(); this.sqrtD = Math.sqrt(this.D); this.filt = null;
    this.centres = !!rr.centres;          // the centre reader (legend reader.centres, chosen by the world): readMessage
    this.excl = opts.excl || null;        // switch EXCL (training/sketch/DECODE.md): {event: [[a, b], ...]}, decode.json excl_pairs; null = off
  }
  /** EXCL (infer.Reader.exclude; training/sketch/DECODE.md): of two roles of the decided event that the training frames never give
   *  together (decode.json excl_pairs, learned by tool/sop/decode_stats.py), both given, only the one with the larger presence ratio /
   *  threshold is kept (ties keep the first of the pair) */
  exclude(f) {
    const thp = this.th.presence || {}, sc = (r) => (f.presence[r] ?? 0) / Math.max(1e-9, thp[r] ?? 1);
    for (const [a, b] of this.excl[f.event]) {
      if (!f.roles[a] || !f.roles[b]) continue;
      const drop = sc(a) >= sc(b) ? b : a;
      delete f.roles[drop];
      for (const k of Object.keys(f.margins)) if (k === drop || k.startsWith(drop + ".")) delete f.margins[k];
      if (f.identity_margins) delete f.identity_margins[drop];
      if (f.det_best) delete f.det_best[drop];
      if (f.runner_up) delete f.runner_up[drop];
      (f.excluded = f.excluded || {})[drop] = drop === a ? b : a;
    }
  }
  // ---------------- words
  wordEntry(tok) { return this.words.get(tok) || this.words.get(tok.toLowerCase()) || null; }
  kind(tok) { const e = this.wordEntry(tok); return e ? e.kind : this.legend.kind(tok); }
  lemma(tok) { const e = this.wordEntry(tok); return (e && e.lemma) || tok; }
  /** the word whose star stands for a token: the token, or its lemma when legend reader.identity = "lemma" (tool/sop/infer.py ident) */
  ident(tok) { return this.legend.reader.identity === "lemma" ? this.lemma(tok) : tok; }
  _rows(ws, f) {
    const M = []; for (const w of ws) { const v = f(w); if (!v) throw new Error(`vss.js: no star for ${JSON.stringify(w)} (star_version 1 model: only exported stars)`); M.push(cscale(v, 1 / this.sqrtD)); }
    return M;
  }
  cands(kinds) {
    let extra = [];
    const ks = new Set(kinds), filt = this.filt;      // filt (infer.Reader filt): the sentence-candidates decoder restricts to the sentence's words
    if (this.sentenceCandidates && this.sentTokens.length)
      extra = [...new Set(this.sentTokens.filter((t) => !this.words.has(t) && !this.words.has(t.toLowerCase()) && ks.has(this.kind(t))))].sort();
    const key = JSON.stringify([[...kinds].sort(), extra, filt ? [...filt].sort() : null]);
    if (!this._cands.has(key)) {
      if (this._cands.size > 4000) this._cands.clear();
      let ws = [...this.words.keys()].filter((w) => ks.has(this.words.get(w).kind) && (!filt || filt.has(w))).sort().concat(extra.filter((t) => !filt || filt.has(t)));
      if (this.legend.reader.identity === "lemma") ws = [...new Set(ws.map((w) => this.ident(w)))];   // one candidate per canonical value
      this._cands.set(key, [ws, this._rows(ws, (w) => this.st.id(w))]);
    }
    return this._cands.get(key);
  }
  static headOf(fl) { return fl && (fl[0] === "entity" || fl[0] === "word" || fl[0] === "negword") ? fl[1] : null; }
  /** the one-to-one rule of the sentence-candidates decoder (infer.Reader.one_to_one): a word fills at most one role */
  oneToOne(Sn, K, core, f, filt, presence) {
    const toks = this.sentTokens, occ = (h) => Math.max(1, toks.filter((t) => t === h || t.toLowerCase() === String(h).toLowerCase()).length);
    const rep = cconj(this.st.op("says.scope")), spk = this.st.op("says.speaker"), excl = new Map();   // per question, the words it lost (accumulated)
    const clear = (kind, r) => {
      if (kind === "role") { delete f.roles[r]; delete f.margins[r]; (f.one_to_one = f.one_to_one || {})[r] = "not given"; }
      else { f.speakers[r] = null; f.margins[`speaker.${r}`] = 0; (f.one_to_one = f.one_to_one || {})[`speaker.${r}`] = "not given"; }
    };
    for (let round = 0; round < 5; round++) {
      const heads = new Map(), add = (h, x) => { if (!heads.has(h)) heads.set(h, []); heads.get(h).push(x); };
      for (const [r, fl] of Object.entries(f.roles)) { const h = Reader.headOf(fl); if (h !== null) add(h, ["role", r, f.margins[r] || 0]); }
      f.speakers.forEach((sp, k) => { if (sp !== null && sp !== undefined) add(sp, ["speaker", k, f.margins[`speaker.${k}`] || 0]); });
      const dup = [...heads].filter(([h, sl]) => sl.length > occ(h));
      if (!dup.length) return;
      const last = round === 4;
      for (const [h, sl0] of dup) {
        const sl = [...sl0].sort((a, b) => b[2] - a[2]);
        for (const [kind, r] of sl.slice(occ(h))) {
          const key = `${kind}:${r}`; if (!excl.has(key)) excl.set(key, new Set()); const ex = excl.get(key); ex.add(String(h).toLowerCase());
          if (last) { clear(kind, r); continue; }
          const sub = new Set([...filt].filter((w) => !ex.has(w.toLowerCase())));
          const saved = this.filt; this.filt = sub;
          if (kind === "role") {
            const o = this.readRole(Sn, K, r, core, presence); this.filt = saved;
            if (o.present && o.filler && Reader.headOf(o.filler) !== null) { f.roles[r] = o.filler; Object.assign(f.margins, o.margins); (f.one_to_one = f.one_to_one || {})[r] = "re-read"; }
            else clear(kind, r);
          } else {
            const [w, mg] = Reader.best(cmulc(cmul(Sn, cpow(rep, r)), spk), this.cands(this.schema.speaker_kinds)); this.filt = saved;
            f.speakers[r] = w; f.margins[`speaker.${r}`] = w !== null ? mg : 0; (f.one_to_one = f.one_to_one || {})[`speaker.${r}`] = w !== null ? "re-read" : "not given";
          }
        }
      }
    }
  }
  roleCands(r) {
    if (Object.hasOwn(this.closed, r)) {
      const key = "__closed:" + r;
      if (!this._cands.has(key)) {
        const ws = [...this.closed[r]], M = ws.map((w) => { const v = this.st.val(w, r, this.legend.reader); return cscale(v, 1 / cnorm(v)); });
        this._cands.set(key, [ws, M]);
      }
      return this._cands.get(key);
    }
    const rs = this.schema.roles[r];
    return this.cands(rs.main === "entity" ? rs.head_kinds : rs.kinds);
  }
  /** opts.event of read / formalize (EVENT_HINT.md): the event given by the caller, when the world has a predicate role and the event is
   *  one of its legend with at least one verb lemma among the predicate's candidates; else null (the option does nothing) */
  hintEvent(opts) {
    const e = opts ? opts.event : null;
    if (e === null || e === undefined || !this.legend.reader.predicate_role || !Object.hasOwn(this.legend.events, e)) return null;
    const vs = new Set(this.verbCands()[0]);
    return this.legend.events[e].some((l) => vs.has(l)) ? e : null;
  }
  verbCands() {
    if (!this._cands.has("__verbs")) { const ws = this.legend.allVerbs(); this._cands.set("__verbs", [ws, this._rows(ws, (w) => this.st.id(w))]); }
    return this._cands.get("__verbs");
  }
  // ---------------- chart
  encode(tokens) {
    const kept = [], cidx = [], unknown = [];
    tokens.forEach((t, i) => {
      let k = this.kind(t);
      if (k === null || k === undefined || k === "unknown" || !this.rb.catId.has(k)) {
        unknown.push(i);
        if (!this.rb.catId.has("unknown")) return;
        k = "unknown";
      }
      kept.push(i); cidx.push(this.rb.catId.get(k));
    });
    return [kept, cidx, unknown];
  }
  chart(tokens) {
    const [kept, cidx, unknown] = this.encode(tokens), D = this.D, S = cz(D);
    if (!kept.length) return [S, kept, unknown];
    const addr = this.rb.addresses(cidx);
    kept.forEach((i, j) => {
      const F = this.st.id(this.ident(tokens[i]));
      if (!F) return;          // a star_version 1 model has no star for a word outside its catalog: the word adds nothing (stars.missing lists it)
      const a = addr[j];
      for (let d = 0; d < D; d++) { S.re[d] += a.re[d] * F.re[d] - a.im[d] * F.im[d]; S.im[d] += a.re[d] * F.im[d] + a.im[d] * F.re[d]; }
    });
    return [S, kept, unknown];
  }
  // ---------------- readout
  static best(x, [ws, M]) {
    if (!ws.length) return [null, 0, 0];
    const sc = M.map((m) => cdotRe(m, x));
    if (ws.length === 1) return [ws[0], sc[0], sc[0]];
    let i1 = 0; for (let i = 1; i < sc.length; i++) if (sc[i] > sc[i1]) i1 = i;
    let i2 = i1 === 0 ? 1 : 0; for (let i = 0; i < sc.length; i++) if (i !== i1 && sc[i] > sc[i2]) i2 = i;
    return [ws[i1], sc[i1] - sc[i2], sc[i1], ws[i2]];      // the 4th element (runner-up) is for the dialog only, not part of parity
  }
  fillerTop(Sn, key, r) {
    if (Object.hasOwn(this.closed, r)) return Reader.best(cmul(Sn, key), this.roleCands(r));
    const rs = this.schema.roles[r];
    return Reader.best(cmul(Sn, key), this.cands(rs.main === "entity" ? rs.head_kinds : rs.kinds));
  }
  structureScore(Sn, K) {
    // the structure anchor (infer.py structure_score, vss-vs-bert 7ce5c50 / R79): the core roles, or with neither core roles nor a predicate
    // role every role of the schema (weak when most roles are absent)
    const core = (this.schema.core_roles || []).length ? this.schema.core_roles : (this.legend.reader.predicate_role ? [] : (this.schema.role_order || []));
    const tops = core.map((r) => this.fillerTop(Sn, cmulc(K, this.st.role(r)), r)[2]);
    if (this.legend.reader.predicate_role) tops.push(Reader.best(cmulc(cmul(Sn, K), this.st.op("pred")), this.verbCands())[2]);
    return tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length : 0;
  }
  // a SET role (legend reader.set_roles): every candidate whose ratio reaches the calibrated member threshold is a member; the twin of
  // infer.py read_set_role (ported in diagram-vss-demo for lists of shapes: "connect A, B and C in a chain")
  readSetRole(Sn, key, r, core, presence) {
    const [ws, M] = this.roleCands(r), out = { margins: {} };
    if (!ws.length) { out.presence = 0; out.present = false; return out; }
    const x = cmul(Sn, key), sc = M.map((m) => cdotRe(m, x)), ratio = sc.map((v) => (core > 1e-9 ? v / core : 0 * v));
    const thr = (this.th.set_member || {})[r];
    let i0 = 0; sc.forEach((v, i) => { if (v > sc[i0]) i0 = i; });
    // the role's own presence threshold decides first whether the set role is in the sentence (the twin of the infer.py patch)
    const pthr = (this.th.presence || {})[r], top = Math.max(...ratio);
    if (presence !== "all" && pthr !== undefined && pthr !== null && top < pthr) { out.presence = top; out.present = false; out.presence_margin = pthr - top; return out; }
    let mem = ws.map((_, i) => i).filter((i) => (thr !== undefined && thr !== null ? ratio[i] >= thr : i === i0));
    if (presence === "all" && !mem.length) mem = [i0];
    out.presence = Math.max(...ratio); out.member_ratios = Object.fromEntries(ws.map((w, i) => [w, ratio[i]])); out.present = mem.length > 0;
    if (thr !== undefined && thr !== null && presence !== "all") out.presence_margin = Math.min(...ratio.map((v) => Math.abs(v - thr)));
    if (!mem.length) return out;
    const non = ws.map((_, i) => i).filter((i) => !mem.includes(i));
    out.margins[r] = Math.min(...mem.map((i) => sc[i])) - (non.length ? Math.max(...non.map((i) => sc[i])) : 0);
    const ents = mem.map((i) => ["entity", ws[i], null, null]).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    out.filler = ents.length === 1 ? ents[0] : ["set", ...ents];
    return out;
  }
  readRole(Sn, K, r, core, presence) {
    const key = cmulc(K, this.st.role(r));
    if (this.setRoles.has(r)) return this.readSetRole(Sn, key, r, core, presence);
    if (Object.hasOwn(this.closed, r)) {
      const [w, mg, top] = Reader.best(cmul(Sn, key), this.roleCands(r)), out = { margins: {}, presence: core > 1e-9 ? top / core : 0, present: w !== null };
      if (w !== null) { out.filler = ["word", w]; out.margins[r] = mg; }
      return out;
    }
    const rs = this.schema.roles[r], out = { margins: {} };
    let pres;
    if (this.legend.reader.occupancy_marker) pres = cdotRe(cscale(this.st.marker(), 1 / this.sqrtD), cmul(Sn, key));
    else pres = this.fillerTop(Sn, key, r)[2];
    const ratio = core > 1e-9 ? pres / core : 0; out.presence = ratio;
    const thr = (this.th.presence || {})[r];
    let present = (thr !== undefined && thr !== null) ? ratio >= thr : rs.rate >= 0.5;
    if (presence === "all") present = true;
    out.present = present;
    if (thr !== undefined && thr !== null && presence !== "all") out.presence_margin = Math.abs(ratio - thr);
    if (!present) return out;
    if (rs.main === "entity") {
      const [h, mg, top, h2] = Reader.best(cmul(Sn, key), this.cands(rs.head_kinds)); out.margins[r] = mg; out.runnerUp = h2;
      if (h === null || h === undefined) { out.filler = null; out.no_candidate = true; delete out.margins[r]; delete out.runnerUp; return out; }   // same rule for an entity head (infer.py, D5)
      let attr = null;
      if (rs.attr_kinds && rs.attr_kinds.length) {
        const ka = cmulc(key, this.st.op("attr")), ca = this.cands(rs.attr_kinds);
        let a1 = Reader.best(cmul(Sn, ka), ca), neg = false;
        if (rs.attr_neg) { const a2 = Reader.best(cmulc(cmul(Sn, ka), this.st.op("not")), ca); if (a2[2] > a1[2]) { a1 = a2; neg = true; } }
        const aratio = top > 1e-9 ? a1[2] / top : 0, athr = (this.th.attr_presence || {})[r]; out.attr_ratio = aratio;
        // vss-demo Q1 / D1 (infer.py): an attribute (or determiner) is given only when a candidate exists
        if (a1[0] !== null && a1[0] !== undefined && ((athr !== undefined && athr !== null) ? aratio >= athr : (rs.attr_rate || 0) >= 0.5)) { attr = [neg ? "negword" : "word", a1[0]]; out.margins[r + ".attr"] = a1[1]; }
      }
      let det = null;
      if (rs.det_kinds && rs.det_kinds.length) {
        const d1 = Reader.best(cmulc(cmul(Sn, key), this.st.op("det")), this.cands(rs.det_kinds));
        const dratio = top > 1e-9 ? d1[2] / top : 0, dthr = (this.th.det_presence || {})[r]; out.det_ratio = dratio; out.det_best = [d1[0], d1[1]];
        if (d1[0] !== null && d1[0] !== undefined && ((dthr !== undefined && dthr !== null) ? dratio >= dthr : (rs.det_rate || 0) >= 0.5)) { det = d1[0]; out.margins[r + ".det"] = d1[1]; }
      }
      out.filler = ["entity", h, attr, det];
    } else {
      const c = this.cands(rs.kinds); let w1 = Reader.best(cmul(Sn, key), c), neg = false;
      if (rs.negword) { const w2 = Reader.best(cmulc(cmul(Sn, key), this.st.op("not")), c); if (w2[2] > w1[2]) { w1 = w2; neg = true; } }
      if (w1[0] === null || w1[0] === undefined) { out.filler = null; out.no_candidate = true; }      // present by the threshold, no admissible word in the sentence: not given (vss-demo Q4 / D5)
      else { out.filler = [neg ? "negword" : "word", w1[0]]; out.margins[r] = w1[1]; out.runnerUp = w1[3]; }
    }
    return out;
  }
  depthFromGates(tokens) {
    const ops = new Set(this.legend.reader.level_openers || []);
    if (!ops.size) return null;
    const ks = tokens.map((t) => this.kind(t)), gate = (k) => (k !== null && this.rb.catId.has(k) ? sigmoid(this.rb.logits.data[this.rb.catId.get(k)]) : 0);
    let n = 0; ks.forEach((k, i) => { if (ops.has(k) && (gate(k) >= 0.5 || (i + 1 < ks.length && gate(ks[i + 1]) >= 0.5))) n++; });
    return n;
  }
  depthFromKinds(tokens) {
    const ops = new Set(this.legend.reader.level_openers || []);
    return ops.size ? tokens.filter((t) => ops.has(this.kind(t))).length : null;
  }
  read(S, tokens, opts = {}) {
    const estimator = opts.estimator || "gates", presence = opts.presence || "decided";
    this.sentTokens = tokens ? [...tokens] : [];
    const nS = cnorm(S), f = { speakers: [], neg: false, event: null, roles: {}, shape: "ok", lemma: null, margins: {}, presence: {} };
    if (nS < 1e-9) { f.shape = "unknown"; return f; }
    const Sn = cscale(S, 1 / nS), sch = this.schema, rep = cconj(this.st.op("says.scope")), nott = cconj(this.st.op("not"));
    const negs = sch.neg_event ? [false, true] : [false], dmax = this.legend.operators.includes("says") ? sch.max_depth + 1 : 0;
    const Kof = (d, n) => { let K = cpow(rep, d); if (n) K = cmul(K, nott); return K; };
    const scores = new Map(), hk = (d, n) => `${d}|${n}`, hyps = [];
    for (let d = 0; d <= dmax; d++) for (const n of negs) { hyps.push([d, n]); scores.set(hk(d, n), this.structureScore(Sn, Kof(d, n))); }
    const order = [...hyps].sort((a, b) => scores.get(hk(...b)) - scores.get(hk(...a)));
    f.depth_fit = order[0][0]; const dg = this.depthFromGates(tokens), dk = this.depthFromKinds(tokens); f.depth_gates = dg; f.depth_kinds = dk;
    let h;
    if (opts.force) h = opts.force;
    else {
      const fd = opts.forceDepth !== undefined && opts.forceDepth !== null ? opts.forceDepth : (estimator === "gates" ? dg : estimator === "kinds" ? dk : null);
      if (fd !== null && fd !== undefined) {
        for (const n of negs) if (!scores.has(hk(fd, n))) scores.set(hk(fd, n), this.structureScore(Sn, Kof(fd, n)));
        h = [fd, negs[0]]; for (const n of negs) if (scores.get(hk(fd, n)) > scores.get(hk(...h))) h = [fd, n];
      } else h = order[0];
    }
    if (!scores.has(hk(...h))) scores.set(hk(...h), this.structureScore(Sn, Kof(...h)));
    f.margins.structure = order.length > 1 ? scores.get(hk(...order[0])) - scores.get(hk(...order[1])) : 1.0;
    const [d, neg] = h, K = Kof(d, neg), core = scores.get(hk(d, neg)); f.neg = neg; f.depth = d; f.core = core;
    for (let k = 0; k < d; k++) {
      const [sp, mg] = Reader.best(cmulc(cmul(Sn, cpow(rep, k)), this.st.op("says.speaker")), this.cands(sch.speaker_kinds));
      f.speakers.push(sp); f.margins[`speaker.${k}`] = mg;
    }
    if (this.legend.reader.predicate_role) {
      let vc = this.verbCands();
      const hint = this.hintEvent(opts);
      if (hint !== null) {      // opts.event (EVENT_HINT.md, the composer's event hint): the predicate's candidates are that event's verb lemmas
        const inv = new Map(vc[0].map((w, i) => [w, i])), js = [...new Set(this.legend.events[hint].filter((l) => inv.has(l)).map((l) => inv.get(l)))].sort((x, y) => x - y);
        vc = [js.map((j) => vc[0][j]), js.map((j) => vc[1][j])];
      } else if (this.cfg.candidates === "sentence") {      // D14 item 4 (infer.py): the predicate's candidates are the sentence's verbs
        const inv = new Map(vc[0].map((w, i) => [w, i])); const js = [...new Set(tokens.map((t) => this.lemma(t)).filter((l) => inv.has(l)).map((l) => inv.get(l)))].sort((x, y) => x - y);
        if (js.length) vc = [js.map((j) => vc[0][j]), js.map((j) => vc[1][j])];
      }
      const [lem, mg] = Reader.best(cmulc(cmul(Sn, K), this.st.op("pred")), vc);
      f.lemma = lem; f.event = this.legend.eventOfLemma(lem); f.margins.event = mg;
    } else {
      f.event = sch.single_event || null;
      if (!f.event) for (const t of tokens) { const e = this.legend.eventOfLemma(this.lemma(t)); if (e) { f.event = e; break; } }
    }
    const taken = f.event ? this.legend.eventRoles[f.event] : undefined;      // Q12 / D19: the roles the decided event takes
    for (const r of sch.role_order) {
      if (taken !== undefined && !taken.includes(r)) { f.presence[r] = 0.0; continue; }      // not a role of this event: not read, no candidate
      const o = this.readRole(Sn, K, r, core, presence); f.presence[r] = o.presence;
      if (o.member_ratios) f.presence[r + ".members"] = o.member_ratios;
      for (const part of ["attr", "det"]) if ((part + "_ratio") in o) f.presence[r + "." + part] = o[part + "_ratio"];
      if ("presence_margin" in o) {
        const given = o.present && o.filler !== null && o.filler !== undefined;
        if (given || !this.cfg.presence_query) f.margins[r + ".presence"] = o.presence_margin;
        else if (o.presence_margin < this.tau || o.present) (f.presence_queries = f.presence_queries || {})[r] = o.presence_margin;   // D14 item 1 / Q38: a role not given (absent near its threshold, or present with no admissible word)
      }
      if (o.present && o.filler) {
        f.roles[r] = o.filler; Object.assign(f.margins, o.margins);
        if ("presence_margin" in o) {
          (f.identity_margins = f.identity_margins || {})[r] = o.margins[r];
          f.margins[r] = Math.min(o.margins[r] !== undefined ? o.margins[r] : 1.0, o.presence_margin);
        }
        if (o.det_best) (f.det_best = f.det_best || {})[r] = o.det_best;
        if (o.runnerUp != null) (f.runner_up = f.runner_up || {})[r] = [o.filler[0] === "entity" ? o.filler[1] : o.filler[1], o.runnerUp];
      }
    }
    if (this.filt && this.cfg.candidates === "sentence") this.oneToOne(Sn, K, core, f, this.filt, presence);
    if (this.cfg.presence_query && f.event && Object.hasOwn(this.legend.eventRequired, f.event)) {      // Q12 / D19: a required role not given is asked for
      for (const r of this.legend.eventRequired[f.event]) if (f.roles[r] === undefined || f.roles[r] === null) {
        const m = (r + ".presence") in f.margins ? f.margins[r + ".presence"] : 0.0; delete f.margins[r + ".presence"]; (f.presence_queries = f.presence_queries || {})[r] = m;
      }
    }
    if (this.legend.reader.scope_terms) this.readScope(Sn, K, core, f);
    if (this.excl && f.event && Object.hasOwn(this.excl, f.event)) this.exclude(f);
    if (f.event === null) f.shape = "unknown";
    return f;
  }
  readScope(Sn, K, core, f) {
    const thr = this.th.scope_term, sw = {}, sq = {};
    for (const [r, fl] of Object.entries(f.roles)) {
      if (fl[0] !== "entity" || fl[1] === null) continue;
      const fh = cscale(cconj(this.st.id(fl[1])), 1 / this.sqrtD), base = cmul(cmulc(cmul(Sn, K), this.st.role(r)), fh);
      sw[r] = cdotRe(this.st.op("wide"), base) / Math.max(core, 1e-9); sq[r] = cdotRe(this.st.op("q"), base) / Math.max(core, 1e-9);
      f.presence[r + ".wide"] = sw[r]; f.presence[r + ".q"] = sq[r];
    }
    if (thr === null || thr === undefined) return;
    const W = Object.keys(sw).filter((r) => sw[r] >= thr), Q = Object.keys(sq).filter((r) => sq[r] >= thr && !W.includes(r));
    for (const r of Object.keys(sw)) {
      const fl = f.roles[r], best = (f.det_best || {})[r];
      if (W.includes(r) || Q.includes(r)) { if (fl[3] === null && best) { fl[3] = best[0]; f.margins[r + ".det"] = best[1]; } }
      else if (fl[3] !== null) { fl[3] = null; delete f.margins[r + ".det"]; }
    }
    let dec;
    const all = new Set([...W, ...Q]);
    if (all.size < 2) { f.scope = null; dec = [...Object.values(sw), ...Object.values(sq)].map((v) => Math.abs(v - thr)); }
    else if (W.length) { f.scope = W.reduce((a, b) => (sw[b] > sw[a] ? b : a)); dec = [sw[f.scope] - thr].concat(Object.keys(sw).filter((r) => r !== f.scope).map((r) => Math.abs(sw[r] - thr))); }
    else { f.scope = "both"; dec = Q.map((r) => sq[r] - thr); }
    f.margins.scope = dec.length ? Math.min(...dec) * core : 1.0;
  }
  // ---------------- frame -> wires
  frameWires(f, ids, text = null, sentence = null) {
    const wires = [], mg = f.margins || {}, nw = (t) => { const w = new Wire(ids.next().value, t); wires.push(w); return w; };
    if (f.shape !== "ok") {
      const w = nw("unknown"); if (text !== null) w.set("_text", text); if (sentence !== null) w.set("_sentence", String(sentence)); return wires;
    }
    let top = null; const chain = [];
    f.speakers.forEach((sp) => { const w = nw("says"); chain.push(w); top = top || w; w.set("speaker", sp); });
    if (f.neg) { const n = nw("not"); chain.push(n); top = top || n; if ("structure" in mg) n.set("_margin.structure", fmt(mg.structure)); }
    const ev = nw(f.event); top = top || ev;
    chain.forEach((a, i) => a.set("scope", ["ref", (chain[i + 1] || ev).id]));
    chain.forEach((w, k) => { if (w.type === "says") w.set("_margin.speaker", fmt(mg[`speaker.${k}`] || 0)); w.set("_depth", String(k)); });
    const later = [];
    for (const r of this.legend.roles) {
      if (!(r in f.roles)) continue;
      const fl = f.roles[r];
      if (fl[0] === "word") ev.set(r, fl[1]);
      else if (fl[0] === "set") {      // a set role's members: one entity wire each, joined with & (diagram-vss-demo port)
        const refs = fl.slice(1).map((m) => { const en = new Wire(ids.next().value, "entity"); later.push(en); en.set("head", m[1]); return ["ref", en.id]; });
        ev.set(r, ["&", refs]); if (r in mg) ev.set(`_margin.${r}`, fmt(mg[r]));
      } else if (fl[0] === "negword") {
        const n = new Wire(ids.next().value, "not"); n.set("scope", fl[1]); later.push(n); ev.set(r, ["ref", n.id]);
        if (r in mg) n.set("_margin.scope", fmt(mg[r]));
      } else if (fl[0] === "entity") {
        const en = new Wire(ids.next().value, "entity"); later.push(en); ev.set(r, ["ref", en.id]); en.set("head", fl[1]);
        if (fl[2] !== null) {
          if (fl[2][0] === "negword") {
            const n = new Wire(ids.next().value, "not"); n.set("scope", fl[2][1]); later.push(n); en.set("attr", ["ref", n.id]);
            if (`${r}.attr` in mg) n.set("_margin.scope", fmt(mg[`${r}.attr`]));
          } else en.set("attr", fl[2][1]);
        }
        if (fl[3] !== null) en.set("det", fl[3]);
        if (r in mg) en.set("_margin.head", fmt(mg[r]));
        for (const part of ["attr", "det"]) if (`${r}.${part}` in mg) en.set(`_margin.${part}`, fmt(mg[`${r}.${part}`]));
      }
    }
    if (f.scope) ev.set("_scope", f.scope);
    if (f.lemma) ev.set("_verb", f.lemma);
    ev.set("_mood", this.mood(text));
    for (const r of this.legend.roles) {
      if (r in mg) ev.set(`_margin.${r}`, fmt(mg[r]));
      if ((r + ".presence") in mg) ev.set(`_presence_margin.${r}`, fmt(mg[r + ".presence"]));
      if (f.presence_queries && r in f.presence_queries) ev.set(`_presence_query.${r}`, fmt(f.presence_queries[r]));   // absent, near threshold: "is there a <r>?"
      if (f.offers && r in f.offers) ev.set(`_offer.${r}`, f.offers[r]);          // the unplaced word offered to this empty role (D27)
    }
    if ("event" in mg) ev.set("_margin.event", fmt(mg.event));
    if ("scope" in mg) ev.set("_margin.scope", fmt(mg.scope));
    const evm = Object.keys(mg).filter((k) => this.legend.roles.includes(k) || k === "event" || (k.endsWith(".presence") && this.legend.roles.includes(k.slice(0, -9)))).map((k) => mg[k]);
    if (evm.length) ev.set("_margin", fmt(Math.min(...evm)));
    wires.push(...later);
    if (text !== null || sentence !== null) {
      const head = [];
      if (text !== null) head.push(line("_text", text.replace(/\n/g, " ")));
      if (sentence !== null) head.push(line("_sentence", String(sentence)));
      top.lines = head.concat(top.lines);
    }
    return wires;
  }
  mood(text) {
    const ms = this.legend.moods;
    if (ms.length === 1) return ms[0];
    if (text && text.trim().endsWith("?") && ms.includes("question")) return "question";
    return ms[0];
  }
  wireLines(wires, status) {
    const by = new Map(wires.map((w) => [w.id, w])), depth = new Map([[wires[0].id, 0]]), q = [wires[0].id];
    while (q.length) { const x = q.shift(); for (const r of by.get(x).refs()) if (by.has(r) && !depth.has(r)) { depth.set(r, depth.get(x) + 1); q.push(r); } }
    for (const w of wires) {
      const keys = w.type !== "unknown" ? this.legend.keysFor(w.type) : new Set(), isEv = Object.hasOwn(this.legend.events, w.type);
      const order = (isEv ? this.legend.roles : [...keys].sort()).filter((k) => keys.has(k));
      let empty = order.filter((k) => w.get(k) === null);
      if (isEv) empty = this.schema.role_order.filter((k) => w.get(k) === null).concat(empty.filter((k) => !this.schema.role_order.includes(k)));
      w.set("_empty", empty.length ? empty.join(",") : "-");
      if (w.get("_margin") === null) { const ms = w.lines.filter((l) => l.key.startsWith("_margin.")).map((l) => parseFloat(l.text)); w.set("_margin", ms.length ? fmt(Math.min(...ms)) : "none"); }
      if (w.get("_status") === null) w.set("_status", status);
      w.set("_depth", String(depth.has(w.id) ? depth.get(w.id) : 0));
    }
  }
  // ---------------- residual: the compiled state of the decoded wires (world.Compiler) against the chart
  compileWire(w, by, tokens, used, depth = 0) {
    const st = this.st, L = this.legend, D = this.D; let S = cz(D);
    const V = (key) => { const l = w.get(key); return l === null ? null : this.compileValue(l, by, tokens, used, depth); };
    if (Object.hasOwn(L.events, w.type)) {
      if (L.reader.predicate_role) {
        let lem = w.value("_verb");
        if (lem === null) { const verbs = new Set(L.events[w.type] || []); for (let i = 0; i < tokens.length; i++) { if (used.has(i)) continue; if (verbs.has(L.lemmaOf(tokens[i]))) { used.add(i); lem = L.lemmaOf(tokens[i]); break; } } }
        if (lem !== null) S = cadd(S, cmul(st.op("pred"), st.id(lem)));
      }
      const terms = [];
      for (const l of w.lines) {
        if (l.key.startsWith("_")) continue;
        const v = this.compileValue(l, by, tokens, used, depth);
        if (v === null) continue;
        S = cadd(S, cmul(st.role(l.key), L.reader.occupancy_marker ? cadd(v, st.marker()) : v));
        terms.push(...this.scopeTerms(l, by));
      }
      if (terms.length) { let t = terms[0]; for (const x of terms.slice(1)) t = cadd(t, x); S = cadd(S, cscale(t, 1 / Math.sqrt(terms.length))); }
    } else if (w.type === "entity") {
      const h = w.value("head"); if (h !== null) S = cadd(S, st.val(h, "head", L.reader));
      const a = V("attr"); if (a !== null) S = cadd(S, cmul(st.op("attr"), a));
      const det = w.value("det"); if (det !== null && !(L.reader.definite_dets || []).includes(det)) S = cadd(S, cmul(st.op("det"), st.id(det)));
      const q = w.value("quantity"); if (q !== null && L.reader.value_terms) S = cadd(S, cmul(st.op("quantity"), st.val(q, "quantity", L.reader)));
    } else if (w.type === "not" || w.type === "must" || w.type === "may") {
      const v = V("scope"); if (v !== null) S = cadd(S, cmul(st.op(w.type), v));
    } else if (w.type === "if") {
      const c = V("condition"), q = V("consequence");
      if (c !== null) S = cadd(S, cmul(st.op("if.condition"), c)); if (q !== null) S = cadd(S, cmul(st.op("if.consequence"), q));
    } else if (w.type === "says") {
      const sp = w.get("speaker");
      if (sp !== null) { const v = this.compileValue(sp, by, tokens, used, depth); if (v !== null) S = cadd(S, cmul(st.op("says.speaker"), L.reader.occupancy_marker ? cadd(v, st.marker()) : v)); }
      const v = V("scope"); if (v !== null) S = cadd(S, cmul(st.op("says.scope"), v));
    } else if (w.type === "and") {
      const it = w.get("items");
      if (it !== null) it.atoms.forEach((a, i) => { const v = this.compileAtom(a, by, tokens, used, depth); if (v !== null) S = cadd(S, cmul(cpow(st.op("and.next"), i), v)); });
    }
    return S;
  }
  compileValue(l, by, tokens, used, depth) {
    const vs = l.atoms.map((a) => this.compileAtom(a, by, tokens, used, depth, l.key)).filter((v) => v !== null);
    if (!vs.length) return null;
    let s = vs[0]; for (const v of vs.slice(1)) s = cadd(s, v);
    return l.sep === "|" ? cscale(s, 1 / Math.sqrt(vs.length)) : s;
  }
  compileAtom(a, by, tokens, used, depth, key = null) {
    if (a.kind === "word") return this.st.val(a.text, key, this.legend.reader);
    if (a.kind === "unknown") return this.st.marker();
    if (a.kind === "asked") return null;
    const w = by.get(a.text); if (!w || depth > 32) return null;
    return this.compileWire(w, by, tokens, used, depth + 1);
  }
  scopeTerms(l, by) {
    const stc = this.legend.reader.scope_terms;
    if (!stc || l.atoms.length !== 1 || l.atoms[0].kind !== "ref") return [];
    const en = by.get(l.atoms[0].text); if (!en || en.type !== "entity" || en.value("head") === null) return [];
    const det = en.value("det"), s = this.st;
    if ((stc.wide || []).includes(det)) return [cmul(cmul(s.op("wide"), s.role(l.key)), s.id(en.value("head")))];
    if ((stc.q || []).includes(det)) return [cmul(cmul(s.op("q"), s.role(l.key)), s.id(en.value("head")))];
    return [];
  }
  residual(S, wires, tokens) {
    const by = new Map(wires.map((w) => [w.id, w])), rec = this.compileWire(wires[0], by, tokens, new Set());
    const nS = cnorm(S), nr = cnorm(rec);
    if (nS < 1e-9 || nr < 1e-9) return 1.0;
    const Sn = cscale(S, 1 / nS), rn = cscale(rec, 1 / nr), a = Math.max(0, cdotRe(rn, Sn));
    return cnorm(cadd(Sn, cscale(rn, a), -1));
  }
  /** the explained-tokens residual (infer.Reader.residual_explained): rec' = the chart of the explained tokens only */
  /** infer.Reader.frame_incomplete: a core question or a speaker of the depth not answered -> the explained residual is 1.0 */
  frameIncomplete(f) {
    const req = f.event && Object.hasOwn(this.legend.eventRequired, f.event) ? this.legend.eventRequired[f.event] : (this.schema.core_roles || []);   // Q12 / D19
    if (req.some((r) => f.roles[r] === undefined || f.roles[r] === null || Reader.headOf(f.roles[r]) === null || Reader.headOf(f.roles[r]) === undefined)) return true;
    return (f.speakers || []).some((sp) => sp === null || sp === undefined);
  }
  residualExplained(S, tokens, kept, placed, addrOf = null) {
    if (!kept.length) return 1.0;
    const ex = [];
    kept.forEach((i, j) => { const k = this.kind(tokens[i]), t = tokens[i]; if ((!this.contentKinds.has(k) && k !== "unknown") || placed.has(t) || placed.has(this.lemma(t))) ex.push(j); });
    if (!ex.length) return 1.0;
    const addr = addrOf ? addrOf() : this.rb.addresses(this.encode(tokens)[1]), D = this.D, rec = cz(D);
    for (const j of ex) {
      const F = this.st.id(this.ident(tokens[kept[j]])); if (!F) continue; const a = addr[j];
      for (let d = 0; d < D; d++) { rec.re[d] += a.re[d] * F.re[d] - a.im[d] * F.im[d]; rec.im[d] += a.re[d] * F.im[d] + a.im[d] * F.re[d]; }
    }
    const nS = cnorm(S), nr = cnorm(rec);
    if (nS < 1e-9 || nr < 1e-9) return 1.0;
    const Sn = cscale(S, 1 / nS), rn = cscale(rec, 1 / nr), a = Math.max(0, cdotRe(rn, Sn));
    const r = cnorm(cadd(Sn, cscale(rn, a), -1)); return r < 1e-4 ? 0 : r;      // numerical tolerance, declared (Q32)
  }
  /** the adjacency rule (infer.Reader.undecided_adjacent): an unplaced identity next to a role's filler whose kinds admit it -> that role is undecided */
  undecidedAdjacent(f, tokens, unplaced) {
    const out = {}, pos = new Map(tokens.map((t, i) => [t, i])), up = new Set(unplaced);
    for (const [r, fl] of Object.entries(f.roles)) {
      const ws = fillerWords(fl); if (!ws.length) continue;
      const rs = this.schema.roles[r] || {}, kinds = new Set(rs.head_kinds || rs.kinds || []);
      const head = ws[0], i = pos.get(head); if (i === undefined) continue;
      const run = this.legend.reader.spans === "kind_run";
      for (const j of [i - 1, i + 1]) {
        if (up.has(j) && kinds.has(this.kind(tokens[j])) && tokens[j] !== head) {
          if (run && this.kind(tokens[j]) === this.kind(head)) continue;      // the same run (a multi-word span), not a competitor (Q38)
          out[r] = [head, tokens[j]]; break;
        }
      }
    }
    return out;
  }
  placedWords(f) {
    const ws = new Set(f.speakers); if (f.lemma) ws.add(f.lemma);
    for (const fl of Object.values(f.roles)) for (const w of fillerWords(fl)) ws.add(w);
    return ws;
  }
  /** one sentence -> {wires, frame, info} (infer.Reader.formalize) */
  formalize(text, sentence, ids, opts = {}) {
    const t0 = performance.now(), tokens = tokenize(text);
    if (this.centres) {          // a centre model reads one text as a message: the first accepted centre whose reading is ok / abstain (infer.py)
      const m = this.readMessage(tokens, sentence, ids, opts);
      for (const c of m.centres) if (c.accepted && (c.info.status === "ok" || c.info.status === "abstain")) return c.result;
      for (const c of m.centres) if (c.accepted) return c.result;
      return this.formalizeState(text, sentence, ids, opts, tokens, cz(this.D), [], [], () => [], t0, performance.now());
    }
    const [S, kept, unknown] = this.chart(tokens), t1 = performance.now();
    return this.formalizeState(text, sentence, ids, opts, tokens, S, kept, unknown, null, t0, t1);
  }
  // ---------------- the centre reader (legend reader.centres; infer.Reader.centre_chart / centre_members / read_message)
  centreChart(tokens) {
    const [kept, cidx, unknown] = this.encode(tokens), R = this.rb.centreAddresses(cidx, kept.map((i) => this.lemma(tokens[i]))), D = this.D, S = R.centres.map(() => cz(D));
    const madd = (x, a, F) => { for (let d = 0; d < D; d++) { x.re[d] += a.re[d] * F.re[d] - a.im[d] * F.im[d]; x.im[d] += a.re[d] * F.im[d] + a.im[d] * F.re[d]; } };
    kept.forEach((i, j) => {
      const F = this.st.id(this.ident(tokens[i])); if (!F) return;
      if (R.ci[j] >= 0) { madd(S[R.ci[j]], R.aC[R.ci[j]], F); return; }
      if (R.lc[j] >= 0) madd(S[R.lc[j]], R.aL[j], F);
      if (R.rc[j] >= 0) madd(S[R.rc[j]], R.aR[j], F);
    });
    return [kept, unknown, R, S];
  }
  centreMembers(R, k, attach = 0.5) {
    const out = [R.centres[k]];
    for (let j = 0; j < R.lc.length; j++) if ((R.lc[j] === k && R.wL[j] >= attach) || (R.rc[j] === k && R.wR[j] >= attach)) out.push(j);
    return out.sort((a, b) => a - b);
  }
  /** a whole message (normalized tokens or a text) -> {tokens, centres: [{pos, token, null, accepted, members, text, result}], ignored: [[a, b)]} */
  readMessage(tokensIn, sentence = 0, ids = null, opts = {}) {
    const tokens = typeof tokensIn === "string" ? tokenize(tokensIn) : tokensIn;
    ids = ids || (function* () { let i = 1; for (;;) yield `w${i++}`; })();
    const [kept, unknown, R, S] = this.centreChart(tokens), unk = new Set(unknown), out = [], taken = new Set();
    R.centres.forEach((p, k) => {
      const mem = this.centreMembers(R, k), toks = mem.map((j) => tokens[kept[j]]);
      const rec = { pos: kept[p], token: tokens[kept[p]], null: R.nul[p], accepted: R.nul[p] < 0.5, members: mem.map((j) => kept[j]) };
      if (rec.accepted) {
        const addr = mem.map((j) => (j === p ? R.aC[k] : R.lc[j] === k ? R.aL[j] : R.aR[j])), t0 = performance.now();
        rec.text = toks.join(" ");
        rec.result = this.formalizeState(rec.text, sentence, ids, opts, toks, S[k], mem.map((_, n) => n), mem.map((j, n) => [j, n]).filter(([j]) => unk.has(kept[j])).map(([, n]) => n), () => addr, t0, t0);
        rec.info = rec.result.info;
        if (rec.info.status === "ok" || rec.info.status === "abstain") for (const i of rec.members) taken.add(i);
      }
      out.push(rec);
    });
    const ignored = [], P = new Set([".", ",", "!", "?", ";", ":"]); let a = null;
    for (let i = 0; i <= tokens.length; i++) {
      if (i < tokens.length && !taken.has(i)) { if (a === null) a = i; continue; }
      if (a !== null) { let b = i; while (a < b && P.has(tokens[a])) a++; while (b > a && P.has(tokens[b - 1])) b--; if (a < b) ignored.push([a, b]); a = null; }
    }
    return { tokens, centres: out, ignored };
  }
  /** the decoder and the bookkeeping of formalize() on a given state (infer.Reader.formalize_state); addrOf() -> the addresses of the kept
   *  tokens (null: recomputed from the tokens by the route book, the one-request reader) */
  formalizeState(text, sentence, ids, opts, tokens, S, kept, unknown, addrOf, t0, t1) {
    const estimator = opts.estimator || this.cfg.depth_estimator || "gates", presence = opts.presence || this.cfg.presence_readout || "decided";
    this.filt = this.cfg.candidates === "sentence" ? new Set(tokens.concat(tokens.map((t) => t.toLowerCase()))) : null;   // the sentence-candidates decoder (R46)
    let f;
    try {
      f = kept.length ? this.read(S, tokens, { estimator, presence, force: opts.force, forceDepth: opts.forceDepth, event: opts.event }) : { shape: "unknown", roles: {}, speakers: [], margins: {}, neg: false, lemma: null };
      if (kept.length && f.shape === "ok" && this.cfg.presence_without_placed) {
        // vss-demo Q17 / D28 (infer.py): a second reading of the roles left absent, on the state WITHOUT the deposits of the words already
        // placed in other roles (a label read as the landmark is no evidence of a text); the same thresholds
        const placed0 = this.placedWords(f);
        const ex = []; kept.forEach((i, j) => { if (placed0.has(tokens[i]) || placed0.has(this.lemma(tokens[i]))) ex.push(j); });
        if (ex.length && ex.length < kept.length) {
          const addr = addrOf ? addrOf() : this.rb.addresses(this.encode(tokens)[1]), D = this.D, S2 = { re: Float64Array.from(S.re), im: Float64Array.from(S.im) };
          for (const j of ex) {
            const F = this.st.id(this.ident(tokens[kept[j]])); if (!F) continue; const a = addr[j];
            for (let d = 0; d < D; d++) { S2.re[d] -= a.re[d] * F.re[d] - a.im[d] * F.im[d]; S2.im[d] -= a.re[d] * F.im[d] + a.im[d] * F.re[d]; }
          }
          const f2 = this.read(S2, tokens, { estimator, presence, force: [f.depth, f.neg], event: opts.event });
          if (f2.shape === "ok") for (const [r, fl] of Object.entries(f2.roles)) {
            if ((f.roles[r] === undefined || f.roles[r] === null) && fl !== null && fl !== undefined && !fillerWords(fl).some((w) => placed0.has(w))) {
              f.roles[r] = fl; f.presence[r] = f2.presence[r]; (f.second_pass = f.second_pass || []).push(r);
              for (const [k, v] of Object.entries(f2.margins)) if (k === r || k.startsWith(r + ".")) f.margins[k] = v;
              if (f.presence_queries) delete f.presence_queries[r];
            }
          }
        }
      }
    }
    finally { this.filt = null; }
    const placed = f.shape === "ok" ? this.placedWords(f) : new Set(); let unplaced = [...unknown];
    if (f.shape === "ok" && this.legend.reader.spans === "kind_run") {      // Q38 / R87 (infer.py): a multi-word filler is the run of its kind around the head
      const ks = tokens.map((t) => this.kind(t));
      for (const fl of Object.values(f.roles)) for (const w of fillerWords(fl)) tokens.forEach((t, i) => {
        if (t !== w || !String(ks[i]).startsWith("S:")) return;
        let a = i, b = i; while (a > 0 && ks[a - 1] === ks[i]) a--; while (b + 1 < tokens.length && ks[b + 1] === ks[i]) b++;
        for (const x of tokens.slice(a, b + 1)) placed.add(x);
      });
    }
    if (placed.size && (f.lemma === null || f.lemma === undefined) && f.event) {      // no predicate role: the event's FIRST verb only (Q32)
      const ev = tokens.find((t) => this.legend.eventOfLemma(this.lemma(t)) === f.event); if (ev !== undefined) placed.add(ev);
    }
    for (const i of kept) { const t = tokens[i], k = this.kind(t); if (this.contentKinds.has(k) && !placed.has(t) && !placed.has(this.lemma(t))) unplaced.push(i); }
    unplaced = [...new Set(unplaced)].sort((a, b) => a - b);
    // vss-demo Q16 / D27 (infer.py): an unplaced word that exactly one EMPTY role of the decided event admits is offered to that role as a
    // presence query ("is 'irina' the new name?") before the adjacency rule can make its neighbour undecided
    if (f.shape === "ok" && this.cfg.presence_query && unplaced.length) {
      const taken = f.event ? this.legend.eventRoles[f.event] : undefined;
      const empty = this.schema.role_order.filter((r) => (f.roles[r] === undefined || f.roles[r] === null) && (taken === undefined || taken.includes(r)));
      for (const i of [...unplaced]) {
        const k = this.kind(tokens[i]);
        const fits = empty.filter((r) => { const rs = this.schema.roles[r] || {}; return new Set((rs.head_kinds && rs.head_kinds.length ? rs.head_kinds : rs.kinds) || []).has(k); });
        if (fits.length === 1 && !(f.offers && fits[0] in f.offers)) {
          const r = fits[0]; (f.offers = f.offers || {})[r] = tokens[i];
          const m = (r + ".presence") in f.margins ? f.margins[r + ".presence"] : 0.0; delete f.margins[r + ".presence"]; (f.presence_queries = f.presence_queries || {})[r] = m;
          unplaced = unplaced.filter((j) => j !== i);
        }
      }
    }
    const undecided = f.shape === "ok" && this.cfg.undecided_adjacent ? this.undecidedAdjacent(f, tokens, unplaced) : {};
    for (const [r, [, b]] of Object.entries(undecided)) { f.margins[r] = 0.0; unplaced = unplaced.filter((i) => tokens[i] !== b); }
    let status = "ok";
    const hasVerb = tokens.some((t) => this.legend.eventOfLemma(this.lemma(t))) || !this.legend.reader.predicate_role || this.hintEvent(opts) !== null;   // opts.event meets the verb check
    const nss = this.legend.reader.no_sense_share || (this.th.no_sense_share !== undefined ? this.th.no_sense_share : 0.5);
    if (tokens.length && unplaced.length > nss * tokens.length) status = "no-sense";
    else if (f.shape !== "ok" || !hasVerb) status = "unknown-event";
    const frame = f; if (status !== "ok") f = Object.assign({}, f, { shape: "unknown" });
    const wires = this.frameWires(f, ids, text, sentence), top = wires[0], mins = Object.values(f.margins || {});
    if (f.shape === "ok") {
      top.set("_margin.structure", fmt(f.margins.structure)); top.set("_margin", mins.length ? fmt(Math.min(...mins)) : "0");
      if (Math.min(...mins) < this.tau) status = "abstain";
    } else top.set("_margin", "0");
    top.set("_status", status);
    const si = top.lines.findIndex((l) => l.key === "_sentence");
    top.lines.splice(si >= 0 ? si + 1 : 0, 0, line("_world", this.cfg.world || "?"));
    const mode = this.cfg.residual || "compiled";                      // "compiled" (the paper's) | "explained" (R41)
    const res = f.shape === "ok" ? (mode === "explained" ? (this.frameIncomplete(f) ? 1.0 : this.residualExplained(S, tokens, kept, placed, addrOf)) : this.residual(S, wires, tokens)) : 1.0;
    top.set("_residual", fmt(res));
    if (unplaced.length) top.set("_unplaced", unplaced.map((i) => tokens[i]).join(","));
    for (const [r, [a, b]] of Object.entries(undecided)) top.set(`_undecided.${r}`, `${a}|${b}`);
    if (f.depth_gates !== undefined && f.depth_gates !== null) top.set("_depth.gates", String(f.depth_gates));
    if (f.depth_kinds !== undefined && f.depth_kinds !== null) top.set("_depth.kinds", String(f.depth_kinds));
    if (f.depth_fit !== undefined && f.depth_fit !== null) top.set("_depth.fit", String(f.depth_fit));
    this.wireLines(wires, status);
    return { wires, frame: f, decoded: frame, info: { tokens, S, kept, unplaced, residual: res, status, ms_chart: t1 - t0, ms_total: performance.now() - t0 } };
  }
}
