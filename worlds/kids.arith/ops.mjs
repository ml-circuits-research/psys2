// Operations of kids.arith. Browser-safe: no imports.

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
const num = (x) => (x === undefined ? undefined : Number(x));

/**
 * Replay every holding statement and every event about `item` in core.seq order.
 * people: id -> { n: number | undefined, from: string[], conflict?: string }
 */
function replay(ctx, item) {
  // "I buy 4 stickers" is read by kids.shop when the item is on its price list; if that world is loaded,
  // its purchases of the user count here as "buy" events. (Soft coupling: no import, absent world = none.)
  let shopped = [];
  try { shopped = ctx.find('kids.shop.purchase', { item }).map((w) => ({ w, shop: true })); } catch { shopped = []; }
  const events = [
    ...ctx.find(K('holding'), { item }).map((w) => ({ w, holding: true })),
    ...ctx.find(K('change'), { item }).map((w) => ({ w, holding: false })),
    ...shopped,
  ].sort((a, b) => seqOf(ctx, a.w) - seqOf(ctx, b.w));
  const people = new Map();
  const who = (id) => { if (!people.has(id)) people.set(id, { n: undefined, from: [] }); return people.get(id); };
  const plain = (kind) => ({ eat: 'eat', lose: 'lose', break: 'break' })[kind];
  for (const { w, holding, shop } of events) {
    if (holding) {
      const p = who(ctx.val(w, 'owner'));
      p.n = ctx.val(w, 'count');
      p.from = [w.id];
      p.conflict = undefined;
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
      if (actor.n !== undefined && actor.n < n) {
        const why = `${cap(subject(ctx, actorId))} only had ${actor.n} ${plural(item, actor.n)}, so ${subject(ctx, actorId)} cannot give away ${n}.`;
        actor.conflict = why; to.conflict = why;
        continue;
      }
      if (actor.n !== undefined) actor.n -= n;
      if (to.n !== undefined) to.n += n;
    } else if (kind === 'receive' || kind === 'buy') {
      actor.from.push(w.id);
      if (actor.n !== undefined) actor.n += n;
    } else {
      actor.from.push(w.id);
      if (actor.n !== undefined && actor.n < n) {
        actor.conflict = `${cap(subject(ctx, actorId))} only had ${actor.n} ${plural(item, actor.n)}, so ${subject(ctx, actorId)} cannot ${plain(kind)} ${n}.`;
        continue;
      }
      if (actor.n !== undefined) actor.n -= n;
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
  if (!p || p.n === undefined) {
    return { status: 'missing', missing: [key], from: p?.from, note: `the starting number of ${item} of ${ctx.name(owner)} is not known` };
  }
  return { status: 'supported', value: p.n, from: p.from };
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
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const g = gcd(num, den) || 1;
  den /= g;
  while (den % 2 === 0) den /= 2;
  while (den % 5 === 0) den /= 5;
  return den === 1;
}

export function calc(ctx, { op, a, b }) {
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
