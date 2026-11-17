// Host orchestration only: semantic projections belong to area declarations.
import { prepareRequestBatch, requestBatchFrontier, parse } from '../vendor/sopworld/sopworld.mjs?v=20fdd56a67';

/** All request graphs are validated before the first resolver or native invocation. */
export async function dispatchDeclaredBatch(batch, { resolve, invocation, budget } = {}) {
  if (typeof resolve !== 'function' || typeof invocation !== 'string' || !invocation) return { ok: false, issues: [{ reason: 'invalid-dispatch-context' }], outcomes: [] };
  const prepared = prepareRequestBatch(batch, budget === undefined ? {} : { budget });
  if (!prepared.ok) return { ...prepared, outcomes: [] };
  const outcomes = [], records = [];
  while (true) {
    const frontier = requestBatchFrontier(prepared.plan, outcomes);
    if (!frontier.ok) return { ok: false, issues: frontier.issues, outcomes, records };
    if (!frontier.ready.length) return { ok: true, plan: prepared.plan, frontier, outcomes, records };
    for (const id of frontier.ready) {
      const entry = prepared.plan.entries.find(item => item.id === id);
      let resolution;
      try { resolution = await resolve(entry); }
      catch { resolution = { ok: false, reason: 'projection-error' }; }
      if (!resolution?.ok) {
        outcomes.push({ id, status: 'refused' });
        records.push({ id, status: 'refused', reason: resolution?.reason || 'unsupported-projection', diagnostics: resolution?.diagnostics ?? null });
        continue;
      }
      // A trusted area projection must account explicitly for every graph field.
      // This is an admission witness, not a semantic proof or inferred mapping.
      const fields = parse(entry.wires).flatMap(wire => Object.keys(wire.attrs).map(key => JSON.stringify([wire.id, key]))).sort();
      const consumed = resolution.consumed;
      if (!Array.isArray(consumed) || consumed.some(value => typeof value !== 'string') || JSON.stringify([...consumed].sort()) !== JSON.stringify(fields)
          || typeof resolution.declaration !== 'string' || !resolution.declaration
          || typeof resolution.host?.invoke !== 'function' || typeof resolution.operation !== 'string'
          || typeof resolution.expectedVersion !== 'string') {
        outcomes.push({ id, status: 'refused' });
        records.push({ id, status: 'refused', reason: 'incomplete-projection-witness' });
        continue;
      }
      let receipt;
      try {
        receipt = await resolution.host.invoke({ invocation: JSON.stringify([invocation, id]), expectedVersion: resolution.expectedVersion,
          operation: resolution.operation, args: resolution.args });
      } catch {
        outcomes.push({ id, status: 'unknown' });
        records.push({ id, status: 'unknown', reason: 'native-invocation-error' });
        continue;
      }
      // This boundary does not manufacture an assessment from a native receipt.
      const status = receipt?.status === 'refused' ? 'refused' : ['changed', 'unchanged'].includes(receipt?.status) ? 'unverified' : 'unknown';
      outcomes.push({ id, status });
      records.push({ id, status, declaration: resolution.declaration, consumed: [...consumed], mapping: resolution.mapping ?? null, receipt });
    }
  }
}
