// clarify.js: what the reply says about a request that was not executed, and what happens to it afterwards (training/sketch/CLARIFY_DESIGN.md,
// design B "no questions": the reasons, then the shape of a clearer command). Pure ES module, no imports, no DOM: ui.js builds the input from
// a gate (combined-confidence.js combine + reasons, vss-confidence.js / neural-confidence.js reasons) and renders the output.
//
// Input of one held request (heldInput):
//   { src: "put Done below it",              the words of the message the request was cut from
//     type: "command" | "question" | "fact" | "rule",
//     reading: {action|ask, key: value, ...} the reading the "Do it anyway" button would run, canonical values (bench-canon.js canon: lower-case
//                                             names, lists "a,b", descriptions "mention(shape=circle,color=red)", "$new" for a shape made earlier)
//     other: {...} | null                    the other reader's reading of the same request (null: it read nothing here)
//     otherAct: "move" | null                the other reader's action when it read this part of the message as another action
//     differ: [{key, sop, vss}]              the keys the two readings disagree on (combined-confidence.js agreement)
//     signals: [{group, text, word?, filled?}]  what the executing reader itself was unsure of, already in words (vss-confidence.js /
//                                             neural-confidence.js reasons), group in: cut, context, description, words, unplaced, world,
//                                             reading, act, values, tags, depends, ...; for "context": word = the word ('it'), filled = the name
//     dependsOn: ["add Fail below Check"]    held requests whose shapes this one uses (it is held because of them) }
// names: the drawing's names as written (["Start", "Process"]) so the clearer command writes them as the user sees them.
//
// Output (heldReply): { src, reasons: [string], clearer: string | null, alternatives: [string], placeholders: [key], shown: [key], anyway: string | null }
//   reasons      at most MAX_REASONS short sentences: what was unclear, in the user's words where possible;
//   clearer      the request written explicitly, with the reading's values; a value the readers disagree on is a placeholder ‹what colour?›;
//   alternatives when the two readers read different actions: one explicit command per reading (the user writes the one they meant);
//   shown        the open keys whose placeholder the clearer command actually shows (the ones the reply asks to state);
//   anyway       what "Do it anyway" would run, written explicitly (the reading itself, no placeholders), or null when it cannot run.
// replyText: the whole reply as plain lines (the chat renders the same content with buttons).

export const MAX_REASONS = 3;

/* ---------------------------------------------------------------- words */
// the legend's keys in plain words (the legend's own questions, docs/js/logic.js, shortened to a noun phrase)
const KEY = { color: "the colour", outline: "the outline colour", shape: "the shape", size: "the size", scale: "how much bigger or smaller",
  target: "which shape it is about", from: "where the arrow starts", to: "where the arrow ends", anchor: "the shape it is placed against",
  position: "the position", direction: "the direction", name: "the name", label: "the text", count: "how many", style: "the line style",
  arrow: "which way the arrow points", axis: "horizontal or vertical", layout: "the pattern", pairing: "how they are connected",
  property: "which property is asked", superlative: "which extreme", comparison: "bigger or smaller", template: "which diagram form",
  items: "the items", at: "the x,y position", distance: "how far", kind: "shapes or arrows", topic: "what the question is about",
  aspect: "what kind of help", members: "which shapes the group holds", action: "what to do", ask: "what is asked" };
export const keyWord = (k) => KEY[k] || "the " + String(k).replace(/([A-Z])/g, " $1").toLowerCase();
// the placeholder of a value the user has to write (shown inside the clearer command)
const SLOT = { color: "which colour?", outline: "which colour?", shape: "which shape?", size: "which size?", target: "which shape?", from: "from which shape?",
  to: "to which shape?", anchor: "which shape?", position: "where?", direction: "which direction?", name: "which name?", label: "which text?",
  count: "how many?", style: "solid, dashed or dotted?", arrow: "which way?", axis: "horizontally or vertically?", layout: "which pattern?",
  scale: "bigger or smaller?", property: "which property?", superlative: "which extreme?" };
