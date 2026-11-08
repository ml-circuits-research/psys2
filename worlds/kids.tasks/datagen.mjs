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
// kids.tasks has no KB and no item lexicon: list items are free text, so the item phrases and list names below are embedded.
const BUY = ['milk', 'bread', 'eggs', 'apples', 'cheese', 'pencils', 'a new notebook', 'orange juice', 'butter', 'some stickers', 'cat food', 'ice cream'];
const DO = ['my homework', 'call grandma', 'feed the cat', 'water the plants', 'tidy my room', 'brush my teeth', 'my swimming bag', 'read my book', 'wash the dishes', 'bring my umbrella', 'practice piano'];
const LISTS = ['shopping', 'homework', 'birthday', 'school', 'chores', 'packing', 'party', 'garden'];
const ALL = [...BUY, ...DO];
const DET = ['my', 'the', 'our', ''];
const CAN = ['', '', '', 'Can you ', 'Could you ', 'Will you '];
const R = (action, args = {}) => ['core.request', { action: 'tasks.' + action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const L = (r) => ({ name: pick(r, LISTS) });
const lst = (d, l) => `${d} ${l ? l.name + ' ' : ''}list`.trim().replace(/\s+/g, ' ');
const listArg = (l, dflt = 'to-do') => (l ? q(l.name) : dflt);
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const sent = (s) => cap(s.replace(/\s+/g, ' ').trim());

const FAM = (name, build, act, argsOf, ph = 'request') => {
  for (const named of [false, true]) {
    add(`tasks.${name}${named ? '.list' : ''}`, ph, (r) => { const item = pick(r, ALL), l = named ? L(r) : null, d = pick(r, DET);
      const text = build({ r, item, l, d, list: lst(d, l) });
      return text ? { text: sent(text), expect: E(R(act, argsOf({ item, l, listArg }))) } : null; });
  }
};
FAM('add', ({ item, list, r }) => `${pick(r, CAN)}add ${item} to ${list}.`, 'add', ({ item, l }) => ({ item: q(item), list: listArg(l) }));
FAM('put', ({ item, list }) => `Put ${item} on ${list}.`, 'add', ({ item, l }) => ({ item: q(item), list: listArg(l) }));
add('tasks.add.need-to-buy', 'statement', (r) => { const item = pick(r, BUY);
  return { text: `I ${pick(r, ['need to', 'have to', 'must', 'want to'])} buy ${item}.`, expect: E(R('add', { item: q(item), list: 'shopping' })) }; });
add('tasks.add.need-to', 'statement', (r) => { const item = pick(r, DO);
  return { text: `I ${pick(r, ['need to', 'have to', 'must', 'should'])} ${item}.`, expect: E(R('add', { item: q(item), list: 'to-do' })) }; });
add('tasks.add.write', 'request', (r) => { const item = pick(r, DO), l = L(r), d = pick(r, DET);
  return { text: sent(`Write ${item} on ${lst(d, l)}.`), expect: E(R('add', { item: q(item), list: q(l.name) })) }; });
add('tasks.add.want-to-add', 'request', (r) => { const item = pick(r, ALL), l = L(r), d = pick(r, DET);
  return { text: sent(`I want to add ${item} to ${lst(d, l)}.`), expect: E(R('add', { item: q(item), list: q(l.name) })) }; });
add('tasks.add.two-items', 'multi-entity', (r) => { const a = pick(r, BUY); let b = pick(r, BUY); while (b === a) b = pick(r, BUY);
  return { text: `Add ${a} to my list. Add ${b} to my list.`, expect: E(R('add', { item: q(a), list: 'to-do' }), R('add', { item: q(b), list: 'to-do' })) }; });
add('tasks.add.two-in-one', 'multi-entity', (r) => { const a = pick(r, BUY); let b = pick(r, BUY); while (b === a) b = pick(r, BUY);
  return { text: `Add ${a} to my list and add ${b} to my list.`, expect: E(R('add', { item: q(a), list: 'to-do' }), R('add', { item: q(b), list: 'to-do' })) }; });
add('tasks.add.enumeration', 'multi-entity', (r) => { const a = pick(r, BUY); let b = pick(r, BUY), c = pick(r, BUY);
  const item = `${a}, ${b} and ${c}`;
  return { text: `Add ${item} to my shopping list.`, expect: E(R('add', { item: q(item), list: q('shopping') })) }; });
add('tasks.add.number-words', 'number-words', (r) => { const n = 2 + Math.floor(r() * 8), item = pick(r, ['apples', 'pencils', 'eggs', 'stickers']);
  const w = NUMW[n];
  return { text: `Add ${w} ${item} to my list.`, expect: E(R('add', { item: q(`${w} ${item}`), list: 'to-do' })) }; });
add('tasks.add.digits', 'statement', (r) => { const n = 2 + Math.floor(r() * 20), item = pick(r, ['apples', 'pencils', 'eggs', 'stickers']);
  return { text: `Add ${n} ${item} to my shopping list.`, expect: E(R('add', { item: q(`${n} ${item}`), list: q('shopping') })) }; });
// reminders
add('tasks.remind', 'request', (r) => { const item = pick(r, DO), k = Math.floor(r() * 5);
  const text = [`${pick(r, CAN)}remind me to ${item}.`, `${pick(r, CAN)}remind me about ${pick(r, ['my swimming bag', 'my homework', 'the party', 'grandma\'s birthday'])}.`, `${pick(r, ['Set', 'Make'])} a reminder ${pick(r, ['to', 'for', 'about'])} ${item}.`, `Don't let me forget to ${item}.`, `I must remember to ${item}.`][k];
  const it = k === 1 ? text.replace(/^.*remind me about /i, '').replace(/\.$/, '') : item;
  return { text: sent(text), expect: E(R('remind', { item: q(it) })) }; });
// removing
FAM('remove', ({ item, list, r }) => `${pick(r, ['Remove', 'Delete'])} ${item} from ${list}.`, 'remove', ({ item, l }) => ({ item: q(item), ...(l ? { list: q(l.name) } : {}) }));
FAM('take-off', ({ item, list }) => `Take ${item} off ${list}.`, 'remove', ({ item, l }) => ({ item: q(item), ...(l ? { list: q(l.name) } : {}) }));
// finishing
add('tasks.done.finished', 'statement', (r) => { const item = pick(r, DO);
  return { text: `I ${pick(r, ['finished', 'completed', 'have finished', 'have completed', 'did', 'have done'])} ${item}.`, expect: E(R('done', { item: q(item) })) }; });
add('tasks.done.mark', 'request', (r) => { const item = pick(r, ALL), l = chance(r, 0.4) ? L(r) : null;
  return l ? { text: sent(`Mark ${item} as ${pick(r, ['done', 'finished', 'completed'])} on ${lst(pick(r, DET), l)}.`), expect: E(R('done', { item: q(item), list: q(l.name) })) }
    : { text: sent(`Mark ${item} as ${pick(r, ['done', 'finished', 'completed', 'complete'])}.`), expect: E(R('done', { item: q(item) })) }; });
add('tasks.done.am-done', 'statement', (r) => { const item = pick(r, DO);
  return { text: `I'm done with ${item}.`, expect: E(R('done', { item: q(item) })) }; });
add('tasks.done.tick', 'request', (r) => { const item = pick(r, ALL);
  return { text: sent(`${pick(r, ['Tick', 'Check'])} off ${item}.`), expect: E(R('done', { item: q(item) })) }; });
add('tasks.done.bought', 'statement', (r) => { const item = pick(r, BUY);
  return { text: `I bought ${item}.`, expect: E(R('done', { item: q(item) })) }; });
FAM('done.off-list', ({ item, list, r }) => `${pick(r, ['Tick', 'Check', 'Cross'])} ${item} off ${list}.`, 'done', ({ item, l }) => ({ item: q(item), ...(l ? { list: q(l.name) } : {}) }));
// showing and counting
add('tasks.show', 'question', (r) => { const l = chance(r, 0.6) ? L(r) : null, d = pick(r, DET);
  const text = pick(r, [`What is on ${lst(d, l)}?`, `${pick(r, ['Show', 'Read', 'Open', 'List'])} ${pick(r, ['me ', ''])}${lst(d, l)}.`]);
  return { text: sent(text), expect: E(R('show', { list: listArg(l) })) }; });
add('tasks.show.reminders', 'question', (r) => ({ text: pick(r, ['What are my reminders?', 'Show me my reminders.', 'Show my reminders.', 'Read my reminders.']), expect: E(R('show', { list: 'reminders' })) }));
add('tasks.show.lists', 'question', (r) => ({ text: pick(r, ['What lists do I have?', 'Which lists do I have?']), expect: E(R('lists')) }));
add('tasks.pending', 'question', (r) => { const k = Math.floor(r() * 5), l = L(r);
  const c = [[`What do I ${pick(r, ['still ', ''])}${pick(r, ['have', 'need'])} to do?`, 'to-do'], [`What do I ${pick(r, ['still ', ''])}${pick(r, ['have', 'need'])} to buy?`, 'shopping'], [`What is ${pick(r, ['still ', ''])}left on my ${l.name} list?`, q(l.name)], [`What is left to do?`, 'to-do'], [`What do I still have to do on my ${l.name} list?`, q(l.name)]][k];
  return { text: c[0].replace(/\s+/g, ' '), expect: E(R('pending', { list: c[1] })) }; });
add('tasks.count', 'question', (r) => { const k = Math.floor(r() * 5), l = L(r), th = pick(r, ['things', 'items', 'tasks']);
  const c = [[`How many ${th} are on my list?`, 'count', 'to-do'], [`How many ${th} are on my ${l.name} list?`, 'count', q(l.name)], [`How many ${th} do I ${pick(r, ['still ', ''])}${pick(r, ['have', 'need'])} to do?`, 'countPending', 'to-do'], [`How many ${th} are ${pick(r, ['still ', ''])}left on my ${l.name} list?`, 'countPending', q(l.name)], [`How many ${th} do I ${pick(r, ['still ', ''])}${pick(r, ['have', 'need'])} to buy?`, 'countPending', 'shopping']][k];
  return { text: c[0].replace(/\s+/g, ' '), expect: E(R(c[1], { list: c[2] })) }; });
add('tasks.clear', 'request', (r) => { const l = chance(r, 0.6) ? L(r) : null, d = pick(r, DET);
  const text = l && chance(r, 0.4) ? `${pick(r, ['Delete', 'Remove', 'Throw away'])} ${lst(d, l)}.` : `${pick(r, ['Clear', 'Empty'])} ${lst(d, l)}.`;
  return { text: sent(text), expect: E(R('clear', { list: listArg(l) })) }; });
add('tasks.has', 'question', (r) => { const item = pick(r, ALL), l = chance(r, 0.5) ? L(r) : null, d = pick(r, DET);
  const text = l && chance(r, 0.4) ? `Do I have ${item} on ${lst(d, l)}?` : `${pick(r, ['Is', 'Are'])} ${item} on ${lst(d, l)}?`;
  return { text, expect: E(R('has', { item: q(item), list: listArg(l) })) }; });
add('tasks.check', 'question', (r) => { const item = pick(r, DO), k = Math.floor(r() * 3);
  return { text: [`Did I ${pick(r, ['finish', 'complete', 'do'])} ${item}?`, `Have I ${pick(r, ['finished', 'completed', 'done'])} ${item}?`, `Is ${item} ${pick(r, ['done', 'finished', 'completed'])}?`][k], expect: E(R('check', { item: q(item) })) }; });
add('tasks.context', 'context', (r) => { const l = L(r), item = pick(r, BUY);
  return { context: [`Add ${item} to my ${l.name} list.`], text: `What is on my ${l.name} list?`, expect: E(R('show', { list: q(l.name) })) }; });
// negation, near misses, out of domain
add('tasks.neg', 'negation', (r) => { const item = pick(r, ALL);
  return { text: pick(r, [`Do not add ${item} to my list.`, `Don't remind me about ${item}.`, `I don't need to ${pick(r, DO)}.`, `Never put ${item} on my list.`]), negative: true }; });
// a negated report must never tick anything off: the world answers that nothing changed (action tasks.notDone)
add('tasks.neg.done', 'negation', (r) => { const item = pick(r, BUY);
  const t = pick(r, [[`I didn't buy ${item}.`, item], [`I did not buy ${item}.`, item], [`I have not bought ${item}.`, item], [`I never bought ${item}.`, item]]);
  return { text: t[0], expect: E(R('notDone', { item: q(t[1]) })) }; });
add('tasks.near', 'near-miss', (r) => { const item = pick(r, ALL);
  return { text: pick(r, [`My list is long.`, `I like ${pick(r, BUY)}.`, `Where is my ${pick(r, ['list', 'homework'])}?`, `Add ${item}.`, `Show me the picture.`, `Remember me.`, `The list has ${pick(r, ['three', 'five'])} items.`]), negative: true }; });
add('tasks.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Open the editor.', 'Play hangman.', 'What color is the sky?', 'Hello!', 'Is a whale a fish?', 'How many sides does a hexagon have?', 'Center.']), negative: true }; });


