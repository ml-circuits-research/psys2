// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor (spec 21): the hooks of the schema world. The acts (make, remove, change, place, group, copy, pick, ask, send, save, undo, redo) are read by the generated grammar; what an act DOES
// to the document is the editor engine of editor.mjs (blocks, marks, the reference resolver of target.mjs, TipTap in the tab). The roles of an act are mapped onto the engine's operations here;
// the user's sentence is not read again: the thing role goes to the engine's resolver as the words it is ("the second paragraph", "the word milk"), the attribute is the one whose enum holds the
// value (style, align, type ...; a colour is a highlight), the kind is the schema's. Nothing here names a verb.
import * as E from './editor.mjs?v=ab86963db1';
import * as G from './ops.mjs?v=e30e89df96';   // circular on purpose: only used inside functions, when the executor exists
import { colourName } from '../../lib/knowledge/values.mjs?v=a137742733';
import { en } from '../../lib/lang/en.mjs?v=061a6ba9b3';
const numerals = en.numerals('acts');

const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9_'-]+/).filter(Boolean);
const PRONOUN = /^(?:it|them|that|this|those|these|one|ones|this one|that one|the selection|selection|the selected text)$/;
const no = (note, status = 'unsupported') => ({ status, note });
const schemaOf = () => G.executor?.schema;
const singular = (w) => w.replace(/ies$/, 'y').replace(/s$/, '');

/** The kind of the schema a phrase names: the last word of its head is a word of the kind ("the second paragraph", "bullet list", "chapter"). */
function kindOf(text, first = false) {
  const sch = schemaOf();
  const ws = wordsOf(String(text ?? '').split(/[:,;]|\b\d+(?:\.\d+)?\b/)[0]);
  if (!sch || !ws.length) return null;
  const byWord = (w) => Object.values(sch.kinds).find((k) => [k.name, k.plural, ...(k.words ?? [])].some((x) => x === w || x === singular(w)));
  return byWord(ws.at(-1)) ?? (first ? byWord(ws[0]) : null);
}
/** The word a phrase uses for its kind ("chapter", "subheading": a word of the kind that the engine tells apart). */
const headWord = (text) => { const ws = wordsOf(String(text ?? '').split(/[:,;]|\b\d+(?:\.\d+)?\b/)[0]); return singular(ws.at(-1) ?? ''); };
const styleOfWords = (...texts) => { const sch = schemaOf(); const vals = sch?.attrs?.style?.values ?? []; for (const t of texts) for (const w of wordsOf(t)) if (vals.includes(w) && ['bulleted', 'numbered', 'checklist'].includes(w)) return w; for (const t of texts) if (wordsOf(t).some((w) => ['task', 'todo', 'to-do', 'checkbox'].includes(w))) return 'checklist'; return null; };
/** The attribute whose enum holds the value ("bold" -> style, "center" -> align); a colour is a highlight. */
function attrByValue(value) {
  const sch = schemaOf();
  const v = String(value ?? '').toLowerCase().trim().replace(/\s+/g, '_');
  const a = Object.values(sch?.attrs ?? {}).find((x) => x.type === 'enum' && x.values.includes(v));
  return a?.name ?? (v && colourName(wordsOf(value).at(-1) ?? '') ? 'highlight' : null);
}
const attrName = (w0) => { const w = String(w0).toLowerCase(), sing = singular(w); const a = Object.values(schemaOf()?.attrs ?? {}).find((x) => [w, sing].some((y) => x.name === y || (x.words ?? []).includes(y))); return a?.name ?? w0; };
const WHERE = { top: 'top', beginning: 'top', end: 'bottom', bottom: 'bottom', up: 'up', down: 'down' };
const ordOf = (t) => { const w = wordsOf(t); return w.find((x) => /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)$/.test(x)); };
const numOf = (t) => String(t ?? '').match(/\d+/)?.[0];
/** The position words a placement carries ("after the title"): they stay at the end of the text, where the engine reads them. */
const tail = (r) => [r.rel, r.place].filter(Boolean).join(' ');
const withTail = (text, r) => [text, tail(r)].filter((x) => x != null && x !== '').join(' ');
const isDoc = (k) => k?.name === 'document';

