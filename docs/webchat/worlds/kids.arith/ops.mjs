// Operations of kids.arith. Browser-safe: no imports.

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const K = (suffix) => 'kids.arith.' + suffix;
const round10 = (x) => Math.round(x * 1e10) / 1e10;
const seqOf = (ctx, w) => ctx.val(w, 'core.seq') ?? -Infinity;

/** Plain plural for the regular item words of this world ("apple" -> "apples"). */
function plural(item, n) {
  const w = String(item).replace(/_/g, ' ');
  if (n === 1) return w;
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  return w + 's';
}
const subject = (ctx, id) => (id === 'e.user' ? 'you' : ctx.name(id));
const verbHas = (id) => (id === 'e.user' ? 'have' : 'has');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const num = (x) => (x === undefined ? undefined : Number(x));

/**
 * Apply `sign * n` to a person (sign +1 receives, -1 loses). `n` undefined is an unknown amount ("some"): the exact count is lost, only a bound stays
 * (more than before for a receiver, fewer than before for a giver). With a known count the number moves; with an unknown start the net change is kept
 * in `delta`, so a later "now has 3" tells what the start was.
 */
function move(p, sign, n) {
  if (n === undefined) {
    if (p.n !== undefined) { if (sign > 0) p.floor = p.n; else p.ceil = p.n; p.n = undefined; }
    p.fuzzy = true;
    return;
  }
  if (p.fuzzy) return;
  if (p.n !== undefined) p.n += sign * n;
  else p.delta += sign * n;
}

/**
 * Replay every holding statement and every event about `item` in core.seq order.
 * people: id -> { n: number | undefined, from: string[], conflict?: string, start?: number, delta, fuzzy, floor?, ceil? }
 */
function replay(ctx, item) {
  // "I buy 4 stickers" is read by kids.shop when the item is on its price list; if that world is loaded,
  // its purchases of the user count here as "buy" events. (Soft coupling: no import, absent world = none.)
  let shopped = [];
  try { shopped = ctx.find('kids.shop.purchase', { item }).map((w) => ({ w, shop: true })); } catch { shopped = []; }
  const events = [
    ...ctx.find(K('holding'), { item }).map((w) => ({ w, holding: true })),
    ...ctx.find(K('change'), { item }).map((w) => ({ w, holding: false })),
    ...ctx.find(K('relation'), { item }).map((w) => ({ w, relation: true })),
    ...shopped,
  ].sort((a, b) => seqOf(ctx, a.w) - seqOf(ctx, b.w));
  const people = new Map();
  const who = (id) => { if (!people.has(id)) people.set(id, { n: undefined, from: [], delta: 0, fuzzy: false }); return people.get(id); };
  const plain = (kind) => ({ eat: 'eat', lose: 'lose', break: 'break' })[kind];
  for (const { w, holding, shop, relation } of events) {
    if (relation) {
      // "Ana has 3 more apples than Ion": fixes whichever of the two is not known from the one that is (a count that is known is not overwritten)
      const kind = ctx.val(w, 'kind');
      const k = num(ctx.val(w, 'count'));
      const a = who(ctx.val(w, 'who'));
      const b = who(ctx.val(w, 'ref'));
      const fwd = { more: (x) => x + k, fewer: (x) => x - k, times: (x) => x * k }[kind];
      const back = { more: (x) => x - k, fewer: (x) => x + k, times: (x) => (k === 0 ? undefined : x / k) }[kind];
      const set = (p, v, id) => {
        if (v === undefined) return;
        if (v < 0) { p.conflict = `${cap(subject(ctx, id))} cannot have fewer than none ${plural(item, 2)}.`; return; }
        if (p.start === undefined && !p.fuzzy && v - p.delta >= 0) p.start = v - p.delta;
        p.n = v; p.conflict = undefined; p.fuzzy = false; p.floor = undefined; p.ceil = undefined; p.recv = undefined; p.donors = undefined; p.delta = 0;
      };
      a.from.push(w.id); b.from.push(w.id);
      if (fwd && b.n !== undefined && a.n === undefined) set(a, round10(fwd(b.n)), ctx.val(w, 'who'));
      else if (back && a.n !== undefined && b.n === undefined) set(b, round10(back(a.n)), ctx.val(w, 'ref'));
      continue;
    }
    if (holding) {
      const p = who(ctx.val(w, 'owner'));
      const c = ctx.val(w, 'count');
      // the first number ever said (or worked out from "now has 3" after events on an unknown start) is the start
      if (p.start === undefined && c !== undefined && !p.fuzzy && c - p.delta >= 0) p.start = c - p.delta;   // a negative start: the statement is a fresh count, not the state after the events
      p.n = c;
      p.from.push(w.id);
      p.conflict = undefined; p.fuzzy = false; p.floor = undefined; p.ceil = undefined;
      p.recv = undefined; p.donors = undefined; p.delta = 0;
      if (c === undefined) p.start = undefined;
      continue;
    }
    const kind = shop ? 'buy' : w.type.slice(K('').length);
    const n = ctx.val(w, 'count');
    const actorId = shop ? 'e.user' : ctx.val(w, 'who');
    const actor = who(actorId);
    if (kind === 'give') {
      const toId = ctx.val(w, 'to');
      const to = who(toId);
      actor.from.push(w.id); to.from.push(w.id);
      if (n !== undefined && actor.n !== undefined && actor.n < n) {
        const why = `${cap(subject(ctx, actorId))} only had ${actor.n} ${plural(item, actor.n)}, so ${subject(ctx, actorId)} cannot give away ${n}.`;
        actor.conflict = why; to.conflict = why;
        continue;
      }
      const toKnown = to.n !== undefined;
      move(actor, -1, n);
      move(to, +1, n);
      if (!toKnown && n !== undefined) { to.recv = (to.recv ?? 0) + n; (to.donors ??= []).push(actorId); }   // start unknown: only what was received is known
    } else if (kind === 'receive' || kind === 'buy') {
      actor.from.push(w.id);
      const known = actor.n !== undefined;
      move(actor, +1, n);
      if (!known && n !== undefined) actor.recv = (actor.recv ?? 0) + n;
    } else {
      actor.from.push(w.id);
      if (n !== undefined && actor.n !== undefined && actor.n < n) {
        actor.conflict = `${cap(subject(ctx, actorId))} only had ${actor.n} ${plural(item, actor.n)}, so ${subject(ctx, actorId)} cannot ${plain(kind)} ${n}.`;
        continue;
      }
      move(actor, -1, n);
    }
  }
  for (const p of people.values()) if (p.n !== undefined) p.n = round10(p.n);
  return people;
}

