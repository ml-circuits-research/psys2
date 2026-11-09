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
// first; `list` k with `n` = the value of key k, when it holds exactly n names (n = 0: any number), is sorted. `when(args)` narrows the entry.
//   (2026-11-03, training/sketch/confidence3/NEW_FORMS_AUDIT.md) the whole-drawing operations of HIGH_LEVEL_OPS.md (improve, respace, snap,
//   fit, flip, sort, groupBy, equalize, straighten, untangle; align with a direction) and distribute: logic.js alRun takes the targets as a
//   set (auto-layout.js context(): `movable` is a Set, the shapes are taken in canvas / reading order, equalize and distribute sort them
//   themselves), so their target list is compared in any order (`list` with n = 0: any length). arrange is not listed (a template, or a tree /
//   radial of shapes without links, uses "the order given", logic.js arrange's catch).
const WHOLE_OPS = ["improve", "respace", "snap", "fit", "flip", "sort", "groupBy", "equalize", "straighten", "untangle", "distribute"];
const ORDER_FREE = {
  ...Object.fromEntries(WHOLE_OPS.map((a) => [`command:${a}`, [{ list: "target", n: 0 }]])),
  "command:align": [{ list: "target", n: 0, when: (a) => a.direction != null }],
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
// SAME: values the engine treats as the same request, written one way (2026-11-03, training/sketch/confidence3/NEW_FORMS_AUDIT.md; each is
// what docs/js/logic.js does, checked by training/sketch/confidence3/audit_new_forms.mjs, which runs both forms on two drawings):
//   question help      aspect=overview = no aspect (help-answers.js answer(): the default aspect); topic=general = no topic (the same branch);
//                      `about` beside a topic other than general is not used (answer() reads about only without a topic, or for a topic
//                      that has no sense in the legend, which a legend topic always has) -> dropped
//   command connect    from= a list of 2+ shapes, no to=: pairing chain = next = no pairing (logic.js connect: `a.pairing || (!to.length &&
//                      from.length > 1)` -> the chain unless pairing=all) -> pairing dropped
//   whole-drawing ops  (WHOLE_OPS above, align with a direction): no target = every shape (alRun: `!t.length` and target=mention(quantifier=all)
//                      are the same set, `whole`) -> written mention(quantifier=all), so "tidy up" without a target and "tidy up everything"
//                      compare equal and a reading that names fewer shapes than the gold's whole drawing is not right by silence
//   arrow restyle      set / resize with from= or to= or kind=edge, and reverse (logic.js edgesOf / restyleEdges): quantifier is never read ->
//                      dropped; with from= / to= the target is not read -> dropped; without them no target = every arrow -> mention(quantifier=all)
//   arrow label        label with from= / to= (no kind=edge): target and quantifier are not read -> dropped; kind=edge with quantifier=all: no
//                      target = every arrow -> mention(quantifier=all)
//   Not made the same: label="" (removes the label) and no label / label=null (asks what it should say); from / to of an arrow restyle,
//   reverse or label swapped (edgesNamed tries the stated direction first and the other only when it finds none: the same arrow only when
//   the drawing has one direction); label kind=edge without quantifier=all (asks which arrow when there are several); items in another
//   order (templates.js: item i gets place i and colour i).
const ALL_SHAPES = ["mention(quantifier=all)"];
function same(type, act, el) {
  if (type === "question" && act === "help") {
    if (el.aspect && el.aspect.join(",") === "overview") delete el.aspect;
    if (el.topic && el.topic.join(",") === "general") delete el.topic;
    if (el.topic && el.about) delete el.about;
    return;
  }
  if (type !== "command") return;
  if (act === "connect" && el.from && el.from.length >= 2 && !el.to && el.pairing && ["chain", "next"].includes(el.pairing.join(","))) { delete el.pairing; return; }
  if (WHOLE_OPS.includes(act) || (act === "align" && el.direction)) { if (!el.target) el.target = ALL_SHAPES.slice(); return; }
  const edgeKind = el.kind && el.kind.join(",") === "edge";
  if (act === "reverse" || ((act === "set" || act === "resize") && (el.from || el.to || edgeKind))) {
    delete el.quantifier;
    if (el.from || el.to) delete el.target; else if (!el.target) el.target = ALL_SHAPES.slice();
    return;
  }
  // label of an arrow (logic.js labelEdge): by its ends, target and quantifier are not read; kind=edge with quantifier=all: no target = every arrow
  if (act === "label" && !edgeKind && (el.from || el.to)) { delete el.target; delete el.quantifier; return; }
  if (act === "label" && edgeKind && el.quantifier && el.quantifier.join(",") === "all" && !el.target) el.target = ALL_SHAPES.slice();
}
/** el: key -> array of lower-case name strings; returns key -> string, with the order-free arguments put in one canonical order */
function finish(type, el) {
  const act = el.action ? el.action.join(",") : el.ask ? el.ask.join(",") : "", flat = () => Object.fromEntries(Object.entries(el).map(([k, v]) => [k, v.join(",")]));
  same(type, act, el);
  for (const r of ORDER_FREE[`${type}:${act}`] || []) {
    if (r.when && !r.when(flat())) continue;
    if (r.pairs) {   // two (key, key) pairs exchange values: the pair whose joined values sort first comes first
      const [[p1, a1], [p2, a2]] = r.pairs, j = (p, a) => (el[p] || []).join(",") + "|" + (el[a] || []).join(",");
      if (el[p1] && el[p2] && j(p1, a1) > j(p2, a2)) { const x = [el[p1], el[a1]]; el[p1] = el[p2]; el[a1] = el[a2]; el[p2] = x[0]; el[a2] = x[1]; for (const k of [a1, a2]) if (el[k] === undefined) delete el[k]; }
      continue;
    }
    if (r.swap) { const [k1, k2] = r.swap, x = el[k1], y = el[k2]; if (x && y && (r.any || (x.length === 1 && y.length === 1)) && x.join(",") > y.join(",")) { el[k1] = y; el[k2] = x; } }
    else if (el[r.list] && (r.n === 0 ? el[r.list].length >= 2 : el[r.list].length === r.n)) el[r.list] = el[r.list].slice().sort();   // n = 0: any length
  }
  return flat();
}
export function canon(main, nodes) {
  const byId = new Map((nodes || []).map((n) => [n.id, n])), el = {};
  for (const [k, v] of Object.entries(main.args || {})) {
    if (SKIP.has(k) || v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;   // a key without a value (or an empty list) is no key (logic.js reads `a.k != null`, names([]) = none); before 2026-11-03 it was "?" (or "")
    el[k] = Array.isArray(v) ? v.map((x) => one(x, byId)) : [one(v, byId)];
  }
  return finish(main.type, el);
}
/** a gold mention "mention(shape=diamond,color=yellow)" with its keys sorted, as canon writes a mention wire (its keys sorted): the gold
 *  convention does not fix the order of a mention's keys, and 9 wires of llm_bench/short3 had them unsorted (VSS_SYNTH_DIAGNOSIS.md) */
const sortMention = (x) => { const m = /^mention\((.*)\)$/.exec(x); return m ? "mention(" + m[1].split(",").sort().join(",") + ")" : x; };
/** the gold side of the same form: the args of a gold wire (values string or array) -> key -> string, same order-free rule as canon */
export function canonWant(type, args) {
  const el = {};
  for (const [k, v] of Object.entries(args || {})) { if (SKIP.has(k) || v === undefined || v === null) continue; el[k] = (Array.isArray(v) ? v : parts(v)).map((x) => sortMention(String(x).toLowerCase())); }   // the gold skips what canon skips (scale)
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
