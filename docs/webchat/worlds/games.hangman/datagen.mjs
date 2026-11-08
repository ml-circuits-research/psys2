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
// Letters come from lex.games.hangman.letters (context) with an embedded fallback; words to guess are single animal names
// (lex.kids.animals.names when present, else an embedded list).
const LETTERS_FB = 'abcdefghijklmnopqrstuvwxyz'.split('');
const WORDS_FB = ['elephant', 'zebra', 'giraffe', 'penguin', 'octopus', 'dolphin', 'kangaroo', 'owl', 'tiger', 'rabbit', 'camel', 'spider', 'crocodile', 'hedgehog'];
const letters = (x) => x.lex('lex.games.hangman.letters', LETTERS_FB);
const words = (x) => x.lex('lex.kids.animals.names', WORDS_FB).filter((w) => !w.includes('_') && w.length > 2);
const R = (action, args = {}) => ['core.request', { action: 'hm.' + action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const L = (r, l) => (chance(r, 0.7) ? l.toUpperCase() : l);
const AN = new Set('aefhilmnorsx'.split(''));
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const fin = (r, t, qn) => `${t}${chance(r, 0.85) ? (qn ? '?' : '.') : ''}`;

add('hm.letter.is-there', 'question', (r, x) => { const l = pick(r, letters(x));
  return { text: fin(r, `${pick(r, ['Is there', 'Was there'])} ${pick(r, [AN.has(l) ? 'an' : 'a', 'a', ''])} ${pick(r, ['letter ', ''])}${L(r, l)}${pick(r, ['', ' in it', ' in the word', ' in there'])}`.replace(/\s+/g, ' '), true), expect: E(R('letter', { letter: l })) }; });
add('hm.letter.guess', 'request', (r, x) => { const l = pick(r, letters(x));
  const lead = pick(r, ['the letter', 'letter', 'guess', 'try', 'I guess', 'I try', 'how about', 'what about', 'guess the letter', 'try the letter', 'let me try', 'pick']);
  return { text: fin(r, `${cap(lead)} ${L(r, l)}`), expect: E(R('letter', { letter: l })) }; });
add('hm.letter.has', 'question', (r, x) => { const l = pick(r, letters(x));
  return { text: fin(r, `${pick(r, ['Does', 'Do'])} it ${pick(r, ['have', 'contain', 'include'])} ${pick(r, [AN.has(l) ? 'an' : 'a', 'the letter', 'the', ''])} ${pick(r, ['letter ', ''])}${L(r, l)}${pick(r, ['', ' in it', ' in there'])}`.replace(/\s+/g, ' '), true).replace(/^Do it/, 'Does it'), expect: E(R('letter', { letter: l })) }; });
add('hm.letter.bare', 'ellipsis', (r, x) => { const l = pick(r, letters(x)).replace(/^i$/, 'e');
  return { text: `${l.toUpperCase()}${pick(r, ['.', '!', '?'])}`, expect: E(R('letter', { letter: l })) }; });
add('hm.letter.context', 'context', (r, x) => { const l = pick(r, letters(x)).replace(/^i$/, 'e');
  return { context: ['Start a new hangman game.'], text: `Is there ${AN.has(l) ? 'an' : 'a'} ${l.toUpperCase()}?`, expect: E(R('letter', { letter: l })) }; });
add('hm.word', 'question', (r, x) => { const w = pick(r, words(x));
  return { text: fin(r, `Is ${pick(r, ['it', 'the word'])} ${pick(r, [art(w), ''])} ${w}`.replace(/\s+/g, ' '), true), expect: E(R('word', { word: w })) }; });
add('hm.word.statement', 'statement', (r, x) => { const w = pick(r, words(x));
  const lead = pick(r, ['the word is', 'my guess is', 'I guess it is', 'I think it is', 'I think the word is', 'it might be', 'maybe it is', 'the word might be']);
  return { text: fin(r, `${cap(lead)} ${pick(r, [art(w), ''])} ${w}`.replace(/\s+/g, ' ')), expect: E(R('word', { word: w })) }; });
add('hm.new', 'request', (r) => ({ text: fin(r, `${pick(r, ['Start', 'Play', 'Begin', 'Have', ''])} ${pick(r, ['a', 'another', ''])} new hangman${pick(r, [' game', ''])}`.replace(/\s+/g, ' ').trim()), expect: E(R('new')) }));
add('hm.new.word', 'request', (r, x) => { const w = pick(r, words(x));
  return { text: fin(r, `${pick(r, ['Start', 'Play', 'Begin'])} hangman with ${pick(r, ['the ', ''])}${pick(r, ['word ', ''])}${w}`.replace(/\s+/g, ' ')), expect: E(R('new', { word: w })) }; });
add('hm.hint', 'question', (r) => ({ text: fin(r, cap(pick(r, ['tell me something about it', 'what kind of animal is it', 'give me a clue', 'what is it like', 'tell me more', 'tell me more about it'])), true), expect: E(R('hint')) }));
add('hm.status', 'question', (r) => ({ text: fin(r, cap(pick(r, ['how many guesses are left', 'how many guesses do I have left', 'how many lives do I have', 'what letters have I tried', 'which letters have I guessed', 'what does the word look like', 'show me the word', 'show the word', 'what is the word so far', 'how many letters does it have', 'how many letters are there', 'how long is the word', 'how many wrong guesses are left', 'how many tries are left'])), true), expect: E(R('status')) }));
for (const [g, forms, act] of [['hint', ['can I get a clue', 'is it a big animal', 'give me a hint'], 'hint'], ['status', ['how many tries do I have', 'what have I guessed so far', 'how many letters are missing', 'show me my progress'], 'status']]) {
  add(`hm.${g}.paraphrase`, 'paraphrase', (r) => ({ text: fin(r, cap(pick(r, forms)), true), expect: E(R(act)) }));
}
// negation, near misses, out of domain
add('hm.neg', 'negation', (r, x) => { const l = pick(r, letters(x));
  return { text: pick(r, [`There is no ${l.toUpperCase()}.`, `I do not want the letter ${l.toUpperCase()}.`, "Don't start a new hangman game.", 'It is not that word.', "I won't guess."]), negative: true }; });
add('hm.near', 'near-miss', (r, x) => { const l = pick(r, letters(x)), w = pick(r, words(x));
  return { text: pick(r, [`Is there ${l.toUpperCase()}${l.toUpperCase()} in it?`, `Hangman is fun.`, `Is it the ${w} or the ${pick(r, words(x))}?`, `${l.toUpperCase()} is for ${w}.`, 'Is there a number in it?']), negative: true }; });
add('hm.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Open the editor.', 'Center.', 'Yes.', 'Hello!', 'Where does a camel live?', 'What color is the sky?']), negative: true }; });







