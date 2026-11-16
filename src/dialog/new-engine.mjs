// Opt-in, bounded existing-object property path. Vocabulary and readings are declarations.
import { World, compileGrammarOverlay, readGrammarRequests, inspectRequest, assessPropertyChange, quote, str } from '../vendor/sopworld/sopworld.mjs';
import SOURCE from './new-engine-source.mjs';
import { NEW_ENGINE_AREAS } from './new-engine-areas.mjs';
const hosts = new WeakMap();
let grammar;
const first = (wire, key) => wire?.attrs[key]?.[0];
const line = (id, type, attrs) => `@${id} ${type} ` + Object.entries(attrs).flatMap(([key, values]) => values.map(value => `${key}=${value}`)).join(' ');
const input = (id, value) => line(id, 'std.trace.input', { source: [quote(value.source)], version: [quote(value.version)], 'source.type': [value.sourceType], key: [value.key], values: [quote(JSON.stringify(value.values))] });
const uuid = () => globalThis.crypto.randomUUID();
function reader() {
  if (!grammar) {
    const world = World.fromJSON(SOURCE.snapshot);
    const compiled = compileGrammarOverlay(world, { types: SOURCE.types });
    if (!compiled.ok) throw new Error('Declared reader could not compile');
    grammar = { world, compiled };
  }
  return grammar;
}
const messages = {
  area: 'This area does not yet support the new request path.', language: 'The new request path currently requires English input.',
  reading: 'I could not obtain one complete, unambiguous reading.', structure: 'This request needs a capability that is not yet supported.',
  target: 'I could not identify exactly one existing object.', value: 'I could not resolve one exact declared value.',
  state: 'The current state could not be observed safely.', stale: 'The state changed before this operation could be applied.',
  identity: 'This invocation identity was already used for a different request.',
  evidence: 'The operation could not be verified and was rolled back.',
};
function reply(text, supported, trace = {}) {
  return { text, parts: [{ text, translate: false }], statuses: [supported ? 'supported' : 'unsupported'], answers: [], segments: [],
    state: {}, effects: [], newEngine: true, trace: { legacy: false, engine: 'new', ...trace } };
}
const refusal = (reason, trace) => reply(`${messages[reason]} Nothing changed.`, false, { reason, ...trace });

