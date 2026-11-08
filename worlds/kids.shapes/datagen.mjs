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
const T_ = 'kids.shapes.';
// Shapes, colors, kinds and things come from the world lexicons (context) with embedded fallbacks.
const SHAPES_FB = ['triangle', 'square', 'rectangle', 'pentagon', 'hexagon', 'octagon', 'circle', 'rhombus', 'oval'];
const KINDS_FB = ['triangle', 'square', 'rectangle', 'pentagon', 'hexagon', 'octagon', 'circle', 'rhombus', 'polygon', 'quadrilateral'];
const COLORS_FB = ['red', 'yellow', 'blue', 'orange', 'green', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'light_blue'];
const CK_FB = ['primary', 'secondary', 'neutral'];
const THINGS_FB = ['sky', 'grass', 'banana', 'apple', 'carrot', 'lemon', 'strawberry', 'sun', 'moon', 'snow', 'pumpkin', 'frog', 'cow', 'clock', 'pizza', 'wheel', 'coin', 'plate', 'door', 'window', 'book', 'stop_sign', 'fire_truck'];
const PARTS = ['side', 'corner'];
const shapes = (x) => x.lex('lex.kids.shapes.shapes', SHAPES_FB);
const kinds = (x) => x.lex('lex.kids.shapes.kinds', KINDS_FB);
const colors = (x) => x.lex('lex.kids.shapes.colors', COLORS_FB);
const cks = (x) => x.lex('lex.kids.shapes.colorkinds', CK_FB);
const things = (x) => x.lex('lex.kids.shapes.things', THINGS_FB).filter((t) => !['leaf', 'tomato', 'cherry', 'strawberry', 'sheep'].includes(t) || t === 'strawberry');
const NP = (r, w) => `${pick(r, [art(sp(w)) + ' ', 'the '])}${sp(w)}`;
const C = (c) => sp(c);
const Q = (type, seek, where, extra = {}) => ['core.question', { type: T_ + type, seek, ...extra, ...Object.fromEntries(Object.entries(where).map(([k, v]) => ['where.' + k, v])) }];
const F = (type, kv) => [T_ + type, kv];
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const pl = (p) => p + 's';
const SIDES = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8, rhombus: 4 };

add('shapes.q.parts', 'question', (r, x) => { const s = pick(r, shapes(x)), p = pick(r, PARTS), A = NP(r, s);
  return { text: pick(r, [`How many ${pl(p)} does ${A} have?`, `How many ${pl(p)} has ${A}?`, `Tell me how many ${pl(p)} ${A} has.`, `How many ${pl(p)} do ${plural(s)} have?`]), expect: E(Q('shape', pl(p), { name: s })) }; });
add('shapes.q.parts.new-vocabulary', 'new-vocabulary', (r) => { const s = pick(r, ['trapezium', 'heptagon', 'decagon', 'kite', 'parallelogram']), p = pick(r, PARTS);
  return { text: `How many ${pl(p)} does ${art(s)} ${s} have?`, expect: E(Q('shape', pl(p), { name: s })) }; });
add('shapes.q.parts.exists', 'question', (r, x) => { const s = pick(r, shapes(x)), p = pick(r, PARTS), n = chance(r, 0.5) ? (SIDES[s] ?? 4) : 3 + Math.floor(r() * 6);
  return { text: `Does ${NP(r, s)} have ${nt(r, n, 0.1)} ${pl(p)}?`, expect: E(Q('shape', pl(p), { name: s, [pl(p)]: n }, { mode: 'exists' })) }; });
add('shapes.q.which', 'question', (r) => { const p = pick(r, PARTS), n = 3 + Math.floor(r() * 6);
  return { text: pick(r, [`Which shape has ${n} ${pl(p)}?`, `What shapes have ${n} ${pl(p)}?`, `Name a shape with ${n} ${pl(p)}.`, `Name some shapes that have ${n} ${pl(p)}.`]), expect: E(Q('shape', 'name', { [pl(p)]: n }, { mode: 'list' })) }; });
add('shapes.q.which.none', 'negation', (r) => { const p = pick(r, PARTS);
  return { text: `Which shapes have no ${pl(p)}?`, expect: E(Q('shape', 'name', { [pl(p)]: 0 }, { mode: 'list' })) }; });
