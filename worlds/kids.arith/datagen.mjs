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
const T_ = 'kids.arith.';
const ITEMS_FB = ['apple', 'pear', 'orange', 'banana', 'cake', 'sticker', 'marble', 'coin', 'pencil', 'book', 'ball', 'doll', 'kite', 'balloon', 'toy_car', 'ice_cream', 'cube', 'shell', 'flower', 'egg'];
const items = (x) => x.lex('lex.kids.arith.items', ITEMS_FB);
const cnt = (r, n, it, p = 0.12) => (n === 1 ? `${nt(r, 1, p)} ${sp(it)}` : `${nt(r, n, p)} ${sp(plural(it))}`);
const a1 = (it) => `${art(sp(it))} ${sp(it)}`;
const N = (r, hi = 12) => 1 + Math.floor(r() * hi);
const D = (it) => ({ item: it });
const VERB = {
  eat: ['eats', 'ate'], lose: ['loses', 'lost', 'drops', 'dropped'], buy: ['buys', 'bought', 'purchases', 'purchased'],
  break: ['breaks', 'broke'], get: ['gets', 'got', 'receives', 'received', 'finds', 'found', 'collects', 'collected', 'wins', 'won'],
};
const TYPE = { eat: 'eat', lose: 'lose', buy: 'buy', break: 'break', get: 'receive' };
const OWN = { m: 'his', f: 'her' };
const holding = (p, n, it) => [T_ + 'holding', { owner: p.ref, count: n, item: it }];
const change = (type, p, n, it) => [T_ + type, { who: p.ref, count: n, item: it }];
const give = (a, b, n, it) => [T_ + 'give', { who: a.ref, to: b.ref, count: n, item: it }];
const two = (r, x) => { const it = pick(r, items(x)); let it2 = pick(r, items(x)); while (it2 === it) it2 = pick(r, items(x)); return [it, it2]; };
const diffPeople = (r, x) => { const a = x.person(r); return [a, x.person(r, undefined, [a])]; };

const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });

// statements
add('arith.has', 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r, 20);
  return { text: `${p.name} ${pick(r, ['has', 'had', 'has got', 'has now'])} ${cnt(r, n, it)}${pick(r, ['', '', ' now', ' today', ' at first'])}.`, expect: E(holding(p, n, it)) }; });
add('arith.has.a', 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: `${p.name} ${pick(r, ['has', 'had', 'has got'])} ${a1(it)}.`, expect: E(holding(p, 1, it)) }; });
add('arith.has.no', 'negation', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: `${p.name} ${pick(r, ['has', 'had'])} no ${sp(plural(it))}.`, expect: E(holding(p, 0, it)) }; });
add('arith.has.start', 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r, 20);
  return { text: `${p.name} ${pick(r, ['starts', 'started', 'begins', 'began'])} with ${cnt(r, n, it)}.`, expect: E(holding(p, n, it)) }; });
add('arith.has.user', 'coreference', (r, x) => { const it = pick(r, items(x)), n = N(r);
  return { text: `I have ${cnt(r, n, it)}.`, expect: E([T_ + 'holding', { owner: '$e.user', count: n, item: it }]) }; });
add('arith.has.two', 'multi-entity', (r, x) => { const p = x.person(r), [i1, i2] = two(r, x), n = N(r), m = N(r);
  return { text: `${p.name} ${pick(r, ['has', 'had', 'has got'])} ${cnt(r, n, i1)} and ${cnt(r, m, i2)}.`, expect: E(holding(p, n, i1), holding(p, m, i2)) }; });
add('arith.has.clauses', 'multi-entity', (r, x) => { const [a, b] = diffPeople(r, x), [i1, i2] = two(r, x), n = N(r), m = N(r);
  return { text: `${a.name} has ${cnt(r, n, i1)} and ${b.name} has ${cnt(r, m, i2)}.`, expect: E(holding(a, n, i1), holding(b, m, i2)) }; });
