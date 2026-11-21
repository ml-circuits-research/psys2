// SPDX-License-Identifier: AGPL-3.0-only
// Concept binding for the domain-general semantic frame (specs/semantic-frame.md). The capability table the library's
// bindFrame reads is assembled here from declarations only:
//   - operations, parameters and repeats: the live tool interface (host.capabilityFacts, native-interface.sop);
//   - kinds: the exported kind bindings (bindings.kinds: lemma -> canonical kind -> the family's make operation);
//   - concept rows: every exported property binding (bindings.properties: inventory descriptor -> host source type and
//     parameter), named by the frame concept of its inventory concept (training/sop-bert/frame/concept-roles.json),
//     and spelled in the request by its own canonical concept. One row per (concept, source type) is the whole cost
//     of "colour in a new tab";
//   - placement: the source types of an area whose spatial relation concept is bound (the placement compiler);
//   - amounts (k.expect.amount), comparative steps and act forms from the execution knowledge and policy.
// Nothing here names a word, a sentence or a tool. Not wired into the app route: the reader does not yet emit frames.
// The library functions are passed in (lib) until the vendored library includes src/semantic-frame.mjs.
import { parse, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=935d4d1757';

const take = (wire, key) => { const v = wire?.attrs?.[key]?.[0]; return v === undefined ? undefined : str(v); };

/** The frame concept of an inventory concept: concept-roles `as`, else the concept itself; tool parameters have none. */
export function frameConceptOf(roles, descriptor) {
  const spec = roles.roles?.[descriptor?.concept];
  if (!spec || spec.tool) return null;
  if (spec.keyQualifies) return descriptor.key;
  if (descriptor.concept === 'reference') return descriptor.key;
  const role = spec.byKey?.[descriptor.key] ?? spec.byType?.[descriptor.type] ?? spec.role;
  return { role, concept: spec.as ?? descriptor.concept };
}

/** Concept rows {concept, on, parameter, canonical, key, role} of one reader area, from the exported property bindings. */
export function frameConceptRows(bindings, area, roles) {
  const rows = [];
  for (const row of bindings.properties ?? []) {
    const d = row.rawDescriptor ?? {};
    if (row.area !== area) continue;
    const named = frameConceptOf(roles, d);
    if (!named || typeof named === 'string') {
      if (typeof named === 'string' && row.hostBinding?.sourceType) rows.push({ concept: named, on: row.hostBinding.sourceType, parameter: row.hostBinding.parameter, canonical: row.canonical, key: d.type + '.' + d.key, role: 'attribute' });
      continue;
    }
    if (row.hostBinding?.sourceType) rows.push({ concept: named.concept, on: row.hostBinding.sourceType, parameter: row.hostBinding.parameter, canonical: row.canonical, key: d.type + '.' + d.key, role: named.role });
  }
  return rows;
}

/** The bindFrame table of one area host: declarations of the live tool interface plus the exported bindings. */
export function frameTable({ bindings, area, host, roles, amounts = [], comparatives = [], actForms = [], names = [] }) {
  const scope = '$frame.scope';
  const facts = host.capabilityFacts(scope).filter((w) => w.type.startsWith('std.capability.'));
  const ops = facts.filter((w) => w.type === 'std.capability.operation');
  const params = facts.filter((w) => w.type === 'std.capability.parameter');
  const operations = ops.map((op) => ({ name: take(op, 'name'), act: take(op, 'act'), on: take(op, 'on'),
    parameters: params.filter((p) => p.attrs.operation?.[0] === '$' + op.id).map((p) => take(p, 'name')) }));
  const byName = new Map(operations.map((op) => [op.name, op]));
  const kinds = (bindings.kinds ?? []).filter((k) => k.area === area && k.nativeFamilyBinding && byName.has(k.nativeFamilyBinding.operation))
    .map((k) => ({ label: k.lemma, canonical: k.canonical, on: byName.get(k.nativeFamilyBinding.operation).on, type: k.type }));
  const declared = facts.filter((w) => w.type === 'std.capability.property' && take(w, 'concept') && take(w, 'parameter'))
    .map((w) => ({ concept: take(w, 'concept'), on: take(w, 'on'), parameter: take(w, 'parameter'), canonical: take(w, 'concept') }));
  const properties = [...declared, ...frameConceptRows(bindings, area, roles)].filter((r) => byName.size === 0 || operations.some((op) => op.on === r.on));
  // A spatial relation is taken by the placement compiler where the area binds its relation concept (declared, not per tool).
  const relationRow = (bindings.properties ?? []).find((r) => r.area === area && r.rawDescriptor?.concept === 'spatial_relation');
  const relations = relationRow ? [...new Set(kinds.map((k) => k.on))] : [];
  const repeats = facts.filter((w) => w.type === 'std.capability.repeat').map((r) => ({ on: take(r, 'on'), act: take(r, 'act'), concept: take(r, 'concept'), max: Number(take(r, 'max')) }));
  const observation = host.observe();
  const objects = observation.objects.map((o, i) => ({ id: String(o.id), kind: o.kind, name: names[i]?.name, on: o.sourceType }));
  const relationValues = relationRow?.projection?.values ? { ...relationRow.projection.values } : undefined;
  return { operations, kinds, properties, relations, relationValues, repeats, objects, amounts, comparatives, actForms,
    concepts: { ...(relationRow ? { relation: relationRow.canonical } : {}) } };
}

const PLACEMENT_ROLES = new Set(['spatial', 'region', 'distance', 'motion', 'manner']);

/**
 * Compile a frame for execution with partial execution: the bound roles as request graphs (the contract of the vendored
 * library), every unbound role disclosed, and per entry the fallbacks the host may need (without placement/motion
 * roles, then the theme alone), each naming what it drops.
 */
export function compileFrame(frame, table, lib) {
  const done = lib.completeFragment(frame);
  const binding = lib.bindFrame(done, table);
  const out = lib.frameToRequests(done, { binding, extended: false });
  const without = (test, reason) => {
    const reduced = structuredClone(binding);
    for (const c of reduced.clauses) for (const r of c.roles) if (r.bound && test(r)) { delete r.bound; r.unbound = reason; }
    return lib.frameToRequests(done, { binding: reduced, extended: false }).entries;
  };
  // A new thing whose placement and attributes cannot compile together (the placement compiler takes relations and a
  // count only): make it placed, then change the made thing's attributes in a second request.
  const follow = { ...done, clauses: done.clauses.map((c) => ({ ...c, action: { ...c.action, act: 'change' }, spatial: [], motion: [], manner: [],
    mentions: (c.mentions || []).map((m) => (m.role || 'theme') === 'theme' && (m.reference ?? 'new') === 'new' ? { ...m, reference: 'description', determiner: 'definite', quantity: undefined } : m) })) };
  const followEntries = lib.frameToRequests(follow, { binding: lib.bindFrame(follow, table), extended: false }).entries
    .filter((e) => /operator=/.test(e.wires));
  const placed = without((r) => r.role === 'attribute' || r.role === 'goal', 'moved-to-follow-up');
  const steps = [
    { dropped: 'split', entries: placed.map((e) => ({ ...e, wires: [e.wires, followEntries.find((f) => f.id === e.id)?.wires].filter(Boolean) })) },
    { dropped: 'placement', entries: without((r) => PLACEMENT_ROLES.has(r.role), 'refused-by-host') },
    { dropped: 'all-but-theme', entries: without((r) => r.role !== 'theme' && r.role !== 'quantity', 'refused-by-host') },
  ];
  for (const c of binding.clauses) for (const [i, r] of c.resolved.entries()) for (const kind of (r.ambiguous ?? []).slice(1, 4)) {
    const alt = structuredClone(done);
    alt.clauses[c.clause].mentions[i].kind = kind;
    steps.push({ dropped: 'kind:' + kind, entries: lib.frameToRequests(alt, { binding: lib.bindFrame(alt, table), extended: false }).entries });
  }
  const entries = out.entries.map((e) => ({ ...e, fallbacks: steps.map((s) => ({ dropped: s.dropped, wires: s.entries.find((x) => x.id === e.id)?.wires }))
    .filter((f) => f.wires && f.wires !== e.wires && !(Array.isArray(f.wires) && f.wires.length < 2)).filter((f, i, all) => all.findIndex((g) => String(g.wires) === String(f.wires)) === i) }));
  return { entries, disclosed: out.disclosed, notes: out.notes, binding };
}

/** Read an authored request back (for traces): the operation-free summary of its constraints. */
export function summarizeRequest(wires) {
  return serialize(parse(wires).filter((w) => w.type === 'std.request.constraint'));
}
