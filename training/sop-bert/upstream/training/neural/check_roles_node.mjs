// check_roles_node.mjs: does a joint model folder (training/neural/finetune_roles.py) load in transformers.js 3.8.1 (AutoTokenizer + AutoModel,
// q8) and does docs/js/neural.js makeReader (the demo's decoding code) read the same as torch? Compares, per request: the word pieces,
// the act, the class of every class key (the legend's value heads and SOP-BERT's fill:<key> / desc:<key> heads: who fills each name-role,
// and the description's keys), and the tag of every word.
// Usage: node training/neural/check_roles_node.mjs <parent dir of the model folder> <model folder name, e.g. sop-bert> <torch_ref.jsonl> [<torch_cut_ref.jsonl>]
// (needs `cd training/laptop && npm install`). Last stdout line: {"ids": "k/n", "act": "k/n", "classes": "k/n", "tags": "k/n"} .
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const [parent, name, refPath, cutRefPath] = process.argv.slice(2);
const require = createRequire(fileURLToPath(new URL("../laptop/package.json", import.meta.url)));
const T = require("@huggingface/transformers");
globalThis.SOPKit = require("../../docs/js/logic.js");
const NeuralKit = require("../../docs/js/neural.js");
T.env.allowLocalModels = true; T.env.allowRemoteModels = false; T.env.localModelPath = parent.endsWith("/") ? parent : parent + "/"; T.env.useBrowserCache = false;
const tokenizer = await T.AutoTokenizer.from_pretrained(name, { local_files_only: true });
const model = await T.AutoModel.from_pretrained(name, { device: "cpu", dtype: "q8", local_files_only: true });
const { read, reader, cut } = NeuralKit.makeReader(T, tokenizer, model);
const rows = readFileSync(refPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const same = { ids: 0, act: 0, classes: 0, tags: 0 }; let k = 0;
for (const r of rows) {
  const o = await read(r.text), cls = Object.fromEntries(Object.entries(o.classes).filter(([, c]) => c.value != null).map(([key, c]) => [key, c.value]));
  const d = {
    ids: JSON.stringify(o.ids) === JSON.stringify(r.ids), act: o.acts[0].label === r.act,
    classes: JSON.stringify(Object.entries(cls).sort()) === JSON.stringify(Object.entries(r.classes).sort()), tags: JSON.stringify(o.tags) === JSON.stringify(r.tags),
  };
  for (const x of Object.keys(same)) same[x] += d[x];
  if (Object.values(d).some((x) => !x) && k++ < 5) console.log(`  differs: "${r.text}"`, JSON.stringify({ act: [r.act, o.acts[0].label], classes: [r.classes, cls], tags: [r.tags.join(" "), o.tags.join(" ")], ids: d.ids }));
}
const n = rows.length;
console.log(`node makeReader q8 vs torch on ${n} requests: word pieces ${same.ids}/${n}, act ${same.act}/${n}, classes ${same.classes}/${n}, tags ${same.tags}/${n} (${reader.tags.length} tags, ${reader.classes.length} class keys)`);
const res = Object.fromEntries(Object.entries(same).map(([x, v]) => [x, `${v}/${n}`]));
if (cutRefPath && cut) {   // the span head: makeReader's cut() against torch, on whole messages (spans as character offsets)
  const cr = readFileSync(cutRefPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); let ok = 0;
  for (const r of cr) {
    const ws = NeuralKit.wordsOf(r.text), want = r.spans.map(([a, b]) => [ws[a].start, ws[b - 1].end]), got = (await cut(r.text)).map((u) => [u.c0, u.c1]);
    ok += JSON.stringify(want) === JSON.stringify(got);
  }
  console.log(`node cut() vs torch on ${cr.length} whole messages: spans identical ${ok}/${cr.length}`); res.cut = `${ok}/${cr.length}`;
}
console.log(JSON.stringify(res));
