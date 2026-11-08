// Training-data generator of docs.editor (spec 08). Browser-safe, no imports.
// Every template builds the request text and the expected circuit (a core.request wire) together, so the expectation is known
// independently of the formalizer. Values (references, marks, colors, kinds) come from the lists below, which mirror the
// world's lexicon.sop; when the exporter passes `context.lexicons` the world's own lexicons widen them.
export const version = '1';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const q = (s) => JSON.stringify(String(s));
/** Expected circuit of one request: action plus args (strings are quoted by the caller). */
const REQ = (action, args = {}) => `@x1 core.request ${['action=' + action, ...Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => `arg.${k}=${v}`)].join(' ')}`;

const ORD = ['first', 'second', 'third', 'fourth', 'last'];
const BLOCKS = ['paragraph', 'heading', 'list', 'quote', 'table'];
const REFS = (r) => pick(r, ['the title', `the ${pick(r, ORD)} paragraph`, `the ${pick(r, ORD)} heading`, 'the list', 'the last sentence', `the word ${pick(r, WORDS)}`, 'the second paragraph', 'it']);
const WORDS = ['milk', 'cat', 'party', 'apple', 'sea', 'bread', 'whale', 'picnic', 'garden'];
const MARKS = [['bold', 'bold'], ['italic', 'italic'], ['underlined', 'underlined'], ['strikethrough', 'strikethrough'], ['code', 'code']];
const COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];
const COLS = [['animal', 'legs', 'food'], ['name', 'age'], ['item', 'price', 'shop'], ['day', 'plan']];
const ROWS = [['cat', '4', 'fish'], ['dog', '4', 'bones'], ['bird', '2', 'seeds']];
const TASKS = ['buy bread', 'call Ana', 'clean the room', 'water the plants', 'read a book'];
const GROUPS = ['sea animals', 'farm animals', 'birds', 'insects'];
const CONVERT = [['numbered list', 'numbered_list'], ['bullet list', 'bullet_list'], ['task list', 'task_list'], ['quote', 'quote'], ['paragraph', 'paragraph']];
const URLS = ['example dot com', 'animals dot example dot org', 'my site dot net'];

