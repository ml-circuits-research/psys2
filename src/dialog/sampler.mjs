// SPDX-License-Identifier: AGPL-3.0-only
// SAMPLER (specs/25-random-as-a-world.md): the host side of sopworld `sample` (0.59, std.sample). The library draws random frames that are legal in the current state,
// weighted by recency and novelty; this module only (1) states a tab's world to the library (its schema and the things the session holds, as facts), (2) renders a frame as
// a sentence, and (3) keeps a host check that a change really changes something. There is NO generator of our own: no list of examples, no placeholders to fill.
// Browser-safe: no `node:*` imports; the library module and the world registry are passed in.

const NOT_SAMPLED = new Set(['place', 'connect', 'group', 'send', 'save', 'load', 'redo']);   // acts the library cannot frame (a place, a second thing, a host act): left to typing
const FUNCTION_WORDS = new Set(['to', 'from', 'at', 'until', 'in', 'on', 'by', 'of']);   // attributes named like prepositions cannot be said in "Set X <attr> to V"
const GENERIC_NOUNS = new Set(['object', 'item', 'shape', 'thing', 'things', 'items', 'objects', 'shapes']);   // words that name every kind, not one
const SIMPLE =/^[a-z]+$/;
const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
const q = (v) => (SIMPLE.test(String(v)) || /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));

/** The values a slot can take, as words a person says: no `light_red` forms, at most 14. */
const valueWords = (a) => (a.type === 'colour' && !a.values.length ? ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'grey'] : a.values.filter((v) => SIMPLE.test(v)).slice(0, 14));

/**
 * The library's world for one schema world and the things of the session: types, slots and kinds of the schema, the nouns an open kind takes, and one wire per thing.
 * `things`: [{ id, kind, noun?, attrs }] (the world's `referents`). Returns { world, ids } where `ids` maps a wire id back to the thing.
 */
export function sampleWorldOf(lib, schema, things, { cap = 40 } = {}) {
  const world = new lib.World();
  const ns = schema.id;
  const lines = ['@acts core.use world=std.acts', `@w std.schema.world name=${ns}`];
  const acts = (k) => (k.acts?.length ? k.acts : [...schema.acts]).filter((a) => !NOT_SAMPLED.has(a) && ['make', 'remove', 'change', 'ask', 'copy', 'pick', 'undo'].includes(a));
  const present = new Set((things ?? []).map((t) => t.kind));
  const closed = new Map();
  for (const k of Object.values(schema.kinds)) {
    lines.push(`@t.${k.name} core.type of=${k.name} extends=std.schema.thing`);
    const kindActs = acts(k).filter((a) => !k.diceNot?.includes(a)).filter((a) => !(k.any && a === 'make') && !(a === 'make' && ((k.name === 'group' && schema.acts.has('group')) || (k.in && k.in !== k.name && (schema.kinds[k.in]?.numbered || schema.kinds[k.in]?.named) && !present.has(k.in)))));   // an open kind is made from the nouns below; a group is made by the act group
    if (kindActs.length) lines.push(`@k.${k.name} std.schema.kind of=${k.name} world=${ns} ${kindActs.map((a) => `acts=${a}`).join(' ')}`);
    closed.set(k.name, k);
    if (k.any) {
      const nouns = [...new Set((k.words ?? []).filter((w) => SIMPLE.test(w) && !GENERIC_NOUNS.has(w)))];
      if (nouns.length && acts(k).includes('make')) {
        lines.push(`@o.${k.name} std.schema.kinds from=${ns}.noun key=name world=${ns} acts=make`);
        nouns.forEach((n, i) => lines.push(`@n.${k.name}.${i} ${ns}.noun name=${n}`));
      }
    }
  }
  for (const a of Object.values(schema.attrs)) {
    for (const kn of a.of) {
      if (!closed.has(kn)) continue;
      if (a.type === 'enum' || a.type === 'colour') {
        const vs = valueWords(a);
        if (vs.length) lines.push(`@s.${kn}.${a.name} core.slot of=${kn} key=${a.name} ${vs.map((v) => `enum=${v}`).join(' ')}`);
      } else if (a.type === 'number' && a.min != null && a.max != null && a.max > a.min) {
        lines.push(`@s.${kn}.${a.name} core.slot of=${kn} key=${a.name} kind=number min=${a.min} max=${a.max}`);
      }
    }
  }
  try { world.load(lines.join('\n')); } catch { return null; }
  const ids = new Map();
  const anyKind = Object.values(schema.kinds).find((k) => k.any)?.name;
  for (const t of (things ?? []).slice(-cap)) {
    const type = schema.kinds[t.kind] ? t.kind : (Object.values(schema.kinds).find((k) => k.words?.includes(t.kind) || k.words?.includes(t.noun))?.name ?? anyKind);
    if (!type) continue;
    const wid = `t_${ids.size}`;
    ids.set(wid, t);
    try { world.load(`@${wid} ${type} kind=${type}`); } catch { ids.delete(wid); }
  }
  return { world, ids };
}

