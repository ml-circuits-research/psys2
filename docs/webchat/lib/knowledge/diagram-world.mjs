// SPDX-License-Identifier: AGPL-3.0-only
// DIAGRAMS FROM KNOWLEDGE, the host side (spec 14 section 9). A diagram kind (`k.diagrams.kind`) says what structure it shows and how it is laid out; its fills (`k.diagrams.fill`) say which
// knowledge has that structure; the library's `composeDiagram` / `sampleDiagram` (sopworld 0.112) draw a kind x a topic and lay it out with `arrange`. This file does what a host owes the
// library: builds the World it reads (the bundled subset of the catalog, `bundled-diagrams.mjs`, with the live catalog laid over it when reachable), reads a request into a kind and a topic
// (the kinds' words come from the knowledge, not from a list here), tries the candidate topics, and says what was composed in plain words. No template, no sample labels. Browser-safe: no `node:*`.
import { BUNDLED_DIAGRAMS } from './bundled-diagrams.mjs?v=41ffc3ceda';
import { BUNDLED_GEO } from './bundled-geo.mjs?v=599c28f232';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const words = (s) => String(s ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const low = (s) => String(s ?? '').toLowerCase();
const bare = (v) => String(v ?? '').replace(/^"|"$/g, '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let libraryPromise = null;
/** The library module, loaded once (lazily: the vendored file is 900 kB). */
export const diagramLibrary = () => (libraryPromise ??= import('../vendor/sopworld/sopworld.mjs?v=4a094fcca4'));

/** The kinds the bundled catalog has: [{ name, form, words }], read from its text (a request can be read before the library is loaded); `words` are the other names a request uses ("hierarchy" for a tree: `core.word of=k.diagrams.kind.name`). */
export function kindNames() {
  const text = BUNDLED_DIAGRAMS.files['k.diagrams'];
  const words = new Map();
  for (const m of text.matchAll(/^@\S+ core\.word ((?:text=(?:"[^"]*"|\S+) )+)means=("[^"]*"|\S+) of=k\.diagrams\.kind\.name/gm)) words.set(bare(m[2]), [...m[1].matchAll(/text=("[^"]*"|\S+)/g)].map((x) => bare(x[1])));
  return [...text.matchAll(/^@\S+ k\.diagrams\.kind name=("[^"]*"|\S+) form=(\S+)/gm)].map((m) => ({ name: bare(m[1]), form: m[2], words: words.get(bare(m[1])) ?? [] }));
}
/** The ways to say a kind: its name, its form, the name without "diagram"/"chart", its other words; one word or two ("mind map", "mindmap", "mind-map", "flow chart"). */
function kindPhrases({ name, form, words = [] }) {
  const out = new Set();
  for (const raw of [name, form.replace(/_/g, ' '), name.replace(/\s+(?:diagram|chart)$/i, ''), ...words]) {
    const w = raw.trim().split(/[\s-]+/);
    if (w.length === 1) out.add(esc(w[0]));
    else out.add(w.map(esc).join('[\\s-]?'));
  }
  return [...out];
}
let kindRx = null;
const kindAlternatives = () => (kindRx ??= (() => {
  const by = new Map();
  for (const k of kindNames()) for (const p of kindPhrases(k)) by.set(p, k);
  return { by, alt: [...by.keys()].sort((a, b) => b.length - a.length).join('|') };
})());

const VERB = '(?:draw|make|create|build|generate|show|give|sketch|produce|display|prepare|compose)';
const POLITE = '(?:please\\s+)?(?:(?:can|could|would|will)\\s+you\\s+)?(?:please\\s+)?';
const ART = '(?:an?|the|some|one|another)?\\s*';
const ADJ = '(?:(?:random|sample|simple|quick|small|new|nice|little|example)\\s+)*';
const NOUN = '(?:\\s+(?:diagram|chart|graph))?';
const OF = '(?:\\s+(?:of|about|for|on|showing|that shows|to show|describing|depicting|with))';
/**
 * A request for a diagram of a kind: { kind, topic } ("a flowchart of making tea", "a cycle diagram of the four seasons", "draw the planets on a timeline"),
 * { kind, random: true } ("a random mind map"), { random: true } ("make a random diagram", "draw a diagram", "a sample diagram"); null when the text is not one.
 * A kind alone ("draw a tree", "a cycle") is not a request here: the engine's own reader draws the shape or the template.
 */
export function parseDiagramRequest(text) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  const { by, alt } = kindAlternatives();
  const kindOf = (s) => { for (const [p, k] of by) if (new RegExp(`^${p}$`, 'i').test(s)) return k; return null; };
  let m = new RegExp(`^${POLITE}(?:${VERB}(?:\\s+me)?\\s+)?${ART}${ADJ}(${alt})${NOUN}${OF}\\s+(.+?)\\s*[.!?]*$`, 'i').exec(t);
  if (m) return { kind: kindOf(m[1].toLowerCase())?.name, topic: m[2], said: m[1] };
  m = new RegExp(`^${POLITE}${VERB}(?:\\s+me)?\\s+(.+?)\\s+(?:on|as|in|using)\\s+(?:an?|the)\\s+(${alt})${NOUN}\\s*[.!?]*$`, 'i').exec(t);
  if (m) return { kind: kindOf(m[2].toLowerCase())?.name, topic: m[1], said: m[2], weak: true };   // "draw a circle in a tree" is not a request for a diagram of a circle: when nothing is known, the engine reads it
  m = new RegExp(`^${POLITE}${VERB}(?:\\s+me)?\\s+${ART}((?:(?:random|sample|simple|quick|small|new|nice|little|example)\\s+)*)(${alt}|diagram|chart|picture)\\s*(?:for\\s+me|please)?[.!?]*$`, 'i').exec(t);
  if (m) {
    const k = kindOf(m[2].toLowerCase()), asked = /\b(?:random|sample|example)\b/i.test(m[1]);
    if (!k) return { random: true };   // "draw a diagram", "make a sample diagram": any kind
    return asked ? { kind: k.name, random: true, said: m[2] } : null;   // "make a random mind map" is one; "draw a tree" is the engine's own (the shape, the template)
  }
  return null;
}

// ---- the topic of a request: candidates, longest first -----------------------------------------------------------------------------------------------
const FUNCTION_WORDS = new Set('a an the of in on at to for from by with and or about as is are was were its their his her this that these those some all any my your our how what which who do does did can will shall'.split(' '));
const sing = (w) => (/ies$/.test(w) && w.length > 4 ? w.replace(/ies$/, 'y') : /(?:ches|shes|sses|xes|zes)$/.test(w) ? w.replace(/es$/, '') : /[^s]s$/.test(w) && !/(?:ss|us|is)$/.test(w) ? w.replace(/s$/, '') : w);
const base = (w) => (/ing$/.test(w) && w.length > 5 ? [w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/(.)\1ing$/, '$1')] : []);
/** The phrasings of a topic to try: the topic as said, then the windows of its words (not starting or ending in a function word), longest first and later ones first; each as said, in the singular, and as the base of an -ing word. */
export function topicCandidates(topicText) {
  const w = words(topicText).filter((x) => x !== "'");
  const out = [], seen = new Set();
  const add = (x) => { const k = x.trim(); if (k && !seen.has(k)) { seen.add(k); out.push(k); } };
  const wins = [];
  add(w.join(' '));   // the topic as it was said (a topic of the knowledge may begin with an article: "a face of a role")
  if (/^(?:a|an|the)$/.test(w[0] ?? '')) add(w.slice(1).join(' '));
  for (let n = Math.min(4, w.length); n >= 1; n--) for (let i = w.length - n; i >= 0; i--) {
    const s = w.slice(i, i + n);
    if (FUNCTION_WORDS.has(s[0]) || FUNCTION_WORDS.has(s.at(-1))) continue;
    wins.push(s);
  }
  for (const s of wins) {
    const last = s.length - 1;
    add(s.join(' '));
    add([...s.slice(0, last), sing(s[last])].join(' '));
    for (const b of base(s[0])) add([b, ...s.slice(1)].join(' '));
    if (s.length > 1) add([sing(s[0]), ...s.slice(1)].join(' '));
  }
  return out;
}

// ---- the World ------------------------------------------------------------------------------------------------------------------------------------
const worlds = new WeakMap();
/** The library World of the bundled subset: the kinds, w.diagram's schema, the cycles of nature and the calendar, the usual parts, the steps of methods, the elements of a story, and the countries (k.geo, shared with the composer). */
export function bundledDiagramWorld(lib) {
  if (worlds.has(lib)) return worlds.get(lib);
  const w = new lib.World();
  for (const text of Object.values(BUNDLED_DIAGRAMS.schemas)) w.load(text);
  for (const text of Object.values(BUNDLED_DIAGRAMS.vocabularies)) w.load(text);
  for (const text of Object.values(BUNDLED_DIAGRAMS.files)) w.load(text);
  w.tell(BUNDLED_GEO.text);
  worlds.set(lib, w);
  return w;
}

/**
 * The live catalog's part of the diagram knowledge (one host per catalog): the worlds the fills of k.diagrams read, a small world whole and a big one by the shards whose keys name a word of
 * the request (the catalog's index lists the keys), told into the same World as the bundled subset. `world()` is that World once something was loaded, else null.
 */
const hosts = new WeakMap();
export function diagramHostOf(cat0) {
  const cat = cat0?.base ?? cat0;
  if (!cat) return null;
  if (!hosts.has(cat)) hosts.set(cat, createDiagramHost(cat));
  return hosts.get(cat);
}
const SMALL_WORLD_SHARDS = 8;
export function createDiagramHost(cat) {
  let world = null, lib = null;
  const told = new Set(), texts = new Map(), fillTypes = new Set();
  const read = async (p) => { if (!texts.has(p)) texts.set(p, (await cat.readText?.(p)) ?? ''); return texts.get(p); };
  const tell = async (p) => { if (told.has(p)) return; told.add(p); const t = await read(p); if (t) world.tell(t); };
  async function loadWorld(id, wanted) {
    const w = await cat.world?.(id);
    if (!w) return;
    if (w.schema) await tell(w.schema);
    const shards = w.shards ?? [];
    const pick = shards.length <= SMALL_WORLD_SHARDS ? shards : shards.filter((s) => (s.keys ?? []).some((k) => wanted.has(String(k).toLowerCase())));
    for (const s of pick) await tell(s.path);
  }
  return {
    /** Loads what a request can touch: the diagram kinds and fills first (they name the worlds), then those worlds for the words. Resolves to true when the World has the kinds. */
    async load(wordList = []) {
      try {
        lib ??= await diagramLibrary();
        world ??= bundledDiagramWorld(lib);
        const wanted = new Set(wordList.flatMap((x) => { const l = low(x); return [l, sing(l)]; }));
        await loadWorld('k.diagrams', wanted);
        for (const f of world.ofType('k.diagrams.fill')) fillTypes.add(bare(f.attrs.type[0]));
        const ids = [...new Set([...fillTypes].map((t) => t.split('.').slice(0, 2).join('.')))];
        for (const id of ids) await loadWorld(id, wanted);
        return true;
      } catch { return false; }
    },
    world: () => (told.size ? world : null),
  };
}
/** The World a diagram is composed from: the live catalog's when it loaded something, else the bundled subset. */
export const diagramWorldOf = (lib, cat) => diagramHostOf(cat)?.world() ?? bundledDiagramWorld(lib);

// ---- composing ------------------------------------------------------------------------------------------------------------------------------------
/**
 * The knowledge's own spelling of the topic when what the fill read is ABOUT it, exactly, else null: a fill looked up by a topic key has a fact whose value of that key is the topic (the method "make tea", the cycle "seasons",
 * the kind "bird"), and a fill with none has a fact named the topic (the country France). The library also takes a fact that merely contains the topic as a word, and a fill with no topic key for any
 * topic (the elements of a story, the aspects of a thing); a request names its topic, so those are not enough.
 */
function aboutTopic(world, lib, r, topic) {
  const kind = lib.diagramKinds(world).find((k) => k.name === r.kind);
  const fill = kind?.fills.find((f) => `${f.type}.${f.key}` === r.fill);
  if (!fill || (!fill.topic && fill.gives === 'order')) return null;   // an ordered list with no topic key is not about any topic (the elements of a story)
  const t = low(topic);
  for (const f of world.ofType(fill.type)) for (const v of fill.topic ? (f.attrs[fill.topic] ?? []) : (f.attrs.name ?? [])) if (low(bare(v)) === t) return bare(v);
  return null;
}

/**
 * Whether a person is ever offered what a fill reads about a topic. A fact may say it is not for a person (`user_facing=false`: the drawing methods of PSys2 in k.procedures, "show a feeling on a
 * face"); such a fact, and a topic that names one through the fill's topic key (the key's slot says which facts it names: `type=k.procedures.method by=name`), is never drawn, sampled or offered.
 * Nothing here names a type or a topic: the key is the catalog's published `user_facing`.
 */
const NOT_FOR_PEOPLE = (f) => (f.attrs.user_facing ?? []).some((v) => low(bare(v)) === 'false');
export function offered(world, fill, topic) {
  const t = low(topic), has = (f, key) => (f.attrs[key] ?? []).some((v) => low(bare(v)) === t);
  const facts = world.ofType(fill.type).filter((f) => has(f, fill.topic ?? 'name'));
  if (facts.some(NOT_FOR_PEOPLE)) return false;
  const slot = fill.topic ? world._compiled?.()?.slotOf?.(fill.type, fill.topic) : null;
  if (slot?.type && slot.type !== fill.type && world.ofType(slot.type).some((f) => has(f, slot.by ?? 'name') && NOT_FOR_PEOPLE(f))) return false;
  return true;
}
const fillOf = (lib, world, r) => lib.diagramKinds(world).find((k) => k.name === r.kind)?.fills.find((f) => `${f.type}.${f.key}` === r.fill);

/**
 * How the engine joins the nodes: arrows when the kind's edges are `directed`, plain lines when `undirected`. A kind with no edges whose structure is a sequence (a timeline: "events in order
 * along a line", each "a dot on the line") is drawn on its line: `line` joins its nodes in their order with plain segments, so the order is on the canvas and not only in the places.
 */
const kindWire = (world, name) => world.ofType('k.diagrams.kind').find((k) => bare(k.attrs.name?.[0]) === name);
function withDirection(lib, world, d) {
  const k = lib.diagramKinds(world).find((x) => x.name === d.kind), w = kindWire(world, d.kind);
  const sequence = (w?.attrs.structure ?? []).map(bare).includes('sequence');
  return { ...d, directed: k?.edges === 'directed', line: k?.edges === 'none' && sequence && !(d.edges ?? []).length && d.nodes.length > 1 };
}

/**
 * The size `composeDiagram` lays a node out with, in the units of its frame (its boxes: 6 + 1.6 per letter, at most 30, 8 high). A layer with more nodes than the frame is wide enough for is
 * laid out wider than the frame (the layout never overlaps or squeezes them), so the canvas shows the whole extent of the nodes, not the frame: `extent` is the width and the height in units
 * (at least the frame's 100) that the nodes need.
 */
export const unitBox = (label) => ({ w: Math.min(30, 6 + String(label).length * 1.6), h: 8 });
const fitted = (lib, world, opts) => {
  const r = lib.composeDiagram(world, opts);
  if (r.why) return r;
  return { ...r, extent: { w: Math.max(100, ...r.nodes.map((n) => n.x + unitBox(n.label).w)), h: Math.max(100, ...r.nodes.map((n) => n.y + unitBox(n.label).h)) } };
};

/**
 * A kind can be filled from several knowledge types (a tree of "car": its kinds, its parts); the library takes one by a seed. The request says which it means ("the parts of a car", "the cities of
 * France", "the kinds of mammals"): the fill whose type or key names a word of the request (in the singular) is the one asked for. Returns the number of such words.
 */
const askedFor = (fill, requestWords) => {
  const named = new Set([...String(fill.id).split(/[._]/), ...fill.by].map((x) => sing(x.toLowerCase())));
  return requestWords.filter((w) => w.length > 2 && !FUNCTION_WORDS.has(w) && named.has(sing(w))).length;
};
/**
 * The fills of a kind, in the knowledge's order, each with the World seen through it alone: the library takes one fill of a kind by its seed, so a view in which the kind has only that fill
 * composes exactly that one. `by` is what the fill orders or groups by (`by=distance`, `by=size`): a word of the request may name it ("the planets by distance").
 */
function fillsOf(lib, world, kind) {
  const ks = lib.diagramKinds(world), k = low(kind);
  const name = (ks.find((x) => low(x.name) === k) ?? ks.find((x) => x.form === k) ?? ks.find((x) => low(x.name).replace(/ diagram$/, '') === k))?.name;   // the library's reading of a kind
  return world.ofType('k.diagrams.fill').filter((f) => bare(f.attrs.kind?.[0]) === name).map((f) => ({
    id: `${bare(f.attrs.type?.[0])}.${bare(f.attrs.key?.[0])}`, by: (f.attrs.by ?? []).map(bare),
    view: { ofType: (t) => (t === 'k.diagrams.fill' ? [f] : world.ofType(t)), _compiled: () => world._compiled?.() },
  }));
}
/**
 * A diagram of a kind about the topic of a request, from knowledge: { diagram, topic } or { why }. The candidate topics are tried in order; the first the knowledge has the structure for wins.
 * Every fill of the kind is tried (not a seeded few): the one whose type, key or `by` names a word of the request is drawn, and among equals the first in the knowledge, so one request draws
 * one diagram whatever the seed or the reasoner (the seed only places a free layout).
 */
export function composeForRequest(lib, world, { kind, topic }, { seed = 1, max = 9 } = {}) {
  const tried = [], asked = words(topic), fills = fillsOf(lib, world, kind);
  for (const c of topicCandidates(topic)) {
    tried.push(c);
    const found = [];
    for (const f of fills) {
      budget.tick('diagram.fill');
      const r = fitted(lib, f.view, { kind, topic: c, seed, max });
      if (r.why || !r.nodes?.length) continue;
      const said = aboutTopic(f.view, lib, r, c);
      if (said && offered(world, fillOf(lib, f.view, r), said)) found.push({ f, r, said });
    }
    if (!found.length) continue;
    const best = found.reduce((a, b) => (askedFor(b.f, asked) > askedFor(a.f, asked) ? b : a));
    const spelt = best.said === c ? best.r : fitted(lib, best.f.view, { kind, topic: best.said, seed, max });   // the topic as the knowledge writes it (France, not france)
    return { diagram: withDirection(lib, world, spelt.why ? best.r : spelt), topic: best.said };
  }
  return { why: `no knowledge of the structure of a ${kind} about ${topic} (tried ${tried.slice(0, 6).join(', ')})` };
}
/** A random diagram: the library's kind x topic sample (seeded), with at least `min` shapes and a topic its knowledge is about (a walk over seeds; the first that qualifies). */
export function sampleDiagrams(lib, world, { seed = 1, kinds, min = 4, tries = 24, max = 9 } = {}) {
  for (let i = 0; i < tries; i++) {
    const s = (seed + i * 7919) >>> 0, r = lib.sampleDiagram(world, { seed: s, max, ...(kinds ? { kinds: [kinds] } : {}) });
    if (r.why || r.nodes.length < min || String(r.topic).length < 3 || !aboutTopic(world, lib, r, r.topic) || !offered(world, fillOf(lib, world, r), r.topic)) continue;   // (the sampled topic is the knowledge's own spelling; never what is not for a person)
    const f = fitted(lib, world, { kind: r.kind, topic: r.topic, seed: s, max });   // the same diagram with its extent
    if (!f.why) return { diagram: withDirection(lib, world, f), topic: r.topic };
  }
  return { why: 'no diagram kind has a topic with enough in this knowledge' };
}

// ---- onto the diagram engine ----------------------------------------------------------------------------------------------------------------------
/** The engine's primitive for a shape of k.diagrams.shape (the engine draws circles, rectangles, squares, diamonds, ellipses, triangles, hexagons, stars). */
export const ENGINE_SHAPE = { oval: 'ellipse', ellipse: 'ellipse', circle: 'circle', dot: 'ellipse', rectangle: 'rectangle', rounded_rectangle: 'rectangle', double_rectangle: 'rectangle', document: 'rectangle', parallelogram: 'rectangle', diamond: 'diamond', chevron: 'hexagon' };
const CANVAS = { w: 800, h: 500 };
const slug = (label) => String(label).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
/**
 * The engine's commands for a composed diagram: a `create` per node (named after its label, put where the layout put it: the extent of the nodes, `d.extent` units, is the 800 x 500 canvas) and a
 * `connect` per edge; a group (the sets of a Venn diagram) is an ellipse drawn first, round the place its members were laid out in. `taken` are the names already on the canvas.
 */
export function engineNodes(d, taken = new Set()) {
  const used = new Set([...taken].map(low)), nameOf = new Map(), nodes = [];
  const unique = (label) => { let b = slug(label) || 'node', n = b, i = 1; while (used.has(low(n)) || /^[crsdetxhk]\d+$/i.test(n)) { budget.tick('diagram.name'); n = `${b}_${++i}`; } used.add(low(n)); return n; };
  const sx = CANVAS.w / (d.extent?.w ?? 100), sy = CANVAS.h / (d.extent?.h ?? 100);
  const place = (n) => {
    const u = unitBox(n.label), w = Math.round(Math.max(44, u.w * sx)), h = 44;
    return { x: Math.round(Math.min(CANVAS.w - w / 2 - 4, Math.max(w / 2 + 4, (n.x + u.w / 2) * sx))), y: Math.round(Math.min(CANVAS.h - h / 2 - 4, Math.max(h / 2 + 4, (n.y + u.h / 2) * sy))), w, h };
  };
  for (const g of d.groups ?? []) {
    const ms = d.nodes.filter((n) => g.members.includes(n.id));
    if (!ms.length) continue;
    const ps = ms.map(place), cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const name = unique(g.label);
    nameOf.set(g.id, name);
    nodes.push({ id: `g${nodes.length}`, type: 'command', args: { action: 'create', shape: 'ellipse', name, label: g.label, width: 44 * sx, height: 44 * sy, at: `${Math.round(cx)},${Math.round(cy)}` } });
  }
  for (const n of d.nodes) {
    const name = unique(n.label), { x, y, w, h } = place(n);
    nameOf.set(n.id, name);
    const shape = ENGINE_SHAPE[n.shape] ?? 'rectangle';
    nodes.push({ id: `n${nodes.length}`, type: 'command', args: { action: 'create', shape, name, label: n.label, width: shape === 'circle' ? Math.max(w, 72) : w, height: shape === 'circle' ? Math.max(w, 72) : shape === 'diamond' ? h + 24 : h, at: `${x},${y}` } });
  }
  for (const e of d.edges ?? []) {
    nodes.push({ id: `e${nodes.length}`, type: 'command', args: { action: 'connect', from: nameOf.get(e.from), to: nameOf.get(e.to), arrow: d.directed ? 'forward' : 'none' } });
  }
  if (d.line && !(d.edges ?? []).length) for (let i = 1; i < d.nodes.length; i++) {   // the line of a sequence with no edges (a timeline): plain segments through its nodes in order
    nodes.push({ id: `e${nodes.length}`, type: 'command', args: { action: 'connect', from: nameOf.get(d.nodes[i - 1].id), to: nameOf.get(d.nodes[i].id), arrow: 'none' } });
  }
  return nodes;
}

/** What was drawn, in plain words (the English the reply translator reads): "I drew a cycle diagram about the seasons with four shapes." */
const COUNT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const countWord = (n) => COUNT[n] ?? String(n);
export const formName = (d) => String(d.kind).replace(/\s+diagram$/i, '');
export function say(d, topic, { random = false } = {}) {
  const n = d.nodes.length, unit = n === 1 ? 'shape' : 'shapes';
  return `I drew a ${random ? 'random ' : ''}${formName(d)} diagram with ${countWord(n)} ${unit}.${topic ? ` It is about ${topic}.` : ''}`;
}

// ---- the dice -------------------------------------------------------------------------------------------------------------------------------------
const sentenceCache = new WeakMap();
/**
 * What the dice of the Diagram tab may say (spec 25 knowledge lists): a request for each kind x topic the knowledge can draw, whole sentences ("Make a mind map of bee.") that the same reader
 * the person's own sentences go through reads back. The topics are the library's (`diagramTopics`), kept only when the request composes. Cached per World and size.
 */
export function diagramSentences(lib, world, { perKind = 6 } = {}) {
  const c = sentenceCache.get(world);
  if (c && c.size === world.wires.size) return c.list;
  const list = [];
  for (const k of lib.diagramKinds(world)) {
    let n = 0;
    for (const t of lib.diagramTopics(world, k.name, { limit: 24 })) {
      if (n >= perKind) break;
      if (!/^[\p{L}\p{N} '-]+$/u.test(t.topic) || t.topic.length > 40 || composeForRequest(lib, world, { kind: k.name, topic: t.topic }).why) continue;
      list.push(`Make a ${k.name} of ${t.topic}.`);
      n++;
    }
  }
  sentenceCache.set(world, { size: world.wires.size, list });
  return list;
}

// ---- outlines: an arrangement in the shape of a thing (Q21, reviewer 2026-11-15 05:10) ----------------------------------------------------------------------
const attrsOf = (line) => { const a = {}; for (const m of String(line).matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g)) (a[m[1]] ??= []).push(m[2].startsWith('"') ? JSON.parse(m[2]) : m[2]); return a; };
let outlineTable = null;
/** The outlines of k.layouts (bundled from the pin): Map name -> { name, from, drawing, shape, tolerance, points: [[x, y], ...] } (a 0-100 frame, clockwise from the top). */
export function outlines() {
  if (outlineTable) return outlineTable;
  outlineTable = new Map();
  const lines = String(BUNDLED_DIAGRAMS.outlines ?? '').split('\n');
  for (const l of lines) if (/^@\S+ k\.layouts\.outline /.test(l)) { const a = attrsOf(l); if (a.name?.[0]) outlineTable.set(low(a.name[0]), { name: low(a.name[0]), from: a.from?.[0] ?? null, drawing: a.drawing?.[0] ?? null, shape: a.shape?.[0] ?? null, tolerance: Number(a.tolerance?.[0] ?? 0), points: [] }); }
  const pts = new Map();
  for (const l of lines) if (/^@\S+ k\.layouts\.outline_point /.test(l)) { const a = attrsOf(l), n = low(a.outline?.[0]); (pts.get(n) ?? pts.set(n, []).get(n)).push([Number(a.n[0]), Number(a.x[0]), Number(a.y[0])]); }
  for (const [name, ps] of pts) { const o = outlineTable.get(name); if (o) o.points = ps.sort((p, q) => p[0] - q[0]).map(([, x, y]) => [x, y]); }
  for (const [name, o] of outlineTable) if (o.points.length < 3) outlineTable.delete(name);
  return outlineTable;
}
/** The outline of a name ("house", "houses", "house-shaped", "star"), or null. */
export function outlineNamed(name) {
  const t = outlines(), n = low(name).replace(/[-\s]?shaped$/, '').replace(/[^a-z ]/g, '').trim();
  return t.get(n) ?? t.get(n.replace(/ies$/, 'y')) ?? t.get(n.replace(/(?:es|s)$/, '')) ?? t.get(n.replace(/s$/, '')) ?? null;
}

let shapeReader = null;
/**
 * The arrangement a sentence asks for, read by the w.lang.en frames of the shard shape-frames (bundled from the pin): "in the shape of a house", "shaped like a star", "house-shaped",
 * "in heart form", "arrange the boxes in a star shape". Returns { name, frame } with the outline's name (the frame's role `arrangement`, "-shaped" stripped), { name: null, said, frame }
 * when the frame's words are there but the thing is no outline of the catalog ("shaped like a blorp"), or null. Each frame is read from its own parts: the words before the arrangement,
 * an optional article, the arrangement (lexicon outline.shape or outline.shaped), the words after it.
 */
export function outlineIn(text) {
  if (!shapeReader) {
    const lines = String(BUNDLED_DIAGRAMS.shapeFrames ?? '').split('\n').filter((l) => l.startsWith('@'));
    const lex = new Map(lines.filter((l) => / w\.lang\.en\.lex /.test(l)).map((l) => { const a = attrsOf(l); return [a.name[0], (a.item ?? []).map(low).sort((x, y) => y.length - x.length)]; }));
    const parts = new Map();
    for (const l of lines.filter((x) => / w\.lang\.en\.part /.test(x))) { const a = attrsOf(l); (parts.get(a.frame[0]) ?? parts.set(a.frame[0], []).get(a.frame[0])).push(a); }
    const alt = (xs) => xs.map((x) => esc(x).replace(/(?:\\-|\s)+/g, '[\\s-]+')).join('|');
    shapeReader = [];
    for (const [frame, ps] of parts) {
      ps.sort((x, y) => Number(x.at[0]) - Number(y.at[0]));
      const ai = ps.findIndex((p) => p.role?.[0] === 'arrangement');
      if (ai < 0) continue;
      const items = lex.get(ps[ai].lexicon?.[0]) ?? [];
      if (!items.length) continue;
      // the words just before the arrangement (and an optional article between), and the words right after it
      let bi = ai - 1; const det = bi >= 0 && ps[bi].is?.[0] === 'det'; if (det) bi--;
      const before = bi >= 0 && ps[bi].is?.[0] === 'word' ? ps[bi].word.map(low) : null;
      const after = ps[ai + 1]?.is?.[0] === 'word' && ps[ai + 1].optional?.[0] !== 'yes' ? ps[ai + 1].word.map(low) : null;
      const head = before ? `\\b(?:${alt(before)})\\s+${det ? '(?:(?:an?|the)\\s+)?' : ''}` : '\\b';
      const tail = after ? `\\s+(?:${alt(after)})\\b` : '\\b';
      // a thing that is no outline is named only after a lead of two words or more ("shaped like a blorp") or between the frame's words ("in xyzzy form"): a bare "like" ("draw it like a cat") says nothing about a shape
      const long = (before ?? []).filter((w) => w.includes(' '));
      const openHead = long.length ? `\\b(?:${alt(long)})\\s+${det ? '(?:(?:an?|the)\\s+)?' : ''}` : null;
      shapeReader.push({ frame, re: new RegExp(`${head}(${alt(items)})${tail}`, 'i'), open: after ? new RegExp(`${head}([a-z]+)${tail}`, 'i') : openHead ? new RegExp(`${openHead}([a-z]+(?:\\s[a-z]+)?)\\s*[.!?]*$`, 'i') : null });   // "in xyzzy form": the words around it say it is a shape
    }
  }
  const t = String(text ?? '');
  for (const r of shapeReader) { budget.tick('diagram.outline'); const m = r.re.exec(t); if (m) return { name: low(m[1]).replace(/[\s-]+shaped$/, ''), frame: r.frame }; }
  for (const r of shapeReader) { const m = r.open?.exec(t); if (m && !/^(?:a|an|the)$/i.test(m[1])) return { name: null, said: low(m[1]), frame: r.frame }; }
  return null;
}