// ---- rule sweep: wider phrasing families (chat abbreviations, word orders, run-ons, many verbs per operation) ----
const SWL = (r) => pick(r, LISTS);
add('tasks.sw.add', 'request', (r) => { const item = pick(r, BUY), l = SWL(r);
  return { text: (pick(r, [`please write ${item} on my ${l} list`, `can u add ${item} to my ${l} list`, `pop ${item} onto my ${l} list pls`, `hey put ${item} on the ${l} list for me`, `i need ${item} on my ${l} list`, `${item} needs to go on my ${l} list`, `${item} for the ${l} list please`, `${l} list: ${item}`, `add ${item} to ${l}`, `put ${item} on ${l}`])), expect: E(R('add', { item: q(item), list: q(l) })) }; });
add('tasks.sw.remove', 'request', (r) => { const item = pick(r, BUY), l = SWL(r);
  return { text: (pick(r, [`delete ${item} off my ${l} list`, `take ${item} away from my ${l} list`, `get ${item} off the ${l} list please`, `${item} off the ${l} list`, `${l} list no more ${item}`, `toss ${item} off my ${l} list`, `hey delete ${item} from ${l} list`, `${l} list minus ${item}`])), expect: E(R('remove', { item: q(item), list: q(l) })) }; });
add('tasks.sw.done', 'statement', (r) => { const item = pick(r, DO.filter((d) => !/^(bring|call|my )/.test(d)));
  return { text: (pick(r, [`i finished ${item}`, `${item} is done`, `${item} finished!`, `all done with ${item}`, `yay finished ${item}`, `done with ${item}`, `${item} all done`])), expect: E(R('done', { item: q(item) })) }; });
