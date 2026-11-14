// SPDX-License-Identifier: AGPL-3.0-only
// A schema world as a VIEW of the session things (spec 23). `withView(schema, ns, hooks)` wraps the hooks of an acts executor so that, with no code in the world:
//   - after every request the world's things are published to the store (`things.sync`), each keeping its id across views;
//   - the knowledge tier is read before the roles are used: a word the schema does not know that the knowledge (catalog or what the user taught) says is a kind of a kind of this
//     world is read as that kind ("a waiter is a kind of person" makes "add a waiter" a guest), and "my sister" is the name the user gave;
//   - the act `send` hands things to another view through the store (`things.show`), which says plainly when a view cannot take a thing.
// `viewOps(X, schema, ns, H)` gives the two operations of the world as a view: `view` (its declaration) and `adopt` (take a thing of the store: the act make, then change for each
// attribute it carries). Browser-safe, no `process`; every loop ticks the budget.
import { aspectOfAttr } from './things.mjs?v=f904abbe0f';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const lc = (s) => String(s ?? '').toLowerCase();
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
const SKIP = new Set(['a', 'an', 'the', 'my', 'our', 'your', 'this', 'that', 'another', 'some', 'it', 'them', 'all', 'every', 'each', 'first', 'second', 'third', 'last', 'new', 'more']);
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n) ? 'an' : 'a'} ${n}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plain = (k) => String(k).replace(/_/g, ' ');

