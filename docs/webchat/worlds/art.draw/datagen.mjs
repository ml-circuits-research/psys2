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
const KINDS_FB = ['house', 'tree', 'sun', 'cloud', 'car', 'flower', 'cat', 'dog', 'fish', 'bird', 'boat', 'mountain', 'rainbow', 'person', 'balloon', 'rocket', 'moon', 'circle', 'square', 'triangle', 'star', 'heart', 'oval'];
const COLORS_FB = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray'];
const SIZES_FB = ['big', 'small', 'tiny', 'huge', 'little', 'large'];
const GROUND_FB = ['grass', 'sand', 'snow', 'water'];
const kinds = (x) => x.lex('lex.art.draw.things', KINDS_FB).filter((k) => KINDS_FB.includes(k));
const colors = (x) => x.lex('lex.art.draw.colors', COLORS_FB).filter((c) => COLORS_FB.includes(c));
const sizes = (x) => x.lex('lex.art.draw.sizes', SIZES_FB).filter((c) => SIZES_FB.includes(c));
const R = (action, args = {}) => ['core.request', { action: 'draw.' + action, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ['arg.' + k, v])) }];
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const ROOM = ['', '', ' in the top right corner', ' in the top left corner', ' next to the house', ' under the tree', ' on the left'];
add('draw.add.plain', 'request', (r, x) => { const k = pick(r, kinds(x)), v = pick(r, ['Draw', 'Draw', 'Sketch', 'Paint', 'Add', 'Put', 'Make']);
  return { text: `${v} ${art(k)} ${sp(k)}.`, expect: E(R('add', { kind: k, kt: q(k) })) }; });
add('draw.add.color', 'request', (r, x) => { const k = pick(r, kinds(x)), c = pick(r, colors(x)), v = pick(r, ['Draw', 'Paint', 'Add', 'Make', 'Create']);
  return { text: `${v} ${art(c)} ${c} ${sp(k)}.`, expect: E(R('add', { m1: c, kind: k, kt: q(k) })) }; });
add('draw.add.size', 'request', (r, x) => { const k = pick(r, kinds(x)), c = pick(r, colors(x)), s = pick(r, sizes(x));
  return { text: `${pick(r, ['Draw', 'Add', 'Put'])} ${art(s)} ${s} ${c} ${sp(k)}.`, expect: E(R('add', { m1: s, m2: c, kind: k, kt: q(k) })) }; });
add('draw.add.count', 'request', (r, x) => { const k = pick(r, kinds(x)), n = 2 + Math.floor(r() * 8);
  return { text: `${pick(r, ['Draw', 'Add', 'Paint'])} ${nt(r, n, 0)} ${plural(k)}.`, expect: E(R('add', { n, kind: k, kt: q(plural(k)) })) }; });
add('draw.ground', 'request', (r, x) => { const g = pick(r, x.lex('lex.art.draw.ground', GROUND_FB).filter((v) => GROUND_FB.includes(v)));
  return { text: `${pick(r, ['Add', 'Draw', 'Put'])} ${pick(r, ['', 'some '])}${g}.`, expect: E(R('ground', { g })) }; });
const SIMPLE = {
  undo: [['undo', 'draw.undo'], ['Undo.', 'undo'], ['Undo that.', 'undo'], ['Oops.', 'undo'], ['Take that back.', 'undo']],
  describe: [['What did I draw?', 'describe'], ['Describe my picture.', 'describe'], ['Describe my drawing.', 'describe'], ['What is in my picture?', 'describe']],
};
for (const [g, list] of Object.entries(SIMPLE)) add(`draw.${g}`, 'question', (r) => ({ text: pick(r, list)[0].replace(/^undo$/, 'Undo.'), expect: E(R(list[0][1].replace('draw.', '').replace(/^undo$/, 'undo'))) }), { noise: false });
add('draw.clear', 'request', (r) => ({ text: pick(r, ['Start a new drawing.', 'Clear my drawing.']), expect: E(R('clearAll')) }), { noise: false });
add('draw.count', 'question', (r, x) => { const k = pick(r, kinds(x));
  return { text: `How many ${plural(k)} are there?`, expect: E(R('count', { kind: k, kt: q(plural(k)) })) }; });
add('draw.neg', 'negation', (r, x) => { const k = pick(r, kinds(x));
  return { text: pick(r, [`Don't draw a ${sp(k)}.`, `I do not want a ${sp(k)}.`, `Never draw ${plural(k)}.`, `Do not start a new drawing.`]), negative: true }; });
add('draw.near', 'near-miss', (r, x) => { const k = pick(r, kinds(x));
  return { text: pick(r, [`The ${sp(k)} is nice.`, `I like ${plural(k)}.`, 'My drawing teacher is kind.', 'Is a picture worth a thousand words?']), negative: true }; });
add('draw.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Is a whale a fish?', 'Hello!', 'Yes.', 'What does a rabbit eat?']), negative: true }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