add('tasks.sw.tick', 'request', (r) => { const item = pick(r, BUY), l = SWL(r);
  return { text: (pick(r, [`tick ${item} off the ${l} list`, `check ${item} off my ${l} list`, `mark ${item} done on ${l} list`, `check off ${item} on the ${l} list pls`])), expect: E(R('done', { item: q(item), list: q(l) })) }; });
add('tasks.sw.notdone', 'statement', (r) => { const item = pick(r, DO.filter((d) => !/^(my |bring|call)/.test(d)));
  return { text: (pick(r, [`i didnt finish ${item}`, `${item} not finished`, `${item} still not done`, `not finished ${item}`, `i still didnt finish ${item}`, `${item} is not done pls`, `no ${item} finished yet`])), expect: E(R('notDone', { item: q(item) })) }; });
add('tasks.sw.remind', 'request', (r) => { const item = pick(r, DO.filter((d) => !/^my /.test(d)));
  return { text: (pick(r, [`can u remind me to ${item}`, `nudge me about ${item} later`, `ping me to ${item}`, `alarm me to ${item}`, `dont let me forget to ${item}`, `${item}, remind me`, `later remind me to ${item}`, `i need a reminder to ${item}`, `reminder: ${item}`, `could you remind me about ${item} later please`])), expect: E(R('remind', { item: q(item) })) }; });
