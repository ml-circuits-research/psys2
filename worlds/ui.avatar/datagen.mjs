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
// Tolerance phrasings of the avatar (colour/color spellings, word orders, modal and "want" forms, coordinated commands, becoming a character).
const PARTS_FB = ['body', 'background', 'screen', 'glow', 'accent', 'skin', 'hair', 'shirt', 'clothing'];
const COLORS_FB = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray'];
const SIZES_FB = ['bigger', 'smaller', 'wider'];
const DIRN = { larger: 'bigger' };
const SIZE_BIG_FB = ['big', 'large', 'huge'];
const CHARS_FB = ['robot', 'person', 'human', 'emoji'];
const parts = (x) => x.lex('lex.ui.avatar.colorparts', PARTS_FB).filter((p) => PARTS_FB.includes(p));
const colors = (x) => x.lex('lex.ui.avatar.colors', COLORS_FB).filter((c) => COLORS_FB.includes(c));
const chars = (x) => x.lex('lex.ui.avatar.characters', CHARS_FB).filter((c) => CHARS_FB.includes(c));
const R = (action, args = {}) => ['core.request', { action: 'avatar.' + action, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ['arg.' + k, v])) }];
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const COLOUR = (r) => pick(r, ['color', 'colour', '']);
const sp1 = (s) => (s ? ' ' + s : '');
add('avatar.color.word_order', 'request', (r, x) => { const p = pick(r, parts(x)), c = pick(r, colors(x)), k = COLOUR(r);
  const text = pick(r, [`${cap(c)} ${p}${sp1(k)}.`, `${cap(p)}${sp1(k)} ${c}.`, `Make the ${p}${sp1(k)} ${c}.`, `Paint the ${p} ${c}.`, `Turn the ${p} ${c}.`, `Colour the ${p} ${c}.`, `I want a ${c} ${p}${sp1(k)}.`, `Give yourself a ${c} ${p}.`]);
  return { text, expect: E(R('setColor', { part: p, color: c })) }; });
add('avatar.color.modal', 'request', (r, x) => { const p = pick(r, parts(x)), c = pick(r, colors(x)), k = COLOUR(r);
  const text = pick(r, [`The ${p}${sp1(k)} should be ${c}.`, `${cap(p)}${sp1(k)} should be ${c}.`, `I want the ${p}${sp1(k)} to be ${c}.`, `I would like your ${p}${sp1(k)} to be ${c}.`, `Your ${p} must be ${c}.`, `The ${p} needs to be ${c}.`, `Can you make the ${p} ${c}?`, `Could you paint the ${p} ${c} please?`]);
  return { text, expect: E(R('setColor', { part: p, color: c })) }; });
add('avatar.color.main', 'request', (r, x) => { const c = pick(r, colors(x));
  return { text: pick(r, [`Make it ${c}.`, `Make me ${c}.`, `Turn the avatar ${c}.`, `Paint yourself ${c}.`]), expect: E(R('setColor', { part: 'main', color: c })) }; });
add('avatar.resize', 'request', (r, x) => { const s = pick(r, SIZES_FB), p = pick(r, ['eye', 'eyes', 'mouth']), pl = p === 'eye' ? 'eyes' : p, part = p === 'eye' ? 'eye' : p;
  const text = pick(r, [`Make the ${pl} ${s}.`, `Make ${s} ${pl}.`, `${cap(s)} ${pl} please.`, `The ${pl} should be ${s}.`, `I want the ${pl} ${s}.`, `${cap(pl)} much ${s}.`, `Can you make the ${pl} a bit ${s}?`, `Give me ${s} ${pl}.`]);
  return { text, expect: E(R('resizePart', { part: pl === 'mouth' ? 'mouth' : 'eye', dir: DIRN[s] ?? s })) }; });
add('avatar.resize.adjective', 'request', (r) => { const s = pick(r, SIZE_BIG_FB);
  return { text: pick(r, [`Make the eyes ${s}.`, `Make your eyes ${s}.`]), expect: E(R('resizePart', { part: 'eye', dir: DIRN[s] ?? s })) }; });
add('avatar.character', 'request', (r, x) => { const w = pick(r, chars(x));
  const text = pick(r, [`Become ${art(w)} ${w}.`, `Make me ${art(w)} ${w}.`, `I want to be ${art(w)} ${w}.`, `I wanna become ${art(w)} ${w}.`, `Turn yourself into ${art(w)} ${w}.`, `Can you look like ${art(w)} ${w}?`, `Let me be ${art(w)} ${w}.`]);
  return { text, expect: E(R('setCharacter', { who: w })) }; });
add('avatar.coordinated', 'request', (r, x) => { const c = pick(r, colors(x)), s = pick(r, SIZES_FB), p = pick(r, ['body', 'background', 'screen']);
  const j = pick(r, ['and', 'and then', ',']);
  return { text: `Make the eyes ${s} ${j === ',' ? ',' : j} the ${p} ${c}.`.replace(' ,', ','), expect: E(R('resizePart', { part: 'eye', dir: DIRN[s] ?? s }), R('setColor', { part: p, color: c })) }; });
add('avatar.neg', 'near-miss', (r) => ({ text: pick(r, ['My eyes are tired.', 'What colour is the sky?', 'The body of the car is red.', 'I like robots.', 'Is a human taller than a robot?']), negative: true }));
add('avatar.ood', 'out-of-domain', (r) => ({ text: pick(r, ['What is 7 plus 5?', 'Add milk to my shopping list.', 'How many legs does a spider have?', 'Hello!']), negative: true }));

export function generate({ rng, count = 1500, context } = {}) {
  return run(T, rng, count, mk(context));
}
