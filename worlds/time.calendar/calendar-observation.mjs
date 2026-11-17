// SPDX-License-Identifier: AGPL-3.0-only
// Pure comparison of local host snapshots. No language, schedule policy or SOP binding.
import { calendarObservationIssue } from './calendar-tool.mjs';
const copy = (x) => structuredClone(x);
const source = (o) => ({ instanceId: o?.instanceId ?? null, version: o?.version ?? null, complete: o?.complete ?? null });
const normalized = (fact) => Object.fromEntries(Object.keys(fact).sort().map(key=>[key,key==='participants'?[...fact[key]].sort():fact[key]]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function compareCalendarObservations(before, after) {
  const sources = { before: source(before), after: source(after) };
  for (const [side, observation] of [['before', before], ['after', after]]) {
    const issue = calendarObservationIssue(observation);
    if (issue) return { status: 'unknown', reason: issue.code, side, sources, issue };
  }
  if (before.instanceId !== after.instanceId) return { status: 'unknown', reason: 'different_instance', sources };
  if (after.version < before.version) return { status: 'unknown', reason: 'older_observation', sources };
  const a = new Map(before.facts.map((f) => [f.id, normalized(f)])), b = new Map(after.facts.map((f) => [f.id, normalized(f)]));
  const changes = [];
  for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const old = a.get(id), next = b.get(id);
    if (equal(old, next)) continue;
    const fields = old && next ? [...new Set([...Object.keys(old), ...Object.keys(next)])].filter((key) => !equal(old[key], next[key])).sort() : [];
    changes.push({ id, change: !old ? 'added' : !next ? 'removed' : 'changed', before: old ?? null, after: next ?? null, fields });
  }
  if (after.version === before.version && changes.length) return { status: 'inconsistent', reason: 'same_version_conflict', sources };
  return { status: 'compared', sources, stateEqual: changes.length === 0, versionChanged: before.version !== after.version, changes: copy(changes) };
}

/** Match an operation receipt to supplied pre/post reads; an acknowledgement alone proves nothing. */
export function compareCalendarReceipt({ before, receipt, after } = {}) {
  const comparison = compareCalendarObservations(before, after);
  if (comparison.status !== 'compared') return { status: 'unknown', reason: comparison.reason, comparison };
  if (receipt?.ok === false && receipt.status === 'refused') {
    if (receipt.instanceId !== before.instanceId || !Number.isSafeInteger(receipt.version)
      || receipt.version < before.version || receipt.version > after.version || typeof receipt.issue?.code !== 'string')
      return { status: 'unknown', reason: 'refusal_source_mismatch', comparison };
    return { status: 'not_executed', comparison };
  }
  if (!receipt || receipt.ok !== true || receipt.status !== 'executed' || typeof receipt.operationId !== 'string'
    || !receipt.operationId || !Number.isSafeInteger(receipt.beforeVersion) || receipt.beforeVersion < 0
    || receipt.afterVersion !== receipt.beforeVersion + 1 || !Number.isSafeInteger(receipt.currentVersion)
    || receipt.currentVersion < receipt.afterVersion || typeof receipt.replayed !== 'boolean') return { status: 'unknown', reason: 'invalid_receipt', comparison };
  const issue = calendarObservationIssue(receipt.observation);
  if (issue) return { status: 'unknown', reason: issue.code, issue, comparison };
  if (receipt.instanceId !== before.instanceId || receipt.observation.instanceId !== receipt.instanceId
    || receipt.observation.version !== receipt.afterVersion) return { status: 'unknown', reason: 'receipt_source_mismatch', comparison };
  const current = compareCalendarObservations(receipt.observation, after);
  if (current.status !== 'compared') return { status: 'unknown', reason: current.reason, comparison, current };
  const evidence = { operationId: receipt.operationId, receiptSource: source(receipt.observation), comparison, current };
  if (after.version < receipt.currentVersion) return { status: 'unknown', reason: 'observation_older_than_receipt', ...evidence };
  if (after.version > receipt.afterVersion) return { status: 'historical', reason: 'newer_observation', ...evidence };
  if (receipt.replayed) {
    if (!comparison.stateEqual || comparison.versionChanged) return { status: 'unknown', reason: 'change_during_replay', ...evidence };
    return { status: 'receipt_replay', stateMatchesReceipt: true, newExecution: false, ...evidence };
  }
  if (before.version !== receipt.beforeVersion) return { status: 'unknown', reason: 'baseline_version_mismatch', ...evidence };
  if (comparison.stateEqual) return { status: 'inconsistent', reason: 'no_observed_change', ...evidence };
  return { status: 'confirmed', stateMatchesReceipt: true, ...evidence };
}
