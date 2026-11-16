// layer_common.mjs: shared by train_context.mjs (the context filler's training), composer_errors.mjs (root causes) and llm_score.mjs (PAIR=value).
//  - build(): ONE pass of the composer as the demo runs it (docs/js/vss-composer.js loadComposer + comp.formalize: the world cutter, the
//    event cutter, the registry's worlds, no fallback, the context filler of the registry for ties) over the 9 data folders (micro_tools.py
//    dirs), with the context rule of llm_score.mjs between requests (scorerUpdate). Per unit that gave a request (zone "read" or "ask") it
//    keeps the VSS layer: the unit's raw nodes (vss-context.js rawNodes of the chosen reading: the adapter's mapping with nothing
//    resolved, exposed by the composer as unit.raw). REGISTRY=<file> (default docs/model/micro/registry.json); CONTEXT=<file> the filler
//    used for ties while building (default the registry's "context"). Cached as JSON (CACHE=<file>, default in LAYER_CACHE_DIR or /tmp,
//    one file per registry); REBUILD=1 rebuilds.
//  - pairOrder() (llm_score.mjs: LCS on the action label) and pairValue() (per action label, a maximum-weight matching: as many pairs as
//    possible, then the most gold keys the VSS layer read right, then the most letters shared by the unit and the gold span).
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { load } from "../../docs/js/vss.js";
import { canon, canonWant } from "../../docs/js/bench-canon.js";
import { loadComposer } from "../../docs/js/vss-composer.js";

export const MODELS = new URL("../../docs/model/", import.meta.url);
export const actOf = (type, args) => `${type}:${args.action || args.ask || ""}`;
export const isTest = (id) => { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % 5 === 0; };   // 20% of messages by id hash (FNV-1a)
export const dirsAll = () => execFileSync("python3", [new URL("micro_tools.py", import.meta.url).pathname, "dirs"], { encoding: "utf8" }).split("\n").filter(Boolean);
export const registryFile = () => process.env.REGISTRY || new URL("micro/registry.json", MODELS).pathname;
export const defaultCache = () => process.env.CACHE || `${process.env.LAYER_CACHE_DIR || "/tmp"}/layer_cache_${basename(registryFile(), ".json")}.json`;
export const readRows = (d) => readdirSync(d).filter((f) => f.endsWith(".jsonl")).sort().flatMap((f) => readFileSync(`${d}/${f}`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)));

/** llm_score.mjs's context rule between requests (copied: llm_score.mjs does not export it) */
export function scorerUpdate(c, main) {
  if (main && main.args) {
    if (main.args.action === "create") { if (main.args.name && !main.args.count) c.refs.set(String(main.args.name).toLowerCase(), { ref: main.id }); c.last = [{ ref: main.id }]; }
    else if (main.args.target != null && !Array.isArray(main.args.target)) c.last = [main.args.target];
  }
}
/** the gold requests of a row with their character spans (the k-th occurrence for repeated spans) */
export function goldSpans(r) {
  const used = new Set();
  return r.wires.map((w, idx) => {
    let s = -1, from = 0;
    for (;;) { const k = r.text.indexOf(w.span, from); if (k < 0) break; if (!used.has(k)) { s = k; break; } from = k + 1; }
    if (s < 0) s = r.text.indexOf(w.span);
    used.add(s);
    return { idx, s, e: s + w.span.length, span: w.span, type: w.type, args: w.args, act: actOf(w.type, w.args), want: canonWant(w.type, w.args) };
  });
}