const slotOf = (k, choices) => {   // choices: the two readers' values of the key, shown in the placeholder when both read one ("‹below or above?›")
  const c = choices && choices[k];
  if (c && c.length > 1 && c.every((x) => x != null && x !== "∅" && !/[($]/.test(x) && String(x).split(/, | and /).length <= 3)) return `‹${c.join(" or ")}?›`;
  return `‹${SLOT[k] || keyWord(k) + "?"}›`;
};

const POS = { leftof: "left of", rightof: "right of", above: "above", below: "below", near: "next to", between: "between", center: "in the center",
  top: "at the top", bottom: "at the bottom", left: "on the left", right: "on the right", topleft: "in the top left corner",
  topright: "in the top right corner", bottomleft: "in the bottom left corner", bottomright: "in the bottom right corner" };
const RELATIVE = new Set(["leftof", "rightof", "above", "below", "near", "between"]);
const SUPER = { biggest: "biggest", smallest: "smallest", leftmost: "leftmost", rightmost: "rightmost", topmost: "topmost", bottommost: "bottommost",
  closest: "closest", farthest: "farthest", mostconnected: "most connected", leastconnected: "least connected" };
const PLURAL = { box: "boxes", ellipse: "ellipses", any: "shapes", text: "texts" };
const plural = (s) => PLURAL[s] || s + "s";

/** a name as the drawing writes it ("start" -> "Start"); "$new" -> the shape made earlier in the message */
function nameOf(n, names, created) {
  const k = String(n).trim();
  if (k === "$new" || k.startsWith("$new")) return created && created.length ? created[created.length - 1] : "the new shape";
  const hit = (names || []).find((x) => String(x).toLowerCase() === k.toLowerCase());
  return hit || (k ? k[0].toUpperCase() + k.slice(1) : k);
}
const listing = (xs) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
/** parse "mention(a=b,c=d)" -> {a: b, c: d} (null when the value is not a description) */
export function mentionOf(v) {
  const m = /^mention\((.*)\)$/.exec(String(v || "")); if (!m) return null;
  const o = {}; for (const p of m[1].split(",").filter(Boolean)) { const [k, x] = p.split("="); o[k.trim().toLowerCase()] = (x || "").trim(); }
  return o;
}
/** a description in words: {quantifier: all, color: red, shape: circle} -> "all the red circles"; {shape: diamond} -> "the diamond" */
function describe(m) {
  const all = m.quantifier === "all", shape = m.shape && m.shape !== "any" ? m.shape : null;
  const adj = [m.size, m.color].filter(Boolean).join(" ");
  if (all && !shape && !adj && !m.notcolor) return "everything";
  const noun = shape ? (all ? plural(shape) : shape) : all ? "shapes" : "shape";
  let s = (all ? "all the " : m.recency === "newest" ? "the last " : m.recency === "oldest" ? "the first " : "the ") + (adj ? adj + " " : "") + noun;
  if (m.notcolor) s += ` that ${all ? "are" : "is"} not ${m.notcolor}`;
  return s;
}
/** a value of a names role (target, from, to, anchor, ...) in words */
function who(v, names, created) {
  if (v == null || v === "∅") return null;
  const m = mentionOf(v); if (m) return describe(m);
  return listing(String(v).split(",").map((n) => nameOf(n, names, created)));
}
const quoteText = (t) => `“${t}”`, labelText = (t) => `"${t}"`;

/* ---------------------------------------------------------------- the explicit command of a reading */
/** a reading written as an explicit command or question, the way the help writes them ("Move Done below Check."). A key listed in `open`
 *  is written as a placeholder ‹...›. Returns null for what has no explicit command (a fact or a rule: a statement, not a request).
 *  r: canonical reading ({action|ask, ...}); opts: {names, created, open: Set|[] of keys} */
export function commandText(r, opts = {}) {
  if (!r) return null;
  const names = opts.names || [], created = opts.created || [], open = new Set(opts.open || []), choices = opts.choices || null;
  const slot = (k) => slotOf(k, choices);
  const has = (k) => r[k] != null && r[k] !== "∅" && r[k] !== "";
  const val = (k) => (open.has(k) ? slot(k) : r[k]);
  const W = (k) => (open.has(k) ? slot(k) : who(r[k], names, created));
  const where = () => {
    if (open.has("position")) return slot("position") + (has("anchor") || open.has("anchor") ? " " + W("anchor") : "");
    if (!has("position")) return has("anchor") || open.has("anchor") ? "next to " + W("anchor") : "";
    const p = String(r.position).toLowerCase(), w = POS[p] || p;
    if (RELATIVE.has(p)) return w + " " + (has("anchor") || open.has("anchor") ? W("anchor") : slot("anchor"));
    return w;
  };
  const looks = () => {   // "a small red circle" style adjectives for create / set
    const a = [];
    if (has("size") || open.has("size")) a.push(val("size"));
    if (has("color") || open.has("color")) a.push(val("color"));
    return a;
  };
  const act = String(r.action || "").toLowerCase(), ask = String(r.ask || "").toLowerCase();
  const end = (s) => s.replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase()) + (ask && !/^(list|describe) /.test(s) ? "?" : ".");
  if (!act && !ask) return null;   // a fact or a rule
  const T = () => (has("target") || open.has("target") ? W("target") : "everything");
  switch (act || "ask:" + ask) {
    case "create": {
      if (has("template")) return end(`make a ${val("template")} diagram` + (has("items") ? ` with ${listing(String(r.items).split(",").map((x) => nameOf(x, names)))}` : ""));
      const n = has("count") ? +r.count || r.count : 1, shape = has("shape") || open.has("shape") ? val("shape") : "shape";
      const noun = n === 1 ? shape : open.has("shape") ? shape : plural(shape);
      const lk = looks(), art = n === 1 ? (/^[aeiou]/.test((lk[0] || noun)) ? "an" : "a") : String(n);
      let s = `add ${art} ${lk.length ? lk.join(" ") + " " : ""}${noun}`;
      if (has("name") || open.has("name")) s += ` named ${open.has("name") ? slot("name") : listing(String(r.name).split(",").map((x) => nameOf(x, names)))}`;
      if (has("label") || open.has("label")) s += ` with the text ${open.has("label") ? slot("label") : labelText(r.label)}`;
      if (has("outline") || open.has("outline")) s += ` with ${val("outline") === "none" ? "no" : "a " + val("outline")} outline`;
      if (has("at") || open.has("at")) s += ` at ${val("at")}`;
      const w = where(); if (w) s += " " + w;
      return end(s);
    }
    case "set": {
      const parts = [];
      const lk = looks();
      const many = has("target") && (String(r.target).includes(",") || (mentionOf(r.target) || {}).quantifier === "all");
      if (has("shape") || open.has("shape")) parts.push(many ? `${lk.length ? lk.join(" ") + " " : ""}${open.has("shape") ? val("shape") : plural(val("shape"))}`
        : `${lk.length ? (/^[aeiou]/.test(lk[0]) ? "an " : "a ") + lk.join(" ") + " " : /^[aeiou]/.test(val("shape")) ? "an " : "a "}${val("shape")}`);
      else if (lk.length) parts.push(lk.join(" "));
      let s = parts.length ? `make ${T()} ${parts.join(" ")}` : "";
      if (has("outline") || open.has("outline")) s = (s ? s + " and give it " : `give ${T()} `) + (val("outline") === "none" ? "no outline" : `${/^[aeiou]/.test(val("outline")) ? "an" : "a"} ${val("outline")} outline`);
      if (has("label") || open.has("label")) s = (s ? s + " and label it " : `label ${T()} `) + (open.has("label") ? slot("label") : labelText(r.label));
      if (has("position") || open.has("position")) s = (s ? s + " and move it " : `move ${T()} `) + where();
      return end(s || `change ${T()}`);
    }
    case "connect": case "disconnect": {
      if (act === "disconnect" && !has("from") && !has("to") && !open.has("from") && !open.has("to")) return end(has("target") ? `remove all connections of ${T()}` : "remove all connections");
      const verb = act === "connect" ? "connect" : "disconnect";
      let s;
      if (has("to") || open.has("to")) s = act === "connect" ? `connect ${W("from") || slot("from")} to ${W("to")}` : `disconnect ${W("from") || slot("from")} from ${W("to")}`;
      else if (has("from") && String(r.from).split(",").length > 1) s = act === "connect" ? `connect ${W("from")} in a chain` : `remove the arrows between ${W("from")}`;
      else s = act === "connect" ? `connect ${W("from") || slot("from")} to ${slot("to")}` : `disconnect ${W("from") || slot("from")} from ${slot("to")}`;
      if (act === "connect") {
        const st = has("style") || open.has("style") ? val("style") + " " : "";
        if (r.arrow === "none") s += ` with a ${st}line`; else if (r.arrow === "both") s += ` with a ${st}two-way arrow`;
        else if (open.has("arrow")) s += ` with ${slot("arrow")}`; else if (st) s += ` with a ${st}arrow`;
      }
      s = end(s);
      // a label on the new arrow: a second command, in the help's form (two explicit commands read better than one long one)
      if ((has("label") || open.has("label")) && act === "connect" && (has("to") || open.has("to")))
        s += " " + end(`label the arrow from ${W("from")} to ${W("to")} ${open.has("label") ? slot("label") : labelText(r.label)}`);
      return s;
    }
    case "move": {
      if (has("direction") || open.has("direction")) return end(`move ${T()} ${val("direction")}` + (has("distance") ? ` by ${r.distance} px` : ""));
      if (has("at")) return end(`move ${T()} to ${r.at}`);
      const p = String(r.position || "").toLowerCase(), w = where();
      const side = { left: "left side", right: "right side" }[p];
      return end(`move ${T()} ${!w ? slot("position") : has("position") && !RELATIVE.has(p) && p !== "center" ? "to the " + (side || (POS[p] || p).replace(/^(at|on|in) the /, "")) : w}`);
    }
    case "delete": return end(`delete ${T()}`);
    case "rename": return end(`rename ${T()} to ${open.has("name") ? slot("name") : has("name") ? nameOf(r.name, []) : slot("name")}`);
    case "label": {
      if (r.label === "" && !open.has("label")) return end(has("from") || has("to") ? `remove the label of the arrow from ${W("from") || slot("from")} to ${W("to") || slot("to")}` : `remove the label of ${T()}`);
      const txt = open.has("label") ? slot("label") : has("label") ? labelText(r.label) : slot("label");
      if (has("from") || has("to")) return end(`label the arrow from ${W("from") || slot("from")} to ${W("to") || slot("to")} ${txt}`);
      return end(`label ${T()} ${txt}`);
    }
    case "resize": {
      if (has("size") || open.has("size")) return end(`make ${T()} ${val("size")}`);
      if (open.has("scale")) return end(`make ${T()} ${slot("scale")}`);
      const k = +r.scale; return end(`make ${T()} ${!has("scale") ? "bigger" : k >= 1.9 ? `${k === 2 ? "twice" : k + " times"} as big` : k > 1 ? "bigger" : k <= 0.55 ? "half as big" : "smaller"}`);
    }
    case "duplicate": return end(`copy ${T()}` + (has("count") && +r.count > 1 ? ` ${+r.count === 2 ? "twice" : r.count + " times"}` : ""));
    case "swap": return end(`swap ${T()}`);
    case "group": return end(`group ${T()}` + (has("name") ? ` as ${nameOf(r.name, [])}` : ""));
    case "ungroup": return end(`ungroup ${T()}`);
    case "align": return end(`align ${T()}` + (has("axis") || open.has("axis") ? " " + (open.has("axis") ? slot("axis") : r.axis === "vertical" ? "vertically" : "horizontally") : ""));
    case "distribute": return end(`space ${T()} evenly` + (has("axis") || open.has("axis") ? " " + (open.has("axis") ? slot("axis") : r.axis === "vertical" ? "vertically" : "horizontally") : ""));
    case "arrange": {
      if (has("template")) return end(`arrange ${T()} as a ${r.template}`);
      const lay = has("layout") || open.has("layout") ? val("layout") : slot("layout");
      if (!has("layout") && !open.has("layout")) return end(`arrange ${T()}` + (has("anchor") ? ` around ${W("anchor")}` : ""));
      return end(`arrange ${T()} ${lay === "layers" ? "in layers" : lay === "organic" ? "freely (organic)" : "in a " + lay}` + (has("anchor") ? ` around ${W("anchor")}` : ""));
    }
    case "tofront": return end(`bring ${T()} to the front`);
    case "toback": return end(`send ${T()} to the back`);
    case "undo": case "redo": return end(act + (has("count") && +r.count > 1 ? ` ${+r.count === 2 ? "twice" : r.count + " times"}` : open.has("count") ? " " + slot("count") : ""));
    case "reverse": return end(`reverse the arrow from ${W("from") || slot("from")} to ${W("to") || slot("to")}`);
    case "improve": return end("improve the layout");
    case "respace": return end("spread the shapes out evenly");
    case "straighten": return end("straighten the arrows");
    case "untangle": return end("untangle the arrows");
    case "snap": return end("snap the shapes to the grid");
    case "fit": return end("fit the drawing to the page");
    case "flip": return end(`flip ${T()}` + (has("axis") ? (r.axis === "vertical" ? " vertically" : " horizontally") : ""));
    case "equalize": return end(`make ${T()} the same size`);
    case "sort": return end(`sort ${T()}`);
    case "groupby": return end(`group the shapes by ${has("property") ? r.property : "colour"}`);
    case "forget": return end("forget that rule");
    case "ask:count": return end(`how many ${r.kind === "edge" ? "arrows" : describeQ(r, true)} are there`);
    case "ask:list": return end(`list ${has("position") ? `the shapes ${where()}` : describeQ(r, false, true)}`);
    case "ask:exists": return end(`is there ${describeQ(r, false)}${has("position") ? " " + where() : ""}`);
    case "ask:check": {
      const q = [];
      if (has("color") || open.has("color")) q.push(val("color"));
      if (has("size") || open.has("size")) q.push(val("size"));
      if (has("shape") || open.has("shape")) q.push((/^[aeiou]/.test(val("shape")) ? "an " : "a ") + val("shape"));
      if (has("comparison")) q.push(`${r.comparison} than ${W("anchor") || slot("anchor")}`);
      else if (has("position") || open.has("position")) q.push(where());
      return end(`is ${T()} ${q.join(" and ") || slot("property")}`);
    }
    case "ask:property": {
      const P = { color: `what colour is ${T()}`, shape: `what shape is ${T()}`, size: `how big is ${T()}`, label: `what does ${T()} say`, position: `where is ${T()}`,
        outline: `what colour is the outline of ${T()}`, name: `what is the name of ${T()}` }[String(r.property || "").toLowerCase()];
      if (has("from") && has("to") && String(r.property).toLowerCase() === "label") return end(`what does the arrow from ${W("from")} to ${W("to")} say`);
      return end(open.has("property") || !P ? `what is the ${slot("property")} of ${T()}` : P);
    }
    case "ask:neighbors": return end(`what is connected to ${T()}`);
    case "ask:connected": return end(`is ${T()} connected to ${W("anchor") || slot("anchor")}`);
    case "ask:degree": return end(`how many connections does ${T()} have`);
    case "ask:nearest": return end(`which shape is ${r.superlative === "farthest" ? "farthest from" : "nearest to"} ${W("anchor") || slot("anchor")}`);
    case "ask:extreme": return end(`which shape is the ${open.has("superlative") ? slot("superlative") : SUPER[String(r.superlative || "").toLowerCase()] || r.superlative}`);
    case "ask:path": return end(`is there a path from ${W("from") || W("target") || slot("from")} to ${W("to") || W("anchor") || slot("to")}`);
    case "ask:reachable": return end(`what can be reached from ${W("from") || T()}`);
    case "ask:cycle": return end("is there a cycle");
    case "ask:describe": return end(`describe ${T()}`);
    case "ask:members": return end(`which shapes are in ${T()}`);
    case "ask:groupof": return end(`which group is ${T()} in`);
    case "ask:help": return end(`how do I ${has("topic") ? r.topic : "use the editor"}`);
    case "ask:rules": return end("what rules are there");
  }
  return null;
  function describeQ(x, pluralNoun, listForm) {
    const m = { quantifier: pluralNoun || listForm ? "all" : undefined, color: x.color, size: x.size, shape: x.shape, notcolor: x.notColor || x.notcolor };
    const d = describe(m); return pluralNoun ? d.replace(/^all the /, "").replace(/^every shape$/, "shapes") : listForm ? d : d.replace(/^the /, "a ").replace(/^a ([aeiou])/, "an $1");
  }
}

