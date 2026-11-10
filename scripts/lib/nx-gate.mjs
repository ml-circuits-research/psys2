/**
 * NX3 deterministic gate (before any judge). A candidate record
 *   { id, group, world, tab, context, text, lang, op, slots: [{ key, text, value }] }
 * passes when: the record is well formed; the op exists in the world; every key belongs to the op; every non-null slot text is a
 * substring of the text (the offsets are computed and stored in `span`); numbers are numbers; values of lexicon-bound keys are lexicon
 * words (singular, or plural of one); and executing the wire on a fresh world state raises no error (interpreter dry run).
 * `gateOne(ctx, rec)` returns { ok: true, rec } (with spans and canonical values) or { ok: false, reason }.
 */
import { describeWorld, emitOps, fullKey } from './nx-read.mjs';
import { Interpreter } from '../../src/interpreter/index.mjs';
import { makeWire, atom, str } from '../../src/soplang/index.mjs';

export const REASONS = ['not-an-object', 'missing-field', 'unknown-world', 'unknown-op', 'unknown-key', 'duplicate-key', 'bad-slot', 'text-too-long', 'span-not-in-text', 'value-type', 'value-not-in-lexicon', 'dry-run-error'];

const stem = (w) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('es') && /(s|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w);

/** Per-world gate context: allowed keys per op, lexicon of each lexicon-bound key, numeric keys, interpreter. */
export function makeGateContext(set) {
  const interp = new Interpreter(set);
  const worlds = new Map();
  const get = (id) => {
    if (worlds.has(id)) return worlds.get(id);
    const w = set.get(id);
    if (!w) { worlds.set(id, null); return null; }
    const d = describeWorld(set, id);
    const ops = new Map();
    for (const o of d.ops) ops.set(o.op, { keys: new Set([...o.keys.map((k) => k.key), ...Object.keys(o.fixed)]), seek: o.op.startsWith('?'), fixed: Object.fromEntries(Object.entries(o.fixed).map(([k, v]) => [k, new Set(v.map((x) => String(x).toLowerCase()))])) });
    // key -> lexicon id, from patterns (match slot class lex.* and emit key={slot})
    const lexOf = new Map(); const lexWords = new Map();
    for (const l of set.list().flatMap((x) => x.lexicons)) lexWords.set(l.id, { cls: l.class, words: new Set(l.words.map((x) => String(x).toLowerCase().replace(/_/g, ' '))) });
    for (const p of w.patterns) {
      const slotCls = {}; for (const m of String(p.match ?? '').matchAll(/\{(\w+):([\w.]+)\??\}/g)) slotCls[m[1]] = m[2];
      for (const sig of emitOps(p.emit ?? '')) {
        const type = sig.op.startsWith('?') ? sig.op.slice(1) : sig.op;
        for (const m of String(p.emit).matchAll(/([A-Za-z_][\w.-]*)="?\{(\w+)\}/g)) {
          const cls = slotCls[m[2]]; if (!cls || !cls.startsWith('lex.')) continue;
          const lk = cls.slice(4); if (!lexWords.has(lk) && !lexWords.has(cls)) continue;
          const key = fullKey(set, type, m[1].replace(/^where\./, type + '.').replace(new RegExp('^' + type.replace(/\./g, '\\.') + '\\.'), ''));
          const set1 = lexOf.get(sig.op + '|' + key) ?? new Set(); set1.add(lexWords.has(lk) ? lk : cls); lexOf.set(sig.op + '|' + key, set1);
        }
      }
    }
    const numeric = new Set();
    for (const k of set.legends.keys.values()) if (k.worldId === id && (k.value?.literal === 'number' || k.value === 'number')) numeric.add(k.id);
    const ctx = { id, ops, lexOf, lexWords, numeric };
    worlds.set(id, ctx); return ctx;
  };
  return { set, interp, get };
}

const toValue = (v) => (typeof v === 'string' && /[\s"]/.test(v) ? str(v) : atom(v));

export function gateOne(gc, rec) {
  if (!rec || typeof rec !== 'object') return { ok: false, reason: 'not-an-object' };
  if (typeof rec.text !== 'string' || !rec.text.trim() || typeof rec.world !== 'string' || !Array.isArray(rec.slots ?? []) || typeof rec.op !== 'string') return { ok: false, reason: 'missing-field' };
  if (rec.text.length > 400) return { ok: false, reason: 'text-too-long' };
  const w = gc.get(rec.world);
  if (!w) return { ok: false, reason: 'unknown-world' };
  const op = w.ops.get(rec.op);
  if (!op) return { ok: false, reason: 'unknown-op' };
  const seen = new Set(); const slots = [];
  for (const s of rec.slots ?? []) {
    if (!s || typeof s.key !== 'string' || s.value === undefined || s.value === null && s.text != null) return { ok: false, reason: 'bad-slot' };
    const key = s.key.replace(/^core\.request\./, '');
    if (!op.keys.has(key) && !(op.seek && key === 'seek')) return { ok: false, reason: 'unknown-key' };
    if (seen.has(key)) return { ok: false, reason: 'duplicate-key' };
    seen.add(key);
    let span = null;
    if (s.text != null) {
      if (typeof s.text !== 'string' || !s.text) return { ok: false, reason: 'bad-slot' };
      const i = rec.text.indexOf(s.text);
      if (i < 0) return { ok: false, reason: 'span-not-in-text' };
      span = [i, i + s.text.length];
    }
    let value = s.value;
    if (w.numeric.has(key) && typeof value !== 'number') { const n = Number(value); if (value === '' || Number.isNaN(n)) return { ok: false, reason: 'value-type' }; value = n; }
    if (typeof value === 'object') return { ok: false, reason: 'value-type' };
    const lex = w.lexOf.get(rec.op + '|' + key);
    // the lexicon check is for values the sentence states: an implied value (no text), the seek of a question and a constant fixed by a pattern are not lexicon words (NX3b)
    const constant = key === 'seek' || s.text == null || op.fixed[key]?.has(String(value).toLowerCase());
    if (lex && !constant && typeof value === 'string' && value !== '') {
      const v = value.toLowerCase().replace(/_/g, ' ');
      const surf = String(s.text ?? '').toLowerCase().replace(/_/g, ' ');
      const ok = [...lex].some((l) => { const lw = w.lexWords.get(l); return lw && (lw.words.has(v) || lw.words.has(stem(v)) || lw.cls === 'name' || (surf && (lw.words.has(surf) || lw.words.has(stem(surf))))); });
      if (!ok) return { ok: false, reason: 'value-not-in-lexicon' };
    }
    slots.push({ key, ask: s.ask ?? null, span, text: s.text ?? null, value });
  }
  // interpreter dry run on a fresh state
  try {
    const session = gc.interp.createSession();
    const isQ = rec.op.startsWith('?');
    const entries = [];
    if (isQ) {
      entries.push(['core.question.type', atom(rec.op.slice(1))]);
      for (const s of slots) { if (s.key === 'seek') entries.push(['core.question.seek', atom(s.value)]); else entries.push(['core.question.where.' + s.key.slice(rec.op.length), toValue(s.value)]); }
      const wire = makeWire('w1', 'core.question', entries);
      session.add([wire]); gc.interp.resolve(session, wire);
    } else if (!rec.op.includes('.') || w.ops.get(rec.op) && !gc.set.legends.hasType(rec.op)) {
      const wire = makeWire('w1', 'core.request', [['action', atom(rec.op)], ...slots.map((s) => ['arg.' + s.key.replace(/^arg\./, ''), toValue(s.value)])]);
      session.add([wire]); gc.interp.resolve(session, wire);
    } else {
      const wire = makeWire('w1', rec.op, slots.map((s) => [s.key, toValue(s.value)]));
      session.add([gc.set.legends.normalizeWire(wire).wire]);
    }
  } catch (e) { return { ok: false, reason: 'dry-run-error', detail: String(e.message).slice(0, 120) }; }
  return { ok: true, rec: { ...rec, slots } };
}

/** Gate a list; returns { accepted, dropped: Map(reason -> n) }. */
export function gateAll(gc, recs) {
  const accepted = []; const dropped = {};
  for (const r of recs) { const g = gateOne(gc, r); if (g.ok) accepted.push(g.rec); else dropped[g.reason] = (dropped[g.reason] ?? 0) + 1; }
  return { accepted, dropped };
}
