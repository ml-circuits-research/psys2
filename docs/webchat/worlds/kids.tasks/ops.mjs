// Operations of kids.tasks (browser-safe: no imports).
//
// All operations are actions on the world's session state (`ctx.state`):
//   ctx.state.lists = { '<list name>': [ { id, text, done } ] }   in insertion order
//   ctx.state.counter = number of items ever added (for stable wire ids)
// Every change is mirrored as a `kids.tasks.entry` wire (same id again replaces the wire), so the
// session memory shows what is on the lists. No real timers or notifications exist: reminders are
// just a list called "reminders".
//
// Result conventions (templates choose by status and by which envelope fields are present):
//   supported + values  : something happened to / is on the list (values = the items)
//   supported + note    : nothing changed (idempotent repeat) or an extra sentence
//   missing             : the list or item was not found (value = list name when known)
//   ambiguous           : several items match (alternatives = "<list>: <item>")

const DEFAULT_LIST = 'to-do';
const THING = 'thing';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const plural = (n, word) => (n === 1 ? word : word + 's');

/** Canonical list name: "my shopping" -> "shopping", "to do" -> "to-do". */
export function listName(raw, dflt = DEFAULT_LIST) {
  let n = norm(raw).replace(/^(my|the|a|an|our)\s+/, '').replace(/\s+list$/, '');
  if (!n) return dflt;
  if (/^(to do|todo|to-do|tasks?|things to do|chores?)$/.test(n)) return 'to-do';
  if (/^(shopping|shop|grocery|groceries)$/.test(n)) return 'shopping';
  if (/^reminders?$/.test(n)) return 'reminders';
  return n;
}
/** Item text: lowercase, without a leading "my/the/a/an/some". */
const clean = (s) => norm(s).replace(/^(my|the|a|an|some|our)\s+/, '');
/** "milk, eggs and bread" -> ["milk", "eggs", "bread"]. */
const splitItems = (s) => [...new Set(String(s ?? '').split(/\s*,\s*|\s+and\s+/).map(clean).filter(Boolean))];

function store(ctx) {
  ctx.state.lists ??= {};
  ctx.state.counter ??= 0;
  return ctx.state;
}
const listOf = (st, name) => st.lists[name] ?? [];
const containsWords = (a, b) => (' ' + a + ' ').includes(' ' + b + ' ');

/** Mirror one item as a wire; the same id replaces the earlier wire. Never breaks the action. */
function mirror(ctx, list, item, progress) {
  try {
    ctx.emit(`@${item.id} kids.tasks.entry list=${JSON.stringify(list)} text=${JSON.stringify(item.text)} progress=${progress}`);
  } catch { /* the lists in ctx.state stay the source of truth */ }
}

/** Items matching a query: exact first, then whole-word containment either way. */
function matchIn(items, q) {
  const exact = items.filter((i) => i.text === q);
  if (exact.length) return exact;
  return items.filter((i) => containsWords(i.text, q) || containsWords(q, i.text));
}

/** Candidates over one list (when `list` is given) or every list. */
function candidates(st, list, q) {
  const names = list ? [listName(list)] : Object.keys(st.lists);
  const out = [];
  for (const name of names) for (const item of matchIn(listOf(st, name), q)) out.push({ name, item });
  const exact = out.filter((c) => c.item.text === q);
  return exact.length ? exact : out;
}

