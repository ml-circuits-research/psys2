// SPDX-License-Identifier: AGPL-3.0-only
// SAMPLER (specs/25-random-as-a-world.md): the host side of sopworld `sample` (0.59, std.sample). The library draws random frames that are legal in the current state,
// weighted by recency and novelty; this module only (1) states a tab's world to the library (its schema and the things the session holds, as facts), (2) renders a frame as
// a sentence, and (3) keeps a host check that a change really changes something. There is NO generator of our own: no list of examples, no placeholders to fill.
// Browser-safe: no `node:*` imports; the library module and the world registry are passed in.
import { colourWordSet, colourLexiconWords } from '../knowledge/values.mjs?v=a137742733';
import { languageWorld } from './compose-world.mjs?v=7e48e1d104';
import { englishOf } from '../lang/en-generate.mjs?v=735b7ec142';

const NOT_SAMPLED = new Set(['place', 'connect', 'group', 'send', 'save', 'load', 'redo']);   // acts the library cannot frame (a place, a second thing, a host act): left to typing
const FUNCTION_WORDS = new Set(['to', 'from', 'at', 'until', 'in', 'on', 'by', 'of']);   // attributes named like prepositions cannot be said in "Set X <attr> to V"
const GENERIC_NOUNS = new Set(['object', 'item', 'shape', 'thing', 'things', 'items', 'objects', 'shapes']);   // words that name every kind, not one
const SIMPLE =/^[a-z]+$/;
const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
const q = (v) => (SIMPLE.test(String(v)) || /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));

