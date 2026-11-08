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
const T_ = 'kids.time.';
// Days, months and seasons come from the world lexicons (context) with embedded fallbacks; the calendar facts are not needed
// for the expected circuits (they only describe the question).
const DAYS_FB = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTHS_FB = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS_FB = ['spring', 'summer', 'autumn', 'winter'];
const days = (x) => x.lex('lex.kids.time.days', DAYS_FB);
const months = (x) => x.lex('lex.kids.time.months', MONTHS_FB);
const seasons = (x) => x.lex('lex.kids.time.seasons', SEASONS_FB);
const N = (r, hi = 6) => 1 + Math.floor(r() * hi);
const D = (d) => cap(d);
const Q = (type, seek, where, extra = {}) => ['core.question', { type: T_ + type, seek, ...extra, ...Object.fromEntries(Object.entries(where).map(([k, v]) => ['where.' + k, v])) }];
const shift = (unit, from, by) => Q(unit === 'season' ? 'seasonshift' : 'shift', 'result', { unit, from, by });
const dn = (k, w) => `${k} ${k === 1 ? w : w + 's'}`;
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });

// statements
add('time.today', 'statement', (r, x) => { const d = pick(r, days(x));
  const t = pick(r, [`Today is ${D(d)}.`, `It is ${D(d)} today.`, `It was ${D(d)}.`, `Today it is ${D(d)}.`, `Today was ${D(d)}.`, `We are on ${pick(r, ['', 'a '])}${D(d)}.`, `It is ${D(d)}.`]);
  return { text: t, expect: E([T_ + 'today', { day: d }]) }; });
add('time.month.now', 'statement', (r, x) => { const m = pick(r, months(x));
  return { text: pick(r, [`This month is ${D(m)}.`, `It is ${D(m)}.`, `Now is ${D(m)}.`, `The month is ${D(m)}.`, `We are in ${D(m)}.`]), expect: E([T_ + 'thismonth', { month: m }]) }; });
add('time.clockset', 'statement', (r) => { const h = N(r, 12);
  return { text: pick(r, [`It is ${nt(r, h)} o'clock${pick(r, ['', ' now'])}.`, `The time is ${nt(r, h)} o'clock.`, `The clock ${pick(r, ['shows', 'says', 'reads'])} ${nt(r, h)} o'clock.`]), expect: E([T_ + 'clockset', { hour: h }]) }; });
add('time.statement.context', 'context', (r, x) => { const d = pick(r, days(x)), m = pick(r, months(x));
  return { context: [`It is ${D(m)}.`], text: `Today is ${D(d)}.`, expect: E([T_ + 'today', { day: d }]) }; });

// day questions
add('time.q.day.after-before', 'question', (r, x) => { const d = pick(r, days(x)), up = chance(r, 0.5);
  const w = up ? pick(r, ['comes after', 'is after', 'follows after', 'is it after']) : pick(r, ['comes before', 'is before', 'was before']);
  return { text: pick(r, [`${pick(r, ['What', 'Which'])} day ${w} ${D(d)}?`, `${up ? 'What is the day after' : 'What is the day before'} ${D(d)}?`, `The day ${up ? 'after' : 'before'} ${D(d)}?`]), expect: E(shift('day', d, up ? 1 : -1)) }; });
add('time.q.day.n', 'question', (r, x) => { const d = pick(r, days(x)), k = N(r), up = chance(r, 0.5);
  return { text: `What day ${pick(r, ['is', 'comes', 'will it be'])} ${nt(r, k, 0.2)} ${k === 1 ? 'day' : 'days'} ${up ? 'after' : 'before'} ${D(d)}?`, expect: E(shift('day', d, up ? k : -k)) }; });
add('time.q.day.if', 'question', (r, x) => { const d = pick(r, days(x)), up = chance(r, 0.5);
  const t = up ? pick(r, [`What day is it tomorrow if today is ${D(d)}?`, `What day will it be tomorrow when today is ${D(d)}?`, `If today is ${D(d)}, what day is tomorrow?`]) : pick(r, [`What day was yesterday if today is ${D(d)}?`, `What day is it yesterday when today is ${D(d)}?`, `If today is ${D(d)}, what day was yesterday?`]);
  return { text: t, expect: E(shift('day', d, up ? 1 : -1)) }; });
