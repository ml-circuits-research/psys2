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
// games.guess has no value lexicon of its own: the answer and command phrases are embedded; animals for "It was a ..."
// come from lex.kids.animals.names when the context has it.
const ANIM_FB = ['zebra', 'giraffe', 'dog', 'cat', 'elephant', 'penguin', 'polar_bear', 'guinea_pig', 'octopus', 'owl', 'kangaroo', 'dolphin'];
const R = (action, args = {}) => ['core.request', { action: 'guess.' + action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const ANS = {
  yes: { ph: 'request', forms: ['yes', 'yeah', 'yep', 'yup', 'sure', 'correct', 'right', 'definitely', 'absolutely', 'of course', 'exactly', 'it does', 'it can', 'it is', 'it has', 'I think so', 'that is right', 'that is correct', 'you are right', 'you got it', 'yes it is', 'yes it does', 'yes it can', 'yes it has', 'yes please', 'certainly'], para: ['yes it really is', 'that is true', 'it sure is', 'affirmative'] },
  no: { ph: 'negation', forms: ['no', 'nope', 'nah', 'not really', 'it does not', 'it can not', 'it is not', 'it has not', 'wrong', 'no it is not', 'no it does not', 'no it can not', 'no it has not', 'I do not think so', 'that is wrong', 'negative', 'not at all', 'no way', 'no thanks'], para: ['no it is not at all', 'that is not true', 'it is not that', 'not this time'] },
  dontknow: { ph: 'request', forms: ['I do not know', 'do not know', 'not sure', 'I am not sure', 'no idea', 'I have no idea', 'I am not certain', 'dunno', 'I can not say', 'who knows', 'skip', 'pass', 'next question', 'I am not sure about that'], para: ['I really do not know', 'I forgot', 'no clue', 'hard to say'] },
  maybe: { ph: 'request', forms: ['maybe', 'sometimes', 'perhaps', 'kind of', 'sort of', 'it depends', 'a little', 'a bit', 'possibly', 'probably', 'probably not', 'partly'], para: ['maybe yes maybe no', 'it depends on the animal', 'half and half', 'in a way'] },
};
const CMD = {
  why: { ph: 'question', forms: ['why did you ask that', 'why are you asking that', 'why that question', 'why do you ask', 'why did you ask', 'why do you ask that', 'why this question', 'why are you asking this', 'why are you asking'], para: ['why do you want to know', 'what is that question for'] },
  remaining: { ph: 'question', forms: ['which animals are left', 'what animals are left', 'which animals remain', 'which animals do you still consider', 'what are you considering', 'which animals are you thinking of', 'which animals are still possible', 'what animals are still possible'], para: ['which animals are still in the game', 'what animals could it be'] },
  count: { ph: 'question', forms: ['how many questions have you asked', 'how many questions are left', 'how many questions do you have left', 'how many questions have you used', 'how many questions so far', 'how many questions left', 'how many questions did you ask'], para: ['how many questions remain', 'how many more questions do you have'] },
  repeat: { ph: 'request', forms: ['repeat the question', 'say that again', 'what was the question', 'ask again', 'repeat that', 'what was your question', 'what did you ask', 'ask that again', 'can you repeat the question', 'what is the question'], para: ['could you say the question once more', 'one more time please'] },
};
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const fin = (r, t, qn) => `${cap(t)}${chance(r, 0.8) ? (qn ? '?' : pick(r, ['.', '!'])) : ''}`;
for (const [a, d] of Object.entries(ANS)) {
  add(`guess.answer.${a}`, d.ph, (r) => ({ text: fin(r, pick(r, d.forms)), expect: E(R('answer', { answer: a })) }));
  add(`guess.answer.${a}.paraphrase`, 'paraphrase', (r) => ({ text: fin(r, pick(r, d.para)), expect: E(R('answer', { answer: a })) }));
  add(`guess.answer.${a}.context`, 'context', (r) => ({ context: pick(r, [['I am thinking of an animal.', 'Does it have four legs?'], ['Guess my animal.', 'Can it fly?'], ['I am thinking of an animal.', 'Is it a mammal?']]), text: fin(r, pick(r, d.forms)), expect: E(R('answer', { answer: a })) }));
}
for (const [a, d] of Object.entries(CMD)) {
  add(`guess.${a}`, d.ph, (r) => ({ text: fin(r, pick(r, d.forms), d.ph === 'question'), expect: E(R(a)) }));
  add(`guess.${a}.paraphrase`, 'paraphrase', (r) => ({ text: fin(r, pick(r, d.para), d.ph === 'question'), expect: E(R(a)) }));
}
add('guess.start', 'request', (r) => ({ text: fin(r, `${pick(r, ['I am', "I'm"])} thinking ${pick(r, ['of', 'about'])} ${pick(r, ['an animal', 'my animal', 'a secret animal'])}`), expect: E(R('start')) }));
add('guess.start.variants', 'request', (r) => ({ text: fin(r, `I ${pick(r, ['thought of', 'have thought of', 'have picked', 'have chosen', 'picked', 'chose'])} ${pick(r, ['an animal', 'my animal', 'a secret animal'])}`), expect: E(R('start')) }));
add('guess.start.guess-my', 'request', (r) => ({ text: fin(r, `${pick(r, ['', '', 'Can you ', 'Could you ', 'Will you ', 'Would you '])}${pick(r, ['guess', 'try to guess', 'find out', 'figure out', 'work out'])} ${pick(r, ['my animal', 'the animal', 'which animal', 'what animal', 'my secret animal'])}`, true), expect: E(R('start')) }));
add('guess.start.paraphrase', 'paraphrase', (r) => ({ text: fin(r, pick(r, ['Let us play twenty questions', 'I have an animal in mind', 'Try to read my mind', 'Can you guess which animal I picked'])), expect: E(R('start')) }));
add('guess.reveal', 'request', (r, x) => { const a = pick(r, x.lex('lex.kids.animals.names', ANIM_FB)), art_ = pick(r, ['a', 'an', 'the', '']).replace(/^a$/, art(sp(a)));
  const lead = pick(r, ['it was', 'the animal was', 'the answer was', 'the answer is', 'my animal was', 'I was thinking of', 'I was thinking about', 'I thought of', 'the animal is', 'it was actually']);
  return { text: fin(r, `${lead} ${art_ ? art_ + ' ' : ''}${sp(a)}`), expect: E(R('reveal', { animal: q(sp(a)) })) }; });
// negation, near misses, out of domain
add('guess.neg', 'negation', (r) => ({ text: pick(r, ["I won't say yes.", 'Do not say no.', 'It is not an animal.', "I'm not thinking of an animal.", "I don't want to guess."]), negative: true }));
add('guess.near', 'near-miss', (r) => ({ text: pick(r, ['Yes, but only on Sundays.', 'No apples left.', 'Maybe tomorrow we can play.', 'I like animals.', 'Which animal is the biggest?', 'How many legs does it have?', 'Guess what, I won.']), negative: true }));
add('guess.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Open the editor.', 'Center.', 'Is it elephant?', 'Is a whale a fish?', 'Where does a camel live?', 'Play hangman.']), negative: true }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
