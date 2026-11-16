// routebook.js — the learned route book and the addresses of a sentence (mirrors tool/sop/infer.py Routebook.addresses, which is
// experiment/v8_gates.V8.states): per token the bundle of the path, bigram, [position], soft chainL codes and the beacon-relative term.
// Complex vectors are {re, im} Float64Array; phase arrays are kept as dequantized Float64Array (exact to what Python reads).

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export class Routebook {
  /** header: {cats, codes, pos_max, D}; arrays: {name: {data: Float64Array, shape: [...]}} */
  constructor(header, arrays) {
    this.cats = header.cats; this.catId = new Map(this.cats.map((c, i) => [c, i])); this.codes = header.codes; this.D = header.D;
    this.posMax = header.pos_max === undefined ? null : header.pos_max;
    const g = (n) => (arrays[n] ? arrays[n] : null);
    this.path = g("path"); this.bg0 = g("bg0"); this.bg = g("bg"); this.A = g("A"); this.L = g("L"); this.logits = g("logits");
    this.rel = g("rel"); this.relMask = g("rel_mask"); this.takerMask = g("taker_mask"); this.pos = g("pos"); this.pc = g("pc");
    this.vo = g("vo"); this.verbMask = g("verb_mask"); this.cueMask = g("cue_mask"); this.voNmax = header.vo_nmax === undefined || header.vo_nmax === null ? null : header.vo_nmax;
    this.C = this.cats.length;
    // the centre reader (legend reader.centres; infer.Routebook.centre_addresses): phases cthR, cthL, cthC, cbgL, cbgR; floats cA, cDist, cbeta, cN
    this.centreKinds = header.centre_kinds || null;
    this.centreTokens = header.centre_tokens || null;     // run 2 (sop train --centre_key event): phase rows keyed by the centre's token, last row '*' shared
    for (const n of ["cthR", "cthL", "cthC", "cbgL", "cbgR", "cA", "cDist", "cbeta", "cN"]) this[n] = g(n);
    // cos / sin tables of the arrays used only through exp(i phase) (Float32Array: half the memory, error ~1e-7, far below the 1e-4 parity bound)
    const tab = (x) => { if (!x) return null; const n = x.data.length, c = new Float32Array(n), s = new Float32Array(n); for (let i = 0; i < n; i++) { c[i] = Math.cos(x.data[i]); s[i] = Math.sin(x.data[i]); } return { c, s }; };
    this.tBg0 = tab(this.bg0); this.tBg = tab(this.bg); this.tA = tab(this.A); this.tL = tab(this.L); this.tRel = tab(this.rel);
    // a sparse route book (export_web --sparse; tool/sop/infer.py Routebook.pair_rows): bg / A / L hold only their trained rows; rowOf maps a
    // kind pair i * C + j to its stored row, -1 = absent (never trained), and an absent row contributes nothing. null = dense
    const ro = (x) => (x && x.rowOf ? x.rowOf : null);
    this.rowBg = ro(this.bg); this.rowA = ro(this.A); this.rowL = ro(this.L);
    // the stored row of a kind pair (or -1); dense: the pair's own row
    this.row = (rowOf, pair) => (rowOf ? rowOf[pair] : pair);
  }
  has(code) { return this.codes.includes(code); }
  /** the centre reader's structure and addresses of a message (the twin of infer.Routebook.centre_addresses, same formulas, same order of
   *  operations, float64 cos / sin): c = kind indices -> {centres, ci, lc, rc, nul, wL, wR, wS, aL, aR, aC}; linear in the tokens */
  centreAddresses(c, lem = null) {
    const T = c.length, D = this.D, K = this.C, erow = new Map();
    this.centreKinds.forEach((k, e) => { if (this.catId.has(k)) erow.set(this.catId.get(k), e); });
    const isc = c.map((x) => erow.has(x)), centres = [], ci = new Int32Array(T).fill(-1);
    for (let t = 0; t < T; t++) if (isc[t]) { ci[t] = centres.length; centres.push(t); }
    const lc = new Int32Array(T).fill(-1), rc = new Int32Array(T).fill(-1);
    let ce;
    if (this.centreTokens) { const tr = new Map(this.centreTokens.map((w, i) => [w, i])); ce = centres.map((p) => (tr.has(lem[p]) ? tr.get(lem[p]) : this.centreTokens.length - 1)); }
    else ce = centres.map((p) => erow.get(c[p]));
    let last = -1; for (let t = 0; t < T; t++) { if (isc[t]) last = ci[t]; else lc[t] = last; }
    let nxt = -1; for (let t = T - 1; t >= 0; t--) { if (isc[t]) nxt = ci[t]; else rc[t] = nxt; }
    const kp = (t) => (t >= 1 ? c[t - 1] : K), kn = (t) => (t + 1 < T ? c[t + 1] : K + 1), kp2 = (t) => (t >= 2 ? c[t - 2] : K), kn2 = (t) => (t + 2 < T ? c[t + 2] : K + 1);
    const N = this.cN.data, W = K + 2, A = this.cA.data, Di = this.cDist.data, B = this.cbeta.data;
    const nul = new Float64Array(T), keep = new Float64Array(T);
    for (let t = 0; t < T; t++) { nul[t] = sigmoid(N[c[t]] + N[W + kp(t)] + N[2 * W + kn(t)] + N[3 * W + kp2(t)] + N[4 * W + kn2(t)]); keep[t] = 1 - nul[t]; }
    const QR = new Float64Array(T + 1), QL = new Float64Array(T + 1);
    for (let t = 0; t < T; t++) { QR[t + 1] = QR[t] + B[K + c[t]]; QL[t + 1] = QL[t] + B[c[t]]; }
    const a3 = (i, j, s) => A[(i * K + j) * 3 + s];
    const wL = new Float64Array(T), wR = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      if (lc[t] >= 0) { const p = centres[lc[t]]; wL[t] = sigmoid(a3(c[t], c[p], 1) + Di[16 + Math.min(t - p, 15)] + (QR[t] - QR[p + 1])) * keep[t]; }
      if (rc[t] >= 0) { const p = centres[rc[t]]; wR[t] = sigmoid(a3(c[t], c[p], 0) + Di[Math.min(p - t, 15)] + (QL[p] - QL[t + 1])) * keep[t]; }
    }
    const wS = centres.map((p) => sigmoid(a3(c[p], c[p], 2) + Di[32]) * keep[p]);
    const bL = this.cbgL.data, bR = this.cbgR.data, bg = [];
    for (let t = 0; t < T; t++) {
      const re = new Float64Array(D), im = new Float64Array(D), o1 = (kp(t) * K + c[t]) * D, o2 = (c[t] * W + kn(t)) * D;
      for (let d = 0; d < D; d++) { re[d] = Math.cos(bL[o1 + d]) + Math.cos(bR[o2 + d]); im[d] = Math.sin(bL[o1 + d]) + Math.sin(bR[o2 + d]); }
      bg.push({ re, im });
    }
    const PR = new Map(), PL = new Map(), tR = this.cthR.data, tL = this.cthL.data;
    for (const e of [...new Set(ce)].sort((x, y) => x - y)) {
      const R = new Float64Array((T + 1) * D), L = new Float64Array((T + 1) * D);
      for (let t = 0; t < T; t++) { const o = (e * K + c[t]) * D; for (let d = 0; d < D; d++) { R[(t + 1) * D + d] = R[t * D + d] + tR[o + d]; L[(t + 1) * D + d] = L[t * D + d] + tL[o + d]; } }
      PR.set(e, R); PL.set(e, L);
    }
    const zero = () => ({ re: new Float64Array(D), im: new Float64Array(D) }), aL = [], aR = [], aC = [];
    for (let t = 0; t < T; t++) {
      let x = zero(), y = zero();
      if (lc[t] >= 0) {
        const p = centres[lc[t]], R = PR.get(ce[lc[t]]), w = wL[t], g = bg[t];
        for (let d = 0; d < D; d++) { const ph = R[(t + 1) * D + d] - R[(p + 1) * D + d]; x.re[d] = w * (Math.cos(ph) + g.re[d]); x.im[d] = w * (Math.sin(ph) + g.im[d]); }
      }
      if (rc[t] >= 0) {
        const p = centres[rc[t]], L = PL.get(ce[rc[t]]), w = wR[t], g = bg[t];
        for (let d = 0; d < D; d++) { const ph = L[p * D + d] - L[t * D + d]; y.re[d] = w * (Math.cos(ph) + g.re[d]); y.im[d] = w * (Math.sin(ph) + g.im[d]); }
      }
      aL.push(x); aR.push(y);
    }
    const tC = this.cthC.data;
    centres.forEach((p, j) => {
      const o = ce[j] * D, w = wS[j], g = bg[p], x = zero();
      for (let d = 0; d < D; d++) { x.re[d] = w * (Math.cos(tC[o + d]) + g.re[d]); x.im[d] = w * (Math.sin(tC[o + d]) + g.im[d]); }
      aC.push(x);
    });
    return { centres, ci, lc, rc, nul, wL, wR, wS, aL, aR, aC };
  }
  /** c: category indices (length T) -> Array of T complex vectors */
  addresses(c) {
    const T = c.length, D = this.D, C = this.C, P = this.path ? this.path.data : null;
    const terms = Array.from({ length: T }, () => ({ re: new Float64Array(D), im: new Float64Array(D) }));
    if (this.has("path")) {
      const acc = new Float64Array(D);
      for (let k = 0; k < T; k++) {
        const o = c[k] * D, t = terms[k];
        for (let d = 0; d < D; d++) { acc[d] += P[o + d]; t.re[d] += Math.cos(acc[d]); t.im[d] += Math.sin(acc[d]); }
      }
    }
    if (this.has("bigram")) {
      for (let k = 0; k < T; k++) {
        const t = terms[k], r = k === 0 ? c[0] : this.row(this.rowBg, c[k - 1] * C + c[k]), tb = k === 0 ? this.tBg0 : this.tBg;
        if (r < 0) continue;                              // an absent bigram row: no term
        const o = r * D;
        for (let d = 0; d < D; d++) { t.re[d] += tb.c[o + d]; t.im[d] += tb.s[o + d]; }
      }
    }
    if (this.has("pos") && this.pos) {
      const PO = this.pos.data, PC = this.pc.data;
      for (let k = 0; k < T; k++) {
        const pi = Math.min(k, 39), on = this.posMax === null ? 1 : (pi < this.posMax ? 1 : 0), t = terms[k];
        if (!on) continue;
        for (let d = 0; d < D; d++) { const ph = PO[pi * D + d] + PC[c[k] * D + d]; t.re[d] += Math.cos(ph); t.im[d] += Math.sin(ph); }
      }
    }
    if (this.has("chainL") || this.has("chain")) {
      const tA = this.tA, tL = this.tL, g = c.map((x) => sigmoid(this.logits.data[x]));
      const Sx = new Float64Array(T + 1);
      for (let k = 0; k < T; k++) Sx[k + 1] = Sx[k] + Math.log1p(-g[k] + 1e-9);
      const addr = [];
      for (let k = 0; k < T; k++) {
        const re = new Float64Array(D), im = new Float64Array(D), pRoot = Math.exp(Sx[k]);
        re.fill(pRoot);
        for (let j = 0; j < k; j++) {
          const r = this.row(this.rowA, c[j] * C + c[k]);
          if (r < 0) continue;                            // an absent A row: that chain term is left out
          const p = g[j] * Math.exp(Sx[k] - Sx[j + 1]), o = r * D, a = addr[j];
          for (let d = 0; d < D; d++) {
            const er = tA.c[o + d], ei = tA.s[o + d];
            re[d] += p * (a.re[d] * er - a.im[d] * ei); im[d] += p * (a.re[d] * ei + a.im[d] * er);
          }
        }
        addr.push({ re, im });
      }
      let fin = addr;
      if (this.has("chainL")) {
        fin = [];
        for (let k = 0; k < T; k++) {
          const s = Math.exp(Sx[T] - Sx[k + 1]), re = new Float64Array(D), im = new Float64Array(D), a = addr[k];
          for (let d = 0; d < D; d++) { re[d] = s * a.re[d]; im[d] = s * a.im[d]; }
          for (let q = k + 1; q < T; q++) {
            const r = this.row(this.rowL, c[q] * C + c[k]);
            if (r < 0) continue;                          // an absent L row: that chain term is left out
            const p = g[q] * Math.exp(Sx[q] - Sx[k + 1]), o = r * D, b = addr[q];
            for (let d = 0; d < D; d++) {
              const er = tL.c[o + d], ei = tL.s[o + d];
              re[d] += p * (b.re[d] * er - b.im[d] * ei); im[d] += p * (b.re[d] * ei + b.im[d] * er);
            }
          }
          const gk = g[k], out = { re: new Float64Array(D), im: new Float64Array(D) };
          for (let d = 0; d < D; d++) { out.re[d] = gk * a.re[d] + (1 - gk) * re[d]; out.im[d] = gk * a.im[d] + (1 - gk) * im[d]; }
          fin.push(out);
        }
      }
      for (let k = 0; k < T; k++) for (let d = 0; d < D; d++) { terms[k].re[d] += fin[k].re[d]; terms[k].im[d] += fin[k].im[d]; }
    }
    if (this.vo && this.verbMask) {                       // the verb-order route (infer.Routebook.vorder_index)
      const VM = this.verbMask.data, VO = this.vo.data, N = this.voNmax, verbs = [], CM = this.cueMask ? this.cueMask.data : null;
      const cued = c.map((x, k) => k > 0 && CM !== null && CM[c[k - 1]] > 0);      // variant b: introduced by a role cue -> left to the chain
      for (let k = 0; k < T; k++) if (VM[c[k]] > 0) verbs.push(k);
      for (let k = 0; k < T; k++) {
        if (VM[c[k]] > 0 || cued[k]) continue;
        let side, vcat, ord = 0, j = -1;
        for (const v of verbs) if (v < k) j = v;
        if (j >= 0) { side = 1; vcat = c[j]; for (let i = j + 1; i < k; i++) if (c[i] === c[k] && !cued[i]) ord++; }
        else { const r = verbs.find((v) => v > k); if (r === undefined) continue; side = 0; vcat = c[r]; for (let i = 0; i < k; i++) if (c[i] === c[k] && !cued[i]) ord++; }
        ord = Math.min(ord, N - 1);
        const o = (((side * C + vcat) * C + c[k]) * N + ord) * D, t = terms[k];
        for (let d = 0; d < D; d++) { const ph = VO[o + d]; t.re[d] += Math.cos(ph); t.im[d] += Math.sin(ph); }
      }
    }
    if (this.rel && T > 1) {
      const tR = this.tRel, RM = this.relMask.data, TM = this.takerMask.data;
      for (let k = 1; k < T; k++) {
        const sel = RM[c[k - 1]] * TM[c[k]];
        if (sel === 0) continue;
        const t = terms[k], o = c[k - 1] * D;
        for (let d = 0; d < D; d++) {
          const er = tR.c[o + d], ei = tR.s[o + d], r0 = t.re[d], i0 = t.im[d];
          t.re[d] = r0 + sel * (r0 * er - i0 * ei); t.im[d] = i0 + sel * (r0 * ei + i0 * er);
        }
      }
    }
    return terms;
  }
}
