// kids.arith: arithmetic questions and word problems (no tab; the kids worlds answer in the chat). Answers are computed here from the numbers.
import { rng, chatty, pick, NUM_WORDS } from './lib.mjs';

export default function arith({ add }) {
  const W = 'kids.arith';
  const r = rng(101);
  const Q = (m, answer, opts = {}) => add(W, m, { answer }, opts);
  const fmt = (x) => String(Math.round(x * 1000) / 1000);

  // direct questions: operator phrasings x numbers (value-preserving noise only)
  const ops = [
    ['plus', (a, b) => a + b, ['{a} plus {b}', '{a} + {b}', 'add {a} and {b}', 'the sum of {a} and {b}']],
    ['minus', (a, b) => a - b, ['{a} minus {b}', '{a} - {b}', 'take {b} away from {a}', '{b} less than {a}']],
    ['times', (a, b) => a * b, ['{a} times {b}', '{a} x {b}', '{a} multiplied by {b}', '{a} * {b}']],
    ['divided by', (a, b) => a / b, ['{a} divided by {b}', '{a} / {b}', '{a} split by {b}']],
  ];
  const lead = ['What is', 'whats', "what's", 'how much is', 'tell me', 'calculate', 'what do i get for', 'can you tell me what is', 'um whats', 'hey could u tell me whats'];
  for (let i = 0; i < 40; i++) {
    const [name, f, forms] = ops[i % 4];
    let a = 2 + Math.floor(r() * 18), b = 2 + Math.floor(r() * 9);
    if (name === 'divided by') { b = 2 + Math.floor(r() * 8); a = b * (2 + Math.floor(r() * 9)); }
    if (name === 'minus' && b > a) [a, b] = [b, a];
    const useWords = r() < 0.2 && a <= 12 && b <= 12;
    const form = pick(r, forms).replace('{a}', useWords ? NUM_WORDS[a] : a).replace('{b}', useWords ? NUM_WORDS[b] : b);
    let msg = `${pick(r, lead)} ${form}`;
    if (/^(add|take|the sum)/.test(form)) msg = form;
    if (r() < 0.4) msg += pick(r, ['?', ' pls', '', ' please']);
    Q(chatty(msg, r), [fmt(f(a, b))], { fam: useWords ? ['messy', 'number-words'] : [] });
  }
  // user examples and probes
  Q('hey could u tell me whats seven times six pls', ['42'], { fam: ['user-example', 'messy', 'number-words'] });
  Q('What is 10 divided by 4?', ['2.5'], { fam: ['decimal'] });
  Q('What is half of 10?', ['5']);
  Q('what is 45.5 plus 2', ['47.5'], { fam: ['decimal', 'probe'] });
  Q('whats 2.5 times 4', ['10'], { fam: ['decimal'] });
  Q('what is 0.5 plus 0.25', ['0.75'], { fam: ['decimal'] });
  Q('what is -3 + 5', ['2'], { fam: ['negative-numbers'] });
  Q('calculate 3*4', ['12']);
  Q('9 and 6 added up?', ['15'], { fam: ['messy'] });
  Q('what is 100 minus 37', ['63']);
  Q('how much is a dozen plus 3', ['15'], { gap: true, fam: ['probe'], note: 'dozen is not a number word of the world' });
  Q('what is 12 squared', ['144'], { gap: true, fam: ['probe'] });
  Q('what is 7 plus 5 minus 2', ['10'], { gap: true, fam: ['probe'], note: 'chained operations' });
  add(W, 'um whats 3 plus 4 and also how many legs has a spider', { answer: ['7', '8'] }, { fam: ['user-example', 'multi', 'world-switch', 'messy'] });
  add(W, 'what is 6 times 7 and how many legs does a spider have', { answer: ['42', '8'] }, { fam: ['multi', 'world-switch'] });
  add(W, 'what is 5 plus 5. what sound does a cow make', { answer: ['10', 'moo'] }, { fam: ['multi', 'world-switch'] });
  add(W, 'what is 9 minus 4 and what is 3 times 3', { answer: ['5', '9'] }, { fam: ['multi'] });
  add(W, 'add 2 and 2 then tell me 10 minus 1', { answer: ['4', '9'] }, { fam: ['multi', 'messy'] });
  add(W, 'whats 8 plus 8, also 7 times 7', { answer: ['16', '49'] }, { fam: ['multi', 'messy'] });

  // word problems
  const names = ['Tom', 'Ana', 'Ben', 'Mia', 'Leo', 'Zoe', 'Sam', 'Lily'];
  const items = ['apples', 'pears', 'marbles', 'stickers', 'pencils'];
  const story = (kind) => {
    const n = pick(r, names), it = pick(r, items);
    const a = 3 + Math.floor(r() * 12), b = 1 + Math.floor(r() * (kind === 'sub' ? a - 1 : 8));
    const sing = (k) => (k === 1 ? it.replace(/s$/, '') : it);
    if (kind === 'add') {
      const verb = pick(r, [`buys ${b} more`, `finds ${b} more`, `gets ${b} more`]);
      return [`${n} has ${a} ${it}. ${n} ${verb}. How many ${it} does ${n} have?`, [`${a + b}`], ['word-problem']];
    }
    if (kind === 'sub') {
      const verb = pick(r, [`eats ${b}`, `loses ${b}`, `gives away ${b}`]);
      return [`${n} has ${a} ${it}. ${n} ${verb}. How many ${it} does ${n} have left?`, [`${a - b}`], ['word-problem']];
    }
    if (kind === 'give') {
      const m = pick(r, names.filter((x) => x !== n));
      return [`${n} has ${a} ${it}. ${m} gives ${n} ${b} ${sing(b)}. How many ${it} does ${n} have?`, [`${a + b}`], ['word-problem']];
    }
    if (kind === 'total') {
      const m = pick(r, names.filter((x) => x !== n));
      return [`${n} has ${a} ${it}. ${m} has ${b} ${sing(b)}. How many ${it} do they have altogether?`, [`${a + b}`], ['word-problem']];
    }
    const m = pick(r, names.filter((x) => x !== n)), bb = b === a ? b + 1 : b;
    return [`${n} has ${a} ${it}. ${m} has ${bb} ${sing(bb)}. Who has more ${it}?`, [a > bb ? n : m], ['word-problem', 'compare']];
  };
  for (let i = 0; i < 40; i++) {
    const [msg, ans, fam] = story(['add', 'sub', 'give', 'total', 'cmp'][i % 5]);
    Q(i % 3 === 0 ? msg.toLowerCase() : msg, ans, { fam });
  }
  // statements and questions in separate messages (state carried by the session)
  Q('how many apples does Tom have', ['5'], { setup: ['Tom has 5 apples.'], fam: ['word-problem', 'messy'] });
  Q('Now Tom eats 2 apples. How many apples does Tom have?', ['3'], { setup: ['Tom has 5 apples.'], fam: ['word-problem', 'reference'] });
  Q('how many apples do they have together', ['9'], { setup: ['Tom has 5 apples.', 'Ana has 4 apples.'], fam: ['word-problem'] });
  Q('does Ana have more apples than Tom', ['No'], { setup: ['Tom has 5 apples.', 'Ana has 4 apples.'], fam: ['word-problem'] });
  Q('how many pears does Emma have', ['3'], { setup: ['Emma has 4 apples and 3 pears.'], fam: ['word-problem'] });
  Q('whats left for Mia', ['3'], { setup: ['Mia has five marbles.', 'She lost two marbles.'], fam: ['word-problem', 'reference'], gap: true, note: 'unit omitted in the question' });
  Q('Tom has 2 apples and Ana has 3. How many apples altogether?', ['5'], { fam: ['word-problem', 'ellipsis'], gap: true, note: 'unit elided in the second clause' });
  Q('Tom has 5 apples, no wait, 6 apples. How many apples does Tom have?', ['6'], { fam: ['self-correction', 'word-problem'], gap: true });
  Q('Tom has 7 apples and gives 2 to Ana. How many apples does Tom have?', ['5'], { fam: ['word-problem', 'multi'], gap: true });
  add(W, 'what is the weather today', { none: true }, { fam: ['negative'] });
}
