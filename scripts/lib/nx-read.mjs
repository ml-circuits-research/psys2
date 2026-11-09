/**
 * NX: the rules' reading of a text as an NX record fragment (op + slots with spans), and the world description a labeler gets.
 * Record format (NX1): { id, group, split, world, tab, context, text, lang, op, slots: [{ key, ask, span, text, value }], ... }.
 *
 * op   = the wire type of the segment (`kids.arith.give`), or `?<type>` for a question about a legend type (`?kids.arith.holding`);
 *        a question's `seek` is the slot with key `seek` (span null, value = the sought key).
 * slot = one legend key of the wire: key = full legend key, ask = its `ask=` question, span = offsets inside `text` or null when
 *        the value is not a part of the text (implied, from context), value = the canonical value (after the lexicon).
 */
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../../src/worlds/index.mjs';
import { formalize, FormSession } from '../../src/formalizer/rules/index.mjs';

export async function loadSet(root = DEFAULT_ROOT) {
  return loadWorlds(createFsLoader({ roots: [root] }));
}

const STRUCT = new Set(['action', 'core.request.action', 'core.via', 'core.source', 'core.seq', 'core.in', 'core.question.type', 'core.question.seek']);
const keySlots = (emit) => { const m = {}; for (const x of String(emit).matchAll(/([A-Za-z_][\w.-]*)="?\{(\w+)\}/g)) m[x[1]] = x[2]; return m; };
const plainValue = (v) => (v.kind === 'ref' ? '$' + String(v.v).replace(/^\$/, '') : v.kind === 'string' ? v.v : /^-?\d+(\.\d+)?$/.test(v.v) ? Number(v.v) : v.v);

/** Formalize `messages` in a fresh session restricted to nothing (caller passes the world set); returns the last result. */
export function formalizeIn(set, messages, { tab = null } = {}) {
  const form = new FormSession();
  form.initDefaults();
  const context = tab ? { activeTab: tab.id ?? tab, tabWorld: tab.world ?? null, recentWorlds: tab.world ? [tab.world] : [] } : null;
  let res = null;
  messages.forEach((m, i) => { res = formalize(m, { worlds: set, session: form, source: `msg${i + 1}`, context }); });
  return res;
}

/** Segments of the last message of `res` as { text, span, worldId, kind, op, slots[], nWires } (null op when unparsed). */
export function readSegments(set, res) {
  const patterns = new Map();
  for (const w of set.list()) for (const p of w.patterns) patterns.set(p.id, p);
  const out = [];
  for (const seg of res.segments) {
    if (!seg.match) { out.push({ text: seg.text, span: seg.span, worldId: null, kind: null, op: null, slots: [], nWires: 0, unparsed: true }); continue; }
    const pat = patterns.get(seg.match.patternId);
    const slotOf = keySlots(pat?.emit ?? '');
    const wires = seg.wires.filter((w) => w.type !== 'core.agent').map((w) => set.legends.normalizeWire(w).wire);
    const rec = { text: seg.text, span: seg.span, worldId: seg.match.worldId, kind: seg.match.kind, op: null, slots: [], nWires: wires.length, patternId: seg.match.patternId };
    for (const w of wires) {
      const isQ = w.type === 'core.question';
      const ent = (k) => w.entries.find((e) => e.key === k);
      const isReq = w.type === 'core.request';
      rec.op = isQ ? '?' + ent('core.question.type')?.value.v : isReq ? ent('action')?.value.v ?? ent('core.request.action')?.value.v : w.type;
      for (const e of w.entries) {
        if (STRUCT.has(e.key)) continue;
        let key = e.key.replace(/^core\.request\./, '');
        if (isQ && key.startsWith('core.question.where.')) key = ent('core.question.type').value.v + '.' + key.slice('core.question.where.'.length);
        if (isQ && key.startsWith('core.question.')) continue;
        const short = key.split('.').pop();
        const sl = Object.entries(slotOf).find(([k]) => k === short || k.endsWith('.' + short) || key.endsWith('.' + k));
        const s = sl ? seg.match.slots[sl[1]] : null;
        rec.slots.push({ key, span: s ? s.span : null, text: s ? s.text : null, value: plainValue(e.value) });
      }
      if (isQ && ent('core.question.seek')) rec.slots.push({ key: 'seek', span: null, text: null, value: ent('core.question.seek').value.v });
      break; // first wire only; multi-wire segments are flagged by nWires
    }
    out.push(rec);
  }
  return out;
}

/** ask= question of a legend key (full key) or null. */
export function askOf(set, key) {
  const k = set.legends.keys.get(key);
  return k?.ask ?? null;
}

/** Full legend key of `short` for `type` (walks `extends`); unchanged when it has no legend key (request args, question seek). */
export function fullKey(set, type, short) {
  for (let t = type, i = 0; t && i < 8; t = set.legends.types.get(t)?.extends, i++) {
    if (set.legends.keys.has(`${t}.${short}`)) return `${t}.${short}`;
  }
  return short;
}

const EMIT_LINE = /^@\{_\d*\}\s+(\S+)\s*(.*)$/;
/** Static op signature of a pattern's emit: [{ op, fixed: {key: value}, keys: [key] }] (core.agent lines skipped). */
export function emitOps(emit) {
  const out = [];
  for (const line of String(emit).split(/\\n|\n/)) {
    const m = EMIT_LINE.exec(line.trim());
    if (!m || m[1] === 'core.agent') continue;
    const entries = [...m[2].matchAll(/([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|\S+)/g)].map((x) => [x[1], x[2]]);
    let op = m[1]; const fixed = {}; const keys = [];
    const type = entries.find(([k]) => k === 'type')?.[1];
    const action = entries.find(([k]) => k === 'action')?.[1];
    if (op === 'core.question') op = '?' + type;
    else if (op === 'core.request') op = action;
    for (const [k, v] of entries) {
      if (k === 'type' && m[1] === 'core.question') continue;
      if (k === 'action' && m[1] === 'core.request') continue;
      let key = m[1] === 'core.question' && k.startsWith('where.') ? type + '.' + k.slice(6) : k;
      if (m[1] === 'core.question' && k === 'seek') key = 'seek';
      if (/\{\w+\}/.test(v)) keys.push(key); else fixed[key] = v.replace(/^"|"$/g, '');
    }
    out.push({ op, fixed, keys });
  }
  return out;
}

/** World description for a labeler prompt: per op its keys (with ask), constants, doc and example texts; lexicon heads. */
export function describeWorld(set, id) {
  const w = set.get(id);
  const ops = new Map();
  for (const p of w.patterns) {
    const sig = emitOps(p.emit ?? '');
    if (sig.length !== 1) continue;
    const { op, fixed, keys } = sig[0];
    if (!op || op === 'undefined') continue;
    const o = ops.get(op) ?? { op, keys: new Set(), fixed: {}, examples: [], doc: null };
    const type = op.startsWith('?') ? op.slice(1) : op;
    const fk = (k) => fullKey(set, type, op.startsWith('?') && k.startsWith(type + '.') ? k.slice(type.length + 1) : k);
    keys.forEach((k) => o.keys.add(fk(k)));
    Object.entries(fixed).forEach(([k, v]) => { (o.fixed[fk(k)] ??= new Set()).add(v); });
    for (const ex of p.examples ?? (p.example ? [p.example] : [])) if (o.examples.length < 6 && !o.examples.includes(ex)) o.examples.push(ex);
    o.doc ??= p.doc ?? null;
    ops.set(op, o);
  }
  const opDoc = new Map(w.operations.map((x) => [x.action, x.doc]));
  const list = [...ops.values()].map((o) => {
    const type = o.op.startsWith('?') ? o.op.slice(1) : o.op;
    return {
      op: o.op,
      doc: o.doc ?? opDoc.get(o.op) ?? set.legends.types.get(type)?.doc ?? null,
      keys: [...o.keys].filter((k) => k !== 'seek').map((k) => ({ key: k, ask: askOf(set, k) })),
      fixed: Object.fromEntries(Object.entries(o.fixed).map(([k, v]) => [k, [...v].slice(0, 8)])),
      examples: o.examples,
    };
  });
  const lex = w.lexicons.map((l) => ({ id: l.id, class: l.class, words: l.words.slice(0, 10), n: l.words.length }));
  return { id, ops: list, lexicons: lex };
}

const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const norm = (s) => String(s).toLowerCase();

/** op + slots (key, value, no spans) of a normalized wire. */
export function wireToRec(set, rawWire) {
  const w = set.legends.normalizeWire(rawWire).wire;
  const ent = (k) => w.entries.find((e) => e.key === k);
  const isQ = w.type === 'core.question';
  const isReq = w.type === 'core.request';
  const op = isQ ? '?' + ent('core.question.type')?.value.v : isReq ? (ent('action') ?? ent('core.request.action'))?.value.v : w.type;
  const slots = [];
  for (const e of w.entries) {
    if (STRUCT.has(e.key)) continue;
    let key = e.key.replace(/^core\.request\./, '');
    if (isQ && key.startsWith('core.question.where.')) key = ent('core.question.type').value.v + '.' + key.slice('core.question.where.'.length);
    if (isQ && key.startsWith('core.question.')) continue;
    slots.push({ key, span: null, text: null, value: plainValue(e.value) });
  }
  if (isQ && ent('core.question.seek')) slots.push({ key: 'seek', span: null, text: null, value: ent('core.question.seek').value.v });
  return { op, slots };
}

/** Best-effort span of a slot value inside text: the value as a word/number/number word. Returns [s,e] or null. */
export function findSpan(text, value) {
  if (value == null || typeof value === 'object') return null;
  let v = String(value).replace(/^\$(e\.)?/, '');
  const lower = text.toLowerCase();
  const cands = [v.toLowerCase(), v.replace(/_/g, ' ').toLowerCase()];
  if (/^-?\d+$/.test(v)) { const w = Object.entries(NUMW).find(([, n]) => n === Number(v)); if (w) cands.push(w[0]); }
  for (const c of cands) {
    if (!c) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?(?![\\p{L}\\p{N}])`, 'u');
    const m = re.exec(lower);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}
