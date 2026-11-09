/* Help answers: a help wire (question ask=help topic=… aspect=… about=…) + the legend -> the answer text and example sentences.
   Pure: no dependency on the page or the engine's classes. contextFromEngine() reads a live engine's public fields (its legend, plugins and
   handlers) into plain data; answer() only reads that data. Nothing is written per question: every answer is put together from the
   legend (questions, values, cue words, which plugin defines what), the capabilities (plugins, switched on or off), the prose and the
   example sentences of the help pages (docs/js/help.js: ACTIONS, ASKS, CAPS, TOPICS) and the template catalogue (docs/js/templates.js).
   So a new action, value, template or plugin is answered for as soon as it is in the legend; its help-page prose and examples, when
   written, are used too. Design: training/sketch/legend_ext/LEGEND_EXT.md section 4. Tests: training/sketch/test_help_answers.mjs.

   The wire: topic = an action value, a question (ask) value, a legend key, a value of any enum key (a colour, a shape kind, a template),
   a plugin name, or "general"; aspect = overview | how | can | values | example (default overview); about = the words of a help question
   that name nothing in the legend ("can I add images?" -> about="images").

   The words of the question (answer's third argument, the request's source text, and `about`) choose between the shape form and the
   arrow form of a topic that has both: a word for arrows (the cue words of the legend value kind=edge: arrows, lines, links, ...) puts the
   arrow form first ("how do I label an arrow?" -> labelling an arrow by its two ends; "how do I delete an arrow?" -> disconnect; "how do I
   make an arrow red?" -> changing an arrow); without one, a label answer covers shapes and then arrows. "label" among the words of a
   question about deleting or changing makes it a question about labels ("how do I delete an arrow's label?"). */
