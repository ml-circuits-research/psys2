// check_node.mjs: does a model folder load in transformers.js 3.8.1 as a `text-classification` pipeline (q8) and give the same top label as torch?
// Usage: node training/neural/check_node.mjs <parent dir of the model folder> <model folder name> <torch_top.jsonl>
// (needs `cd training/laptop && npm install`). Last stdout line: {"agree": "k/n"} .
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const [parent, name, refPath] = process.argv.slice(2);
const T = createRequire(fileURLToPath(new URL("../laptop/package.json", import.meta.url)))("@huggingface/transformers");
T.env.allowLocalModels = true; T.env.allowRemoteModels = false; T.env.localModelPath = parent.endsWith("/") ? parent : parent + "/"; T.env.useBrowserCache = false;
const clf = await T.pipeline("text-classification", name, { device: "cpu", dtype: "q8" });
const rows = readFileSync(refPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
let agree = 0, k = 0;
for (const r of rows) { let o = await clf(r.text, { top_k: 1 }); o = Array.isArray(o) ? o[0] : o; if (o.label === r.top) agree++; else if (k++ < 5) console.log(`  differs: "${r.text}" torch ${r.top} onnx-q8 ${o.label} ${o.score.toFixed(2)}`); }
console.log(`node text-classification q8 vs torch: ${agree}/${rows.length} same top label; gold agreement ${rows.filter((r) => r.top === r.gold).length}/${rows.length} (torch)`);
console.log(JSON.stringify({ agree: `${agree}/${rows.length}` }));