add('time.q.day.relative', 'question', (r) => { const c = pick(r, [['What day is tomorrow?', 1], ['What day will it be tomorrow?', 1], ['What day was yesterday?', -1], ['What day is it today?', 0], ['What is today?', 0], ['What day is the day after tomorrow?', 2], ['What day was the day before yesterday?', -2], ['What day is it yesterday?', -1]]);
  return { text: c[0], expect: E(shift('day', 'today', c[1])) }; });
add('time.q.day.in-ago', 'question', (r) => { const k = N(r, 9), up = chance(r, 0.5);
  return { text: up ? `What day ${pick(r, ['is', 'will it be'])} ${pick(r, ['it ', ''])}in ${k} ${k === 1 ? 'day' : 'days'}?`.replace('  ', ' ') : `What day was it ${k} ${k === 1 ? 'day' : 'days'} ago?`, expect: E(shift('day', 'today', up ? k : -k)) }; });
add('time.q.day.number-words', 'number-words', (r, x) => { const d = pick(r, days(x)), k = 2 + N(r, 5);
  return { text: `What day is ${NUMW[k]} days after ${D(d)}?`, expect: E(shift('day', d, k)) }; });
// months
add('time.q.month.after-before', 'question', (r, x) => { const m = pick(r, months(x)), up = chance(r, 0.5);
  const t = pick(r, [`${pick(r, ['What', 'Which'])} month ${up ? pick(r, ['comes after', 'is after', 'follows']) : pick(r, ['comes before', 'is before'])} ${D(m)}?`, `What is the month ${up ? pick(r, ['after', 'following']) : 'before'} ${D(m)}?`]);
  return { text: t, expect: E(shift('month', m, up ? 1 : -1)) }; });
add('time.q.month.n', 'question', (r, x) => { const m = pick(r, months(x)), k = N(r, 11), up = chance(r, 0.5);
  return { text: `What month ${pick(r, ['is', 'comes', 'will it be'])} ${k} ${k === 1 ? 'month' : 'months'} ${up ? 'after' : 'before'} ${D(m)}?`, expect: E(shift('month', m, up ? k : -k)) }; });
add('time.q.month.relative', 'question', (r, x) => { const m = pick(r, months(x));
  const c = pick(r, [['What month is next month?', 'this_month', 1], ['What month was last month?', 'this_month', -1], ['What month is it?', 'this_month', 0], [`What month is next month if this month is ${D(m)}?`, m, 1], [`What month is it next month when it is ${D(m)}?`, m, 1]]);
  return { text: c[0], expect: E(shift('month', c[1], c[2])) }; });
add('time.q.comes', 'ellipsis', (r, x) => { const kind = pick(r, ['day', 'month', 'season']), v = pick(r, kind === 'day' ? days(x) : kind === 'month' ? months(x) : seasons(x)), up = chance(r, 0.5);
  return { text: `What comes ${up ? 'after' : 'before'} ${D(v)}?`, expect: E(shift(kind, v, up ? 1 : -1)) }; });
// seasons
add('time.q.season.of', 'question', (r, x) => { const m = pick(r, months(x));
  return { text: pick(r, [`${pick(r, ['Which', 'What'])} season ${pick(r, ['is', 'does'])} ${D(m)} ${pick(r, ['in', 'belong to', 'fall in'])}?`, `In ${pick(r, ['which', 'what'])} season is ${D(m)}?`, `${pick(r, ['Which', 'What'])} season is it in ${D(m)}?`]).replace(/ ([?])/, '$1'), expect: E(Q('monthinfo', 'season', { name: m })) }; });
add('time.q.season.shift', 'question', (r, x) => { const s = pick(r, seasons(x)), up = chance(r, 0.5);
  return { text: pick(r, [`${pick(r, ['Which', 'What'])} season ${up ? pick(r, ['comes after', 'is after', 'follows']) : pick(r, ['comes before', 'is before'])} ${D(s)}?`, `What is the season ${up ? pick(r, ['after', 'following']) : 'before'} ${D(s)}?`]), expect: E(shift('season', s, up ? 1 : -1)) }; });