(function (root) {
'use strict';
const words = v => String(v).replace(/([A-Z])/g, ' $1').toLowerCase().trim();
const listing = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const exText = e => typeof e === 'string' ? e : e && e.pre && e.pre.length ? null : e && e.text;   /* an example that needs no earlier message */
const ASPECTS = ['overview', 'how', 'can', 'values', 'example'];
const SKIP_KEYS = new Set(['action', 'ask', 'topic', 'aspect', 'about']);   /* keys that are not details a person sets */
const KIND_WORDS = { enum: 'one of the values', names: 'shape names', name: 'a name', number: 'a number', text: 'text in quotes', texts: 'a list of texts', point: 'x,y in pixels' };

/** a live engine -> plain data for answer(). opts.docs: the help pages' prose (HelpKit: ACTIONS, ASKS, CAPS, TOPICS); opts.templates: the
 *  template catalogue (TemplateKit.catalogue()) */
function contextFromEngine(engine, opts) {
  opts = opts || {};
  const legend = {};
  for (const [k, q] of engine.legend.questions) legend[k] = { ask: q.ask || '', kind: q.kind, values: q.values ? Object.assign({}, q.values) : null, plugins: (q.plugins || []).slice() };
  const plugins = engine.plugins.map(p => {
    const hs = engine.handlers.filter(h => h.plugin === p), vals = (type, key) => [...new Set(hs.filter(h => h.type === type && h.when && h.when[key] != null).flatMap(h => [].concat(h.when[key])))];
    return { name: p.name, title: p.title, description: p.description || '', enabled: p.enabled !== false, locked: !!p.locked, actions: vals('command', 'action'), asks: vals('question', 'ask'), wireTypes: Object.keys(p.wireTypes || {}), keys: Object.keys(p.legend || {}) };
  });
  /* the actions the engine runs on arrows already drawn: a command handler with from= / to= or kind=edge in its when */
  const edgeForms = [...new Set(engine.handlers.filter(h => h.type === 'command' && h.when && h.when.action && (h.when.from || h.when.to || h.when.kind === 'edge')).flatMap(h => [].concat(h.when.action)))];
  return { legend, plugins, docs: opts.docs || null, templates: opts.templates || [], edgeForms };
}

/** every topic a help wire can name, with what it is: [{topic, senses: [{kind: action|ask|key|value|plugin|general, key?}]}] */
function topics(ctx) {
  const m = new Map(), add = (t, s) => { if (!m.has(t)) m.set(t, []); m.get(t).push(s); };
  add('general', { kind: 'general' });
  for (const p of ctx.plugins) add(p.name, { kind: 'plugin' });
  const L = ctx.legend;
  if (L.action && L.action.values) for (const v of Object.keys(L.action.values)) add(v, { kind: 'action' });
  if (L.ask && L.ask.values) for (const v of Object.keys(L.ask.values)) if (v !== 'help') add(v, { kind: 'ask' });
  for (const k of Object.keys(L)) if (!SKIP_KEYS.has(k)) add(k, { kind: 'key' });
  for (const [k, q] of Object.entries(L)) if (!SKIP_KEYS.has(k) && q.kind === 'enum' && q.values) for (const v of Object.keys(q.values)) add(v, { kind: 'value', key: k });
  return m;
}
/** a topic as written (a value, a key, a cue word, a plural) -> its senses; [] when it names nothing */
function sensesOf(ctx, topic) {
  const T = topics(ctx), t = String(topic || '').trim();
  if (T.has(t)) return T.get(t);
  const lt = t.toLowerCase(), hit = [...T.keys()].find(k => k.toLowerCase() === lt || k.toLowerCase() + 's' === lt || k.toLowerCase() + 'es' === lt);
  if (hit) return T.get(hit);
  for (const [k, q] of Object.entries(ctx.legend)) if (q.values && !SKIP_KEYS.has(k) || k === 'action') for (const [v, cues] of Object.entries(q.values || {})) if ((cues || []).some(c => c.toLowerCase() === lt)) return T.get(v) || [];
  return [];
}

/* ---------------- pieces ---------------- */
const pluginOf = (ctx, name) => ctx.plugins.find(p => p.name === name);
const doc = (ctx, group, key) => ctx.docs && ctx.docs[group] && ctx.docs[group][key] || null;
const offNote = ps => ps.length && ps.every(p => !p.enabled) ? ` That part (${listing(ps.map(p => p.title))}) is switched off now, in ⋮ › Settings › Capabilities; switch it on to use it.` : '';
const cuesOf = (q, v) => ((q && q.values && q.values[v]) || []).filter(c => c !== v && !/…/.test(c));
const valueList = (q, n) => Object.keys(q.values).map(v => { const c = cuesOf(q, v).slice(0, n == null ? 1 : n); return words(v) + (c.length ? ` (also “${c.join('”, “')}”)` : ''); });
/** every example sentence of the help pages (texts that need no earlier message) */
function allExamples(ctx) {
  const d = ctx.docs || {}, out = [];
  for (const g of ['ACTIONS', 'ASKS', 'CAPS', 'TOPICS']) for (const x of Object.values(d[g] || {})) for (const e of x.ex || []) { const t = exText(e); if (t && !out.includes(t)) out.push(t); }
  for (const T of ctx.templates || []) if (T.ex && !out.includes(T.ex)) out.push(T.ex);
  return out;
}
/** example sentences that use one of these words (whole words, any case) */
function examplesWith(ctx, ws, n) {
  const re = ws.filter(Boolean).map(w => new RegExp(`(^|[^A-Za-z])${String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'i'));
  return allExamples(ctx).filter(t => re.some(r => r.test(t))).slice(0, n || 3);
}
/** the details an action takes: the keys of the plugins that run it (enum keys with their values) */
function detailsOf(ctx, ps) {
  const keys = [...new Set(ps.flatMap(p => p.keys))].filter(k => !SKIP_KEYS.has(k) && ctx.legend[k]);
  return keys.map(k => { const q = ctx.legend[k]; return q.kind === 'enum' && q.values ? `${k} (${listing(Object.keys(q.values).slice(0, 8).map(words))}${Object.keys(q.values).length > 8 ? ', …' : ''})` : `${k} (${KIND_WORDS[q.kind] || q.kind})`; });
}
const runners = (ctx, kind, v) => ctx.plugins.filter(p => (kind === 'action' ? p.actions : p.asks).includes(v));

/* ---------------- one answer per sense ---------------- */
function actionPart(ctx, a, aspect) {
  const d = doc(ctx, 'ACTIONS', a), ps = runners(ctx, 'action', a), q = ctx.legend.action, title = d ? d.t : cap(words(a));
  const ex = d ? (d.ex || []).map(exText).filter(Boolean) : examplesWith(ctx, [a].concat(cuesOf(q, a)), 3);
  const cues = cuesOf(q, a).slice(0, 6), det = detailsOf(ctx, ps);
  const what = d && d.d ? d.d : `It is the action “${words(a)}”.`;
  const parts = [];
  if (aspect === 'can') parts.push(ps.length ? `Yes: ${title.toLowerCase()}. ${what}` : `The legend knows “${words(a)}”, but nothing carries it out yet.`);
  else if (aspect === 'how') parts.push(`${title}: ${what} Say what to do and to which shapes${ex.length ? `, for example “${ex[0]}”` : ''}.`);
  else if (aspect === 'example') parts.push(`${title}, for example: ${ex.slice(0, 3).map(e => `“${e}”`).join('; ') || '(no example yet)'}.`);
  else parts.push(`${title}: ${what}`);
  if (aspect !== 'example' && cues.length) parts.push(`Words I read for it: ${listing(cues.map(c => `“${c}”`))}.`);
  if ((aspect === 'how' || aspect === 'values' || aspect === 'overview') && det.length) parts.push(`Details you can add: ${det.join('; ')}.`);
  return { text: parts.join(' ') + offNote(ps), examples: ex };
}
function askPart(ctx, a, aspect) {
  const d = doc(ctx, 'ASKS', a), ps = runners(ctx, 'ask', a), q = ctx.legend.ask, title = d ? d.t : cap(words(a));
  const ex = d ? (d.ex || []).map(exText).filter(Boolean) : examplesWith(ctx, cuesOf(q, a), 3);
  const what = d && d.d ? ' ' + d.d : '';
  const lead = aspect === 'can' ? `Yes, you can ask it: ${title.toLowerCase()}.` : `${title}: a question about the drawing; it never changes it.`;
  return { text: `${lead}${what}${ex.length ? ` Ask, for example, “${ex[0]}”.` : ''}${offNote(ps)}`, examples: ex };
}
function keyPart(ctx, k, aspect) {
  const q = ctx.legend[k], ps = ctx.plugins.filter(p => q.plugins.includes(p.name)), acts = [...new Set(ps.flatMap(p => p.actions))].filter(a => a !== 'undo' && a !== 'redo');
  const parts = [`${cap(words(k))} answers “${q.ask || k}”.`];
  if (q.kind === 'enum' && q.values) { const vs = Object.keys(q.values); parts.push(`${vs.length} value${vs.length === 1 ? '' : 's'}: ${listing(valueList(q, aspect === 'values' ? 2 : 1))}.`); }
  else parts.push(`It takes ${KIND_WORDS[q.kind] || q.kind}.`);
  if (acts.length && aspect !== 'example') parts.push(`It goes with: ${listing(acts.map(a => (doc(ctx, 'ACTIONS', a) || { t: words(a) }).t.toLowerCase()))}.`);
  const ex = examplesWith(ctx, q.values ? Object.keys(q.values).concat(...Object.values(q.values)) : [k], 3);
  if (aspect === 'example' || aspect === 'how') parts.push(ex.length ? `For example: ${ex.map(e => `“${e}”`).join('; ')}.` : '');
  return { text: parts.filter(Boolean).join(' ') + offNote(ps), examples: ex };
}
function valuePart(ctx, v, key, aspect) {
  const q = ctx.legend[key], ps = ctx.plugins.filter(p => q.plugins.includes(p.name));
  if (key === 'template') {
    const T = (ctx.templates || []).find(t => t.name === v);
    if (T) {
      const params = T.params.map(p => p === 'place' ? 'a place (a part of the canvas, x,y, or next to a shape)' : p === 'items2' ? 'items2 (a second list)' : p).join(', ');
      const lead = aspect === 'can' ? `Yes: the ${T.t.toLowerCase()} template.` : `${T.t} (a template${T.family === 'emotion' ? ' with an emotional form' : ''}): good for ${T.good}.`;
      const how = ` It draws ${T.how}. It takes ${T.min === T.max ? T.min : `${T.min} to ${T.max}`} items${T.uses2 ? `, and a second list (items2)` : ''}; you can give: ${params}. It is drawn as one group, undone in one step.`;
      return { text: lead + (aspect === 'example' ? '' : how) + ` Say, for example, “${T.ex}”.` + offNote(ps), examples: [T.ex] };
    }
  }
  const td = doc(ctx, 'TOPICS', `${key}:${v}`);
  if (td) return { text: (aspect === 'can' ? 'Yes. ' : '') + `${td.t}: ${td.d}` + offNote(ps), examples: (td.ex || []).map(exText).filter(Boolean) };
  const cues = cuesOf(q, v).slice(0, 4), ex = examplesWith(ctx, [v].concat(cues), 3);
  const text = `${aspect === 'can' ? 'Yes: ' : ''}“${words(v)}” is one answer to “${q.ask || key}” (${key}=${v})${cues.length ? `; I also read it from ${listing(cues.map(c => `“${c}”`))}` : ''}. The other answers: ${listing(Object.keys(q.values).filter(x => x !== v).map(words))}.`;
  return { text: text + (ex.length ? ` For example: “${ex[0]}”.` : '') + offNote(ps), examples: ex };
}
function pluginPart(ctx, name, aspect) {
  const p = pluginOf(ctx, name), c = doc(ctx, 'CAPS', name), title = c ? c.t : p.title;
  const acts = p.actions.map(a => (doc(ctx, 'ACTIONS', a) || { t: words(a) }).t.toLowerCase()), asks = p.asks.map(a => (doc(ctx, 'ASKS', a) || { t: words(a) }).t.toLowerCase());
  const ex = c ? (c.ex || []).map(exText).filter(Boolean) : examplesWith(ctx, p.actions, 3);
  const parts = [`${title}: ${c ? c.d : p.description}`];
  if (acts.length) parts.push(`You can: ${listing(acts)}.`);
  if (asks.length) parts.push(`You can ask: ${listing(asks)}.`);
  const det = detailsOf(ctx, [p]); if (det.length && aspect !== 'example') parts.push(`Details: ${det.join('; ')}.`);
  if (ex.length) parts.push(`For example: ${ex.slice(0, 3).map(e => `“${e}”`).join('; ')}.`);
  return { text: (aspect === 'can' ? 'Yes. ' : '') + parts.join(' ') + offNote([p]), examples: ex };
}
function generalPart(ctx) {
  const on = ctx.plugins.filter(p => p.enabled && (p.actions.length || p.asks.length || p.wireTypes.length));
  const caps = on.map(p => (doc(ctx, 'CAPS', p.name) || { t: p.title }).t.toLowerCase());
  const tl = (ctx.templates || []).map(t => t.name);
  const ex = on.map(p => { const c = doc(ctx, 'CAPS', p.name); return c && (c.ex || []).map(exText).find(Boolean); }).filter(Boolean);
  const off = ctx.plugins.filter(p => !p.enabled);
  return { text: `I draw and change diagrams from plain English, and I answer questions about them. What I can do: ${listing(caps)}.` + (tl.length ? ` Ready-made forms (templates): ${listing(tl)}.` : '') + (off.length ? ` Switched off now: ${listing(off.map(p => p.title))}.` : '') + ' Ask me “how do I …?”, “what colours can I use?”, “can I group things?”, or “how do I make a timeline?”.', examples: ex.slice(0, 4) };
}

/* ---------------- the arrow form of a topic ---------------- */
const firstSentences = (d, n) => (String(d || '').match(/[^.!?]+[.!?]+(?:\s|$)/g) || [String(d || '')]).slice(0, n).join('').trim();
/** the words of a question, lower case (the source text and `about`) */
const wordsOf = (said, about) => new Set(`${said || ''} ${about || ''}`.toLowerCase().replace(/['’]s\b/g, ' ').split(/[^a-z]+/).filter(Boolean));
/** the words that name arrows: the cue words of the legend value kind=edge (and their singulars), and "edge" itself */
function arrowWords(ctx) {
  const q = ctx.legend.kind, cues = q && q.values && q.values.edge ? q.values.edge : null;
  if (!cues) return new Set();
  return new Set(cues.concat(['edge']).flatMap(c => [c.toLowerCase(), c.toLowerCase().replace(/s$/, '')]));
}
const said = (W, k) => [...W].some(w => w === k || w === k + 's' || (w.startsWith(k) && /^(?:ed|led|ing|ling)$/.test(w.slice(k.length))));
/** a help-page item (t, d, ex) as an answer part; brief: its first two sentences and one example */
function itemPart(x, aspect, brief, ps) {
  const ex = (x.ex || []).map(exText).filter(Boolean);
  if (brief) return { text: `${x.t}: ${firstSentences(x.d, 2)}${ex.length ? ` For example “${ex[0]}”.` : ''}`, examples: ex.slice(0, 1) };
  const lead = aspect === 'can' ? `Yes: ${x.t.toLowerCase()}. ` : `${x.t}: `;
  const tail = aspect === 'example' ? ` For example: ${ex.slice(0, 3).map(e => `“${e}”`).join('; ')}.` : ex.length ? ` For example “${ex[0]}”.` : '';
  return { text: lead + x.d + tail + offNote(ps || []), examples: ex };
}
/** the arrow form of a label, a change or a removal; null when the engine has none (or no help-page prose for it) */
function arrowPart(ctx, form, aspect, brief) {
  const ps = ctx.plugins.filter(p => p.actions.includes(form === 'label' ? 'label' : form === 'style' ? 'set' : 'disconnect'));
  if (form === 'label') { const x = ctx.docs && ctx.docs.EDGE_LABEL; return x && (ctx.edgeForms || []).includes('label') ? itemPart(x, aspect, brief, ps) : null; }
  if (form === 'style') { const x = ctx.docs && ctx.docs.EDGE_STYLE; return x && (ctx.edgeForms || []).includes('set') ? itemPart(x, aspect, brief, ps) : null; }
  if (form === 'remove') { if (!ctx.legend.action || !ctx.legend.action.values || !('disconnect' in ctx.legend.action.values)) return null; const x = doc(ctx, 'ACTIONS', 'disconnect'); return x ? itemPart(x, aspect, brief, ps) : actionPart(ctx, 'disconnect', aspect); }
  return null;
}
const SHAPE_LABEL_KEYS = new Set(['label']);                    /* topics that are a label */
const CHANGE_TOPICS = new Set(['set', 'resize', 'color', 'style', 'arrow', 'size', 'outline']);   /* topics whose arrow form is a change of the arrow */
const REMOVE_TOPICS = new Set(['delete']);                      /* topics whose arrow form is a disconnect */

/** answer(args, ctx, text) -> { text, examples, topic, aspect, senses, known }. args: the help wire's answers (topic, aspect, about);
 *  text: the question as written (optional), whose words choose the arrow form of a topic (see the head of the file). */
function answer(args, ctx, text) {
  args = args || {};
  const aspect = ASPECTS.includes(args.aspect) ? args.aspect : 'overview', topic = args.topic != null ? String(args.topic) : null;
  if (!topic || topic === 'general') {
    const g = generalPart(ctx);
    if (args.about) return { text: `I don't know “${args.about}” as something this editor can do. ${g.text}`, examples: g.examples, topic: null, aspect, senses: [], known: false };
    return Object.assign(g, { topic: 'general', aspect, senses: [{ kind: 'general' }], known: true });
  }
  const senses = sensesOf(ctx, topic);
  if (!senses.length) { const g = generalPart(ctx); return { text: `I don't know “${args.about || topic}” as something this editor can do. ${g.text}`, examples: g.examples, topic, aspect, senses: [], known: false }; }
  /* one part per sense; a topic that is both an action and a key (label) answers both. A value of a key that only sorts questions
     (property=color, kind=group, ...) is left out when the topic means something more (the key color, the action group) */
  const META = new Set(['property', 'kind', 'superlative', 'quantifier', 'recency', 'notColor', 'comparison', 'aspect']);
  const main = senses.filter(s => !(s.kind === 'value' && META.has(s.key)));
  const order = { action: 0, ask: 1, key: 2, value: 3, plugin: 4 };
  const parts = (main.length ? main : senses).slice().sort((a, b) => (order[a.kind] - order[b.kind]) || 0).map(s =>
    s.kind === 'action' ? actionPart(ctx, topic, aspect) : s.kind === 'ask' ? askPart(ctx, topic, aspect) : s.kind === 'key' ? keyPart(ctx, topic, aspect)
      : s.kind === 'value' ? valuePart(ctx, topic, s.key, aspect) : s.kind === 'plugin' ? pluginPart(ctx, topic, aspect) : generalPart(ctx));
  /* the arrow form (see the head of the file): with a word for arrows it comes first and the shape form is said briefly; a label answer
     without one ends with the arrow form, briefly */
  const W = wordsOf(text, args.about), arrows = [...arrowWords(ctx)].some(w => W.has(w)), lab = SHAPE_LABEL_KEYS.has(topic) || (said(W, 'label') && (REMOVE_TOPICS.has(topic) || CHANGE_TOPICS.has(topic) || topic === 'rename'));
  let all = parts, form = lab ? 'label' : arrows && CHANGE_TOPICS.has(topic) ? 'style' : arrows && REMOVE_TOPICS.has(topic) ? 'remove' : null;
  const arrowFull = form && arrows ? arrowPart(ctx, form, aspect, false) : null;
  if (form === 'label' && !arrows) {
    /* a label of a shape: the label action's answer (when the topic was delete / set: the label topic instead), then the arrow form briefly */
    const shape = SHAPE_LABEL_KEYS.has(topic) ? parts : [actionPart(ctx, 'label', aspect)], brief = arrowPart(ctx, 'label', aspect, true);
    all = shape.slice(0, 2).concat(brief ? [brief] : []);
  } else if (arrowFull) {
    const shapeBrief = form === 'label' && doc(ctx, 'ACTIONS', 'label') ? itemPart(doc(ctx, 'ACTIONS', 'label'), aspect, true) : null;
    const own = doc(ctx, 'ACTIONS', topic), other = own && senses.some(x => x.kind === 'action') ? itemPart(own, aspect, true) : parts[0];   /* the shape form, briefly when it is an action */
    all = [arrowFull].concat(form === 'label' ? (shapeBrief ? [shapeBrief] : []) : other ? [other] : []);
  }
  const texts = [], examples = [];
  for (const p of all) { if (!texts.includes(p.text)) texts.push(p.text); for (const e of p.examples) if (!examples.includes(e)) examples.push(e); }
  return { text: texts.slice(0, 3).join(' '), examples: examples.slice(0, 4), topic, aspect, senses, known: true, form: arrowFull ? 'arrow' : null };
}

/** the legend questions of the help wire (the help plugin's legend). The topic values are every topic of the legend, so it is built after
 *  the other plugins (topicLegend); the Rules' cue words of each topic are the words of what it names (an action's cues, a value's cues). */
const ASK_CUES = ['help', 'how do i', 'how can i', 'how to', 'what can you do', 'can i', 'is it possible', 'show me an example'];
const ASPECT_VALUES = { overview: ['help', 'what is', 'tell me about', 'what can you do'], how: ['how do i', 'how can i', 'how to', 'how would i'], can: ['can i', 'can you', 'is it possible', 'are you able', 'do you support'], values: ['what kinds of', 'which', 'what options', 'available'], example: ['example', 'examples', 'show me how', 'sample'] };
function topicLegend(ctx) {
  const vals = {};
  for (const [t, ss] of topics(ctx)) {
    const cues = new Set();
    for (const s of ss) { if (s.kind === 'action') cuesOf(ctx.legend.action, t).forEach(c => cues.add(c)); if (s.kind === 'value') cuesOf(ctx.legend[s.key], t).forEach(c => cues.add(c)); }
    vals[t] = [...cues];
  }
  return { topic: { ask: 'What is the help question about?', kind: 'enum', values: vals } };
}
const legend = () => ({
  ask: { values: { help: ASK_CUES } },
  aspect: { ask: 'What does the help question want: an overview, how to do it, whether it can be done, the values, or an example?', kind: 'enum', values: ASPECT_VALUES },
  about: { ask: 'What does the help question name that the editor does not know?', kind: 'text' }
});

const HelpAnswers = { answer, contextFromEngine, topics, sensesOf, topicLegend, legend, ASPECTS };
if (typeof module !== 'undefined') module.exports = HelpAnswers; else root.HelpAnswers = HelpAnswers;
})(typeof window !== 'undefined' ? window : this);
