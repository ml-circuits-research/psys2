import { readSceneDefaults } from './scene-placement-defaults.mjs?v=bdbf97975e';
// SPDX-License-Identifier: AGPL-3.0-only
import { compileNativeCapability } from './capability-plan-adapter.mjs?v=0a0618a0cf';
import { createAreaHost, NATIVE_AREAS } from './app-reader-context.mjs?v=c84a75634d';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { prepareNativeControlHost } from './native-control-preparation.mjs?v=9b467a4462';
import { invokeObservedNativeTool } from './native-tool-activity.mjs?v=cb32498a31';
import { retainPropertyEffect } from './property-effect-evidence.mjs?v=5ade3886fa';
import { describeNativeControl, verifyNativeControlEffect } from './native-control-intent.mjs?v=a3764ece95';

function reply(text, supported, trace = {}) {
  return { text, parts: [{ text, translate: false }], statuses: [supported ? 'supported' : 'unsupported'],
    answers: [], segments: [], state: {}, effects: [], newEngine: true, trace: { legacy: false, engine: 'new', ...trace } };
}

function refusal(plan, candidate) {
  const messages = {
    value: 'I could not resolve one exact declared value. Nothing changed.',
    target: 'I could not find an object to apply that action to. Nothing changed.',
    'native-binding-gap': 'I understood the requested action and object, but could not bind their required tool arguments. Nothing changed.',
  };
  return reply(plan.message ?? messages[plan.reason] ?? 'I could not apply that action. Nothing changed.', false, {
    reason: plan.reason, reading: candidate, compiledSop: plan.sop,
    binding: { act: plan.act, kind: plan.kind, alternatives: plan.alternatives },
  });
}

// A command with an exact bound object and recoverable session state can use reversible best effort.
export function isScopedRemoval(plan){
 if(plan?.status!=='compiled'||plan.act!=='remove'||!plan.id||!plan.source||!plan.instance||typeof plan.version!=='string'||plan.skipped.length||Object.keys(plan.args).length!==1)return false;
 const {id,ids}=plan.args;
 return id===plan.id&&ids===undefined||id===undefined&&Array.isArray(ids)&&ids.length===1&&ids[0]===plan.id;
}

function verifyRemovalPeers(plan, before, after, evidence) {
  const removed = before.objects.find((object) => object.id === plan.id && object.source === plan.source);
  if (!removed || evidence.status !== 'verified') return evidence;
  const peers = before.objects.filter((object) => object.sourceType === removed.sourceType &&
    object.id !== removed.id && (object.in ?? object.parent) === (removed.in ?? removed.parent));
  const survivors = new Set(after.objects.map((object) => object.source));
  const lost = peers.filter((object) => !survivors.has(object.source));
  if (!lost.length) return evidence;
  return { ...evidence, status:'mismatch', reason:'unrelated-peer-removed', changedPeers:lost.map((object) => object.id) };
}

