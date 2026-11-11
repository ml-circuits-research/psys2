// SPDX-License-Identifier: AGPL-3.0-only
// kids.shapes on the matrix reasoner (spec 15). The rules (round or flat, from the sides and corners) are in matrix.sop; this file only finds the words around
// what the library answered (`voice`): the sentence of a shape's summary and the reason of an explicit "no". Browser-safe; it imports its sibling ops.mjs.
import { summaryWords } from './ops.mjs?v=9a3fa62848';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const tok = (w, k) => (w?.attrs?.[k] ?? []).map(un);
const num = (ws, k) => { const t = ws.flatMap((w) => tok(w, k)).find((v) => v !== undefined && v !== ''); return t === undefined ? undefined : Number(t); };

/**
 * `ctx`: { type, where, env, find }. A shape's summary is worded from the wires of that name (the first sides and the first corners, as ops.mjs does); the
 * reason an explicit "no" was stated (`because`) goes on the answer as its note.
 */
export function voice({ type, where, env, find }) {
  if (env.status !== 'supported') return null;
  if (type === 'kids.shapes.shape' && where.name && (env.value === 'flat' || env.value === 'round')) {   // the summary (the sides and the corners answer with numbers)
    const ws = find('kids.shapes.shape').filter((w) => tok(w, 'name').includes(where.name));
    return { value: summaryWords(num(ws, 'sides'), num(ws, 'corners')) };
  }
  if (type === 'kids.shapes.family' && String(env.value) === 'false') {
    const ws = find('kids.shapes.family').filter((w) => tok(w, 'shape').includes(where.shape) && tok(w, 'kind').includes(where.kind) && tok(w, 'holds')[0] === 'false');
    const because = ws.flatMap((w) => tok(w, 'because')).find(Boolean);
    return because ? { note: because } : null;
  }
  return null;
}