add('time.q.season.months', 'question', (r, x) => { const s = pick(r, seasons(x));
  return { text: pick(r, [`${pick(r, ['Which', 'What'])} months are in ${s}?`, `${pick(r, ['Which', 'What'])} months belong to ${s}?`, `Name the months of ${s}.`, `Which months make up ${s}?`]), expect: E(Q('monthinfo', 'name', { season: s }, { mode: 'list' })) }; });
add('time.q.lists', 'question', (r) => { const c = pick(r, [['What are the days of the week?', Q('dayinfo', 'name', {}, { mode: 'list' })], ['Which days are the weekend?', Q('dayinfo', 'name', { kind: 'weekend' }, { mode: 'list' })], ['What are the weekend days?', Q('dayinfo', 'name', { kind: 'weekend' }, { mode: 'list' })], ['What are the school days?', Q('dayinfo', 'name', { kind: 'school' }, { mode: 'list' })], ['What are the months of the year?', Q('monthinfo', 'name', {}, { mode: 'list' })], ['What are the seasons?', Q('seasoninfo', 'name', {}, { mode: 'list' })], ['Which are the seasons of the year?', Q('seasoninfo', 'name', {}, { mode: 'list' })]]);
  return { text: c[0], expect: E(c[1]) }; });
// lengths
const ORDER = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'];
add('time.q.len', 'question', (r) => { const wi = 1 + Math.floor(r() * 6), pi = Math.floor(r() * wi), whole = ORDER[wi], part = ORDER[pi];
  if (part === 'month' && whole !== 'year') return null;
  const art_ = pick(r, [art(whole) + ' ', 'the ', ...(chance(r, 0.15) ? ['one '] : [])]);
  const pl = part + 's';
  const t = pick(r, [`How many ${pl} are in ${art_}${whole}?`, `How many ${pl} are there in ${art_}${whole}?`, `How many ${pl} does ${art_}${whole} have?`, `How many ${pl} make ${art_}${whole}?`, `How many ${pl} make up ${art_}${whole}?`]);
  return { text: t, expect: E(Q('length', 'count', { whole, part })) }; });
add('time.q.len.times', 'question', (r) => { const wi = 1 + Math.floor(r() * 5) + 1, pi = Math.floor(r() * wi), whole = ORDER[Math.min(wi, 6)], part = ORDER[pi], k = 2 + N(r, 4);
  if (part === 'month' && whole !== 'year') return null;
  return { text: `How many ${part}s are in ${nt(r, k, 0.2)} ${whole}s?`, expect: E(Q('length', 'count', { whole, part, times: k })) }; });
add('time.q.len.special', 'question', (r) => { const c = pick(r, [['How many days are in a leap year?', { whole: 'leap_year', part: 'day' }], ['How many days does a leap year have?', { whole: 'leap_year', part: 'day' }], ['How many days are in the weekend?', { whole: 'weekend', part: 'day' }]]);
  return { text: c[0], expect: E(Q('length', 'count', c[1])) }; });
add('time.q.len.month', 'question', (r, x) => { const m = pick(r, months(x));
  return { text: pick(r, [`How many days are in ${D(m)}?`, `How many days are there in ${D(m)}?`, `How many days does ${D(m)} have?`, `How many days has ${D(m)}?`]), expect: E(Q('monthinfo', 'days', { name: m })) }; });
// gaps
add('time.q.gap', 'question', (r, x) => { const a = pick(r, days(x)); let b = pick(r, days(x)); while (b === a) b = pick(r, days(x));
  const t = pick(r, [[`How many days until ${D(b)} if today is ${D(a)}?`, a], [`If today is ${D(a)}, how many days until ${D(b)}?`, a], [`How many days from ${D(a)} to ${D(b)}?`, a], [`How many days is it between ${D(a)} and ${D(b)}?`, a], [`How many days until ${D(b)}?`, 'today'], [`How many days are there till ${D(b)}?`, 'today']]);
  return { text: t[0], expect: E(Q('gap', 'count', { from: t[1], to: b })) }; });
