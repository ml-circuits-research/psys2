/**
 * Dispatcher runtime (browser-safe, no `node:*`, no dependencies): runs the exported dispatcher ONNX model (D1/D4, spec 03 section 7.1)
 * through an injected onnxruntime session and produces the prediction object that the validation layer consumes
 * (src/dialog/dispatch-validate.mjs). The decoding mirrors training/psys2_train/dispatcher.py (`dispatch`, `candidate_segmentations`,
 * `segments_from_starts`) and training/psys2_train/multicmd.py (`trim_segment`) step by step.
 *
 *   const rt = createDispatcherRuntime({ ort, session, tokenizer, worlds });   // ort: onnxruntime-web / -node module, session: InferenceSession
 *   const prediction = await rt.predict('add milk and open the map', { tab: 'robot', recent_worlds: ['kids.shop'] });
 *
 * Model contract: inputs `input_ids`, `attention_mask` (int64 [1, T]); outputs `seg_logits` [1, T, 2], `world_logits` [1, W].
 *  - segmentation pass: the raw message (max 192 tokens); P(B) per token = softmax(seg_logits)[1]; a boundary is possible at
 *    word-start tokens (not the first); candidates are subsets of flips of the `uncertain` (6) most uncertain boundaries, scored by the
 *    independent Bernoulli log-probability, best `beam` (4) distinct segmentations; joiners ("and", "then", ",", ";") are trimmed;
 *  - world pass: one pass per distinct candidate segment with the input `tab: <tab|none> ; recent: <w1 w2|none> ;; <segment>`
 *    (max 128 tokens), top-3 worlds with softmax probabilities.
 */

const LEAD_RE = /^(?:[\s,;]+|(?:and|then)\b[\s,]*)+/i;
const TRAIL_RE = /(?:[\s,;]+|\b(?:and|then)\b[\s,]*)+$/i;
const ALNUM = /^[\p{L}\p{N}]$/u;

/** Strip joiner words/punctuation at both ends of the char span [a, b); returns the new [a, b] (multicmd.trim_segment). */
export function trimSegment(text, a, b) {
  let s = text.slice(a, b);
  let m = LEAD_RE.exec(s);
  if (m && m[0].length < s.length) { a += m[0].length; s = text.slice(a, b); }
  m = TRAIL_RE.exec(s);
  if (m && m.index > 0) b = a + m.index;
  return [a, b];
}

/** Per real token: [index, start char (leading blanks skipped), end char, isWordStart] (dispatcher.token_info). */
export function tokenInfo(text, offsets) {
  const out = [];
  offsets.forEach(([a, b], i) => {
    if (b <= a) return;
    let s = a;
    while (s < text.length && /\s/.test(text[s])) s++;
    out.push([i, s, b, s === 0 || !ALNUM.test(text[s - 1])]);
  });
  return out;
}

/** Segments [a, b] trimmed of joiners from char starts (dispatcher.segments_from_starts). */
export function segmentsFromStarts(text, starts) {
  const st = [...new Set(starts)].sort((x, y) => x - y);
  const segs = [];
  st.forEach((s, k) => {
    const e = k + 1 < st.length ? st[k + 1] : text.length;
    const seg = text.slice(s, e);
    const a = s + (seg.length - seg.trimStart().length), b = s + seg.trimEnd().length;
    if (b > a) segs.push(trimSegment(text, a, b));
  });
  return segs;
}

