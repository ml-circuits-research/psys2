// Original pairing/outcome functions from diagram-vss-demo c765652, precision_bert_collect.mjs.
// Kept unchanged; only imports/exports added to avoid loading unrelated VSS models.
import { canon, canonWant } from "./upstream/docs/js/bench-canon.js";
import { pairValue } from "./upstream/training/sketch/layer_common.mjs";
const actOf = (type, a) => `${type}:${a.action || a.ask || ""}`;
function pairUp(mains, gold, row) {
  const used = new Set(), G = row.wires.map((w, j) => {
    let s0 = -1;
    if (w.span) { let from = 0; for (;;) { const k = row.text.indexOf(w.span, from); if (k < 0) break; if (!used.has(k)) { s0 = k; break; } from = k + 1; } if (s0 < 0) s0 = row.text.indexOf(w.span); used.add(s0); }
    return { s: s0, e: s0 < 0 ? -1 : s0 + w.span.length, act: gold[j].act, want: gold[j].want, args: w.args };
  });
  const units = mains.map((x) => { if (x.n.span) return { c0: x.n.span[0], c1: x.n.span[1] }; const k = x.n.src ? row.text.indexOf(x.n.src) : -1; return k < 0 ? { c0: 0, c1: 0 } : { c0: k, c1: k + x.n.src.length }; });
  return pairValue({ text: row.text, gold: G, units, prods: mains.map((x, i) => ({ act: x.act, u: i, rawC: x.got })) });
}
function outcomes(nodes, row) {
  const mains = nodes.filter((n) => n.type !== "mention").map((n) => ({ act: actOf(n.type, n.args), got: canon(n, nodes), n }));
  const gold = row.wires.map((w) => ({ act: actOf(w.type, w.args), want: canonWant(w.type, w.args) }));
  const res = mains.map(() => "extra");
  for (const [i, j] of pairUp(mains, gold, row)) res[i] = Object.entries(gold[j].want).every(([k, v]) => (mains[i].got[k] ?? "∅") === v) ? "right" : "wrong";
  return { mains, res };
}

export { outcomes };
