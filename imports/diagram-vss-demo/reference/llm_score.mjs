// llm_score.mjs: Rules vs VSS on the LLM-written messages (llm_bench/<model>/batch_*.jsonl, gold written by the LLM, SPEC.md).
// Per message: the readers' non-mention wires are aligned to the gold wires in order (longest common subsequence on type + action/ask),
// then an aligned wire counts as correct when every gold key matches (bench-canon.js canonical form).
// Reports, per request (owner 2026-11-01): correct / not done / done wrong, extra, wires right (of gold wires), act found, per action/ask.
// (The per-message score is computed for the library exports tally/outcome/msgLine, which training/laptop/neural_score.mjs uses; it is not printed here.)
// With no folder argument: the fixed 1000-message sample, training/sketch/eval/sample1000/* (eval/make_sample.py builds it from the committed data).
// SEG=composer: the composer (docs/js/vss-composer.js): the cutter, the registry of micro-worlds, the router.
//   REGISTRY=<file> (default docs/model/micro/registry.json); no single model is loaded.
// SEG=gold reads ONE model folder (MODEL=<folder under docs/model/>, e.g. MODEL=micro/shapes7c SEG=gold) on the annotated spans of the
//   rows (the reading quality without the cut; per-event gold: training/sketch/eval/goldev/<event>). There is no other single-model mode
//   (the tagger, q1 and centres cuts were removed 2026-11-02; docs/js/vss-centers.js and snorm.js stay for the tools that still import them).
//   CUTTER=<file> (default the registry's "cutter"). Reported in addition: units per world, asked, ignored.
// ROUTER=cutter with SEG=composer (ROUTER_V2.md; also when the registry says "router": "cutter"): the composer with the cutter's worlds as
//   candidates, the fewest words not understood, ties and gaps to the context filler (vss-composer.js). The cutter is CUTTER, else the
//   registry's "cutter" when the registry says "router": "cutter", else docs/model/micro/cutter_worlds.json; the filler's model is
//   CONTEXT=<file>, else the registry's "context" (relative to docs/model/), else docs/model/context/weights.json. Requests the filler asks
//   about are not executed (they count as not done); the extra "composer v2" line reports them.
//   When the registry names an "event_cutter" (EVENT_HINT.md; mode registry "event_hint", H1 or H2), that file is passed to the composer
//   and the line "event hint" reports: units, units whose hint is an event of a candidate world, readings re-read with the hint, units
//   whose chosen reading the re-reading changed; with --dump, the units with a re-read reading go to <dump>_hint.json.
// PAIR=value: produced and gold actions are paired by layer_common.mjs pairValue (per action label, a maximum-weight matching: most pairs,
//   then most gold keys right, then most letters shared by the unit and the gold span; the unit is node.span when the composer gives it,
//   else the first occurrence of node.src in the text) instead of the order-only LCS. Default (unset or PAIR=order): the LCS, as before.
// GATE=cost|95|97|99 (SEG=composer; the demo's gate; cost = the cost-score threshold of the model file, the demo's default): the VSS requests are also scored gated: a produced request is executed only when
//   its combined confidence (docs/js/vss-confidence.js on the composer's unit.signals, model CONFIDENCE=<file>, default
//   docs/model/confidence/vss.json, thresholds from the out-of-fold scores, PRECISION_BERT.md; CONFIDENCE=training/sketch/precision_thresholds.json
//   gives PRECISION.md's in-sample thresholds) clears the level's threshold; a level the model does not reach is an error. Each produced request keeps the outcome it has when everything is executed
//   (right / wrong / extra, the pairing above; PRECISION.md's simplification) and the line "vss gated" reports: precision of execution =
//   right / (right + wrong + extra) over the executed ones, right % of the gold requests, asked % (gold requests whose produced request was
//   not executed), unread % (gold requests with no produced request), executed wrong % and extras executed. The ungated lines are unchanged.
// node llm_score.mjs <dir> [<dir> ...] [--dump out.json] [-v]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { load } from "../../docs/js/vss.js";
import * as FRONT from "../../docs/js/front.js";
import { existsSync } from "node:fs";
import { readingFromWires, toNodes } from "../../docs/js/vss-adapter.js";
import { canon, canonWant } from "../../docs/js/bench-canon.js";
import { loadComposer } from "../../docs/js/vss-composer.js";
const require = createRequire(import.meta.url);
const K = require("../../docs/js/logic.js");
const argv = process.argv.slice(2), verbose = argv.includes("-v"), dumpAt = argv.indexOf("--dump");
const SAMPLE_DIR = new URL("eval/sample1000/", import.meta.url).pathname;
let dirs = argv.filter((a, i) => !a.startsWith("-") && (dumpAt < 0 || i !== dumpAt + 1));
if (!dirs.length && process.env.LLM_SCORE_LIB !== "1") { try { dirs = readdirSync(SAMPLE_DIR).sort().map((d) => SAMPLE_DIR + d); } catch (e) { /* none */ } if (!dirs.length) throw new Error("no folder given and training/sketch/eval/sample1000 is missing (run training/sketch/eval/make_sample.py)"); }
const MODELS = new URL("../../docs/model/", import.meta.url), COMPOSER = process.env.SEG === "composer";
const REG = COMPOSER ? JSON.parse(readFileSync(process.env.REGISTRY || new URL("micro/registry.json", MODELS), "utf8")) : null;
const MODEL = COMPOSER ? null : process.env.MODEL || null;   // SEG=gold reads ONE model folder; SEG=composer reads the registry
if (!COMPOSER && process.env.SEG !== "gold") throw new Error(`SEG=${process.env.SEG || ""}: expected composer or gold (the tagger / q1 / centres modes were removed)`);
if (!COMPOSER && !MODEL) throw new Error("MODEL=<folder under docs/model/> is required with SEG=gold, e.g. MODEL=micro/shapes7c SEG=gold (SEG=composer reads the registry instead)");
const dir = MODEL ? new URL(`${MODEL}/`, MODELS) : null;
const ROUTER = COMPOSER ? process.env.ROUTER || REG.router || "cutter" : null, V2 = ROUTER === "cutter";
if (COMPOSER && !V2) throw new Error(`router ${ROUTER}: the composer has only the cutter router`);
const CUT = process.env.CUTTER || (V2 ? new URL(REG.cutter, MODELS) : null), CUTF = CUT ? JSON.parse(readFileSync(CUT, "utf8")) : null;
const ECUTF = V2 && REG.event_cutter ? new URL(REG.event_cutter, MODELS) : null, ECUT = ECUTF ? JSON.parse(readFileSync(ECUTF, "utf8")) : null;
const CTXF = V2 ? process.env.CONTEXT || new URL(REG.context || "context/weights.json", MODELS) : null, CTXM = CTXF ? JSON.parse(readFileSync(CTXF, "utf8")) : null;
if (process.env.PAIR && !["value", "order"].includes(process.env.PAIR)) throw new Error(`PAIR=${process.env.PAIR}: expected value or order`);
const PAIRV = process.env.PAIR === "value" ? (await import("./layer_common.mjs")).pairValue : null;
const GATE = process.env.GATE || null;      // the gated VSS score (see the head of the file)
if (GATE && !COMPOSER) throw new Error("GATE needs SEG=composer (the signals are the composer's)");
const CONF = GATE ? await import("../../docs/js/vss-confidence.js") : null;
const CONFM = GATE ? JSON.parse(readFileSync(process.env.CONFIDENCE || new URL("confidence/vss.json", MODELS), "utf8")) : null;
if (GATE && CONF.effectiveLevel(CONFM, GATE) !== GATE) throw new Error(`GATE=${GATE}: the confidence model does not reach this level (reached: ${CONF.reachedLevels(CONFM).join(", ") || "none"})`);
const GATE_T = GATE ? CONF.threshold(CONFM, GATE) : null;
const readFile = async (n) => { const b = readFileSync(new URL(n, dir)); return n.endsWith(".json") ? b.toString("utf8") : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
if (process.env.EXCL === "1" || process.env.Q1B === "1") throw new Error("EXCL / Q1B were removed (they needed decode.json of a removed model; DECODE.md)");
const vss = MODEL ? await load(null, { readFile, sentenceCandidates: true }) : null;
const F = MODEL && existsSync(new URL("front.json", dir)) ? JSON.parse(await readFile("front.json")) : null;   // the learned front end of the world
if (MODEL && !F) throw new Error(`${MODEL} has no front.json (the single-model mode needs a learned front end)`);
const verbEvent = new Map();
if (vss) for (const e of vss.model.legend.events) for (const v of e.verbs) verbEvent.set(v, e.id);
const sys = K.createSystem();
// the context carried from one request to the next in this scorer (names created earlier, `last`); SEG=composer uses the same rule
function scorerUpdate(c, main) {
  if (main && main.args) {
    if (main.args.action === "create") { if (main.args.name && !main.args.count) c.refs.set(String(main.args.name).toLowerCase(), { ref: main.id }); c.last = [{ ref: main.id }]; }
    else if (main.args.target != null && !Array.isArray(main.args.target)) c.last = [main.args.target];
  }
}
let comp = null; const CSTAT = { units: 0, byWorld: {}, ask: 0, ignored: 0, ignoredNoToken: 0, multi: 0 };
const V2STAT = { decided: {}, ignoredWhy: {}, tieSize: {} }, HSTAT = { units: 0, applies: 0, reread: 0, unitsReread: 0, changed: 0, log: [] };
if (COMPOSER) {
  const cache = new Map();
  const loadModel = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const d = new URL(`${name}/`, MODELS), rf = async (n) => { const b = readFileSync(new URL(n, d)); return n.endsWith(".json") ? b.toString("utf8") : b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
    const m = { vss: await load(null, { readFile: rf, sentenceCandidates: true }), F: existsSync(new URL("front.json", d)) ? JSON.parse(await rf("front.json")) : null };
    cache.set(name, m); return m;
  };
  comp = await loadComposer(REG, CUTF, loadModel, V2 ? Object.assign({ router: "cutter", context: CTXM }, ECUT ? { eventCutter: ECUT } : {}) : {});
  console.log(`composer: cutter ${CUT ? CUT.toString().replace(/^file:\/\//, "") : "-"} · worlds ${comp.worlds.map((w) => `${w.id} [${[...w.events]}]`).join(", ") || "none"}`);
  if (V2) console.log(`composer v2: router cutter (top ${comp.k} of ${CUTF.worlds.length} cutter worlds) · fewest words not understood · ties and gaps: context filler ${CTXF.toString().replace(/^file:\/\//, "")} margin ${CTXM.margin}`);
  if (ECUT) console.log(`event hint: mode ${comp.eventHint} · event cutter ${ECUTF.toString().replace(/^file:\/\//, "")}`);
}
function composerFormalize(text, ctx) {
  const out = comp.formalize(text, { names: ctx.names, last: [] }, { update: scorerUpdate });
  for (const u of out.units) {
    if (u.hint !== undefined) {
      HSTAT.units++; if (u.hintApplies) HSTAT.applies++; HSTAT.reread += u.reread; if (u.reread) HSTAT.unitsReread++; if (u.hintChanged) HSTAT.changed++;
      if (u.reread) HSTAT.log.push({ text, src: u.src, hint: u.hint, changed: !!u.hintChanged, before: u.hintBefore, zone: u.zone, world: u.world, event: u.event, tried: u.tried });
    }
    CSTAT.units++; if (u.tried.length > 1) CSTAT.multi++;
    if (u.zone === "read") CSTAT.byWorld[u.world] = (CSTAT.byWorld[u.world] || 0) + 1;
    else if (u.zone === "ask") CSTAT.ask++;
    else { CSTAT.ignored++; if (u.reason === "no action token") CSTAT.ignoredNoToken++; }
    if (V2) { const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
      if (u.zone === "ignored") inc(V2STAT.ignoredWhy, u.reason); else { inc(V2STAT.decided, u.decidedBy); inc(V2STAT.tieSize, u.tie); } }
  }
  return out.nodes;
}

function vssFormalize(text, ctx) {
  if (COMPOSER) return composerFormalize(text, ctx);
  // SEG=gold: the annotated spans (the reading quality without the cut); rows without spans cannot be scored in this mode
  if (!ctx.spans) throw new Error("SEG=gold needs rows whose wires all have a span");
  const segs = ctx.spans.map((src) => ({ src }));
  const seq = { s: 0, m: 0 }, c = { names: ctx.names, last: [], refs: new Map() }, nodes = [];
  for (const seg of segs) {
    const nm = c.names.concat([...c.refs.keys()]);
    const { tokens, info: ni } = FRONT.normalize(seg.src, nm, F), r = vss.read(tokens.join(" "));
    const verb = tokens.find((t) => verbEvent.has(t)) || null;
    const reading = r.status === "unknown-event" || r.status === "no-sense" ? null : readingFromWires(r.wires, verb, tokens);
    const out = reading ? toNodes(reading, ni, c, seq) : { nodes: [] };
    out.nodes.forEach((n) => { if (n.type !== "mention") Object.defineProperty(n, "src", { value: seg.src, enumerable: false }); }); nodes.push(...out.nodes);
    scorerUpdate(c, out.nodes[out.nodes.length - 1]);
  }
  return nodes;
}
const actOf = (type, args) => `${type}:${args.action || args.ask || ""}`;

function align(pred, gold) {          // LCS on act labels
  const n = pred.length, m = gold.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = pred[i].act === gold[j].act ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (pred[i].act === gold[j].act) { pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return pairs;
}
// PAIR=value (see the head of the file): pairValue of layer_common.mjs on this message's produced actions; default: align (LCS)
function pairUp(mains, gold, row) {
  if (!PAIRV) return align(mains, gold);
  const used = new Set(), G = row.wires.map((w, j) => {
    let s0 = -1;
    if (w.span) { let from = 0; for (;;) { const k = row.text.indexOf(w.span, from); if (k < 0) break; if (!used.has(k)) { s0 = k; break; } from = k + 1; } if (s0 < 0) s0 = row.text.indexOf(w.span); used.add(s0); }
    return { s: s0, e: s0 < 0 ? -1 : s0 + w.span.length, act: gold[j].act, want: gold[j].want, args: w.args };
  });
  const units = mains.map((m) => { if (m.n.span) return { c0: m.n.span[0], c1: m.n.span[1] }; const k = m.n.src ? row.text.indexOf(m.n.src) : -1; return k < 0 ? { c0: 0, c1: 0 } : { c0: k, c1: k + m.n.src.length }; });
  return PAIRV({ text: row.text, gold: G, units, prods: mains.map((m, i) => ({ act: m.act, u: i, rawC: m.got })) });
}
function scoreMessage(nodes, row) {
  const mains = nodes.filter((n) => n.type !== "mention").map((n) => ({ act: actOf(n.type, n.args), got: canon(n, nodes), n }));
  const gold = row.wires.map((w) => ({ act: actOf(w.type, w.args), want: canonWant(w.type, w.args) }));
  const pairs = pairUp(mains, gold, row); let right = 0; const bad = [];
  for (const [i, j] of pairs) {
    const miss = Object.entries(gold[j].want).filter(([k, v]) => (mains[i].got[k] ?? "∅") !== v).map(([k, v]) => `${k}:${mains[i].got[k] ?? "∅"}≠${v}`);
    if (!miss.length) right++; else bad.push(`${gold[j].act} ${miss.join(" ")}`);
  }
  const matched = new Set(pairs.map((p) => p[1])), usedP = new Set(pairs.map((p) => p[0]));
  mains.forEach((m, i) => { if (!usedP.has(i)) bad.push(`EXTRA ${m.act} ${JSON.stringify(m.got)} <- "${m.n.src || ''}"`); });
  gold.forEach((g, j) => { if (!matched.has(j)) bad.push(`missing ${g.act}`); });
  return { right, wrongAligned: pairs.length - right, missed: gold.length - pairs.length, acts: pairs.length, gold: gold.length, extra: mains.length - pairs.length, exact: right === gold.length && mains.length === gold.length, bad, perAct: gold.map((g, j) => [g.act, pairs.some(([i, jj]) => jj === j && !bad.some((b) => false))]) };
}

// GATE: the produced VSS requests of one message, each with its outcome (right / wrong / extra, the pairing of scoreMessage) and its
// confidence, added to G = {r, w, e (executed), ar, aw (asked), n (produced), gold}
const gateBlank = () => ({ r: 0, w: 0, e: 0, ar: 0, aw: 0, ae: 0, n: 0, gold: 0 });
function gateTally(G, nodes, row) {
  const mains = nodes.filter((n) => n.type !== "mention").map((n) => ({ act: actOf(n.type, n.args), got: canon(n, nodes), n }));
  const gold = row.wires.map((w) => ({ act: actOf(w.type, w.args), want: canonWant(w.type, w.args) }));
  const res = mains.map(() => "extra");
  for (const [i, j] of pairUp(mains, gold, row)) res[i] = Object.entries(gold[j].want).every(([k, v]) => (mains[i].got[k] ?? "∅") === v) ? "right" : "wrong";
  mains.forEach((m, i) => {
    const u = m.n.unit, c = u && u.signals ? CONF.confidence(CONFM, u.signals, u.world) : 0, o = res[i];
    G.n++; if (c >= GATE_T) { if (o === "right") G.r++; else if (o === "wrong") G.w++; else G.e++; } else if (o === "right") G.ar++; else if (o === "wrong") G.aw++; else G.ae++;
  });
  G.gold += gold.length;
}
const gateLine = (G) => { const p = (x) => (x * 100).toFixed(1), ex = G.r + G.w + G.e;
  return `vss gated ${/^\d+$/.test(GATE) ? GATE + "%" : GATE} (t=${GATE_T.toFixed(4)}): precision of execution ${ex ? p(G.r / ex) : "-"}% · right ${p(G.r / G.gold)}% · asked ${p((G.ar + G.aw) / G.gold)}% · unread ${p((G.gold - G.r - G.w - G.ar - G.aw) / G.gold)}% · executed wrong ${p(G.w / G.gold)}% · extras executed ${G.e} (of ${G.e + G.ae}) · executed ${ex} of ${G.n} produced`; };
// one message's outcome: right (all gold wires right, no extra) / wrong (a wrong or an extra wire) / honest (the rest: requests not done, nothing wrong)
const outcome = (s) => (s.exact ? "mRight" : s.wrongAligned > 0 || s.extra > 0 ? "mWrong" : "mHonest");
const msgLine = (f, T, n) => `${f.padEnd(5)} per message: right ${(T.mRight / n * 100).toFixed(1)}% (${T.mRight}) · honest ${(T.mHonest / n * 100).toFixed(1)}% (${T.mHonest}) · wrong ${(T.mWrong / n * 100).toFixed(1)}% (${T.mWrong})`;
// one reader's output on one message added to its totals T (also used by training/laptop/neural_score.mjs); returns the message's score
function tally(T, nodes, r) {
  const s = scoreMessage(nodes, r);
  T.exact += s.exact; T.right += s.right; T.wrongAligned += s.wrongAligned; T.missed += s.missed; T.acts += s.acts; T.extra += s.extra; T.gold += s.gold; T[outcome(s)]++;
  // per gold act: right?
  const mains = nodes.filter((n) => n.type !== "mention").map((n) => ({ act: actOf(n.type, n.args), got: canon(n, nodes), n }));
  const gold = r.wires.map((w) => ({ act: actOf(w.type, w.args), want: canonWant(w.type, w.args) }));
  const pairs = pairUp(mains, gold, r), ok = new Set(pairs.filter(([i, j]) => Object.entries(gold[j].want).every(([k, v]) => (mains[i].got[k] ?? "∅") === v)).map((p) => p[1]));
  gold.forEach((g, j) => { const b = T.byAct[g.act] = T.byAct[g.act] || [0, 0]; b[1]++; if (ok.has(j)) b[0]++; });
  return s;
}
// LLM_SCORE_LIB=1: import this file as a library (no scoring run); the exports are what training/laptop/neural_score.mjs reuses
const LIB = process.env.LLM_SCORE_LIB === "1";
export { vssFormalize, tally, outcome, msgLine, scoreMessage, K as logic, gateBlank, gateTally, gateLine };
if (!LIB) {
const GALL = gateBlank();
const report = {}, ALL = { n: 0, rules: { exact: 0, right: 0, wrongAligned: 0, missed: 0, acts: 0, extra: 0, gold: 0, mRight: 0, mHonest: 0, mWrong: 0 }, vss: { exact: 0, right: 0, wrongAligned: 0, missed: 0, acts: 0, extra: 0, gold: 0, mRight: 0, mHonest: 0, mWrong: 0 } };
for (const d of dirs) {
  const files = readdirSync(d).filter((f) => f.endsWith(".jsonl")).sort();
  const rows = files.flatMap((f) => readFileSync(`${d}/${f}`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)));
  const tot = { rules: { exact: 0, right: 0, wrongAligned: 0, missed: 0, acts: 0, extra: 0, gold: 0, mRight: 0, mHonest: 0, mWrong: 0, byAct: {} }, vss: { exact: 0, right: 0, wrongAligned: 0, missed: 0, acts: 0, extra: 0, gold: 0, mRight: 0, mHonest: 0, mWrong: 0, byAct: {} } }, dump = [];
  const GD = gateBlank();
  for (const r of rows) {
    const ctx = { names: r.names || [], last: [], spans: r.wires.every((w) => w.span) ? r.wires.map((w) => w.span) : null };
    const out = { rules: sys.formalize(r.text, ctx).nodes, vss: vssFormalize(r.text, ctx) }, rec = { id: r.id, text: r.text };
    for (const f of ["rules", "vss"]) rec[f] = tally(tot[f], out[f], r).bad;
    if (GATE) gateTally(GD, out.vss, r);
    dump.push(rec);
  }
  const n = rows.length, line = (f) => { const T = tot[f]; return `${f.padEnd(5)} wires right ${(T.right / T.gold * 100).toFixed(1)}% (${T.right}/${T.gold}) · act found ${(T.acts / T.gold * 100).toFixed(1)}% · extra wires ${T.extra}`; };
  console.log(`\n${d}: ${n} messages, ${tot.rules.gold} gold wires`); console.log("  " + line("rules")); console.log("  " + line("vss"));
  for (const f of ["rules", "vss"]) { const T = tot[f], p = (x) => (x / T.gold * 100).toFixed(1) + "%"; console.log(`  ${f.padEnd(5)} per request: correct ${p(T.right)} · not done ${p(T.missed)} · done wrong ${p(T.wrongAligned)} · extra ${T.extra} (${p(T.extra)})`); }
  if (GATE) { console.log("  " + gateLine(GD)); for (const k of Object.keys(GALL)) GALL[k] += GD[k]; }
  const acts = Object.keys(tot.rules.byAct).sort((a, b) => tot.rules.byAct[b][1] - tot.rules.byAct[a][1]);
  console.log("  per act (rules · vss · n): " + acts.map((a) => `${a.split(":").pop() || a} ${tot.rules.byAct[a][0]}·${(tot.vss.byAct[a] || [0])[0]}·${tot.rules.byAct[a][1]}`).join(", "));
  report[d] = { n, tot }; ALL.n += n; for (const f of ["rules", "vss"]) for (const k of ["exact", "right", "wrongAligned", "missed", "acts", "extra", "gold", "mRight", "mHonest", "mWrong"]) ALL[f][k] += tot[f][k]; if (verbose) dump.slice(0, 12).forEach((x) => console.log(`  ${x.id} ${x.text}\n     rules: ${x.rules.join(" | ") || "ok"}\n     vss:   ${x.vss.join(" | ") || "ok"}`));
  if (dumpAt >= 0) writeFileSync(argv[dumpAt + 1].replace(/(\.json)?$/, `_${d.split("/").filter(Boolean).pop()}.json`), JSON.stringify(dump, null, 1));
}
if (dirs.length > 1) { const n = ALL.n, pc = (x, T) => (x / T.gold * 100).toFixed(1) + "%", line = (f) => { const T = ALL[f]; return `${f.padEnd(5)} correct ${pc(T.right, T)} · not done ${pc(T.missed, T)} · done wrong ${pc(T.wrongAligned, T)} · plus ${T.extra} extra wires not asked for (${pc(T.extra, T)} of the gold count)`; };
  console.log(`\nALL (${dirs.join(" + ")}): ${n} messages, ${ALL.rules.gold} gold wires`); console.log("  " + line("rules")); console.log("  " + line("vss"));
  if (GATE) console.log("  " + gateLine(GALL));
}
if (V2) console.log(`\ncomposer v2: units read, decided by: ${Object.entries(V2STAT.decided).map(([k, n]) => `${k} ${n}`).join(", ")} · readings tied at the fewest words not understood: ${Object.entries(V2STAT.tieSize).sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}: ${n}`).join(", ")} · asked by the context filler (not executed) ${CSTAT.ask} · ignored: ${Object.entries(V2STAT.ignoredWhy).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
if (PAIRV) console.log(`pairing: PAIR=value (layer_common.mjs pairValue)`);
if (ECUT) {
  console.log(`\nevent hint (${comp.eventHint}): units ${HSTAT.units} · hint an event of a candidate world ${HSTAT.applies} · readings re-read ${HSTAT.reread} (in ${HSTAT.unitsReread} units) · units whose chosen reading changed ${HSTAT.changed}`);
  if (dumpAt >= 0) writeFileSync(argv[dumpAt + 1].replace(/(\.json)?$/, "_hint.json"), JSON.stringify(HSTAT.log, null, 1));
}
if (COMPOSER) console.log(`\ncomposer units: ${CSTAT.units} (read by several candidate worlds: ${CSTAT.multi}) · read per world: ${Object.entries(CSTAT.byWorld).map(([w, k]) => `${w} ${k}`).join(", ") || "none"} · asked ${CSTAT.ask} · ignored ${CSTAT.ignored} (no action token ${CSTAT.ignoredNoToken})`);
}
