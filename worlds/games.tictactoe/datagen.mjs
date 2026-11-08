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
// Board positions and difficulty levels come from the world lexicons (context) with embedded fallbacks.
const POS_FB = ['center', 'centre', 'middle', 'top_left', 'top_middle', 'top_right', 'middle_left', 'middle_right', 'bottom_left', 'bottom_middle', 'bottom_right', 'upper_left', 'upper_right', 'lower_left', 'lower_right', 'top_row_left', 'middle_row_center', 'bottom_row_right', 'left_column_top', 'right_column_bottom'];
const LEVELS_FB = ['easy', 'easier', 'simple', 'beginner', 'perfect', 'perfectly', 'hard', 'harder', 'hardest', 'unbeatable', 'expert'];
const pos = (x) => x.lex('lex.games.tictactoe.positions', POS_FB);
const levels = (x) => x.lex('lex.games.tictactoe.levels', LEVELS_FB);
const R = (action, args = {}) => ['core.request', { action: 'ttt.' + action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const cornerish = (p) => /(left|right)$/.test(p) && !/(row|column)/.test(p) && p.split('_').length === 2 && /^(top|bottom|upper|lower)/.test(p);
const PRE = [['', ''], ['I play ', ' the '], ['I will play ', ' the '], ["I'll take ", ' the '], ['Let me take ', ' the '], ['Can I go ', ' to the '], ['Could I play ', ' the '], ['I choose ', ' the '], ['I pick ', ' the '],
  ['I take ', ' the '], ['Play ', ' the '], ['Take ', ' the '], ['Mark ', ' the '], ['Put an X ', ' in the '], ['Place an X ', ' on the '], ['Draw an X ', ' in the '], ['Go ', ' to the '], ['I want to play ', ' the '], ['I go ', ' to the '], ['Put my X ', ' in the ']];
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const withNum = (r, n) => (chance(r, 0.2) ? NUMW[n] : String(n));

add('ttt.move', 'request', (r, x) => { const p = pick(r, pos(x)), [pre, mid] = pick(r, PRE);
  const text = pre ? `${pre.trimEnd()}${mid.replace(/^ $/, ' ')}${sp(p)}` : `${cap(sp(p))}`;
  const suffix = cornerish(p) ? pick(r, ['', '', ' corner', ' square']) : pick(r, ['', '', ' square', ' spot', ' cell']);
  return { text: `${cap(text.replace(/\s+/g, ' ').replace(/^(Put an X|Place an X|Draw an X|Put my X|Go|Can I go|Could I play) the /, '$1 the '))}${suffix}.`, expect: E(R('move', { pos: p })) }; });
add('ttt.move.bare', 'ellipsis', (r, x) => { const p = pick(r, pos(x));
  return { text: `${cap(sp(p))}${pick(r, ['.', '!', ''])}`, expect: E(R('move', { pos: p })) }; });
add('ttt.move.context', 'context', (r, x) => { const p = pick(r, pos(x)); let q2 = pick(r, pos(x));
  return { context: ['Start a new tic tac toe game.'], text: `${pick(r, ['Play', 'Take', 'I take'])} the ${sp(p)}.`, expect: E(R('move', { pos: p })) }; });
add('ttt.coord', 'request', (r) => { const c = pick(r, ['a', 'b', 'c']), n = 1 + Math.floor(r() * 3), pre = pick(r, ['', '', 'I play ', 'Play ', 'Take ', 'I take ', 'Mark ', 'Put an X in ', 'Go to ', 'Play square ', 'I choose cell ']);
  const t = `${pre}${pick(r, [c.toUpperCase(), c])}${n}`;
  return { text: `${cap(t)}${pick(r, ['.', '!'])}`, expect: E(R('move', { col: c, row: n })) }; });
add('ttt.rowcol', 'request', (r) => { const a = 1 + Math.floor(r() * 3), b = 1 + Math.floor(r() * 3), pre = pick(r, ['', '', 'I play ', 'Play ', 'Take ', 'I take ', 'Mark ', 'Put an X in the ', 'Go to the ']);
  const t = `${pre}${pre.endsWith('the ') ? 'row' : pre ? 'row' : 'row'} ${withNum(r, a)} ${pick(r, ['column', 'col'])} ${withNum(r, b)}`;
  return { text: `${cap(t)}.`, expect: E(R('move', { col: b, row: a, numeric: 'true' })) }; });
const NEWS = [() => 'Start a new tic tac toe game.', (r) => `${pick(r, ['Start', 'Begin', 'Play', 'Have'])} ${pick(r, ['a ', 'another ', ''])}new tic tac toe${pick(r, [' game', ''])}.`, () => 'New tic tac toe.'];
add('ttt.new', 'request', (r) => ({ text: pick(r, NEWS)(r), expect: E(R('new')) }));
add('ttt.clear', 'request', (r) => ({ text: `${pick(r, ['', '', 'Can you ', 'Could you ', 'Will you ', 'Would you '])}${pick(r, ['clear', 'reset', 'empty', 'wipe', 'restart'])} the ${pick(r, ['board', 'grid'])}${pick(r, ['.', '?'])}`.replace(/^([a-z])/, (m) => m.toUpperCase()), expect: E(R('new')) }));
const LISTS = {
  first: { args: { who: 'user' }, forms: ['let me go first', 'I want to go first', 'I will go first', 'I go first', 'I want to start', 'I start', 'let me start', 'you go second', 'I will start', 'me first', 'let me be first'], para: ['I would like to go first', 'I will play first', 'you can go second', 'I want to be first'] },
  second: { act: 'first', args: { who: 'system' }, forms: ['let me go second', 'I want to go second', 'I will go second', 'I go second', 'you go first', 'you start', 'you can start', 'you can go first', 'you first', 'you should go first', 'you begin', 'start first', 'let me be second'], para: ['you can begin', 'I want you to start', 'I would like to go second', 'you play first'] },
  whoFirst: { args: {}, forms: ['who goes first', 'who starts', 'who starts first', 'who goes second', 'who plays first', 'who moves first', 'am I X', 'am I O', 'am I going first', 'do I go first', 'do I start', 'which one am I', 'which mark am I'], para: ['who is first', 'who begins', 'am I the X player', 'what am I playing'] },
  status: { args: {}, forms: ['who is winning', 'who is ahead', 'who is going to win', 'who will win', 'am I winning', 'are you winning', 'who is leading', 'how am I doing', 'who has won', 'who won', 'did I win', 'did you win', 'is it a draw', 'who is winning the game', 'who is winning now'], para: ['is anybody winning', 'who is in front', 'is the game over', 'did anyone win'] },
  describe: { args: {}, forms: ['describe the board', 'read the board', 'show me the board', 'show the board', 'tell me the board', 'what is on the board', 'what does the board look like', 'how does the board look', 'what is the board like', 'read me the board', 'say the board', 'what is the position', 'describe the game', 'what is on the board now'], para: ['describe the position', 'what is on the grid', 'tell me what is on the board'] },
  hint: { args: {}, forms: ['what should I play', 'where should I play', 'where should I go', 'what is my best move', 'what is a good move', 'what move should I make', 'suggest a move', 'what should I do', 'which move is best', 'where should I move'], para: ['give me a tip', 'what is the best move', 'which square should I take'] },
  last: { args: {}, forms: ['where did you play', 'where did you go', 'what was your move', 'what was your last move', 'which square did you take', 'what did you play', 'where was your move'], para: ['where was your last move', 'what did you just play', 'which square did you pick'] },
};
for (const [act, d] of Object.entries(LISTS)) {
  const polite = act === 'first' || act === 'second' || act === 'describe';
  const qn = ['whoFirst', 'status', 'hint', 'last'].includes(act);
  add(`ttt.${act}`, qn ? 'question' : 'request', (r) => { const t = pick(r, d.forms), p = polite && chance(r, 0.25) ? pick(r, ['Can you ', 'Could you ', 'Will you ', 'Would you ']) : '';
    return { text: `${cap(p + t)}${qn || p ? '?' : pick(r, ['.', '!'])}`, expect: E(R(d.act ?? act, d.args)) }; });
  add(`ttt.${act}.paraphrase`, 'paraphrase', (r) => { const t = pick(r, d.para);
    return { text: `${cap(t)}${qn ? '?' : '.'}`, expect: E(R(d.act ?? act, d.args)) }; });
}
add('ttt.level.set', 'request', (r, x) => { const l = pick(r, levels(x));
  const k = Math.floor(r() * 4);
  const text = [`${pick(r, ['Set', 'Change', 'Switch'])} the ${pick(r, ['level', 'difficulty', 'mode'])} to ${l}.`, `${pick(r, ['', 'Can you ', 'Could you '])}${pick(r, ['play', 'be', 'go'])} ${pick(r, ['on ', 'at ', ''])}${l}${pick(r, ['', ' level', ' mode'])}.`, `${pick(r, ['Make', 'Set'])} ${pick(r, ['it ', 'the game to ', ''])}${l}.`, `${pick(r, ['I want', 'I would like', 'Give me'])} ${art(l)} ${l} ${pick(r, ['game', 'level', 'opponent'])}.`][k];
  return { text: cap(text.replace(/\s+/g, ' ')), expect: E(R('level', { level: l })) }; });
add('ttt.level.ask', 'question', (r) => ({ text: `${cap(pick(r, ['what level', 'which level', 'how hard']))} ${pick(r, ['are you', 'is it', 'are we playing', 'is the game', 'is this'])}?`.replace('how hard are we playing', 'how hard is it'), expect: E(R('level')) }));
add('ttt.level.paraphrase', 'paraphrase', (r, x) => { const l = pick(r, levels(x));
  return { text: pick(r, [`Please play at ${l} difficulty.`, `Switch to ${l}.`, `Let us play ${l}.`]), expect: E(R('level', { level: l })) }; });
// negation, near misses, out of domain
add('ttt.neg', 'negation', (r, x) => { const p = pick(r, pos(x));
  return { text: pick(r, [`Don't play the ${sp(p)}.`, `I do not want the ${sp(p)}.`, `Never go ${pick(r, ['first', 'second'])}.`, `I won't take the ${sp(p)}.`, `Do not start a new game.`]), negative: true }; });
add('ttt.near', 'near-miss', (r, x) => { const p = pick(r, pos(x));
  return { text: pick(r, ['Play the top.', 'Take the bottom.', 'Play the center center.', 'Go to row 2.', 'Play upper middle.', `I like the ${sp(p)}.`, 'Play X.', 'The center is nice.', 'Who is the best player?', 'Show me the weather.']), negative: true }; });
add('ttt.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Open the editor.', 'Is it elephant?', 'Hello!', 'Is a whale a fish?', 'Yes.', 'Are you thinking of an animal?']), negative: true }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
