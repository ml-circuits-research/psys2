// The actions of kids.tasks on the library's action context. The library keeps one function registry for the whole world (its builtins
// add, sub, count ... are in it), so every function of a world is registered under its name prefixed with the world's short name (`tasks.add`). The entries are wires; an
// action finds them, tells new ones, replaces or retracts them, all in one transaction.
const norm = (s) => String(s ?? '').replace(/^"|"$/g, '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (s) => norm(s).replace(/^(my|the|a|an|some|our)\s+/, '');
const split = (s) => [...new Set(String(s ?? '').replace(/^"|"$/g, '').split(/\s*,\s*|\s+and\s+/).map(clean).filter(Boolean))];
const listName = (raw) => {
  const n = norm(raw).replace(/^(my|the|a|an|our)\s+/, '').replace(/\s+list$/, '');
  if (!n || /^(to do|todo|to-do|tasks?|things to do|chores?)$/.test(n)) return 'to-do';
  if (/^(shopping|shop|grocery|groceries)$/.test(n)) return 'shopping';
  return /^reminders?$/.test(n) ? 'reminders' : n;
};
const q = JSON.stringify;
// reply facts for the unchanged templates (what ops.mjs put in `note` and `unit`)
const THING = 'thing';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const were = (a, yes, no) => (a.length > 1 ? yes : no);
const within = (a, b) => ` ${a} `.includes(` ${b} `);

/** The entries, oldest first, as { id, list, text, done }; of one list when a name is given. */
const entries = (ctx, list) => ctx.find('kids.tasks.entry')
  .map((w) => ({ id: w.id, list: norm(ctx.val(w, 'list')), text: norm(ctx.val(w, 'text')), done: ctx.val(w, 'progress') === 'done' }))
  .filter((e) => list === undefined || e.list === list);
/** Entries that a text names: the exact ones, else those that contain it or are contained in it. */
const named = (items, text) => {
  const exact = items.filter((e) => e.text === text);
  return exact.length ? exact : items.filter((e) => within(e.text, text) || within(text, e.text));
};
const missing = (value) => ({ status: 'missing', ...(value === undefined ? {} : { value }) });
const ambiguous = (found) => ({ status: 'ambiguous', alternatives: found.map((e) => `${e.text} (${e.list})`) });

function addTo(ctx, list, item) {
  const have = entries(ctx, list).map((e) => e.text);
  const all = split(item);
  const added = all.filter((text) => !have.includes(text)), present = all.filter((text) => have.includes(text));
  for (const text of added) ctx.tell(`@task_${ctx.world.seq + 1} kids.tasks.entry list=${q(list)} text=${q(text)} progress=todo`);
  if (!all.length) return missing(list);
  const note = !present.length ? undefined : added.length ? `${cap(joinAnd(present))} ${were(present, 'were', 'was')} already there.` : `${cap(joinAnd(present))} ${were(present, 'are', 'is')} already on your ${list} list.`;
  return { value: list, ...(added.length ? { values: added } : {}), ...(note ? { note } : {}) };
}

export const fns = {
  add: (ctx, { item, list }) => addTo(ctx, listName(list), item),
  remind: (ctx, { item }) => addTo(ctx, 'reminders', item),
  remove(ctx, { item, list }) {
    const name = list === undefined ? undefined : listName(list);
    const removed = [], absent = [];
    let where = name;
    for (const text of split(item)) {
      const found = named(entries(ctx, name), text);
      if (found.length > 1) return ambiguous(found);
      if (!found.length) { absent.push(text); continue; }
      ctx.retract(found[0].id);
      removed.push(found[0].text);
      where = found[0].list;
    }
    return removed.length ? { value: where, values: removed, ...(absent.length ? { note: `${cap(joinAnd(absent))} ${were(absent, 'were', 'was')} not on the list.` } : {}) } : missing(name);
  },
  done(ctx, { item, list }) {
    const name = list === undefined ? undefined : listName(list);
    let found = named(entries(ctx, name), clean(item));
    if (!clean(item) || !found.length) return missing(name);
    if (found.some((e) => !e.done)) found = found.filter((e) => !e.done);
    if (found.length > 1) return ambiguous(found);
    if (found[0].done) return { value: found[0].list, note: `${cap(found[0].text)} is already marked as done.` };
    ctx.fill(found[0].id, 'progress', 'done');
    return { value: found[0].list, values: [found[0].text] };
  },
  check(ctx, { item }) {
    const found = named(entries(ctx), clean(item));
    const done = found.find((e) => e.done);
    if (!found.length) return missing();
    return done ? { value: done.list, values: [done.text] } : { ...missing(found[0].list), values: [found[0].text] };
  },
  has(ctx, { item, list }) {
    const [hit] = named(entries(ctx, listName(list)), clean(item));
    return hit ? { value: hit.list, values: [hit.text], ...(hit.done ? { note: 'It is already done.' } : {}) } : missing(listName(list));
  },
  show(ctx, { list }) {
    const name = listName(list), items = entries(ctx, name);
    if (!items.length) return missing(name);
    const todo = items.filter((e) => !e.done).map((e) => e.text), done = items.filter((e) => e.done).map((e) => e.text);
    return { value: name, ...(todo.length ? { values: todo } : {}), ...(done.length ? { note: todo.length ? `Done: ${joinAnd(done)}.` : `Everything on your ${name} list is done. Well done!` } : {}) };
  },
  pending(ctx, { list }) {
    const name = listName(list), items = entries(ctx, name);
    if (!items.length) return missing(name);
    const todo = items.filter((e) => !e.done).map((e) => e.text);
    return todo.length ? { value: name, values: todo } : { value: name, note: `Everything on your ${name} list is done. Well done!` };
  },
  count(ctx, { list }) {
    const items = entries(ctx, listName(list)), done = items.filter((e) => e.done).length;
    return items.length ? { value: items.length, unit: THING, ...(done ? { note: `${done} ${done === 1 ? 'is' : 'are'} done.` } : {}) } : { ...missing(0), unit: THING };
  },
  countPending(ctx, { list }) {
    const name = listName(list), items = entries(ctx, name);
    if (!items.length) return { ...missing(0), unit: THING };
    const todo = items.filter((e) => !e.done).length;
    return { value: todo, unit: THING, ...(todo ? {} : { note: `Nothing is left on your ${name} list. Well done!` }) };
  },
  clear(ctx, { list }) {
    const name = listName(list), items = entries(ctx, name);
    for (const e of items) ctx.retract(e.id);
    return items.length ? { value: items.length, unit: THING } : { note: `Your ${name} list is already empty.` };
  },
  lists(ctx) {
    const names = [...new Set(entries(ctx).map((e) => e.list))];
    return names.length ? { values: names.map((n) => `${n} (${entries(ctx, n).length})`) } : missing();
  },
  notDone: (ctx, { item } = {}) => {
    const what = clean(item);
    return { note: what ? `Okay, I did not tick off ${what}. Nothing changed on your lists. Tell me when you have done it.` : 'Okay, nothing changed on your lists.' };
  },
};

/**
 * The session state the other hooks of the world read (`referents`, `summary`, the dialogue layer's undo snapshots) in the shape ops.mjs keeps it:
 * { lists: { name: [{ id, text, done }] }, counter }. The host layer calls it after every action and puts the result in the session state.
 */
export function toState({ find }) {
  const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
  const lists = {};
  let counter = 0;
  for (const w of find('kids.tasks.entry')) {
    counter++;
    (lists[un(w.attrs.list?.[0])] ??= []).push({ id: w.id, text: un(w.attrs.text?.[0]), done: un(w.attrs.progress?.[0]) === 'done' });
  }
  return { lists, counter };
}
