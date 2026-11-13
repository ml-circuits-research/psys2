/**
 * Dispatcher runtime (browser-safe, no `node:*`, no dependencies): runs the exported dispatcher ONNX model (D1/D4, spec 03 section 7.1)
 * through an injected onnxruntime session and produces the prediction object that the validation layer consumes
 * (src/dialog/dispatch-validate.mjs). The decoding mirrors training/psys2_train/dispatcher.py (`dispatch`, `candidate_segmentations`,
 * `segments_from_starts`) and training/psys2_train/multicmd.py (`trim_segment`) step by step.
 *
 *   const rt = createDispatcherRuntime({ ort, session, tokenizer, worlds });   // ort: onnxruntime-web / -node module, session: InferenceSession
 *   const prediction = await rt.predict('add milk and open the map', { tab: 'robot', recent_worlds: ['kids.shop'] });
 *
 * Model contract: inputs `input_ids`, `attention_mask` (int64 [1, T]); outputs `seg_logits` [1, T, 2], `world_logits` [1, W] and, for a
 * model with the simplification head (D1b), `edit_logits` [1, T, K] (per-token edit tag scores; `editTags` lists the K tags: KEEP, DELETE,
 * R:/P:/A: vocabulary, see src/formalizer/edit-tags.mjs).
 *  - segmentation pass: the raw message (max 192 tokens); P(B) per token = softmax(seg_logits)[1]; a boundary is possible at
 *    word-start tokens (not the first); candidates are subsets of flips of the `uncertain` (6) most uncertain boundaries, scored by the
 *    independent Bernoulli log-probability, best `beam` (4) distinct segmentations; joiners ("and", "then", ",", ";") are trimmed;
 *  - world pass: one pass per distinct candidate segment with the input `tab: <tab|none> ; recent: <w1 w2|none> ;; <segment>`
 *    (max 128 tokens), top-3 worlds with softmax probabilities. The same pass gives the edit tags of the piece: one tag per word of the
 *    piece (argmax of the first sub-token of the word), applied by `simplifiedText` -> `segment.simplified` (only when the rewrite
 *    differs from the piece text). Mirrors training/psys2_train/dispatcher.py `run_world(edit_tags=...)` and edit.py `word_tokens`.
 */
import { wordsOf, simplifiedText } from './edit-tags.mjs?v=8e12cb6e3e';

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
    while (s < text.length && /\s/.test(text[s])) { budget.tick('dispatcher-runtime.tokenInfo'); s++; }
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

/** Per word the index of its first token (null when truncated away); `prefix` = characters before the piece in the model input (edit.word_tokens). */
export function wordTokens(offsets, prefix, words) {
  const out = [];
  let i = 0;
  const n = offsets.length;
  for (const { start, end } of words) {
    const s = start + prefix, e = end + prefix;
    while (i < n && !(offsets[i][1] > offsets[i][0] && offsets[i][1] > s)) { budget.tick('dispatcher-runtime.wordTokens'); i++; }
    out.push(i < n && offsets[i][0] < e ? i : null);
  }
  return out;
}