/** Renders a frame as a sentence a person could type (the forms every schema world reads); null when the frame has no sentence. */
export function realise(frame, schema, ids, labelOf) {
  const a = frame.args ?? {};
  const label = (id) => { const t = ids.get(id); return t ? labelOf(t) : null; };
  const noun = (k) => { const n = String(k).replace(/_/g, ' '); return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`; };
  switch (frame.action) {
    case 'make': return a.kind && SIMPLE.test(String(a.kind).replace(/_/g, '')) ? `Add ${noun(a.kind)}.` : null;
    case 'remove': { const l = label(a.thing); return l ? `Remove ${l}.` : null; }
    case 'copy': { const l = label(a.thing); return l ? `Copy ${l}.` : null; }
    case 'pick': { const l = label(a.thing); return l ? `Select ${l}.` : null; }
    case 'undo': return 'Undo that.';
    case 'ask': {
      const l = label(a.thing);
      if (!l) return null;
      return a.attr && !FUNCTION_WORDS.has(a.attr) ? `What is the ${a.attr} of ${l}?` : null;   // a question with no attribute has no form that every world reads
    }
    case 'change': { const l = label(a.thing); return l && a.attr && !FUNCTION_WORDS.has(a.attr) && a.value != null ? `Set ${l} ${a.attr} to ${bare(a.value)}.`.replace(/\s+/g, ' ') : null; }
    default: return null;
  }
}

/**
 * The sampler of a host. `lib` is the sopworld namespace; `worldOf(id)` gives { schema, executor } of a schema world (or null); `thingsOf(id)` the things of the session in that world.
 * `available` is false without `sample` in the library, and every call then returns [].
 */
export function createSampler(lib, { worldOf, thingsOf, historyOf }) {
  const fn = typeof lib?.sample === 'function' ? lib.sample : null;
  const seen = [];   // frames shown in this session (novelty)
  let counter = 0;
  /** mode: 'one' | 'few' | 'actions'; opts: { worldId, thing (an id of the session), seed, count }. Returns [{ text, frame, world }]. */
  function sample(mode, { worldId, thing, seed, count } = {}) {
    if (!fn) return [];
    const w = worldOf?.(worldId);
    if (!w?.schema) return [];
    const things = thingsOf?.(worldId) ?? [];
    const sw = sampleWorldOf(lib, w.schema, things);
    if (!sw) return [];
    // how a person points at one thing: the world's own label; when another thing has the same label, its colour or its name (a label that stays ambiguous is not used)
    const own = (t) => (w.executor?.labels ? w.executor.labels([{ id: t.id, kind: t.kind, n: t.n, name: t.name ?? null, attrs: t.attrs ?? {} }]) : `the ${t.kind}`);
    const labelOf = (t) => {
      const base = own(t), same = things.filter((x) => own(x) === base);
      if (same.length < 2) return base;
      const colour = (x) => x.attrs?.color ?? x.attrs?.colour;
      if (colour(t) && same.filter((x) => colour(x) === colour(t)).length === 1) return base.replace(/^the /, `the ${colour(t)} `);
      return /^[A-Za-z]+\d+$/.test(t.id) && !/^o\d+$/.test(t.id) && w.schema.flags?.name !== false && same.filter((x) => x.id === t.id).length === 1 && !/^(t_|thing)/.test(t.id) ? t.id : null;
    };
    const wire = thing ? [...sw.ids].find(([, t]) => t.id === thing)?.[0] : undefined;
    const by = (f) => { const t = sw.ids.get(f.args?.thing); return t; };
    const out = [], texts = new Set();
    for (const attempt of [0, 1, 2, 3, 4, 5]) {   // six tries with other seeds
      if (out.length >= (count ?? (mode === 'one' ? 1 : 4))) break;
      const r = fn(sw.world, { seed: (seed ?? ++counter * 7919) + attempt * 104729, mode: mode === 'one' ? 'few' : mode, n: Math.max(8, (count ?? 4) * 3), prefer: { world: w.schema.id, ...(wire ? { thing: wire } : {}) }, seen });
      for (const f of r.frames ?? []) {
        // a change to the value the thing already has is no change: the host knows the real attributes
        if (f.action === 'undo' && !(historyOf?.(worldId) > 0)) continue;   // the host's history, not the library's
        if (f.action === 'change') { const t = by(f); if (t && String(t.attrs?.[f.args.attr] ?? '') === bare(f.args.value)) continue; }
        const text = realise(f, w.schema, sw.ids, labelOf);
        if (!text || texts.has(text)) continue;
        texts.add(text);
        out.push({ text, frame: { ...f, args: { ...f.args, ...(by(f) ? { thing: by(f).id } : {}) } }, world: worldId });
        seen.push({ action: f.action, args: { kind: f.args?.kind } });
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
    thingsOf: (id) => {
      try { return schemaWorld(id).referents({ state: session().state(id) ?? {}, knowledge: engine.knowledge }).map((r) => ({ id: r.id, kind: r.kind, noun: r.noun, name: r.name, n: r.n ?? (Number(/(\d+)$/.exec(r.id)?.[1]) || undefined), attrs: r.attrs, salient: !!r.salient })); } catch { return []; }
    },
  });
  /** Ids of the worlds the dice can draw from (a schema world with a sampleable kind), and a map tab id -> world id. */
  const worlds = () => engine.set.list().filter((w) => w.ops?.executor?.schema).map((w) => w.id);
  return { ...sampler, worlds };
}
