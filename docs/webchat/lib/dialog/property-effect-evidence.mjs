// Retain an observed equality effect as a replayable SOP assessment.
import { World, assessPropertyChange, parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import { budget } from './budget.mjs?v=00bce6e369';
import SOURCE from './new-engine-source.mjs?v=5459bbf1ab';

const attr = (wire, key) => wire?.attrs[key]?.[0];
const fact = (id, type, fields) => ({ id, type, attrs: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, [].concat(value)])) });
const traceInput = (id, observation) => fact(id, 'std.trace.input', {
  source: quote(observation.source), version: quote(observation.version), 'source.type': observation.sourceType,
  key: observation.key, values: quote(JSON.stringify(observation.values)),
});

export function retainPropertyEffect(session, { candidate, text, view, plan, before, after, receipt, verification, message }) {
  if (plan.act !== 'change' || plan.covered?.length !== 1 || plan.skipped.length || verification.status !== 'verified') return null;
  const checks = verification.checks.filter(({ parameter }) => !parameter.startsWith('$'));
  const [check] = checks;
  if (checks.length !== 1 || !check.binding || typeof check.expected !== 'string') return null;
  const nodes = parse(candidate.wires);
  const condition = nodes.find((wire) => wire.id === plan.covered[0]);
  if (condition?.type !== 'std.request.constraint' || attr(condition, 'operator') !== 'eq') return null;
  const old = before.objects.find((object) => object.id === check.target);
  const next = after.objects.find((object) => object.id === check.target);
  const previous = old?.inputs.find((input) => input.binding === check.binding);
  const observed = next?.inputs.find((input) => input.binding === check.binding);
  if (!previous || !observed || previous.source !== observed.source) return null;
  const { invocation } = receipt;
  // Use an invocation namespace independent of the supplied graph's identifiers.
  let prefix = 'effect.';
  while (nodes.some((wire) => wire.id.startsWith(prefix))) {
    budget.tick('property.evidence.namespace');
    prefix += 'effect.';
  }
  const key = (label) => prefix + label;
  const ref = (label) => '$' + key(label);
  const request = key('request'), step = key('step'), expectation = key('expected');
  const world = new World();
  world.load(['std.request', 'std.trace', 'std.reply'].map((name) => '@' + key(name) + ' core.use world=' + name).join('\n'));
  const support = plan.knowledgeSupport ?? [];
  world.load([candidate.wires, serialize([
    fact(request, 'std.trace.request', { message: quote(text) }),
    traceInput(key('before'), previous), traceInput(key('after'), observed),
    traceInput(expectation, { source: support.join(' ') || check.binding, version: SOURCE.knowledgePin,
      sourceType: 'psys2.property.mapping', key: check.key, values: [quote(check.expected)] }),
    traceInput(key('semantic'), { source: condition.id, version: SOURCE.libraryPin,
      sourceType: condition.type, key: 'value', values: condition.attrs.value }),
    fact(step, 'std.trace.step', { operation: quote(plan.operation), 'operation.version': quote('1'), invocation: quote(invocation),
      request: ref('request'), act: plan.act, status: 'confirmed', input: [ref('before'), ref('expected'), ref('semantic')], result: ref('after') }),
    ...['before', 'after'].map((phase) => fact(key(phase + '.observation'), 'std.trace.observation', {
      step: ref('step'), invocation: quote(invocation), phase, input: ref(phase),
    })),
  ])].join('\n'));
  const result = assessPropertyChange(world, { request, step, expectation, before: key('before.observation'), after: key('after.observation'),
    source: previous.source, sourceType: previous.sourceType, key: check.key,
    owner: JSON.stringify([before.instanceId, invocation]), revision: '1' });
  if (!result.ok || !['changed', 'unchanged'].includes(result.assessment.status)) return null;
  const semantic = str(attr(condition, 'value')), concept = str(attr(condition, 'concept'));
  const said = result.assessment.status === 'changed'
    ? `Set ${concept} to ${semantic} (${check.expected}) for ${next.kind} ${next.id}.`
    : `${next.kind} ${next.id} already has the stored ${concept} ${semantic} (${check.expected}).`;
  const textReply = message ? said + ' ' + message : said;
  world.load(serialize([
    { ...result.claim, id: key('claim') },
    fact(key('reply'), 'std.trace.reply', { request: ref('request'), step: ref('step'), text: quote(textReply) }),
  ]));
  const journal = { invocation, text, area: view, libraryPin: SOURCE.libraryPin, knowledgePin: SOURCE.knowledgePin,
    reading: candidate, selection: { object: old, considered: plan.selection }, receipt, compiledSop: plan.sop, evidence: world.toJSON() };
  session.newEngineJournal = [...(session.newEngineJournal ?? []).slice(-127), structuredClone(journal)];
  return { text: textReply, assessment: result.assessment.status, journal };
}
