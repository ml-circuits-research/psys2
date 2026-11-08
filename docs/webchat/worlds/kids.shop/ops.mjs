// Operations of kids.shop. Browser-safe: no imports.

const K = (s) => 'kids.shop.' + s;
const round2 = (x) => Math.round(x * 100) / 100;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const seqOf = (ctx, w) => ctx.val(w, 'core.seq');
const asName = (item) => String(item).replace(/_/g, ' ');
const leiWord = (n) => (n === 1 ? 'leu' : 'lei');
const money = (n) => `${n} ${leiWord(n)}`;

/** The price wire in force at `limitSeq`: the latest dialog price before it, else the price-list entry. */
function priceWire(ctx, item, limitSeq = Infinity) {
  const ws = ctx.find(K('price'), { item });
  let best = null, bestSeq = -Infinity;
  for (const w of ws) {
    const s = seqOf(ctx, w);
    if (s !== undefined && s < limitSeq && s > bestSeq) { best = w; bestSeq = s; }
  }
  return best ?? ws.find((w) => seqOf(ctx, w) === undefined) ?? null;
}
/** Words for one item: price-list phrases when they exist, else regular English. */
function words(ctx, item) {
  const kb = ctx.find(K('price'), { item }).find((w) => ctx.val(w, 'phrase'));
  const name = asName(item);
  const single = kb ? ctx.val(kb, 'phrase') : `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  let pl = kb ? ctx.val(kb, 'plural') : null;
  if (!pl) pl = /[^aeiou]y$/.test(name) ? name.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(name) ? name + 'es' : name + 's';
  return { single, pl };
}
const unknownPrice = (ctx, item) => ({
  status: 'missing', missing: [K('price.cost')],
  note: `I don't know the price of ${asName(item)}. Please tell me, for example: ${cap(words(ctx, item).single)} costs 7 lei.`,
});

/** Items of a basket from the arguments; an item without a count counts once. */
function basket(args) {
  const out = [];
  for (const [i, c] of [['item', 'count'], ['item2', 'count2']]) {
    if (args[i]) out.push({ item: args[i], count: args[c] === undefined ? 1 : Number(args[c]) });
  }
  return out;
}
/** Cost of a basket at `limitSeq`; returns { total, from, text, plural } or { env }. */
function cost(ctx, items, limitSeq = Infinity) {
  let total = 0;
  const from = [];
  const parts = [];
  for (const { item, count } of items) {
    const w = priceWire(ctx, item, limitSeq);
    if (!w) return { env: unknownPrice(ctx, item) };
    total += ctx.val(w, 'cost') * count;
    from.push(w.id);
    const wd = words(ctx, item);
    parts.push(count === 1 ? wd.single : `${count} ${wd.pl}`);
  }
  return { total: round2(total), from, text: parts.join(' and '), plural: items.length > 1 || items[0].count !== 1 };
}

export function priceOf(ctx, { item }) {
  if (!item) return { status: 'missing', missing: [K('price.cost')], note: 'Which item do you mean?' };
  const w = priceWire(ctx, item);
  if (!w) return unknownPrice(ctx, item);
  const c = ctx.val(w, 'cost');
  const fromDialog = seqOf(ctx, w) !== undefined;
  return { status: 'supported', value: c, unit: 'leu', note: `${cap(words(ctx, item).single)} costs`, from: [w.id], assumptions: fromDialog ? ['the price was stated in the dialog'] : [] };
}

export function basketTotal(ctx, args) {
  const items = basket(args);
  if (!items.length) return { status: 'missing', missing: [K('total.total')], note: 'Which things do you want to buy?' };
  const c = cost(ctx, items);
  if (c.env) return c.env;
  return { status: 'supported', value: c.total, unit: 'leu', note: `${cap(c.text)} ${c.plural ? 'cost' : 'costs'}`, from: c.from };
}

