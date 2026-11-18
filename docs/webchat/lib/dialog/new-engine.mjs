// Detached development and measurement entry point for the actual declared executor.
import { parse, str } from '../vendor/sopworld/sopworld.mjs?v=7950b62b94';
import { executeDeclaredRequest } from './declared-execution.mjs?v=3844c6ae33';
import { DRAWING_TOOL_BINDINGS } from '../../worlds/art.draw/declared-host.mjs?v=a52fb91a36';

const graphTypes = new Set(['std.request', 'std.request.source', 'std.request.target', 'std.request.constraint']);
const reserved = new Set(['request.module', 'trace.module', 'reply.module', 'trace.request', 'before.input', 'expected.input', 'semantic.input', 'step', 'after.input', 'before.observation', 'after.observation', 'claim', 'reply']);
const detachedInvocations = new WeakMap();
const drawingConstructor = DRAWING_TOOL_BINDINGS.find((operation) => operation.id === 'drawing.object.make');
const detachedBindings = {
  kinds: drawingConstructor.params.kind.enum.map((kind) => ({
    area: 'drawing', canonical: kind, lemma: kind, nativeFamilyBinding: { operation: drawingConstructor.id },
  })),
};

function reply(text, trace) {
  return { text, parts: [{ text, translate: false }], statuses: ['unsupported'], answers: [], segments: [], state: {},
    effects: [], newEngine: true, trace: { legacy: false, engine: 'new', ...trace } };
}

const refuse = reason => reply('I could not apply that request. Nothing changed.', { reason });

export async function executeRequestCandidate(session, candidate, text, options = {}) {
  const view = options.view ?? session.isession.state['ui.shell']?.activeTab;
  if (options.language && options.language !== 'en') return refuse('language');
  if (view !== 'draw') return refuse('area');
  let nodes;
  try {
    if (typeof candidate?.wires !== 'string' || candidate.wires.length > 65536) return refuse('structure');
    nodes = parse(candidate.wires);
    const roots = nodes.filter((wire) => wire.type === 'std.request');
    const [request] = roots;
    const source = nodes.find((wire) => '$' + wire.id === request?.attrs.source?.[0]);
    if (nodes.length > 64 || roots.length !== 1 || request.id !== candidate.request ||
        str(source?.attrs.text?.[0]) !== text || new Set(nodes.map((wire) => wire.id)).size !== nodes.length ||
        nodes.some((wire) => reserved.has(wire.id) || !graphTypes.has(wire.type))) return refuse('structure');
  } catch {
    return refuse('structure');
  }
  const invocation = options.invocation ?? globalThis.crypto.randomUUID();
  if (!detachedInvocations.has(session)) detachedInvocations.set(session, new Map());
  const receipts = detachedInvocations.get(session);
  const prior = receipts.get(invocation) ?? session.newEngineJournal?.find((record) => record.invocation === invocation);
  if (prior) {
    if (prior.text !== text || prior.area !== view || prior.reading.wires !== candidate.wires) return refuse('identity');
    return reply('This invocation was already recorded. No new operation was performed.', {
      replayed: true, historicalReceipt: prior.receipt && { ...structuredClone(prior.receipt), replayed: true },
    });
  }
  if (receipts.size >= 10000) return refuse('identity');
  const entry = { text, area: view, reading: candidate };
  receipts.set(invocation, entry);
  const instanceState = session.isession.state['art.draw'];
  const original = structuredClone(instanceState);
  const rollback = () => { session.isession.state['art.draw'] = original; };
  try {
    const result = await executeDeclaredRequest(session, candidate, text, { view, invocation, targetUnique: true,
      bindings: options.bindings ?? detachedBindings });
    if (result?.trace?.receipt?.status !== 'refused' && result?.statuses.includes('supported')) {
      entry.receipt = structuredClone(result.trace.receipt);
    } else {
      receipts.delete(invocation);
      rollback();
    }
    return result ?? refuse('structure');
  } catch (error) {
    receipts.delete(invocation);
    rollback();
    if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
    return refuse('state');
  }
}
