// Reply facts of kids.shop in matrix mode (spec 15). The matrix (matrix.sop) says what things cost, what is left and what cannot be; this file only
// finds the words around those numbers (the phrase of an item from the price list, plurals, "costs" or "cost", how a missing price is asked for) and
// hands them to the unchanged templates as `note` and `unit`, exactly as ops.mjs did. Browser-safe: no imports.

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

/** The first item of a basket that has no price, or null. */
const unpriced = ({ query }, items) => items.find(({ item }) => query({ type: K('price'), seek: 'cost', where: { item } }).status !== 'supported')?.item ?? null;
const total = ({ query }, where) => {
  const w = {};
  for (const k of ['item', 'count', 'item2', 'count2']) if (where[k] !== undefined) w[k] = where[k];
  return query({ type: K('total'), seek: 'total', where: w });
};

/** Actions of the matrix (registered in the library under the `shop.` prefix: its function registry is shared with its builtins). */
export const fns = {
  /** "three of them": the count of the user's last purchase. The library withdraws what followed from the old wire and applies the new one. */
  'shop.revise'(ctx, { count }) {
    const last = ctx.find(K('purchase')).reduce((a, w) => (!a || ctx.world.seqOf(w.id) > ctx.world.seqOf(a.id) ? w : a), null);
    if (!last) return { status: 'missing', missing: [K('purchase.item')] };
    // the dialogue told "count=1" (it is a statement, not a default), so the purchase is replaced by one with the new count, at the same place in the sequence
    const attrs = { ...last.attrs, count: [String(Number(count))] };
    const r = ctx.replace(last.id, `@${last.id} ${last.type} ${Object.entries(attrs).flatMap(([k, vs]) => vs.map((v) => `${k}=${v}`)).join(' ')}`);
    if (!r.ok) return { ok: false, why: r.violations?.[0]?.why ?? 'that is not possible' };
    return { value: String(Number(count)), vars: { item: String(last.attrs.item[0]) } };
  },
  /** "I got 5 lei back for a book": a purchase of the item whose change is known and whose payment is not. */
  'shop.gotBack'(ctx, { item, back }) {
    if (!item || back === undefined) return { status: 'missing', missing: [K('change.item')] };
    ctx.tell(`@change_${ctx.world.seq + 1} kids.shop.change item=${item} count=1 back=${Number(back)}`);
    return { value: String(Number(back)), vars: { item: String(item) } };
  },
  /** "what did I pay?": what must have been paid for the change to be what it was (abduction over the paid key). */
  'shop.whatPaid'(ctx) {
    const c = ctx.find(K('change')).filter((w) => w.attrs.back).at(-1);
    if (!c) return { status: 'missing', missing: [K('change.paid')] };
    const fill = ctx.world.abduce(`?x kids.shop.change amount=${c.attrs.back[0]}`).flatMap((e) => e.fills).find((f) => f.key === 'paid');
    return fill ? { value: String(fill.value) } : { status: 'missing', missing: [K('change.paid')] };
  },
};

/**
 * `voice(ctx)`: ctx = { type, where, env, query, find }; returns facts to put on the envelope (`note`, `unit`). `query` asks the library, `find(type)`
 * lists wires of a type ({ attrs }).
 */
export function voice(ctx) {
  const { type, where, env } = ctx;
  const items = basket(where);
  const ok = env.status === 'supported';
  const say = (note) => ({ note });
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
      if (env.status === 'missing') return say("I don't know how much money you have. Please tell me, for example: I have 20 lei.");
      if (!ok) return say(env.why ?? '');
      const spent = ['expense', 'purchase'].some((t) => ctx.find(K(t)).length);
      return { note: spent ? 'left' : 'now', unit: 'leu' };
    }
    case K('affordability'): {
      if (!items.length) return say(ASK_BASKET);
      if (env.status === 'missing') {
        const bad = unpriced(ctx, items);
        return say(bad ? unknownPrice(ctx, bad) : "I don't know how much money you have. Please tell me, for example: I have 20 lei.");
      }
      if (!ok) return say(env.why ?? '');
      const t = text(ctx, items), cost = total(ctx, where).value, have = ctx.query({ type: K('balance'), seek: 'amount' }).value, verb = t.plural ? 'cost' : 'costs';
      return say(env.value === 'yes' ? `${cap(t.text)} ${verb} ${money(cost)} and you have ${money(have)}` : `${cap(t.text)} ${verb} ${money(cost)}, but you have only ${money(have)}`);
    }
    case K('change'): {
      if (!items.length || where.paid === undefined) return say('Tell me how much you pay and what you buy.');
      if (env.status === 'missing') return say(unknownPrice(ctx, unpriced(ctx, items) ?? items[0].item));
      if (ok) return { unit: 'leu' };
      const t = text(ctx, items);
      return say(`${money(where.paid)} is not enough. ${cap(t.text)} ${t.plural ? 'cost' : 'costs'} ${money(total(ctx, where).value)}.`);
    }
    case K('leftafter'): {
      if (!items.length) return say(ASK_BASKET);
      if (env.status === 'missing') {
        const bad = unpriced(ctx, items);
        return say(bad ? unknownPrice(ctx, bad) : "I don't know how much money you have. Please tell me, for example: I have 20 lei.");
      }
      if (ok) return { unit: 'leu' };
      const t = text(ctx, items), have = ctx.query({ type: K('balance'), seek: 'amount' }).value;
      return say(`${cap(t.text)} ${t.plural ? 'cost' : 'costs'} ${money(total(ctx, where).value)}, but you have only ${money(have)}.`);
    }
    default: return {};
  }
}
