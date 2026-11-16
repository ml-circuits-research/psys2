// stars.js — word identities, role and operator vectors (mirrors tool/sop/world.py Stars, star_version 2).
// A star is D unit-modulus complex numbers. star_version 2 (portable): SHA-256(`${seed}:${name}`), first 16 bytes -> xoshiro128** (four
// little-endian uint32 state words) -> each 32-bit output u gives the phase 2*pi*(u + 0.5)/2**32 - pi. Synchronous, no dependency.
// star_version 1 (NumPy generator) cannot be reproduced here: a v1 model reads only the stars exported in stars.bin.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function sha256(bytes) {
  const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb);
  m.set(bytes); m[l] = 0x80;
  const bits = l * 8, dv = new DataView(m.buffer);
  dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 4294967296));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + 4 * i);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(4 * i, H[i]);
  return out;
}

const enc = new TextEncoder();
const TWO_PI = 2 * Math.PI;

/** phases (Float64Array, length D) of the portable star of `name` under `seed` */
export function starV2Phases(seed, name, D) {
  const h = sha256(enc.encode(`${seed}:${name}`)), dv = new DataView(h.buffer);
  let s0 = dv.getUint32(0, true), s1 = dv.getUint32(4, true), s2 = dv.getUint32(8, true), s3 = dv.getUint32(12, true);
  if (!(s0 | s1 | s2 | s3)) { s0 = 0x9E3779B9; s1 = 0x243F6A88; s2 = 0xB7E15162; s3 = 0x6A09E667; }
  const out = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    const x = Math.imul(s1, 5) >>> 0, r = (Math.imul(((x << 7) | (x >>> 25)) >>> 0, 9)) >>> 0, t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0; s3 = (s3 ^ s1) >>> 0; s1 = (s1 ^ s2) >>> 0; s0 = (s0 ^ s3) >>> 0; s2 = (s2 ^ t) >>> 0; s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;
    out[i] = TWO_PI * (r + 0.5) / 4294967296 - Math.PI;
  }
  return out;
}

/** a complex vector {re, im} (Float64Array) from phases */
export function fromPhases(ph) {
  const D = ph.length, re = new Float64Array(D), im = new Float64Array(D);
  for (let i = 0; i < D; i++) { re[i] = Math.cos(ph[i]); im[i] = Math.sin(ph[i]); }
  return { re, im };
}

/** the star table of a model: exported stars (stars.bin) first, the portable function for anything else (star_version 2 only) */
export class Stars {
  constructor(cfg, exported) {
    this.D = cfg.D; this.seed = cfg.seed; this.starSeed = cfg.star_seed; this.version = cfg.star_version || 1;
    this.exported = exported || new Map(); this.cache = new Map(); this.identityTable = !!cfg.identity_table; this.missing = new Set();
  }
  _get(key, seed, name) {
    let v = this.cache.get(key);
    if (v) return v;
    const ph = this.exported.get(key);
    if (ph) v = fromPhases(ph);
    else if (this.version === 2 && !(this.identityTable && key.startsWith("id:"))) v = fromPhases(starV2Phases(seed, name, this.D));
    else { this.missing.add(key); return null; }
    this.cache.set(key, v); return v;
  }
  id(word) { const t = valueToken(word); return this._get("id:" + t, this.starSeed, "id:" + t); }
  role(r) { return this._get("role:" + r, this.seed, "role:" + r); }
  op(n) { return this._get("op:" + n, this.seed, "op:" + n); }
  marker() { return this.exported.has("marker") ? this._get("marker", null, null) : this.op("marker"); }
  sym(v) { return this._get("sym:" + v, this.starSeed, "sym:" + v); }
  /** identity of a VALUE (world.Stars.val): a closed-set symbol, else the last token's identity (bundle_alnum is not ported) */
  val(text, key, reader) {
    reader = reader || {};
    if (key != null && (reader.closed_values || {})[key]) return this.sym(String(text));
    if (reader.value_identity === "bundle_alnum") throw new Error("value_identity bundle_alnum (WikiSQL world) is not ported to vss.js");
    return this.id(text);
  }
}

export function valueToken(word) { const p = String(word).split(/\s+/).filter(Boolean); return p.length ? p[p.length - 1] : String(word); }