const needItem = (key) => ({ status: 'missing', missing: [key], note: 'the kind of thing is needed' });

export function currentCount(ctx, { owner, item }) {
  const key = K('holding.count');
  if (!owner || !item) return needItem(key);
  const p = replay(ctx, item).get(owner);
  if (p?.conflict) return { status: 'conflicting', alternatives: [], from: p.from, note: p.conflict };
  if (p && p.n === undefined && p.fuzzy && (p.floor !== undefined || p.ceil !== undefined)) {
    // "Ana gives him some": a number is not known, but a bound is
    return p.floor !== undefined
      ? { status: 'supported', value: p.floor, unit: 'more_than', from: p.from }
      : { status: 'supported', value: p.ceil, unit: 'fewer_than', from: p.from };
  }
  if (p && p.n === undefined && p.recv > 0) {
    // start unknown, but the dialog said what was received ("And Ana?" after "Tom gives 2 to Ana"): report that, not a total
    const donors = [...new Set(p.donors ?? [])].map((d) => subject(ctx, d));
    return { status: 'supported', value: p.recv, unit: 'received', note: donors.length ? ` from ${joinAnd(donors)}` : '', from: p.from };
  }
  if (!p || p.n === undefined) {
    return { status: 'missing', missing: [key], from: p?.from, note: `the starting number of ${item} of ${ctx.name(owner)} is not known` };
  }
  return { status: 'supported', value: p.n, from: p.from };
}

/** How many someone had at first: the first number said, or worked out from "ate 2 and now has 3" (5). */
export function startCount(ctx, { owner, item }) {
  const key = K('holding.start');
  if (!owner || !item) return needItem(key);
  const p = replay(ctx, item).get(owner);
  if (p?.conflict) return { status: 'conflicting', alternatives: [], from: p.from, note: p.conflict };
  if (!p || p.start === undefined) return { status: 'missing', missing: [key], from: p?.from, note: `the starting number of ${item} of ${ctx.name(owner)} is not known` };
  return { status: 'supported', value: round10(p.start), from: p.from };
}

/**
 * Hook (ops reasoner): do the statements just told (`ids`) still make a possible world? Returns { problem } or undefined. The dialog layer
 * retracts the statements and says the problem instead of "OK".
 */
export function checkStatement(ctx, { ids }) {
  const items = new Set();
  const people = new Set();
  for (const id of ids ?? []) {
    const w = ctx.get(id);
    if (!w) continue;
    items.add(ctx.val(w, 'item'));
    for (const k of ['owner', 'who', 'to', 'ref']) { const v = ctx.val(w, k); if (v) people.add(v); }
  }
  for (const item of items) {
    if (!item) continue;
    const r = replay(ctx, item);
    for (const id of people) if (r.get(id)?.conflict) return { problem: r.get(id).conflict };
  }
  return undefined;
}