add('arith.give.direct', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r);
  return { text: `${a.name} ${pick(r, ['gives', 'gave'])} ${b.name} ${cnt(r, n, it)}.`, expect: E(give(a, b, n, it)) }; });
add('arith.give.to', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r);
  return { text: `${a.name} ${pick(r, ['gives', 'gave'])} ${cnt(r, n, it)} to ${b.name}.`, expect: E(give(a, b, n, it)) }; });
add('arith.give.a', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x));
  const v = pick(r, ['gives', 'gave']);
  return { text: chance(r, 0.5) ? `${a.name} ${v} ${b.name} ${a1(it)}.` : `${a.name} ${v} ${a1(it)} to ${b.name}.`, expect: E(give(a, b, 1, it)) }; });
add('arith.give.of', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r);
  const poss = OWN[a.g];
  return { text: chance(r, 0.5) ? `${a.name} gave ${nt(r, n)} of ${poss} ${sp(plural(it))} to ${b.name}.` : `${a.name} gave ${b.name} ${nt(r, n)} of ${poss} ${sp(plural(it))}.`, expect: E(give(a, b, n, it)) }; });
add('arith.give.from', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r);
  return { text: `${b.name} ${pick(r, ['gets', 'got', 'receives', 'received', 'takes', 'took'])} ${cnt(r, n, it)} from ${a.name}.`, expect: E(give(a, b, n, it)) }; });
add('arith.give.from.a', 'statement', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x));
  return { text: `${b.name} ${pick(r, ['gets', 'got', 'receives', 'received'])} ${a1(it)} from ${a.name}.`, expect: E(give(a, b, 1, it)) }; });
for (const [verb, forms] of Object.entries(VERB)) {
  add(`arith.${verb}`, 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r);
    const more = verb === 'get' ? pick(r, ['', '', 'more ', 'new ']) : '';
    return { text: `${p.name} ${pick(r, forms)} ${nt(r, n)} ${more}${sp(n === 1 ? it : plural(it))}.`, expect: E(change(TYPE[verb], p, n, it)) }; });
  add(`arith.${verb}.a`, 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x));
    return { text: `${p.name} ${pick(r, forms)} ${a1(it)}.`, expect: E(change(TYPE[verb], p, 1, it)) }; });
  if (verb !== 'get') add(`arith.${verb}.of`, 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r);
    return { text: `${p.name} ${pick(r, forms)} ${nt(r, n)} of ${OWN[p.g]} ${sp(plural(it))}.`, expect: E(change(TYPE[verb], p, n, it)) }; });
  // ellipsis: the item comes from the earlier message
  add(`arith.${verb}.omit`, 'ellipsis', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r, 20), m = N(r, 5);
    return { context: [`${p.name} has ${cnt(r, n, it, 0)}.`], text: `${p.name} ${pick(r, forms)} ${m}${verb === 'get' || verb === 'buy' ? pick(r, ['', ' more']) : ''}.`, expect: E(change(TYPE[verb], p, m, it)) }; });
  add(`arith.${verb}.pronoun`, 'coreference', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r, 20), m = N(r, 5);
    return { context: [`${p.name} has ${cnt(r, n, it, 0)}.`], text: `${p.g === 'm' ? 'He' : 'She'} ${pick(r, forms)} ${cnt(r, m, it, 0)}.`, expect: E(change(TYPE[verb], p, m, it)) }; });
}
add('arith.give.omit', 'ellipsis', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r, 20), m = N(r, 5);
  return { context: [`${a.name} has ${cnt(r, n, it, 0)}.`], text: chance(r, 0.5) ? `${a.name} gives ${m} to ${b.name}.` : `${a.name} gave ${b.name} ${m}.`, expect: E(give(a, b, m, it)) }; });
