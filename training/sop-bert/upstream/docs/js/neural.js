/*NEURAL-START*/
const NeuralKit = (function () {
'use strict';
const K = SOPKit;

/* ---------------------------------------------------------------------
   Hypotheses and examples per legend value. A plugin that adds an
   action or a question type adds a line here; the model needs no change.
   --------------------------------------------------------------------- */
const KIND = {
  command: ['This asks the editor to change the diagram.', ['draw a red circle', 'delete Start', 'connect A to B']],
  question: ['This asks a question about the diagram.', ['how many circles are there?', 'what is connected to Start?', 'where is Done?']],
  fact: ['This states what a named shape is like or where it is.', ['Start is red', 'Done is above Check', 'Process is a square']],
  rule: ['This sets a default for shapes created later.', ['from now on circles are orange', 'new squares should be large', 'by default make shapes blue']]
};
const ACTION = {
  create: ['The user wants to create a new shape.', ['draw a blue circle', 'add a box named Log', 'I need a small triangle']],
  delete: ['The user wants to delete a shape.', ['delete Start', 'remove the red circle', 'get rid of Check']],
  move: ['The user wants to move a shape somewhere else.', ['move Start below Done', 'shift A to the left', 'put Check next to Process']],
  set: ['The user wants to change the color, outline or kind of a shape.', ['make Start red', 'paint Done green', 'turn A into a square']],
  resize: ['The user wants to make a shape bigger or smaller.', ['make Done bigger', 'shrink Start', 'double the size of A']],
  rename: ['The user wants to give a shape a new name.', ['rename Check to Decision', 'call circle1 Hub', 'change the name of A to B']],
  label: ['The user wants to write a text label on a shape.', ['label Start "begin"', 'write "hello" on A', 'add the text "ok" to Check']],
  duplicate: ['The user wants to copy a shape.', ['duplicate Start', 'make two copies of A', 'clone Check']],
  swap: ['The user wants to swap the positions of two shapes.', ['swap A and B', 'exchange Start and Done']],
  connect: ['The user wants to connect shapes with an arrow or a line.', ['connect Start to Done', 'draw an arrow from A to B', 'link Check with Process']],
  disconnect: ['The user wants to remove a connection between shapes.', ['disconnect A from B', 'remove the arrow between Start and Done', 'cut the link from A to B']],
  align: ['The user wants to align shapes in a straight line.', ['align A, B and C vertically', 'line up the circles']],
  distribute: ['The user wants to space shapes evenly.', ['distribute the circles evenly', 'space the boxes out horizontally']],
  toFront: ['The user wants to bring a shape to the front.', ['bring Start to the front', 'move A on top of the others']],
  toBack: ['The user wants to send a shape to the back.', ['send Done to the back', 'put A behind the others']],
  arrange: ['The user wants to arrange shapes in a layout.', ['arrange everything in a grid', 'tidy up the diagram', 'put all shapes in a circle']],
  undo: ['The user wants to undo the last change.', ['undo', 'take that back', 'revert the last step']],
  redo: ['The user wants to redo a change that was undone.', ['redo', 'do that again']],
  forget: ['The user wants to remove the default rules.', ['forget the rules', 'clear all defaults']]
};
const ASK = {
  count: ['The user wants to know how many shapes there are.', ['how many circles are there?', 'count the red shapes']],
  list: ['The user wants a list of shapes.', ['which shapes are blue?', 'list all squares', 'what is above Start?']],
  exists: ['The user wants to know whether such a shape exists.', ['is there a red circle?', 'are there any squares?']],
  property: ['The user wants to know a property of a shape, such as its color, size or position.', ['what color is Start?', 'where is Done?', 'how big is A?']],
  check: ['The user wants to know whether a statement about a shape is true.', ['is A red?', 'is Start left of Done?', 'is A bigger than B?']],
  describe: ['The user wants a description of the diagram or of a shape.', ['describe the diagram', 'what is Start?', "what's on the canvas?"]],
  neighbors: ['The user wants to know what a shape is connected to.', ['what is connected to Start?', 'what does A link to?']],
  connected: ['The user wants to know whether two shapes are directly connected.', ['are A and B connected?', 'is Start linked to Done?']],
  degree: ['The user wants to know how many connections a shape has.', ['how many connections does A have?']],
  nearest: ['The user wants the shape closest to or farthest from another shape.', ['what is closest to Start?', 'which circle is nearest to A?']],
  extreme: ['The user wants the biggest, smallest, leftmost or most connected shape.', ['which shape is the biggest?', 'which shape has the most connections?']],
  path: ['The user wants to know whether there is a path between two shapes.', ['is there a path from A to B?', 'can I get from Start to Done?']],
  reachable: ['The user wants to know what can be reached from a shape.', ['what can be reached from A?', 'what comes after Start?']],
  cycle: ['The user wants to know whether the arrows form a cycle.', ['are there any cycles?', 'is there a loop?']],
  rules: ['The user wants to know which default rules are active.', ['what rules are active?', 'list the defaults']]
};

/* Which legend questions each kind of sentence answers (its frame). */
const FRAMES = {
  command: { create: ['count', 'shape', 'color', 'size', 'outline', 'name', 'label', 'position', 'anchor'], delete: ['target'], move: ['target', 'position', 'anchor', 'direction', 'distance'], set: ['target', 'color', 'shape', 'outline', 'label', 'size'], resize: ['target', 'size'], rename: ['target', 'name'], label: ['target', 'label'], duplicate: ['target', 'count', 'name'], swap: ['target'], connect: ['from', 'to', 'label', 'style', 'arrow', 'color', 'pairing'], distribute: ['target', 'axis'], toFront: ['target'], toBack: ['target'], disconnect: ['from', 'to'], align: ['target', 'axis'], arrange: ['target', 'layout'], undo: [], redo: [], forget: [] },
  question: { count: ['shape', 'color', 'notColor', 'size', 'position', 'anchor', 'linked'], list: ['shape', 'color', 'notColor', 'size', 'position', 'anchor', 'linked'], exists: ['shape', 'color', 'notColor', 'size', 'position', 'anchor'], property: ['target', 'property'], check: ['target', 'color', 'shape', 'size', 'position', 'anchor', 'comparison'], describe: ['target'], neighbors: ['target'], connected: ['target', 'anchor'], degree: ['target'], nearest: ['anchor', 'shape', 'color', 'superlative'], extreme: ['shape', 'color', 'superlative'], path: ['from', 'to'], reachable: ['from'], cycle: [], rules: [] },
  fact: ['target', 'color', 'shape', 'size', 'outline', 'label', 'position', 'anchor', 'linked'],
  rule: ['shape', 'color', 'size', 'outline']
};
/* Question wording, when the legend's generic wording is ambiguous for this act. */
const WORDING = {
  _: { notColor: 'Which colour must the shapes not have?', pairing: 'Are they connected in a chain, each to the next, or all to each other?', target: 'Which shape?', shape: 'What kind of shape?', color: 'What color?', size: 'How big?', anchor: 'Relative to which shape?', position: 'Where?', name: 'What is it called?', label: 'What text?', count: 'How many?', distance: 'How far?', direction: 'In which direction?', linked: 'Connected to which shape?', property: 'Which property is asked about?', superlative: 'Which extreme?', comparison: 'Bigger or smaller?' },
  create: { name: 'What is the new shape named?', label: 'What text is written on the new shape?', count: 'How many shapes are created?', anchor: 'Next to which existing shape is it placed?', position: 'Where is the new shape placed?' },
  rename: { target: 'Which shape gets a new name?', name: 'What is the new name?' },
  label: { target: 'Which shape gets the label?', label: 'What text should be written?' },
  move: { target: 'Which shape moves?', position: 'Where does it move to?', anchor: 'Next to which shape does it move?' },
  set: { target: 'Which shape changes?', color: 'Which new color?', shape: 'Which new shape?' },
  resize: { target: 'Which shape changes size?' },
  connect: { from: 'Where does the connection start?', to: 'Where does the connection end?', label: 'What text is on the connection?', style: 'Is the line dashed, dotted or solid?', color: 'What color is the connection?' },
  disconnect: { from: 'Where does the removed connection start?', to: 'Where does the removed connection end?' },
  path: { from: 'Where does the path start?', to: 'Where does the path end?' },
  reachable: { from: 'Starting from which shape?' },
  property: { target: 'Which shape is asked about?' },
  nearest: { anchor: 'Closest to which shape?' },
  connected: { target: 'Which is the first shape?', anchor: 'Which is the second shape?' }
};

/* ---------------- span normalisation (span → legend answer) ---------------- */
const camel = v => v.replace(/([A-Z])/g, ' $1').toLowerCase();
const clean = s => ' ' + String(s).toLowerCase().replace(/[^a-z0-9'-]+/g, ' ').replace(/\s+/g, ' ') + ' ';
function cueFind(span, values) {
  const s = clean(span); let best = null, bl = 0;
  for (const [v, cues] of Object.entries(values || {})) for (const c of [camel(v), v.toLowerCase()].concat(cues || [])) {
    const cc = ' ' + c.toLowerCase() + ' ';
    if (c && s.includes(cc) && cc.length > bl) { best = v; bl = cc.length; }
  }
  return best;
}
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twice: 2, couple: 2, pair: 2 };
function numFind(span) { const m = String(span).match(/\d+(?:\.\d+)?/); if (m) return +m[0]; for (const w of clean(span).trim().split(' ')) if (w in NUMW) return NUMW[w]; return null; }
const ARTICLES = new Set(['a', 'an', 'the', 'it', 'its', 'and', 'to', 'of', 'with', 'named', 'called', 'new', 'shape']);

function cosine(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

/* =====================================================================
   The neural formalizer. `models` is injected so the same code runs in
   the browser (Transformers.js) and in tests (mocks).
   Strategy 'finetuned' (the demo's only one), with SOP-BERT, our joint model (training/neural/finetune_roles.py; makeReader below). It
   does not call the Rules reader at all (owner, 2026-11-02): formalizeJoint below
     1. cuts the message: the units given by the caller (opts.units: the demo's shared cut), else the model's own span head (models.cut);
     2. reads all the units in ONE batched call: the act, the value of every legend key with values (a class head each), a B / I / O tag
        per word for the keys whose answer is written (names, a new name, a label, a number), and per name-role (target, from, to,
        anchor: reader.ref_keys) WHO fills it (head fill:<key>: none / written / context / description) and the description's own keys
        (heads desc:<key>: quantifier, color, notColor, shape, recency):
          models.read(text)  → {words, acts, classes, tags, spans}   (makeReader)
          models.reader      → the head layout (config.json "reader": acts, tags, classes, act_keys, ref_keys, desc_keys, number_words)
     3. assembles the wires by the legend (deterministic): the kind follows from the act (an ACTION -> command, an ASK -> question, else
        fact or rule); the keys read for an act are the keys its requests have in the training gold (reader.act_keys); a name-role read as
        "written" takes the tagged words (a name created earlier in the message -> a reference to that wire), "description" becomes a
        `mention` wire with the desc:<key> values (resolved by the engine, as the Rules and VSS mentions), "context" takes the context;
     4. applies the context rule every reader shares after each request (NEXT_CONTEXT, a copy of docs/js/vss-composer.js nextContext:
        "it" = the last shape created or named; opts.update replaces it, e.g. by the scorer's rule).
   The act "none" (top-1) means the unit is not a request ("Thanks", "I run a small bakery"): no wire and no question come from it; it is
   listed in the notes as "Ignored (not a request)".
   Earlier pair (until the joint model is published): our act classifier (training/neural/finetune.py) + extractive QA for the roles:
     models.act(text)                  → [{label, score}, ...]  (every class, best first; text-classification)
     models.qa(question, context)      → {answer, score}
   Baselines, kept for the headless comparison (training/laptop/neural_score.mjs ZS=deberta|distilbert|embed), not offered in the demo:
     'zeroshot': models.classify(text, hypotheses) → {labels, scores}   (zero-shot NLI: the kind, then the action or ask)
     'embed':    models.embed(texts)               → number[][]          (similarity to the examples above)
   and answer the roles with extractive QA (models.qa).
   ===================================================================== */
let ACTIVE = null;   // the models last given to setModels (NeuralKit.cut / canCut use them)
/** the context carried from one request to the next, the rule every reader shares: a copy of docs/js/vss-composer.js nextContext (that file
    is an ES module, this one a classic script); training/laptop/neural_score.mjs passes the original as opts.update */
function NEXT_CONTEXT(c, main) {
  if (!main || !main.args) return;
  if (main.args.action === "create") { if (main.args.name != null && !main.args.count) c.refs.set(String(main.args.name).toLowerCase(), { ref: main.id }); c.last = [{ ref: main.id }]; }
  else if (main.args.target != null && !Array.isArray(main.args.target)) c.last = [main.args.target];
  else if (main.args.action === "connect" && main.args.to != null && !Array.isArray(main.args.to)) c.last = [main.args.to];
  if (main.args.action === "rename" && main.args.name) c.names = c.names.concat([String(main.args.name)]);
}
const cutOf = async (m, text) => { if (!m || !m.cut) throw new Error('The loaded neural model has no span head (cut).'); return (await m.cut(text)).map(({ c0, c1 }) => ({ c0, c1 })); };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const KIND_OF = act => own(ACTION, act) ? 'command' : own(ASK, act) ? 'question' : act === 'fact' || act === 'rule' || act === 'none' ? act : null;
function create(engine, rulesFormalize) {
  const L = engine.legend;
  const st = { models: null, strategy: 'finetuned', protoCache: new Map(), calls: 0 };

  /** finetuned: the act of a request -> {kind: {value, top}, act: {value, top} | null} (the shapes of the zero-shot steps) */
  async function classifyAct(text) { const r = await st.models.act(text); st.calls++; return actFrom(r); }
  /** the act classes, best first ([{label, score}]) -> the same shapes */
  function actFrom(ranked) {
    const known = act => { const k = KIND_OF(act), key = k === 'command' ? 'action' : k === 'question' ? 'ask' : null; return k && (!key || !L.get(key) || !L.get(key).values || act in L.get(key).values); };
    const all = ranked.filter(r => known(r.label));
    if (!all.length) throw new K.SOPError('The act classifier returned no act of this legend.');
    const z = all.reduce((a, r) => a + r.score, 0) || 1, kp = {};
    for (const r of all) { const k = KIND_OF(r.label); kp[k] = (kp[k] || 0) + r.score / z; }
    const kind = Object.entries(kp).sort((a, b) => b[1] - a[1]), value = all[0].label, type = KIND_OF(value);
    return {
      kind: { value: type, top: kind.slice(0, 3) },
      act: type === 'command' || type === 'question' ? { value, top: all.slice(0, 3).map(r => [r.label, r.score / z]) } : null
    };
  }

  async function classify(key, text, table) {
    const values = Object.keys(table).filter(v => !L.get(key) || !L.get(key).values || v in L.get(key).values);
    if (st.strategy === 'embed') {
      let proto = st.protoCache.get(key);
      if (!proto) {
        const items = []; values.forEach(v => { items.push([v, table[v][0]]); table[v][1].forEach(e => items.push([v, e])); });
        const vecs = await st.models.embed(items.map(i => i[1])); st.calls++;
        proto = items.map((it, i) => ({ v: it[0], vec: vecs[i] })); st.protoCache.set(key, proto);
      }
      const [q] = await st.models.embed([text]); st.calls++;
      const best = {}; for (const p of proto) { const c = cosine(q, p.vec); if (!(p.v in best) || c > best[p.v]) best[p.v] = c; }
      const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
      const ex = ranked.map(r => Math.exp(r[1] * 20)), z = ex.reduce((a, b) => a + b, 0);
      return { value: ranked[0][0], top: ranked.slice(0, 3).map((r, i) => [r[0], ex[i] / z]) };
    }
    const hyps = values.map(v => table[v][0]);
    const r = await st.models.classify(text, hyps); st.calls += hyps.length;
    const top = r.labels.slice(0, 3).map((h, i) => [values[hyps.indexOf(h)], r.scores[i]]);
    return { value: top[0][0], top };
  }

  async function answer(key, act, src, ruleNode, names) {
    const q = (WORDING[act] && WORDING[act][key]) || WORDING._[key] || (L.get(key) && L.get(key).ask) || key + '?';
    const r = await st.models.qa(q, src); st.calls++;
    const span = (r && r.answer || '').trim(), score = r ? r.score : 0;
    const lq = L.get(key), kind = lq ? lq.kind : 'text';
    const out = { q, span, score, value: null, source: 'neural' };
    if (!span || score < 0.02) return out;
    if (kind === 'enum') out.value = cueFind(span, lq.values);
    if (key === 'notColor' && !/\b(?:not|non-?)\s*\w/i.test(src)) out.value = null;   /* a negated colour needs a negation in the clause */
    else if (kind === 'number') { const n = numFind(span); if (n != null && (key !== 'count' || n > 1)) out.value = n; }
    else if (kind === 'name') {
      const tok = (span.replace(/["“”']/g, ' ').match(/[A-Za-z_][\w-]*/g) || []).find(w => !ARTICLES.has(w.toLowerCase()) && !L.lexicon('color').has(w.toLowerCase()) && !L.lexicon('shape').has(w.toLowerCase()) && !L.lexicon('size').has(w.toLowerCase()));
      if (tok && score > 0.15 && (act !== 'create' || /\b(named|called|name)\b/i.test(src))) out.value = tok;
    } else if (kind === 'text') {
      const quoted = [...src.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      const hit = quoted.find(qs => qs.includes(span.replace(/^"|"$/g, '')) || span.includes(qs));
      if (hit != null) out.value = hit; else if (score > 0.5 && !quoted.length && /\b(label|text|write|say|says|saying|title)/i.test(src)) out.value = span.replace(/^["']|["']$/g, '');
    } else if (kind === 'names') {
      const found = [];
      for (const w of span.match(/[A-Za-z_][\w-]*/g) || []) { if (w === 'a' || w === 'I') continue; const hit = names.get(w.toLowerCase()); if (hit != null && !found.some(f => f === hit)) found.push(hit); }
      if (found.length) out.value = found.length === 1 ? found[0] : found;
      else if (ruleNode && ruleNode.args[key] != null && /\b(it|its|them|they|this|that|the|all|every|each|everything)\b/i.test(span)) { out.value = ruleNode.args[key]; out.source = 'rules (reference)'; }
    }
    return out;
  }

  /** joint model: the answer to one legend key from one read(), from its class head or its word tags -> {q, span, score, value, source}
      (the shape answer() returns); names: lower-cased name -> the name, or the reference to the wire that created it in this message */
  function role(key, act, R, names) {
    const q = (WORDING[act] && WORDING[act][key]) || WORDING._[key] || (L.get(key) && L.get(key).ask) || key + '?';
    const lq = L.get(key), kind = lq ? lq.kind : null;
    if (R.classes[key]) {   // a class head: none or a value of the key
      const c = R.classes[key], out = { q, span: c.value || '', score: c.score, value: null, source: 'neural (class)' };
      if (c.value && lq && (!lq.values || c.value in lq.values)) out.value = c.value;
      return out;
    }
    const sp = R.spans[key] || [];
    const out = { q, span: sp.map(s => s.text).join(' | '), score: sp.length ? Math.min(...sp.map(s => s.score)) : 0, value: null, source: 'neural' };
    if (kind === 'names') {
      const found = [];
      for (const s of sp) { const hit = names.get(s.text.toLowerCase()); const v = hit != null ? hit : s.text; if (!found.some(f => f === v)) found.push(v); }
      if (found.length) out.value = found.length === 1 ? found[0] : found;
    } else if (!sp.length) return out;
    else if (kind === 'name' || kind === 'text') out.value = sp[0].text;
    else if (kind === 'number') {
      const t = sp[0].text, d = t.match(/\d+(?:\.\d+)?/), w = (st.models.reader.number_words || {})[t.toLowerCase()];
      const n = d ? +d[0] : w != null ? +w : null;
      if (n != null && (key !== 'count' || n > 1)) out.value = n;
    }
    return out;
  }

  /** SOP-BERT, one name-role of one read() -> {q, span, score, value, source, fill} (the shape answer() returns). c: the context
      ({names, last, refs}); mention(args) adds a mention wire and returns the reference to it */
  function jointRole(key, act, R, c, mention) {
    const q = (WORDING[act] && WORDING[act][key]) || WORDING._[key] || (L.get(key) && L.get(key).ask) || key + '?';
    const f = R.classes['fill:' + key], fill = f ? f.value : null;
    if (fill === 'context') {   // a pronoun or a vague reference: the shared context rule's last shape
      const v = c.last.length === 1 ? c.last[0] : c.last.length ? c.last.slice() : null;
      return { q, span: '', score: f.score, value: v, source: 'context (last shape created or named)', fill };
    }
    if (fill === 'description') {   // the description's own keys -> a mention wire
      const a = {};
      for (const k of st.models.reader.desc_keys || []) {
        const d = R.classes['desc:' + k], lq = L.get(k);
        if (d && d.value != null && (!lq || !lq.values || d.value in lq.values)) a[k] = d.value;
      }
      const sc = Math.min(f.score, ...Object.keys(a).map(k => R.classes['desc:' + k].score));
      return { q, span: Object.entries(a).map(([k, v]) => `${k}=${v}`).join(', ') || '(any shape)', score: sc, value: mention(a), source: 'neural (description)', fill };
    }
    const names = new Map(c.names.map(n => [String(n).toLowerCase(), n]));
    for (const [n, r] of c.refs) names.set(n, r);
    return Object.assign(role(key, act, R, names), f ? { fill: fill || 'none' } : {});
  }

  /** SOP-BERT: the whole message, with no call to the Rules reader (see the head of this section) */
  async function formalizeJoint(input, ctx, opts) {
    const t0 = Date.now(); st.calls = 0;
    const text = String(input), update = (opts && opts.update) || NEXT_CONTEXT;
    const c = { names: (ctx.names || []).slice(), last: (ctx.last || []).slice(), refs: new Map() };
    const given = opts && Array.isArray(opts.units) ? opts.units : null;
    let units, cutBy;
    if (given) { units = given; cutBy = 'given'; }
    else if (st.models.cut) { units = await st.models.cut(text); st.calls++; cutBy = 'model'; }
    else { units = [{ c0: 0, c1: text.length }]; cutBy = 'whole message'; }   // a joint model without a span head and no cut given
    const segs = units.map(u => ({ c0: u.c0, c1: u.c1, src: text.slice(u.c0, u.c1).trim() })).filter(g => g.src);
    const reads = segs.length ? (st.models.readMany ? await st.models.readMany(segs.map(g => g.src)) : await Promise.all(segs.map(g => st.models.read(g.src)))) : [];
    if (segs.length) st.calls += st.models.readMany ? 1 : segs.length;
    const nodes = [], analyses = [], notRequest = [], notes = []; let n = 0, m = 0;
    segs.forEach((seg, si) => {
      const R = reads[si], id = 'n' + (++n), a = { id, src: seg.src, rules: null, keys: {} };
      const cl = actFrom(R.acts); a.kind = cl.kind; if (cl.act) a.act = cl.act;
      const type = a.kind.value, act = a.act ? a.act.value : null, actKey = a.act ? (type === 'command' ? 'action' : 'ask') : null;
      if (type === 'none') { notRequest.push(seg.src); analyses.push(a); return; }
      const args = {}; if (actKey) args[actKey] = act;
      const mentions = [], mention = ma => { const mid = 'm' + (++m); mentions.push({ id: mid, type: 'mention', args: ma }); return { ref: mid }; };
      for (const k of st.models.reader.act_keys[act || type] || []) {
        const r = jointRole(k, act || type, R, c, mention); a.keys[k] = r;
        if (r.value != null) args[k] = r.value;
      }
      if (args.notColor && args.color === args.notColor) delete args.color;
      if (args.position && !['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(args.position) && args.anchor == null) delete args.position;
      if (args.anchor != null && !args.position && !['nearest', 'connected', 'check'].includes(act)) delete args.anchor;
      const used = new Set(); for (const v of Object.values(args)) [].concat(v).forEach(x => { if (K.isRef(x)) used.add(x.ref); });
      const node = { id, type, args };
      Object.defineProperty(node, 'span', { value: [seg.c0, seg.c1], enumerable: false, configurable: true });
      nodes.push(...mentions.filter(x => used.has(x.id)), node); analyses.push(a);
      update(c, node);
    });
    if (notRequest.length) notes.push('Ignored (not a request): ' + notRequest.map(z => `“${z}”`).join(', '));
    return { nodes, notes, rulesNodes: [], analyses, cutBy, ms: Date.now() - t0, calls: st.calls };
  }

  async function formalize(input, ctx, opts) {
    if (!st.models) throw new K.SOPError('The neural models are not loaded yet. Open the Neural tab and load them.');
    if (st.strategy === 'finetuned' && st.models.read) return formalizeJoint(input, ctx || {}, opts);   // SOP-BERT: no Rules reader
    // the earlier pair (act classifier + extractive QA) and the baselines: the Rules reader's cut and references, until the pair is removed
    const t0 = Date.now(); st.calls = 0;
    const rules = rulesFormalize(input, ctx);
    const names = new Map((ctx.names || []).map(n => [n.toLowerCase(), n]));
    const mentionById = new Map(rules.nodes.filter(n => n.type === 'mention').map(n => [n.id, n]));
    const nodes = [], analyses = [], used = new Set(), notRequest = [];
    const taken = new Set(rules.nodes.map(n => n.id)); let k = 0;
    // the units to read: opts.units ([{c0, c1}] character offsets into input, given by the caller) when given, else the rules' segments. A
    // given unit takes the rules' reading of the same words as its reference source (ruleNode: "it" -> Cart) when a rules segment shares most of its words.
    let segs = rules.segments, cutBy = 'rules';
    const given = opts && Array.isArray(opts.units) ? opts.units : null;
    if (given) {
      cutBy = 'given';
      const toks = t => new Set(wordsOf(t).map(w => w.w.toLowerCase()).filter(w => /[\p{L}\p{N}]/u.test(w))), usedSeg = new Set();
      segs = given.map(u => String(input).slice(u.c0, u.c1).trim()).filter(Boolean).map(src => {
        const ws = toks(src); let best = null, bs = 0;
        for (const sg of rules.segments) { if (!sg.id || usedSeg.has(sg)) continue; const ov = [...toks(sg.src)].filter(w => ws.has(w)).length / Math.max(ws.size, 1); if (ov > bs) { bs = ov; best = sg; } }
        if (best && bs >= 0.5) { usedSeg.add(best); return { src, id: best.id }; }
        return { src, id: null };
      });
    }
    for (const seg of segs) {
      const rn = seg.id ? rules.nodes.find(n => n.id === seg.id) : { id: null, type: null, args: {}, src: seg.src };
      if (!rn.id) { do { rn.id = 'n' + (++k); } while (taken.has(rn.id)); taken.add(rn.id); }
      const a = { id: rn.id, src: seg.src, rules: seg.id ? rn : null, keys: {} };
      let type, act = null, actKey = null;
      if (st.strategy === 'finetuned') {
        const c = await classifyAct(seg.src); a.kind = c.kind; if (c.act) a.act = c.act;
        type = a.kind.value; if (a.act) { act = a.act.value; actKey = type === 'command' ? 'action' : 'ask'; }
      } else {
        a.kind = await classify('wire', seg.src, KIND); type = a.kind.value;
        if (type === 'command') { actKey = 'action'; a.act = await classify('action', seg.src, ACTION); act = a.act.value; }
        else if (type === 'question') { actKey = 'ask'; a.act = await classify('ask', seg.src, ASK); act = a.act.value; }
      }
      const frame = type === 'command' ? FRAMES.command[act] : type === 'question' ? FRAMES.question[act] : FRAMES[type];
      const args = {}; if (actKey) args[actKey] = act;
      for (const k of frame || []) {
        const r = await answer(k, act || type, seg.src, a.rules, names); a.keys[k] = r;
        if (r.value != null) args[k] = r.value;
      }
      if (args.notColor && args.color === args.notColor) delete args.color;
      if (args.position && !['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(args.position) && args.anchor == null) delete args.position;
      if (args.anchor != null && !args.position && !['nearest', 'connected', 'check'].includes(act)) delete args.anchor;
      const id = rn.id;
      const node = { id, type, args };
      for (const v of Object.values(args)) [].concat(v).forEach(x => { if (K.isRef(x) && mentionById.has(x.ref)) used.add(x.ref); });
      for (const m of rules.nodes) if (m.type === 'mention' && used.has(m.id) && !nodes.includes(m)) nodes.push(m);
      nodes.push(node); analyses.push(a);
      if (act === 'create' && args.name != null && !args.count) names.set(String(args.name).toLowerCase(), { ref: id });
      if (act === 'rename' && args.name != null) names.set(String(args.name).toLowerCase(), String(args.name));
    }
    const notes = rules.notes.filter(n => !notRequest.some(src => n === `I couldn't find an action in "${src}".`));   // the rules' question about a unit the model reads as not a request
    if (notRequest.length) notes.push('Ignored (not a request): ' + notRequest.map(z => `“${z}”`).join(', '));
    return { nodes, notes, rulesNodes: rules.nodes, analyses, cutBy, ms: Date.now() - t0, calls: st.calls };
  }

  /* ---------------- benchmark: hand-labelled sentences ---------------- */
  const BENCH = [
    ['Draw a small red circle named Ball', 'command', { action: 'create', shape: 'circle', size: 'small', color: 'red', name: 'Ball' }],
    ["I'd like a big green box under Process", 'command', { action: 'create', shape: 'rectangle', size: 'large', color: 'green', position: 'below', anchor: 'Process' }],
    ['Add three yellow triangles', 'command', { action: 'create', count: 3, shape: 'triangle', color: 'yellow' }],
    ['Get rid of Check', 'command', { action: 'delete', target: 'Check' }],
    ['Erase Done', 'command', { action: 'delete', target: 'Done' }],
    ['Put Check under Done', 'command', { action: 'move', target: 'Check', position: 'below', anchor: 'Done' }],
    ['Shift Process to the left by 40 pixels', 'command', { action: 'move', target: 'Process', direction: 'left', distance: 40 }],
    ['Colour Start orange', 'command', { action: 'set', target: 'Start', color: 'orange' }],
    ['Paint Process yellow', 'command', { action: 'set', target: 'Process', color: 'yellow' }],
    ['Can you make Done a bit larger', 'command', { action: 'resize', target: 'Done' }],
    ['Call Check Decision', 'command', { action: 'rename', target: 'Check', name: 'Decision' }],
    ['Write "begin" on Start', 'command', { action: 'label', target: 'Start', label: 'begin' }],
    ['Hook Start up to Done with a dashed arrow', 'command', { action: 'connect', from: 'Start', to: 'Done', style: 'dashed' }],
    ['Draw an arrow from Done to Start', 'command', { action: 'connect', from: 'Done', to: 'Start' }],
    ['Cut the link between Process and Check', 'command', { action: 'disconnect', from: 'Process', to: 'Check' }],
    ['Line up Start, Process and Check horizontally', 'command', { action: 'align', target: ['Start', 'Process', 'Check'], axis: 'horizontal' }],
    ['Lay everything out as a grid', 'command', { action: 'arrange', layout: 'grid' }],
    ['Take that back', 'command', { action: 'undo' }],
    ['How many circles do we have?', 'question', { ask: 'count', shape: 'circle' }],
    ['Is there any blue square?', 'question', { ask: 'exists', shape: 'square', color: 'blue' }],
    ['Where is Done?', 'question', { ask: 'property', target: 'Done', property: 'position' }],
    ['What colour is Check?', 'question', { ask: 'property', target: 'Check', property: 'color' }],
    ['Which things link to Process?', 'question', { ask: 'neighbors', target: 'Process' }],
    ['Can I get from Start to Done?', 'question', { ask: 'path', from: 'Start', to: 'Done' }],
    ['What lies downstream of Process?', 'question', { ask: 'reachable', from: 'Process' }],
    ['Does the graph contain a loop?', 'question', { ask: 'cycle' }],
    ['Which shape is the largest?', 'question', { ask: 'extreme', superlative: 'biggest' }],
    ["What's nearest to Start?", 'question', { ask: 'nearest', anchor: 'Start', superlative: 'closest' }],
    ['Is Check to the right of Process?', 'question', { ask: 'check', target: 'Check', position: 'rightOf', anchor: 'Process' }],
    ['From now on, squares should be gray', 'rule', { shape: 'square', color: 'gray' }],
    ['Done is red', 'fact', { target: 'Done', color: 'red' }]
  ];
  const norm = v => v == null ? '∅' : K.isRef(v) ? '$' + v.ref : Array.isArray(v) ? v.map(norm).join(',') : String(v).toLowerCase();
  function score(node, type, gold) {
    const keys = Object.keys(gold), per = {};
    let ok = !!node && node.type === type;
    for (const k of keys) { const got = node ? norm(node.args[k]) : '∅', want = norm(gold[k]); per[k] = { got, want, ok: got === want }; if (!per[k].ok) ok = false; }
    return { ok, per };
  }
  async function bench(onRow) {
    const names = ['Start', 'Process', 'Check', 'Done'], rows = [];
    for (const [text, type, gold] of BENCH) {
      const ctx = { names, last: [] };
      const r = rulesFormalize(text, ctx), rMain = r.nodes.filter(n => n.type !== 'mention').pop();
      const t0 = Date.now(); let nMain = null, err = null;
      try { const n = await formalize(text, ctx); nMain = n.nodes.filter(x => x.type !== 'mention').pop(); } catch (e) { err = e.message; }
      const row = { text, type, gold, rules: score(rMain, type, gold), neural: score(nMain, type, gold), rNode: rMain, nNode: nMain, ms: Date.now() - t0, err };
      rows.push(row); if (onRow) onRow(row, rows.length, BENCH.length);
    }
    const sum = side => { let keys = 0, kok = 0, wires = 0; rows.forEach(r => { if (r[side].ok) wires++; Object.values(r[side].per).forEach(p => { keys++; if (p.ok) kok++; }); }); return { wires, keys, kok, n: rows.length }; };
    return { rows, rules: sum('rules'), neural: sum('neural') };
  }

  return { formalize, bench, state: st, setModels(m) { st.models = m; ACTIVE = m; st.protoCache.clear(); },
    /** the BERT cut of a message (character offsets [{c0, c1}]) and whether the loaded model has the span head */
    cut: text => cutOf(st.models, text), canCut: () => !!(st.models && st.models.cut), setStrategy(s) { st.strategy = s; }, BENCH, FRAMES, WORDING };
}

/* ---------------- the joint model's decoding (browser and node) ---------------- */
/* Words: letter/digit runs and every other non-space character alone; training/neural/make_roles.py WORD_RE splits the same way, and the
   model was trained on the word pieces of these words (the tag of a word is read on its first piece). */
const WORD_RE = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;
const wordsOf = text => [...String(text).matchAll(WORD_RE)].map(m => ({ w: m[0], start: m.index, end: m.index + m[0].length }));
const softmax = a => { const m = Math.max(...a), e = a.map(x => Math.exp(x - m)), z = e.reduce((x, y) => x + y, 0); return e.map(x => x / z); };
/** T: the transformers.js module; tokenizer, model: AutoTokenizer and AutoModel of a joint model (config.json "reader").
    Returns the part of the `m` object create() takes: {read, act, reader}. read(text) runs the model once:
      acts: [{label, score}] best first · classes: {key: {value (null = none), score}} · tags: [tag per word] ·
      spans: {key: [{text, start, end, score}]} (text as written, start/end in characters; score = lowest tag probability) · words, ids */
function makeReader(T, tokenizer, model) {
  const R = model.config && model.config.reader;
  if (!R) throw new Error('This model has no "reader" in its config.json: not a joint model (training/neural/finetune_roles.py).');
  const nA = R.acts.length, nT = R.tags.length, maxlen = R.max_length || 128, offs = [];
  const cutLen = R.cut ? R.cut.max_length || 512 : 0;   // R.cut: the span head over the whole message (output cut_logits: O / B / I per word)
  let o = nA; for (const [, vals] of R.classes) { offs.push(o); o += vals.length; }
  const sp = tokenizer.encode('');   // [CLS] [SEP]
  if (sp.length !== 2) throw new Error(`The tokenizer adds ${sp.length} special tokens to a text; 2 ([CLS] [SEP]) are expected.`);
  function prep(text, limit) {
    const ws = wordsOf(text), ids = [sp[0]], first = new Map();
    for (let i = 0; i < ws.length && ids.length < limit - 1; i++) {   // truncation as in training: at most limit - 2 word pieces
      const p = tokenizer.encode(ws[i].w, { add_special_tokens: false });
      for (let j = 0; j < p.length && ids.length < limit - 1; j++) { if (j === 0) first.set(i, ids.length); ids.push(p[j]); }
    }
    ids.push(sp[1]);
    return { text: String(text), ws, ids, first };
  }
  /** one model call over a batch of prepared texts (padded; the attention mask hides the padding) */
  async function run(ps) {
    const B = ps.length, n = Math.max(...ps.map(p => p.ids.length));
    const ids = new BigInt64Array(B * n), mask = new BigInt64Array(B * n);
    ps.forEach((p, b) => p.ids.forEach((x, i) => { ids[b * n + i] = BigInt(x); mask[b * n + i] = 1n; }));
    return { out: await model({ input_ids: new T.Tensor('int64', ids, [B, n]), attention_mask: new T.Tensor('int64', mask, [B, n]) }), n };
  }
  function decodeOne(p, out, n, b) {
    const { ws, ids, first, text } = p, tl = out.token_logits.data, nTok = n;
    const sl = Array.from(out.seq_logits.data.slice(b * (out.seq_logits.dims[1]), (b + 1) * out.seq_logits.dims[1]));
    const pa = softmax(sl.slice(0, nA)), acts = R.acts.map((label, i) => ({ label, score: pa[i] })).sort((x, y) => y.score - x.score);
    const classes = {};
    R.classes.forEach(([k, vals], c) => { const q = softmax(sl.slice(offs[c], offs[c] + vals.length)); let bi = 0; q.forEach((x, i) => { if (x > q[bi]) bi = i; }); classes[k] = { value: bi ? vals[bi] : null, score: q[bi] }; });
    const tags = [], probs = [];
    for (let i = 0; i < ws.length; i++) {
      const t = first.get(i); if (t == null) { tags.push('O'); probs.push(1); continue; }
      const q = softmax(Array.from(tl.slice((b * nTok + t) * nT, (b * nTok + t + 1) * nT))); let bi = 0; q.forEach((x, k) => { if (x > q[bi]) bi = k; });
      tags.push(R.tags[bi]); probs.push(q[bi]);
    }
    const spans = {}; let cur = null;   // B starts a role; I continues the role of the same key just before it, else starts one
    tags.forEach((t, i) => {
      if (t === 'O') { cur = null; return; }
      const [pfx, k] = [t.slice(0, 1), t.slice(2)], list = spans[k] || (spans[k] = []), last = list[list.length - 1];
      if (pfx === 'I' && cur === k && last && last.j === i) { last.j = i + 1; last.p = Math.min(last.p, probs[i]); }
      else { list.push({ i, j: i + 1, p: probs[i] }); cur = k; }
    });
    for (const k of Object.keys(spans)) spans[k] = spans[k].map(s => ({ text: String(text).slice(ws[s.i].start, ws[s.j - 1].end), start: ws[s.i].start, end: ws[s.j - 1].end, score: s.p }));
    return { words: ws.map(w => w.w), ids, acts, classes, tags, spans };
  }
  /** readMany(texts): ONE model call for all the texts (the requests of one message) -> [read result] */
  async function readMany(texts) {
    if (!texts.length) return [];
    const ps = texts.map(t => prep(t, maxlen)), { out, n } = await run(ps);
    return ps.map((p, b) => decodeOne(p, out, n, b));
  }
  const read = async text => (await readMany([text]))[0];
  /** cut(text): the request spans of a whole message, from the span head: [{c0, c1, score}] character offsets into text (one model call);
      words beyond the first cut.max_length word pieces are outside every request */
  async function cut(text) {
    if (!cutLen) throw new Error('This model has no span head (config.json reader.cut): retrain with training/neural/finetune_roles.py.');
    const p = prep(text, cutLen), { out, n } = await run([p]), cl = out.cut_logits.data, spans = [];
    let cur = null;
    p.ws.forEach((w, i) => {
      const t = p.first.get(i); let tag = 'O', pr = 1;
      if (t != null) { const q = softmax(Array.from(cl.slice(t * 3, t * 3 + 3))); let bi = 0; q.forEach((x, k) => { if (x > q[bi]) bi = k; }); tag = 'OBI'[bi]; pr = q[bi]; }
      if (tag === 'O') { cur = null; return; }
      if (tag === 'I' && cur) { cur.c1 = w.end; cur.score = Math.min(cur.score, pr); }
      else { cur = { c0: w.start, c1: w.end, score: pr }; spans.push(cur); }
    });
    return spans;
  }
  return { read, readMany, act: async text => (await read(text)).acts, reader: R, ...(cutLen ? { cut } : {}) };
}

/* ---------------- Transformers.js loader (browser only) ---------------- */
/* The demo loads ONE neural model, ours (owner, 2026-11-02): the act classifier ACT_MODEL (fine-tuned by training/neural/finetune.py) and
   the extractive QA model QA_MODEL (the Xenova DistilBERT SQuAD files, hosted by us), both from docs/model/neural/<folder>/ (config.json,
   tokenizer.json, tokenizer_config.json, onnx/model_quantized.onnx, README.md). It loads by itself when the page opens, like VSS; there is
   nothing to choose. If the folders are not published (not in versions.json, or config.json missing), the demo says so; it has no fallback. */
const ACT_MODEL = 'act-distilbert';        // the act classifier the demo loads: 'act-distilbert' or 'act-deberta-xsmall' (set after the comparison)
const QA_MODEL = 'qa-distilbert-squad';
/* SOP-BERT, the joint model (training/neural/finetune_roles.py --name sop-bert: the cut, then act, values, names and descriptions in one
   batched call). When versions.json lists neural/sop-bert, the demo loads it alone; until then the pair above. */
const READER_MODEL = 'sop-bert';
/* model id (of the form <owner>/<name>, as transformers.js requires) -> folder under docs/model/neural/ */
const OURS = { 'ours/sop-bert': 'sop-bert', 'ours/act-distilbert': 'act-distilbert', 'ours/act-deberta-xsmall': 'act-deberta-xsmall', 'ours/qa-distilbert-squad': 'qa-distilbert-squad' };
const MODELS = {
  reader: 'ours/' + READER_MODEL, act: 'ours/' + ACT_MODEL, qa: 'ours/' + QA_MODEL,
  /* baselines of the headless comparison (training/laptop: neural_score.mjs, zs_check.mjs, zs_eval.mjs); the demo never loads them */
  zeroshot: { deberta: 'Xenova/nli-deberta-v3-xsmall', distilbert: 'Xenova/distilbert-base-uncased-mnli' },
  embed: 'Xenova/all-MiniLM-L6-v2',
  qaHF: 'Xenova/distilbert-base-cased-distilled-squad'
};
const NAMES = {
  'ours/sop-bert': 'SOP-BERT', 'ours/act-distilbert': 'DistilBERT act classifier', 'ours/act-deberta-xsmall': 'DeBERTa-v3 xsmall act classifier', 'ours/qa-distilbert-squad': 'DistilBERT SQuAD',
  'Xenova/nli-deberta-v3-xsmall': 'DeBERTa-v3 xsmall (zero-shot NLI)', 'Xenova/distilbert-base-uncased-mnli': 'DistilBERT MNLI (zero-shot NLI)', 'Xenova/all-MiniLM-L6-v2': 'MiniLM-L6', 'Xenova/distilbert-base-cased-distilled-squad': 'DistilBERT SQuAD'
};
/* what each model of ours is, in words (the act models' base model, data and held-out accuracy are read from their README.md: status()) */
const ABOUT = {
  'ours/sop-bert': 'DistilBERT fine-tuned on our requests — cuts the message, reads the action, the values, the names and the descriptions',
  'ours/act-distilbert': 'reads the act of one request (the action of a command, the ask of a question, or fact / rule); fine-tuned on our annotated requests',
  'ours/act-deberta-xsmall': 'reads the act of one request (the action of a command, the ask of a question, or fact / rule); fine-tuned on our annotated requests',
  'ours/qa-distilbert-squad': 'answers each question of the act’s frame with a span of the request; Xenova/distilbert-base-cased-distilled-squad (DistilBERT fine-tuned on SQuAD), hosted on this site'
};
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
/* The neural reader runs on the CPU (WASM), with the q8 files (onnx/model_quantized.onnx; see DTYPES). WebGPU is not offered: on a browser that
   exposes navigator.gpu without an adapter (owner, Linux) it failed with "no available backend found ... Failed to get GPU adapter",
   and transformers.js 3.8.1 cannot retry on WASM in the same page: src/backends/onnx.js keeps the first session promise
   (wasmInitPromise) and awaits it before every later session, so one failed WebGPU session fails every WASM session after it.
   device 'wasm' maps to the execution providers ['wasm'] only, so this path never touches WebGPU. */
const DTYPE = 'q8', HF = 'https://huggingface.co/', CACHE = 'transformers-cache';   // transformers.js 3.8.1: src/utils/hub.js getModelFile
/* The file type of each model: DTYPE unless listed here (e.g. 'fp32'). The file name, the cache check and the size follow it. */
const DTYPES = {};
/* Versions (owner's rule 2026-11-02: never use an older model after a new one is published).
   - Our models: the content version is in docs/model/versions.json ("files": "neural/<folder>"), the byte size of each file in its
     "sizes": "neural/<folder>" (both written by training/sketch/stamp_models.py). The id is requested from transformers.js as a model on the
     (never contacted) Hugging Face URL with the version as revision; the custom cache below maps that key to the real file URL
     docs/model/neural/<folder>/<file>?v=<version> (fetching it on a miss) and stores it under the versioned URL.
   - The Hugging Face baselines (headless comparison only) are pinned to a commit here; hashes of 2026-11-02, read from the API with WebFetch. */
const REVISIONS = {
  'Xenova/nli-deberta-v3-xsmall': '2a4f614a701367a02d51389039afc998faeda637',
  'Xenova/distilbert-base-uncased-mnli': 'fddd480db7392a87114a6813c6acb5ede13ff4ee',
  'Xenova/all-MiniLM-L6-v2': '751bff37182d3f1213fa05d7196b954e230abad9',
  'Xenova/distilbert-base-cased-distilled-squad': 'bdbb0a5e9c617c3c7ea9f3cbaf2be3ad871bcd7d'
};
/* docs/model/ as an absolute URL: this file is a classic script, so its own URL is read now, while it runs (browser only) */
const MODEL_ROOT = (() => { try { return new URL('../model/', document.currentScript.src).href; } catch (e) { return null; } })();
let NVERS = {}, NSIZES = {}, versError = null, versLoaded = null;   // from versions.json (loadVersions)
function loadVersions() {
  if (!MODEL_ROOT) return Promise.resolve();
  return versLoaded || (versLoaded = (async () => {
    try {
      const r = await fetch(MODEL_ROOT + 'versions.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); NVERS = j.files || {}; NSIZES = j.sizes || {};
    } catch (e) { versError = `${MODEL_ROOT}versions.json could not be read: ${e && e.message || e}`; versLoaded = null; }
  })());
}
const revOf = id => OURS[id] ? (NVERS['neural/' + OURS[id]] || 'unversioned') : REVISIONS[id] || 'main';
const keyOf = (id, f) => `${HF}${id}/resolve/${revOf(id)}/${f}`;   // the URL transformers.js requests and uses as Cache API key
/** the real URL of a file of one of our models, with its version */
const urlOf = (id, f) => `${MODEL_ROOT}neural/${OURS[id]}/${f}?v=${encodeURIComponent(revOf(id))}`;
/** the Cache API key an entry is stored under: the versioned real URL for ours (makeCache), keyOf for Hugging Face models */
const storeKey = (id, f) => OURS[id] && MODEL_ROOT ? urlOf(id, f) : keyOf(id, f);
const dtypeOf = id => DTYPES[id] || DTYPE;
const ONNX = { fp32: 'model.onnx', int8: 'model_int8.onnx', q8: 'model_quantized.onnx' };   // src/utils/dtypes.js DEFAULT_DTYPE_SUFFIX_MAPPING
const filesOf = id => ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/' + ONNX[dtypeOf(id)]];
/** the bytes the browser downloads for a model of ours (the files it loads), from versions.json "sizes"; null when unknown */
function bytesOf(id) {
  const sz = NSIZES['neural/' + OURS[id]]; if (!sz) return null;
  let t = 0; for (const f of filesOf(id)) { if (sz[f] == null) return null; t += sz[f]; }
  return t;
}
/** the models the demo loads: [the joint model] when versions.json lists it, else [act classifier, answer model] */
const modelsFor = () => NVERS['neural/' + READER_MODEL] ? [MODELS.reader] : [MODELS.act, MODELS.qa];
const BITS = { q8: '8-bit', int8: '8-bit', fp32: '32-bit' };
const dtypeText = () => { const [a, b] = modelsFor().map(dtypeOf); return b == null || a === b ? `${BITS[a]} files` : `classifier ${BITS[a]}, answers ${BITS[b]} files`; };
/** the exact URLs the browser fetches for the demo's models */
const urlsFor = () => modelsFor().flatMap(id => filesOf(id).map(f => urlOf(id, f)));
/** first lines of an act model's README.md (finetune.py writes it): base model, data, held-out act accuracy */
function readmeFacts(text) {
  const m = (re) => { const x = text.match(re); return x ? x[1] : null; };
  return { base: m(/Base model:\s*`([^`]+)`/), spans: m(/Data:\s*(\d+) request spans/), heldout: m(/Held-out act accuracy[^:]*:\s*(\d+(?:\.\d+)?)/) };
}
/** Are our models published on this site? {published, missing: [why per folder], error (versions.json unreadable), info: id -> {version, bytes, readme}}.
    Read once per page (the promise is kept); a failure to read versions.json is an error, not "not published". */
let statusP = null;
function status() {
  return statusP || (statusP = (async () => {
    await loadVersions();
    if (versError) { statusP = null; return { published: false, missing: [], error: versError, info: {} }; }
    const missing = [], info = {};
    for (const id of modelsFor()) {
      const folder = OURS[id], v = NVERS['neural/' + folder];
      if (!v) { missing.push(`docs/model/neural/${folder}/ (not in versions.json)`); continue; }
      try {
        const r = await fetch(urlOf(id, 'config.json'), { method: 'HEAD' });
        if (!r.ok) { missing.push(`docs/model/neural/${folder}/config.json (HTTP ${r.status})`); continue; }
      } catch (e) { statusP = null; return { published: false, missing: [], error: `${urlOf(id, 'config.json')}: ${e && e.message || e}`, info: {} }; }
      const sz = NSIZES['neural/' + folder] || {};
      info[id] = { version: v, bytes: bytesOf(id), readme: sz['README.md'] != null ? urlOf(id, 'README.md') : null, facts: null };
      if (id === modelsFor()[0] && info[id].readme) try { const r = await fetch(info[id].readme); if (r.ok) info[id].facts = readmeFacts(await r.text()); } catch (e) { /* facts stay unknown */ }
    }
    return { published: !missing.length, missing, error: null, info };
  })());
}
/** true when every file of the demo's models is already in this browser's transformers.js cache (nothing to download) */
async function cached() {
  try {
    await loadVersions();
    if (typeof caches === 'undefined' || !(await caches.has(CACHE))) return false;
    const c = await caches.open(CACHE);
    for (const id of modelsFor()) for (const f of filesOf(id)) if (!(await c.match(storeKey(id, f)))) return false;
    return true;
  } catch (e) { return false; }
}
/* The cache transformers.js uses (env.customCache): the Cache API 'transformers-cache', except that the keys of our own models
   (keyOf with an OURS id) are answered from the versioned real URL: docs/model/neural/<folder>/<file>?v=<version>. A hit is returned; a
   miss is fetched from that URL (HTTP-revalidated like any file, new URL per version) and stored under the versioned key. */
function makeCache() {
  const open = () => caches.open(CACHE);
  const real = key => {
    const m = key.startsWith(HF) && key.slice(HF.length).match(/^([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/);
    return m && OURS[m[1]] && MODEL_ROOT ? { url: `${MODEL_ROOT}neural/${OURS[m[1]]}/${m[3]}?v=${encodeURIComponent(decodeURIComponent(m[2]))}`, id: m[1] } : null;
  };
  const cache = {
    lastError: null,   // the last file of ours that could not be fetched (transformers.js swallows errors thrown by match)
    async match(key) {
      const r = real(key);
      try {
        const c = await open(), k = r ? r.url : key, hit = await c.match(k);
        if (hit || !r) return hit;
        const res = await fetch(r.url);
        if (!res.ok) { cache.lastError = `${r.url}: HTTP ${res.status}`; return undefined; }
        await c.put(k, res.clone()).catch(() => {});
        return res;
      } catch (e) { if (r) cache.lastError = `${r.url}: ${e && e.message || e}`; return undefined; }
    },
    async put(key, res) { if (real(key)) return; try { await (await open()).put(key, res); } catch (e) { /* quota: not cached */ } }
  };
  return cache;
}
/** delete the cache entries this demo no longer uses: other versions of our models, the act model not chosen, and the Hugging Face
    models earlier versions of the demo downloaded (the zero-shot classifiers, MiniLM, SQuAD) */
async function pruneStale() {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(CACHE))) return 0;
    const c = await caches.open(CACHE), cur = new Set(modelsFor().flatMap(id => filesOf(id).map(f => storeKey(id, f))));
    const prefixes = [`${MODEL_ROOT}neural/`, ...Object.keys(REVISIONS).map(id => `${HF}${id}/resolve/`)];
    let n = 0;
    for (const req of await c.keys()) if (!cur.has(req.url) && prefixes.some(p => req.url.startsWith(p))) { await c.delete(req); n++; }
    return n;
  } catch (e) { return 0; }
}
const looksNetwork = e => /failed to fetch|networkerror|load failed|network|dynamically imported module|importing a module script failed|err_|timeout|cors/i.test(String(e && e.message || e)) || (e && e.name === 'TypeError' && /fetch/i.test(String(e.message)));
/** load the demo's model(s) (status() must say published); the `m` object create() takes */
async function load(onProgress) {
  const s = await status();
  if (!s.published) throw Object.assign(new Error(s.error || 'The neural model is not published yet: ' + s.missing.join(', ')), { unpublished: !s.error, network: !!s.error });
  let T;
  try { T = await import(LIB); }
  catch (e) { throw Object.assign(new Error(`The transformers.js library could not be loaded: ${e && e.message || e}`), { url: LIB, network: true, cause: e }); }
  /* Every file comes through the custom cache (makeCache). Remote models are off, so a file of ours that cannot be fetched is an error and never
     a request to Hugging Face; local models must then be on (transformers.js refuses both off): on such a miss it tries the local path
     <localModelPath><id>/<file> once, on this site (a 404), then throws. */
  T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = MODEL_ROOT + 'neural/';
  if (typeof caches === 'undefined') throw new Error('This browser has no Cache API (needed to load the neural model from this site).');
  const cache = makeCache(); T.env.useBrowserCache = false; T.env.useCustomCache = true; T.env.customCache = cache;
  const open = new Set();   // files asked for and not finished: transformers.js loads them in parallel, so a failure names no single file
  const track = e => { if (e && e.name && e.file) { const u = OURS[e.name] ? urlOf(e.name, e.file) : keyOf(e.name, e.file); if (e.status === 'initiate') open.add(u); else if (e.status === 'done') open.delete(u); } if (onProgress) onProgress(e); };
  const build = async device => {
    if (modelsFor()[0] === MODELS.reader) {   // the joint model: tokenizer + model, decoded by makeReader
      const id = MODELS.reader, tokenizer = await T.AutoTokenizer.from_pretrained(id, { revision: revOf(id), progress_callback: track });
      const model = await T.AutoModel.from_pretrained(id, { device, dtype: dtypeOf(id), revision: revOf(id), progress_callback: track });
      const m = Object.assign({ device, dtype: dtypeOf(id), dtypeText: dtypeText(), qaModel: id, enumModel: id, actModel: id }, makeReader(T, tokenizer, model));
      open.clear();
      await m.read('draw a circle');   // the first inference: a device that fails here fails now, not on a message
      return m;
    }
    const make = (task, model) => T.pipeline(task, model, { device, dtype: dtypeOf(model), revision: revOf(model), progress_callback: track });
    const qa = await make('question-answering', MODELS.qa), clf = await make('text-classification', MODELS.act);
    const m = { device, dtype: [...new Set(modelsFor().map(dtypeOf))].join('+'), dtypeText: dtypeText(), qaModel: MODELS.qa, enumModel: MODELS.act, actModel: MODELS.act };
    m.qa = async (q, c) => { let r = await qa(q, c); if (Array.isArray(r)) r = r[0]; return r || { answer: '', score: 0 }; };
    m.act = async text => { const r = await clf(text, { top_k: null }); return Array.isArray(r[0]) ? r[0] : r; };   // top_k null: every class, best first
    open.clear();
    await m.qa('What is drawn?', 'A red circle is drawn.');           // the first inference: a device that fails here fails now, not on a message
    await m.act('draw a circle');
    return m;
  };
  try {
    const m = await build('wasm');
    pruneStale();   // older versions and models no longer used are of no use any more (not awaited)
    return m;
  } catch (e) {
    const msg = cache.lastError || String(e && e.message || e || 'unknown error');
    const pending = /https?:\/\//.test(msg) ? [] : [...open];
    throw Object.assign(new Error(msg), { url: pending.length ? pending.join(' ') : null, files: pending, network: looksNetwork(e), cause: e });
  }
}

return { NEXT_CONTEXT, cut: (text, ctx) => cutOf(ACTIVE, text), canCut: () => !!(ACTIVE && ACTIVE.cut), create, load, status, cached, modelsFor, urlsFor, bytesOf, revOf, dtypeOf, dtypeText, makeReader, wordsOf, KIND_OF, MODELS, OURS, NAMES, ABOUT, ACT_MODEL, QA_MODEL, READER_MODEL, DTYPE };
})();
if (typeof module !== 'undefined') module.exports = NeuralKit;
/*NEURAL-END*/
