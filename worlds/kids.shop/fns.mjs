// Reply facts of kids.shop in matrix mode (spec 15). The matrix (matrix.sop) says what things cost, what is left and what cannot be, and keeps the numbers a reply needs
// on the answer wire; this file only finds the words around them (the phrase of an item from the price list, plurals, "costs" or "cost", how a missing price is asked
// for) and hands them to the unchanged templates as `note` and `unit`, exactly as ops.mjs did. Browser-safe: no imports.

const K = (s) => 'kids.shop.' + s;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const asName = (item) => String(item).replace(/_/g, ' ');
const money = (n) => `${n} ${Number(n) === 1 ? 'leu' : 'lei'}`;

/** Single and plural phrase of an item: the price list's words when it has them, else regular English. */
function words({ find }, item) {
  const kb = find(K('price')).find((w) => w.attrs.item?.[0] === item && w.attrs.phrase);
  const name = asName(item);
  const unq = (v) => String(v).replace(/^"|"$/g, '');
  const single = kb ? unq(kb.attrs.phrase[0]) : `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  let pl = kb?.attrs.plural ? unq(kb.attrs.plural[0]) : null;
  if (!pl) pl = /[^aeiou]y$/.test(name) ? name.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(name) ? name + 'es' : name + 's';
  return { single, pl };
}

/** The items of a basket from the question's keys; an item without a count counts once. */
function basket(where) {
  const out = [];
  for (const [i, c] of [['item', 'count'], ['item2', 'count2']]) if (where[i]) out.push({ item: where[i], count: where[c] === undefined ? 1 : Number(where[c]) });
  return out;
}
function text(ctx, items) {
  const parts = items.map(({ item, count }) => (count === 1 ? words(ctx, item).single : `${count} ${words(ctx, item).pl}`));
  return { text: parts.join(' and '), plural: items.length > 1 || items[0].count !== 1 };
}
const unknownPrice = (ctx, item) => `I don't know the price of ${asName(item)}. Please tell me, for example: ${cap(words(ctx, item).single)} costs 7 lei.`;
const ASK_BASKET = 'Which things do you want to buy?';
const NO_MONEY = "I don't know how much money you have. Please tell me, for example: I have 20 lei.";

/** The first item of a basket whose price nobody has told (the price list and the dialogue are both wires of kids.shop.price), or null. */
const unpriced = ({ find }, items) => items.find(({ item }) => !find(K('price')).some((w) => w.attrs.item?.[0] === item && w.attrs.cost))?.item ?? null;

/** The actions the matrix does not write as wires: the fact behind "I got 5 lei back" and the abduction behind "what did I pay?". */
export const fns = {
  /** "I got 5 lei back for a book": a purchase of the item whose change is known and whose payment is not. */
  gotBack(ctx, { item, back }) {
    if (!item || back === undefined) return { status: 'missing', missing: [K('change.item')] };
    ctx.tell(`@change_${ctx.world.seq + 1} kids.shop.change item=${item} count=1 back=${Number(back)}`);
    return { value: String(Number(back)), vars: { item: String(item) } };
  },
  /** "what did I pay?": what must have been paid for the change to be what it was (the library's abduction through a query for the open key `paid`). */
  whatPaid(ctx) {
    const c = ctx.find(K('change')).filter((w) => w.attrs.back).at(-1);
    if (!c) return { status: 'missing', missing: [K('change.paid')] };
    const r = ctx.world.query({ type: K('change'), seek: 'paid', mode: 'abduce', where: { item: c.attrs.item[0], count: c.attrs.count?.[0] ?? 1, amount: c.attrs.back[0] } });
    return r.status === 'supported' ? { value: String(r.value) } : { status: 'missing', missing: [K('change.paid')] };
  },
};

/**
 * `voice(ctx)`: ctx = { type, action, where, env, supposed, find, name }; returns facts to put on the envelope (`note`, `unit`, `vars`). `supposed` is the answer wire as
 * the rules left it, `env.vars` the values a refusal was decided on (the deny's bindings), `find(type)` lists wires of a type ({ attrs }).
 */
export function voice(ctx) {
  const { type, where, env, supposed: s } = ctx;
  const items = basket(where);
  const ok = env.status === 'supported';
  const say = (note) => ({ note });
  if (ctx.action === 'shop.revise') {
    // the count of the last purchase: nothing to change when nothing was bought; what was bought is the item of the purchase
    const last = ctx.find(K('purchase')).at(-1);
    return last ? { vars: { item: String(last.attrs.item[0]) } } : { status: 'missing' };
  }
  switch (type) {
    case K('price'):
      if (!where.item) return say('Which item do you mean?');
      if (env.status === 'missing') return say(unknownPrice(ctx, where.item));
      return ok ? { note: `${cap(words(ctx, where.item).single)} costs`, unit: 'leu' } : {};
    case K('total'): {
      if (!items.length) return say(ASK_BASKET);
      if (env.status === 'missing') return say(unknownPrice(ctx, unpriced(ctx, items) ?? items[0].item));
      const t = text(ctx, items);
      return ok ? { note: `${cap(t.text)} ${t.plural ? 'cost' : 'costs'}`, unit: 'leu' } : {};
    }
    case K('balance'): {
      if (env.status === 'missing') return say(NO_MONEY);
      if (!ok) return say(env.why ?? '');
      const spent = ['expense', 'purchase'].some((t) => ctx.find(K(t)).length);
      return { note: spent ? 'left' : 'now', unit: 'leu' };
    }
    case K('affordability'): {
      if (!items.length) return say(ASK_BASKET);
      if (env.status === 'missing') return say(unpriced(ctx, items) ? unknownPrice(ctx, unpriced(ctx, items)) : NO_MONEY);
      if (!ok) return say(env.why ?? '');
      const t = text(ctx, items), verb = t.plural ? 'cost' : 'costs';
      return say(env.value === 'yes' ? `${cap(t.text)} ${verb} ${money(s.cost)} and you have ${money(s.have)}` : `${cap(t.text)} ${verb} ${money(s.cost)}, but you have only ${money(s.have)}`);
    }
    case K('change'): {
      if (!items.length || where.paid === undefined) return say('Tell me how much you pay and what you buy.');
      if (env.status === 'missing') return say(unknownPrice(ctx, unpriced(ctx, items) ?? items[0].item));
      if (ok) return { unit: 'leu' };
      const t = text(ctx, items);
      return say(`${money(where.paid)} is not enough. ${cap(t.text)} ${t.plural ? 'cost' : 'costs'} ${money(env.vars.s)}.`);
    }
    case K('leftafter'): {
      if (!items.length) return say(ASK_BASKET);
      if (env.status === 'missing') return say(unpriced(ctx, items) ? unknownPrice(ctx, unpriced(ctx, items)) : NO_MONEY);
      if (ok) return { unit: 'leu' };
      if (Number(env.vars.m) < 0) return say(env.why ?? '');
      const t = text(ctx, items);
      return say(`${cap(t.text)} ${t.plural ? 'cost' : 'costs'} ${money(env.vars.s)}, but you have only ${money(env.vars.m)}.`);
    }
    default: return {};
  }
}

/**
 * The session state of kids.shop, derived from the library (spec 15): { money, purchases: [{ id, item, count }] }. `money` is the wallet's amount (a number) or null when
 * the user has not said how much they have. The dialogue layer snapshots and restores it; the library is the source.
 */
export function toState({ find }) {
  const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
  const amount = find('shop.wallet')[0]?.attrs.amount?.[0];
  return {
    money: amount === undefined ? null : Number(amount),
    purchases: find(K('purchase')).map((w) => ({ id: w.id, item: un(w.attrs.item?.[0]), count: Number(w.attrs.count?.[0] ?? 1) })),
  };
}

/** The words for a default or guessed value an answer rests on (spec 15, certainty): "I assumed 1 ball." */
export function assumed({ key, value, attrs }) {
  if (key !== 'count' || !attrs.item) return null;
  return `${value} ${attrs.item}${Number(value) === 1 ? '' : 's'}`;
}

/** The sentence for a statement the library cannot take (spec 11 section 12): "You only had 10 lei, so you cannot spend 12 lei." (the wallet's issue says what is left: negative). */
export function problem(ctx) {
  const amount = Number(ctx.issue?.about?.amount);
  if (!Number.isFinite(amount)) return undefined;
  let spent = 0;
  for (const f of ctx.facts) {
    if (/\.expense$/.test(f.type)) spent += Number(f.attrs.count ?? 0);
    else if (/\.purchase$/.test(f.type)) {
      const where = { item: f.attrs.item, count: f.attrs.count ?? 1 };
      const r = ctx.query({ type: K('total'), seek: 'total', where });
      if (r.status !== 'supported') return undefined;
      spent += Number(r.value);
    }
  }
  return spent ? `You only had ${amount + spent} lei, so you cannot spend ${spent} lei.` : undefined;
}
