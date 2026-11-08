// ---------------------------------------------------------------------------------------------------------------
// Shared helper block. Generators must stay browser-safe and import nothing, so this block is duplicated verbatim in
// every worlds/<id>/datagen.mjs. Value lists: small lists are embedded below and in the world section; when the export
// script passes `context` ({ lexicons: { <lexicon id>: [words] }, names: { m: [], f: [] }, kb: [records] }) the world's
// own .sop vocabulary is used instead, so new vocabulary widens the data automatically.
// ---------------------------------------------------------------------------------------------------------------
const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sp = (w) => String(w).replace(/_/g, ' ');
const q = (s) => JSON.stringify(String(s));
const IRR = { mouse: 'mice', goose: 'geese', wolf: 'wolves', leaf: 'leaves', calf: 'calves', loaf: 'loaves', half: 'halves', sheep: 'sheep', fish: 'fish', deer: 'deer', goldfish: 'goldfish', jellyfish: 'jellyfish', starfish: 'starfish', child: 'children', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', leu: 'lei' };
const plural = (w) => {
  const parts = sp(w).split(' ');
  const last = parts.pop();
  const p = IRR[last] ?? (/(s|x|ch|sh)$/.test(last) ? last + 'es' : /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : last + 's');
  return [...parts, p].join(' ');
};
const art = (w) => (/^(hour|honest|heir)/.test(w) || (/^[aeiou]/.test(w) && !/^(unicorn|university|uniform|one|european|user|ufo|eu)/.test(w)) ? 'an' : 'a');
const NUMW = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
/** A number as digits, or (with probability p) as a number word. */
const nt = (r, n, p = 0.15) => (Number.isInteger(n) && n >= 0 && n <= 20 && chance(r, p) ? NUMW[n] : String(n));
const NAMES_FB = { m: ['tom', 'ben', 'jack', 'sam', 'max', 'leo', 'dan', 'paul', 'peter', 'john', 'ion', 'mihai', 'andrei'], f: ['mia', 'emma', 'lily', 'zoe', 'amy', 'kate', 'lucy', 'jane', 'alice', 'mary', 'ana', 'maria', 'elena'] };
const BAD_NAMES = new Set(['mark', 'may', 'will']);
const mk = (c) => {
  const lexicons = c?.lexicons ?? {};
  const nm = c?.names?.m?.length && c?.names?.f?.length ? c.names : NAMES_FB;
  return {
    lex: (id, fb) => (lexicons[id]?.length ? lexicons[id] : fb),
    kb: c?.kb ?? [],
    /** A person { name, id, g } (g = m|f), optionally of gender `g` and different from the people in `not`. */
    person(r, g, not = []) {
      for (let k = 0; k < 50; k++) {
        const gg = g ?? (chance(r, 0.5) ? 'm' : 'f');
        const n = pick(r, nm[gg]);
        if (BAD_NAMES.has(n) || not.some((p) => p.id === 'e.' + n)) continue;
        return { name: cap(n), id: 'e.' + n, g: gg, ref: '$e.' + n };
      }
      return { name: 'Tom', id: 'e.tom', g: 'm', ref: '$e.tom' };
    },
  };
};
/** Expected circuit: E(w1, w2, ...) where w = [type, { key: value }]; ids are placeholders x1, x2, ... */
const E = (...ws) => ws.map(([type, kv], i) => `@x${i + 1} ${type} ${Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd()).join('\n');
const QW = new Set(['what', 'how', 'who', 'where', 'when', 'which', 'does', 'do', 'is', 'are', 'can', 'did', 'has', 'have', 'could', 'tell', 'add', 'show', 'open', 'put', 'name', 'multiply', 'divide', 'subtract', 'calculate', 'if', 'mix', 'remove', 'delete', 'clear', 'remind', 'write', 'take', 'mark', 'set', 'list']);
/** Light surface noise that the rule formalizer is specified to ignore (fillers, final punctuation, question mark). */
const noise = (r, text) => {
  let t = text;
  if (chance(r, 0.18)) {
    const first = t.split(/\s+/)[0].toLowerCase();
    const body = QW.has(first.replace(/[^a-z]/g, '')) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
    t = pick(r, ['Okay, ', 'Well, ', 'Please, ', 'So, ', 'Um, ']) + body;
  }
  if (chance(r, 0.15)) t = t.replace(/[.?!]+$/, (m) => (m === '?' ? '' : m === '.' ? pick(r, ['', '!']) : ''));
  return t;
};
/** Run the templates round-robin (every group is covered), `count` examples at most. */
const run = (T, r, count, x, { noisy = true } = {}) => {
  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const t = T[tries % T.length];
    const ex = t.make(r, x);
    if (!ex) continue;
    const text = noisy && !ex.negative && t.noise !== false && chance(r, 0.3) ? noise(r, ex.text) : ex.text;
    const key = JSON.stringify([ex.context ?? [], text]);
    if (seen.has(key)) continue;
    seen.add(key);
    const rec = { text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph };
    if (ex.context?.length) rec.context = ex.context;
    if (ex.negative) rec.negative = true;
    out.push(rec);
  }
  return out;
};
// ---------------------------------------------------------------------------------------------------------------
export const version = '1';
const T_ = 'kids.shop.';
// Items come from lex.kids.shop.items (context) with an embedded fallback; prices are not needed for the expected circuits
// (statements about price use fresh random prices, questions only name the item).
const ITEMS_FB = ['ball', 'pencil', 'pen', 'eraser', 'ruler', 'notebook', 'sticker', 'book', 'backpack', 'apple', 'banana', 'orange', 'pear', 'bread', 'milk', 'juice', 'water', 'biscuit', 'chocolate', 'ice_cream', 'sandwich', 'toy_car', 'doll', 'kite', 'puzzle', 'balloon'];
const MASS = new Set(['bread', 'milk', 'juice', 'water', 'chocolate']);
const all = (x) => x.lex('lex.kids.shop.items', ITEMS_FB);
const countable = (x) => all(x).filter((i) => !MASS.has(i));
const N = (r, hi = 9) => 1 + Math.floor(r() * hi);
const lei = (r, n, p = 0.7) => (chance(r, p) ? ` ${n === 1 ? 'leu' : 'lei'}` : '');
const leiReq = (n) => `${n} ${n === 1 ? 'leu' : 'lei'}`;
const KIN = ['mom', 'mum', 'dad', 'grandma', 'grandpa', 'aunt', 'uncle', 'friend', 'teacher', 'sister', 'brother'];

/** A basket of one or two kinds of item: text and the expected where-keys. */
function basket(r, x, { minN = 1, single = null } = {}) {
  const two = single === null ? chance(r, 0.5) : !single;
  const pool = countable(x);
  const it1 = pick(r, pool);
  let it2 = pick(r, pool); while (it2 === it1) it2 = pick(r, pool);
  const part = (it, article) => (article ? { text: `${art(sp(it))} ${sp(it)}`, n: 1 } : (() => { const n = Math.max(minN, N(r)); return { text: `${nt(r, n)} ${sp(n === 1 ? it : plural(it))}`, n }; })());
  const a1 = part(it1, !two && minN === 1 ? chance(r, 0.4) : two && chance(r, 0.4));
  if (!two) return { text: a1.text, where: { item: it1, count: a1.n } };
  const a2 = part(it2, chance(r, 0.4));
  return { text: `${a1.text} and ${a2.text}`, where: { item: it1, count: a1.n, item2: it2, count2: a2.n } };
}
const Q = (type, seek, where) => ['core.question', { type: T_ + type, seek, ...Object.fromEntries(Object.entries(where).map(([k, v]) => ['where.' + k, v])) }];
const TOG = ['', '', ' together', ' altogether', ' in total'];

const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });

// statements: pocket money
add('shop.money', 'statement', (r) => { const n = N(r, 60);
  return { text: `I ${pick(r, ['have', 'have got', 'only have'])} ${leiReq(n)}${pick(r, ['', ' now', ' today', ' left', ' in my wallet', ' with me'])}.`, expect: E([T_ + 'money', { count: n, unit: 'leu' }]) }; });
add('shop.money.start', 'statement', (r) => { const n = N(r, 60);
  return { text: `I ${pick(r, ['start', 'started', 'begin', 'began'])} with ${leiReq(n)}.`, expect: E([T_ + 'money', { count: n, unit: 'leu' }]) }; });
add('shop.money.wallet', 'statement', (r) => { const n = N(r, 60);
  return { text: `My ${pick(r, ['wallet', 'piggy bank', 'purse', 'money box'])} ${pick(r, ['has', 'had', 'holds', 'contains'])} ${leiReq(n)}.`, expect: E([T_ + 'money', { count: n, unit: 'leu' }]) }; });
add('shop.income', 'statement', (r) => { const n = N(r, 40);
  return { text: `I ${pick(r, ['got', 'found', 'received', 'earned', 'won', 'saved'])} ${n} ${pick(r, ['', 'more '])}${n === 1 ? 'leu' : 'lei'}.`, expect: E([T_ + 'income', { count: n, unit: 'leu' }]) }; });
add('shop.income.from', 'multi-entity', (r, x) => { const n = N(r, 40), p = x.person(r);
  const who = chance(r, 0.5) ? `${p.name} ${pick(r, ['gives', 'gave'])}` : `${chance(r, 0.5) ? 'My ' : ''}${pick(r, KIN)} ${pick(r, ['gives', 'gave'])}`.replace(/^([a-z])/, (m) => m.toUpperCase());
  return { text: `${who} me ${n} ${n === 1 ? 'leu' : 'lei'}.`, expect: E([T_ + 'income', { count: n, unit: 'leu' }]) }; });
add('shop.income.pronoun', 'coreference', (r, x) => { const n = N(r, 40), m = N(r, 40), p = x.person(r);
  return { context: [`${p.name} gave me ${n} lei.`], text: `${p.g === 'm' ? 'He' : 'She'} gives me ${m} more ${m === 1 ? 'leu' : 'lei'}.`, expect: E([T_ + 'income', { count: m, unit: 'leu' }]) }; });
add('shop.expense', 'statement', (r) => { const n = N(r, 40);
  return { text: `I ${pick(r, ['spend', 'spent', 'lost', 'paid', 'pay', 'lose'])} ${leiReq(n)}.`, expect: E([T_ + 'expense', { count: n, unit: 'leu' }]) }; });
add('shop.expense.number-words', 'number-words', (r) => { const n = N(r, 20);
  return { text: `I spent ${NUMW[n]} ${n === 1 ? 'leu' : 'lei'}.`, expect: E([T_ + 'expense', { count: n, unit: 'leu' }]) }; });
add('shop.buy', 'statement', (r, x) => { const b = basket(r, x, { single: true });
  const verb = pick(r, ['buy', 'bought', 'purchased', 'will buy', 'am buying', 'am going to buy']);
  return { text: `I ${verb} ${b.text}.`, expect: E([T_ + 'purchase', { item: b.where.item, count: b.where.count }]) }; });
add('shop.buy.two', 'multi-entity', (r, x) => { const b = basket(r, x, { single: false });
  return { text: `I ${pick(r, ['buy', 'bought', 'purchased'])} ${b.text}.`, expect: E([T_ + 'purchase', { item: b.where.item, count: b.where.count }], [T_ + 'purchase', { item: b.where.item2, count: b.where.count2 }]) }; });
add('shop.buy.number-words', 'number-words', (r, x) => { const it = pick(r, countable(x)), n = 2 + N(r, 8);
  return { text: `I bought ${NUMW[n]} ${sp(plural(it))}.`, expect: E([T_ + 'purchase', { item: it, count: n }]) }; });

// statements: prices
add('shop.price.costs', 'statement', (r, x) => { const it = pick(r, all(x)), n = N(r, 30), sg = chance(r, 0.5);
  return { text: sg ? `${cap(art(sp(it)))} ${sp(it)} costs ${n}${lei(r, n, 1)}${pick(r, ['', ' each', ' now', ' today'])}.` : `${cap(sp(plural(it)))} cost ${n}${lei(r, n, 1)}${pick(r, ['', ' each'])}.`, expect: E([T_ + 'price', { item: it, cost: n }]) }; });
add('shop.price.is', 'statement', (r, x) => { const it = pick(r, all(x)), n = N(r, 30);
  return { text: chance(r, 0.5) ? `The ${sp(it)} is ${n}${lei(r, n, 1)}.` : `${cap(sp(plural(it)))} are ${n}${lei(r, n, 1)} each.`, expect: E([T_ + 'price', { item: it, cost: n }]) }; });
add('shop.price.of', 'statement', (r, x) => { const it = pick(r, all(x)), n = N(r, 30);
  return { text: `The ${pick(r, ['price', 'cost'])} of ${pick(r, [`${art(sp(it))} `, 'the ', 'one '])}${sp(it)} is ${n}${lei(r, n, 1)}.`, expect: E([T_ + 'price', { item: it, cost: n }]) }; });
add('shop.price.new-item', 'statement', (r) => { const it = pick(r, ['rocket', 'robot', 'skateboard', 'scooter', 'guitar', 'telescope']), n = N(r, 90);
  return { text: `${cap(art(it))} ${it} costs ${n} lei.`, expect: E([T_ + 'price', { item: it, cost: n }]) }; });
add('shop.price.number-words', 'number-words', (r, x) => { const it = pick(r, all(x)), n = 1 + N(r, 19);
  return { text: `The ${sp(it)} costs ${NUMW[n]} lei.`, expect: E([T_ + 'price', { item: it, cost: n }]) }; });

// price questions
add('shop.q.price', 'question', (r, x) => { const it = pick(r, all(x)), d = pick(r, [`${art(sp(it))} `, 'the ', 'one ', '']);
  const s = sp(it), t = pick(r, [`How much does ${d}${s} cost${pick(r, ['', ' each', ' today'])}?`, `How much is ${d}${s}?`, `What does ${d}${s} cost?`, `What is the ${pick(r, ['price', 'cost'])} of ${d}${s}?`, `How much money does ${d}${s} cost?`]);
  return { text: t, expect: E(Q('price', 'cost', { item: it })) }; });
add('shop.q.price.plural', 'question', (r, x) => { const it = pick(r, countable(x));
  return { text: `How much do ${sp(plural(it))} cost?`, expect: E(Q('price', 'cost', { item: it })) }; });
// totals
const FAMS = [
  ['total.cost', 'question', (B, r) => `How much ${pick(r, ['do', 'does', 'will', 'would'])} ${B} cost${pick(r, TOG)}?`, 'total', 'total', 2],
  ['total.is', 'question', (B, r) => `How much ${pick(r, ['is', 'are'])} ${B}${pick(r, TOG)}?`, 'total', 'total', 2],
  ['total.what', 'question', (B, r) => `What ${pick(r, ['do', 'does', 'will', 'would'])} ${B} cost${pick(r, TOG)}?`, 'total', 'total', 2],
  ['total.price', 'question', (B, r) => `What is the ${pick(r, ['price', 'cost', 'total'])} ${pick(r, ['of', 'for'])} ${B}?`, 'total', 'total', 2],
  ['total.pay', 'question', (B, r) => `How much ${pick(r, ['do', 'will', 'would', 'must', 'should'])} I ${pick(r, ['pay', 'need', 'spend'])} for ${B}?`, 'total', 'total', 1],
  ['can.buy', 'question', (B, r) => `${pick(r, ['Can', 'Could', 'May'])} I ${pick(r, ['buy', 'get', 'have', 'afford'])} ${B}?`, 'affordability', 'answer', 1],
  ['can.enough', 'question', (B, r) => `Do I have enough${pick(r, ['', ' money', ' lei'])} ${pick(r, ['for', 'to buy'])} ${B}?`, 'affordability', 'answer', 1],
  ['can.enough2', 'question', (B, r) => `Is my money enough ${pick(r, ['for', 'to buy'])} ${B}?`, 'affordability', 'answer', 1],
];
for (const [g, ph, text, type, seek, minSingle] of FAMS) {
  add(`shop.q.${g}`, ph, (r, x) => { const b = basket(r, x, { minN: minSingle === 2 ? 2 : 1 });
    // for the plain cost families a single "a ball" is a price question, not a total: require counts of 2 or more
    return { text: text(b.text, r), expect: E(Q(type, seek, b.where)) }; });
}
const paid = (r) => { const m = 10 * N(r, 10); return { m, t: `${m}${lei(r, m, 0.6)}` }; };
const CH = [
  ['change.what', (B, p, r) => `What is the change from ${p.t} ${pick(r, ['if', 'when', 'after'])} I buy ${B}?`],
  ['change.much', (B, p, r) => `How much change ${pick(r, ['do', 'will', 'would', 'can'])} I ${pick(r, ['get', 'have', 'receive', 'expect'])} from ${p.t} ${pick(r, ['if', 'when', 'after'])} I buy ${B}?`],
  ['change.pay', (B, p, r) => `If I pay${pick(r, ['', ' with'])} ${p.t} for ${B}, what is ${pick(r, ['my', 'the'])} change?`],
  ['change.with', (B, p, r) => `I buy ${B} with ${p.t}, how much change ${pick(r, ['do', 'will'])} I ${pick(r, ['get', 'receive'])}?`],
  ['change.give', (B, p, r) => `I give ${pick(r, ['', 'the shopkeeper ', 'the cashier ', 'the seller '])}${p.t} for ${B}, how much change ${pick(r, ['do', 'will'])} I ${pick(r, ['get', 'receive'])}?`],
];
for (const [g, text] of CH) add(`shop.q.${g}`, 'question', (r, x) => { const b = basket(r, x), p = paid(r);
  return { text: text(b.text, p, r).replace(/\s+/g, ' '), expect: E(Q('change', 'amount', { paid: p.m, ...b.where })) }; });
add('shop.q.balance', 'question', (r) => ({
  text: pick(r, ['How much money do I have left?', 'How much money will I have now?', 'How much do I have left?', 'How many lei do I have now?', 'How much money is left?', 'What is my money?', 'What is my balance?', 'How much is left?', 'How much money would I have then?', 'How much money is left for me?']), expect: E(Q('balance', 'amount', {})) }));
add('shop.q.context', 'context', (r, x) => { const n = N(r, 50), b = basket(r, x, { single: true });
  return { context: [`I have ${n} lei.`, `The ${sp(b.where.item)} costs ${N(r, 20)} lei.`], text: `Can I buy ${b.text}?`, expect: E(Q('affordability', 'answer', b.where)) }; });
add('shop.q.number-words', 'number-words', (r, x) => { const it = pick(r, countable(x)), n = 2 + N(r, 8);
  return { text: `How much do ${NUMW[n]} ${sp(plural(it))} cost?`, expect: E(Q('total', 'total', { item: it, count: n })) }; });

// negation, near misses, out of domain
add('shop.neg', 'negation', (r, x) => { const it = pick(r, countable(x)), n = N(r);
  return { text: pick(r, [`I did not buy ${n} ${sp(plural(it))}.`, `I don't have ${n} lei.`, `I never spent ${n} lei.`, `I can't buy ${art(sp(it))} ${sp(it)}.`, `A ${sp(it)} does not cost ${n} lei.`]), negative: true }; });
add('shop.near.unit', 'near-miss', (r, x) => { const it = pick(r, countable(x)), n = N(r, 30);
  return { text: pick(r, [`I have ${n} dollars.`, `I have ${n} euros.`, `The ${sp(it)} costs ${n} euros.`, `How much does a ${pick(r, ['rocket', 'castle'])} weigh?`, `I buy ${n} rockets.`, `I buy a ${pick(r, ['rocket', 'castle', 'dinosaur'])}.`, `How many lei does Tom have?`]), negative: true }; });
add('shop.near.other-person', 'near-miss', (r, x) => { const p = x.person(r), it = pick(r, countable(x)), n = N(r);
  return { text: pick(r, [`${p.name} has ${n} ${sp(plural(it))}.`, `${p.name} bought ${n} ${sp(plural(it))}.`, `How many ${sp(plural(it))} does ${p.name} have?`]), negative: true }; });
add('shop.ood', 'out-of-domain', (r) => ({ text: pick(r, ['What day is tomorrow?', 'What does a rabbit eat?', 'How many sides does a hexagon have?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Open the editor.', 'Play hangman.', 'What color is the sky?', 'Hello!', 'Where does a camel live?', 'Is a whale a fish?', 'Center.']), negative: true }));

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
