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
// ui.help: every group lists the surface forms of one help act; the expected circuit is `core.request action=<act>`.
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const R = (action, args = {}) => ['core.request', { action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const fin = (r, t, qn) => { const s = cap(t.replace(/\s+/g, ' ').trim()); return /\?$|[.!]$/.test(s) ? s : s + (chance(r, 0.85) ? (qn ? '?' : '.') : ''); };
const lists = (group, act, args, forms, para, ph = 'question') => {
  add(group, ph, (r) => ({ text: fin(r, pick(r, forms), ph === 'question'), expect: E(R(act, args)) }));
  if (para?.length) add(`${group}.paraphrase`, 'paraphrase', (r) => ({ text: fin(r, pick(r, para), ph === 'question'), expect: E(R(act, args)) }));
};
const GAMES_FB = ['hangman', 'tic tac toe', 'chess', 'twenty questions'];
lists('help.capabilities', 'chat.capabilities', {}, ['what can you do', 'what do you do', 'what are you able to do', 'what are your abilities', 'what are you good at', 'what can you help me with', 'what commands do you understand', 'what commands do you recognise', 'what commands can you recognize', 'which phrases can you understand', 'what words do you know'], ['what are you capable of', 'what are your skills']);
lists('help.me', 'ui.helpMe', {}, ['help', 'help me', 'please help', 'help me please', 'can you help me', 'I need help', 'I am lost', 'I am confused', 'I do not know what to do', 'I do not know what to say', 'where do I start'], ['I do not get it', 'I am totally lost'], 'request');
lists('help.here', 'ui.help', {}, ['what can I say here', 'what can we do', 'what could I ask', 'what can I say now', 'what can I do on this tab', 'what can I try on this page', 'what commands are there', 'what options are available', 'what examples can I try', 'show me the commands', 'give me some examples', 'tell me a few ideas', 'what should I say', 'how does this work', 'how do I use this', 'how do I use this app'], ['what are the options', 'what are the commands', 'what can you understand', 'list all the phrases'], 'request');
lists('help.one', 'ui.help', { count: '1' }, ['give me an example', 'show me an example', 'tell me one example', 'let me see a sample', 'can I have an example', 'I need an example', 'an example please'], ['one example'], 'request');
lists('help.more', 'ui.helpMore', {}, ['give me more examples', 'show me more', 'show me some more', 'more examples', 'more commands', 'what else can I say', 'what else can I do', 'anything else', 'any other examples', 'show more examples', 'what other commands are there'], ['next examples', 'different examples please'], 'request');
lists('help.tab', 'ui.helpAbout', {}, ['what does this tab do', 'what is this tab for', 'what is this tab', 'what is this page for', 'what can this tab do', 'explain this tab', 'tell me about this page', 'describe this tab'], ['what is this tab about', 'what is this used for']);
lists('help.game', 'ui.helpGame', {}, ['how do I play', 'how can I play this game', 'how can we play', 'how do I win', 'how can I win', 'what are the rules', 'explain the rules', 'tell me the rules', 'what is the goal', 'how does this game work', 'how to play', 'teach me to play'], ['what is the aim', 'how do you win']);
add('help.game.named', 'request', (r) => { const g = pick(r, GAMES_FB);
  return { text: fin(r, pick(r, [`how do I play ${g}`, `how can I play the ${g} game`, `how do we play ${g}`, `what are the rules of ${g}`, `explain the rules of ${g}`, `tell me the rules of ${g}`]), true), expect: E(R('ui.helpGame', { game: g.replace(/ /g, '_').replace('twenty_questions', 'twenty_questions') })) }; });
const TASKS = ['change the eyes', 'add a table', 'draw a circle', 'zoom the map', 'make the title bigger', 'undo a move', 'turn on the speaker', 'write a poem'];
add('help.how', 'question', (r) => { const x = pick(r, TASKS);
  return { text: fin(r, pick(r, [`how do I ${x}`, `how can I ${x}`, `how could we ${x}`, `how should I ${x}`, `how to ${x}`, `what do I say to ${x}`]), true), expect: E(R('ui.helpHow', { what: q(x) })) }; });
lists('help.why', 'ui.helpWhy', {}, ['why did you not understand', 'why did you not understand that', 'why do you not understand me', 'why did you not get that', 'why could you not follow', 'what did you not understand', 'what did I do wrong', 'what did I say wrong', 'what was wrong', 'what went wrong', 'what was wrong with my sentence'], ['why did you not understand my sentence']);
add('help.neg', 'negation', (r) => ({ text: pick(r, ['I do not need help.', "Don't help me.", 'I do not want examples.', 'Never give me an example.', 'I know the rules.']), negative: true }));
add('help.near', 'near-miss', (r) => ({ text: pick(r, ['Thanks for helping me.', 'The helper is nice.', 'What can you see?', 'He asked how to play.', 'Tom has an example.', 'This tab is red.']), negative: true }));
add('help.ood', 'out-of-domain', (r) => ({ text: pick(r, ['Open the editor.', 'Play hangman.', 'What is 7 plus 5?', 'Add milk to my list.', 'Make your eyes blue.', 'Speak slower.', 'Hello!']), negative: true }));

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
