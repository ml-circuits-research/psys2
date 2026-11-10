/**
 * Browser/Node runtime of the T5 / FLAN-T5 normalizer (spec 03 section 7.12): sentencepiece unigram tokenizer, beam search over the two
 * ONNX graphs written by `python -m psys2_train.export_normalizer`. Browser-safe: no `node:*` imports; the host injects onnxruntime
 * (`ort`), the two inference sessions and the tokenizer data. Produces the `normalizer` provider of `createDispatchValidator`.
 *
 *   const nz = createNormalizerRuntime({ ort, encoder, decoder, tokenizer: tokenizerJson, config: { layers, heads, dKv } });
 *   await nz.propose({ world: 'kids.arith', tab: 'arith', text: 'um what is 20 divided by 4', beam: 3 });   // -> ['What is 20 divided by 4', ...]
 *
 * Graph contract (see export_normalizer.py): encoder(input_ids, attention_mask) -> cross_k.<l>, cross_v.<l>;
 * decoder(input_id [b,1], step, attention_mask, self_k.<l>, self_v.<l>, cross_k.<l>, cross_v.<l>) -> logits [b,vocab], new_self_k.<l>, new_self_v.<l>.
 */
import { budget } from './budget.mjs?v=123c3e1329';

/** Unigram (sentencepiece) tokenizer from a HF `tokenizer.json`: NFKC, whitespace collapsed, `▁` for spaces, Viterbi over the vocabulary scores. */
export class UnigramTokenizer {
  constructor(json) {
    const m = json.model;
    this.pieces = m.vocab.map((v) => v[0]);
    this.scores = m.vocab.map((v) => v[1]);
    this.index = new Map(this.pieces.map((p, i) => [p, i]));
    this.unk = m.unk_id ?? 2; this.pad = 0; this.eos = 1;
    this.maxLen = Math.max(...this.pieces.map((p) => [...p].length));
  }
  /** Token ids of `text` followed by </s>. */
  encode(text) {
    const norm = '▁' + text.normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/ /g, '▁');
    const ch = [...norm], n = ch.length;
    const best = new Float64Array(n + 1).fill(-Infinity), from = new Int32Array(n + 1), id = new Int32Array(n + 1);
    best[0] = 0;
    for (let i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue;
      let hit = false;
      for (let l = 1; l <= Math.min(this.maxLen, n - i); l++) {
        const k = this.index.get(ch.slice(i, i + l).join(''));
        if (k === undefined) continue;
        hit = true;
        const s = best[i] + this.scores[k];
        if (s > best[i + l]) { best[i + l] = s; from[i + l] = i; id[i + l] = k; }
      }
      if (!hit || best[i + 1] === -Infinity) {          // unknown character: <unk> with a heavy penalty
        const s = best[i] - 20;
        if (s > best[i + 1]) { best[i + 1] = s; from[i + 1] = i; id[i + 1] = this.unk; }
      }
    }
    const out = [];
    for (let i = n; i > 0; i = from[i]) { budget.tick('normalizer-runtime.encode'); out.push(id[i]); }
    out.reverse();
    // sentencepiece merges consecutive unknowns into one
    const merged = out.filter((x, k) => !(x === this.unk && out[k - 1] === this.unk));
    merged.push(this.eos);
    return merged;
  }
  decode(ids) {
    return ids.filter((i) => i > 2).map((i) => this.pieces[i]).join('').replace(/▁/g, ' ').trim();
  }
}

const logSoftmaxTop = (row, k) => {
  let mx = -Infinity;
  for (let i = 0; i < row.length; i++) if (row[i] > mx) mx = row[i];
  let sum = 0;
  for (let i = 0; i < row.length; i++) sum += Math.exp(row[i] - mx);
  const lse = mx + Math.log(sum);
  // top-k by partial selection
  const top = [];
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (top.length < k || v > top[top.length - 1][1]) {
      let p = top.length;
      while (p > 0 && top[p - 1][1] < v) { budget.tick('normalizer-runtime.logSoftmaxTop'); p--; }
      top.splice(p, 0, [i, v]);
      if (top.length > k) top.pop();
    }
  }
  return top.map(([i, v]) => [i, v - lse]);
};