/* ---------------------------------------------------------------- what was unclear */
/** the reasons of one held request, in plain words, most important first -> [string] (at most MAX_REASONS) */
export function reasonsOf(h, opts = {}) {
  const out = [], names = opts.names || [], created = opts.created || [];
  // a long list of names (an align of the whole drawing) is shortened: the reason says which part differs, the details have the lists
  const short = (t) => { const xs = String(t).split(/, | and /); return xs.length > 3 ? listing(xs.slice(0, 3).concat("others")) : t; };
  const v = (k, x) => (x == null || x === "∅" ? "nothing" : ["target", "from", "to", "anchor", "name"].includes(k) ? short(who(x, names, created)) : String(x));
  for (const d of h.dependsOn || []) out.push(`it needs ${quoteText(d)} first, and that was not done`);
  if (h.otherAct) out.push(`the words could mean two different things: ${actWord(h.reading)} or ${h.otherAct}`);
  else if (!h.other && h.type !== "fact" && h.type !== "rule") out.push("only one of the two readers found a request here");
  const differ = (h.differ || []).filter((d) => d.key !== "action" && d.key !== "ask");
  if (differ.length) {
    const one = differ.slice(0, 2).map((d) => `${keyWord(d.key)} (${v(d.key, d.sop)} or ${v(d.key, d.vss)})`);
    out.push(`the two readers read ${listing(one)} differently`);
  }
  for (const s of h.signals || []) {
    if (s.group === "context" && s.word) out.push(`${quoteText(s.word)} was taken to mean ${s.filled || "a shape from earlier"}; the name was not written`);
    else if (s.group === "depends") continue;
    else if (s.text) out.push(s.text);
  }
  if (!out.length) out.push("the reading is right most of the time, but not often enough to act without asking");
  return [...new Set(out)].slice(0, MAX_REASONS);
}
const actWord = (r) => String((r && (r.action || r.ask)) || "something").toLowerCase();

