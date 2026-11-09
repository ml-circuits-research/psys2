// SPDX-License-Identifier: AGPL-3.0-only
// NX label format helpers (training/nx/README.md). Pure functions, no node:* imports.

export const BOOKKEEPING = new Set(['core.via', 'core.source', 'core.seq', 'core.in']);
export const OP_KEYS = new Set(['core.request.action', 'core.question.type', 'core.question.seek']);
/** Keys whose value is allowed to have no span (constants of the question form). */
export const NO_SPAN_OK = new Set(['core.question.mode', 'core.question.about']);

/** Normalization shared with the protected-text filter (same as scripts/build-dataset.mjs normText). */
export const normText = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const vstr = (v) => (v == null ? '' : v.kind === 'ref' ? '$' + v.v : v.kind === 'string' ? String(v.v) : /^-?\d+(\.\d+)?$/.test(String(v.v)) ? String(Number(v.v)) : String(v.v));

/** Operation id of one wire: request:<action>, question:<type>:<seek>, or the wire type. null for entity wires. */
export function opOfWire(w) {
  if (w.type === 'core.agent') return null;
  const get = (k) => { const e = w.entries.find((x) => x.key === k); return e ? vstr(e.value) : null; };
  if (w.type === 'core.request') return `request:${get('core.request.action') ?? '?'}`;
  if (w.type === 'core.question') return `question:${get('core.question.type') ?? '?'}:${get('core.question.seek') ?? '?'}`;
  return w.type;
}