export function createNormalizerRuntime({ ort, encoder, decoder, tokenizer, config, maxNew = 48, maxSource = 160, deadlineMs = 4000, now = () => globalThis.performance?.now?.() ?? Date.now(), makeInput = (w, t, x) => `${w} | ${t || '-'} | ${x}` }) {
  const tok = tokenizer instanceof UnigramTokenizer ? tokenizer : new UnigramTokenizer(tokenizer);
  const { layers: NL, heads: H, dKv: D } = config;
  const crossNames = [];
  for (let i = 0; i < NL; i++) crossNames.push(`cross_k.${i}`, `cross_v.${i}`);
  const i64 = (arr, dims) => new ort.Tensor('int64', BigInt64Array.from(arr.map(BigInt)), dims);

  /** Beam search; returns up to `beam` hypotheses [{ ids, score }], best first (score = sum log-prob / length, as HF generate). */
  async function generate(input, beam = 3) {
    const ids = tok.encode(input).slice(0, maxSource);
    const s = ids.length;
    // HANG2: a decode can never run away: at most input length x 1.5 + 8 steps (never above maxNew) and one deadline for the whole call
    const maxSteps = Math.min(maxNew, Math.ceil(s * 1.5) + 8);
    const tEnd = now() + deadlineMs;
    const enc = await encoder.run({ input_ids: i64(ids, [1, s]), attention_mask: i64(ids.map(() => 1), [1, s]) });
    // tile the cross attention keys / values to the beam width
    const cross = {};
    for (const n of crossNames) {
      const src = enc[n].data, per = src.length;
      const tiled = new Float32Array(per * beam);
      for (let b = 0; b < beam; b++) tiled.set(src, b * per);
      cross[n] = new ort.Tensor('float32', tiled, [beam, H, s, D]);
    }
    const mask = i64(Array.from({ length: beam * s }, () => 1), [beam, s]);
    let past = [];
    for (let i = 0; i < NL; i++) for (let kv = 0; kv < 2; kv++) past.push(new Float32Array(0));
    let alive = [{ toks: [], score: 0 }];                // the first step has one live hypothesis; the others start at -inf
    for (let b = 1; b < beam; b++) alive.push({ toks: [], score: -1e9 });
    const finished = [];
    for (let step = 0; step < maxSteps; step++) {
      budget.tick('normalizer.decode');
      if (now() > tEnd) throw new Error(`normalizer deadline of ${deadlineMs} ms passed after ${step} decode steps`);
      const feeds = { input_id: i64(alive.map((a) => (a.toks.length ? a.toks[a.toks.length - 1] : tok.pad)), [beam, 1]), step: new ort.Tensor('int64', BigInt64Array.from([BigInt(step)]), []), attention_mask: mask, ...cross };
      for (let i = 0; i < NL; i++) {
        feeds[`self_k.${i}`] = new ort.Tensor('float32', past[2 * i], [beam, H, step, D]);
        feeds[`self_v.${i}`] = new ort.Tensor('float32', past[2 * i + 1], [beam, H, step, D]);
      }
      const out = await decoder.run(feeds);
      const logits = out.logits.data, V = out.logits.dims[1];
      const cand = [];
      alive.forEach((a, bi) => {
        if (a.score < -1e8) return;
        for (const [t, lp] of logSoftmaxTop(logits.subarray(bi * V, (bi + 1) * V), 2 * beam)) cand.push({ from: bi, tok: t, score: a.score + lp });
      });
      cand.sort((x, y) => y.score - x.score);
      const next = [];
      for (const [ri, c] of cand.entries()) {
        if (c.tok === tok.eos) {
          if (ri >= beam) continue;                            // HF: only candidates ranked within the beam width can finish
          finished.push({ ids: alive[c.from].toks, score: c.score / (alive[c.from].toks.length + 1) });   // HF divides by the hypothesis length including the start token
        } else if (next.length < beam) next.push(c);
        if (next.length >= beam && finished.length >= beam) break;
      }
      if (finished.length >= beam || !next.length) break;
      while (next.length < beam) { budget.tick('normalizer-runtime.generate'); next.push({ from: next[0].from, tok: next[0].tok, score: -1e9 }); }
      // gather the past of the surviving beams (new_self has length step + 1)
      const np = [];
      for (let k = 0; k < 2 * NL; k++) {
        const data = out[`new_self_${k % 2 ? 'v' : 'k'}.${k >> 1}`].data, per = data.length / beam;
        const g = new Float32Array(per * beam);
        next.forEach((c, b) => g.set(data.subarray(c.from * per, (c.from + 1) * per), b * per));
        np.push(g);
      }
      past = np;
      alive = next.map((c) => ({ toks: [...alive[c.from].toks, c.tok], score: c.score }));
    }
    if (finished.length < beam) for (const a of alive) if (a.score > -1e8) finished.push({ ids: a.toks, score: a.score / Math.max(a.toks.length, 1) });
    return finished.sort((x, y) => y.score - x.score).slice(0, beam);
  }

  return {
    tokenizer: tok, generate,
    /** The provider of `createDispatchValidator({ normalizer })`. */
    async propose({ world, tab, text, beam = 3 }) {
      const hyps = await generate(makeInput(world, tab, text), beam);
      const seen = new Set();
      return hyps.map((h) => ({ text: tok.decode(h.ids), score: h.score })).filter((h) => h.text && !seen.has(h.text) && seen.add(h.text));   // [{ text, score }]: score = length-normalized log-probability
    },
  };
}