/** the keys a clearer command must state: the keys the readers disagree on, and the key a context fill or a description stood for */
export function openKeys(h) {
  const k = new Set((h.differ || []).map((d) => d.key).filter((x) => x !== "action" && x !== "ask"));
  for (const s of h.signals || []) if (s.group === "context" && s.key) k.add(s.key);
  return [...k];
}

/** the reply part of one held request (see the head of the file) */
export function heldReply(h, opts = {}) {
  const o = { names: opts.names || [], created: opts.created || [] };
  const open = openKeys(h);
  const anyway = (h.dependsOn || []).length ? null : commandText(h.reading, o);
  let clearer = null, alternatives = [], shown = [];
  if (h.otherAct && h.other) {
    alternatives = [commandText(h.reading, o), commandText(h.other, o)].filter(Boolean);
    alternatives = [...new Set(alternatives)];
  } else {
    // a context fill: the clearer command names the shape; the value the readers disagree on: a placeholder
    const fillKeys = new Set((h.signals || []).filter((s) => s.group === "context" && s.key).map((s) => s.key));
    const nm = (k, x) => (["target", "from", "to", "anchor", "name"].includes(k) ? who(x, o.names, o.created) : String(x));
    const choices = Object.fromEntries((h.differ || []).map((d) => [d.key, [d.sop, d.vss].map((x) => (x == null || x === "∅" ? x : nm(d.key, x)))]));
    const keys = open.filter((k) => !fillKeys.has(k));
    clearer = commandText(h.reading, Object.assign({}, o, { open: keys, choices }));
    // the keys whose placeholder the command form shows (an align has no direction): the ones the reply asks to state
    const plain = commandText(h.reading, o);
    shown = keys.filter((k) => commandText(h.reading, Object.assign({}, o, { open: [k], choices })) !== plain);
  }
  return { src: h.src, reasons: reasonsOf(h, o), clearer, alternatives, placeholders: open, shown, anyway };
}