add('arith.ellipsis.two-items', 'ellipsis', (r, x) => { const [a, b] = diffPeople(r, x), [i1, i2] = two(r, x), n = N(r, 20), m = N(r, 20), k = N(r, 5);
  return { context: [`${a.name} has ${cnt(r, n, i1, 0)}.`, `${b.name} has ${cnt(r, m, i2, 0)}.`], text: `${a.name} lost ${k}.`, expect: E(change('lose', a, k, i1)) }; });
add('arith.pronoun.give', 'coreference', (r, x) => { const a = x.person(r, 'f'), b = x.person(r, 'm', [a]), it = pick(r, items(x)), n = N(r), k = N(r, 5);
  return { context: [`${b.name} has ${cnt(r, n, it, 0)}.`], text: `${a.name} gives him ${cnt(r, k, it, 0)}.`, expect: E(give(a, b, k, it)) }; });
add('arith.pronoun.two-people', 'coreference', (r, x) => { const a = x.person(r, 'm'), b = x.person(r, 'f'), it = pick(r, items(x)), k = N(r, 5), who = chance(r, 0.5) ? a : b;
  return { context: [`${a.name} has ${cnt(r, 9, it, 0)}.`, `${b.name} has ${cnt(r, 7, it, 0)}.`], text: `${who.g === 'm' ? 'He' : 'She'} ate ${cnt(r, k, it, 0)}.`, expect: E(change('eat', who, k, it)) }; });
add('arith.eat.clauses', 'multi-entity', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), n = N(r, 6), m = N(r, 6);
  return { context: [`${a.name} has ${cnt(r, 9, it, 0)}.`], text: `${a.name} ate ${cnt(r, n, it, 0)} and ${b.name} ate ${m}.`, expect: E(change('eat', a, n, it), change('eat', b, m, it)) }; });

// questions
const Q = (type, seek, where, extra = {}) => ['core.question', { type: T_ + type, seek, ...extra, ...Object.fromEntries(Object.entries(where).map(([k, v]) => ['where.' + k, v])) }];
add('arith.q.count', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: `How many ${sp(plural(it))} ${pick(r, ['does', 'will', 'did'])} ${p.name} have${pick(r, ['', ' now', ' left', ' today', ' then'])}?`, expect: E(Q('holding', 'count', { owner: p.ref, item: it })) }; });
add('arith.q.count.variants', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x)), w = Q('holding', 'count', { owner: p.ref, item: it }), pl = sp(plural(it));
  const t = pick(r, [`How many ${pl} has ${p.name} got?`, `How many ${pl} does ${p.name} own?`, `How many ${pl} are left for ${p.name}?`, `What is the number of ${pl} ${p.name} has?`]);
  return { text: t, expect: E(w) }; });
add('arith.q.count.user', 'coreference', (r, x) => { const it = pick(r, items(x));
  return { text: `How many ${sp(plural(it))} do I have?`, expect: E(Q('holding', 'count', { owner: '$e.user', item: it })) }; });
add('arith.q.count.pronoun', 'coreference', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { context: [`${p.name} has ${cnt(r, 6, it, 0)}.`], text: `How many ${sp(plural(it))} does ${p.g === 'm' ? 'he' : 'she'} have?`, expect: E(Q('holding', 'count', { owner: p.ref, item: it })) }; });
add('arith.q.has', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  const t = pick(r, [`Does ${p.name} have any ${sp(plural(it))}?`, `Does ${p.name} have ${a1(it)}?`, `Has ${p.name} got some ${sp(plural(it))}?`]);
  return { text: t, expect: E(Q('has', 'answer', { owner: p.ref, item: it })) }; });
add('arith.q.total', 'question', (r, x) => { const it = pick(r, items(x)), pl = sp(plural(it));
  const t = pick(r, [`How many ${pl} are there altogether?`, `How many ${pl} are there in total?`, `How many ${pl} in total?`, `What is the total number of ${pl}?`, `How many ${pl} do they have altogether?`, `How many ${pl} do we have in all?`]);
  return { text: t, expect: E(Q('total', 'count', { item: it })) }; });