/** Hook: "why?" about a count, answered from what is known: the facts the number came from, in order. */
export function why(ctx, { text } = {}) {
  const t = String(text ?? '').toLowerCase();
  // the newest holding or event decides which person and item "why?" is about, unless a name or an item is in the question
  const all = [...ctx.find(K('holding')), ...ctx.find(K('change'))].sort((a, b) => seqOf(ctx, a) - seqOf(ctx, b));
  if (!all.length) return undefined;
  const named = all.slice().reverse().find((w) => [ctx.val(w, 'owner'), ctx.val(w, 'who'), ctx.val(w, 'to')].some((id) => id && id !== 'e.user' && t.includes(String(ctx.name(id)).toLowerCase())));
  if (/^why (?:is|are) /.test(t) && !named) return undefined;   // "why is milk done?" is not about counts
  const w = named ?? all.at(-1);
  const item = ctx.val(w, 'item');
  const id = ctx.val(w, 'to') ?? ctx.val(w, 'owner') ?? ctx.val(w, 'who');
  const p = replay(ctx, item).get(id);
  if (!p) return undefined;
  const r = currentCount(ctx, { owner: id, item });
  const who = subject(ctx, id);
  const things = (n) => `${n} ${plural(item, n)}`;
  let out;
  if (r.status === 'supported' && r.unit === 'more_than') out = `${cap(who)} ${verbHas(id)} more than ${things(r.value)}: some more came and I was not told how many.`;
  else if (r.status === 'supported' && r.unit === 'fewer_than') out = `${cap(who)} ${verbHas(id)} fewer than ${things(r.value)}: some were gone and I was not told how many.`;
  else if (r.status === 'supported' && r.unit === 'received') out = `I do not know how many ${plural(item, 2)} ${who} had; ${who} got ${r.value}${r.note ?? ''}.`;
  else if (r.status === 'supported') out = `${cap(who)} ${verbHas(id)} ${things(r.value)}.`;
  else if (r.status === 'conflicting') out = cap(String(r.note));
  else out = `I do not know yet how many ${plural(item, 2)} ${who} ${verbHas(id)}.`;
  return { text: out, from: r.from ?? p.from };
}

export function totalCount(ctx, { item, who1, who2 }) {
  const key = K('total.count');
  if (!item) return needItem(key);
  const people = replay(ctx, item);
  const chosen = who1 && who2 ? [who1, who2] : [...people.keys()];
  let sum = 0;
  const from = [];
  const unknown = [];
  for (const id of chosen) {
    const p = people.get(id);
    if (p?.conflict) return { status: 'conflicting', alternatives: [], from: p.from, note: p.conflict };
    if (!p || p.n === undefined) { unknown.push(id); continue; }
    sum += p.n; from.push(...p.from);
  }
  if (who1 && who2 && unknown.length) {
    return { status: 'missing', missing: [key], note: `the number of ${item} of ${unknown.map((u) => ctx.name(u)).join(' and ')} is not known` };
  }
  if (!from.length) return { status: 'missing', missing: [key], note: `nobody has told me how many ${item} they have` };
  const assumptions = unknown.length ? [`not counted, unknown: ${unknown.map((u) => ctx.name(u)).join(', ')}`] : [];
  return { status: 'supported', value: round10(sum), from: [...new Set(from)], assumptions };
}

/** Counts of the people to compare: all known people, or the pair. Returns an envelope on trouble. */
function counts(ctx, item, ids) {
  const people = replay(ctx, item);
  const list = ids ?? [...people.keys()];
  const out = [];
  for (const id of list) {
    const p = people.get(id);
    if (p?.conflict) return { env: { status: 'conflicting', alternatives: [], from: p.from, note: p.conflict } };
    if (!p || p.n === undefined) {
      if (ids) return { env: { status: 'missing', missing: [K('holding.count')], note: `the number of ${item} of ${ctx.name(id)} is not known` } };
      continue;
    }
    out.push({ id, n: p.n, from: p.from });
  }
  if (!out.length) return { env: { status: 'missing', missing: [K('holding.count')], note: `nobody has told me how many ${item} they have` } };
  return { list: out };
}

export function leader(ctx, { item, who1, who2 }) {
  if (!item) return needItem(K('leader.winner'));
  const c = counts(ctx, item, who1 && who2 ? [who1, who2] : undefined);
  if (c.env) return c.env;
  const max = Math.max(...c.list.map((x) => x.n));
  const top = c.list.filter((x) => x.n === max);
  const from = [...new Set(c.list.flatMap((x) => x.from))];
  if (top.length > 1) return { status: 'ambiguous', alternatives: top.map((x) => x.id), note: String(max), from };
  const note = who1 && who2 ? c.list.map((x) => x.n).join(' against ') : String(max);
  return { status: 'supported', value: top[0].id, note, from };
}

