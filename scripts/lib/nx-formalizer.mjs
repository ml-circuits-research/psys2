// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NX5: the encoder-heads reading as a formalizer strategy (same interface as src/formalizer/strategy.mjs), built outside src/.
 *
 * Pipeline of one segment (model output -> spans and operation -> deterministic canonicalisation -> SOP wires -> validator):
 *   1. one pass of the NX ONNX (nx-a / nx-aplus export) on `tab: .. ; recent: .. ;; <segment>` gives op_logits and tag_logits (BIO over the
 *      sub-tokens), plus the dispatcher's own seg/world logits;
 *   2. candidate operations = the 3 best ops (not `none`) that some pattern of the loaded worlds can emit; candidate patterns = the patterns whose
 *      emit makes that operation (the legend: which keys the operation has);
 *   3. the BIO tags are decoded with the labels restricted to the keys of the candidate operation (legend constraint), giving
 *      one span of the segment per key;
 *   4. canonicalisation is the rules' own: a sentence is synthesized from the candidate pattern's match string with the predicted spans put
 *      in the slots of those keys, and the rule formalizer (restricted to that operation) reads it, so every value goes through the slot class
 *      (number words, lexicon lemmas, agents, names) and the emit template builds the wires; `{segment}` is the real segment text;
 *      patterns that carry no value slot (the diagram.sketch family: operation only) are read on the real text;
 *   5. validator: the wires are checked by the legend (formalize does it) and executed on a fork of the session (the interpreter must not
 *      raise an error). A reading that fails is dropped, the next candidate is tried; none left -> the segment is `unparsed` (abstain).
 * Modes: 'first' (model first; unparsed segments are retried by the engine with the rules), 'only' (the engine's rule retry is blocked by the
 * caller), 'hybrid' (D: the rules read first, the model only reads the segments the rules have no complete reading for).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lexIndex } from '../../src/worlds/lexicon.mjs';