add('arith.q.total.pair', 'multi-entity', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = sp(plural(it));
  const t = pick(r, [`How many ${pl} do ${a.name} and ${b.name} have together?`, `How many ${pl} have ${a.name} and ${b.name} got in total?`, `How many ${pl} does ${a.name} and ${b.name} have altogether?`]);
  return { text: t, expect: E(Q('total', 'count', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.most', 'comparison', (r, x) => { const it = pick(r, items(x));
  return { text: `Who ${pick(r, ['has', 'had'])} the most ${sp(plural(it))}?`, expect: E(Q('leader', 'winner', { item: it })) }; });
add('arith.q.more.pair', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = sp(plural(it));
  const t = pick(r, [`Who has more ${pl}, ${a.name} or ${b.name}?`, `Who has more ${pl} out of ${a.name} and ${b.name}?`, `Between ${a.name} and ${b.name}, who has more ${pl}?`, `Which of ${a.name} and ${b.name} has more ${pl}?`]);
  return { text: t, expect: E(Q('leader', 'winner', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.gap', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = sp(plural(it));
  const t = pick(r, [`How many more ${pl} does ${a.name} have than ${b.name}?`, `How many ${pl} does ${a.name} have more than ${b.name}?`, `How many ${pl} extra does ${a.name} have than ${b.name}?`]);
  return { text: t, expect: E(Q('gap', 'diff', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.gap.fewer', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = sp(plural(it));
  return { text: `How many ${pick(r, ['fewer', 'less'])} ${pl} does ${a.name} have than ${b.name}?`, expect: E(Q('gap', 'diff', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.gap.diff', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x));
  return { text: `What is the difference in ${sp(plural(it))} between ${a.name} and ${b.name}?`, expect: E(Q('gap', 'diff', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.verdict', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = sp(plural(it));
  return { text: pick(r, [`Does ${a.name} have more ${pl} than ${b.name}?`, `Has ${a.name} got more ${pl} than ${b.name}?`]), expect: E(Q('verdict', 'answer', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.q.verdict.fewer', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x));
  return { text: `Does ${a.name} have ${pick(r, ['fewer', 'less'])} ${sp(plural(it))} than ${b.name}?`, expect: E(Q('verdict', 'answer', { item: it, who1: b.ref, who2: a.ref })) }; });

// bare arithmetic
const PRE = ['What is', 'How much is', 'Calculate', 'Tell me', ''];
const CALC = [
  ['plus', ['plus', '+', 'added to', 'add'], 'plus'], ['minus', ['minus', '-', 'take away', 'less', 'subtract'], 'minus'],
  ['times', ['times', 'x', 'multiplied by', '*', '×', 'groups of'], 'times'], ['div', ['divided by', '/', 'shared by', '÷'], 'divided_by'],
];
for (const [g, ops, op] of CALC) {
  add(`arith.calc.${g}`, 'arithmetic', (r, x) => { let a = N(r, 20), b = N(r, 12); if (g === 'minus' && b > a) [a, b] = [b, a]; if (g === 'div') { b = N(r, 9); a = b * N(r, 9); }
    const o = pick(r, ops), pre = pick(r, PRE);
    const sym = /^[-+*/×÷]$/.test(o);
    const body = `${nt(r, a)}${sym && chance(r, 0.4) ? o : ' ' + o + ' '}${nt(r, b)}`.replace(/\s+/g, ' ');
    return { text: `${pre ? pre + ' ' : ''}${body}${pre ? '?' : chance(r, 0.4) ? ' =' : '?'}`.trim(), expect: E(Q('calc', 'result', { op, a, b })) }; });
}
add('arith.calc.sum-product', 'arithmetic', (r) => { const a = N(r, 20), b = N(r, 12), k = pick(r, [['the sum of', 'plus'], ['the product of', 'times']]);
  return { text: `What is ${k[0]} ${nt(r, a)} and ${nt(r, b)}?`, expect: E(Q('calc', 'result', { op: k[1], a, b })) }; });
add('arith.calc.verbs', 'request', (r) => { const a = N(r, 20), b = N(r, 9), k = pick(r, ['add', 'multiply', 'subtract', 'divide']);
  const text = { add: `Add ${a} and ${b}.`, multiply: `Multiply ${a} by ${b}.`, subtract: `Subtract ${b} from ${a + b}.`, divide: `Divide ${a * b} by ${b}.` }[k];
  const w = { add: { op: 'plus', a, b }, multiply: { op: 'times', a, b }, subtract: { op: 'minus', a: a + b, b }, divide: { op: 'divided_by', a: a * b, b } }[k];
  return { text, expect: E(Q('calc', 'result', w)) }; });
add('arith.calc.half-double', 'arithmetic', (r) => { const n = 2 * N(r, 10), k = pick(r, ['half', 'double', 'twice', 'halved', 'doubled']);
  const half = k === 'half' || k === 'halved';
  const text = k === 'halved' || k === 'doubled' ? `What is ${nt(r, n)} ${k}?` : `What is ${k} ${k === 'twice' ? '' : 'of '}${nt(r, n)}?`.replace('  ', ' ');
  return { text, expect: E(Q(half ? 'half' : 'double', 'result', { n })) }; });
add('arith.calc.number-words', 'number-words', (r) => { const a = N(r, 20), b = N(r, 20);
  return { text: `What is ${NUMW[a]} plus ${NUMW[b]}?`, expect: E(Q('calc', 'result', { op: 'plus', a, b })) }; });
add('arith.number-words.compound', 'number-words', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = 20 + N(r, 9), w = `twenty-${NUMW[n - 20]}`;
  return { text: `${p.name} has ${w} ${sp(plural(it))}.`, expect: E(holding(p, n, it)) }; });
add('arith.number-words.hundred', 'number-words', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = 100 + N(r, 9);
  return { text: `${p.name} has one hundred and ${NUMW[n - 100]} ${sp(plural(it))}.`, expect: E(holding(p, n, it)) }; });
add('arith.number-words.dozen', 'number-words', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: `${p.name} bought a dozen ${sp(plural(it))}.`, expect: E(change('buy', p, 12, it)) }; });

// negation and near misses (this world must not claim them)
add('arith.neg.statement', 'negation', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r);
  return { text: pick(r, [`${p.name} does not have ${cnt(r, n, it, 0)}.`, `${p.name} didn't eat ${cnt(r, n, it, 0)}.`, `${p.name} never lost ${a1(it)}.`, `${p.name} doesn't have ${cnt(r, n, it, 0)}.`]), negative: true }; });
add('arith.near.like', 'near-miss', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`${p.name} likes ${sp(plural(it))}.`, `${p.name} has ${sp(plural(it))}.`, `${p.name} wants ${cnt(r, 3, it, 0)}.`, `${p.name} sees ${cnt(r, 3, it, 0)}.`]), negative: true }; });
add('arith.near.unknown-item', 'near-miss', (r, x) => { const p = x.person(r), z = pick(r, ['rocket', 'dinosaur', 'spaceship', 'castle', 'volcano']);
  return { text: `${p.name} has ${N(r)} ${plural(z)}.`, negative: true }; });
add('arith.near.no-number', 'near-miss', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`How many ${sp(plural(it))}?`, `Does ${p.name} have?`, `${p.name} has some ${sp(plural(it))}.`]), negative: true }; });
add('arith.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, ['How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'How many sides does a hexagon have?', 'Add milk to my shopping list.', 'Open the editor.', 'Play hangman.', 'What color is the sky?', `Who is ${p.name}?`, 'Where does a camel live?', 'Is a whale a fish?', 'Let me go first.']), negative: true }; });