/** one held request as the chat shows it (the same content as its block of replyText, with what the two buttons do):
 *  -> {src, reasons, line (the clearer command, alternatives or "do the other first", in a sentence; null when there is none),
 *      runs (the line "Do it anyway would run: …", only when the line has placeholders or two alternatives), anyway (the reading written
 *      explicitly: what Do it anyway runs; null when it has no explicit command), canAnyway (false when it depends on a held request),
 *      edit (what the Edit button puts in the message box: the clearer command, or the first alternative; null when there is none)} */
export function heldView(h, opts = {}) {
  const r = heldReply(h, opts), open = !!(r.clearer && /‹/.test(r.clearer)), deps = (h.dependsOn || []).length > 0;
  let line = null;
  if (deps && r.clearer) line = `Do the request it depends on first; then write: ${quoteText(r.clearer)}`;
  else if (r.alternatives.length > 1) line = `Write the one you meant: ${r.alternatives.map(quoteText).join(" or ")}`;
  else if (open) line = `Write it with ${listing((r.shown.length ? r.shown : r.placeholders).map(keyWord))} stated, like this: ${quoteText(r.clearer)}`;
  else if (r.clearer && r.placeholders.length) line = `Write it with the name instead of the word, like this: ${quoteText(r.clearer)}, or press Do it anyway.`;
  else if (r.clearer) line = `If you meant ${quoteText(r.clearer)}, write it like that, or press Do it anyway.`;
  const runs = r.anyway && (r.alternatives.length > 1 || open) ? `Do it anyway would run: ${quoteText(r.anyway)}` : null;
  return { src: r.src, reasons: r.reasons, line, runs, anyway: r.anyway, canAnyway: !deps, edit: r.clearer || r.alternatives[0] || null };
}

