// vss-formalizer.js: the VSS formalizer of the demo: formalize(text, ctx) -> the composer (vss-composer.js): the cutter, the
// micro-worlds of ../model/micro/registry.json, and the router; loaded on first use.
// Exposes window.VSSFormalizer = { formalize, loadComposerAt, composerInfo, cut, CUT_STRATEGIES, DEFAULT_CUT }. (The single-model path, ../model/real/ read with
// ?vss=single, was removed on 2026-11-02; it is in git history.)
import { load as loadVSS } from "./vss.js";
import { loadComposer, cutUnits, CUT_STRATEGIES, DEFAULT_CUT } from "./vss-composer.js";
export { CUT_STRATEGIES, DEFAULT_CUT };

// ---- model versions (owner's rule 2026-11-02: never use an older model after a new one is published). versions.json (written by
// training/sketch/stamp_models.py) maps every model folder / file under docs/model/ to a content version; every model URL gets
// ?v=<version>, so a new version is a new URL (HTTP cache and service workers cannot serve the old one) and an unchanged model stays cached.
// versions.json and registry.json are small and fetched with cache: "no-cache" (always revalidated).
const MODEL_ROOT = new URL("../model/", import.meta.url).href;
let versionsP = null;
function versions() { return versionsP || (versionsP = (async () => { try { const r = await fetch(new URL("versions.json", MODEL_ROOT), { cache: "no-cache" }); return r.ok ? (await r.json()).files || {} : {}; } catch (e) { return {}; } })()); }
let vmap = {};   // path under docs/model/ -> version; filled by ensureVersions()
async function ensureVersions() { vmap = await versions(); }
/** the URL with ?v=<version> of the longest model folder / file of versions.json that contains it (urls outside docs/model/ are unchanged) */
function versioned(url) {
  const u = new URL(url), root = new URL(MODEL_ROOT);
  if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname)) return u.href;
  const rel = u.pathname.slice(root.pathname.length).split("/");
  for (let n = rel.length; n > 0; n--) { const v = vmap[rel.slice(0, n).join("/")]; if (v) { u.searchParams.set("v", v); break; } }
  return u.href;
}
async function fetchSize(url, acc, init) { const r = await fetch(init && init.cache === "no-cache" ? url : versioned(url), init); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); const b = await r.arrayBuffer(); acc.bytes += b.byteLength; return b; }
// hosts that serve no binary files get the .bin files as base64 text parts listed in bin-parts.json; the manifest's sha256 still checks them
// (bin-parts.json and its parts are in the model folder, so they carry the folder's version too)
async function fetchBin(base, name, acc) {
  try { return await fetchSize(new URL(name, base), acc); } catch (e) {
    const parts = JSON.parse(new TextDecoder().decode(await fetchSize(new URL("bin-parts.json", base), acc)))[name];
    if (!parts) throw e;
    let b64 = ""; for (const p of parts) { const r = await fetch(versioned(new URL(p, base).href)); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); b64 += await r.text(); }
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    acc.bytes += u8.byteLength; return u8.buffer;
  }
}

// ---- the composer: every model folder of the registry, loaded with the same fetch code
const comp = { c: null, loading: null, bytes: 0, loadMs: 0, registry: null, root: null, sizes: new Map() };   // bytes: registry and cutters; sizes: bytes per model folder
async function modelAt(base) {
  const cache = new Map(), acc = { bytes: 0 }; comp.sizes.set(base, acc);
  const readFile = async (name) => { if (!cache.has(name)) cache.set(name, name.endsWith(".bin") ? await fetchBin(base, name, acc) : await fetchSize(new URL(name, base), acc)); const b = cache.get(name); return name.endsWith(".json") ? new TextDecoder().decode(b) : b; };
  const vss = await loadVSS(null, { readFile, sentenceCandidates: true });
  let F = null; try { F = JSON.parse(await readFile("front.json")); } catch (e) { F = null; }
  return { vss, F };
}
/** load the composer: root = the docs/model/ folder (registry at micro/registry.json, model folders relative to root) */
export async function loadComposerAt(root = new URL("../model/", import.meta.url).href) {
  if (comp.c) return comp.c;
  if (!comp.loading) comp.loading = (async () => {
    comp.root = root; await ensureVersions(); const t0 = performance.now(), json = async (u, init) => JSON.parse(new TextDecoder().decode(await fetchSize(new URL(u, root), comp, init)));
    const registry = await json("micro/registry.json", { cache: "no-cache" }), cutter = await json(registry.cutter); comp.registry = registry;
    const context = registry.router === "cutter" ? await json(registry.context || "context/weights.json") : undefined;   // CandidateRouter needs the context filler
    const eventCutter = registry.event_cutter ? await json(registry.event_cutter) : undefined;   // the event hint (vss-composer.js, EVENT_HINT.md)
    comp.c = await loadComposer(registry, cutter, (name) => modelAt(new URL(name.replace(/\/?$/, "/"), root).href), { context, eventCutter });
    comp.loadMs = performance.now() - t0; return comp.c;
  })();
  return comp.loading;
}

/** a whole message -> the composer's reading: units of the cutter, routed to the micro-worlds; each unit carries its world. The third argument (the rules' formalize) is not used; opts.composer may name another
 *  docs/model/ root (a string); opts.units: the units of the cut chosen in the settings ([{c0, c1}], see cut below), read instead of the
 *  cutter's own (vss-composer.js, "units of another cut"). */
export async function formalize(text, ctx, _rulesFormalize, opts = {}) {
  const c = await loadComposerAt(typeof opts.composer === "string" ? opts.composer : undefined);
  return Array.isArray(opts.units) ? c.formalize(text, ctx, { units: opts.units }) : c.formalize(text, ctx);
}

/** the cut every reader reads (the demo's setting): cut(text, ctx, strategy, env) -> Promise<[{c0, c1, src}]>. strategy "rules" | "vss" |
 *  "bert" (vss-composer.js cutUnits); "vss" loads the composer (its cutter) first. env: {rules: a logic.js system, neural: NeuralKit}. */
export async function cut(text, ctx = {}, strategy = DEFAULT_CUT, env = {}) {
  const composer = strategy === "vss" ? await loadComposerAt() : null;
  return cutUnits(text, ctx, strategy, Object.assign({}, env, composer ? { composer } : {}));
}

/** what the demo shows about the composer: its worlds (model folder, actions), router, event hint, bytes and load time */
export function composerInfo() {
  const r = comp.registry; if (!comp.c || !r) return null;
  const size = (name) => { const a = comp.sizes.get(new URL(name.replace(/\/?$/, "/"), comp.root).href); return a ? a.bytes : 0; };
  const models = [...comp.sizes.values()].reduce((a, x) => a + x.bytes, 0);
  return { composer: true, bytes: comp.bytes + models, cutterBytes: comp.bytes, loadMs: comp.loadMs, about: r.about || "", router: r.router || "", hint: r.event_cutter ? (r.event_hint || "H1") : null,
    worlds: (r.worlds || []).map((w) => ({ world: w.world, model: w.model.replace(/^micro\//, ""), events: w.events || [], bytes: size(w.model) })) };
}

if (typeof window !== "undefined") window.VSSFormalizer = { formalize, loadComposerAt, composerInfo, cut, CUT_STRATEGIES, DEFAULT_CUT };