// ---- rule sweep: wider phrasing families (chat abbreviations, word orders, passives, comparisons) ----
const lcn = (p) => p.name.toLowerCase();
const PL = (it) => sp(plural(it));
add('arith.sw.q.noun-first', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`${lcn(p)} ${PL(it)} how many`, `uh ${lcn(p)} has how many ${PL(it)}`, `how many ${PL(it)} is ${lcn(p)} at now`, `${lcn(p)} ${PL(it)} now?`, `what is the number of ${PL(it)} ${lcn(p)} has`]), expect: E(Q('holding', 'count', { owner: p.ref, item: it })) }; });
add('arith.sw.q.polite', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`can u tell me how many ${PL(it)} ${lcn(p)} has`, `pls tell me how many ${PL(it)} ${lcn(p)} has`, `hey how many ${PL(it)} ${lcn(p)} got`, `do u know how many ${PL(it)} ${lcn(p)} has`]), expect: E(Q('holding', 'count', { owner: p.ref, item: it })) }; });
add('arith.sw.q.has-any', 'question', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`any ${PL(it)} for ${lcn(p)}?`, `is there ${a1(it)} with ${lcn(p)}`, `do u know if ${lcn(p)} has ${PL(it)}`, `does ${lcn(p)} still have ${PL(it)}`]), expect: E(Q('has', 'answer', { owner: p.ref, item: it })) }; });
const BUYMOD = { buy: ['just bought', 'has bought', 'picked up', 'purchased'], eat: ['has just eaten', 'munched', 'devoured', 'gobbled'], lose: ['has lost', 'misplaced', 'dropped'], break: ['has broken', 'smashed', 'cracked'], get: ['has just found', 'collected', 'gathered', 'earned'] };
for (const [verb, forms] of Object.entries(BUYMOD)) {
  add(`arith.sw.${verb}.mod`, 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r);
    return { text: `${pick(r, ['', '', 'fyi ', 'btw '])}${pick(r, [lcn(p), p.name])} ${pick(r, forms)} ${nt(r, n)} ${sp(n === 1 ? it : plural(it))}${pick(r, ['', '', ' today', ' yesterday', ' now'])}.`, expect: E(change(TYPE[verb], p, n, it)) }; });
  add(`arith.sw.${verb}.passive`, 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = 2 + Math.floor(r() * 9);
    const pp = { buy: 'bought', eat: 'eaten', lose: 'lost', break: 'broken', get: 'found' }[verb];
    return { text: `${n} ${PL(it)} were ${pp} by ${lcn(p)}.`, expect: E(change(TYPE[verb], p, n, it)) }; });
}
add('arith.sw.buy.shop', 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = 2 + Math.floor(r() * 9);
  return { text: `${p.name} got ${n} ${PL(it)} from the shop.`, expect: E(change('buy', p, n, it)) }; });