/** The values a slot can take, as words a person says: no `light_red` forms. A colour with no values of its own, or an attribute that says `know=<list>`, takes the knowledge list (the colours of k.values), not a list of ours. */
const valueWords = (a, lists = {}) => {
  const from = a.know ?? (a.type === 'colour' && !a.values.length ? 'colours' : null);
  if (from && lists[from]?.length) return lists[from].map(textOf).filter((v) => SIMPLE.test(v));
  return a.values.filter((v) => SIMPLE.test(v)).slice(0, 14);
};
/** An entry of a knowledge list is a text or { text, act }. */
const textOf = (e) => (typeof e === 'string' ? e : e.text);
const hash = (n) => { let t = (Number(n) >>> 0) + 0x6d2b79f5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A roll of a seed for one purpose (the hash twice: neighbouring seeds give unrelated numbers). */
const roll = (seed, salt) => hash(Math.floor(hash(Number(seed) * 7 + salt) * 4294967296));
/** A seeded subset of a list (a partial shuffle): the dice names other things at every press, and the sample world stays small. */
function subset(list, k, seed) {
  const a = [...list];
  for (let i = 0; i < Math.min(k, a.length); i++) { const j = i + Math.floor(hash(seed * 31 + i) * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/**
 * The library's world for one schema world and the things of the session: types, slots and kinds of the schema, the nouns an open kind takes, and one wire per thing.
 * `things`: [{ id, kind, noun?, attrs }] (the world's `referents`). Returns { world, ids } where `ids` maps a wire id back to the thing.
 */
export function sampleWorldOf(lib, schema, things, { cap = 40, lists = {}, seed = 1, take = 30 } = {}) {
  const world = new lib.World();
  const ns = schema.id;
  const lines = ['@acts core.use world=std.acts', `@w std.schema.world name=${ns}`];
  const acts = (k) => (k.acts?.length ? k.acts : [...schema.acts]).filter((a) => !NOT_SAMPLED.has(a) && ['make', 'remove', 'change', 'ask', 'copy', 'pick', 'undo'].includes(a));
  const present = new Set((things ?? []).map((t) => t.kind));
  const closed = new Map();
  const nounLines = [], opens = [];   // the names the open kinds take (one `std.schema.kinds` per world: the nouns of an open kind and the names of the knowledge lists)
  const entries = new Map();   // the text a knowledge entry names -> { entry, verb, kind } (the library only sees the name)
  for (const k of Object.values(schema.kinds)) {
    for (const kn of k.know ?? []) {
      const es = subset((lists[kn.list] ?? []).filter((e) => textOf(e) && !/["\n]/.test(textOf(e))), take, seed + entries.size);
      if (!es.length) continue;
      es.forEach((e, i) => {   // the library takes a name as a plain token: the entry is named by its slug and the host keeps the text
        const t = textOf(e), slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!slug || entries.has(slug)) return;
        entries.set(slug, { entry: typeof e === 'string' ? { text: e } : e, verb: kn.verb ?? null, kind: k.name }); opens.push(slug); nounLines.push(`@n.know.${k.name}.${kn.list}.${i} ${ns}.noun name=${slug}`);
      });
    }
    lines.push(`@t.${k.name} core.type of=${k.name} extends=std.schema.thing`);
    const kindActs = acts(k).filter((a) => !k.diceNot?.includes(a)).filter((a) => !(k.any && a === 'make') && !(a === 'make' && ((k.name === 'group' && schema.acts.has('group')) || (k.in && k.in !== k.name && (schema.kinds[k.in]?.numbered || schema.kinds[k.in]?.named) && !present.has(k.in)))));   // an open kind is made from the nouns below; a group is made by the act group
    if (kindActs.length) lines.push(`@k.${k.name} std.schema.kind of=${k.name} world=${ns} ${kindActs.map((a) => `acts=${a}`).join(' ')}`);
    closed.set(k.name, k);
    if (k.any) {
      const nouns = [...new Set((k.words ?? []).filter((w) => SIMPLE.test(w) && !GENERIC_NOUNS.has(w)))];
      if (nouns.length && acts(k).includes('make')) {
        opens.push(...nouns);
        nouns.forEach((n, i) => nounLines.push(`@n.${k.name}.${i} ${ns}.noun name=${n}`));
      }
    }
  }
  if (opens.length) lines.push(`@o std.schema.kinds from=${ns}.noun key=name world=${ns} acts=make`, ...nounLines);
  for (const a of Object.values(schema.attrs)) {
    for (const kn of a.of) {
      if (!closed.has(kn)) continue;
      if (a.type === 'enum' || a.type === 'colour') {
        const vs = valueWords(a, lists);
        if (vs.length) lines.push(`@s.${kn}.${a.name} core.slot of=${kn} key=${a.name} ${vs.map((v) => `enum=${v}`).join(' ')}`);
      } else if (a.type === 'number' && a.min != null && a.max != null && a.max > a.min) {
        lines.push(`@s.${kn}.${a.name} core.slot of=${kn} key=${a.name} kind=number min=${a.min} max=${a.max}`);
      }
    }
  }
  try { world.load(lines.join("\n")); } catch (e) { if (globalThis.process?.env?.SAMPLER_DEBUG) console.error(e.message, lines.filter((l) => /know/.test(l)).slice(0, 4)); return null; }
  const ids = new Map();
  const anyKind = Object.values(schema.kinds).find((k) => k.any)?.name;
  for (const t of (things ?? []).slice(-cap)) {
    const type = schema.kinds[t.kind] ? t.kind : (Object.values(schema.kinds).find((k) => k.words?.includes(t.kind) || k.words?.includes(t.noun))?.name ?? anyKind);
    if (!type) continue;
    const wid = `t_${ids.size}`;
    ids.set(wid, t);
    try { world.load(`@${wid} ${type} kind=${type}`); } catch { ids.delete(wid); }
  }
  return { world, ids, entries };
}

/** Renders a frame as a sentence a person could type (the forms every schema world reads); null when the frame has no sentence. */
export function realise(frame, schema, ids, labelOf, entries, en) {
  const a = frame.args ?? {};
  const known = entries?.get(String(a.kind ?? ''));
  if (known && frame.action === 'make') {   // a thing named from knowledge: "Show Lima.", "Play Ode to Joy.", "Add a giraffe."; verb * = the entry is the whole sentence
    const t = known.entry.text;
    return known.verb === '*' ? t : `${known.verb ? known.verb[0].toUpperCase() + known.verb.slice(1) : 'Add'} ${t}.`;
  }
  if (!en) return null;   // the sentences are the language world's generation templates (w.lang.en), filled by the library: without them there is no sentence
  const label = (id) => { const t = ids.get(id); return t ? labelOf(t) : null; };
  const say = (act, roles) => en.actSentence(act, roles);
  switch (frame.action) {
    case 'make': return a.kind && SIMPLE.test(String(a.kind).replace(/_/g, '')) ? say('make', { kind: a.kind }) : null;
    case 'remove': case 'copy': case 'pick': { const l = label(a.thing); return l ? say(frame.action, { thing: l }) : null; }
    case 'undo': return say('undo', {});
    case 'ask': {
      const l = label(a.thing);
      if (!l) return null;
      return a.attr && !FUNCTION_WORDS.has(a.attr) ? say('ask', { topic: a.attr, thing: l }) : null;   // a question with no attribute has no form that every world reads
    }
    case 'change': { const l = label(a.thing); return l && a.attr && !FUNCTION_WORDS.has(a.attr) && a.value != null ? say('change', { attribute: a.attr, thing: l, value: bare(a.value) }) : null; }
    case 'redo': return say('redo', {});
    default: return null;
  }
}

/**
 * The sampler of a host. `lib` is the sopworld namespace; `worldOf(id)` gives { schema, executor } of a schema world (or null); `thingsOf(id)` the things of the session in that world.
 * `available` is false without `sample` in the library, and every call then returns [].
 */
export function createSampler(lib, { worldOf, thingsOf, historyOf, knowledgeOf }) {
  const fn = typeof lib?.sample === 'function' ? lib.sample : null;
  let en0 = null;
  const english = () => (en0 ??= englishOf(lib, languageWorld(lib)));   // the language world's generation, built once
  const seen = [];   // frames shown in this session (novelty)
  const shown = new Set();   // sentences shown in this session: a press does not repeat one while another tries remain
  let counter = 0;
  const dicing = {};   // per world: { n: changes the dice's own sessions made and not yet taken back, last: the history length at the last offered change }
  /** mode: 'one' | 'few' | 'actions'; opts: { worldId, thing (an id of the session), seed, count }. Returns [{ text, frame, world }]. */
  function sample(mode, { worldId, thing, seed, count } = {}) {
    if (!fn) return [];
    const w = worldOf?.(worldId);
    if (!w?.schema) return [];
    const things = thingsOf?.(worldId) ?? [];
    const seed0 = seed ?? ++counter * 7919;
    const sw = sampleWorldOf(lib, w.schema, things, { lists: knowledgeOf?.(worldId) ?? {}, seed: seed0 });
    if (!sw) return [];
    // undo: only after a change the dice's own press made, and at most one press in ten (a roll of the seed)
    const mine = (dicing[worldId] ??= { n: 0, last: null });
    const hist = historyOf?.(worldId) ?? 0;
    if (mine.last != null && hist > mine.last) mine.n++;
    mine.last = null;
    const redoOk = mine.undone && [...w.schema.acts].includes('redo') && roll(seed0, 1) < 0.7;   // a redo is legal right after the dice's own undo
    mine.undone = false;
    const undoOk = mine.n > 0 && hist > 0 && roll(seed0, 5) < 0.1;
    // how a person points at one thing: the world's own label; when another thing has the same label, its colour or its name (a label that stays ambiguous is not used)
    const own = (t) => (w.executor?.labels ? w.executor.labels([{ id: t.id, kind: t.kind, n: t.n, name: t.name ?? null, attrs: t.attrs ?? {} }]) : `the ${t.kind}`);
    const labelOf = (t0) => { const l = labelOf0(t0); return l && l.replace(/composite:/g, ''); };   // a thing of the catalog is a "composite:pier" in the state, a pier in words
    const labelOf0 = (t) => {
      if (t.say) return t.say;   // the world says how a person points at the thing
      const base = own(t), same = things.filter((x) => own(x) === base);
      if (same.length < 2) return base;
      const colour = (x) => x.attrs?.color ?? x.attrs?.colour;
      if (colour(t) && same.filter((x) => colour(x) === colour(t)).length === 1) return base.replace(/^the /, `the ${colour(t)} `);
      return /^[A-Za-z]+\d+$/.test(t.id) && !/^o\d+$/.test(t.id) && w.schema.flags?.name !== false && same.filter((x) => x.id === t.id).length === 1 && !/^(t_|thing)/.test(t.id) ? t.id : null;
    };
    const wire = thing ? [...sw.ids].find(([, t]) => t.id === thing)?.[0] : undefined;
    const by = (f) => { const t = sw.ids.get(f.args?.thing); return t; };
    const out = [], texts = new Set();
    if (redoOk && mode === 'one') { const t = english().actSentence('redo', {}); if (t) return [{ text: t, frame: { action: 'redo', args: {} }, world: worldId }]; }
    for (const attempt of [0, 1, 2, 3, 4, 5]) {   // six tries with other seeds
      if (out.length >= (count ?? (mode === 'one' ? 1 : 4))) break;
      const r = fn(sw.world, { seed: seed0 + attempt * 104729, mode: mode === 'one' ? 'few' : mode, n: Math.max(8, (count ?? 4) * 3), prefer: { world: w.schema.id, ...(wire ? { thing: wire } : {}) }, seen });
      for (const f of r.frames ?? []) {
        // a change to the value the thing already has is no change: the host knows the real attributes
        if (f.action === 'undo' && !undoOk) continue;   // the host's history and the dice's own changes, not the library's
        if (f.action === 'change') { const t = by(f); if (t && String(t.attrs?.[f.args.attr] ?? '') === bare(f.args.value)) continue; }
        const text = realise(f, w.schema, sw.ids, labelOf, sw.entries, english());
        if (!text || texts.has(text)) continue;
        if (shown.has(text) && f.action !== 'undo' && attempt < 5) continue;
        texts.add(text); shown.add(text);
        const named = f.action === 'make' ? sw.entries.get(String(f.args?.kind ?? ''))?.entry : null;   // a thing named from knowledge says its own act (a question about a distance is an ask)
        const frame = { ...f, ...(named?.act ? { action: named.act } : {}), args: { ...f.args, ...(by(f) ? { thing: by(f).id } : {}) } };
        out.push({ text, frame, world: worldId });
        for (let i = 0; i < 2; i++) seen.push({ action: frame.action, args: { kind: f.args?.kind } });   // novelty: a kind or an act used counts double, so the next press looks elsewhere
        if (f.action === 'undo') { mine.n = Math.max(0, mine.n - 1); mine.undone = true; }
        else if (['make', 'remove', 'change', 'copy'].includes(frame.action)) mine.last = hist;
        if (out.length >= (count ?? (mode === 'one' ? 1 : 4))) break;
      }
    }
    return out;
  }
  return { available: Boolean(fn), thingsOf, sample, dice: (o) => sample('one', o)[0] ?? null, examples: (o) => sample('few', o), actions: (o) => sample('actions', { count: 6, ...o }) };
}

/**
 * The sampler of a dialog engine and its session: the schema worlds (those whose operations carry an executor), their things (the world's `referents`) and history.
 * `session()` gives the current session (it can be replaced by a restore).
 */
export function engineSampler(lib, engine, session) {
  const schemaWorld = (id) => engine.set.list().find((y) => y.id === id)?.ops?.executor;
  const sampler = createSampler(lib, {
    worldOf: (id) => { const x = schemaWorld(id); return x?.schema ? { schema: x.schema, executor: x } : null; },
    historyOf: (id) => session().state(id)?.history?.length ?? 0,
    knowledgeOf: (id) => {
      const lists = {};
      try { const readable = new Set(colourLexiconWords()); lists.colours = [...colourWordSet()].filter((c) => readable.has(c)); }   // the colours the readers take as colour words (not "cherry", a fruit)
      catch { /* no colours: the schema's own */ }
      try { Object.assign(lists, schemaWorld(id)?.sampleKnowledge?.({ state: session().state(id) ?? {}, knowledge: engine.knowledge, world: engine.set.get(id) }) ?? {}); } catch { /* the world's lists are optional */ }
      return lists;
    },
    thingsOf: (id) => {
      try { return schemaWorld(id).referents({ state: session().state(id) ?? {}, knowledge: engine.knowledge }).map((r) => ({ id: r.id, kind: r.kind, noun: r.noun, name: r.name, say: r.say, n: r.n ?? (Number(/(\d+)$/.exec(r.id)?.[1]) || undefined), attrs: r.attrs, salient: !!r.salient, nodice: !!r.nodice })).filter((r) => !r.nodice); } catch { return []; }
    },
  });
  /** Ids of the worlds the dice can draw from (a schema world with a sampleable kind), and a map tab id -> world id. */
  const worlds = () => engine.set.list().filter((w) => w.ops?.executor?.schema).map((w) => w.id);
  return { ...sampler, worlds };
}
