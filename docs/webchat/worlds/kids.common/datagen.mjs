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
// kids.common: first names with gender (lexicons, via context) and small talk. The chat acts are listed here with their
// surface forms; the expected circuit is always `core.request action=chat.<act>`.
const ACTS = {
  greet: { forms: ['Hello', 'Hi', 'Hey', 'Hello there', 'Hi there', 'Hey there'], ends: ['!', '.', ''] },
  name: { forms: ['What is your name', 'What are you called', "What's your name"], ends: ['?', ''] },
  who: { forms: ['Who are you'], ends: ['?', ''] },
  thanks: { forms: ['Thanks', 'Thank you', 'Thank you very much', 'Thanks a lot', 'Thank you a lot', 'Thanks very much'], ends: ['!', '.', ''] },
  bye: { forms: ['Goodbye', 'Bye', 'See you'], ends: ['!', '.', ''] },
  capabilities: { forms: ['What can you do', 'Help'], ends: ['?', '!', '.', ''] },
};
const req = (act) => E(['core.request', { action: 'chat.' + act }]);
const say = (r, act) => {
  const a = ACTS[act];
  let f = pick(r, a.forms);
  const c = r();
  if (c < 0.12) f = f.toLowerCase(); else if (c < 0.18) f = f.toUpperCase();
  const e = pick(r, a.ends);
  return f + (e === '!' && act === 'name' ? '?' : e);
};
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
for (const act of Object.keys(ACTS)) add(`common.${act}`, act === 'greet' || act === 'thanks' || act === 'bye' ? 'request' : 'question', (r) => ({ text: say(r, act), expect: req(act) }), { noise: false });
add('common.sequence', 'multi-entity', (r) => {
  // 'name' is left out here: ui.avatar also claims "What is your name?" (priority conflict, recorded in group common.name)
  const acts = Object.keys(ACTS).filter((a) => a !== 'name'), k = 2 + Math.floor(r() * 2), seq = [];
  for (let i = 0; i < k; i++) seq.push(pick(r, acts));
  const text = seq.map((a) => { let s = say(r, a); if (!/[.!?]$/.test(s)) s += a === 'name' || a === 'who' || a === 'capabilities' ? '?' : '.'; return s; }).join(' ');
  return { text, expect: E(...seq.map((a) => ['core.request', { action: 'chat.' + a }])) };
}, { noise: false });
add('common.neg.near-miss', 'near-miss', (r, x) => {
  const p = x.person(r);
  return { text: pick(r, [`Hello ${p.name}, how are you?`, 'Thanks for the apple.', 'What is your favorite color?', 'Who are they?', 'What is your age?', 'Say goodbye to Tom.', 'Helpful hints for kids.', 'Hi, my name is ' + p.name + '.', 'Thank you for helping me with the sums.', 'See you at school tomorrow.']), negative: true };
});
add('common.neg.negation', 'negation', (r) => ({ text: pick(r, ['Do not say hello.', "I don't need help.", "Don't say goodbye.", 'I do not thank you.', "I won't say bye."]), negative: true }));
add('common.ood', 'out-of-domain', (r, x) => {
  const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my list.', 'Open the editor.', 'Play hangman.', 'What color is the sky?', 'Center.', 'Is a whale a fish?', 'How many sides does a hexagon have?']), negative: true };
});
// first names are data of this world: a bare name or a name with a pronoun must not trigger any chat act
add('common.names', 'near-miss', (r, x) => { const p = x.person(r); return { text: pick(r, [`${p.name}.`, `${p.name}!`, `I am ${p.name}.`, `My friend is ${p.name}.`]), negative: true }; });
export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context), { noisy: false });
}