import { compilePattern, formalize } from '../../src/formalizer/rules/index.mjs';
import { createWordPieceTokenizer } from '../../src/formalizer/wordpiece.mjs';
import { createDispatcherRuntime, candidateSegmentations, routingText } from '../../src/formalizer/dispatcher-runtime.mjs';
import { atom } from '../../src/soplang/index.mjs';

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
export function buildPatternIndex(set) {
  const lex = lexIndex(set);
  const byOp = new Map();
  for (const w of set.list()) {
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

/** Load the NX model through an onnxruntime module: { ort, session, tokenizer, ops, labels, worlds, runtime }. */
export async function loadNxModel({ ortPath, dir, dispatcherDir = 'docs/webchat/models/dispatcher', threads = 1 }) {
  const mod = await import(pathToFileURL(resolve(ortPath)).href);
  const ort = mod.InferenceSession ? mod : mod.default;
  const meta = JSON.parse(readFileSync(join(dir, 'nx-meta.json'), 'utf8'));
  const dmeta = JSON.parse(readFileSync(join(dispatcherDir, 'meta.json'), 'utf8'));
  const session = await ort.InferenceSession.create(join(dir, 'model.int8.onnx'), { graphOptimizationLevel: 'all', intraOpNumThreads: threads, interOpNumThreads: 1 });
  const tokenizer = createWordPieceTokenizer(readFileSync(join(dispatcherDir, 'vocab.txt'), 'utf8'));
  const runtime = createDispatcherRuntime({ ort, session, tokenizer, worlds: dmeta.worlds, useContext: true });
  const labels = meta.labels;
  const labelIdx = new Map(labels.map((l, i) => [l, i]));
  return { ort, session, tokenizer, ops: meta.ops, labels, labelIdx, worlds: dmeta.worlds, runtime, mode: meta.mode, cache: new Map() };
}

/** One pass on a segment in a context: op probabilities, tag logits and token offsets of the segment part. */
async function passOn(model, text, ctx) {
  const input = routingText(text, ctx);
  if (model.cache.has(input)) return model.cache.get(input);
  const enc = model.tokenizer.encode(input, { maxLength: 128 });
  const n = enc.ids.length;
  const out = await model.session.run({
    input_ids: new model.ort.Tensor('int64', BigInt64Array.from(enc.ids, (x) => BigInt(x)), [1, n]),
    attention_mask: new model.ort.Tensor('int64', BigInt64Array.from(enc.ids, () => 1n), [1, n]),
  });
  const L = model.labels.length;
  const res = { opP: softmax(out.op_logits.data), tag: out.tag_logits.data, L, offsets: enc.offsets, pre: input.length - text.length, worldP: softmax(out.world_logits.data) };
  if (model.cache.size > 4000) model.cache.clear();
  model.cache.set(input, res);
  return res;
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

/**
 * Create the strategy. `rules` is engine.formalizers.rules (kept even when the caller blocks it for the retry).
 * mode: 'first' | 'only' | 'hybrid'. `stats` collects counters of how the readings were obtained.
 */
export function createNxFormalizer({ model, mode = 'first', rules, stats = {}, topOps = 3 }) {
  let engine = null; let index = null; let setOf = null;
  const count = (k) => { stats[k] = (stats[k] ?? 0) + 1; };

  const dryRun = (session, wires) => {
    try {
      const f = session.clone();
      f.add(wires);
      for (const w of wires) { const r = engine.interp.resolve(f, w); if (r && r.status === 'error') return false; }
      return true;
    } catch { return false; }
  };

  /** Read one segment text with the model; returns a rules-shaped segment (not unparsed) or null. `commit` runs on the real session. */
  async function readSegment(piece, set, session, { source, context, ctx, router }) {
    index ??= buildPatternIndex(set);
    const pass = await passOn(model, piece.text, ctx);
    const ranked = pass.opP.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    if (model.ops[ranked[0][1]] === 'none') { count('says_none'); if (process.env.NX_DEBUG) console.error('NXDBG-none', JSON.stringify(piece.text)); return { seg: null, why: 'none' }; }
    const tried = [];
    let nOps = 0;
    for (const [p, oi] of ranked) {
      const op = model.ops[oi];
      if (op === 'none') continue;
      const recs = index.get(op);
      if (!recs?.length) continue;
      if (++nOps > topOps) break;
      // group by world, best-ranked world first (the dispatcher head of the same pass)
      const worlds = [...new Set(recs.map((r) => r.world))].sort((a, b) => (pass.worldP[model.worlds.indexOf(b)] ?? 0) - (pass.worldP[model.worlds.indexOf(a)] ?? 0));
      for (const world of worlds) {
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
          const valueSlots = r.slotOfTag.size;
          const fr = frameFit(r, toks);
          return { r, used, extra: spans.size - used, sentence, valueSlots, fr };
        }).filter((x) => x.sentence !== null || x.valueSlots === 0)
          .sort((a, b) => b.used - a.used || a.extra - b.extra || b.fr - a.fr || b.r.priority - a.r.priority);
        for (const cand of scored.slice(0, 6)) {
          const opOnly = cand.valueSlots === 0;
          // a pattern with no value slot (operation only) is read on the real text first, then on the pattern's own frame sentence
          const variants = opOnly ? [piece.text, ...(cand.sentence && cand.sentence !== piece.text ? [cand.sentence] : [])] : [cand.sentence];
          const view = viewFor(set, world, group);
          let done = null;
          for (const text of variants) {
            const trial = async (sess) => {
              const res = formalize(text, { worlds: view, session: sess, source, context, router });
              const seg = res.segments.length === 1 ? res.segments[0] : null;
              if (!seg || seg.unparsed || !seg.wires.length) return null;
              const main = seg.wires.find((w) => w.type !== 'core.agent');
              if (!main) return null;
              const opGot = main.type === 'core.request' ? `request:${main.entries.find((e) => e.key === 'core.request.action')?.value.v}`
                : main.type === 'core.question' ? `question:${main.entries.find((e) => e.key === 'core.question.type')?.value.v}:${main.entries.find((e) => e.key === 'core.question.seek')?.value.v}` : main.type;
              if (opGot !== op) return null;
              return seg;
            };
            let probe;
            try { probe = await trial(session.clone()); } catch { probe = null; }
            if (!probe) { tried.push(`${cand.r.p.id}:no-read`); continue; }
            if (!dryRun(session, probe.wires)) { tried.push(`${cand.r.p.id}:refused`); continue; }
            let real;
            try { real = await trial(session); } catch { real = null; }
            if (!real) { tried.push(`${cand.r.p.id}:no-read2`); continue; }
            // the segment text instead of the synthesized one in `{segment}` values
            if (text !== piece.text) real.wires = real.wires.map((w) => ({ ...w, entries: w.entries.map((e) => (e.value.kind === 'string' && e.value.v === text ? { ...e, value: { ...e.value, v: piece.text } } : e)) }));
            count(opOnly ? (text === piece.text ? 'read_op_only' : 'read_op_frame') : 'read_spans');
            if (!opOnly && cand.extra > 0) count('read_with_unused_spans');
            real.text = piece.text; real.span = [piece.start, piece.end];
            real.nx = { op, world, pattern: cand.r.p.id, rank: nOps, p, spans: Object.fromEntries([...spans].map(([t, sp]) => [t, piece.text.slice(sp.s, sp.e)])), synthesized: text === piece.text ? null : text };
            done = { seg: real };
            break;
          }
          if (done) return done;
        }
      }
    }
    count('no_reading');
    if (process.env.NX_DEBUG) console.error('NXDBG', JSON.stringify(piece.text), ranked.slice(0, 3).map(([p, i]) => `${model.ops[i]}:${p.toFixed(2)}`).join(' '), tried.slice(0, 4).join(';'));
    return { seg: null, why: tried.slice(0, 4).join(';') || 'no candidate' };
  }

  const unparsedSeg = (piece, why) => ({ text: piece.text, span: [piece.start, piece.end], isQuestion: /\?\s*$/.test(piece.text), worlds: [], routing: null, match: null, wires: [], unparsed: true, alternatives: [], errors: [`nx: ${why}`] });

  return {
    id: 'encoder',
    mode,
    stats,
    attach(e) { engine = e; },
    reset() {},
    status: { state: 'ready', message: 'nx' },
    onStatus(f) { f(this.status); return () => {}; },
    prepare: () => Promise.resolve(),
    retry() {},
    ready: () => true,
    available: () => true,
    supports: () => true,
    async quickSegmentation() { return null; },

    async formalize(text, { worlds: set, session, source = 'input', context, router } = {}) {
      setOf = set;
      const ctx = { tab: context?.activeTab ?? null, recent_worlds: context?.recentWorlds ?? [] };
      const pieces = [];
      if (mode === 'hybrid') {
        // D: the rules read first; the model only reads what the rules have no complete reading for
        const res = formalize(text, { worlds: set, session, source, context, router });
        const out = [];
        for (const seg of res.segments) {
          if (!seg.unparsed && seg.wires.length && dryRun(session, seg.wires)) { count('hybrid_rules'); out.push({ ...seg, nxFrom: 'rules' }); continue; }
          const piece = { text: seg.text, start: seg.span[0], end: seg.span[1] };
          const r = await readSegment(piece, set, session, { source, context, ctx, router });
          if (r.seg) { count('hybrid_model'); out.push({ ...r.seg, nxFrom: 'model' }); } else { count('hybrid_abstain'); out.push(seg.unparsed ? seg : unparsedSeg(piece, r.why)); }
        }
        return { segments: out, wires: out.flatMap((s) => s.wires ?? []) };
      }
      const { enc, probs } = await model.runtime.segment(text);
      const c = candidateSegmentations(text, enc.offsets, probs, 2, 6);
      const segs = c[0]?.segments ?? [[0, text.length]];
      const out = [];
      for (const [a, b] of segs) {
        const piece = { text: text.slice(a, b), start: a, end: b };
        const r = await readSegment(piece, set, session, { source, context, ctx, router });
        out.push(r.seg ? { ...r.seg, nxFrom: 'model' } : unparsedSeg(piece, r.why));
      }
      return { segments: out, wires: out.flatMap((s) => s.wires ?? []) };
    },
  };
}