/** the composer of a registry as the demo loads it: -> {comp, REG, meta}. ctxFile: the filler's weights (default the registry's) */
export async function loadRegistry(regFile = registryFile(), ctxFile = process.env.CONTEXT || null) {
  const REG = JSON.parse(readFileSync(regFile, "utf8")), J = (p) => JSON.parse(readFileSync(new URL(p, MODELS), "utf8"));
  const ctxPath = ctxFile || new URL(REG.context || "context/weights.json", MODELS).pathname;
  const cache = new Map();
  const loadModel = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const d = new URL(`${name}/`, MODELS), rf = async (n) => { const b = readFileSync(new URL(n, d)); return n.endsWith(".json") ? b.toString("utf8") : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
    const m = { vss: await load(null, { readFile: rf, sentenceCandidates: true }), F: existsSync(new URL("front.json", d)) ? JSON.parse(await rf("front.json")) : null };
    cache.set(name, m); return m;
  };
  const comp = await loadComposer(REG, J(REG.cutter), loadModel, Object.assign({ context: JSON.parse(readFileSync(ctxPath, "utf8")) }, REG.event_cutter ? { eventCutter: J(REG.event_cutter) } : {}));
  const meta = { registry: regFile.replace(/^.*\/docs\//, "docs/"), cutter: REG.cutter, event_cutter: REG.event_cutter || null, event_hint: comp.eventHint, ties_context: ctxPath.replace(/^.*\/docs\//, "docs/"),
    worlds: comp.worlds.map((w) => `${w.id} ${(REG.worlds.find((e) => e.world === w.id) || {}).model}`), entity: comp.entity };
  return { comp, REG, meta };
}

/** one message through the composer -> {units, prods, out} (prods: the units that gave a request, with their VSS layer) */
export function runMessage(comp, r, opts = {}) {
  const out = comp.formalize(r.text, { names: r.names || [], last: [] }, Object.assign({ update: scorerUpdate }, opts));
  const units = [], prods = [];
  out.units.forEach((u, i) => {
    units.push({ c0: u.c0, c1: u.c1, zone: u.zone, world: u.world, event: u.event, status: u.status });
    const raw = u.raw;
    if (!raw || !raw.main) return;
    prods.push({ u: i, world: u.world, act: actOf(raw.main.type, raw.main.args), tokens: (u.normalized || "").split(" ").filter(Boolean),
      raw: { nodes: raw.nodes, mainId: raw.main.id, defaulted: raw.defaulted }, rawC: canon(raw.main, raw.nodes) });
  });
  return { units, prods, out };
}

export async function build(dirs) {
  const cacheFile = defaultCache();
  if (existsSync(cacheFile) && process.env.REBUILD !== "1") return JSON.parse(readFileSync(cacheFile, "utf8"));
  const { comp, meta } = await loadRegistry();
  const out = { meta: Object.assign(meta, { built: new Date().toISOString() }), msgs: [] };
  for (const d of dirs) {
    const name = d.split("/").slice(-2).join("/"), rows = readRows(d);
    for (const r of rows) { const { units, prods } = runMessage(comp, r); out.msgs.push({ id: r.id, dir: name, text: r.text, names: r.names || [], gold: goldSpans(r), units, prods }); }
    console.error(`built ${name}: ${rows.length} messages`);
  }
  writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

// ---------------------------------------------------------------- values (canonical strings of bench-canon.js)
export const parts = (s) => { const o = []; let d = 0, cur = ""; for (const ch of String(s)) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o; };
/** element equality, VSS value x against gold g; created: names of shapes the gold creates earlier in the message */
export const elEq = (x, g, created) => x === g || (g === "$new" && (created.has(x) || x.startsWith("$new"))) || (x.startsWith("$new=") && x.slice(5) === g) || (x === "$new" && g === "$new");
export const valEq = (v, g, created) => { if (v == null) return false; const a = parts(v), b = parts(g); return a.length === b.length && a.every((x, i) => elEq(x, b[i], created)); };
/** the gold names created before gold request j */
export const createdBefore = (m, j) => new Set(m.gold.filter((o) => o.s < m.gold[j].s && o.args.action === "create" && o.args.name != null && !o.args.count).map((o) => String(o.args.name).toLowerCase()));

// ---------------------------------------------------------------- pairing
export function pairOrder(prods, gold) {   // llm_score.mjs align(), copied
  const n = prods.length, m = gold.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = prods[i].act === gold[j].act ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (prods[i].act === gold[j].act) { pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return pairs;
}
function hungarianMax(W) {   // square matrix, maximum total weight; returns col of each row
  const n = W.length, INF = 1e18, u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) { const cur = -W[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const col = new Int32Array(n); for (let j = 1; j <= n; j++) col[p[j] - 1] = j - 1; return col;
}
const alnum = /[A-Za-z0-9]/;
export const overlap = (text, a0, a1, b0, b1) => { let k = 0; for (let i = Math.max(a0, b0); i < Math.min(a1, b1); i++) if (alnum.test(text[i])) k++; return k; };
/** VSS-layer right keys of produced i for gold j */
export function rightKeys(m, p, j) {
  const g = m.gold[j], cr = createdBefore(m, j); let k = 0;
  for (const [key, gv] of Object.entries(g.want)) { if (key === "action" || key === "ask") continue; if (valEq(p.rawC[key], gv, cr)) k++; }
  return k;
}
export function pairValue(m) {
  const pairs = [];
  for (const act of new Set(m.prods.map((p) => p.act))) {
    const P = m.prods.map((p, i) => [p, i]).filter(([p]) => p.act === act), G = m.gold.map((g, j) => [g, j]).filter(([g]) => g.act === act);
    if (!G.length) continue;
    const n = Math.max(P.length, G.length), W = Array.from({ length: n }, () => new Array(n).fill(0));
    P.forEach(([p, i], a) => G.forEach(([g, j], b) => { const u = m.units[p.u]; W[a][b] = 1e6 + 1000 * rightKeys(m, p, j) + overlap(m.text, u.c0, u.c1, g.s, g.e); }));
    const col = hungarianMax(W);
    P.forEach(([, i], a) => { const b = col[a]; if (b < G.length) pairs.push([i, G[b][1]]); });
  }
  return pairs.sort((x, y) => x[0] - y[0]);
}

// ---------------------------------------------------------------- gold label of a context candidate (vss-context.js Context)
/** does candidate cand (entity keys) equal the gold value gv (canonical string)? set equality for several shapes */
export function candMatches(ctx, cand, gv, created) {
  if (cand.kind === "null" || gv == null) return false;
  const g = parts(gv), elOk = (key, x) => { const e = ctx.ents.get(key); if (!e) return false; return (e.created && x === "$new") || (e.name != null && String(e.name).toLowerCase() === x) || key === x || (x === "$new" && created.has(key)); };
  if (cand.keys.length !== g.length) return false;
  if (g.length === 1) return elOk(cand.keys[0], g[0]);
  const used = new Set();
  return g.every((x) => { const k = cand.keys.find((y) => !used.has(y) && elOk(y, x)); if (k == null) return false; used.add(k); return true; });
}
