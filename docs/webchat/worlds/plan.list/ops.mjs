// SPDX-License-Identifier: AGPL-3.0-only
// Operations of plan.list (kids plan, ADR-011; Q18 K1, K6, L3): lists of the published schema w.list v4, the acts make / change / ask, and every sum by the library
// (listSums: total of quantity x price, change, short, left, affordable; listMeant: the list a request means). The lists are the world state; a library World with
// w.list's two types is built from them for each sum, so nothing computed is stored. Prices: an entry's own, else the sample price list (prices.sample.mjs, H1).
// No item, price or phrase is listed here: the readings are the catalog's frames (patterns.sop, generated), the number words and determiners w.lang.en's. Browser-safe.
import { World, listSums, listMeant } from '../../lib/vendor/sopworld/sopworld.mjs?v=9d959b0a06';
import { en } from '../../lib/lang/en.mjs?v=edece7402d';
import { pluralize, singularLemma } from '../../lib/formalizer/rules/lemma.mjs?v=2aad69e017';
import { SAMPLE_PRICES, SAMPLE_CURRENCY } from './prices.sample.mjs?v=1e37605e83';
import { MONEY_WORDS } from '../../lib/knowledge/money-words.generated.mjs?v=f8689c864a';

export function initialState() { return { lists: [], n: 0 }; }

const safe = (f, d) => { try { return f() ?? d; } catch { return d; } };
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const DETS = new Set(safe(() => [...en.words('det')], []).filter((w) => !/^\w+$/.test(w) || !en.numerals()[w]));
const NUMS = safe(() => en.numerals(), {});
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
const key = (text) => String(text).toLowerCase().trim().replace(/\s+/g, '_');
const label = (text) => String(text).replace(/_/g, ' ');

/** "2 pencils" -> { quantity: 2, text: 'pencil' }; "a ball" -> { quantity: 1, text: 'ball' } (the number words and determiners are w.lang.en's). */
function entryOf(phrase, amount) {
  const toks = String(phrase ?? '').toLowerCase().replace(/[?.!,]/g, ' ').split(/\s+/).filter(Boolean);
  let quantity = amount !== undefined && amount !== null && amount !== '' && Number.isFinite(Number(amount)) ? Number(amount) : null;
  while (toks.length > 1 && (DETS.has(toks[0]) || /^\d+(?:\.\d+)?$/.test(toks[0]) || NUMS[toks[0]] !== undefined)) {
    budget.tick('list.entry');
    const t = toks.shift();
    if (quantity === null && /^\d+(?:\.\d+)?$/.test(t)) quantity = Number(t); else if (quantity === null && NUMS[t] !== undefined) quantity = NUMS[t];
  }
  if (!toks.length) return null;
  const last = singularLemma(toks.at(-1));
  return { quantity: quantity ?? 1, text: [...toks.slice(0, -1), last].join(' ') };
}
/** The things a role names ("a ball and a pencil", "2 pencils"), each an entry. */
function entriesOf(thing, amount) {
  const parts = safe(() => en.splitList(String(thing ?? '')), [String(thing ?? '')]);
  return (parts.length ? parts : [String(thing ?? '')]).map((p, i) => entryOf(p, i === 0 ? amount : null)).filter(Boolean);
}

const priceOf = (lst) => (e) => { const t = key(String(e.attrs.text?.[0] ?? '').replace(/^"|"$/g, '')); return lst?.prices?.[t] ?? SAMPLE_PRICES[t]; };
const money = (n, lst) => `${+Number(n).toFixed(2)} ${Number(n) === 1 ? (lst?.currencyOne ?? SAMPLE_CURRENCY.one) : (lst?.currencyWord ?? SAMPLE_CURRENCY.many)}`;
const count = (q, text) => (q === 1 ? an(label(text)) : `${q} ${pluralize(label(text))}`);

/** A library World holding one list of the state (w.list's type names; listSums reads the entries by their `list` link). */
function worldOf(lst) {
  const w = new World();
  w.load('@t.list core.type of=w.list.list\n@t.item core.type of=w.list.item\n@t.link core.slot of=w.list.item key=list type=w.list.list');
  const num = (k, v) => (v === undefined || v === null ? '' : ` ${k}=${+v}`);
  const lines = [`@${lst.id} w.list.list name=${JSON.stringify(lst.name)} sort=${lst.sort ?? 'shopping'}${num('budget', lst.budget)} currency=${lst.currency ?? SAMPLE_CURRENCY.code}`];
  for (const it of lst.items) lines.push(`@${it.id} w.list.item text=${JSON.stringify(it.text)} quantity=${+it.quantity} list=$${lst.id} status=${it.status ?? 'open'}${num('price', it.price)}`);
  w.tell(lines.join('\n'));
  return w;
}
const sumsOf = (lst) => listSums(worldOf(lst), lst.id, { priceOf: priceOf(lst) });