/** Compose authoritative observations, run the compiled native call and report the actual effect. */
export async function executeNativeCapability(session, candidate, { bindings, view, focus, text, targetUnique, invocation = globalThis.crypto.randomUUID(), unapplied = [], compiledPlan, readKnowledge } = {}) {
  const area = NATIVE_AREAS[view];
  const nativeState = area && session.isession.state[area.world];
  if (!nativeState || !bindings) return null;
  const host = await createAreaHost(area, { state: nativeState, instanceId: instanceIdFor(session, area.world),
    loader: session.engine?.loader, knowledge: session.engine?.knowledge });
  const before = host.observe();
  const sceneDefaults = compiledPlan ? null : await readSceneDefaults({host,bindings,area,view,
    knowledge:session.engine?.knowledge,candidates:[candidate]});
  const plan = compiledPlan ?? compileNativeCapability(candidate, { area, view, bindings, host, observation: before,
    focus: focus ?? session.newEngineFocus?.[view], targetUnique, unapplied, readKnowledge, sceneDefaults });
  if (plan.status === 'not-applicable') return null;
  if (plan.status !== 'compiled') return refusal(plan, candidate);

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
    session.engine?.onWorldActivity?.({ nodeIds: ['execution:capability-policy','execution:policy',...(plan.scenePlaced?['execution:scene-default-policy','execution:scene-default-projection','knowledge-world:k.composition2d']:[])], phase: 'stage', label: 'Compiled declared capabilities',
      operation: 'policy.execution.compile', tool: operation.id, facts: plan.support, wires: plan.sop,
      ...(plan.sceneEvidence?{sceneEvidence:plan.sceneEvidence}:{}) });
  } catch {
    // Inspection does not affect dispatch.
  }
  const intent = describeNativeControl({ operation, args: plan.args, before: observed });
  const scopedRemoval = isScopedRemoval(plan);
  const original = plan.selector || scopedRemoval ? structuredClone(nativeState) : undefined;
  const receipt = await invokeObservedNativeTool(session, { area, host: prepared, invocation,
    expectedVersion: observed.version, sop: plan.toolInput });
  if (receipt.status === 'refused') return reply('I could not apply that action. Nothing changed.', false,
    { reason: receipt.reason, receipt, compiledSop: plan.sop, controlIntent: plan.toolInput });

  const after = prepared.observe();
  const effect = verifyNativeControlEffect({ intent, before: observed, after, receipt });
  const verification = scopedRemoval ? verifyRemovalPeers(plan, observed, after, effect) : effect;
  if (original && verification.status !== 'verified') {
    session.isession.state[area.world] = original;
    return reply('I could not confirm the requested change. I restored the previous state.', false, {
      reason: scopedRemoval ? 'unverified-removal-effect' : 'unverified-selector-effect', compiledSop: plan.sop, controlIntent: plan.toolInput, receipt, effectVerification: verification,
    });
  }
  const old = new Set(before.objects.map((object) => object.id));
  const object = after.objects.find((value) => !old.has(value.id)) ?? before.objects.find((value) => String(value.id) === plan.id);
  const previousFocus = session.newEngineFocus?.[view];
  const nextFocus = plan.act === 'remove' ? after.objects.find((item) => item.id === previousFocus)?.id : object?.id;
  session.newEngineFocus = { ...session.newEngineFocus, [view]: nextFocus ?? null };
  const kind = object?.kind ?? plan.kind;
  const notes = [...plan.notes];
  if (plan.targets.length > 1) notes.unshift(plan.act === 'remove'
    ? 'More than one matched. I used ' + kind + ' ' + plan.id + '. You can undo this.'
    : 'I used the most recent matching ' + plan.kind + '.');
  if (plan.skipped.length) notes.push('I could not apply ' + plan.skipped.join(', ') + '.');
  const said = plan.act === 'make' ? `Created a ${kind}.` : plan.act === 'remove' ? `Removed the ${kind}.` : `Updated the ${kind}.`;
  const measured = retainPropertyEffect(session, { candidate, text, view, plan, before: observed, after, receipt, verification, message: notes.join(' ') });
  const message = measured?.text ?? [said, ...notes].join(' ');
  return {
    ...reply(message, true, { assessment: measured?.assessment ?? receipt.status, journal: measured?.journal, receipt, reading: candidate, compiledSop: plan.sop,
      controlIntent: plan.toolInput, effectVerification: verification, binding: { operation: plan.operation, alternatives: plan.alternatives.filter((choice) => choice.reason) },
      uncertainty: notes, alternatives: plan.alternatives.filter((choice) => !choice.reason).map((choice) => choice.operation), partial: plan.skipped.length > 0 }),
    state: { [area.world]: structuredClone(session.isession.state[area.world]) },
    effects: receipt.status === 'changed' ? [{ operation: plan.operation }] : [],
  };
}
