// SPDX-License-Identifier: AGPL-3.0-only
// Operations of calc.arith (kids plan, ADR-011; Q18 K4): arithmetic over numbers with the catalog's words of arithmetic (w.lang.en shard arithmetic: each word names the
// core.calc builtin it means, and a factor for "double", "half of") and the library's builtins (add, sub, mul, div). The reply names the operation by the catalog's first
// infix word of its function ("7 plus 5 is 12."). No operator word is listed in this file. Browser-safe.
import { builtins } from '../../lib/vendor/sopworld/sopworld.mjs?v=c75044ce3c';
import { CALC_WORDS } from '../../lib/knowledge/calc-words.generated.mjs?v=3038efb1d8';
import { parseNumberRun } from '../../lib/formalizer/rules/numbers.mjs?v=e8a1f00976';

export function initialState() { return {}; }

const low = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').trim();
const OPS = CALC_WORDS.filter((w) => w.kind === 'operator');
const wordOf = (op, form) => OPS.find((w) => low(w.text) === low(op) && (!form || w.form === form)) ?? OPS.find((w) => low(w.text) === low(op));
/** The catalog's first infix word of a function: how the reply names it ("plus", "minus", "times", "divided by"). */
const said = (calc) => OPS.find((w) => w.form === 'infix' && w.calc === calc && !w.factor)?.text ?? calc;
/** A number slot's text as a number: digits, or number words ("twenty", "one hundred and five") read by the formalizer's number reader. */
const num = (v) => { if (v === undefined || v === null || v === '') return NaN; const n = Number(v); if (Number.isFinite(n)) return n; const ws = low(v).split(/\s+/), r = parseNumberRun(ws, 0); return r && r.length === ws.length ? r.value : NaN; };
const show = (x) => { const n = Number(x); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** calc.compute: an infix ("3 plus 4"), a prefix with a factor ("double 6", "half of 10") or a split verb ("share 12 between 3", "subtract 4 from 10"), by the library's builtins. */
export function compute(ctx, { form, op, number, other } = {}) {
  const w = wordOf(op, form);
  const a = num(number), b = num(other);
  if (!w || !builtins[w.calc]) return { status: 'unsupported', note: `I do not know how to work out "${op}".` };
  let cannot = null;
  const world = { cannot: (m) => { cannot = m; } };
  if (form === 'prefix' || w.form === 'prefix') {
    if (!Number.isFinite(a)) return { status: 'missing', note: 'Which number?' };
    const v = Number(builtins[w.calc]([a, w.factor ?? 1], world));
    // named by the fullest prefix word of the same factor ("half 12" is said "Half of 12")
    const name = OPS.filter((x) => x.form === 'prefix' && x.calc === w.calc && x.factor === w.factor).reduce((m, x) => (x.text.length > m.length ? x.text : m), w.text);
    return { status: 'supported', value: `${cap(name)} ${show(a)} is ${show(v)}.`, answer: v };
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { status: 'missing', note: 'Which numbers?' };
  // a split verb whose marker is "from" names the second number first ("subtract 4 from 10" is 10 minus 4)
  const [x, y] = w.form === 'split' && w.calc === 'sub' && w.markers.includes('from') ? [b, a] : [a, b];
  const r = builtins[w.calc]([x, y], world), v = r === undefined || r === null ? NaN : Number(r);
  if (!Number.isFinite(v)) return { status: 'conflicting', note: cannot === 'division by zero' ? 'Dividing by zero has no answer.' : `I cannot work that out${cannot ? `: ${cannot}` : ''}.` };
  const exact = Number.isInteger(v) || Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
  return { status: 'supported', value: `${show(x)} ${said(w.calc)} ${show(y)} is ${exact ? '' : 'about '}${show(Number(v))}.`, answer: Number(v) };
}