add('shapes.q.summary', 'question', (r, x) => { const s = pick(r, shapes(x));
  return { text: pick(r, [`What is ${NP(r, s)}?`, `Tell me about ${NP(r, s)}.`, `Describe ${NP(r, s)}.`, `What is ${NP(r, s)} like?`, `What are ${plural(s)} like?`]), expect: E(Q('shape', 'summary', { name: s })) }; });
add('shapes.q.family', 'question', (r, x) => { const s = pick(r, shapes(x)), k = pick(r, kinds(x));
  const t = pick(r, [`Is ${NP(r, s)} ${art(k)} ${k}?`, `Is ${NP(r, s)} a kind of ${k}?`, `Does ${NP(r, s)} count as ${art(k)} ${k}?`, `Are ${plural(s)} ${plural(k)}?`]);
  return { text: t, expect: E(Q('family', 'holds', { shape: s, kind: k })) }; });
add('shapes.q.family.round', 'question', (r, x) => { const s = pick(r, shapes(x));
  return { text: pick(r, [`Is ${NP(r, s)} round?`, `Is ${NP(r, s)} a round shape?`]), expect: E(Q('family', 'holds', { shape: s, kind: 'round_shape' })) }; });
add('shapes.q.thing-shape', 'question', (r, x) => { const t = pick(r, things(x)), s = pick(r, shapes(x));
  return chance(r, 0.5) ? { text: `What shape is ${NP(r, t)}?`, expect: E(Q('thing', 'shape', { name: t })) }
    : { text: pick(r, [`What is shaped like ${NP(r, s)}?`, `Where do we see ${NP(r, s)}?`, `Where can I find ${NP(r, s)}?`]), expect: E(Q('thing', 'name', { shape: s }, { mode: 'list' })) }; });
add('shapes.q.color-of', 'question', (r, x) => { const t = pick(r, things(x));
  return { text: pick(r, [`What ${pick(r, ['color', 'colour'])} is ${NP(r, t)}?`, `What is the ${pick(r, ['color', 'colour'])} of ${NP(r, t)}?`]), expect: E(Q('thing', 'color', { name: t })) }; });
add('shapes.q.is-color', 'question', (r, x) => { const t = pick(r, things(x)), c = pick(r, colors(x));
  return { text: `Is ${NP(r, t)} ${C(c)}?`, expect: E(Q('thing', 'is_color', { name: t, is_color: c })) }; });
add('shapes.q.things-of-color', 'question', (r, x) => { const c = pick(r, colors(x));
  return { text: pick(r, [`What things are ${C(c)}?`, `Which things are ${C(c)}?`, `Name something ${C(c)}.`, `Tell me some things ${C(c)}.`, `Which things have the color ${C(c)}?`]), expect: E(Q('thing', 'name', { color: c }, { mode: 'list' })) }; });
add('shapes.q.colorkind', 'question', (r, x) => { const c = pick(r, colors(x)), k = pick(r, cks(x));
  const w = pick(r, [[`Is ${C(c)} ${art(k)} ${k} color?`, Q('color', 'is_kind', { name: c, is_kind: k })], [`What ${pick(r, ['kind', 'type', 'sort'])} of color is ${C(c)}?`, Q('color', 'kind', { name: c })],
    [`Which colors are ${k}?`, Q('color', 'name', { kind: k }, { mode: 'list' })], [`What are the ${k} colors?`, Q('color', 'name', { kind: k }, { mode: 'list' })], [`Name the ${k} colors.`, Q('color', 'name', { kind: k }, { mode: 'list' })], [`How many ${k} colors are there?`, Q('color', 'name', { kind: k }, { mode: 'count' })]]);
  return { text: w[0], expect: E(w[1]) }; });
add('shapes.q.mix', 'question', (r, x) => { let a = pick(r, colors(x)), b = pick(r, colors(x)); while (b === a) b = pick(r, colors(x));
  const t = pick(r, [`What do ${C(a)} and ${C(b)} make?`, `What ${pick(r, ['color', 'colour'])} do ${C(a)} and ${C(b)} make?`, `What do you get if you mix ${C(a)} and ${C(b)}?`, `What color do I get when I mix ${C(a)} and ${C(b)}?`, `What happens if I mix ${C(a)} and ${C(b)}?`, `What is ${C(a)} mixed with ${C(b)}?`, `Mix ${C(a)} and ${C(b)}.`, `What color is made by mixing ${C(a)} and ${C(b)}?`]);
  return { text: t, expect: E(Q('mix', 'result', { first: a, second: b })) }; });
