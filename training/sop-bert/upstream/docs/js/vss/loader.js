// loader.js — the files written by `sop export-web` (tool/sop/export_web.py): model.json, routebook.bin, stars.bin, manifest.json.
// Binary layout: 8 bytes "VSSBIN1\n", uint32 LE header length, UTF-8 JSON header, zero padding to 4, then the arrays at the header's
// offsets. Phase arrays: bits 8 (q * 2pi/256 - pi), 4 (two 16-level values per byte, low nibble first) or 32 (float32); float arrays float32.
// Sparse route book (export_web --sparse, manifest format vss-web-2): an array of kind "index" (uint32 LE) lists the flat row numbers a
// table stores; the table's entry names it ("rows"), its "shape" is the FULL shape and its data holds only those rows, in that order. Such
// a table comes back as {data (stored rows x D), shape (full), rowOf: Int32Array over the full rows, -1 = absent}; dense tables have no rowOf.

const MAGIC = "VSSBIN1\n";

export function readBin(buf) {
  const u8 = new Uint8Array(buf), magic = new TextDecoder().decode(u8.subarray(0, 8));
  if (magic !== MAGIC) throw new Error("vss.js: not a vss binary (bad magic)");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + n))), start = 12 + n + ((4 - ((12 + n) % 4)) % 4), arrays = {};
  const index = {};
  for (const a of header.arrays) if (a.kind === "index") index[a.name] = new Uint32Array(u8.slice(start + a.offset, start + a.offset + 4 * a.shape[0]).buffer);
  for (const a of header.arrays) {
    if (a.kind === "index") continue;
    const rows = a.rows ? index[a.rows] : null, D = a.shape[a.shape.length - 1];
    const count = rows ? rows.length * D : a.shape.reduce((x, y) => x * y, 1), o = start + a.offset, data = new Float64Array(count);
    if (a.kind === "phase" && a.bits !== 32) {
      const L = 1 << a.bits, step = (2 * Math.PI) / L;
      if (a.bits === 8) for (let i = 0; i < count; i++) data[i] = u8[o + i] * step - Math.PI;
      else if (a.bits === 4) for (let i = 0; i < count; i++) { const b = u8[o + (i >> 1)]; data[i] = ((i & 1) ? (b >> 4) : (b & 15)) * step - Math.PI; }
      else throw new Error(`vss.js: bits ${a.bits}`);
    } else {
      const f = new Float32Array(u8.slice(o, o + 4 * count).buffer); for (let i = 0; i < count; i++) data[i] = f[i];
    }
    arrays[a.name] = { data, shape: a.shape };
    if (rows) { const rowOf = new Int32Array(a.shape.slice(0, -1).reduce((x, y) => x * y, 1)).fill(-1); rows.forEach((r, i) => { rowOf[r] = i; }); arrays[a.name].rowOf = rowOf; }
  }
  return { header, arrays };
}

/** the stars of stars.bin as a Map key -> Float64Array of phases */
export function starsTable(starsBin) {
  const { header, arrays } = readBin(starsBin), M = arrays.stars, D = header.D, out = new Map();
  header.keys.forEach((k, i) => out.set(k, M.data.subarray(i * D, (i + 1) * D)));
  return out;
}

async function sha256Hex(buf) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return null;
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf)); return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** fetch the four files from a base URL (browser) or read them with `readFile(name) -> ArrayBuffer|string` (node); checks the manifest */
export async function loadFiles(base, readFile) {
  const get = readFile || (async (name) => { const r = await fetch(new URL(name, base)); if (!r.ok) throw new Error(`vss.js: ${name}: HTTP ${r.status}`); return name.endsWith(".json") ? r.text() : r.arrayBuffer(); });
  const manifest = JSON.parse(await get("manifest.json")), modelText = await get("model.json"), rbBuf = await get("routebook.bin"), stBuf = await get("stars.bin");
  for (const [fn, buf] of [["model.json", new TextEncoder().encode(modelText)], ["routebook.bin", rbBuf], ["stars.bin", stBuf]]) {
    const h = await sha256Hex(buf);
    if (h !== null && h !== manifest.files[fn].sha256) throw new Error(`vss.js: ${fn} does not match manifest.json (sha256)`);
  }
  const model = JSON.parse(modelText);
  if (model.legend_sha256 !== manifest.legend_sha256) throw new Error("vss.js: legend hash of model.json differs from manifest.json");
  return { manifest, model, routebook: readBin(rbBuf), stars: starsTable(stBuf) };
}