/** the whole reply of a message as plain lines: what was done, then one block per held request.
 *  done: the engine's summary of what was executed ("Check is now red.") or ""; held: [heldInput] -> [string] */
export function replyText(done, held, opts = {}) {
  const lines = [];
  if (done) lines.push(done);
  if (!held.length) return lines.length ? lines : ["Nothing was done."];
  lines.push(heldHeader(held.length));
  for (const h of held) {
    const v = heldView(h, opts);
    lines.push(`• ${quoteText(v.src)}`);
    for (const why of v.reasons) lines.push(`  – ${why}`);
    if (v.line) lines.push(`  ${v.line}`);
    if (v.runs) lines.push(`  ${v.runs}`);
  }
  return lines;
}
/** the line above the held requests of one reply (no count: the chat has no numbers, the list shows how many) */
export const heldHeader = () => "Not done, because I am not sure what you meant:";

/** a message that produced no request at all, while requests of earlier turns are still held: the reply (no word list, no guessing what a
 *  short answer means) */
export function nothingReadText(pending, opts = {}) {
  if (!pending.length) return null;
  const last = pending[pending.length - 1], c = heldReply(last, opts).clearer;
  return `I found no request in this message, and I did not ask a question. ${pending.length === 1 ? "The request" : `The ${pending.length} requests`} I was not sure of ${pending.length === 1 ? "is" : "are"} still not done: press Do it anyway under ${pending.length === 1 ? "it" : "one of them"}, or write it again in full${c ? `, e.g. ${quoteText(c.replace(/‹[^›]*›/g, "…"))}` : "."}`;
}