add('tasks.sw.show', 'question', (r) => { const l = SWL(r);
  return { text: (pick(r, [`whats on the ${l} list`, `what is on the ${l} list right now`, `what items are on the ${l} list`, `tell me whats on my ${l} list`, `anything on my ${l} list?`, `read my ${l} list`, `${l} list please`])), expect: E(R('show', { list: q(l) })) }; });
add('tasks.sw.reminders', 'question', (r) => ({ text: pick(r, ['what reminders do i have', 'tell me my reminders', 'any reminders for me?', 'reminders please', 'do i have any reminders', 'what do you remind me of']), expect: E(R('show', { list: 'reminders' })) }));
add('tasks.sw.lists', 'question', (r) => ({ text: pick(r, ['lists i got?', 'what kinds of lists do i have', 'show all my lists', 'which lists exist', 'name my lists']), expect: E(R('lists')) }));
add('tasks.sw.pending', 'question', (r) => { const l = SWL(r);
  return { text: (pick(r, [`whats left on my ${l} list`, `what is still on the ${l} list`, `remaining items on ${l} list?`, `what am i still missing from the ${l} list`])), expect: E(R('pending', { list: q(l) })) }; });
add('tasks.sw.pending.todo', 'question', (r) => ({ text: pick(r, ['what do i need to do still', "what's still open for me", "what's still on my to do", 'what do i got left todo']), expect: E(R('pending', { list: 'to-do' })) }));
add('tasks.sw.pending.buy', 'question', (r) => ({ text: pick(r, ["what's left to buy", 'still to buy?', 'what else do i still need to buy']), expect: E(R('pending', { list: 'shopping' })) }));
add('tasks.sw.count', 'question', (r) => { const l = SWL(r);
  return { text: (pick(r, [`how many things r on my ${l} list`, `hw many things on my ${l} list`, `how long is my ${l} list`, `count the things on my ${l} list`, `number of items on my ${l} list?`])), expect: E(R('count', { list: q(l) })) }; });
