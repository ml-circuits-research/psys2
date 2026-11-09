// score_rules.mjs: the rules formalizer on the benchmark sets, in node (the browser runs the same scoring).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { score } from "../../docs/js/bench-canon.js";
const require = createRequire(import.meta.url);
const K = require(process.argv[2] || "/home/claude/sop/logic.js");
const verbose = process.argv.includes("-v");
for (const id of ["hand", "blind", "seen", "new_identities", "heldout_formulations"]) {
  const rows = JSON.parse(readFileSync(new URL(`../../docs/bench/${id}.json`, import.meta.url), "utf8"));
  const sys = K.createSystem(); let ok = 0; const miss = {};
  for (const r of rows) {
    const f = sys.formalize(r.text, { names: r.names, last: [] }), s = score(f.nodes, r);
    if (s.ok) ok++; else { const k = Object.entries(s.per).filter(([, p]) => !p.ok).map(([k, p]) => `${k}:${p.got}≠${p.want}`).join(" "); miss[r.template || r.text] = (miss[r.template || r.text] || []).concat([r.text + "  →  " + k]); }
  }
  console.log(`${id}: rules ${ok}/${rows.length}`);
  if (verbose) for (const [t, xs] of Object.entries(miss).slice(0, 60)) console.log("   ", xs[0]);
}
