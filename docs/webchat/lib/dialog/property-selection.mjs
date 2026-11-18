// Application bindings resolve names; library guards evaluate exact native equality.
import { projectTemplates, quote, str } from '../vendor/sopworld/sopworld.mjs?v=d762ac1a79';

export function resolvePropertyValue(source, area, binding, semanticValue) {
  const facts = [];
  for (const fact of source.ofType(binding.valueType)) {
    if (!(fact.attrs[binding.nameKey] || []).some(value => str(value) === semanticValue)) continue;
    for (const value of fact.attrs[binding.valueKey] || []) {
      const native = area.normalize(str(value), binding);
      if (native !== null) facts.push({ id: fact.id, type: fact.type, native });
    }
  }
  const values = [...new Set(facts.map(fact => fact.native))];
  return { ok: values.length === 1, values, facts };
}

/** Unknown native overrides cannot establish either equality or inequality. */
export function selectPropertyObject(observation, { kind, selector, binding, resolved }, options = {}) {
  const considered = [], jobs = [];
  if (!observation?.complete || !Array.isArray(observation.objects)) return { ok: false, reason: 'incomplete-observation', considered };
  for (const object of observation.objects) {
    if (object.kind !== kind) continue;
    const record = { id: object.id, kind: object.kind, status: selector ? 'unknown' : 'match' };
    considered.push(record);
    if (!selector) continue;
    const inputs = object.inputs.filter(input => input.binding === binding.id);
    record.inputs = structuredClone(inputs);
    if (inputs.length !== 1 || inputs[0].key !== binding.key || inputs[0].sourceType !== binding.sourceType
      || inputs[0].version !== observation.version || inputs[0].values.length !== 1) {
      record.reason = 'missing-or-incompatible-observation'; continue;
    }
    // Equality is native equality. Named legacy overrides are not exact RGB observations.
    const native = binding && options.normalize(str(inputs[0].values[0]), binding);
    if (native === null || !resolved?.ok) { record.reason = 'unresolved-native-value'; continue; }
    record.expected = [quote(resolved.values[0])];
    record.observed = [quote(native)];
    jobs.push({ template: 'equal', context: { observed: record.observed, expected: record.expected, candidate: considered.length - 1 } });
  }
  const evaluation = projectTemplates(jobs, {
    templates: { equal: { $get: ['candidate'] } },
    guards: { equal: [{ left: { $get: ['observed'] }, right: { $get: ['expected'] } }] },
    ...(options.budget === undefined ? {} : { budget: options.budget }),
  });
  for (const candidate of evaluation.candidates) considered[candidate.value].status = 'match';
  for (const failure of evaluation.failures) {
    const index = jobs[failure.index]?.context.candidate;
    if (index === undefined) continue;
    considered[index].reason = failure.reason;
    if (failure.reason === 'guard-rejected') considered[index].status = 'mismatch';
  }
  const matches = considered.filter(item => item.status === 'match');
  const unknown = considered.some(item => item.status === 'unknown');
  const ok = !evaluation.truncated && !unknown && matches.length === 1;
  return { ok, reason: ok ? 'unique' : evaluation.truncated ? 'budget' : unknown ? 'unknown' : matches.length ? 'ambiguous' : 'missing',
    ...(ok ? { object: observation.objects.find(object => object.id === matches[0].id) } : {}),
    coverage: { instanceId: observation.instanceId, version: observation.version, scope: observation.scope, complete: observation.complete },
    selector: selector ?? null, binding: binding?.id ?? null, mapping: resolved ? structuredClone(resolved) : null, considered, evaluation };
}
