// Reply facts of kids.arith in matrix mode (spec 15). The matrix (matrix.sop) says who has how many, who has most and what cannot be; this file only
// finds the words around those numbers (who "has" and who "have", "against", "more" or "fewer", "about") and hands them to the unchanged templates as
// `note`, `unit` and `status`, exactly as ops.mjs did. Browser-safe: no imports.

const K = (s) => 'kids.arith.' + s;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (item, n) => {
  const w = String(item).replace(/_/g, ' ');
  if (n === 1) return w;
  return /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(w) ? w + 'es' : w + 's';
};
const subject = (ctx, id) => (id === 'e.user' ? 'you' : ctx.name(id));
const verbHas = (id) => (id === 'e.user' ? 'have' : 'has');
const round10 = (x) => Math.round(x * 1e10) / 1e10;
/** The count of one person, or undefined when it is not known. */
const count = ({ query }, owner, item) => { const r = query({ type: K('holding'), seek: 'count', where: { owner: `$${owner}`, item } }); return r.status === 'supported' ? Number(r.value) : undefined; };

/** a/b as an exact decimal when it terminates. */
function terminates(a, b) {
  const scale = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const k = Math.max(scale(a), scale(b));
  const num = Math.round(Math.abs(a) * 10 ** k);
  let den = Math.round(Math.abs(b) * 10 ** k);
  const gcd = (x, y) => (y ? gcd(y, x % y) : x); // bounded: Euclid: the second argument strictly decreases to 0
  den /= gcd(num, den) || 1;
  while (den % 2 === 0) den /= 2; // bounded: den halves each pass (a positive integer)
  while (den % 5 === 0) den /= 5; // bounded: den is divided by 5 each pass (a positive integer)
  return den === 1;
}

export function voice(ctx) {
  const { type, where, env } = ctx;
  const ok = env.status === 'supported';
  const { item, who1, who2 } = where;
  switch (type) {
    case K('leader'): {
      if (!ok) return {};
      if (!(who1 && who2)) return { note: String(count(ctx, env.value, item)) };
      return { note: [who1, who2].map((id) => count(ctx, id, item)).join(' against ') };
    }
    case K('gap'): {
      if (!ok) return {};
      const d = round10(count(ctx, who1, item) - count(ctx, who2, item));
      return { value: String(Math.abs(d)), unit: d < 0 ? 'fewer' : 'more' };
    }
    case K('verdict'): {
      if (!ok) return {};
      const part = (id) => `${subject(ctx, id)} ${verbHas(id)} ${count(ctx, id, item)}`;
      return { note: cap(`${part(who1)} and ${part(who2)}`) };
    }
    case K('has'): {
      if (!ok) return {};
      const n = count(ctx, where.owner, item), who = subject(ctx, where.owner);
      return { note: n === 0 ? `${who} ${verbHas(where.owner)} no ${plural(item, 2)}` : `${who} ${verbHas(where.owner)} ${n} ${plural(item, n)}` };
    }
    case K('calc'): {
      // the library calculates; two edge conventions of the old operation are kept here (see the workaround list in worker-log): no answer when dividing by zero, "about" for a rounded quotient
      if (where.op === 'divided_by' && Number(where.b) === 0 && where.c === undefined) return { status: 'unsupported', note: 'Dividing by zero has no answer, because nothing can be shared among zero.' };
      if (ok && where.op === 'divided_by' && where.c === undefined && !terminates(Number(where.a), Number(where.b))) return { value: String(Math.round(Number(where.a) / Number(where.b) * 100) / 100), note: 'about ' };
      return {};
    }
    default: return {};
  }
}