/** "a header, two chapters and a paragraph": a list of bare block kinds with numbers is a structure the engine builds (one request, one undo step). */
function structureOf(r) {
  const whole = [r.thing, r.value].filter(Boolean).join(', ').replace(/\s+(?:and|plus)\s+/gi, ', ');
  const parts = whole.split(/\s*,\s*/).filter(Boolean);
  if (parts.length < 2 || r.mode === 'write' || !/(?:^|\s)(?:and|plus)\s|,/.test(String(r.value ?? ''))) return null;
  const ok = parts.every((p) => { const w = p.toLowerCase().split(/\s+/).filter((x) => !['a', 'an', 'new', 'another'].includes(x) && numerals[x] == null && !/^\d+$/.test(x)); return w.length === 1 && kindOf(w[0]) != null; });
  return ok ? parts.join(',') : null;
}
const domain = {
  make: (ctx, r) => {
    const lead = String(r.thing ?? '').match(/^(\S+)\s+(.+)$/), nlead = lead && numerals[lead[1].toLowerCase()];
    if (nlead && !r.amount) r = { ...r, amount: nlead, thing: lead[2] };
    const spec = structureOf(r);
    if (spec) return E.addStructure(ctx, { spec });
    const k = kindOf(r.thing), val = r.value == null ? '' : String(r.value);
    const style = styleOfWords(r.thing);
    if (r.mode === 'write') return E.write(ctx, { text: withTail(val, r) });
    if (r.mode === 'continue') return E.write(ctx, { text: val, mode: 'continue' });
    if (!k) return no(`I do not know what to add: "${r.thing ?? ''}".`);
    const word = headWord(r.thing);
    const at = r.rel && r.place ? { pos: r.rel, ref: r.place } : {};
    const n = Number(r.amount) || 1;
    const once = () => {
      switch (k.name) {
        case 'freetext': return val ? E.write(ctx, { text: withTail(val, r) }) : no('What text should I add?', 'missing');
        case 'document': return val ? E.newDoc(ctx, { text: val }) : E.newDoc(ctx, {});
        case 'title': return E.addHeading(ctx, { text: withTail(val, r), level: 1 });
        case 'section': return E.addHeading(ctx, { text: r.mode === 'numbered' ? [r.amount, val].filter(Boolean).join(' ') : withTail(val, r), role: word === 'chapter' || word === 'subheading' || word === 'subsection' ? word : 'section' });
        case 'heading': return r.mode === 'blank' ? E.addHeading(ctx, { text: '' }) : E.addHeading(ctx, { text: withTail(val, r) });
        case 'paragraph': return r.mode === 'blank' ? E.newBlank(ctx, { kind: 'paragraph', ...at }) : E.addParagraph(ctx, { text: withTail(val, r) });
        case 'list': return E.addList(ctx, { text: withTail(val, r), style, empty: 'true' });
        case 'item': return E.addItem(ctx, { text: withTail(val, r), style });
        case 'task': return val && !/^list\b/i.test(val) ? E.addTask(ctx, { t: val }) : E.addList(ctx, { text: val.replace(/^list\s+(?:of\s+|with\s+)?/i, ''), style: 'checklist', empty: 'true' });
        case 'quote': return E.addQuote(ctx, { text: val });
        case 'table': return E.addTable(ctx, { spec: val });
        case 'row': return E.addRow(ctx, { t: val });
        case 'column': return E.addColumn(ctx, { t: val });
        case 'rule': return r.mode === 'blank' ? E.newBlank(ctx, { kind: 'line', ...at }) : E.addRule(ctx, at);
        case 'break': return E.pageBreak(ctx, at);
        default: return no(`I cannot add a ${k.name} to a document.`);
      }
    };
    let res = once();
    for (let i = 1; i < Math.min(n || 1, 10) && res.status === 'supported'; i++) res = once();
    return res;
  },
  remove: (ctx, r) => {
    const k = kindOf(r.thing, true);
    if (r.mode === 'new') return E.newDoc(ctx, {});
    if (!r.thing || isDoc(k) || r.mode === 'all') return E.clear(ctx, {});
    if (k?.name === 'row' || k?.name === 'column') { const ord = ordOf(r.thing), n = numOf(r.thing); return (k.name === 'row' ? E.deleteRow : E.deleteColumn)(ctx, { ord, n, ...(!ord && !n ? { name: String(r.thing).replace(/\b(?:the|rows?|columns?|cols?)\b/g, '').trim() } : {}) }); }
    return E.deleteTarget(ctx, { t: PRONOUN.test(String(r.thing).trim()) ? 'it' : r.thing });
  },
  change: (ctx, r) => {
    const k = kindOf(r.thing), raw = r.value == null ? null : String(r.value), value = raw == null ? null : raw.replace(/^(?:a|an|the)\s+/i, '');
    const t = r.thing && !PRONOUN.test(String(r.thing).trim()) ? r.thing : 'it';
    const tsel = (x) => (x && !PRONOUN.test(String(x).trim()) ? x : 'it');
    if (r.mode === 'name') return isDoc(k) || k?.name === 'title' ? E.setTitle(ctx, { text: raw }) : E.replace(ctx, { from: r.thing, to: raw });
    if (r.mode === 'more' || r.mode === 'less' || r.mode === 'scale') return E.size(ctx, { t, how: r.mode === 'less' ? 'smaller' : 'bigger' });
    if (k?.name === 'cell') { const [row, col] = String(r.thing).match(/\d+/g) ?? []; return E.setCell(ctx, { r: row, c: col, t: raw }); }
    if (r.mode === 'off') { const a = r.attribute ? attrName(r.attribute) : attrByValue(value); return a === 'style' && value === 'plain' ? E.clearFormat(ctx, { t }) : a === 'link' ? E.link(ctx, { t, off: true }) : E.format(ctx, { t, mark: a === 'highlight' ? 'highlight' : value, off: true }); }
    const attr = r.attribute ? attrName(r.attribute) : attrByValue(value);
    switch (attr) {
      case 'style': {
        const v = String(value).toLowerCase().replace(/\s+/g, '_').replace(/_list$|_?check_list$/, '').replace(/^check$/, 'checklist').replace(/^(?:task|todo|bullet|ordered)$/, (x) => ({ task: 'checklist', todo: 'checklist', bullet: 'bulleted', ordered: 'numbered' })[x]) || wordsOf(value).at(-1);
        if (v === 'plain') return E.clearFormat(ctx, { t });
        if (['bulleted', 'numbered', 'checklist'].includes(v)) return E.convert(ctx, { t, to: v });
        return E.format(ctx, { t, mark: v, color: r.colour });
      }
      case 'type': return E.convert(ctx, { t, to: value });
      case 'level': return E.convert(ctx, { t, to: 'heading', n: value });
      case 'size': return E.size(ctx, { t, how: value ?? 'bigger' });
      case 'align': return E.align(ctx, { t, how: value });
      case 'highlight': return E.format(ctx, { t, mark: 'highlight', color: value });
      case 'link': return E.link(ctx, { t, url: value });
      case 'order': return E.move(ctx, { where: WHERE[String(value).toLowerCase()] ?? value, t });
      case 'content': return isDoc(k) || k?.name === 'title' ? E.setTitle(ctx, { text: value }) : E.replace(ctx, { from: t, to: value });
      default:
        if (isDoc(k) || k?.name === 'title') return E.setTitle(ctx, { text: value });
        if (value) return E.replace(ctx, { from: r.thing, to: value });
        return no(`What should I change about ${r.thing ?? 'it'}?`, 'missing');
    }
  },
  place: (ctx, r) => {
    const w = wordsOf(r.place ?? r.value ?? '').at(-1);
    if (w && attrByValue(w) === 'align') return E.align(ctx, { t: r.thing ?? 'it', how: w });
    const where = WHERE[String(r.value ?? r.place ?? '').toLowerCase()];
    return where ? E.move(ctx, { where, t: r.thing ?? 'it' }) : no('I can move a block to the top, to the end, or one step up or down.');
  },
  group: (ctx, r) => E.convert(ctx, { t: r.thing ?? 'it', to: r.mode === 'apart' ? 'paragraph' : 'bulleted' }),
  copy: (ctx, r) => (!r.thing || isDoc(kindOf(r.thing)) ? E.copy(ctx, {}) : E.copy(ctx, { t: r.thing })),
  pick: (ctx, r) => {
    if (r.mode === 'none') return E.unselect(ctx, {});
    const where = WHERE[String(r.thing ?? '').toLowerCase().replace(/^the\s+/, '')];
    if (r.mode === 'goto') return where === 'top' || where === 'bottom' ? E.goto(ctx, { where: where === 'top' ? 'top' : 'end' }) : E.goto(ctx, { t: r.thing });
    return E.select(ctx, { t: r.thing ?? 'it' });
  },
  ask: (ctx, r) => {
    if (['why', 'last'].includes(r.mode)) return undefined;
    const k = kindOf(r.thing);
    if (r.mode === 'count') return k && k.name !== 'document' ? E.count(ctx, { kind: k.name === 'section' ? 'heading' : k.name }) : E.stats(ctx, {});
    if (r.mode === 'selected') return E.whatSelected(ctx, {});
    if (r.mode === 'describe' || r.mode === 'state') return E.say(ctx, {});
    if (k?.name === 'title' || r.attribute === 'title') return E.askTitle(ctx, {});
    return E.whatIs(ctx, { t: r.thing ?? 'it' });
  },
  send: (ctx, r) => ctx.request('things.show', { thing: r.thing, to: r.place }),
  save: (ctx, r) => E.download(ctx, { format: r.value }),
  undo: (ctx, r) => E.undo(ctx, { n: r.amount }),
  redo: (ctx) => E.redo(ctx, {}),
};