const T = [
  // ---- inline formatting by reference
  { group: 'fmt.make', phenomenon: 'request', make: (r) => { const [w, m] = pick(r, MARKS), t = REFS(r); return [`Make ${t} ${w}.`, REQ('doc.format', { t: q(t), mark: m })]; } },
  { group: 'fmt.verb', phenomenon: 'request', make: (r) => { const t = REFS(r); const [v, m] = pick(r, [['Underline', 'underline'], ['Italicize', 'italicize'], ['Bold', 'bold']]); return [`${v} ${t}.`, REQ('doc.format', { t: q(t), mark: m })]; } },
  { group: 'fmt.off', phenomenon: 'negation', make: (r) => { const [w, m] = pick(r, [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['highlight', 'highlight']]); const t = REFS(r); return [`Remove the ${w} from ${t}.`, REQ('doc.format', { t: q(t), mark: m, off: 'true' })]; } },
  { group: 'fmt.not', phenomenon: 'negation', make: (r) => { const [w, m] = pick(r, MARKS); const t = pick(r, ['it', 'the title', 'the first paragraph']); return [`Make ${t} not ${w}.`, REQ('doc.format', { t: q(t), mark: m, off: 'true' })]; } },
  { group: 'fmt.hl', phenomenon: 'request', make: (r) => { const t = REFS(r), c = pick(r, COLORS); return [`Highlight ${t} in ${c}.`, REQ('doc.format', { t: q(t), mark: 'highlight', color: c })]; } },
  { group: 'fmt.hl.default', phenomenon: 'ellipsis', make: (r) => { const t = REFS(r); return [`Highlight ${t}.`, REQ('doc.format', { t: q(t), mark: 'highlight' })]; } },
  { group: 'fmt.plain', phenomenon: 'request', make: (r) => { const t = pick(r, ['the title', 'the second paragraph', 'the heading']); return [`Make ${t} plain.`, REQ('doc.clearFormat', { t: q(t) })]; } },
  { group: 'link', phenomenon: 'multi-entity', make: (r) => { const u = pick(r, URLS), w = pick(r, WORDS); return [`Add a link to ${u} on the word ${w}.`, REQ('doc.link', { url: q(u), t: q(`the word ${w}`) })]; } },
  // ---- block formatting
  { group: 'size', phenomenon: 'request', make: (r) => { const t = pick(r, ['the title', 'the heading', 'the second heading']); const s = pick(r, ['bigger', 'smaller', 'larger']); return [`Make ${t} ${s}.`, REQ('doc.size', { t: q(t), how: s })]; } },
  { group: 'align.center', phenomenon: 'request', make: (r) => { const t = REFS(r); return [`Center ${t}.`, REQ('doc.align', { t: q(t), how: 'center' })]; } },
  { group: 'align.to', phenomenon: 'request', make: (r) => { const t = pick(r, ['the title', 'the first paragraph', 'the quote']); const a = pick(r, ['left', 'right', 'center']); return [`Align ${t} to the ${a}.`, REQ('doc.align', { t: q(t), how: a })]; } },
  { group: 'convert', phenomenon: 'request', make: (r) => { const [w, k] = pick(r, CONVERT); const t = pick(r, ['the list', 'this paragraph', 'the first paragraph', 'the quote']); return [`Turn ${t} into a ${w}.`, REQ('doc.convert', { t: q(t), to: k })]; } },
  { group: 'convert.level', phenomenon: 'request', make: (r) => { const n = pick(r, [1, 2, 3]); return [`Turn the second paragraph into heading ${n}.`, REQ('doc.convert', { t: q('the second paragraph'), to: 'heading', n })]; } },
  // ---- selection and deletion
  { group: 'select', phenomenon: 'request', make: (r) => { const t = pick(r, [`the ${pick(r, ORD)} paragraph`, `the word ${pick(r, WORDS)}`, 'the title', 'the last sentence', 'everything']); return [`Select ${t}.`, REQ('doc.select', { t: q(t) })]; } },
  { group: 'select.clear', phenomenon: 'request', make: () => ['Clear the selection.', REQ('doc.unselect')] },
  { group: 'delete.it', phenomenon: 'coreference', context: (r) => [`Select the word ${pick(r, WORDS)}.`], make: () => ['Delete the selection.', REQ('doc.deleteTarget', { t: q('it') })] },
  { group: 'delete.word', phenomenon: 'request', make: (r) => { const w = pick(r, WORDS); return [`Delete the word ${w}.`, REQ('doc.deleteTarget', { t: q(`the word ${w}`) })]; } },
  // ---- tables
  { group: 'table.spec', phenomenon: 'multi-entity', make: (r) => { const c = pick(r, COLS); return [`Add a table with ${c.length} columns: ${c.slice(0, -1).join(', ')}, ${c.at(-1)}.`, REQ('doc.addTable', { spec: q(`${c.length} columns: ${c.slice(0, -1).join(', ')}, ${c.at(-1)}`) })]; } },
  { group: 'table.bare', phenomenon: 'request', make: () => ['Add a table.', REQ('doc.addTable')] },
  { group: 'row.add', phenomenon: 'multi-entity', make: (r) => { const v = pick(r, ROWS); return [`Add a row: ${v.join(', ')}.`, REQ('doc.addRow', { t: q(v.join(', ')) })]; } },
  { group: 'col.add', phenomenon: 'request', make: (r) => { const n = pick(r, ['weight', 'color', 'size', 'habitat']); return [`Add a column ${n}.`, REQ('doc.addColumn', { t: q(n) })]; } },
  { group: 'table.fill', phenomenon: 'request', make: (r) => { const g = pick(r, GROUPS); return [`Fill the table with ${g}.`, REQ('doc.fillTable', { topic: q(g) })]; } },
  { group: 'cell.set', phenomenon: 'multi-entity', make: (r) => { const a = 1 + Math.floor(r() * 3), b = 1 + Math.floor(r() * 3), v = pick(r, ['cat', '4', 'fish']); return [`Set the cell in row ${a} column ${b} to ${v}.`, REQ('doc.setCell', { r: a, c: b, t: q(v) })]; } },
  { group: 'row.delete', phenomenon: 'request', make: (r) => { const o = pick(r, ['first', 'second', 'last']); return [`Delete the ${o} row.`, REQ('doc.delete', { ord: o, kind: 'row' })]; } },
  // ---- tasks
  { group: 'task.add', phenomenon: 'request', make: (r) => { const t = pick(r, TASKS); return [`Add a task ${t}.`, REQ('doc.addTask', { t: q(t) })]; } },
  { group: 'task.check', phenomenon: 'request', make: (r) => { const o = pick(r, ['first', 'second', 'third', 'last']); const un = chance(r, 0.4); return [`${un ? 'Uncheck' : 'Check'} the ${o} task.`, REQ('doc.checkTask', { ord: o, state: un ? 'uncheck' : 'check' })]; } },
  { group: 'task.all', phenomenon: 'request', make: (r) => { const un = chance(r, 0.4); return [`${un ? 'Uncheck' : 'Check'} all tasks.`, REQ('doc.checkTask', { all: 'true', state: un ? 'uncheck' : 'check' })]; } },
  { group: 'task.count', phenomenon: 'question', make: (r) => { const left = chance(r, 0.5); return [left ? 'How many tasks are left?' : 'How many tasks are done?', REQ('doc.countTasks', { state: left ? 'left' : 'done' })]; } },
  // ---- other blocks
  { group: 'rule', phenomenon: 'request', make: (r) => [pick(r, ['Insert a line.', 'Add a horizontal rule.', 'Insert a divider.']), REQ('doc.addRule')] },
  { group: 'quote.add', phenomenon: 'request', make: (r) => { const t = pick(r, ['Be kind to every animal', 'Time flies', 'Less is more']); return [`Add a quote ${t}.`, REQ('doc.addQuote', { text: q(t) })]; } },
  { group: 'list.numbered', phenomenon: 'multi-entity', make: (r) => [`Add a numbered list with ${pick(r, ['wake up, eat and play', 'one, two and three'])}.`, null] },
  // ---- navigation and statistics
  { group: 'go.pos', phenomenon: 'request', make: (r) => { const w = pick(r, ['end', 'top']); return [`Go to the ${w}.`, REQ('doc.goto', { where: w })]; } },
  { group: 'go.kind', phenomenon: 'request', make: (r) => { const k = pick(r, BLOCKS); return [`Go to the ${k}.`, REQ('doc.goto', { ord: 'first', kind: k })]; } },
  { group: 'count.bare', phenomenon: 'question', make: (r) => { const k = pick(r, ['word', 'task', 'sentence', 'paragraph']); return [`How many ${k}s?`, REQ('doc.count', { kind: k })]; } },
  { group: 'count.table', phenomenon: 'question', make: (r) => { const k = pick(r, ['row', 'column']); return [`How many ${k}s does the table have?`, REQ('doc.count', { kind: k })]; } },
  { group: 'stats', phenomenon: 'question', make: (r) => [pick(r, ['Word count.', 'Give me the statistics.']), REQ('doc.stats')] },
  { group: 'copy.as', phenomenon: 'request', make: (r) => { const f = pick(r, ['markdown', 'html']); return [`Copy the document as ${f}.`, REQ('doc.copy', { format: f })]; } },
  { group: 'download.html', phenomenon: 'request', make: () => ['Download the document as html.', REQ('doc.download', { format: 'html' })] },
];
// null expectations (formalized by an older pattern the generator does not duplicate) are dropped below.