export function gap(ctx, { item, who1, who2 }) {
  if (!item || !who1 || !who2) return needItem(K('gap.diff'));
  const c = counts(ctx, item, [who1, who2]);
  if (c.env) return c.env;
  const d = round10(c.list[0].n - c.list[1].n);
  return { status: 'supported', value: Math.abs(d), unit: d < 0 ? 'fewer' : 'more', from: [...new Set(c.list.flatMap((x) => x.from))] };
}

export function verdict(ctx, { item, who1, who2 }) {
  if (!item || !who1 || !who2) return needItem(K('verdict.answer'));
  const c = counts(ctx, item, [who1, who2]);
  if (c.env) return c.env;
  const [a, b] = c.list;
  const part = (x) => `${subject(ctx, x.id)} ${verbHas(x.id)} ${x.n}`;
  return { status: 'supported', value: a.n > b.n ? 'yes' : 'no', note: cap(`${part(a)} and ${part(b)}`), from: [...new Set(c.list.flatMap((x) => x.from))] };
}

export function hasAny(ctx, { owner, item }) {
  if (!owner || !item) return needItem(K('has.answer'));
  const p = replay(ctx, item).get(owner);
  if (p?.conflict) return { status: 'conflicting', alternatives: [], from: p.from, note: p.conflict };
  if (!p || p.n === undefined) {
    return { status: 'missing', missing: [K('holding.count')], from: p?.from, note: `the starting number of ${item} of ${ctx.name(owner)} is not known` };
  }
  const who = subject(ctx, owner);
  const note = p.n === 0 ? `${who} ${verbHas(owner)} no ${plural(item, 2)}` : `${who} ${verbHas(owner)} ${p.n} ${plural(item, p.n)}`;
  return { status: 'supported', value: p.n > 0 ? 'yes' : 'no', note, from: p.from };
}

/** a/b as an exact decimal when it terminates, else null. */
function terminates(a, b) {
  const scale = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const k = Math.max(scale(a), scale(b));
  let num = Math.round(Math.abs(a) * 10 ** k), den = Math.round(Math.abs(b) * 10 ** k);
  const gcd = (x, y) => { while (y) { budget.tick('ops.gcd'); [x, y] = [y, x % y]; } return x; };
  const g = gcd(num, den) || 1;
  den /= g;
  while (den % 2 === 0) { budget.tick('ops.gcd2'); den /= 2; }
  while (den % 5 === 0) { budget.tick('ops.gcd3'); den /= 5; }
  return den === 1;
}

/** Two or three numbers: `a op b [op2 c]`, with times and division before plus and minus ("7 plus 2 times 3" is 13). */
export function calc(ctx, { op, a, b, op2, c }) {
  if (op2 === undefined || c === undefined) return calc2(ctx, { op, a, b });
  const hi = (o) => o === 'times' || o === 'divided_by';
  const first = hi(op2) && !hi(op) ? 'right' : 'left';
  const step = (o, x, y) => calc2(ctx, { op: o, a: x, b: y });
  let r1, r2;
  if (first === 'left') {
    r1 = step(op, a, b);
    if (r1.status !== 'supported') return r1;
    r2 = step(op2, r1.value, c);
    if (r2.status === 'supported' && r1.note) r2.note = r2.note ?? r1.note;
    return r2;
  }
  r1 = step(op2, b, c);
  if (r1.status !== 'supported') return r1;
  return step(op, a, r1.value);
}

function calc2(ctx, { op, a, b }) {
  const x = num(a), y = num(b);
  if (!op || Number.isNaN(x) || Number.isNaN(y) || x === undefined || y === undefined) return { status: 'missing', missing: [K('calc.result')], note: 'two numbers are needed' };
  switch (op) {
    case 'plus': return { status: 'supported', value: round10(x + y) };
    case 'minus': return { status: 'supported', value: round10(x - y) };
    case 'times': return { status: 'supported', value: round10(x * y) };
    case 'divided_by': {
      if (y === 0) return { status: 'unsupported', note: 'Dividing by zero has no answer, because nothing can be shared among zero.' };
      const r = x / y;
      if (Number.isInteger(r) || terminates(x, y)) return { status: 'supported', value: round10(r) };
      return { status: 'supported', value: Math.round(r * 100) / 100, note: 'about ' };
    }
    default: return { status: 'unsupported', note: `I do not know the operation ${op}.` };
  }
}

export function half(ctx, { n }) {
  const x = num(n);
  if (x === undefined || Number.isNaN(x)) return { status: 'missing', missing: [K('half.n')] };
  return { status: 'supported', value: round10(x / 2) };
}

export function double(ctx, { n }) {
  const x = num(n);
  if (x === undefined || Number.isNaN(x)) return { status: 'missing', missing: [K('double.n')] };
  return { status: 'supported', value: round10(x * 2) };
}
