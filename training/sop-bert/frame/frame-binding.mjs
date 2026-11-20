// Oracle-study tools around src/dialog/frame-binding.mjs: the frame plan (partial execution) and the tool-key plan
// (what a perfect reader of the official labels could say, and what the deployed bindings would refuse).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export async function frameTools({ bindings, root, library = path.resolve(root, '../soplang-words-lib/src/index.mjs') }) {
  const lib = await import(library);
  const P = (rel) => path.join(root, rel);
  const { frameTable, compileFrame, frameConceptOf } = await import(P('src/dialog/frame-binding.mjs'));
  const { declaredKnowledge } = await import(P('src/dialog/declared-execution.mjs'));
  const { amountsOf } = await import(P('src/dialog/quantity-projection.mjs'));
  const { comparativeSteps } = await import(P('src/dialog/comparative-projection.mjs'));
  const { executionPolicyWorld } = await import(P('src/dialog/execution-policy.mjs'));
  const { observedReaderContext } = await import(P('src/dialog/native-reader-context.mjs'));
  const { str } = await import(P('src/vendor/sopworld/sopworld.mjs'));
  const roles = JSON.parse(readFileSync(new URL('./concept-roles.json', import.meta.url)));
  const inventory = JSON.parse(readFileSync(P('official-dataset/inventory.json')));
  const amounts = amountsOf(declaredKnowledge('k.expect.amount'));
  const comparatives = comparativeSteps();
  const actForms = executionPolicyWorld().ofType('app.execution.actForm').map((w) => ({ act: str(w.attrs.act[0]), mode: str(w.attrs.mode[0]), as: str(w.attrs.as[0]) }));
  const boundKeys = new Set((bindings.properties ?? []).map((r) => r.area + ':' + r.key));

  // inventory keys by frame role: which (role, concept) the official labels can say in an area, and whether bound
  const keyIndex = new Map();
  for (const [area, types] of Object.entries(inventory)) for (const [type, t] of Object.entries(types)) for (const [key, k] of Object.entries(t.keys ?? {})) {
    const named = frameConceptOf(roles, { ...k, type, key });
    if (!named) continue;
    const { role, concept } = typeof named === 'string' ? { role: 'attribute', concept: named } : named;
    const id = `${area}|${role}|${role === 'attribute' || role === 'goal' ? concept : ''}`;
    if (!keyIndex.has(id)) keyIndex.set(id, []);
    keyIndex.get(id).push({ key: `${type}.${key}`, bound: boundKeys.has(area + ':' + `${type}.${key}`) });
  }
  const keysFor = (area, role, concept) => {
    const map = { attribute: ['attribute', 'goal'], goal: ['goal', 'attribute'], spatial: ['spatial.relation'], region: ['spatial.region'], distance: ['spatial.distance'],
      motion: ['motion.direction'], manner: ['manner'], possessor: ['possessor'], time: ['time.start', 'time.day', 'time.end', 'time.duration'] }[role];
    if (!map) return null; // theme, quantity, question: always sayable in the official request format
    return map.flatMap((r) => keyIndex.get(`${area}|${r}|${r === 'attribute' || r === 'goal' ? concept : ''}`) ?? []);
  };
  const conceptOf = (role, frame) => {
    const clause = frame.clauses[role.clause];
    if (role.role === 'attribute') return clause.attributes[role.index].concept;
    if (role.role === 'goal') return clause.goal[role.index].concept;
    return undefined;
  };

  return {
    lib,
    table(area, host) {
      const observation = host.observe();
      const names = observedReaderContext(area, observation).context.existing;
      return frameTable({ bindings, area, host, roles, amounts, comparatives, actForms, names });
    },
    framePlan(area, frame, table) {
      if (!frame) return { entries: [], disclosed: [{ role: 'frame', reason: 'no-frame' }] };
      return compileFrame(frame, table, lib);
    },
    keyPlan(area, frame, table) {
      if (!frame) return { entries: [], disclosed: [], refused: [] };
      const done = lib.completeFragment(frame);
      const binding = lib.bindFrame(done, table);
      const refusedClauses = new Set(), refused = [], dropped = [];
      for (const c of binding.clauses) for (const r of c.roles) {
        if (r.role === 'modifier') { delete r.bound; r.unbound = 'no-key'; dropped.push({ clause: c.clause, role: r.role }); continue; }
        const keys = keysFor(area, r.role, conceptOf({ ...r, clause: c.clause }, done));
        if (keys === null) continue;
        if (!keys.length) { delete r.bound; r.unbound = 'no-key'; dropped.push({ clause: c.clause, role: r.role, concept: r.concept }); continue; }
        if (!keys.some((k) => k.bound)) { refusedClauses.add(c.clause); refused.push({ clause: c.clause, role: r.role, keys: keys.map((k) => k.key), reason: 'unresolved-canonical-property-binding' }); continue; }
        // a bound key the bridge emits even where no concept row takes it: the compiler then sees the constraint
        if (r.unbound && r.unbound !== 'theme-unbound') { r.bound = { key: true }; delete r.unbound; }
      }
      const out = lib.frameToRequests(done, { binding, extended: false });
      const entries = out.entries.filter((e) => !refusedClauses.has(Number(e.id.slice(1).split('.')[0])));
      return { entries, disclosed: [], dropped, refused };
    },
  };
}