const NEG = [
  ['Tom has 5 apples.', 'out-of-domain'], ['Make your eyes bigger.', 'near-miss'], ['Make your body blue.', 'near-miss'], ['Open the chess board.', 'out-of-domain'],
  ['What is the capital of France?', 'out-of-domain'], ['Play tic tac toe.', 'out-of-domain'], ['Mark the milk as done.', 'near-miss'], ['How many legs does a spider have?', 'out-of-domain'],
  ['I need to buy milk.', 'near-miss'], ['Add milk to my list.', 'near-miss'], ['Turn on the speaker.', 'out-of-domain'], ['Draw a red house.', 'out-of-domain'],
];

/** rng(): seeded uniform in [0,1). Returns at most `count` examples. */
export function generate({ rng, count }) {
  const out = [];
  const n = Math.max(0, Math.min(count ?? 200, 2000));
  const real = T.filter((t) => t.group !== 'list.numbered');
  for (let i = 0; out.length < n && i < n * 6; i++) {
    if (i % 12 === 11) { const [text, phenomenon] = pick(rng, NEG); out.push({ text, expect: null, group: `neg.${phenomenon}`, phenomenon, negative: true }); continue; }
    const t = real[i % real.length];
    const [text, expect] = t.make(rng);
    const ex = { text, expect, group: t.group, phenomenon: t.phenomenon, negative: false };
    if (t.context) ex.context = t.context(rng);
    out.push(ex);
  }
  return out.slice(0, n);
}
export { cap as _cap };