/** Edit tags of the words of `text` from the per-token logits (flat [T*K]); tokens are those of the full routing input. */
export function decodeEditTags(text, prefix, offsets, logits, K, editTags, tau = 0.5) {
  const words = wordsOf(text);
  const tags = wordTokens(offsets, prefix, words).map((t) => {
    if (t === null) return 'KEEP';
    // best non-KEEP tag, taken only when its softmax probability reaches `tau` (editTags[0] is KEEP); mirrors run_world(edit_tau)
    const p = softmax(Array.from({ length: K }, (_, k) => logits[t * K + k]));
    let best = 1;
    for (let k = 2; k < K; k++) if (p[k] > p[best]) best = k;
    return p[best] >= tau ? editTags[best] ?? 'KEEP' : 'KEEP';
  });
  return { words, tags, simplified: simplifiedText(text, words, tags) };
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

/**
 * Overlapping windows over `n` tokens (review F8): [[a, b), ...] of at most `size` tokens, consecutive windows start `stride` apart and the
 * last one ends at `n`. One window [0, n) when everything fits. Mirrors psys2_train.windows.window_spans.
 */
export function windowSpans(n, size, stride = Math.max(1, size >> 1)) {
  if (n <= size) return [[0, n]];
  const out = [];
  for (let a = 0; a + size < n; a += stride) out.push([a, a + size]);
  out.push([n - size, n]);
  return out;
}

const FULL = 1e9;   // maxLength meaning "do not truncate" for the tokenizer

import { perf } from './perf.mjs?v=06e451c3d4';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

export function createDispatcherRuntime({ ort, session, tokenizer, worlds, editTags = null, editTau = 0.5, useContext = true, segMaxLen = 192, worldMaxLen = 128, beam = 4, uncertain = 6, topK = 3 } = {}) {
  if (!ort?.Tensor || !session?.run || !tokenizer?.encode || !worlds?.length) throw new Error('createDispatcherRuntime needs { ort, session, tokenizer, worlds }');
  const cache = new Map();

  // `fetch` names the outputs the caller needs: the ORT worker client then computes and copies only those (the segmentation pass needs
  // seg_logits only, so the NX heads' tag logits are not copied for it); onnxruntime-node ignores the option and returns everything.
  const run = async (ids, fetch = null) => {
    const n = ids.length;
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, n]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), [1, n]),
    };
    const out = await perf.time('ort', () => (fetch ? session.run(feeds, { fetch }) : session.run(feeds)));
    return { seg: out.seg_logits?.data ?? null, world: out.world_logits?.data ?? null, edit: out.edit_logits?.data ?? null, op: out.op_logits?.data ?? null, tag: out.tag_logits?.data ?? null };
  };

  /** Per-token P(B) and token offsets of a raw message. */
  const segCache = new Map();   // the last few messages: the NX reading and the dispatcher path of one turn share the pass
  const segment = async (text) => {
    if (segCache.has(text)) return segCache.get(text);
    const r = await segmentRun(text);
    if (segCache.size > 40) segCache.clear();
    segCache.set(text, r);
    return r;
  };
  const segmentRun = async (text) => {
    const enc = perf.timeSync('tokenize', () => tokenizer.encode(text, { maxLength: FULL }));
    if (enc.ids.length <= segMaxLen) {
      const { seg } = await run(enc.ids, ['seg_logits']);
      return { enc, probs: enc.ids.map((_, i) => softmax([seg[2 * i], seg[2 * i + 1]])[1]), windows: 1 };
    }
    // review F8: longer than the model limit -> overlapping windows; a token takes the probability of the windows that see it
    // with their distance to the window edge as weight (a boundary decision made near an edge counts less).
    const n = enc.ids.length - 2, cls = enc.ids[0], sep = enc.ids[enc.ids.length - 1];
    const spans = windowSpans(n, segMaxLen - 2);
    const acc = new Float64Array(n), wsum = new Float64Array(n);
    for (const [a, b] of spans) {
      const { seg } = await run([cls, ...enc.ids.slice(1 + a, 1 + b), sep], ['seg_logits']);
      for (let k = a; k < b; k++) {
        const r = k - a + 1, w = Math.min(r, b - k);
        acc[k] += w * softmax([seg[2 * r], seg[2 * r + 1]])[1]; wsum[k] += w;
      }
    }
    const probs = [0, ...Array.from(acc, (x, k) => x / wsum[k]), 0];
    return { enc, probs, windows: spans.length };
  };

  /** Top-k worlds (softmax probability) and the simplified text (edit head, or null) for one segment text in a context (cached). */
  const rankFull = async (text, ctx) => {
    const input = useContext ? routingText(text, ctx) : text;
    if (cache.has(input)) return cache.get(input);
    const enc = perf.timeSync('tokenize', () => tokenizer.encode(input, { maxLength: FULL }));
    let p, edit = null, windowed = 1, nx = null;
    if (enc.ids.length <= worldMaxLen) {
      const r = await run(enc.ids);
      p = softmax(r.world); edit = r.edit;
      // NX heads of the same pass (no second pass): operation logits and per-token tag logits, for the formalizer strategy (src/formalizer/nx.mjs)
      if (r.op && r.tag) nx = { op: r.op, tag: r.tag, L: r.tag.length / enc.ids.length, offsets: enc.offsets, pre: input.length - text.length };
    } else {
      // review F8: an overlong segment is routed by overlapping windows of its own text (each with the context prefix);
      // the world probabilities are averaged; no simplification for such a segment (the edit head sees one window only).
      const prefixTokens = tokenizer.encode(routingText('', ctx), { maxLength: FULL }).ids.length - 2;
      const te = tokenizer.encode(text, { maxLength: FULL });
      const spans = windowSpans(te.ids.length - 2, Math.max(worldMaxLen - 2 - prefixTokens, 16));
      windowed = spans.length;
      const acc = new Float64Array(worlds.length);
      for (const [a, b] of spans) {
        const wt = text.slice(te.offsets[1 + a][0], te.offsets[b][1]);
        const wi = tokenizer.encode(useContext ? routingText(wt, ctx) : wt, { maxLength: worldMaxLen });
        softmax((await run(wi.ids)).world).forEach((x, i) => { acc[i] += x / spans.length; });
      }
      p = Array.from(acc);
    }
    const top = p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, topK).map(([x, i]) => ({ world: worlds[i], score: x }));
    let simplified = null, tags = null;
    if (editTags && edit) {
      const d = decodeEditTags(text, input.length - text.length, enc.offsets, edit, editTags.length, editTags, editTau);
      simplified = d.simplified; tags = d.tags;
    }
    const res = { worlds: top, simplified, tags, windows: windowed, nx };
    if (cache.size > 2000) cache.clear();
    cache.set(input, res);
    return res;
  };
  const rank = async (text, ctx) => (await rankFull(text, ctx)).worlds;

  /** Prediction object of spec 03 section 7.1 for one message. */
  const predict = (text, context = {}) => perf.time('predict', () => predictRun(text, context));
  const predictRun = async (text, context = {}) => {
    const ctx = { tab: context.tab ?? null, recent_worlds: [...(context.recent_worlds ?? [])], session: [...(context.session ?? [])] };
    const { enc, probs } = await segment(text);
    const cands = candidateSegmentations(text, enc.offsets, probs, beam, uncertain);
    const seen = new Map();
    for (const c of cands) for (const [a, b] of c.segments) { const t = text.slice(a, b); if (!seen.has(t)) seen.set(t, await rankFull(t, ctx)); }
    const info = tokenInfo(text, enc.offsets);
    return {
      text, context: ctx,
      boundaries: info.slice(1).filter(([, , , ws]) => ws).map(([i, s]) => ({ offset: s, p: probs[i] })),
      segmentations: cands.map((c) => ({ score: c.score, segments: c.segments.map(([a, b]) => { const r = seen.get(text.slice(a, b)); return { start: a, end: b, text: text.slice(a, b), worlds: r.worlds, ...(r.simplified ? { simplified: r.simplified } : {}) }; }) })),
    };
  };

  return { predict, segment, rank, rankFull, worlds, editTags, clearCache: () => { cache.clear(); segCache.clear(); } };
}