/* ---------------------------------------------------------------- what happens to a held request afterwards */
// the shapes a request is about: a create's name; otherwise the shapes it acts on (target, from, to), a description as written; when it names
// none of those, the shape it is placed against (anchor). "$new" (a shape made earlier in the same message) is left out.
const valuesIn = (r, roles) => new Set(roles.flatMap((k) => (r && r[k] != null && r[k] !== "∅" && r[k] !== "" ? (mentionOf(r[k]) ? [String(r[k])] : String(r[k]).split(",")) : []))
  .map((x) => x.trim().toLowerCase()).filter((x) => x && !x.startsWith("$new")));
const shapesOf = (r, act) => { const main = valuesIn(r, act === "create" ? ["name"] : ["target", "from", "to"]); return main.size ? main : valuesIn(r, ["anchor"]); };
/** does an executed request of a later message do what a held request was about? The same action (or question), and every shape the held
 *  request is about (a create: its name; otherwise target, from, to, or the anchor when it names none of those; a context fill counts with
 *  the name it was filled with) is among the shapes of the executed one. Two requests that name no shape at all (undo, improve the layout)
 *  are the same; two creates without a name are not. The held request is then "superseded": its buttons are disabled with the words
 *  "replaced by your later command", so it cannot run twice. */
export function supersedes(executed, held) {
  if (!executed || !held) return false;
  const a = String(executed.action || "ask:" + executed.ask).toLowerCase(), b = String(held.action || "ask:" + held.ask).toLowerCase();
  if (a !== b) return false;
  const x = shapesOf(executed, a), y = shapesOf(held, b);
  if (!y.size) return !x.size && b !== "create";
  for (const n of y) if (!x.has(n)) return false;
  return true;
}
/** the held requests of earlier turns after a new message: [{turn, index, reading, state}] with state "held" | "done anyway" | "superseded";
 *  executedNow: the readings executed by the new message. Only the held ones can change, to "superseded". */
export function updatePending(pending, executedNow) {
  return pending.map((p) => (p.state === "held" && executedNow.some((e) => supersedes(e, p.reading)) ? Object.assign({}, p, { state: "superseded" }) : p));
}
