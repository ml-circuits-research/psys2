// cut_node.mjs: the BERT cut of SOP-BERT, the joint model (training/neural/finetune_roles.py, span head) on its own, to measure it against the rules'
// segmenter and the VSS cutter. Reads messages, prints the spans the model cuts, and scores them against the gold spans when the messages have them.
// Usage: node training/neural/cut_node.mjs <parent dir of the model folder> <model folder name, e.g. sop-bert> <messages.jsonl|dir of .jsonl> [--out spans.jsonl] [--limit n] [--ids file]
//   Messages: one JSON per line with id, text and (to score) wires[].span, as training/sketch/llm_*/ . Output lines: {"id", "text", "units": [{"c0", "c1", "src"}]}
//   (character offsets into text: the units that formalize(text, ctx, {units}) of docs/js/neural.js reads). Needs `cd training/laptop && npm install`.
// Score (gold spans found in the text, first occurrence not overlapping an earlier one): exact-span precision / recall / F1; overlap recall (a gold span
// touched by a predicted span) and overlap precision (a predicted span that touches a gold span); gold spans cut in two (touched by 2+ predicted spans).
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv.splice(i, 2)[1]; };
const outPath = opt("--out"), limit = +(opt("--limit") || Infinity), idsPath = opt("--ids");
const [parent, name, src] = argv;
const require = createRequire(fileURLToPath(new URL("../laptop/package.json", import.meta.url)));
const T = require("@huggingface/transformers");
globalThis.SOPKit = require("../../docs/js/logic.js");
const NeuralKit = require("../../docs/js/neural.js");
T.env.allowLocalModels = true; T.env.allowRemoteModels = false; T.env.localModelPath = parent.endsWith("/") ? parent : parent + "/"; T.env.useBrowserCache = false;
const tokenizer = await T.AutoTokenizer.from_pretrained(name, { local_files_only: true });
const model = await T.AutoModel.from_pretrained(name, { device: "cpu", dtype: "q8", local_files_only: true });
const { cut } = NeuralKit.makeReader(T, tokenizer, model);
if (!cut) { console.error("this model has no span head (config.json reader.cut)"); process.exit(2); }
const files = statSync(src).isDirectory() ? readdirSync(src).filter((f) => f.endsWith(".jsonl")).map((f) => `${src}/${f}`) : [src];
const ids = idsPath ? new Set(readFileSync(idsPath, "utf8").split(/\s+/).filter(Boolean)) : null;
const rows = files.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))).filter((r) => r.text && (!ids || ids.has(r.id))).slice(0, limit);
const gold = (r) => { const used = [], out = []; for (const w of r.wires || []) { const sp = w.span; if (!sp) continue; let i = -1; for (;;) { i = r.text.indexOf(sp, i + 1); if (i < 0 || !used.some(([a, b]) => i < b && i + sp.length > a)) break; } if (i >= 0) { used.push([i, i + sp.length]); out.push([i, i + sp.length]); } } return out; };
const S = { msgs: 0, scored: 0, pred: 0, gold: 0, exact: 0, goldTouched: 0, predTouching: 0, split: 0 }; const lines = [];
for (const r of rows) {
  const units = (await cut(r.text)).map((u) => ({ c0: u.c0, c1: u.c1, src: r.text.slice(u.c0, u.c1) }));
  lines.push(JSON.stringify({ id: r.id, text: r.text, units })); S.msgs++;
  const g = gold(r); if (!g.length) continue;
  const p = units.map((u) => [u.c0, u.c1]), touch = (a, b) => a[0] < b[1] && b[0] < a[1];
  S.scored++; S.pred += p.length; S.gold += g.length;
  S.exact += g.filter((x) => p.some((y) => y[0] === x[0] && y[1] === x[1])).length;
  S.goldTouched += g.filter((x) => p.some((y) => touch(x, y))).length; S.predTouching += p.filter((y) => g.some((x) => touch(x, y))).length;
  S.split += g.filter((x) => p.filter((y) => touch(x, y)).length > 1).length;
}
if (outPath) writeFileSync(outPath, lines.join("\n") + "\n");
else if (!S.scored) console.log(lines.join("\n"));
const f = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "-");
if (S.scored) {
  const P = S.exact / Math.max(S.pred, 1), R = S.exact / Math.max(S.gold, 1);
  console.log(`BERT cut on ${S.scored} messages with gold spans: ${S.gold} gold spans, ${S.pred} predicted`);
  console.log(`  exact: precision ${f(S.exact, S.pred)} recall ${f(S.exact, S.gold)} F1 ${(2 * P * R / Math.max(P + R, 1e-9) * 100).toFixed(1)}%`);
  console.log(`  overlap: gold spans touched ${f(S.goldTouched, S.gold)} · predicted spans touching a gold span ${f(S.predTouching, S.pred)} · gold spans cut in two ${f(S.split, S.gold)}`);
}