add('tasks.sw.count.pending', 'question', (r) => ({ text: pick(r, ['how much do i still have to do', 'how many more things do i need to do', 'how many things still open', 'how many tasks still todo', 'how many chores do we still have']), expect: E(R('countPending', { list: 'to-do' })) }));
add('tasks.sw.clear', 'request', (r) => { const l = SWL(r);
  return { text: (pick(r, [`clear the ${l} list pls`, `${l} list empty it`, `can u empty my ${l} list`, `make the ${l} list blank`, `hey clear my ${l} list`, `could you empty the ${l} list for me`, `remove everything from the ${l} list`, `wipe my ${l} list clean`])), expect: E(R('clear', { list: q(l) })) }; });
add('tasks.sw.has', 'question', (r) => { const item = pick(r, BUY), l = SWL(r);
  return { text: pick(r, [`is there ${item} on the ${l} list`, `do we have ${item} on the ${l} list`, `${item} on my ${l} list or not`, `check if ${item} is on my ${l} list`, `does my ${l} list have ${item}`, `can u check if ${item} is on the ${l} list`, `did i put ${item} on my ${l} list`]), expect: E(R('has', { item: q(item), list: q(l) })) }; });
add('tasks.sw.check', 'question', (r) => { const item = pick(r, DO.filter((d) => !/^(my |bring|call)/.test(d)));
  return { text: pick(r, [`did i finish ${item}`, `have i done ${item}`, `${item} done or not`, `was ${item} finished`, `could you tell me if i finished ${item}`, `finished ${item}?`]), expect: E(R('check', { item: q(item) })) }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