// ---- add / remind ----------------------------------------------------------------------------
function addTo(ctx, name, rawItem) {
  const st = store(ctx);
  const items = splitItems(rawItem);
  if (!items.length) return { status: 'missing', missing: ['item'], value: name };
  const list = (st.lists[name] ??= []);
  const added = [], present = [];
  for (const text of items) {
    const have = list.find((i) => i.text === text);
    if (have) { present.push(text); continue; }
    const item = { id: `task_${++st.counter}`, text, done: false };
    list.push(item);
    added.push(text);
    mirror(ctx, name, item, 'todo');
  }
  const res = { status: 'supported', value: name };
  if (added.length) res.values = added;
  if (present.length) {
    res.note = added.length
      ? `${cap(joinAnd(present))} ${present.length > 1 ? 'were' : 'was'} already there.`
      : `${cap(joinAnd(present))} ${present.length > 1 ? 'are' : 'is'} already on your ${name} list.`;
  }
  return res;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function addItems(ctx, { item, list }) { return addTo(ctx, listName(list), item); }
export function remindMe(ctx, { item }) { return addTo(ctx, 'reminders', item); }

// ---- remove ------------------------------------------------------------------------------------
export function removeItem(ctx, { item, list }) {
  const st = store(ctx);
  const name = list ? listName(list) : undefined;
  const removed = [], absent = [];
  let where = name;
  for (const text of splitItems(item)) {
    const found = candidates(st, name, text);
    if (!found.length) { absent.push(text); continue; }
    if (found.length > 1 && new Set(found.map((c) => c.item.id)).size > 1) {
      return { status: 'ambiguous', alternatives: found.map((c) => `${c.item.text} (${c.name})`), missing: ['item'] };
    }
    const { name: ln, item: it } = found[0];
    st.lists[ln] = st.lists[ln].filter((x) => x.id !== it.id);
    mirror(ctx, ln, it, 'removed');
    removed.push(it.text);
    where = ln;
  }
  if (!removed.length) return { status: 'missing', missing: ['item'], ...(name ? { value: name } : {}) };
  const res = { status: 'supported', value: where, values: removed };
  if (absent.length) res.note = `${cap(joinAnd(absent))} ${absent.length > 1 ? 'were' : 'was'} not on the list.`;
  return res;
}

// ---- done ---------------------------------------------------------------------------------------
export function finishItem(ctx, { item, list }) {
  const st = store(ctx);
  const q = clean(item);
  if (!q) return { status: 'missing', missing: ['item'] };
  let found = candidates(st, list, q);
  if (!found.length) return { status: 'missing', missing: ['item'], ...(list ? { value: listName(list) } : {}) };
  const pending = found.filter((c) => !c.item.done);
  if (pending.length) found = pending;
  if (new Set(found.map((c) => c.item.id)).size > 1) {
    return { status: 'ambiguous', alternatives: found.map((c) => `${c.item.text} (${c.name})`), missing: ['item'] };
  }
  const { name, item: it } = found[0];
  if (it.done) return { status: 'supported', value: name, note: `${cap(it.text)} is already marked as done.` };
  it.done = true;
  mirror(ctx, name, it, 'done');
  return { status: 'supported', value: name, values: [it.text] };
}

/** "Did I finish X?": yes (supported) when done, missing otherwise. */
export function checkItem(ctx, { item }) {
  const st = store(ctx);
  const q = clean(item);
  const found = q ? candidates(st, undefined, q) : [];
  if (!found.length) return { status: 'missing', missing: ['item'] };
  const done = found.filter((c) => c.item.done);
  if (done.length) return { status: 'supported', value: done[0].name, values: [done[0].item.text] };
  return { status: 'missing', missing: ['progress'], value: found[0].name, values: [found[0].item.text] };
}

// ---- looking at lists -----------------------------------------------------------------------------
export function showList(ctx, { list }) {
  const name = listName(list);
  const items = listOf(store(ctx), name);
  if (!items.length) return { status: 'missing', missing: ['items'], value: name };
  const todo = items.filter((i) => !i.done).map((i) => i.text);
  const done = items.filter((i) => i.done).map((i) => i.text);
  const res = { status: 'supported', value: name };
  if (todo.length) res.values = todo;
  if (done.length) res.note = todo.length ? `Done: ${joinAnd(done)}.` : `Everything on your ${name} list is done. Well done!`;
  return res;
}

export function pendingItems(ctx, { list }) {
  const name = listName(list);
  const items = listOf(store(ctx), name);
  if (!items.length) return { status: 'missing', missing: ['items'], value: name };
  const todo = items.filter((i) => !i.done).map((i) => i.text);
  if (!todo.length) return { status: 'supported', value: name, note: `Everything on your ${name} list is done. Well done!` };
  return { status: 'supported', value: name, values: todo };
}

export function countItems(ctx, { list }) {
  const name = listName(list);
  const items = listOf(store(ctx), name);
  if (!items.length) return { status: 'missing', missing: ['items'], value: 0, unit: THING };
  const done = items.filter((i) => i.done).length;
  const res = { status: 'supported', value: items.length, unit: THING };
  if (done) res.note = `${done} ${done === 1 ? 'is' : 'are'} done.`;
  return res;
}

export function countPending(ctx, { list }) {
  const name = listName(list);
  const items = listOf(store(ctx), name);
  if (!items.length) return { status: 'missing', missing: ['items'], value: 0, unit: THING };
  const todo = items.filter((i) => !i.done).length;
  const res = { status: 'supported', value: todo, unit: THING };
  if (!todo) res.note = `Nothing is left on your ${name} list. Well done!`;
  return res;
}

export function hasItem(ctx, { item, list }) {
  const name = listName(list);
  const q = clean(item);
  const found = q ? matchIn(listOf(store(ctx), name), q) : [];
  if (!found.length) return { status: 'missing', missing: ['item'], value: name };
  const res = { status: 'supported', value: name, values: [found[0].text] };
  if (found[0].done) res.note = 'It is already done.';
  return res;
}

export function clearList(ctx, { list }) {
  const st = store(ctx);
  const name = listName(list);
  const items = listOf(st, name);
  if (!items.length) return { status: 'supported', note: `Your ${name} list is already empty.` };
  for (const it of items) mirror(ctx, name, it, 'removed');
  st.lists[name] = [];
  return { status: 'supported', value: items.length, unit: THING };
}

export function showLists(ctx) {
  const st = store(ctx);
  const names = Object.keys(st.lists).filter((n) => st.lists[n].length);
  if (!names.length) return { status: 'missing', missing: ['lists'] };
  return { status: 'supported', values: names.map((n) => `${n} (${st.lists[n].length})`) };
}