/** The list a request means: listMeant over the lists of the state (the one named, else the one made last), unless it is settled (paid for): then a new one. */
function meant(st, { create = true, name } = {}) {
  let lst = null;
  if (st.lists.length) {
    const w = new World();
    w.load('@t.list core.type of=w.list.list');
    w.tell(st.lists.map((l) => `@${l.id} w.list.list name=${JSON.stringify(l.name)} sort=${l.sort ?? 'shopping'}`).join('\n'));
    const m = listMeant(w, { name, sort: name ? undefined : 'shopping' });
    lst = m ? st.lists.find((l) => l.id === m.id) ?? null : null;
  }
  if ((!lst || lst.settled) && create) {
    st.n = (st.n ?? 0) + 1;
    lst = { id: `l${st.n}`, name: name ?? 'shopping', sort: 'shopping', budget: lst?.settled ? undefined : lst?.budget, items: [], currency: SAMPLE_CURRENCY.code };
    st.lists.push(lst);
  }
  return lst;
}
const addItems = (st, lst, entries) => { for (const e of entries) { st.n = (st.n ?? 0) + 1; lst.items.push({ id: `e${st.n}`, text: key(e.text), quantity: e.quantity, status: 'open' }); } };

const PRONOUNS = new Set(safe(() => [...en.words('pron')], []));
const WH = new Set(safe(() => [...en.words('wh')], []).filter((w) => !w.includes(' ')));
/** A thing role is noun phrases: no pronoun or question word inside ("a puzzle and I pay 10 lei" is two clauses, not an entry). */
const nounPhrases = (thing) => !(String(thing ?? '').toLowerCase().match(/[\p{L}']+/gu) ?? []).some((w) => PRONOUNS.has(w) || WH.has(w));
const priced = (st, thing) => { const lst = st?.lists?.at?.(-1); return entriesOf(thing).some((e) => (lst?.prices?.[key(e.text)] ?? SAMPLE_PRICES[key(e.text)]) !== undefined); };

/** DECLINE (spec 21): plan.list owns a reading when its roles are what a list holds: things that are noun phrases, a price asked of a thing that has one (the sample
 *  list or a price the user stated: "how much is 2 plus 2" is not a price), the change or what is left of a list that exists or of the things and money the question names. */
export function accepts({ action, mode, roles = {}, state } = {}) {
  if (!/^list\./.test(action ?? '')) return true;
  for (const r of ['currency', 'unit']) if (roles[r] !== undefined && !MONEY_WORDS.has(String(roles[r]).toLowerCase())) return false;   // a money word of the catalog (k.units), "10 apples" is no payment
  if (roles.thing !== undefined && !nounPhrases(roles.thing)) return false;
  // the shop sells what is on its price list: a purchase of a thing with no price (the sample list or one the user stated) is not this shop's ("I buy a rocket")
  if (action === 'list.make' && roles.thing !== undefined && !entriesOf(roles.thing).every((e) => (state?.lists?.at?.(-1)?.prices?.[key(e.text)] ?? SAMPLE_PRICES[key(e.text)]) !== undefined)) return false;
  if (action === 'list.ask' && (mode === 'price' || mode === 'afford')) return !!roles.thing && priced(state, roles.thing);
  if (action === 'list.ask' && (mode === 'change' || mode === 'left')) return !!roles.thing || roles.money !== undefined || !!state?.lists?.some((l) => l.items.length) || (mode === 'left' && state?.lists?.some((l) => l.budget !== undefined));
  return true;
}

export function make(ctx, { thing, amount } = {}) {
  const st = ctx.state;
  const entries = entriesOf(thing, amount);
  if (!entries.length) return { status: 'missing', note: 'What would you like?' };
  const lst = meant(st);
  addItems(st, lst, entries);
  const said = entries.map((e) => count(e.quantity, e.text));
  return { status: 'supported', value: `OK, ${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0]}.` };
}

export function change(ctx, { attribute: attr, mode, value, amount, currency, unit } = {}) {
  const st = ctx.state;
  // the catalog's frames (list-frames): shop.pay is attribute=money mode=less (the money handed over), wallet.start attribute=money with no mode (the money the person has: the budget)
  const attribute = attr === 'money' ? (mode === 'less' ? 'tendered' : 'budget') : attr;
  currency ??= unit;
  const n = Number(value ?? amount);
  if (!Number.isFinite(n)) return { status: 'missing', note: 'How much money?' };
  const lst = attribute === 'budget' ? meant(st) : meant(st, { create: true });
  if (attribute === 'budget') lst.budget = n; else { lst.paid = n; lst.settled = true; }   // money handed over at the till is an EVENT of the story (w.list v4: `tendered` is no key of a list; k.actions pay: money remove), kept with the basket it pays for; it closes the basket
  if (currency) { lst.currencyWord = /s$|^lei$/.test(String(currency).toLowerCase()) ? String(currency).toLowerCase() : `${String(currency).toLowerCase()}s`; }
  return { status: 'supported', value: attribute === 'budget' ? `OK, you have ${money(n, lst)}.` : `OK, you pay ${money(n, lst)}.` };
}

export function ask(ctx, { mode, thing, money: paid, unit, text } = {}) {
  const st = ctx.state;
  if (mode === 'price') {
    const entries = entriesOf(thing);
    if (!entries.length) return { status: 'missing', note: 'The price of what?' };
    const tmp = { id: 'q', name: 'question', items: entries.map((e, i) => ({ id: `q${i}`, text: key(e.text), quantity: e.quantity })), prices: meant(st, { create: false })?.prices };
    const s = sumsOf(tmp);
    if (s.total === null || s.total === undefined) return { status: 'missing', note: `I don't know the price of ${s.missing.map((m) => an(label(m))).join(' and ')}.` };
    if (entries.length === 1 && entries[0].quantity === 1) return { status: 'supported', value: `${cap(an(label(entries[0].text)))} costs ${money(s.total)}.`, answer: s.total };
    return { status: 'supported', value: `${cap(entries.map((e) => count(e.quantity, e.text)).join(' and '))} cost ${money(s.total)}.`, answer: s.total };
  }
  if (mode === 'change') {
    let lst = meant(st, { create: false });
    if (thing || paid !== undefined) {   // "the change from 20 lei for a ball and a pencil": the question names its own purchase
      lst = { id: 'q', name: 'question', items: [], paid: paid !== undefined && paid !== '' ? Number(paid) : lst?.paid, currencyWord: unit ? String(unit).toLowerCase() : lst?.currencyWord };
      st.n = (st.n ?? 0) + 1;
      addItems(st, lst, entriesOf(thing));
    }
    if (!lst || !lst.items.length) return { status: 'missing', note: 'What do you buy?' };
    if (lst.paid === undefined || lst.paid === null) return { status: 'missing', note: 'How much do you pay?' };
    const s = sumsOf(lst);
    if (s.total === null || s.total === undefined) return { status: 'missing', note: `I don't know the price of ${s.missing.map((m) => an(label(m))).join(' and ')}.` };
    lst.settled = true;   // the purchase is paid for: the next thing wanted starts a new list
    // the change is what was paid less the library's total (w.list v4: the payment is the story's event, not a key of the list)
    s.tendered = lst.paid;
    if (lst.paid < s.total) s.short = +(s.total - lst.paid).toFixed(2); else s.change = +(lst.paid - s.total).toFixed(2);
    if (s.short !== undefined) {
      const what = lst.items.length === 1 ? `${cap(count(lst.items[0].quantity, lst.items[0].text))} ${lst.items[0].quantity === 1 ? 'costs' : 'cost'}` : 'They cost';
      return { status: 'conflicting', value: `${money(s.tendered, lst)} is not enough. ${what} ${money(s.total, lst)}.`, answer: -s.short };
    }
    return { status: 'supported', value: `Your change from ${money(s.tendered, lst)} is ${money(s.change, lst)}.`, answer: s.change };
  }
  if (mode === 'afford' || mode === 'left') {
    const base = meant(st, { create: false });
    const budget = base?.budget;
    if (budget === undefined || budget === null) return { status: 'missing', note: 'How much money do you have?' };
    const extra = thing ? entriesOf(thing) : [];
    const lst = { id: 'q', name: 'question', budget, items: [...(mode === 'left' ? base.items : []).map((x) => ({ ...x })), ...extra.map((e, i) => ({ id: `x${i}`, text: key(e.text), quantity: e.quantity }))], currencyWord: base.currencyWord, prices: base.prices };
    const s = sumsOf(lst);
    if (s.total === null || s.total === undefined) return { status: 'missing', note: `I don't know the price of ${s.missing.map((m) => an(label(m))).join(' and ')}.` };
    if (mode === 'left') return { status: 'supported', value: `You have ${money(s.left, lst)} left.`, answer: s.left };
    const what = extra.map((e) => count(e.quantity, e.text)).join(' and ');
    return { status: 'supported', value: s.affordable ? `Yes, ${what} ${extra.length === 1 && extra[0].quantity === 1 ? 'costs' : 'cost'} ${money(s.total, lst)} and you have ${money(budget, lst)}.` : `No, ${what} ${extra.length === 1 && extra[0].quantity === 1 ? 'costs' : 'cost'} ${money(s.total, lst)} and you have ${money(budget, lst)}.`, answer: s.affordable ? 'yes' : 'no' };
  }
  return { status: 'unsupported', note: `I cannot answer "${text ?? ''}" about a list yet.` };
}