/** Replay the user's money. Returns { amount, from, spent } or { env }. */
function wallet(ctx) {
  const evs = [
    ...ctx.find(K('money')).map((w) => ({ w, k: 'money' })),
    ...ctx.find(K('income')).map((w) => ({ w, k: 'income' })),
    ...ctx.find(K('expense')).map((w) => ({ w, k: 'expense' })),
    ...ctx.find(K('purchase')).map((w) => ({ w, k: 'purchase' })),
  ].sort((a, b) => seqOf(ctx, a.w) - seqOf(ctx, b.w));
  let amount, from = [], spent = false, conflict = null, noPrice = null;
  for (const { w, k } of evs) {
    if (k === 'money') { amount = ctx.val(w, 'count'); from = [w.id]; spent = false; conflict = null; noPrice = null; continue; }
    if (amount === undefined) continue;
    from.push(w.id);
    let delta;
    if (k === 'income') delta = ctx.val(w, 'count');
    else if (k === 'expense') { delta = -ctx.val(w, 'count'); spent = true; }
    else {
      const item = ctx.val(w, 'item');
      const c = cost(ctx, [{ item, count: ctx.val(w, 'count') }], seqOf(ctx, w));
      if (c.env) { noPrice = noPrice ?? c.env; continue; }
      delta = -c.total; spent = true; from.push(...c.from);
    }
    if (conflict) continue;
    if (amount + delta < 0) {
      conflict = `You only had ${money(round2(amount))}, so you cannot spend ${money(-delta)}.`;
      continue;
    }
    amount = round2(amount + delta);
  }
  if (amount === undefined) {
    return { env: { status: 'missing', missing: [K('money.count')], note: "I don't know how much money you have. Please tell me, for example: I have 20 lei." } };
  }
  if (conflict) return { env: { status: 'conflicting', alternatives: [], from, note: conflict } };
  if (noPrice) return { env: noPrice };
  return { amount, from: [...new Set(from)], spent };
}

export function balance(ctx) {
  const w = wallet(ctx);
  if (w.env) return w.env;
  return { status: 'supported', value: w.amount, unit: 'leu', note: w.spent ? 'left' : 'now', from: w.from };
}

export function affordable(ctx, args) {
  const items = basket(args);
  if (!items.length) return { status: 'missing', missing: [K('affordability.answer')], note: 'Which things do you want to buy?' };
  const c = cost(ctx, items);
  if (c.env) return c.env;
  const w = wallet(ctx);
  if (w.env) return w.env;
  const ok = w.amount >= c.total;
  const verb = c.plural ? 'cost' : 'costs';
  const note = ok
    ? `${cap(c.text)} ${verb} ${money(c.total)} and you have ${money(w.amount)}`
    : `${cap(c.text)} ${verb} ${money(c.total)}, but you have only ${money(w.amount)}`;
  return { status: 'supported', value: ok ? 'yes' : 'no', note, from: [...new Set([...c.from, ...w.from])] };
}

export function changeFor(ctx, args) {
  const items = basket(args);
  const paid = Number(args.paid);
  if (!items.length || args.paid === undefined || Number.isNaN(paid)) return { status: 'missing', missing: [K('change.amount')], note: 'Tell me how much you pay and what you buy.' };
  const c = cost(ctx, items);
  if (c.env) return c.env;
  if (paid < c.total) {
    return { status: 'conflicting', alternatives: [], from: c.from, note: `${money(paid)} is not enough. ${cap(c.text)} ${c.plural ? 'cost' : 'costs'} ${money(c.total)}.` };
  }
  return { status: 'supported', value: round2(paid - c.total), unit: 'leu', from: c.from };
}

/** What-if: the money in force minus the cost of the basket; the purchase is not recorded. */
export function leftAfter(ctx, args) {
  const items = basket(args);
  if (!items.length) return { status: 'missing', missing: [K('leftafter.amount')], note: 'Which things do you want to buy?' };
  const c = cost(ctx, items);
  if (c.env) return c.env;
  const w = wallet(ctx);
  if (w.env) return w.env;
  const from = [...new Set([...c.from, ...w.from])];
  if (c.total > w.amount) {
    return { status: 'conflicting', alternatives: [], from, note: `${cap(c.text)} ${c.plural ? 'cost' : 'costs'} ${money(c.total)}, but you have only ${money(w.amount)}.` };
  }
  return { status: 'supported', value: round2(w.amount - c.total), unit: 'leu', from };
}