add('time.q.hoursgap', 'question', (r) => { const a = N(r, 12); let b = N(r, 12); while (b === a) b = N(r, 12);
  return { text: pick(r, [`How many hours from ${a} o'clock to ${b} o'clock?`, `How many hours between ${nt(r, a)} o'clock and ${nt(r, b)} o'clock?`, `How many hours until ${b} o'clock if it is ${a} o'clock?`]), expect: E(Q('hoursgap', 'count', { from: a, to: b })) }; });
// clock arithmetic
const SPAN = {
  hours: (r) => { const k = N(r, 8); return { d: `${k} ${k === 1 ? 'hour' : 'hours'}`, w: (s) => ({ shift: s * k }) }; },
  minutes: (r) => { const k = 5 * N(r, 11); return { d: `${k} minutes`, w: (s) => ({ minutes: s * k }) }; },
  half: () => ({ d: 'half an hour', w: (s) => ({ minutes: s * 30 }) }),
  quarter: (r) => ({ d: `${pick(r, ['a ', ''])}quarter of an hour`, w: (s) => ({ minutes: s * 15 }) }),
};
const SHAPES = {
  if: (D_, h, r) => [`If it is ${h} o'clock${pick(r, [',', ''])} what time will it be in ${D_}?`, 1, true],
  after: (D_, h) => [`What time will it be in ${D_} if it is ${h} o'clock?`, 1, true],
  from: (D_, h, r) => [`What time ${pick(r, ['is', 'is it', 'will it be'])} ${D_} after ${h} o'clock?`, 1, true],
  stored: (D_, h, r) => [`What time ${pick(r, ['will it be', 'is it going to be', 'is it'])} in ${D_}?`, 1, false],
  'ago.if': (D_, h, r) => [`If it is ${h} o'clock${pick(r, [',', ''])} what time was it ${D_} ago?`, -1, true],
  'ago.after': (D_, h) => [`What time was it ${D_} ago if it is ${h} o'clock?`, -1, true],
  before: (D_, h, r) => [`What time ${pick(r, ['is', 'was', 'is it'])} ${D_} before ${h} o'clock?`, -1, true],
  'ago.stored': (D_) => [`What time was it ${D_} ago?`, -1, false],
};
for (const unit of Object.keys(SPAN)) {
  add(`time.q.clock.${unit}`, 'question', (r) => { const shape = pick(r, Object.keys(SHAPES)), sp_ = SPAN[unit](r), h = N(r, 12);
    const [text, sign, hasAt] = SHAPES[shape](sp_.d, nt(r, h, 0.15), r);
    return { text: text.replace(/ ,/g, ','), expect: E(Q('clock', 'result', { ...(hasAt ? { at: h } : {}), ...sp_.w(sign) })) }; });
}
add('time.q.now', 'question', (r) => ({ text: pick(r, ['What time is it?', 'What time is it now?', 'What is the time?', 'What is the time right now?', 'Can you tell me the time?', 'Tell me the time.', 'Do you know what time it is?']), expect: E(Q('reading', 'time', {})) }));
// negation, near misses, out of domain
add('time.neg', 'negation', (r, x) => { const d = pick(r, days(x)), m = pick(r, months(x));
  return { text: pick(r, [`Today is not ${D(d)}.`, `It isn't ${D(d)}.`, `It is not ${D(m)} yet.`, `It is not ${N(r, 12)} o'clock.`, `We are not in ${D(m)}.`]), negative: true }; });
add('time.near', 'near-miss', (r, x) => { const d = pick(r, days(x)), m = pick(r, months(x));
  return { text: pick(r, [`What day comes after ${D(m)}?`.replace(D(m), 'Blursday'), `What month is ${D(d)}?`, `How many days until Blursday?`, `What time will it be in ${N(r, 5)} fortnights?`, `Which season is ${D(d)} in?`, `How many hours are in a ${pick(r, ['rocket', 'ball'])}?`, `Tomorrow is ${D(d)}.`]), negative: true }; });
