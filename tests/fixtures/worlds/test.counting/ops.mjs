// Operations of the test.counting fixture. Browser-safe: no imports.

/**
 * Replay holdings (absolute statements) and gives (relative events) in core.seq order.
 * A person whose starting count was never stated stays unknown, so asking about
 * them is `missing` instead of a guess.
 */
export function currentCount(ctx, { owner, item }) {
  const key = 'test.counting.holding.count';
  if (!owner || !item) return { status: 'missing', missing: [key], note: 'owner and item are needed' };
  const seq = (w) => ctx.val(w, 'core.seq') ?? -Infinity;
  const events = [
    ...ctx.find('test.counting.holding', { item }).map((w) => ({ kind: 'has', w })),
    ...ctx.find('test.counting.give', { item }).map((w) => ({ kind: 'give', w })),
  ].sort((a, b) => seq(a.w) - seq(b.w));

  const people = new Map(); // id -> { n: number | undefined, from: string[] }
  const who = (id) => { if (!people.has(id)) people.set(id, { n: undefined, from: [] }); return people.get(id); };
  for (const { kind, w } of events) {
    if (kind === 'has') {
      const p = who(ctx.val(w, 'owner'));
      p.n = ctx.val(w, 'count');
      p.from = [w.id];
    } else {
      const n = ctx.val(w, 'count');
      const giver = who(ctx.val(w, 'giver'));
      const receiver = who(ctx.val(w, 'receiver'));
      if (giver.n !== undefined) giver.n -= n;
      if (receiver.n !== undefined) receiver.n += n;
      giver.from.push(w.id);
      receiver.from.push(w.id);
    }
  }
  const p = people.get(owner);
  if (!p || p.n === undefined) {
    return { status: 'missing', missing: [key], from: p?.from, note: `the starting count of ${ctx.name(owner)} is not known` };
  }
  if (p.n < 0) return { status: 'conflicting', alternatives: [p.n], from: p.from, note: 'more was given than was had' };
  return { status: 'supported', value: p.n, from: p.from };
}