const NUMBER_WORDS = { 0: ['zero'], 1: ['one', 'a', 'an', 'single'], 2: ['two', 'couple', 'pair', 'both'], 3: ['three'], 4: ['four'], 5: ['five'], 6: ['six'], 7: ['seven'], 8: ['eight'], 9: ['nine'], 10: ['ten'], 11: ['eleven'], 12: ['twelve'], 13: ['thirteen'], 14: ['fourteen'], 15: ['fifteen'], 16: ['sixteen'], 17: ['seventeen'], 18: ['eighteen'], 19: ['nineteen'], 20: ['twenty'], 100: ['hundred'] };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Surface candidates of a canonical value string. */
export function candidatesOf(raw) {
  let v = String(raw);
  if (/^mention\(|^\$new$|^\$(?!e\.)/.test(v)) return [];
  v = v.replace(/^\$e\./, '').replace(/^\$/, '').replace(/_/g, ' ');
  const out = [v];
  const stripped = v.replace(/^(the|a|an) /i, '');
  if (stripped !== v) out.push(stripped);
  if (/^[a-z]+[A-Z]/.test(v)) out.push(v.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  if (/^[a-z]+Of$/.test(v)) out.push(v.replace(/Of$/, '').toLowerCase());
  if (/^-?\d+$/.test(v) && NUMBER_WORDS[Number(v)]) out.push(...NUMBER_WORDS[Number(v)]);
  if (/^[a-z]+$/i.test(v) && v.length > 2) { out.push(v + 's', v + 'es', v + 'ly'); if (v.endsWith('y')) out.push(v.slice(0, -1) + 'ies'); }
  if (/^[a-z]+s$/i.test(v) && v.length > 3) out.push(v.slice(0, -1));
  return out;
}

/** First whole-word, case-insensitive occurrence of `cand` in `text` that does not overlap `used`; null when none. */
export function findSpan(text, cand, used = []) {
  if (!cand) return null;
  const re = new RegExp(`(?<![A-Za-z0-9])${esc(cand)}(?![A-Za-z0-9])`, 'gi');
  for (const m of text.matchAll(re)) {
    const s = m.index, e = s + m[0].length;
    if (!used.some((u) => s < u[1] && e > u[0])) return [s, e];
  }
  return null;
}

/** Align a canonical value to a span of `text`: tries `extra` surfaces first (rules slot text, learned surfaces), then the value's own forms. */
export function alignValue(text, value, used = [], extra = []) {
  for (const c of [...extra, ...candidatesOf(value)]) {
    const sp = findSpan(text, c, used);
    if (sp) return sp;
  }
  // comma lists ("A,B,C"): every item in order, separated only by separators; the span covers the list
  if (/^[^\s,][^,]*(,[^,]+)+$/.test(String(value)) && !/^mention\(/.test(String(value))) {
    const parts = String(value).split(',').map((x) => x.trim());
    const found = [];
    let local = [...used];
    for (const part of parts) {
      const sp = findSpan(text, part, local);
      if (!sp || (found.length && sp[0] < found[found.length - 1][1])) return null;
      if (found.length && !/^[\s,;&]*(and|then|plus|with)?[\s,;&]*$/i.test(text.slice(found[found.length - 1][1], sp[0]))) return null;
      found.push(sp); local = [...local, sp];
    }
    const cover = [found[0][0], found[found.length - 1][1]];
    if (!used.some((u) => cover[0] < u[1] && cover[1] > u[0])) return cover;
  }
  return null;
}

/** A value that may legitimately have no span. */
export function noSpanOk(key, value, s) {
  return (s && s.span_source === 'dup') || NO_SPAN_OK.has(key) || /^\$/.test(value) || /^mention\(/.test(value);
}

/** Record status from its slots. */
export function statusOf(rec) {
  if (rec.op === 'none') return 'filler';
  return rec.slots.every((s) => s.span || noSpanOk(s.key, s.value, s)) ? 'complete' : 'partial';
}

/** Validate one record; returns a list of problems (empty = valid). */
export function validateRecord(r) {
  const p = [];
  for (const k of ['id', 'group', 'split', 'world', 'text', 'op', 'slots', 'status', 'label_source', 'labeler']) if (r[k] == null) p.push(`missing ${k}`);
  if (p.length) return p;
  if (!['train', 'dev', 'test', 'review'].includes(r.split)) p.push(`bad split ${r.split}`);
  if (!['complete', 'partial', 'filler'].includes(r.status)) p.push(`bad status ${r.status}`);
  if (r.op === 'none' && r.slots.length) p.push('filler with slots');
  if (r.op !== 'none' && r.status === 'filler') p.push('filler status on an operation');
  const used = [];
  for (const s of r.slots) {
    if (!s.key || s.value == null || !s.tag) p.push(`slot missing key/value/tag: ${s.key}`);
    if (s.span) {
      if (!Array.isArray(s.span) || s.span.length !== 2 || !(s.span[0] >= 0 && s.span[1] > s.span[0] && s.span[1] <= r.text.length)) p.push(`bad span ${JSON.stringify(s.span)} for ${s.key}`);
      else if (r.text.slice(s.span[0], s.span[1]) !== s.text) p.push(`span text mismatch for ${s.key}: ${JSON.stringify(r.text.slice(s.span[0], s.span[1]))} vs ${JSON.stringify(s.text)}`);
      else { if (used.some((u) => s.span[0] < u[1] && s.span[1] > u[0])) p.push(`overlapping spans (${s.key})`); used.push(s.span); }
    }
  }
  if (r.status !== statusOf(r)) p.push(`status ${r.status} does not match slots (${statusOf(r)})`);
  return p;
}

/** BIO labels (per character-word granularity is left to the trainer): returns [{start,end,tag}] of the spanned slots. */
export const tagSpans = (r) => r.slots.filter((s) => s.span).map((s) => ({ start: s.span[0], end: s.span[1], tag: s.tag }));

/** Segment spans of diagram-source wires located in text; overlapping or identical spans are merged (as scripts/convert-diagram-data.mjs). */
export function segmentsOf(text, wires) {
  const found = [];
  let from = 0;
  for (const w of wires) {
    const s = String(w.span ?? '').trim();
    if (!s) continue;
    let at = text.indexOf(s, from);
    if (at < 0) at = text.indexOf(s);
    if (at < 0) at = text.toLowerCase().indexOf(s.toLowerCase());
    if (at < 0) continue;
    found.push({ start: at, end: at + s.length, wire: w });
    from = at;
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) { last.end = Math.max(last.end, f.end); last.wires.push(f.wire); } else merged.push({ start: f.start, end: f.end, wires: [f.wire] });
  }
  return merged;
}
