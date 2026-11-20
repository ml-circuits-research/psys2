// The translation of a std.problem model into Z3, shared by the Node provider (node/smt-z3.mjs) and the
// browser provider (browser/smt-z3.mjs, published as docs/smt-z3.mjs). It takes a Z3 Context that the caller
// created and imports nothing, so it runs wherever Z3 runs.
//
// Hard constraints are asserted, soft ones minimised (a predicate costs its weight when it fails; minimise and
// maximise cost the variable's value, align its distance times its weight), with the declared budget as Z3's
// timeout. When the hard constraints cannot hold, a plain Solver with tracked constraints names them in
// `conflict` (the unsat core): a refusal with its proof. Known binding pitfalls handled here: tracked constraints are never added to Optimize, and
// sums are built pairwise because term.add is not variadic.

const integral = (v) => [v.min, v.max, v.step ?? 1].every(Number.isInteger);
const fraction = (text) => { const [p, q] = String(text).split('/').map(Number); return q ? p / q : p; };

export async function solveWithZ3(z, model) {
  const vars = new Map(), num = (n) => (Number.isInteger(n) ? z.Int.val(n) : z.Real.val(n));
  for (const v of model.vars.values()) vars.set(v.name, integral(v) ? z.Int.const(v.name) : z.Real.const(v.name));
  const term = (t) => (t.v !== undefined ? vars.get(t.v) : num(t.n));
  // A term scaled by a fraction is real, and so is a sum with a real term (Z3 does not cast a real into an integer).
  const real = (t) => (z.isInt(t) ? z.ToReal(t) : t);
  const sum = (terms) => terms.reduce((acc, t) => acc.add(z.isInt(acc) ? t : real(t)), terms.some((t) => !z.isInt(t)) ? z.Real.val(0) : z.Int.val(0));
  const box = (name) => { const b = model.boxes.get(name); return { x: term(b.x), y: term(b.y), w: term(b.w), h: term(b.h) }; };
  const span = (name) => { const s = model.spans.get(name); return { s: term(s.start), l: term(s.length) }; };
  const apart = (p, q, g = 0) => z.Or(p.x.add(p.w).add(g).le(q.x), q.x.add(q.w).add(g).le(p.x), p.y.add(p.h).add(g).le(q.y), q.y.add(q.h).add(g).le(p.y));
  const gapOn = (a0, a1, b0, b1) => z.If(a1.le(b0), b0.sub(a1), z.If(b1.le(a0), a0.sub(b1), z.Int.val(0)));
  const scaled = (t, k) => (Number.isInteger(k) ? t.mul(num(k)) : real(t).mul(num(k)));
  // The signed distance between the aligned points of a and b; a soft align term costs its absolute value.
  const alignDistance = (c) => { const p = box(c.a), q = box(c.b), [o, e] = c.axis === 'y' ? ['y', 'h'] : ['x', 'w'];
    return real(p[o]).add(scaled(p[e], c.edge)).sub(real(q[o]).add(scaled(q[e], c.edge))); };
  const formula = (c) => {
    if (['le', 'ge', 'eq'].includes(c.predicate)) { const v = vars.get(c.a); return c.predicate === 'le' ? v.le(num(c.value)) : c.predicate === 'ge' ? v.ge(num(c.value)) : v.eq(num(c.value)); }
    if (c.predicate === 'disjoint' || c.predicate === 'within') {
      const p = span(c.a), q = span(c.b);
      return c.predicate === 'disjoint' ? z.Or(p.s.add(p.l).le(q.s), q.s.add(q.l).le(p.s)) : z.And(p.s.ge(q.s), p.s.add(p.l).le(q.s.add(q.l)));
    }
    const p = box(c.a), q = box(c.b), g = c.gap;
    const within = (d) => (g === undefined ? z.Bool.val(true) : d.le(num(g)));
    switch (c.predicate) {
      case 'inside': return z.And(p.x.ge(q.x), p.y.ge(q.y), p.x.add(p.w).le(q.x.add(q.w)), p.y.add(p.h).le(q.y.add(q.h)));
      case 'apart': return apart(p, q, g ?? 0);
      case 'near': return z.And(apart(p, q), gapOn(p.x, p.x.add(p.w), q.x, q.x.add(q.w)).le(num(g ?? 0)), gapOn(p.y, p.y.add(p.h), q.y, q.y.add(q.h)).le(num(g ?? 0)));
      case 'left': return z.And(p.x.add(p.w).le(q.x), within(q.x.sub(p.x.add(p.w))));
      case 'right': return z.And(q.x.add(q.w).le(p.x), within(p.x.sub(q.x.add(q.w))));
      case 'above': return z.And(p.y.add(p.h).le(q.y), within(q.y.sub(p.y.add(p.h))));
      case 'below': return z.And(q.y.add(q.h).le(p.y), within(p.y.sub(q.y.add(q.h))));
      case 'align': return alignDistance(c).eq(num(0));
      case 'on': { const bottom = p.y.add(p.h), twiceCentre = p.x.mul(2).add(p.w);
        return z.And(bottom.ge(q.y), real(bottom).le(real(q.y).add(scaled(q.h, c.share)).add(num(g ?? 0))), twiceCentre.ge(q.x.mul(2)), twiceCentre.le(q.x.add(q.w).mul(2))); }
      default: throw Error('unknown predicate ' + c.predicate);
    }
  };
  const domains = [...model.vars.values()].map((v) => ['domain:' + v.name, z.And(vars.get(v.name).ge(num(v.min)), vars.get(v.name).le(num(v.max)))]);
  const hard = [...domains, ...model.hard.map((c) => [c.name, formula(c)])];
  const costs = model.soft.map((c) => c.predicate === 'minimise' ? vars.get(c.a).mul(num(c.weight))
    : c.predicate === 'maximise' ? vars.get(c.a).mul(num(-c.weight))
    : c.predicate === 'align' ? (d => z.If(d.ge(num(0)), d, d.neg()).mul(num(c.weight)))(alignDistance(c))
    : z.If(formula(c), z.Int.val(0), num(c.weight)));
  const keep = model.depth === 'alternatives' ? model.count : 1, found = [], blocks = [];
  for (let k = 0; k < keep; k++) {
    const opt = new z.Optimize();
    opt.set('timeout', model.budget);
    for (const [, c] of hard) opt.add(c);
    for (const b of blocks) opt.add(b);
    if (costs.length) opt.minimize(sum(costs));
    const status = String(await opt.check());
    if (status === 'sat') {
      const m = opt.model(), assignment = {};
      for (const [name, v] of vars) assignment[name] = fraction(m.eval(v, true).toString());
      found.push({ assignment, cost: costs.length ? fraction(m.eval(sum(costs), true).toString()) : 0 });
      // Alternatives: block this assignment and ask again.
      blocks.push(z.Or(...[...vars].map(([name, v]) => v.neq(num(assignment[name])))));
      continue;
    }
    if (found.length) break;
    if (status === 'unknown') return { status: 'budget', provider: 'z3', reason: 'timeout' };
    const solver = new z.Solver();
    for (const [name, c] of hard) solver.addAndTrack(c, name);
    await solver.check();
    const core = [...(solver.unsatCore()?.values?.() ?? [])].map((t) => String(t));
    return { status: 'unsatisfiable', provider: 'z3', reason: 'hard-constraints', conflict: core };
  }
  return { status: 'solved', provider: 'z3', cost: found[0].cost, assignment: found[0].assignment, alternatives: found.slice(1) };
}
