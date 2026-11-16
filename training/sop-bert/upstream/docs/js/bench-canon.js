// bench-canon.js: the canonical form the benchmark compares. A wire's arguments become key -> lower-case string; a reference to a
// mention wire becomes "mention(k=v,...)" with the mention's own answers; a reference to a wire created in the same message becomes
// "$new". `scale` is not compared (how much bigger is a matter of taste, not of reading): the action already says resize.
const SKIP = new Set(["scale"]);
function one(v, byId) {
  if (v == null) return "?";
  if (typeof v === "object" && !Array.isArray(v) && typeof v.ref === "string") {
    const m = byId.get(v.ref);
    if (m && m.type === "mention") return ("mention(" + Object.keys(m.args).sort().map((k) => `${k}=${m.args[k]}`).join(",") + ")").toLowerCase();
    return "$new";
  }
  return String(v).toLowerCase();
}
// ORDER_FREE: which shape arguments the editor treats without regard to their order, so the benchmark compares them without order.
// Derived from the run() of each command and question in docs/js/logic.js (checked one by one); directed ones are NOT listed.
//   command disconnect  { swap: from<->to }   logic.js:594 matches (e.from===f && e.to===x) || (e.from===x && e.to===f): both directions
//                       { list: target, 2 }   logic.js:588 target [A,B] becomes from=A,to=B, then the same line 594
//   question connected  { swap: target<->anchor }  logic.js:732 and :868 (both directions); :795-796 `adjacent` is a rule in both directions
//                       { list: target, 2 }   logic.js:731 y = anchor[0] || target[1]
//   command swap        { list: target, 2 }   logic.js:545-547 the two shapes exchange positions, whichever is named first
//   question check      { list: anchor, 2 } only when position=between and no comparison: logic.js:302 relHolds 'between' (t and 1-t and the
//                       distance to the line are symmetric in the two anchors); :773 and :802 build the same fact for both orders
// Not listed: connect (logic.js:581 from -> to is the arrow direction), path and reachable (logic.js:879, :888 follow the arrows from `from`),
// align (:628 the first target is the base), toFront/toBack and move (sequential), the size comparison (:705 A bigger than B),
// neighbors/degree (one shape). A command with position=between (move, create, duplicate) is symmetric only inside one grid cell
// (logic.js:261 inCell(anchors[0])): not listed.
//   questions with two relations (check, count, list, exists): { pairs: position/anchor <-> position2/anchor2 }  "is X below A and above B"
//                       = "is X above B and below A": logic.js LOGIC_MAP position / position2 add literals to one conjunction, filterShapes
//                       applies both filters. Not listed for commands (create / move / fact): when the two cannot both hold, the engine
//                       keeps the first (placeMulti), so their order is read.
// An entry: `swap` [k1,k2] = the two keys exchange values (both hold one name, or any number when `any`), so the smaller string comes
// first; `list` k with `n` = the value of key k, when it holds exactly n names, is sorted. `when(args)` narrows the entry.
const ORDER_FREE = {
  "command:disconnect": [{ swap: ["from", "to"], any: true }, { list: "target", n: 2 }],
  "question:connected": [{ swap: ["target", "anchor"] }, { list: "target", n: 2 }],
  "command:swap": [{ list: "target", n: 2 }],
  "question:check": [{ list: "anchor", n: 2, when: (a) => a.position === "between" && a.comparison == null }, { pairs: [["position", "anchor"], ["position2", "anchor2"]] }],
  "question:count": [{ pairs: [["position", "anchor"], ["position2", "anchor2"]] }],
  "question:list": [{ pairs: [["position", "anchor"], ["position2", "anchor2"]] }],
  "question:exists": [{ pairs: [["position", "anchor"], ["position2", "anchor2"]] }]
};
/** split "a,b" at commas outside parentheses (a mention is written "mention(k=v,k=v)") */
const parts = (s) => { const out = []; let d = 0, cur = ""; for (const ch of String(s)) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
/** el: key -> array of lower-case name strings; returns key -> string, with the order-free arguments put in one canonical order */
function finish(type, el) {
  const act = el.action ? el.action.join(",") : el.ask ? el.ask.join(",") : "", flat = () => Object.fromEntries(Object.entries(el).map(([k, v]) => [k, v.join(",")]));
  for (const r of ORDER_FREE[`${type}:${act}`] || []) {
    if (r.when && !r.when(flat())) continue;
    if (r.pairs) {   // two (key, key) pairs exchange values: the pair whose joined values sort first comes first
      const [[p1, a1], [p2, a2]] = r.pairs, j = (p, a) => (el[p] || []).join(",") + "|" + (el[a] || []).join(",");
      if (el[p1] && el[p2] && j(p1, a1) > j(p2, a2)) { const x = [el[p1], el[a1]]; el[p1] = el[p2]; el[a1] = el[a2]; el[p2] = x[0]; el[a2] = x[1]; for (const k of [a1, a2]) if (el[k] === undefined) delete el[k]; }
      continue;
    }
    if (r.swap) { const [k1, k2] = r.swap, x = el[k1], y = el[k2]; if (x && y && (r.any || (x.length === 1 && y.length === 1)) && x.join(",") > y.join(",")) { el[k1] = y; el[k2] = x; } }
    else if (el[r.list] && el[r.list].length === r.n) el[r.list] = el[r.list].slice().sort();
  }
  return flat();
}
export function canon(main, nodes) {
  const byId = new Map((nodes || []).map((n) => [n.id, n])), el = {};
  for (const [k, v] of Object.entries(main.args || {})) {
    if (SKIP.has(k)) continue;
    el[k] = Array.isArray(v) ? v.map((x) => one(x, byId)) : [one(v, byId)];
  }
  return finish(main.type, el);
}
/** the gold side of the same form: the args of a gold wire (values string or array) -> key -> string, same order-free rule as canon */
export function canonWant(type, args) {
  const el = {};
  for (const [k, v] of Object.entries(args || {})) el[k] = (Array.isArray(v) ? v : parts(v)).map((x) => String(x).toLowerCase());
  return finish(type, el);
}
/** score one formalizer output against a row (a row, or a wire of a `wires` row, holds its gold arguments in `gold` or `args`): { ok, per: {key: {got, want, ok}} }. A row with `wires` (a message of several clauses)
 *  is compared wire by wire, in order, on the non-mention wires; otherwise the last non-mention wire is the reading. */
export function score(nodes, row) {
  if (row.wires) {
    const mains = (nodes || []).filter((n) => n.type !== "mention"), per = {}; let ok = mains.length === row.wires.length;
    per._count = { got: String(mains.length), want: String(row.wires.length), ok: mains.length === row.wires.length };
    row.wires.forEach((w, i) => {
      const s = score1(mains[i] ? [...nodes.filter((n) => n.type === "mention"), mains[i]] : [], w, nodes);
      for (const [k, p] of Object.entries(s.per)) per[`${i + 1}.${k}`] = p;
      if (!s.ok) ok = false;
    });
    return { ok, per };
  }
  return score1(nodes, row, nodes);
}
function score1(nodes, row, all) {
  const main = [...(nodes || [])].reverse().find((n) => n.type !== "mention");
  const got = main ? canon(main, all || nodes) : {}, per = {};
  let ok = !!main && main.type === row.type;
  per._type = { got: main ? main.type : "∅", want: row.type, ok: !!main && main.type === row.type };
  for (const [k, want] of Object.entries(canonWant(row.type, row.gold ?? row.args))) { const g = got[k] ?? "∅"; per[k] = { got: g, want, ok: g === want }; if (g !== want) ok = false; }
  return { ok, per };
}
if (typeof window !== "undefined") window.BenchCanon = { canon, canonWant, score };
