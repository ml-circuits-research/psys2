// The translation of a std.problem model into Z3, shared by the Node provider (node/smt-z3.mjs) and the
// browser provider (browser/smt-z3.mjs, published as docs/smt-z3.mjs). It takes a Z3 Context that the caller
// created and imports nothing, so it runs wherever Z3 runs.
//
// Hard constraints are asserted, soft ones minimised (a predicate costs its weight when it fails; minimise and
// maximise cost the variable's value, align its distance times its weight), with the declared budget as Z3's
// timeout. Integer and real terms mix freely (each operation lifts to reals unless both sides are integers). When the hard constraints cannot hold, a plain Solver with tracked constraints names them in
// `conflict` (the unsat core): a refusal with its proof. Known binding pitfalls handled here: tracked constraints are never added to Optimize, and
// sums are built pairwise because term.add is not variadic.

const integral = (v) => [v.min, v.max, v.step ?? 1].every(Number.isInteger);
const fraction = (text) => { const [p, q] = String(text).split('/').map(Number); return q ? p / q : p; };
// A numeral of the model: asString() is "p" or "p/q" (toString() prints a real as an s-expression, "(/ 3135.0 4.0)").
const value = (e) => fraction(typeof e.asString === 'function' ? e.asString() : e.toString());

export async function solveWithZ3(z, model) {
  const vars = new Map(), num = (n) => (Number.isInteger(n) ? z.Int.val(n) : z.Real.val(n));
  for (const v of model.vars.values()) vars.set(v.name, integral(v) ? z.Int.const(v.name) : z.Real.const(v.name));
  const term = (t) => (t.v !== undefined ? vars.get(t.v) : num(t.n));
  // Mixed arithmetic: a model may hold integer and real terms side by side (a subject drawn smaller to fit, a
  // region with fractional bounds, a real weight). Z3 does not cast a real into an integer, so every operation
  // lifts both operands to reals unless both are integers. Plain numbers are accepted as operands.
  const lift = (t) => (typeof t === 'number' ? num(t) : t);
  const real = (t) => (z.isInt(t = lift(t)) ? z.ToReal(t) : t);
  const pair = (a, b) => { a = lift(a); b = lift(b); return z.isInt(a) && z.isInt(b) ? [a, b] : [real(a), real(b)]; };
  const op = (name) => (a, b) => { const [x, y] = pair(a, b); return x[name](y); };
  const add = op('add'), sub = op('sub'), mul = op('mul'), le = op('le'), ge = op('ge'), eq = op('eq'), neq = op('neq');
  const ite = (c, a, b) => { const [x, y] = pair(a, b); return z.If(c, x, y); };
  const sum = (terms) => terms.reduce((acc, t) => add(acc, t), z.Int.val(0));
  const box = (name) => { const b = model.boxes.get(name); return { x: term(b.x), y: term(b.y), w: term(b.w), h: term(b.h) }; };
  const span = (name) => { const s = model.spans.get(name); return { s: term(s.start), l: term(s.length) }; };
  const end = (p, o, e) => add(p[o], p[e]);
  const apart = (p, q, g = 0) => z.Or(le(add(end(p, 'x', 'w'), g), q.x), le(add(end(q, 'x', 'w'), g), p.x), le(add(end(p, 'y', 'h'), g), q.y), le(add(end(q, 'y', 'h'), g), p.y));
  const gapOn = (a0, a1, b0, b1) => ite(le(a1, b0), sub(b0, a1), ite(le(b1, a0), sub(a0, b1), 0));
  // The signed distance between the aligned points of a and b; a soft align term costs its absolute value.
  const alignDistance = (c) => { const p = box(c.a), q = box(c.b), [o, e] = c.axis === 'y' ? ['y', 'h'] : ['x', 'w'];
    return sub(add(p[o], mul(p[e], c.edge)), add(q[o], mul(q[e], c.edge))); };
  const formula = (c) => {
    if (['le', 'ge', 'eq'].includes(c.predicate)) { const v = vars.get(c.a); return c.predicate === 'le' ? le(v, c.value) : c.predicate === 'ge' ? ge(v, c.value) : eq(v, c.value); }
    if (c.predicate === 'disjoint' || c.predicate === 'within') {
      const p = span(c.a), q = span(c.b);
      return c.predicate === 'disjoint' ? z.Or(le(add(p.s, p.l), q.s), le(add(q.s, q.l), p.s)) : z.And(ge(p.s, q.s), le(add(p.s, p.l), add(q.s, q.l)));
    }
    const p = box(c.a), q = box(c.b), g = c.gap;
    const within = (d) => (g === undefined ? z.Bool.val(true) : le(d, g));
    switch (c.predicate) {
      case 'inside': return z.And(ge(p.x, q.x), ge(p.y, q.y), le(end(p, 'x', 'w'), end(q, 'x', 'w')), le(end(p, 'y', 'h'), end(q, 'y', 'h')));
      case 'outside': return z.Not(z.And(ge(p.x, q.x), ge(p.y, q.y), le(end(p, 'x', 'w'), end(q, 'x', 'w')), le(end(p, 'y', 'h'), end(q, 'y', 'h'))));
      case 'apart': return apart(p, q, g ?? 0);
      case 'near': return z.And(apart(p, q), le(gapOn(p.x, end(p, 'x', 'w'), q.x, end(q, 'x', 'w')), g ?? 0), le(gapOn(p.y, end(p, 'y', 'h'), q.y, end(q, 'y', 'h')), g ?? 0));
      case 'left': return z.And(le(end(p, 'x', 'w'), q.x), within(sub(q.x, end(p, 'x', 'w'))));
      case 'right': return z.And(le(end(q, 'x', 'w'), p.x), within(sub(p.x, end(q, 'x', 'w'))));
      case 'above': return z.And(le(end(p, 'y', 'h'), q.y), within(sub(q.y, end(p, 'y', 'h'))));
      case 'below': return z.And(le(end(q, 'y', 'h'), p.y), within(sub(p.y, end(q, 'y', 'h'))));
      case 'align': return eq(alignDistance(c), 0);
      case 'on': { const bottom = end(p, 'y', 'h'), twiceCentre = add(mul(p.x, 2), p.w);
        return z.And(ge(bottom, q.y), le(bottom, add(add(q.y, mul(q.h, c.share)), g ?? 0)), ge(twiceCentre, mul(q.x, 2)), le(twiceCentre, mul(end(q, 'x', 'w'), 2))); }
      default: throw Error('unknown predicate ' + c.predicate);
    }
  };
  const domains = [...model.vars.values()].map((v) => ['domain:' + v.name, z.And(ge(vars.get(v.name), v.min), le(vars.get(v.name), v.max))]);
  const hard = [...domains, ...model.hard.map((c) => [c.name, formula(c)])];
  const costs = model.soft.map((c) => c.predicate === 'minimise' ? mul(vars.get(c.a), c.weight)
    : c.predicate === 'maximise' ? mul(vars.get(c.a), -c.weight)
    : c.predicate === 'align' ? (d => mul(ite(ge(d, 0), d, d.neg()), c.weight))(alignDistance(c))
    : ite(formula(c), 0, c.weight));
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
      for (const [name, v] of vars) assignment[name] = value(m.eval(v, true));
      found.push({ assignment, cost: costs.length ? value(m.eval(sum(costs), true)) : 0 });
      // Alternatives: block this assignment and ask again.
      blocks.push(z.Or(...[...vars].map(([name, v]) => neq(v, assignment[name]))));
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
