import{inspectCachedExecutionSource}from'./execution-world-inspection.mjs?v=c1b4a1fb44';
// Validated graph execution; no natural-language reader or grammar application path.
import { World, inspectRequest, assessPropertyChange, quote, str, parse } from '../vendor/sopworld/sopworld.mjs?v=df8c26a4de';
import SOURCE from './new-engine-source.mjs?v=94658c42d6';
import { resolvePropertyValue, selectPropertyObject } from './property-selection.mjs?v=4e1aff35b2';
import { NEW_ENGINE_AREAS } from './new-engine-areas.mjs?v=d4af6e3003';
import { flatRequestProjection } from './request-projection.mjs?v=cb46032790';
const hosts = new WeakMap();
let knowledge;
/** Read-only cache inspection; does not create the lazy knowledge World. */
export const inspectNewEngineSourceWorld=options=>inspectCachedExecutionSource(knowledge,options);
const sourceWorld = () => knowledge ??= World.fromJSON(SOURCE.snapshot,{library:SOURCE.schemaModules});
const first = (wire, key) => wire?.attrs[key]?.[0];
const line = (id, type, attrs) => `@${id} ${type} ` + Object.entries(attrs).flatMap(([key, values]) => values.map(value => `${key}=${value}`)).join(' ');
const input = (id, value) => line(id, 'std.trace.input', { source: [quote(value.source)], version: [quote(value.version)], 'source.type': [value.sourceType], key: [value.key], values: [quote(JSON.stringify(value.values))] });
const JOURNAL_IDS = new Set(['request.module', 'trace.module', 'reply.module', 'trace.request', 'before.input', 'expected.input', 'semantic.input', 'step', 'after.input', 'before.observation', 'after.observation', 'claim', 'reply']);
const uuid = () => globalThis.crypto.randomUUID();
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
const refusal = (reason, trace) => reply(`${trace?.understood ? trace.understood + ' ' : ''}${messages[reason]} Nothing changed.`, false, { reason, ...trace });

