// Operations of docs.editor: talk with a document, dictate, edit, create documents from the conversation (spec 07).
// Browser-safe: no imports.
//
// State (ctx.state): { title, blocks: [{ id, kind: 'heading'|'paragraph'|'list', text?, items?, from?: [wire ids] }],
//   cursor (index of the block last added or changed, -1 when none), inputMode: null|'dictation', history: [snapshots, max 50],
//   future: [snapshots for redo], nextId, dictBlock (id of the paragraph being dictated, or null) }
// Effects: speech.say { text }, clipboard.copy { text }, file.download { filename, mime, content }.
// Modal input: while inputMode is 'dictation' the engine offers every message to interceptInput(ctx, text) before formalization.
// Cross-world: ctx.request('ui.openTab', { tab: 'editor' }) after every change; ctx.find / ctx.ask read kids.tasks, kids.animals and kids.arith.
// Every created sentence comes from wires: created blocks keep the ids of the wires they were made from in `from`.
// Documents created from the conversation use small sentence templates in this file (no generated text).

const MAX_HISTORY = 50;
const DEFAULT_TITLE = 'Untitled document';
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };

export function initialState() {
  return { title: DEFAULT_TITLE, blocks: [], cursor: -1, inputMode: null, history: [], future: [], nextId: 1, dictBlock: null };
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const plural = (n, word) => (n === 1 ? word : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${String(w).replace(/_/g, ' ')}`;
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const show = (ctx) => ctx.request('ui.openTab', { tab: 'editor' });

// ---- history ---------------------------------------------------------------------------------
const snap = (s) => structuredClone({ title: s.title, blocks: s.blocks, cursor: s.cursor, nextId: s.nextId });
function commit(s) {
  s.history.push(snap(s));
  while (s.history.length > MAX_HISTORY) s.history.shift();
  s.future = [];
}
function restore(s, sn) { s.title = sn.title; s.blocks = sn.blocks; s.cursor = sn.cursor; s.nextId = sn.nextId; s.dictBlock = null; }

export function undo(ctx) {
  const s = ctx.state;
  if (!s.history.length) return no('missing', 'There is nothing to undo.');
  s.future.push(snap(s));
  restore(s, s.history.pop());
  show(ctx);
  return ok('OK, I undid the last change.');
}
export function redo(ctx) {
  const s = ctx.state;
  if (!s.future.length) return no('missing', 'There is nothing to redo.');
  s.history.push(snap(s));
  restore(s, s.future.pop());
  show(ctx);
  return ok('OK, I did it again.');
}

// ---- helpers ---------------------------------------------------------------------------------
const newId = (s) => `b${s.nextId++}`;
function addBlock(s, block, index = s.blocks.length) {
  const b = { id: newId(s), ...block };
  s.blocks.splice(index, 0, b);
  s.cursor = index;
  return b;
}
const sentencesOf = (t) => String(t).split(/(?<=[.!?])\s+/).filter(Boolean);
const wordCount = (s) => words([s.title === DEFAULT_TITLE ? '' : s.title, ...s.blocks.map(blockText)].join(' ')).length;
const blockText = (b) => (b.kind === 'list' ? b.items.join(', ') : b.text);

/** Plain text of the document, for clipboard and download. */
function plain(s, markdown) {
  const out = [markdown ? `# ${s.title}` : s.title];
  for (const b of s.blocks) {
    if (b.kind === 'heading') out.push(markdown ? `## ${b.text}` : b.text);
    else if (b.kind === 'paragraph') out.push(b.text);
    else out.push(b.items.map((i) => `- ${i}`).join('\n'));
  }
  return out.join('\n\n') + '\n';
}
/** Text for reading aloud. */
function spoken(s) {
  const parts = [s.title === DEFAULT_TITLE && s.blocks.length ? '' : `${s.title}.`];
  for (const b of s.blocks) parts.push(b.kind === 'list' ? `A list: ${joinAnd(b.items)}.` : /[.!?:]$/.test(b.text) ? b.text : `${b.text}.`);
  return parts.filter(Boolean).join(' ');
}

const KIND_OK = { paragraph: 'paragraph', heading: 'heading', list: 'list', block: null };
/** Find a block by kind and position (ordinal word or number; -1 = last). Returns { idx } or { error }. */
function pick(s, { kind, ord, n }) {
  if (!(kind in KIND_OK)) return { error: `I can only do that with paragraphs, headings, lists or blocks, not with ${plural(2, kind)}.` };
  const want = KIND_OK[kind];
  const idxs = s.blocks.map((b, i) => (!want || b.kind === want ? i : -1)).filter((i) => i >= 0);
  const label = want ?? 'block';
  if (!idxs.length) return { error: `There is no ${label} in the document.` };
  const pos = n !== undefined ? Number(n) : ORD[ord];
  const at = pos === -1 ? idxs.length : pos;
  if (!Number.isInteger(at) || at < 1 || at > idxs.length) {
    return { error: idxs.length === 1 ? `There is only one ${label}.` : `There are only ${idxs.length} ${plural(2, label)}.` };
  }
  return { idx: idxs[at - 1], label, at };
}

// ---- adding ----------------------------------------------------------------------------------
export function addHeading(ctx, { text }) {
  const s = ctx.state, t = String(text).trim();
  if (!t) return no('unsupported', 'What should the heading say?');
  commit(s); addBlock(s, { kind: 'heading', text: cap(t) }); show(ctx);
  return ok(`OK, I added the heading "${cap(t)}".`);
}
export function addParagraph(ctx, { text }) {
  const s = ctx.state, t = String(text).trim();
  if (!t) return no('unsupported', 'What should the paragraph say?');
  commit(s); addBlock(s, { kind: 'paragraph', text: /[.!?]$/.test(t) ? cap(t) : `${cap(t)}.` }); show(ctx);
  return ok(`OK, I added a paragraph (${words(t).length} words).`);
}
export function addList(ctx, { text }) {
  const s = ctx.state;
  const items = String(text).split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return no('unsupported', 'What should be on the list?');
  commit(s); addBlock(s, { kind: 'list', items }); show(ctx);
  return ok(`OK, I added a list with ${items.length} ${plural(items.length, 'item')}: ${joinAnd(items)}.`);
}

// ---- editing ---------------------------------------------------------------------------------
export function doDelete(ctx, args) {
  const s = ctx.state;
  const p = pick(s, args);
  if (p.error) return no('missing', p.error);
  commit(s);
  s.blocks.splice(p.idx, 1);
  s.cursor = Math.min(p.idx, s.blocks.length - 1);
  show(ctx);
  return ok(`OK, I deleted the ${p.label}.`);
}
export { doDelete as delete };

export function deleteSentence(ctx) {
  const s = ctx.state;
  const idx = s.blocks.map((b) => b.kind).lastIndexOf('paragraph');
  if (idx < 0) return no('missing', 'There is no paragraph to delete a sentence from.');
  commit(s);
  const ss = sentencesOf(s.blocks[idx].text);
  ss.pop();
  if (ss.length) s.blocks[idx].text = ss.join(' '); else { s.blocks.splice(idx, 1); s.dictBlock = null; }
  s.cursor = Math.min(idx, s.blocks.length - 1);
  show(ctx);
  return ok('OK, I deleted the last sentence.');
}

export function clear(ctx) {
  const s = ctx.state;
  if (!s.blocks.length && s.title === DEFAULT_TITLE) return ok('The document is already empty.');
  commit(s);
  s.title = DEFAULT_TITLE; s.blocks = []; s.cursor = -1; s.dictBlock = null;
  show(ctx);
  return ok('OK, I cleared the document. You can say "undo" to get it back.');
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function replace(ctx, { from, to }) {
  const s = ctx.state;
  const a = String(from).trim(), b = String(to).trim();
  if (!a) return no('unsupported', 'What should I replace?');
  const re = new RegExp(`\\b${esc(a)}\\b`, 'gi');
  let n = 0;
  const sub = (t) => t.replace(re, () => { n++; return b; });
  const before = snap(s);
  const next = { title: sub(s.title), blocks: s.blocks.map((x) => (x.kind === 'list' ? { ...x, items: x.items.map(sub) } : { ...x, text: sub(x.text) })) };
  if (!n) return no('missing', `I could not find "${a}" in the document.`);
  s.history.push(before); while (s.history.length > MAX_HISTORY) s.history.shift(); s.future = [];
  s.title = next.title; s.blocks = next.blocks;
  show(ctx);
  return ok(`OK, I replaced "${a}" with "${b}" ${n} ${n === 1 ? 'time' : 'times'}.`);
}

export function move(ctx, { where, ...ref }) {
  const s = ctx.state;
  const p = pick(s, ref);
  if (p.error) return no('missing', p.error);
  const to = where === 'top' ? 0 : where === 'bottom' ? s.blocks.length - 1 : p.idx + (where === 'up' ? -1 : 1);
  if (to < 0 || to >= s.blocks.length) return no('missing', `The ${p.label} cannot go any further ${where === 'down' ? 'down' : where === 'up' ? 'up' : ''}.`.replace(' .', '.'));
  if (to === p.idx) return ok(`The ${p.label} is already ${where === 'top' ? 'at the top' : 'at the end'}.`);
  commit(s);
  const [b] = s.blocks.splice(p.idx, 1);
  s.blocks.splice(to, 0, b);
  s.cursor = to;
  show(ctx);
  return ok(`OK, I moved the ${p.label} ${where === 'top' ? 'to the top' : where === 'bottom' ? 'to the end' : where}.`);
}

export function setTitle(ctx, { text }) {
  const s = ctx.state, t = String(text).trim();
  if (!t) return no('unsupported', 'What should the title be?');
  commit(s); s.title = cap(t); show(ctx);
  return ok(`OK, the title is now "${s.title}".`);
}

export function newDoc(ctx, { text } = {}) {
  const s = ctx.state;
  commit(s);
  s.title = text ? cap(String(text).trim()) : DEFAULT_TITLE; s.blocks = []; s.cursor = -1; s.dictBlock = null;
  show(ctx);
  return ok(text ? `OK, a new document called "${s.title}".` : 'OK, a new empty document.');
}

// ---- reading, copying, downloading -------------------------------------------------------------
export function read(ctx, args = {}) {
  const s = ctx.state;
  if (args.kind === 'title') { ctx.effect('speech.say', { text: s.title }); return ok(`OK, reading the title: ${s.title}.`); }
  if (args.kind) {
    const p = pick(s, args);
    if (p.error) return no('missing', p.error);
    const b = s.blocks[p.idx];
    ctx.effect('speech.say', { text: b.kind === 'list' ? `A list: ${joinAnd(b.items)}.` : b.text });
    return ok(`OK, reading ${args.kind === 'block' ? `block ${p.at}` : `${p.label} ${p.at}`}.`);
  }
  if (!s.blocks.length) return no('missing', 'The document is empty, so there is nothing to read.');
  ctx.effect('speech.say', { text: spoken(s) });
  return ok(`OK, reading the document: ${s.title}.`);
}

export function copy(ctx, args = {}) {
  const s = ctx.state;
  if (args.kind && args.kind !== 'title') {
    const p = pick(s, args);
    if (p.error) return no('missing', p.error);
    ctx.effect('clipboard.copy', { text: blockText(s.blocks[p.idx]) });
    return ok(`OK, I copied the ${p.label} to the clipboard.`);
  }
  if (!s.blocks.length && s.title === DEFAULT_TITLE) return no('missing', 'The document is empty, so there is nothing to copy.');
  ctx.effect('clipboard.copy', { text: plain(s, false) });
  return ok('OK, I copied the document to the clipboard.');
}

export function download(ctx, { format } = {}) {
  const s = ctx.state;
  if (!s.blocks.length) return no('missing', 'The document is empty, so there is nothing to download.');
  const md = format === 'markdown' || format === 'md';
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
  ctx.effect('file.download', { filename: `${slug}.${md ? 'md' : 'txt'}`, mime: md ? 'text/markdown' : 'text/plain', content: plain(s, md) });
  return ok(`OK, I am downloading "${s.title}" as ${md ? 'markdown' : 'a text file'}.`);
}

// ---- questions ---------------------------------------------------------------------------------
export function count(ctx, { kind }) {
  const s = ctx.state;
  let n;
  if (kind === 'word') n = wordCount(s);
  else if (kind === 'item') n = s.blocks.filter((b) => b.kind === 'list').reduce((a, b) => a + b.items.length, 0);
  else if (kind === 'sentence') n = s.blocks.filter((b) => b.kind === 'paragraph').reduce((a, b) => a + sentencesOf(b.text).length, 0);
  else if (kind === 'block') n = s.blocks.length;
  else if (kind in KIND_OK) n = s.blocks.filter((b) => b.kind === kind).length;
  else return no('unsupported', 'I can count paragraphs, headings, lists, items, sentences, words and blocks.');
  return ok(`There ${n === 1 ? 'is' : 'are'} ${n} ${plural(n, kind)}.`);
}
export function askTitle(ctx) {
  const t = ctx.state.title;
  return ok(t === DEFAULT_TITLE ? 'The document has no title yet. It is called "Untitled document".' : `The title is "${t}".`);
}
export function whatIs(ctx, args) {
  if (args.kind === 'title') return askTitle(ctx);
  const p = pick(ctx.state, args);
  if (p.error) return no('missing', p.error);
  const b = ctx.state.blocks[p.idx];
  return ok(`The ${args.ord} ${p.label} says: ${b.kind === 'list' ? joinAnd(b.items) : b.text}`.replace(/ says: (.*[^.!?])$/, ' says: $1.'));
}
export function say(ctx) {
  const s = ctx.state;
  if (!s.blocks.length) return no('missing', 'The document is empty.');
  return ok(`The document "${s.title}" says: ${spoken(s)}`);
}
export function mentions(ctx, { word }) {
  const s = ctx.state, w = String(word).trim().replace(/^the\s+(word\s+)?/i, '');
  const re = new RegExp(`\\b${esc(w)}`, 'i');
  const where = s.blocks.map((b, i) => (re.test(blockText(b)) ? `${b.kind} ${s.blocks.slice(0, i + 1).filter((x) => x.kind === b.kind).length}` : null)).filter(Boolean);
  if (re.test(s.title)) where.unshift('the title');
  if (!where.length) return ok(`No, the document does not mention ${w}.`);
  return ok(`Yes, the document mentions ${w}: in ${joinAnd(where)}.`);
}
export function isEmpty(ctx) {
  const s = ctx.state;
  return ok(s.blocks.length ? `No, the document has ${s.blocks.length} ${plural(s.blocks.length, 'block')}.` : 'Yes, the document is empty.');
}

// ---- dictation (modal input) -------------------------------------------------------------------
export function dictate(ctx) {
  const s = ctx.state;
  s.inputMode = 'dictation'; s.dictBlock = null;
  show(ctx);
  return ok('OK, dictation is on. Everything you say goes into the document. Say comma, period or question mark for punctuation, "new paragraph" for a new paragraph, "undo that" or "delete the last sentence" to correct, and "stop dictation" when you are done.');
}
export function dictateStop(ctx) {
  const s = ctx.state;
  if (!s.inputMode) return no('missing', 'Dictation is not on.');
  s.inputMode = null; s.dictBlock = null;
  return ok('OK, dictation is off.');
}

const PUNCT = [
  [/\s*\b(?:question mark)\b/gi, '?'], [/\s*\b(?:exclamation mark|exclamation point)\b/gi, '!'], [/\s*\b(?:full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','], [/\s*\bsemicolon\b/gi, ';'], [/\s*\bcolon\b/gi, ':'],
];
function convertPunctuation(text) {
  let t = String(text).trim();
  for (const [re, p] of PUNCT) t = t.replace(re, p);
  t = t.replace(/\s*\bnew line\b\s*/gi, '\n').replace(/\s+([,.;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  return t.replace(/([.!?]\s+|\n)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
}
const norm = (t) => String(t).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = /^(stop dictation|stop dictating|end dictation|finish dictation|dictation off|done dictating|i am done dictating)$/;

/** Modal input hook (spec 07 section 2): called before formalization while inputMode is set. */
export function interceptInput(ctx, text) {
  const s = ctx.state;
  if (s.inputMode !== 'dictation') return { handled: false };
  const n = norm(text);
  if (STOP.test(n)) { s.inputMode = null; s.dictBlock = null; return { handled: true, reply: 'OK, dictation is off.' }; }
  if (n === 'new paragraph' || n === 'next paragraph') { s.dictBlock = null; return { handled: true, reply: 'New paragraph.' }; }
  if (n === 'undo that' || n === 'undo' || n === 'scratch that') { const r = undo(ctx); return { handled: true, reply: r.value ?? r.note }; }
  if (/^(delete|remove|erase) (the )?(last|previous) sentence$/.test(n)) { const r = deleteSentence(ctx); return { handled: true, reply: r.value ?? r.note }; }
  let raw = String(text).trim(), stopAfter = false;
  const tail = raw.match(/^(.*?)[\s,.]*\b(?:stop dictation|stop dictating)\s*[.!]?$/i);
  if (tail) { raw = tail[1]; stopAfter = true; }
  const added = convertPunctuation(raw);
  if (added) {
    commit(s);
    const cur = s.blocks.findIndex((b) => b.id === s.dictBlock);
    if (cur < 0) {
      const b = addBlock(s, { kind: 'paragraph', text: cap(added) });
      s.dictBlock = b.id;
    } else {
      const b = s.blocks[cur];
      const glue = /^[,.;:!?]/.test(added) ? '' : ' ';
      const piece = /[.!?]$/.test(b.text) && glue ? cap(added) : added;
      b.text += glue + piece;
      s.cursor = cur;
    }
  }
  if (stopAfter) { s.inputMode = null; s.dictBlock = null; return { handled: true, reply: added ? 'Added. Dictation is off.' : 'OK, dictation is off.' }; }
  return { handled: true, reply: added ? 'Added.' : '' };
}

// ---- creating documents from the conversation ------------------------------------------------------
function createDoc(ctx, title, blocks) {
  const s = ctx.state;
  commit(s);
  s.title = title; s.blocks = []; s.dictBlock = null;
  for (const b of blocks) addBlock(s, b);
  s.cursor = 0;
  show(ctx);
  ctx.effect('speech.say', { text: title });
}

const listKey = (raw) => {
  const n = String(raw).toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(my|the|a|an|our)\s+/, '').replace(/\s+list$/, '');
  if (/^(to do|todo|to-do|tasks?|things to do|chores?)$/.test(n)) return 'to-do';
  if (/^(shopping|shop|grocery|groceries)$/.test(n)) return 'shopping';
  if (/^reminders?$/.test(n)) return 'reminders';
  return n || 'to-do';
};

export function fromList(ctx, { list }) {
  const key = listKey(list);
  const entries = ctx.find('kids.tasks.entry').filter((w) => ctx.val(w, 'list') === key && ctx.val(w, 'progress') !== 'removed');
  if (!entries.length) return no('missing', `There is nothing on your ${key} list yet, so I cannot make a document from it.`);
  const todo = entries.filter((w) => ctx.val(w, 'progress') !== 'done');
  const done = entries.filter((w) => ctx.val(w, 'progress') === 'done');
  const title = `${cap(key)} list`;
  const blocks = [];
  if (todo.length) blocks.push({ kind: 'list', items: todo.map((w) => ctx.val(w, 'text')), from: todo.map((w) => w.id) });
  if (done.length) blocks.push({ kind: 'paragraph', text: `Already done: ${joinAnd(done.map((w) => ctx.val(w, 'text')))}.`, from: done.map((w) => w.id) });
  createDoc(ctx, title, blocks);
  return ok(`I made a document called "${title}" from your ${key} list: ${entries.length} ${plural(entries.length, 'item')}. It is open in the editor.`, { from: entries.map((w) => w.id) });
}

const HABITATS = { sea: 'sea', ocean: 'sea', farm: 'farm', forest: 'forest', wood: 'forest', river: 'river', jungle: 'jungle', desert: 'desert', polar: 'polar', arctic: 'polar', home: 'home', pet: 'home', garden: 'garden', savanna: 'savanna', grassland: 'grassland', mountain: 'mountain' };
const CLASSES = { mammal: 'mammal', bird: 'bird', fish: 'fish', insect: 'insect', bug: 'insect', reptile: 'reptile', amphibian: 'amphibian', arachnid: 'arachnid' };
const TYPE = 'kids.animals.animal';

export function report(ctx, { topic }) {
  const t = String(topic).toLowerCase();
  const ws = (t.match(/[a-z]+/g) ?? []).map((x) => (x.endsWith('ies') ? `${x.slice(0, -3)}y` : x.replace(/s$/, '')));
  const where = {};
  for (const w of ws) {
    if (HABITATS[w]) where.habitat = HABITATS[w];
    else if (CLASSES[w]) where.class = CLASSES[w];
    else if (w === 'flying' || w === 'flier') where.can_fly = 'true';
    else if (w === 'swimming' || w === 'swimmer') where.can_swim = 'true';
  }
  if (!Object.keys(where).length) return no('missing', `I do not know a group of animals called "${String(topic).trim()}". Try sea animals, farm animals, birds or insects.`);
  const found = ctx.ask({ type: TYPE, seek: 'matching', where, mode: 'list' });
  if (found.status !== 'supported' || !found.values?.length) return no('missing', `I do not know any ${String(topic).trim()} in my knowledge base yet.`);
  const names = found.values;
  const blocks = [];
  const group = String(found.note ?? 'animals').replace(/\s*\(.*\)\s*$/, '');
  blocks.push({ kind: 'paragraph', text: `Here are the ${group}.`, from: found.from ?? [] });
  blocks.push({ kind: 'list', items: names.map((n) => String(n).replace(/_/g, ' ')), from: found.from ?? [] });
  for (const name of names.slice(0, 8)) {
    const d = ctx.ask({ type: TYPE, seek: 'summary', where: { name } });
    if (d.status === 'supported' && d.value) blocks.push({ kind: 'paragraph', text: `${cap(an(name))} is ${d.value}`, from: d.from ?? [] });
  }
  const title = `Report: ${cap(String(topic).trim())}`;
  createDoc(ctx, title, blocks);
  return ok(`I made a report about ${String(topic).trim()} with ${names.length} ${plural(names.length, 'animal')}. It is open in the editor.`, { from: found.from });
}

export function holdings(ctx, { who }) {
  const spec = String(who).toLowerCase().trim();
  const everyone = /^(everyone|everybody|all|all of them|they|them|the children|the kids|each person|everything)$/.test(spec);
  let owners = null;
  if (!everyone) {
    const names = spec.split(/\s*,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    owners = names.map((n) => `e.${n}`);
    const unknown = names.filter((n) => !ctx.get(`e.${n}`));
    if (unknown.length) return no('missing', `I do not know ${joinAnd(unknown.map(cap))} yet.`);
  }
  const pairs = new Map();
  for (const w of ctx.find('kids.arith.holding')) {
    const owner = ctx.val(w, 'owner'), item = ctx.val(w, 'item');
    if (owner && item && (!owners || owners.includes(owner))) pairs.set(`${owner}|${item}`, { owner, item });
  }
  const byOwner = new Map();
  for (const { owner, item } of pairs.values()) {
    const r = ctx.ask({ type: 'kids.arith.holding', seek: 'count', where: { owner, item } });
    if (r.status !== 'supported') continue;
    const e = byOwner.get(owner) ?? { parts: [], from: [] };
    e.parts.push(`${r.value} ${String(item).replace(/_/g, ' ').split(' ').map((x, i, a) => (i === a.length - 1 ? plural(Number(r.value), x) : x)).join(' ')}`);
    e.from.push(...(r.from ?? []));
    byOwner.set(owner, e);
  }
  if (!byOwner.size) return no('missing', 'I do not know what anyone has yet. Tell me, for example: Tom has 5 apples.');
  const blocks = [...byOwner].map(([owner, e]) => ({ kind: 'paragraph', text: `${cap(ctx.name(owner))} ${ctx.name(owner).toLowerCase() === 'you' ? 'have' : 'has'} ${joinAnd(e.parts)}.`, from: [...new Set(e.from)] }));
  createDoc(ctx, 'Who has what', blocks);
  return ok(`I made a document called "Who has what" with ${blocks.length} ${plural(blocks.length, 'paragraph')}. It is open in the editor.`);
}
