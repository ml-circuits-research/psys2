// SPDX-License-Identifier: AGPL-3.0-only
import { compileNativeCapability } from './capability-plan-adapter.mjs';
import { createAreaHost, NATIVE_AREAS } from './app-reader-context.mjs';
import { instanceIdFor } from './instance-identity.mjs';
import { prepareNativeControlHost } from './native-control-preparation.mjs';
import { invokeObservedNativeTool } from './native-tool-activity.mjs';
import { describeNativeControl, verifyNativeControlEffect } from './native-control-intent.mjs';

function reply(text, supported, trace = {}) {
  return { text, parts: [{ text, translate: false }], statuses: [supported ? 'supported' : 'unsupported'],
    answers: [], segments: [], state: {}, effects: [], newEngine: true, trace: { legacy: false, engine: 'new', ...trace } };
}

function refusal(plan, candidate) {
  const messages = {
    target: 'I could not find an object to apply that action to. Nothing changed.',
    'native-binding-gap': 'I understood the requested action and object, but could not bind their required tool arguments. Nothing changed.',
  };
  return reply(plan.message ?? messages[plan.reason] ?? 'I could not apply that action. Nothing changed.', false, {
    reason: plan.reason, reading: candidate, compiledSop: plan.sop,
    binding: { act: plan.act, kind: plan.kind, alternatives: plan.alternatives },
  });
}

/** Compose authoritative observations, run the compiled native call and report the actual effect. */
export async function executeNativeCapability(session, candidate, { bindings, view, unapplied = [], compiledPlan, readKnowledge } = {}) {
  const area = NATIVE_AREAS[view];
  const nativeState = area && session.isession.state[area.world];
  if (!nativeState || !bindings) return null;
  const host = await createAreaHost(area, { state: nativeState, instanceId: instanceIdFor(session, area.world),
    loader: session.engine?.loader, knowledge: session.engine?.knowledge });
  const before = host.observe();
  const plan = compiledPlan ?? compileNativeCapability(candidate, { area, view, bindings, host, observation: before,
    focus: session.newEngineFocus?.[view], unapplied, readKnowledge });
  if (plan.status === 'not-applicable') return null;
  if (plan.status !== 'compiled') return refusal(plan, candidate);

  const invocation = globalThis.crypto.randomUUID();
  let prepared;
  try {
    prepared = await prepareNativeControlHost(session, { view, operation: plan.operation, args: plan.args, host, invocation });
  } catch (error) {
    return reply(`I understood the request for ${plan.kind}, but could not load the knowledge required by its tool. Nothing changed.`, false,
      { reason: 'native-knowledge-unavailable', reading: candidate, compiledSop: plan.sop,
        binding: { operation: plan.operation, knowledgeInputs: host.bindings().find((op) => op.id === plan.operation)?.knowledgeInputs ?? [] },
        error: String(error?.message ?? error) });
  }

  const observed = prepared.observe();
  const operation = prepared.bindings().find((op) => op.id === plan.operation);
  if (!operation || observed.instanceId !== plan.instance || observed.version !== plan.version ||
      plan.source !== undefined && !observed.objects.some((object) => String(object.id) === plan.id && object.source === plan.source)) {
    return reply('The target state changed before I could apply the action. Nothing changed.', false,
      { reason: 'stale-compiled-capability', reading: candidate, compiledSop: plan.sop });
  }
  try {
    session.engine?.onWorldActivity?.({ nodeIds: ['execution:policy'], phase: 'stage', label: 'Compiled declared capabilities',
      operation: 'policy.execution.compile', tool: operation.id, facts: plan.support, wires: plan.sop });
  } catch {
    // Inspection does not affect dispatch.
  }
  const intent = describeNativeControl({ operation, args: plan.args, before: observed });
  const receipt = await invokeObservedNativeTool(session, { area, host: prepared, invocation,
    expectedVersion: observed.version, sop: intent.wires });
  if (receipt.status === 'refused') return reply('I could not apply that action. Nothing changed.', false,
    { reason: receipt.reason, receipt, compiledSop: plan.sop });

  const after = prepared.observe(), verification = verifyNativeControlEffect({ intent, before: observed, after, receipt });
  const old = new Set(before.objects.map((object) => object.id));
  const object = after.objects.find((value) => !old.has(value.id)) ?? before.objects.find((value) => String(value.id) === plan.id);
  session.newEngineFocus = { ...session.newEngineFocus, [view]: object?.id ?? null };
  const kind = object?.kind ?? plan.kind;
  const notes = [...plan.notes];
  if (plan.targets.length > 1) notes.unshift('I used the most recent matching ' + plan.kind + '.');
  if (plan.skipped.length) notes.push('I could not apply ' + plan.skipped.join(', ') + '.');
  const said = plan.act === 'make' ? `Created a ${kind}.` : plan.act === 'remove' ? `Removed the ${kind}.` : `Updated the ${kind}.`;
  const message = [said, ...notes].join(' ');
  return {
    ...reply(message, true, { assessment: receipt.status, receipt, reading: candidate, compiledSop: plan.sop,
      controlIntent: intent.wires, effectVerification: verification, binding: { operation: plan.operation, alternatives: plan.alternatives.filter((choice) => choice.reason) },
      uncertainty: notes, alternatives: plan.alternatives.filter((choice) => !choice.reason).map((choice) => choice.operation), partial: plan.skipped.length > 0 }),
    state: { [area.world]: structuredClone(session.isession.state[area.world]) },
    effects: receipt.status === 'changed' ? [{ operation: plan.operation }] : [],
  };
}