/** Execute a detached, validated graph. This is not a claim of reader coverage. */
export function executeRequestCandidate(session, candidate, text, options = {}) {
  const tab = options.view ?? session.isession.state['ui.shell']?.activeTab;
  const area = NEW_ENGINE_AREAS[tab];
  const prior = options.invocation && (session.newEngineJournal || []).find(record => record.invocation === options.invocation);
  if (prior) {
    if (prior.text !== text || prior.area !== tab || prior.reading.wires !== candidate?.wires) return refusal('identity');
    return reply('This invocation was already recorded. No new operation was performed.', false,
      { replayed: true, historicalReceipt: { ...structuredClone(prior.receipt), replayed: true }, journal: structuredClone(prior) });
  }
  if (options.language && options.language !== 'en') return refusal('language');
  let wires;
  try {
    if (typeof candidate?.wires !== 'string' || candidate.wires.length > 65536) return refusal('structure');
    wires = parse(candidate.wires);
    if (wires.length > 64 || new Set(wires.map(wire => wire.id)).size !== wires.length
      || wires.some(wire => JOURNAL_IDS.has(wire.id) || !['std.request', 'std.request.source', 'std.request.target', 'std.request.constraint'].includes(wire.type))
      || wires.filter(wire => wire.type === 'std.request').length !== 1) return refusal('structure', { reading: candidate });
  } catch { return refusal('structure'); }
  const source = sourceWorld();
  const evidence = new World();
  evidence.load('@request.module core.use world=std.request\n@trace.module core.use world=std.trace\n@reply.module core.use world=std.reply');
  if (!evidence.tell(candidate.wires).ok || !inspectRequest(evidence, candidate.request).ok) return refusal('structure');
  const request = evidence.get(candidate.request), targets = evidence.ofType('std.request.target'), conditions = evidence.ofType('std.request.constraint');
  const projection = flatRequestProjection(candidate);
  const structureSummary = projection.ok ? `I read a ${projection.request.mood} request with act ${projection.request.act}`
    + (projection.targets.length ? ` about ${projection.targets.map(target => `${target.mode} ${target.kind || 'target'}`).join(', ')}` : '')
    + (projection.results.length ? ` and ${projection.results.length} result constraint(s)` : '') + '.' : undefined;
  if (!area) return refusal('area', { understood: structureSummary, reading: candidate, projection: projection.ok ? undefined : projection });
  const target = targets[0];
  const selector = evidence.get(first(target, 'selector')?.slice(1));
  const results = conditions.filter(item => item.id !== selector?.id);
  const condition = first(request, 'root') ? evidence.get(first(request, 'root').slice(1)) : results.length === 1 ? results[0] : null;
  const allowed = (wire, keys) => wire && Object.keys(wire.attrs).every(key => keys.includes(key));
  const equality = wire => wire?.type === 'std.request.constraint' && first(wire, 'operator') === 'eq'
    && first(wire, 'polarity') === 'positive' && wire.attrs.value?.length === 1
    && first(wire, 'target') === '$' + target.id
    && allowed(wire, ['request', 'target', 'concept', 'operator', 'value', 'character', 'polarity', 'source', 'source.start', 'source.end']);
  if (!allowed(request, ['act', 'mood', 'source', 'root'])
    || str(first(evidence.get(first(request, 'source')?.slice(1)), 'text')) !== text
    || targets.length !== 1 || conditions.length !== (selector ? 2 : 1) || first(request, 'mood') !== 'do'
    || !equality(condition) || first(condition, 'character') !== 'requirement'
    || first(target, 'mode') !== 'existing'
    || !allowed(target, ['request', 'mode', 'kind', 'determiner', 'selector', 'source', 'source.start', 'source.end'])
    || (first(target, 'determiner') && first(target, 'determiner') !== 'definite')
    || (selector && (!equality(selector) || first(selector, 'character') !== 'assumption'))
    || ['std.request.group', 'std.request.not', 'std.request.quant', 'std.request.value'].some(type => evidence.ofType(type).length))
    return refusal('structure', { understood: structureSummary, reading: candidate, unsupported: 'one positive required equality and optional positive assumed equality selector' });
  const binding = area.bindings.find(item => item.act === first(request, 'act') && item.concept === first(condition, 'concept'));
  const selectorBinding = selector && area.bindings.find(item => item.concept === first(selector, 'concept'));
  if (!binding || (selector && !selectorBinding)) return refusal('structure', { reading: candidate, unsupported: 'undeclared property binding' });
  const semanticValue = str(first(condition, 'value'));
  const understood = `I understood a request to set ${binding.concept} to ${semanticValue} on an existing ${str(first(target, 'kind'))}`
    + (selector ? ` whose stored ${selectorBinding.concept} equals ${str(first(selector, 'value'))}.` : '.');
  const resolved = resolvePropertyValue(source, area, binding, semanticValue), { values, facts: matches } = resolved;
  const selectedValue = selector && resolvePropertyValue(source, area, selectorBinding, str(first(selector, 'value')));
  if (!resolved.ok || (selector && !selectedValue.ok)) return refusal('value', { understood, reading: candidate, resultMapping: resolved, selectorMapping: selectedValue });
  const state = session.isession.state[area.world];
  let host, before;
  try {
    if (!state || typeof state !== 'object') return refusal('state');
    host = hosts.get(state);
    if (!host) { host = area.createHost({ state, instanceId: uuid(), bindings: area.bindings }); hosts.set(state, host); }
    before = host.observe();
  } catch { return refusal('state'); }
  const selection = selectPropertyObject(before, { kind: str(first(target, 'kind')), selector: selector?.id, binding: selectorBinding, resolved: selectedValue }, { normalize: area.normalize });
  if (!selection.ok) return refusal('target', { understood, reading: candidate, selection });
  const object = selection.object, nativeBefore = object.inputs.find(item => item.binding === binding.id);
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
    const journal = { invocation, text, area: tab, libraryPin: SOURCE.libraryPin, knowledgePin: SOURCE.knowledgePin, reading: candidate, selection, receipt, evidence: final.toJSON() };
    const records = session.newEngineJournal ?? [];
    session.newEngineJournal = [...records.slice(-127), structuredClone(journal)];
    return { ...reply(said, true, { assessment: assessed.assessment.status, journal }), state: { [area.world]: structuredClone(session.isession.state[area.world]) } };
  } catch (error) {
    session.isession.state[area.world] = original;
    if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
    return refusal('evidence', { error: String(error?.message || error) });
  }
}
