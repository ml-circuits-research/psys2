// SPDX-License-Identifier: AGPL-3.0-only
// Operations of session.things (spec 23): learn (session.learned), sync (a view publishes its things), show (select things into a view), list. Browser-safe.
import { parseTeach, learn as learnWire } from '../../src/knowledge/learned.mjs';
import { ASPECTS, aspectsOf, ensure, find, labelOf, sync as syncStore, viewByWords, whyNot } from './things.mjs';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const ok = (value, extra = {}) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n) ? 'an' : 'a'} ${n}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function initialState() { return { things: [], views: {}, learned: [], n: 0 }; }

/** The aspects of a stored thing, from what the session's knowledge says about its kind (the settled lookup, learned wires included). */
function aspectsFor(ctx) {
  const k = ctx.knowledge;
  const lend = (p) => { const t = k?.peek?.(p); return t ? Object.keys(aspectsOf({ kind: p, th: t })).filter((a) => a !== 'textual' && a !== 'relational') : []; };
  return (t, it = {}) => {
    const kind = String(t.kind).toLowerCase().replace(/_/g, ' ');
    return aspectsOf({
      kind, attrs: t.attrs, parts: t.parts, th: k?.peek?.(t.name ? t.name : kind) ?? k?.peek?.(kind) ?? null, declared: it.declared ?? [], attrTypes: it.attrTypes ?? {},
      ancestors: k?.ancestors?.(kind) ?? [], lend,
    });
  };
}

/** The user teaches a fact (arg.text is the sentence): the wire is stored in the session, a thing of the user also enters the store. */
export function learn(ctx, { text } = {}) {
  const st = ensure(ctx.state);
  const taught = parseTeach(text ?? ctx.segment?.text);
  if (!taught) return no('unsupported', 'I did not catch what to remember. You can say "a villa is a kind of house", "my dog is called Rex", "ducks can float" or "fish live in water".');
  const r = learnWire(st.learned, taught);
  if (r.existing) return ok(`I already know that. ${taught.say.replace(/^OK, /, '')}`);
  const base = ctx.knowledge?.base ?? ctx.knowledge;
  for (const word of [taught.object, taught.subject]) { try { base?.thing?.(String(word).toLowerCase())?.catch?.(() => null); } catch { /* the catalog is optional */ } }   // fill the settled cache for the next turn
  if (taught.form === 'own') {
    const id = `th${++st.n}`;
    const t = { id, kind: taught.subject, name: taught.object, attrs: { owner: 'you' }, origin: 'learned', shown: ['learned'] };
    st.things.push(t);
    t.aspects = { ...aspectsFor(ctx)(t), social: 'schema' };
  }
  return ok(taught.say, { form: taught.form, wire: r.line });
}

/** A view publishes its things: `view` (its id) and `items` (the whole list). Returns { ids: { key: thingId } }. */
export function sync(ctx, { view, items } = {}) {
  const st = ensure(ctx.state);
  if (!view) return no('missing', 'No view named.');
  const aspects = aspectsFor(ctx);
  return ok(syncStore(st, view, items ?? [], aspects), { note: 'synced' });
}

/** The views the loaded worlds declare (their `view` operation), cached by the list of worlds. */
function viewsOf(ctx, st) {
  const worlds = ctx.worlds?.() ?? [];
  const key = worlds.map((w) => w.id).join('|');
  if (st.viewKey === key && Object.keys(st.views).length) return Object.values(st.views);
  const out = {};
  for (const w of worlds) {
    budget.tick('things.views');
    const r = ctx.request(`${w.id}.view`, {});
    if (r?.status === 'supported' && r.value && typeof r.value === 'object' && r.value.id) out[r.value.id] = r.value;
  }
  st.views = out; st.viewKey = key;
  return Object.values(out);
}

/** Select things into a view. args: { ids | thing (words), to (the view's words), from (the view that sends) }. */
export function show(ctx, { ids, thing, to, from } = {}) {
  const st = ensure(ctx.state);
  const views = viewsOf(ctx, st);
  const view = viewByWords(views, to);
  if (!view) return no('unsupported', `I do not know a place called "${to}" to show things in. I can show things in ${list(views.map((v) => `the ${v.noun}`)) || 'no view yet'}.`);
  const things = (ids?.length ? ids.map((id) => st.things.find((t) => t.id === id)).filter(Boolean) : find(st, thing));
  if (!things.length) return no('missing', `There is nothing to show in the ${view.noun}: no such thing in this session yet.`);
  const cells = [], lines = [];
  for (const t of things) {
    budget.tick('things.show');
    const cell = { id: t.id, kind: t.kind, name: t.name, to: view.id };
    const why = whyNot(t, view);
    if (t.shown.includes(view.id)) { cell.status = 'already'; cell.note = `${labelOf(t) === t.kind ? `The ${t.kind}` : labelOf(t)} is already in the ${view.noun}.`; }
    else if (why) { cell.status = 'na'; cell.note = why; }
    else {
      const r = ctx.request(`${view.id}.adopt`, { thing: { id: t.id, kind: t.kind, name: t.name, label: t.label, attrs: t.attrs, parts: t.parts, origin: t.origin, originNoun: views.find((v) => v.id === t.origin)?.noun } });
      if (r?.status === 'supported') { cell.status = 'ok'; cell.note = String(r.value ?? r.note); }
      else { cell.status = 'refused'; cell.note = String(r?.note ?? r?.value ?? `The ${view.noun} cannot take ${an(t.kind)}.`); }
    }
    cells.push(cell); lines.push(cell.note);
  }
  ctx.effect('things.shown', { to: view.id, cells });
  ctx.effect('things.shown.' + view.id, { n: cells.filter((c) => c.status === 'ok').length });
  return ok(lines.join(' '), { cells });
}

/** What the store holds, one line per thing with its aspects and the views that show it. */
export function list_(ctx) {
  const st = ensure(ctx.state);
  if (!st.things.length) return ok('No things yet in this session.');
  return ok(st.things.map((t) => `${labelOf(t)} (${t.kind}; ${Object.keys(t.aspects ?? {}).filter((a) => ASPECTS.includes(a)).join(', ')}; in ${t.shown.join(', ')})`).join('; ') + '.');
}
export { list_ as list };