add('shapes.q.recipe', 'question', (r, x) => { const c = pick(r, colors(x));
  return { text: pick(r, [`How do I make ${C(c)}?`, `How can we make ${C(c)}?`, `Which colors make ${C(c)}?`, `What do I mix to get ${C(c)}?`, `What should I mix to make ${C(c)}?`]), expect: E(Q('mix', 'recipe', { result: c })) }; });
// statements
add('shapes.t.sides', 'statement', (r) => { const s = pick(r, ['rhombus', 'kite', 'trapezium', 'heptagon', 'star']), p = pick(r, PARTS), n = 3 + Math.floor(r() * 8);
  return { text: `${cap(NP(r, s))} has ${n} ${pl(p)}.`, expect: E(F('shape', { name: s, [pl(p)]: n })) }; });
add('shapes.t.color', 'statement', (r, x) => { const t = pick(r, things(x)), c = pick(r, colors(x));
  return { text: `${cap(NP(r, t))} is ${C(c)}.`, expect: E(F('thing', { name: t, color: c })) }; });
add('shapes.t.color.two', 'multi-entity', (r, x) => { const t = pick(r, things(x)); let c = pick(r, colors(x)), d = pick(r, colors(x)); while (d === c) d = pick(r, colors(x));
  return { text: `${cap(NP(r, t))} is ${C(c)} and ${C(d)}.`, expect: E(F('thing', { name: t, color: c }), F('thing', { name: t, color: d })) }; });
add('shapes.t.shape', 'statement', (r, x) => { const t = pick(r, things(x)), s = pick(r, shapes(x));
  return { text: `${cap(NP(r, t))} is ${art(s)} ${s}.`, expect: E(F('thing', { name: t, shape: s })) }; });
add('shapes.t.mix', 'statement', (r, x) => { let a = pick(r, colors(x)), b = pick(r, colors(x)), c = pick(r, colors(x)); while (b === a) b = pick(r, colors(x));
  return { text: `${cap(C(a))} and ${C(b)} make ${C(c)}.`, expect: E(F('mix', { first: a, second: b, result: c })) }; });
add('shapes.t.number-words', 'number-words', (r) => { const s = pick(r, ['rhombus', 'kite', 'trapezium']), n = 3 + Math.floor(r() * 7);
  return { text: `${cap(art(s))} ${s} has ${NUMW[n]} sides.`, expect: E(F('shape', { name: s, sides: n })) }; });
add('shapes.t.context', 'context', (r, x) => { const t = pick(r, things(x)), c = pick(r, colors(x));
  return { context: [`${cap(NP(r, t))} is ${C(c)}.`], text: `What color is the ${sp(t)}?`, expect: E(Q('thing', 'color', { name: t })) }; });
// negation, near misses, out of domain
add('shapes.neg', 'negation', (r, x) => { const t = pick(r, things(x)), c = pick(r, colors(x)), s = pick(r, shapes(x));
  return { text: pick(r, [`${cap(NP(r, t))} is not ${C(c)}.`, `${cap(NP(r, t))} isn't ${art(s)} ${s}.`, `${cap(NP(r, s))} does not have ${3 + Math.floor(r() * 5)} sides.`, `${cap(pl(s))} don't have corners.`]), negative: true }; });
add('shapes.near', 'near-miss', (r, x) => { const t = pick(r, things(x)), c = pick(r, colors(x));
  return { text: pick(r, [`What color is ${pick(r, ['happiness', 'Tuesday', 'a sound'])}?`, `Is ${NP(r, t)} delicious?`, `What do ${C(c)} and ${pick(r, ['Tuesday', 'seven'])} make?`, `How many legs does ${NP(r, pick(r, shapes(x)))} have?`, `I like ${C(c)}.`, `How many wheels does a ${pick(r, ['triangle', 'square'])} have?`]), negative: true }; });
add('shapes.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Open the editor.', 'Play hangman.', 'Hello!', 'Is a whale a fish?', 'Where does a camel live?', 'What sound does a cow make?']), negative: true }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
