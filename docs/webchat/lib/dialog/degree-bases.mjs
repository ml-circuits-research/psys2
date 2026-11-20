// SPDX-License-Identifier: AGPL-3.0-only
// What a degree word scales ("a big sun", "a small house"): the value the tool would choose without it. The
// compiled call, without the values it could not resolve, is previewed on a copy of the state (the host's
// `preview`, after the knowledge its arguments name is loaded); the observations of the object it would create
// become app.execution.preview facts, and the capability policy turns those into std.capability.base for the
// parameters their properties bind (worlds/app.project/capability-policy.sop). Nothing here names a tool,
// a parameter or a word.
import { parse } from '../vendor/sopworld/sopworld.mjs?v=47abc4a87a';

const first = (row, key) => row.attrs[key]?.[0];
const scaled = (row) => ['degree', 'factor'].includes(first(row, 'operator')) && first(row, 'polarity') === 'positive';

/**
 * candidates: request proposals ({request, wires}). preflight(candidate): its compiled plan without bases.
 * prepare(args): a host for the area with the knowledge those arguments name loaded (its state a copy).
 * Returns [{operation, kind, objects}] for the candidates that scale a value of a new object, or null.
 */
export async function readDegreeBases({ candidates, preflight, prepare }) {
  const previews = [];
  for (const candidate of candidates) {
    const rows = parse(candidate.wires);
    const targets = rows.filter((row) => row.type === 'std.request.target' && first(row, 'mode') === 'new' &&
      first(row, 'request') === '$' + candidate.request);
    if (targets.length !== 1 || !first(targets[0], 'kind')) continue;
    if (!rows.some((row) => row.type === 'std.request.constraint' && first(row, 'target') === '$' + targets[0].id && scaled(row))) continue;
    const plan = preflight(candidate);
    if (plan.status !== 'compiled' || plan.act !== 'make' || !plan.skipped.length || !plan.toolInput) continue;
    let objects;
    try {
      const host = await prepare(plan.args);
      objects = host.preview?.(plan.toolInput);
    } catch (error) {
      if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
      continue;
    }
    if (objects?.length) previews.push({ operation: plan.operation, kind: first(targets[0], 'kind'), objects });
  }
  return previews.length ? previews : null;
}