add('time.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'How many sides does a hexagon have?', 'Add milk to my shopping list.', 'Open the editor.', 'Play hangman.', 'What color is the sky?', 'Hello!', 'Is a whale a fish?', 'Where does a camel live?']), negative: true }; });


// ---- rule sweep: wider phrasing families (chat abbreviations, word orders, run-ons, abbreviations of units) ----
const lcd = (d) => String(d).toLowerCase();
const UNIT_NOUN = { day: 'days', month: 'months', season: 'seasons' };
for (const unit of ['day', 'month', 'season']) {
  const pool = (x) => (unit === 'day' ? days(x) : unit === 'month' ? months(x) : seasons(x));
  const word = unit === 'season' ? pick : pick;
  add(`time.sw.${unit}.n.after`, 'question', (r, x) => { const d = pick(r, pool(x)), k = unit === 'season' ? 2 + Math.floor(r() * 2) : 2 + N(r, 7), up = chance(r, 0.5), un = UNIT_NOUN[unit];
    const t = up ? pick(r, [`whats the ${unit} ${k} ${un} after ${d}`, `${unit} that is ${k} ${un} later than ${d}`, `if its ${d} what ${unit} in ${k} ${un}`, `${d} ${k} ${un} later is what ${unit}`, `count forward ${k} ${un} from ${d}`, `${k} ${un} after ${d} is which ${unit}`])
      : pick(r, [`count back ${k} ${un} from ${d}`, `${d} ${k} ${un} ago is what ${unit}`, `${unit} ${k} ${un} before ${d}`, `go back ${k} ${un} from ${d}`, `${k} ${un} before ${d} what ${unit}`]);
    return { text: t, expect: E(shift(unit, d, up ? k : -k)) }; });
  add(`time.sw.${unit}.next-prev`, 'question', (r, x) => { const d = pick(r, pool(x)), up = chance(r, 0.5);
    const t = up ? pick(r, [`next ${unit} after ${d} pls`, `after ${d} which ${unit} is it`, `the ${unit} after ${d}`, `u know what ${unit} is after ${d}`, `what ${unit} is right after ${d}`])
      : pick(r, [`the ${unit} before ${d}?`, `before ${d} what ${unit} is it`, `the ${unit} right before ${d} is what`, `u know what ${unit} is before ${d}`, `what ${unit} is right before ${d}`]);
    return { text: t, expect: E(shift(unit, d, up ? 1 : -1)) }; });
}
add('time.sw.day.today-so', 'question', (r, x) => { const d = pick(r, days(x)), up = chance(r, 0.5);
  return { text: `${lcd(d)} today so ${up ? 'tomorrow' : 'yesterday'} ${up ? 'is' : 'was'} what`, expect: E(shift('day', d, up ? 1 : -1)) }; });
add('time.sw.today.say', 'statement', (r, x) => { const d = pick(r, days(x));
  return { text: pick(r, [`its ${lcd(d)} today`, `today's ${lcd(d)} btw`, `fyi its ${lcd(d)} today`, `todays ${lcd(d)} ok`, `hey today is ${lcd(d)}`, `we are on ${lcd(d)} today`]), expect: E([T_ + 'today', { day: d }]) }; });
add('time.sw.month.say', 'statement', (r, x) => { const m = pick(r, months(x));
  return { text: pick(r, [`its ${lcd(m)} now`, `fyi we are in ${lcd(m)}`, `hey this month is ${lcd(m)}`]), expect: E([T_ + 'thismonth', { month: m }]) }; });
add('time.sw.clock.say', 'statement', (r) => { const h = N(r, 12);
  return { text: pick(r, [`its ${h} oclock now`, `the clock says ${h} oclock`, `the time is ${h} oclock`, `its ${h} o clock`]), expect: E([T_ + 'clockset', { hour: h }]) }; });
add('time.sw.month.days', 'question', (r, x) => { const m = pick(r, months(x));
  return { text: pick(r, [`how many days in ${lcd(m)} right`, `whats the length of ${lcd(m)}`, `can u tell me how many days ${lcd(m)} has`, `${lcd(m)} days?`, `is ${lcd(m)} 30 days`, `wait how many days are in ${lcd(m)}`, `how long is ${lcd(m)} in days`]), expect: E(Q('monthinfo', 'days', { name: m })) }; });
add('time.sw.len.abbr', 'question', (r) => { const c = pick(r, [['how many hrs in a day', 'day', 'hour'], ['how many mins in 1 hour', 'hour', 'minute'], ['in one hour how many minutes are there', 'hour', 'minute'], ['how many mins in an hr', 'hour', 'minute'], ['how many days in a wk', 'week', 'day'], ['how many secs in a minute', 'minute', 'second']]);
  return { text: c[0], expect: E(Q('length', 'count', { whole: c[1], part: c[2] })) }; });
add('time.sw.len.times', 'question', (r) => { const k = 2 + N(r, 4);
  return { text: pick(r, [`how many days in ${k} wks`, `${k} wks = how many days`, `${k} weeks how many days in total`, `how many days does ${k} weeks have`]), expect: E(Q('length', 'count', { whole: 'week', part: 'day', times: k })) }; });
add('time.sw.gap.days', 'question', (r, x) => { const a = pick(r, days(x)); let b = pick(r, days(x)); while (b === a) b = pick(r, days(x));
  const t = pick(r, [`from ${lcd(a)} how many days until ${lcd(b)}`, `${lcd(a)}, how many days till ${lcd(b)}`, `how long until ${lcd(b)} if its ${lcd(a)}`, `how many more days to ${lcd(b)} when its ${lcd(a)}`, `give me the day count from ${lcd(a)} to ${lcd(b)}`, `days between ${lcd(a)} and ${lcd(b)}?`]);
  return { text: t, expect: E(Q('gap', 'count', { from: a, to: b })) }; });
add('time.sw.hours.gap', 'question', (r) => { const a = N(r, 12); let b = N(r, 12); while (b === a) b = N(r, 12);
  return { text: pick(r, [`time from ${a} oclock to ${b} oclock in hours`, `whats the hour gap from ${a} oclock to ${b}`, `${a} to ${b} hours to go?`, `countdown in hours from ${a} to ${b}`, `hours from now till ${b} if its ${a} oclock`, `how long until ${b} oclock when its ${a}`, `${a} oclock to ${b} how many hours left`]), expect: E(Q('hoursgap', 'count', { from: a, to: b })) }; });
add('time.sw.clock.plus', 'question', (r) => { const h = N(r, 12), k = N(r, 8);
  return { text: pick(r, [`at ${h} oclock what time is it ${k} hours later`, `in ${k} hours from ${h} oclock it will be what`, `if its ${h} oclock whats the time in ${k} hrs`, `ten oclock ${k} hours later?`.replace('ten', String(h))]), expect: E(Q('clock', 'result', { at: h, shift: k })) }; });
add('time.sw.clock.minus', 'question', (r) => { const h = N(r, 12), k = N(r, 8);
  return { text: pick(r, [`what was the time ${k} hours before ${h} oclock`, `if its ${h} oclock what time was it ${k} hours ago`, `${k} hours ago from ${h} oclock what time`]), expect: E(Q('clock', 'result', { at: h, shift: -k })) }; });
add('time.sw.clock.half', 'question', (r) => { const h = N(r, 12);
  return { text: pick(r, [`what was the time half an hour before ${h} o clock`, `half an hour before ${h} oclock?`]), expect: E(Q('clock', 'result', { at: h, minutes: -30 })) }; });
add('time.sw.reading', 'question', (r) => ({ text: pick(r, ['what time r we at', 'do u know what time it is', 'can u tell me the time', 'whats the time', 'time pls', "what o'clock is it", 'time check']), expect: E(Q('reading', 'time', {})) }));
add('time.sw.lists.weekend', 'question', (r) => ({ text: pick(r, ['weekend days?', 'which days is the weekend', 'name the weekend days pls', 'what are the days of the weekend', 'tell me which days are weekend', 'which days count as weekend?']), expect: E(Q('dayinfo', 'name', { kind: 'weekend' }, { mode: 'list' })) }));
add('time.sw.lists.days', 'question', (r) => ({ text: pick(r, ['name all the days of the week', 'list the days of the week pls', 'days of the week pls']), expect: E(Q('dayinfo', 'name', {}, { mode: 'list' })) }));

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