/** The caller owns UI selection and boundary translation; this runner never invokes a legacy reader. */
export function runNewEngine(session, text, options = {}) {
  const tab = options.view ?? session.isession.state['ui.shell']?.activeTab;
  const area = NEW_ENGINE_AREAS[tab];
  if (!area) return refusal('area');
  if (options.language && options.language !== 'en') return refusal('language');
  const prior = options.invocation && (session.newEngineJournal || []).find(record => record.invocation === options.invocation);
  if (prior) {
    if (prior.text !== text || prior.area !== tab) return refusal('identity');
    return reply('This invocation was already recorded. No new operation was performed.', false,
      { replayed: true, historicalReceipt: { ...structuredClone(prior.receipt), replayed: true }, journal: structuredClone(prior) });
  }
  const { world: source, compiled } = reader();
  const reading = readGrammarRequests(source, text, { compiled, ...SOURCE.options, max: 32 });
  if (!reading.coverage?.complete || reading.candidates.length !== 1) return refusal('reading', { reading });
  const candidate = reading.candidates[0], evidence = new World();
  evidence.load('@request.module core.use world=std.request\n@trace.module core.use world=std.trace\n@reply.module core.use world=std.reply');
  if (!evidence.tell(candidate.wires).ok || !inspectRequest(evidence, candidate.request).ok) return refusal('structure');
  const request = evidence.get(candidate.request), targets = evidence.ofType('std.request.target'), conditions = evidence.ofType('std.request.constraint');
  const target = targets[0], condition = conditions[0];
  if (targets.length !== 1 || conditions.length !== 1 || first(request, 'mood') !== 'do'
    || first(request, 'root') !== '$' + condition.id || first(condition, 'target') !== '$' + target.id
    || first(target, 'mode') !== 'existing' || target.attrs.selector || target.attrs.name
    || (first(target, 'determiner') && first(target, 'determiner') !== 'definite')
    || first(condition, 'operator') !== 'eq' || first(condition, 'character') !== 'requirement' || first(condition, 'polarity') !== 'positive'
    || ['std.request.group', 'std.request.not', 'std.request.quant', 'std.request.value'].some(type => evidence.ofType(type).length)) return refusal('structure');
  const binding = area.bindings.find(item => item.act === first(request, 'act') && item.concept === first(condition, 'concept'));
  if (!binding) return refusal('structure');
  const semanticValue = str(first(condition, 'value'));
  const matches = [];
  for (const fact of source.ofType(binding.valueType)) {
    if ((fact.attrs[binding.nameKey] || []).some(value => str(value) === semanticValue)) {
      for (const value of fact.attrs[binding.valueKey] || []) {
        const native = area.normalize(str(value), binding);
        if (native !== null) matches.push({ id: fact.id, type: fact.type, native });
      }
    }
  }
  const values = [...new Set(matches.map(item => item.native))];
  if (values.length !== 1) return refusal('value');
  const state = session.isession.state[area.world];
  let host, before;
  try {
    if (!state || typeof state !== 'object') return refusal('state');
    host = hosts.get(state);
    if (!host) { host = area.createHost({ state, instanceId: uuid(), bindings: area.bindings }); hosts.set(state, host); }
    before = host.observe();
  } catch { return refusal('state'); }
  const objects = before.objects.filter(object => object.kind === str(first(target, 'kind')));
  if (!before.complete || objects.length !== 1) return refusal('target');
  const object = objects[0], nativeBefore = object.inputs.find(item => item.binding === binding.id);
  if (!nativeBefore) return refusal('state');
  const invocation = options.invocation ?? uuid(), expected = { source: JSON.stringify({ binding: binding.id, facts: matches.map(item => item.id) }), version: SOURCE.knowledgePin,
    sourceType: 'psys2.property.mapping', key: binding.key, values: [quote(values[0])] };
  const traceBase = [line('trace.request', 'std.trace.request', { message: [quote(text)] }), input('before.input', nativeBefore), input('expected.input', expected),
    input('semantic.input', { source: invocation + ':' + condition.id, version: SOURCE.libraryPin, sourceType: condition.type, key: 'value', values: condition.attrs.value })];
  const step = status => line('step', 'std.trace.step', { operation: [quote(binding.id)], 'operation.version': [quote('1')], invocation: [quote(invocation)], request: ['$trace.request'], act: [first(request, 'act')], status: [status], input: ['$before.input', '$expected.input', '$semantic.input'], ...(status === 'confirmed' ? { result: ['$after.input'] } : {}) });
  if (!evidence.tell([...traceBase, step('planned')].join('\n')).ok) return refusal('evidence');
  const original = structuredClone(state);
  let receipt;
  try {
    receipt = host.setProperty({ invocation, expectedVersion: before.version, target: object.id, concept: binding.concept, value: values[0] });
    if (receipt.status === 'refused') return refusal(receipt.reason === 'stale-observation' ? 'stale' : receipt.reason === 'invocation-reused' ? 'identity' : 'state', { receipt });
    if (receipt.replayed) return reply('This invocation was already recorded. No new operation was performed.', false, { replayed: true, historicalReceipt: receipt });
    const after = host.observe(), observed = after.objects.find(item => item.id === object.id)?.inputs.find(item => item.binding === binding.id);
    if (!observed) throw new Error('Missing post-observation');
    // Reconstruct the final evidence together, so cardinality is never silently overwritten.
    const final = new World();
    final.load('@request.module core.use world=std.request\n@trace.module core.use world=std.trace\n@reply.module core.use world=std.reply');
    const observations = ['before', 'after'].map(phase => line(phase + '.observation', 'std.trace.observation', { step: ['$step'], invocation: [quote(invocation)], phase: [phase], input: ['$' + phase + '.input'] }));
    final.load([candidate.wires, ...traceBase, input('after.input', observed), step('confirmed'), ...observations].join('\n'));
    const assessed = assessPropertyChange(final, { request: 'trace.request', step: 'step', before: 'before.observation', after: 'after.observation', expectation: 'expected.input',
      source: nativeBefore.source, sourceType: nativeBefore.sourceType, key: binding.key, owner: JSON.stringify([before.instanceId, invocation]), revision: '1' });
    if (!assessed.ok || !['changed', 'unchanged'].includes(assessed.assessment.status)) throw new Error('Unconfirmed native effect');
    final.load(line('claim', assessed.claim.type, assessed.claim.attrs));

    const said = assessed.assessment.status === 'changed'
      ? `Set ${binding.concept} to ${semanticValue} (${values[0]}) for ${object.kind} ${object.id}.`
      : `${object.kind} ${object.id} already has the stored ${binding.concept} ${semanticValue} (${values[0]}).`;
    final.load(line('reply', 'std.trace.reply', { request: ['$trace.request'], step: ['$step'], text: [quote(said)] }));
    const journal = { invocation, text, area: tab, libraryPin: SOURCE.libraryPin, knowledgePin: SOURCE.knowledgePin, reading: candidate, receipt, evidence: final.toJSON() };
    const records = session.newEngineJournal ?? [];
    session.newEngineJournal = [...records.slice(-127), structuredClone(journal)];
    return { ...reply(said, true, { assessment: assessed.assessment.status, journal }), state: { [area.world]: structuredClone(session.isession.state[area.world]) } };
  } catch (error) {
    session.isession.state[area.world] = original;
    if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
    return refusal('evidence', { error: String(error?.message || error) });
  }
}