// ---- rule sweep families
add("hm.sw.letter.question", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["Is there an E?","letter",{"letter":"e"},["Play hangman with the word lion."]],["o is there?","letter",{"letter":"o"},["Play hangman with the word lion."]],["is it n","letter",{"letter":"n"},["Play hangman with the word lion."]],["does z appear","letter",{"letter":"z"},["Play hangman with the word lion."]],["any e?","letter",{"letter":"e"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.elliptic", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["L","letter",{"letter":"l"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.voice fillers", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["um, next letter, n","letter",{"letter":"n"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.spoken name", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["zed","letter",{"letter":"z"},["Play hangman with the word lion."]],["try double you","letter",{"letter":"w"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.statement", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["guessing z","letter",{"letter":"z"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.wish", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["can i get an r","letter",{"letter":"r"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.imperative", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["try the letter s","letter",{"letter":"s"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.word order", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["e in the word?","letter",{"letter":"e"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.letter.abbreviations", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["got any s pls","letter",{"letter":"s"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.word.question", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["Is it tiger?","word",{"word":"tiger"},["Play hangman with the word lion."]],["is tiger right","word",{"word":"tiger"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.word.elliptic", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["tiger?","word",{"word":"tiger"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.word.statement", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["tiger, my answer","word",{"word":"tiger"},["Play hangman with the word lion."]],["my final answer is tiger","word",{"word":"tiger"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.word.imperative", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["I guess tiger","word",{"word":"tiger"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.hint.imperative", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["Tell me something about it.","hint",{},["Play hangman with the word lion."]],["tell me a fact about it","hint",{},["Play hangman with the word lion."]],["tell me one thing about this animal","hint",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.hint.elliptic", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["fact?","hint",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.hint.wish", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["i want a fact","hint",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.hint.question", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["what is it known for","hint",{},["Play hangman with the word lion."]],["whats a fact about the mystery animal","hint",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.hint.voice fillers", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["uh give me something about it, not a letter","hint",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.status.question", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["How many guesses are left?","status",{},["Play hangman with the word lion."]],["how many letters are hidden","status",{},["Play hangman with the word lion."]],["what does the word look like now","status",{},["Play hangman with the word lion."]],["how many spaces left in the word","status",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.status.elliptic", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["letters still missing?","status",{},["Play hangman with the word lion."]],["hidden word view","status",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.imperative", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["Start a new hangman game.","new",{},["Play hangman with the word lion."]],["start over hangman","new",{},["Play hangman with the word lion."]],["make a hangman round with giraffe pls","new",{"word":"giraffe"},["Play hangman with the word lion."]],["ok new hangman, its giraffe","new",{"word":"giraffe"},["Play hangman with the word lion."]],["Play hangman with the word zebra.","new",{"word":"zebra"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.elliptic", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["hangman again","new",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.voice fillers", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["play again hangman","new",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.word order", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["hangman round two","new",{},["Play hangman with the word lion."]],["hidden word: giraffe","new",{"word":"giraffe"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.wish", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["lets go again with a new animal","new",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.statement", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["giraffe is the word","new",{"word":"giraffe"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.new.politeness", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["can u set the word to giraffe for hangman","new",{"word":"giraffe"},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
add("hm.sw.giveup.statement", 'sweep', (r) => { const [text, act, args, ctx] = pick(r, [["I give up the word.","giveup",{},["Play hangman with the word lion."]]]); return { text, context: ctx.length ? ctx : undefined, expect: E(R(act, args)) }; });
// ---- end rule sweep families

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