export function withView(schema, ns, hooks = {}) {
  if (!schema.view) return hooks;
  const kinds = Object.values(schema.kinds);
  const cur = { ctx: null, adopting: null, note: '' };
  const kindOf = (w) => kinds.find((k) => w === k.name || w === k.plural || k.words.includes(w) || singular(w) === k.name || k.words.includes(singular(w)));
  const attrTypes = Object.fromEntries(Object.values(schema.attrs).map((a) => [a.name, a.type]));
  const toks = (t) => lc(t).replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter(Boolean);
  const kn = () => cur.ctx?.knowledge ?? null;

  /** The knowledge tier before the roles are used: an unknown word that is a kind of a kind of this world, and the user's own things ("my sister"). */
  function before(ctx, act, req) {
    cur.ctx = ctx; cur.note = '';
    hooks.before?.(ctx, act, req);
    const k = kn();
    if (!k || typeof req.thing !== 'string' || req.keep) return;   // `keep`: the world reads the words as said (a goal word of a plan: "farm" is not "a kind of thing")
    const ts = toks(req.thing);
    const content = ts.filter((w) => !SKIP.has(w) && !/^\d+$/.test(w));
    if (!content.length || content.some((w) => kindOf(w))) return;
    const said = lc(req.text ?? ctx.segment?.text ?? '');   // the act reader drops a determiner from the role ("my sister" gives thing=sister): the sentence still says whose it is
    const mine = /^(?:my|our)\s/.test(lc(req.thing).trim());
    for (let i = content.length - 1; i >= 0; i--) {   // the head noun is the last word
      budget.tick('view.knowledge');
      const w = content[i];
      const my = mine || new RegExp(`\\b(?:my|our)\\s+(?:\\w+\\s+)?${w.replace(/[^\w']/g, '')}\\b`).test(said);
      const own = my ? k.own?.(w)?.[0] : null;
      const via = [w, ...(own ? [own.kind] : [])];
      for (const v of via) {
        const hit = (k.ancestors?.(v) ?? []).map((a) => kindOf(a)).find(Boolean) ?? (kindOf(v) ? kindOf(v) : null);
        if (!hit) continue;
        req.thing = hit.name;
        if (own && !req.value && hit.named) req.value = own.name;
        cur.note = own ? `${plain(own.name)} is your ${own.kind}, ${an(own.kind)} is a kind of ${plain(hit.name)}.` : `${an(w)} is a kind of ${plain(hit.name)}.`.replace(/^a /, 'A ').replace(/^an /, 'An ');
        return;
      }
    }
  }

  function itemsOf(ctx) {
    if (hooks.thingsOf) return hooks.thingsOf(ctx).map((t) => ({ ...t, key: t.key ?? t.kind }));
    const items = ctx.state.items ?? [];
    return items.map((i) => ({
      key: i.id, thingId: i.thingId, kind: i.kind, name: i.name ?? null, attrs: { ...(i.attrs ?? {}) },
      label: schema.kinds[i.kind]?.numbered ? `${i.kind} ${i.n}` : null,
      place: i.place ? (() => { const c = items.find((x) => x.id === (i.place.ref ?? i.place.id)); return c ? (c.name ?? `${c.kind} ${c.n}`) : null; })() : null,
    }));
  }
  const decorate = (it) => ({ ...it, declared: schema.kinds[it.kind]?.aspects ?? [], attrTypes });
  function publish(ctx) {
    const items = itemsOf(ctx);
    if (cur.adopting) { const fresh = items.find((i) => !i.thingId && !(ctx.state.thingIds ?? {})[i.key]); if (fresh) fresh.thingId = cur.adopting.id; }
    const r = ctx.request('things.sync', { view: ns, items: items.map(decorate) });
    const ids = r?.status === 'supported' ? r.value?.ids ?? r.ids : null;
    if (!ids) return;
    if (hooks.thingsOf) ctx.state.thingIds = { ...(ctx.state.thingIds ?? {}), ...ids };
    else for (const i of ctx.state.items ?? []) if (ids[i.id]) i.thingId = ids[i.id];
  }
  function after(ctx, act, req, r) {
    let out = hooks.after?.(ctx, act, req, r) ?? r;
    try { publish(ctx); } catch (e) { if (e?.name === 'BudgetError' || e?.name === 'TurnAborted') throw e; /* a store that cannot be reached never breaks the act */ }
    if (cur.note && out?.status === 'supported' && typeof out.note === 'string' && !cur.adopting) out = { ...out, note: `${cur.note} ${out.note}`, value: `${cur.note} ${out.value ?? out.note}` };
    return out;
  }
  /** `send` through the store: the thing ids of the items are the identity; the store decides whether the other view can take them. */
  function send(items, to) {
    const ctx = cur.ctx;
    if (!ctx) return false;
    const ids = items.map((i) => i.thingId ?? (ctx.state.thingIds ?? {})[i.id ?? i.key]).filter(Boolean);
    if (!ids.length) { publish(ctx); }
    const all = items.map((i) => i.thingId ?? (ctx.state.thingIds ?? {})[i.id ?? i.key] ?? ctx.state.items?.find((x) => x.id === i.id)?.thingId).filter(Boolean);
    const r = ctx.request('things.show', { ids: all, to, from: ns });
    if (r?.status !== 'supported') return String(r?.note ?? `I cannot reach the ${to} from here.`);
    const cells = r.cells ?? r.value?.cells ?? [];
    return cells.length && cells.every((c) => c.status !== 'ok') ? String(r.value?.say ?? r.value ?? r.note) : { say: String(r.value?.say ?? r.value ?? r.note) };
  }
  /** A world whose things are published by a hook (the avatar: no items) sends by the words of the published things. */
  const domainSend = (ctx, req) => {
    cur.ctx = ctx;
    const want = lc(req.thing ?? 'it').replace(/\b(?:the|a|an|my|your)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const mine = itemsOf(ctx).map((t) => ({ ...t, thingId: t.thingId ?? (ctx.state.thingIds ?? {})[t.key] }));
    const hit = mine.filter((t) => !want || /^(?:it|them|all|everything)$/.test(want) || [t.kind, t.name, plain(t.kind)].some((x) => x && (lc(x) === want || lc(x) === singular(want))) || (/^(?:me|myself|yourself|face|avatar)$/.test(want) && t.kind === 'face'));
    if (!hit.length) {   // not a thing of this world: the session store knows every thing of the session by its words
      const r = ctx.request('things.show', { thing: want, to: req.place ?? '', from: ns });
      return r?.status === 'supported' ? { status: 'supported', value: String(r.value) } : { status: 'unsupported', note: String(r?.note ?? `I have no ${want || 'thing'} to send.`) };
    }
    const r = send(hit, req.place ?? '');
    return typeof r === 'string' ? { status: 'unsupported', note: r } : r ? { status: 'supported', value: r.say } : { status: 'unsupported', note: 'I cannot send that from here.' };
  };

  const know = { ...(hooks.know ?? {}) };
  return {
    ...hooks, know,
    before, after, send,
    domain: hooks.thingsOf ? { ...(hooks.domain ?? {}), send: hooks.domain?.send ?? domainSend } : hooks.domain,
    adopting: (thing) => { cur.adopting = thing; },
  };
}

export function viewOps(X, schema, ns, H = {}) {
  const declaration = () => ({
    id: ns, noun: schema.noun, words: [...(schema.view?.words ?? [])], aspects: [...(schema.view?.aspects ?? [])],
    kinds: Object.values(schema.kinds).map((k) => k.name),
  });
  const view = () => ({ status: 'supported', value: declaration(), note: `${ns} is a view of the session things` });
  const kinds = Object.values(schema.kinds);
  const kindOf = (w) => kinds.find((k) => w === k.name || w === k.plural || k.words.includes(w) || singular(w) === k.name || k.words.includes(singular(w)));
  /** Where a kind of thing is at home, said when this world has no such kind: the other views (declared in the store) that do. */
  function adopt(ctx, { thing } = {}) {
    if (!thing?.kind) return { status: 'unsupported', note: 'I was given nothing to take.' };
    const k = ctx.knowledge;
    const lend = (a) => !['textual', 'relational'].includes(a) && thing.aspects?.[a];
    let byAspect = false;
    const kind = kindOf(lc(thing.kind)) ?? (k?.ancestors?.(lc(thing.kind)) ?? []).map((a) => kindOf(a)).find(Boolean) ?? kinds.find((x) => (x.aspects ?? []).some(lend) && (byAspect = true));   // last: a kind this world declares with an aspect the thing has (a month is a moment of a timeline)
    if (!kind) return { status: 'unsupported', note: `${cap(thing.name ? thing.name : an(plain(thing.kind)))} is not something the ${schema.noun} has.` };
    if (kind.max && (ctx.state.items ?? []).filter((i) => i.kind === kind.name).length >= kind.max && !H.domain) return { status: 'unsupported', note: `The ${schema.noun} is full of ${kind.plural}.` };
    const named = kind.named && (thing.name ?? (byAspect ? cap(plain(thing.kind)) : null));
    const via = byAspect ? '' : kind.name !== lc(thing.kind) ? `${an(plain(thing.kind))} is a kind of ${plain(kind.name)}. ` : '';
    H.adopting?.(thing);
    try {
      const made = X.operation(ctx, 'make', { thing: kind.name, ...(named ? { value: named } : {}), text: `add ${an(kind.name)}` });
      if (made.status !== 'supported' || /^(?:There is no|I cannot|I did not|I do not know|No )/i.test(String(made.note))) return { status: 'unsupported', note: String(made.note ?? `The ${schema.noun} cannot take ${an(plain(thing.kind))}.`) };
      const carried = [];
      for (const [name, value] of Object.entries(thing.attrs ?? {})) {
        budget.tick('view.adopt');
        const a = schema.attrs[name];
        if (!a || !a.of.includes(kind.name) || value == null || value === '') continue;
        const r = X.operation(ctx, 'change', { thing: H.domain?.change ? kind.name : 'it', attribute: name, value: String(value), text: `make it ${value}` });
        if (r.status === 'supported' && !/^(?:I cannot|I did not|There is no|I do not know)/i.test(String(r.note))) carried.push(`${name} ${value}`);
      }
      const label = named ? `${kind.name} ${named}` : an(plain(kind.name));
      return { status: 'supported', value: `${via}I put ${label} in the ${schema.noun}${carried.length ? ` (${carried.join(', ')})` : ''}.`, note: `adopted ${thing.id}`, kind: kind.name };
    } finally { H.adopting?.(null); }
  }
  return { view, adopt };
}
export { aspectOfAttr };