/** DECLINE (spec 21): a sentence is the document's when the open tab is the editor and its words are of the document, when it names a block of a document ("the second paragraph", "a heading"), or, while no
 *  other tab is open, when it is the writing of text or a document with content already answers it ("it" is then the document's, said with the focus verdict). */
function accepts({ action, mode, roles = {}, state, tab, text }) {
  const act = String(action ?? '').split('.').pop();
  if (!Object.hasOwn(domain, act)) return true;   // the operations that are not acts (dictation, reading, export, statistics, documents from other worlds) are read by patterns that name the editor's own frames
  const on = tab === 'docs.editor', free = !tab || tab === 'ui.avatar', hasDoc = (state?.blocks?.length ?? 0) > 0;
  const said = [roles.thing, roles.pre].filter(Boolean).join(' ').trim();
  if (['undo', 'redo'].includes(act)) return on;
  const k = kindOf(said);
  const named = (!!k && !['list', 'item', 'task', 'rule', 'row', 'column', 'cell'].includes(k.name)) || !!styleOfWords(said);
  if (/\b(?:document|doc|editor|paragraph|heading|chapter|section|quote|table|title)s?\b/i.test(String(text ?? ''))) return k || on || !said ? true : false;
  if (free && ['write', 'continue', 'blank'].includes(mode)) return true;
  if (free && k && roles.value && ['list', 'task', 'item'].includes(k.name)) return true;
  if (!on && !(free && hasDoc)) return named;
  if (['write', 'continue'].includes(mode)) return true;
  if (!said || PRONOUN.test(said) || Object.hasOwn(WHERE, said.toLowerCase().replace(/^the\s+/, ''))) return on ? true : 'focus';
  if (k) return true;
  if (['ask', 'change', 'remove', 'pick', 'copy'].includes(act)) return !!E.resolveIn?.(state, said)?.ok;
  return false;
}

export const hooks = { domain, accepts, referents: (ctx) => E.referents(ctx), intercept: (ctx, text) => E.interceptInput(ctx, text) };