add('arith.sw.has.mod', 'statement', (r, x) => { const p = x.person(r), it = pick(r, items(x)), n = N(r, 20);
  return { text: pick(r, [`${p.name} is holding ${n} ${PL(it)}.`, `${p.name}'s got ${n} ${PL(it)}.`, `${p.name} ended up with ${n} ${PL(it)}.`, `${n} ${PL(it)} belong to ${lcn(p)}.`, `fyi ${lcn(p)} has ${n} ${PL(it)} left.`]), expect: E(holding(p, n, it)) }; });
add('arith.sw.has.none', 'negation', (r, x) => { const p = x.person(r), it = pick(r, items(x));
  return { text: pick(r, [`${p.name} has zero ${PL(it)}.`, `${p.name} doesn't have any ${PL(it)}.`, `${p.name} ran out of ${PL(it)}.`]), expect: E(holding(p, 0, it)) }; });
add('arith.sw.q.total.pair', 'multi-entity', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`total ${pl} for ${lcn(a)} and ${lcn(b)}`, `${pl} ${lcn(a)} + ${lcn(b)}?`, `how many ${pl} r there between ${lcn(a)} and ${lcn(b)}`, `sum of ${lcn(a)} and ${lcn(b)}'s ${pl} pls`, `together ${lcn(a)} ${lcn(b)} ${pl} how many`, `${pl} ${lcn(a)} and ${lcn(b)} together?`]), expect: E(Q('total', 'count', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.sw.q.total.all', 'question', (r, x) => { const it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`total ${pl}?`, `all the ${pl} total?`, `${pl} all together how many`, `altogether how many ${pl}`, `how many ${pl} in the whole group`, `add all the ${pl} up for me`, `sum of everybody's ${pl}`]), expect: E(Q('total', 'count', { item: it })) }; });
add('arith.sw.q.leader.pair', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`whos got more ${pl}, ${lcn(a)} or ${lcn(b)}`, `${lcn(a)} or ${lcn(b)} more ${pl}?`, `more ${pl}: ${lcn(a)} or ${lcn(b)}?`, `${lcn(a)} vs ${lcn(b)} ${pl} who wins`, `who is ahead on ${pl}, ${lcn(a)} or ${lcn(b)}`, `which 1 has more ${pl}, ${lcn(a)} or ${lcn(b)}`]), expect: E(Q('leader', 'winner', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.sw.q.leader.most', 'comparison', (r, x) => { const it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`who has the highest number of ${pl}`, `person with the most ${pl}?`, `whose ${pl} are the most`, `who has more ${pl} than the other`]), expect: E(Q('leader', 'winner', { item: it })) }; });
add('arith.sw.q.gap', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`how many ${pl} does ${lcn(a)} lack compared to ${lcn(b)}`, `${lcn(a)} is behind ${lcn(b)} by how many ${pl}`, `could u tell how many ${pl} ${lcn(a)} is missing vs ${lcn(b)}`, `how far behind ${lcn(b)} is ${lcn(a)} in ${pl}`]), expect: E(Q('gap', 'diff', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.sw.q.verdict', 'comparison', (r, x) => { const [a, b] = diffPeople(r, x), it = pick(r, items(x)), pl = PL(it);
  return { text: pick(r, [`does ${lcn(a)} beat ${lcn(b)} in ${pl}`, `${lcn(a)} has more ${pl} than ${lcn(b)}, right?`, `is ${lcn(a)} ahead of ${lcn(b)} in ${pl}`]), expect: E(Q('verdict', 'answer', { item: it, who1: a.ref, who2: b.ref })) }; });
add('arith.sw.calc.chat', 'arithmetic', (r) => { const k = pick(r, ['plus', 'minus', 'times', 'div']);
  let a = N(r, 20), b = N(r, 12); if (k === 'minus' && b > a) [a, b] = [b, a]; if (k === 'div') { b = N(r, 9); a = b * N(r, 9); }
  const op = { plus: 'plus', minus: 'minus', times: 'times', div: 'divided_by' }[k], w = { plus: 'plus', minus: 'minus', times: 'times', div: 'div' }[k];
  return { text: pick(r, [`whats ${a} ${w} ${b}`, `can u do ${a} ${w} ${b} for me`, `${a} ${w} ${b} pls`, `${a} ${w} ${b} is?`, `${a} ${w} ${b} equals what`]), expect: E(Q('calc', 'result', { op, a, b })) }; });
add('arith.sw.calc.share', 'arithmetic', (r) => { const b = 2 + Math.floor(r() * 8), a = b * N(r, 9);
  return { text: pick(r, [`if i share ${a} among ${b} how many each`, `share ${a} between ${b} kids, how many does each get`]), expect: E(Q('calc', 'result', { op: 'divided_by', a, b })) }; });
add('arith.sw.calc.double-half', 'arithmetic', (r) => { const n = 2 * N(r, 10), d = chance(r, 0.5);
  return { text: d ? pick(r, [`give me double ${n}`, `what do i get doubling ${n}`, `could u double ${n} for me`, `${n} doubled?`]) : pick(r, [`could u halve ${n} for me`, `half of ${n} pls`, `${n} in half?`]), expect: E(Q(d ? 'double' : 'half', 'result', { n })) }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