/** dispatcher.candidate_segmentations: [{ score, segments: [[a, b]] }], best first, at most `beam`. */
export function candidateSegmentations(text, offsets, probs, beam = 4, uncertain = 6) {
  const info = tokenInfo(text, offsets);
  const first = info.length ? info[0][0] : 0;
  const pos = info.filter(([i, , , ws]) => ws && i !== first).map(([i, s]) => [s, probs[i]]);
  const base = new Set(pos.filter(([, p]) => p > 0.5).map(([s]) => s));
  const unc = pos.map((x, k) => [x, k]).sort((x, y) => Math.abs(x[0][1] - 0.5) - Math.abs(y[0][1] - 0.5) || x[1] - y[1]).slice(0, uncertain).map(([x]) => x);
  const lp = (starts) => pos.reduce((t, [s, p]) => t + Math.log(Math.max(starts.has(s) ? p : 1 - p, 1e-9)), 0);
  const firstStart = info.length ? info[0][1] : 0;
  const cands = new Map();
  for (let mask = 0; mask < (1 << unc.length); mask++) {
    const st = new Set(base);
    unc.forEach(([s], j) => { if ((mask >> j) & 1) { if (st.has(s)) st.delete(s); else st.add(s); } });
    const segs = segmentsFromStarts(text, [firstStart, ...st]);
    const key = JSON.stringify(segs);
    const score = lp(st);
    if (!cands.has(key) || cands.get(key).score < score) cands.set(key, { score, segments: segs });
  }
  return [...cands.values()].sort((x, y) => y.score - x.score).slice(0, beam);
}

/** The routing input of the world head (data.routing_text with context). */
export const routingText = (text, ctx = {}) => `tab: ${ctx.tab || 'none'} ; recent: ${(ctx.recent_worlds ?? []).join(' ') || 'none'} ;; ${text}`;

const softmax = (v) => {
  let m = -Infinity;
  for (const x of v) if (x > m) m = x;
  const e = Array.from(v, (x) => Math.exp(x - m));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
};

export function createDispatcherRuntime({ ort, session, tokenizer, worlds, useContext = true, segMaxLen = 192, worldMaxLen = 128, beam = 4, uncertain = 6, topK = 3 } = {}) {
  if (!ort?.Tensor || !session?.run || !tokenizer?.encode || !worlds?.length) throw new Error('createDispatcherRuntime needs { ort, session, tokenizer, worlds }');
  const cache = new Map();

  const run = async (ids) => {
    const n = ids.length;
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, n]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), [1, n]),
    };
    const out = await session.run(feeds);
    return { seg: out.seg_logits.data, world: out.world_logits.data };
  };

  /** Per-token P(B) and token offsets of a raw message. */
  const segment = async (text) => {
    const enc = tokenizer.encode(text, { maxLength: segMaxLen });
    const { seg } = await run(enc.ids);
    const probs = enc.ids.map((_, i) => { const p = softmax([seg[2 * i], seg[2 * i + 1]]); return p[1]; });
    return { enc, probs };
  };

  /** Top-k worlds with softmax probability for one segment text in a context (cached). */
  const rank = async (text, ctx) => {
    const input = useContext ? routingText(text, ctx) : text;
    if (cache.has(input)) return cache.get(input);
    const { world } = await run(tokenizer.encode(input, { maxLength: worldMaxLen }).ids);
    const p = softmax(world);
    const top = p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, topK).map(([x, i]) => ({ world: worlds[i], score: x }));
    if (cache.size > 2000) cache.clear();
    cache.set(input, top);
    return top;
  };

  /** Prediction object of spec 03 section 7.1 for one message. */
  const predict = async (text, context = {}) => {
    const ctx = { tab: context.tab ?? null, recent_worlds: [...(context.recent_worlds ?? [])], session: [...(context.session ?? [])] };
    const { enc, probs } = await segment(text);
    const cands = candidateSegmentations(text, enc.offsets, probs, beam, uncertain);
    const seen = new Map();
    for (const c of cands) for (const [a, b] of c.segments) { const t = text.slice(a, b); if (!seen.has(t)) seen.set(t, await rank(t, ctx)); }
    const info = tokenInfo(text, enc.offsets);
    return {
      text, context: ctx,
      boundaries: info.slice(1).filter(([, , , ws]) => ws).map(([i, s]) => ({ offset: s, p: probs[i] })),
      segmentations: cands.map((c) => ({ score: c.score, segments: c.segments.map(([a, b]) => ({ start: a, end: b, text: text.slice(a, b), worlds: seen.get(text.slice(a, b)) })) })),
    };
  };

  return { predict, segment, rank, worlds, clearCache: () => cache.clear() };
}
