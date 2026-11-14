// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The NX encoder-heads reading as a formalizer strategy (ADR-009, spec 03 section 7.16). Browser-safe: no `node:*` imports.
 * Port of scripts/lib/nx-formalizer.mjs (the NX5-NX7 experiment code) onto the dispatcher runtime of the webchat: ONE encoder pass per
 * segment serves the dispatcher heads and the NX heads (`runtime.rankFull(text, ctx).nx`), there is no second pass.
 *
 * Reading of one segment (model output -> spans and operation -> the rules' own canonicalisation -> SOP wires -> validator):
 *   1. the op head and the BIO tag head of the pass give the 3 best operations (not `none`) that some pattern of a TRAINED world can emit;
 *   2. the BIO tags are decoded with the labels restricted to the keys of the candidate operation (legend constraint): one span per key;
 *   3. a sentence is synthesized from the candidate pattern's match string with the spans put in the slots; the rule formalizer, restricted to
 *      that pattern, reads it, so every value goes through the slot classes and the emit template builds the wires (the rules stay the only
 *      formalizer: the model only proposes where the words are);
 *   4. validator, always: the legend check of `formalize` and a dry run of the wires on a fork of the interpreter session (no `error`);
 *      the confidence gate (operation probability, spans inside the pattern's frame, no negation word) decides whether the reading is used.
 * A reading that fails any step is dropped; none left -> the segment is not read (the caller keeps the rules' answer).
 *
 * Strategies (settings `nxStrategy`):
 *   rules   no model reading (today's behaviour)
 *   hybrid  (default, user decision 2026-11-10) the rules path runs as shipped (dispatcher, validator, normalizer, leniency); the model reads only
 *           a segment that path left unparsed, with the NX7 gate (tau_op 0.99, tau_frame 0.9, negation guard); a partial answer is kept
 *   neural  the model reads the whole message first (negation guard only); when any segment is not read the message goes to the rules path
 * Worlds the model is not trained on (user.profile) are read by the rules only: no pattern of such a world is a candidate, and in `neural` a
 * message that an untrained world's rules read is left to the rules path.
 */
import { lexIndex } from '../worlds/lexicon.mjs?v=b87a7fb377';
import { compilePattern, formalize } from './rules/index.mjs?v=6a42b3a2cd';
import { candidateSegmentations } from './dispatcher-runtime.mjs?v=5cb07e6405';
import { atom } from '../soplang/index.mjs?v=c57881f705';
import { perf } from './perf.mjs?v=b75de4ae38';
import { guard, TurnAborted } from './guard.mjs?v=eb1a66f556';

import { NX_STRATEGIES, DEFAULT_NX_STRATEGY, normalizeNxStrategy } from './nx-strategy.mjs?v=079cade33c';
export { NX_STRATEGIES, DEFAULT_NX_STRATEGY, normalizeNxStrategy };
/** NX7 gate for the hybrid strategy (A3, with the negation guard); the neural strategy uses the negation guard and a minimum word coverage (0.6). */
export const NX_GATES = Object.freeze({
  hybrid: Object.freeze({ tauOp: 0.99, tauFrame: 0.9, spans: true, noNeg: true }),
  // the model reads the whole message here, so a reading that leaves most words of the segment unread (a clause it did not model) is refused
  neural: Object.freeze({ tauOp: 0, tauFrame: 0, spans: true, noNeg: true, minCover: 0.6 }),
});



const EMIT_LINE = /^@\{_\d*\}\s+(\S+)\s*(.*)$/;
const needsWorldTag = (k) => k.startsWith('core.request.arg.') || k.startsWith('core.question.where.');
const softmax = (v) => { let m = -Infinity; for (const x of v) if (x > m) m = x; const e = Array.from(v, (x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

/** NX operation(s) of an emit: the label of its first non-agent wire (`request:a`, `question:t:seek|*`, wire type). */
function parseEmit(emit) {
  const lines = [];
  for (const line of String(emit).split(/\\n|\n/)) {
    const m = EMIT_LINE.exec(line.trim());
    if (!m || m[1] === 'core.agent') continue;
    const entries = [...m[2].matchAll(/([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|\S+)/g)].map((x) => [x[1], x[2]]);
    lines.push({ type: m[1], entries });
  }
  return lines;
}
function nxOpOf(line) {
  const get = (k) => line.entries.find(([x]) => x === k)?.[1]?.replace(/^"|"$/g, '');
  if (line.type === 'core.request') return `request:${get('action')}`;
  if (line.type === 'core.question') { const s = get('seek'); return `question:${get('type')}:${s && !/^\{/.test(s) ? s : '*'}`; }
  return line.type;
}

/** Index of every pattern by the NX operation it emits, with its slot <-> key map and compiled elements. */
export function buildPatternIndex(set, trained = null) {
  const lex = lexIndex(set);
  const byOp = new Map();
  for (const w of set.list()) {
    if (trained && !trained.has(w.id)) continue;   // untrained worlds are read by the rules only
    for (const p of w.patterns) {
      let comp; try { comp = compilePattern(p.match, lex.phrases); } catch { continue; }
      const lines = parseEmit(p.emit ?? '');
      if (!lines.length) continue;
      const op = nxOpOf(lines[0]);
      const tagOfSlot = new Map();   // slot name -> tag
      const slotOfTag = new Map();
      const constOfTag = new Map();  // tag -> constant value of the emit (a key the pattern fixes: `arg.anim=wave`)
      for (const line of lines) {
        for (const [short, v] of line.entries) {
          const m = /^"?\{(\w+)(?:\|\w+)?\}"?$/.exec(v);
          if (!m && !/\{/.test(v)) {
            if (['type', 'action', 'seek'].includes(short) && line.type.startsWith('core.')) continue;
            let fk = short;
            try { fk = set.legends.normalizeWire({ id: 'x', type: line.type, entries: [{ key: short, value: atom('x') }] }).wire.entries[0].key; } catch { /* keep */ }
            const t = needsWorldTag(fk) ? `${w.id}|${fk}` : fk;
            if (!constOfTag.has(t)) constOfTag.set(t, v.replace(/^"|"$/g, ''));
            continue;
          }
          if (!m || m[1] === 'segment') continue;
          let full = short;
          try { full = set.legends.normalizeWire({ id: 'x', type: line.type, entries: [{ key: short, value: atom('x') }] }).wire.entries[0].key; } catch { /* keep short */ }
          const tag = needsWorldTag(full) ? `${w.id}|${full}` : full;
          if (!slotOfTag.has(tag)) { slotOfTag.set(tag, m[1]); tagOfSlot.set(m[1], tag); }
        }
      }
      // frame words: the literal words of the pattern (macro phrases left out); they pick between patterns of one operation that differ in a constant
      const frame = new Set();
      for (const el of comp.elements) { if (el.t === 'lit') el.words.forEach((x) => frame.add(x)); else if (el.t === 'alt' && !el.macros) el.alts.forEach((a) => a.forEach((x) => frame.add(x))); }
      const rec = { world: w.id, p, comp, op, slotOfTag, tagOfSlot, constOfTag, priority: p.priority ?? 0, frame };
      for (const k of op.startsWith('question:') ? [op, op.replace(/:[^:]*$/, ':*')] : [op]) { if (!byOp.has(k)) byOp.set(k, []); byOp.get(k).push(rec); }
    }
  }
  return byOp;
}


/** Constrained BIO decoding: one span [s, e] (segment coordinates) per allowed tag, the one with the highest mean token score. */
function decodeTags(model, pass, allowedTags) {
  const allowed = [0];
  for (const t of allowedTags) for (const p of 'BI') { const i = model.labelIdx.get(`${p}-${t}`); if (i != null) allowed.push(i); }
  const spans = [];
  let cur = null;
  const close = () => { if (cur) spans.push(cur); cur = null; };
  pass.offsets.forEach(([a, b], k) => {
    if (b <= a || a < pass.pre) return;
    let best = 0, bv = -Infinity;
    for (const i of allowed) { const v = pass.tag[k * pass.L + i]; if (v > bv) { bv = v; best = i; } }
    const l = model.labels[best];
    if (l === 'O') return close();
    const tag = l.slice(2);
    if (l[0] === 'B' || !cur || cur.tag !== tag) { close(); cur = { tag, s: a - pass.pre, e: b - pass.pre, n: 1, score: bv }; } else { cur.e = b - pass.pre; cur.n++; cur.score += bv; }
  });
  close();
  const by = new Map();
  for (const sp of spans) { const q = by.get(sp.tag); if (!q || sp.score / sp.n > q.score / q.n) by.set(sp.tag, sp); }
  return by;
}

const ZERO_TOKEN = new Set(['recent', 'lastagent']);
const SYMBOLS = { '+': 'plus', '-': 'minus', '*': 'times', x: 'times', '/': 'divided by', '=': 'equals' };
const tokensOf = (t) => (t.toLowerCase().match(/[a-z0-9']+|[+\-*\/=]/g) ?? []).flatMap((x) => (SYMBOLS[x] ? SYMBOLS[x].split(' ') : [x]));
const hasPhrase = (toks, words) => { for (let i = 0; i + words.length <= toks.length; i++) if (words.every((w, k) => toks[i + k] === w)) return true; return false; };
/** Share of the pattern's frame (literal words and phrase alternatives, slots left out) that the segment contains: picks between patterns of one operation that differ in a constant. */
function frameFit(rec, toks) {
  let need = 0, got = 0;
  for (const el of rec.comp.elements) {
    if (el.t === 'lit') { need++; if (hasPhrase(toks, el.words)) got++; }
    else if (el.t === 'alt') { const hit = el.alts.some((a) => hasPhrase(toks, a)); if (el.optional) { if (hit) { need++; got++; } } else { need++; if (hit) got++; } }
  }
  return need ? got / need : 0;
}

/** Synthesize the sentence of a pattern with the predicted spans in its slots; null when a required slot has no span. */
function synthesize(rec, spanText) {
  const parts = [];
  for (const el of rec.comp.elements) {
    if (el.t === 'lit') parts.push(el.words.join(' '));
    else if (el.t === 'alt') { if (!el.optional) { const a = el.alts[(el.order ?? [0])[0]] ?? el.alts[0]; parts.push(a.join(' ')); } }
    else if (el.t === 'q') parts.push('?');
    else if (el.t === 'slot') {
      const t = rec.tagOfSlot.get(el.name);
      const txt = t ? spanText.get(t) : null;
      if (txt) parts.push(txt);
      else if (!el.optional && !ZERO_TOKEN.has(el.cls)) return null;
    }
  }
  return parts.join(' ').replace(/\s+\?/g, '?').trim();
}

/** Negation in a segment (the model heads do not model it: "don't remind me about X" reads as a reminder). */
const NEGATION = /\b(not|no|never|none|nothing|nobody|without|cannot)\b|n['’]t\b/i;
/** Tokens of a text with their character positions (a symbol such as `+` expands to its word, at the symbol's position). */
function tokensPos(text) {
  const out = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9']+|[+\-*\/=]/g)) for (const w of (SYMBOLS[m[0]] ? SYMBOLS[m[0]].split(' ') : [m[0]])) out.push({ w, s: m.index, e: m.index + m[0].length });
  return out;
}
/** Words of the segment that a reading covers (NX7), given token list and the covered character ranges. */
const coverOf = (toks, ranges) => toks.filter((t) => ranges.some(([a, b]) => t.s >= a && t.e <= b)).length;

/**
 * NX7 gate features of a model reading: the operation probability, the frame score (share of the pattern's frame words in the segment), whether
 * every predicted span belongs to the candidate pattern and lies where the pattern puts its slot (between the frame words around it, in
 * the pattern's order), and how many of the segment's words the reading covers (spans of the pattern's slots and its matched frame words).
 */
export function gateFeatures(cand, text, spans, p) {
  const toks = tokensPos(text);
  const frameRanges = [];   // per element: [s, e] of the matched frame phrase or null
  let cur = 0;
  const slotEls = [];
  const els = cand.r.comp.elements;
  els.forEach((el, k) => {
    if (el.t === 'slot') { frameRanges.push(null); slotEls.push(k); return; }
    const phrases = el.t === 'lit' ? [el.words] : el.t === 'alt' && el.alts ? el.alts : [];
    let hit = null;
    for (let i = cur; i < toks.length && !hit; i++) for (const ph of phrases) if (ph.length && i + ph.length <= toks.length && ph.every((w, q) => toks[i + q].w === w)) { hit = [toks[i].s, toks[i + ph.length - 1].e]; cur = i + ph.length; break; }
    frameRanges.push(hit);
  });
  let inFrame = cand.extra === 0;
  const used = [];
  for (const k of slotEls) {
    const tag = cand.r.tagOfSlot.get(els[k].name);
    const sp = tag ? spans.get(tag) : null;
    if (!sp) continue;
    used.push([sp.s, sp.e]);
    let lo = 0, hi = Infinity;
    for (let q = k - 1; q >= 0; q--) if (frameRanges[q]) { lo = frameRanges[q][1]; break; }
    for (let q = k + 1; q < els.length; q++) if (frameRanges[q]) { hi = frameRanges[q][0]; break; }
    if (sp.s < lo - 1 || sp.e > hi + 1) inFrame = false;
  }
  const ranges = [...used, ...frameRanges.filter(Boolean)];
  return { op: p, frame: cand.fr, inFrame, cover: coverOf(toks, ranges), words: toks.length, neg: NEGATION.test(text) };
}
/** Words of the segment that the rules' reading covers: all words minus the ones it ignored (partial window or best-effort guess). */
export function rulesCover(seg) {
  const toks = tokensPos(seg.text ?? '');
  const ign = [...(seg.ignored ?? []), ...(seg.bestEffort?.ignored ?? [])].map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join(' ');
  const bad = new Set(tokensPos(ign).map((t) => t.w));
  return toks.filter((t) => !bad.has(t.w)).length;
}
/** NX operation of a rules wire list (same labels as the pattern index). */
export function opOfWires(wires) {
  const main = (wires ?? []).find((w) => w.type !== 'core.agent');
  if (!main) return null;
  const g = (k) => main.entries.find((e) => e.key === k)?.value.v;
  return main.type === 'core.request' ? `request:${g('core.request.action')}` : main.type === 'core.question' ? `question:${g('core.question.type')}:${g('core.question.seek')}` : main.type;
}

const gatePasses = (g, f) => !g || g.off || (f.op >= g.tauOp && f.frame >= g.tauFrame && (g.spans === false || f.inFrame) && !(g.noNeg && f.neg) && (g.minCover == null || f.cover >= g.minCover * f.words));

const restrictedViews = new WeakMap();
/** A view of the world set where only the patterns `recs` of one world exist (the other worlds keep lexicons and phrases, no patterns). */
function viewFor(set, world, recs) {
  let m = restrictedViews.get(set); if (!m) restrictedViews.set(set, (m = new Map()));
  const key = world + '|' + recs.map((r) => r.p.id).join(',');
  if (m.has(key)) return m.get(key);
  const keep = new Set(recs.map((r) => r.p));
  const sub = Object.create(set);
  sub._cache = new Map();
  const worlds = set.list().map((w) => (w.id === world ? Object.assign(Object.create(Object.getPrototypeOf(w)), w, { patterns: w.patterns.filter((p) => keep.has(p)) }) : Object.assign(Object.create(Object.getPrototypeOf(w)), w, { patterns: [] })));
  sub.list = () => worlds;
  if (m.size > 3000) m.clear();
  m.set(key, sub);
  return sub;
}

const untrainedViews = new WeakMap();
/** A view of the world set where only the worlds the model is not trained on keep their patterns (null when there are none). */
function untrainedView(set, trained) {
  if (untrainedViews.has(set)) return untrainedViews.get(set);
  const all = set.list();
  let view = null;
  if (all.some((w) => w.patterns?.length && !trained.has(w.id))) {
    view = Object.create(set);
    view._cache = new Map();
    const worlds = all.map((w) => (trained.has(w.id) ? Object.assign(Object.create(Object.getPrototypeOf(w)), w, { patterns: [] }) : w));
    view.list = () => worlds;
  }
  untrainedViews.set(set, view);
  return view;
}

/**
 * Create the strategy over a dispatcher runtime that carries the NX heads (`runtime.rankFull(text, ctx).nx`).
 * `meta` is the `nx` block of the published meta.json ({ ops, labels, trained_worlds }). `available()` is the host's gate (model ready, ORT not
 * paused). `stats` collects counters of how the readings were obtained.
 */
export function createNxStrategy({ runtime, meta, available = () => true, stats = {}, topOps = 3 }) {
  if (!runtime?.rankFull || !meta?.ops || !meta?.labels) throw new Error('createNxStrategy needs { runtime, meta: { ops, labels } }');
  const model = { ops: meta.ops, labels: meta.labels, labelIdx: new Map(meta.labels.map((l, i) => [l, i])), trained: new Set(meta.trained_worlds ?? []) };
  let engine = null; let index = null; let indexSet = null;
  const count = (k) => { stats[k] = (stats[k] ?? 0) + 1; perf.count(`nx.${k}`); };

  const dryRun = (acc, wires) => {
    try {
      const f = acc.f.clone();
      f.add(wires);
      for (const w of wires) { const r = engine.interp.resolve(f, w); if (r && r.status === 'error') return false; }
      return true;
    } catch { return false; }
  };
  const accept = (acc, wires) => { try { acc.f.add(wires); } catch { /* the real engine will report it */ } };

  /** The pass of a segment in a context (one encoder pass shared with the dispatcher), or null when the model has no heads or the segment is too long. */
  async function passOn(text, ctx) {
    const full = await runtime.rankFull(text, ctx);
    const n = full.nx;
    if (!n || n.L !== model.labels.length || n.op.length !== model.ops.length) return null;
    return { opP: softmax(n.op), tag: n.tag, L: n.L, offsets: n.offsets, pre: n.pre, worldP: new Map(full.worlds.map((w) => [w.world, w.score])) };
  }

  /** Read one segment text with the model; returns { seg } (a rules-shaped segment, not unparsed) or { seg: null, why }. */
  async function readSegment(piece, set, session, { source, context, ctx, router, acc, gate = null }) {
    if (indexSet !== set) { index = buildPatternIndex(set, model.trained); indexSet = set; }
    const pass = await perf.time('nx.pass', () => passOn(piece.text, ctx));
    if (!pass) { count('no_heads'); return { seg: null, why: 'no heads' }; }
    const ranked = pass.opP.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    if (model.ops[ranked[0][1]] === 'none') { count('says_none'); return { seg: null, why: 'none' }; }
    const tried = [];
    let nOps = 0;
    for (const [p, oi] of ranked) {
      const op = model.ops[oi];
      if (op === 'none') continue;
      const recs = index.get(op);
      if (!recs?.length) continue;
      if (++nOps > topOps) break;
      const worlds = [...new Set(recs.map((r) => r.world))].sort((a, b) => (pass.worldP.get(b) ?? 0) - (pass.worldP.get(a) ?? 0));
      for (const world of worlds) {
        guard.check('nx.read');
        const group = recs.filter((r) => r.world === world);
        const allowedTags = new Set(group.flatMap((r) => [...r.slotOfTag.keys(), ...r.constOfTag.keys()]));
        const spans = decodeTags(model, pass, allowedTags);
        const spanText = new Map([...spans].map(([t, sp]) => [t, piece.text.slice(sp.s, sp.e)]));
        const toks = tokensOf(piece.text);
        const scored = group.map((r) => {
          const nrm = (x) => String(x).toLowerCase().replace(/_/g, ' ').replace(/s$/, '').trim();
          const constHit = [...spans].filter(([t, sp]) => r.constOfTag.has(t) && nrm(r.constOfTag.get(t)) === nrm(piece.text.slice(sp.s, sp.e))).length;
          const used = [...spans.keys()].filter((t) => r.slotOfTag.has(t)).length + constHit;
          const sentence = synthesize(r, spanText);
          return { r, used, extra: spans.size - used, sentence, valueSlots: r.slotOfTag.size, fr: frameFit(r, toks) };
        }).filter((x) => x.sentence !== null || x.valueSlots === 0)
          .sort((a, b) => b.used - a.used || a.extra - b.extra || b.fr - a.fr || b.r.priority - a.r.priority);
        for (const cand of scored.slice(0, 6)) {
          const opOnly = cand.valueSlots === 0;
          const variants = opOnly ? [piece.text, ...(cand.sentence && cand.sentence !== piece.text ? [cand.sentence] : [])] : [cand.sentence];
          const view = viewFor(set, world, group);
          for (const text of variants) {
            const trial = (sess) => {
              const res = formalize(text, { worlds: view, session: sess, source, context, router });
              const seg = res.segments.length === 1 ? res.segments[0] : null;
              if (!seg || seg.unparsed || !seg.wires.length) return null;
              const main = seg.wires.find((w) => w.type !== 'core.agent');
              if (!main) return null;
              return opOfWires([main]) === op ? seg : null;
            };
            let probe;
            try { probe = trial(session.clone()); } catch { probe = null; }
            if (!probe) { tried.push(`${cand.r.p.id}:no-read`); continue; }
            if (!dryRun(acc, probe.wires)) { tried.push(`${cand.r.p.id}:refused`); continue; }
            const feat = gateFeatures(cand, piece.text, spans, p);
            if (!gatePasses(gate, feat)) { count('gate_rejected'); return { seg: null, why: 'gate', feat }; }
            let real;
            try { real = trial(session); } catch { real = null; }
            if (!real) { tried.push(`${cand.r.p.id}:no-read2`); continue; }
            // the segment text instead of the synthesized one in `{segment}` values
            if (text !== piece.text) real.wires = real.wires.map((w) => ({ ...w, entries: w.entries.map((e) => (e.value.kind === 'string' && e.value.v === text ? { ...e, value: { ...e.value, v: piece.text } } : e)) }));
            count('read');
            real.text = piece.text; real.span = [piece.start, piece.end];
            real.nx = { op, world, pattern: cand.r.p.id, rank: nOps, p, feat, spans: Object.fromEntries([...spans].map(([t, sp]) => [t, piece.text.slice(sp.s, sp.e)])), synthesized: text === piece.text ? null : text };
            accept(acc, real.wires);
            return { seg: real };
          }
        }
      }
    }
    count('no_reading');
    return { seg: null, why: tried.slice(0, 4).join(';') || 'no candidate' };
  }

  const modelSeg = (seg) => ({ ...seg, strategy: 'model', reading: 'model', nxFrom: 'model' });
  const ctxOf = (context) => ({ tab: context?.activeTab ?? null, recent_worlds: context?.recentWorlds ?? [] });

  return {
    id: 'nx',
    stats,
    model,
    attach(e) { engine = e; },
    /** True when the model may be asked now (model ready, ORT not paused). */
    available: () => { try { return !!available() && !!engine; } catch { return false; } },
    readSegment,

    /** True when a world the model is not trained on reads `text` (so the rules path must answer: user.profile). */
    untrainedReads(text, { worlds: set, session, context, router }) {
      const view = untrainedView(set, model.trained);
      if (!view) return false;
      try {
        const res = formalize(text, { worlds: view, session: session.clone(), source: 'probe', context, router });
        return res.segments.some((s) => !s.unparsed && s.wires?.length);
      } catch { return false; }
    },

    /**
     * `neural`: the model reads the whole message. Returns { complete, segments, wires }; `complete` is false when any segment was not read
     * (the caller then uses the rules path for the whole message).
     */
    async formalize(text, { worlds: set, session, source = 'input', context, router, gate = NX_GATES.neural } = {}) {
      const ctx = ctxOf(context);
      const acc = { f: session.clone() };
      const { enc, probs } = await perf.time('nx.segment', () => runtime.segment(text));
      const c = candidateSegmentations(text, enc.offsets, probs, 2, 6);
      const segs = c[0]?.segments ?? [[0, text.length]];
      const out = [];
      for (const [a, b] of segs) {
        const piece = { text: text.slice(a, b), start: a, end: b };
        const r = await readSegment(piece, set, session, { source, context, ctx, router, acc, gate });
        if (!r.seg) return { complete: false, why: r.why, segments: out, wires: [] };
        out.push(modelSeg(r.seg));
      }
      return { complete: out.length > 0, segments: out, wires: out.flatMap((s) => s.wires ?? []) };
    },

    /**
     * `hybrid`: `res` is the answer of the rules path (as shipped). The model reads only the segments that path left unparsed, behind the gate and
     * the validator; a partial, spell-corrected or best-effort answer is kept. Returns `res` itself when nothing changed.
     */
    async refine(res, { worlds: set, session, source = 'input', context, router, gate = NX_GATES.hybrid } = {}) {
      if (!res.segments.some((s) => s.unparsed) || guard.soft()) return res;
      const ctx = ctxOf(context);
      const acc = { f: session.clone() };
      const out = [];
      let changed = false;
      for (const seg of res.segments) {
        if (!seg.unparsed) { accept(acc, seg.wires ?? []); out.push(seg); continue; }
        const r = await readSegment({ text: seg.text, start: seg.span[0], end: seg.span[1] }, set, session, { source, context, ctx, router, acc, gate });
        if (r.seg) { changed = true; out.push(modelSeg(r.seg)); } else out.push(seg);
      }
      return changed ? { ...res, segments: out, wires: out.flatMap((x) => x.wires ?? []) } : res;
    },
  };
}

export { TurnAborted };
