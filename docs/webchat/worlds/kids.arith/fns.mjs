// Reply facts of kids.arith in matrix mode (spec 15). The matrix (matrix.sop) says who has how many, who has most and what cannot be, and puts the numbers a reply
// needs on the answer wire (`supposed`); this file only finds the words around them (who "has" and who "have", "against", "more" or "fewer", "about") and hands
// them to the unchanged templates as `note`, `unit` and `status`, exactly as ops.mjs did. Browser-safe: no imports.

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
const bare = (v) => String(v ?? '').replace(/^\$/, '');
const seqOf = (w) => Number(w.attrs['core.seq']?.[0] ?? 0);

/** a/b as an exact decimal when it terminates: the quotient rounded to ten digits gives a back (no loop: the check is arithmetic). */
const terminates = (a, b) => Math.abs(round10(a / b) * b - a) < 1e-12 * Math.max(1, Math.abs(a));

/** The events of kids.arith that take from their actor, as the words of "cannot ...". */
const TAKES = { give: 'give away', eat: 'eat', lose: 'lose', break: 'break' };
/**
 * Why a count cannot be: the soft issue the library keeps when an event takes more than the actor has ("Lily only had 3 cards, so Lily cannot give away 5."), for the
 * item asked about. The issue stands on the actor's holding; its `received` is the net change since the last statement, so what the actor had is count - received.
 */
function impossible(ctx, item) {
  for (const i of ctx.issues()) {
    const h = i.about;
    if (i.key !== 'count' || bare(h.item) !== item || h.received === undefined) continue;
    const owner = bare(h.owner), had = Number(h.count) - Number(h.received);
    const events = Object.keys(TAKES).flatMap((k) => ctx.find(K(k)).map((w) => ({ k, w })))
      .filter(({ w }) => bare(w.attrs.who?.[0]) === owner && bare(w.attrs.item?.[0]) === item);
    const last = events.sort((a, b) => seqOf(a.w) - seqOf(b.w)).at(-1);
    if (!last) continue;
    return `${cap(subject(ctx, owner))} only had ${had} ${plural(item, had)}, so ${subject(ctx, owner)} cannot ${TAKES[last.k]} ${last.w.attrs.count?.[0]}.`;
  }
  return null;
}

/** Who gave an owner everything that was added to their count while the start is unknown (" from Tom"), or '' when it was not one person or not a gift. */
function donor(ctx, owner, item) {
  const into = (kind, key) => ctx.find(K(kind)).filter((w) => bare(w.attrs[key]?.[0]) === owner && bare(w.attrs.item?.[0]) === item);
  const gifts = into('give', 'to');
  if (!gifts.length || into('receive', 'who').length || into('buy', 'who').length) return '';
  const from = new Set(gifts.map((w) => bare(w.attrs.who?.[0])));
  return from.size === 1 ? ` from ${subject(ctx, [...from][0])}` : '';
}

export function voice(ctx) {
  const { type, where, env, supposed: s } = ctx;
  const ok = env.status === 'supported';
  const { item, who1, who2 } = where;
  switch (type) {
    case K('holding'): {
      // an event that took more than the actor had is kept, flagged by the library: the question about the item is conflicting, with the reason
      const why = (env.status === 'missing' || env.status === 'conflicting') && impossible(ctx, item);
      if (why) return { status: 'conflicting', note: why };
      // only events were told (no start): the library knows the change since the last statement (`received`), and no more
      if (env.status === 'missing' && s.received !== undefined && Number(s.received) > 0) return { status: 'supported', value: s.received, unit: 'received', note: donor(ctx, bare(where.owner), item) };
      return {};
    }
    case K('leader'): {
      if (!ok && env.status !== 'ambiguous') return {};
      return { note: s.count1 !== undefined ? `${s.count1} against ${s.count2}` : String(s.count) };
    }
    case K('gap'): {
      if (!ok) return {};
      const d = Number(s.signed);
      return { value: String(Math.abs(d)), unit: d < 0 ? 'fewer' : 'more' };
    }
    case K('verdict'): {
      if (!ok) return {};
      const part = (id, n) => `${subject(ctx, id)} ${verbHas(id)} ${n}`;
      return { note: cap(`${part(who1, s.count1)} and ${part(who2, s.count2)}`) };
    }
    case K('has'): {
      if (!ok) return {};
      const n = Number(s.count), who = subject(ctx, where.owner);
      return { note: n === 0 ? `${who} ${verbHas(where.owner)} no ${plural(item, 2)}` : `${who} ${verbHas(where.owner)} ${n} ${plural(item, n)}` };
    }
    case K('calc'): {
      // the library calculates, rounds (core.precision) and says why it cannot (`why`: division by zero); the words stay here: the sentence for a zero divisor and
      // "about" for a quotient that does not come out even
      if (env.status === 'unsupported' && /zero/.test(env.why ?? '')) return { note: 'Dividing by zero has no answer, because nothing can be shared among zero.' };
      if (ok && where.op === 'divided_by' && where.c === undefined && !terminates(Number(where.a), Number(where.b))) return { note: 'about ' };
      return {};
    }
    default: return {};
  }
}

/**
 * The session state of kids.arith, derived from the library (spec 15): { holdings: { <owner>: { <item>: count | null } } }; null is a count that no statement gives
 * (only events were told). The dialogue layer snapshots and restores it; the library is the source.
 */
export function toState({ find }) {
  const un = (v) => String(v ?? '').replace(/^"|"$/g, '').replace(/^\$/, '');
  const holdings = {};
  for (const w of find(K('holding'))) {
    const n = w.attrs.count?.[0];
    (holdings[un(w.attrs.owner?.[0])] ??= {})[un(w.attrs.item?.[0])] = n === undefined ? null : Number(n);
  }
  return { holdings };
}
