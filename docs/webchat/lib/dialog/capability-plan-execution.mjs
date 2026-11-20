import { readSceneDefaults } from './scene-placement-defaults.mjs?v=881cf3bcf0';
import { solveDefaultPlacement, solveGroupPlacement } from './default-placement.mjs?v=3010947edb';
import { en } from '../lang/en.mjs?v=0451d0d207';
import { quote } from '../vendor/sopworld/sopworld.mjs?v=a37e1846b3';
// SPDX-License-Identifier: AGPL-3.0-only
import { compileNativeCapability } from './capability-plan-adapter.mjs?v=88b6dbbc71';
import { readDegreeBases } from './degree-bases.mjs?v=96e65008ac';
import { createAreaHost, NATIVE_AREAS } from './app-reader-context.mjs?v=015c47867d';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { prepareNativeControlHost } from './native-control-preparation.mjs?v=9601efa589';
import { invokeObservedNativeTool } from './native-tool-activity.mjs?v=50362a2706';
import { retainPropertyEffect } from './property-effect-evidence.mjs?v=c3128d6455';
import { describeNativeControl, verifyNativeControlEffect } from './native-control-intent.mjs?v=e251e8e929';

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
export async function executeNativeCapability(session, candidate, options = {}) {
  const { view, invocation = globalThis.crypto.randomUUID() } = options;
  const compiled = await compileNativePlan(session, candidate, options);
  if (!compiled) return null;
  const { area, nativeState, host, before, plan } = compiled;
  if (plan.status === 'not-applicable') return null;
  if (plan.status !== 'compiled') return refusal(plan, candidate);
  // A count the family declares repeatable: that many objects, placed together in one problem.
  if (plan.act === 'make' && plan.repeat > 1) return executeNativeGroup(session, [{ candidate, plan }], { view, invocation });
  return runNativePlan(session, candidate, { area, nativeState, host, before, plan, view, invocation, text: options.text });
}

/** The compiled capability plan of a candidate against the live observation (degree previews and scene defaults as declared). */
export async function compileNativePlan(session, candidate, { bindings, view, focus, targetUnique, unapplied = [], compiledPlan, readKnowledge } = {}) {
  const area = NATIVE_AREAS[view];
  const nativeState = area && session.isession.state[area.world];
  if (!nativeState || !bindings) return null;
  const host = await createAreaHost(area, { state: nativeState, instanceId: instanceIdFor(session, area.world),
    loader: session.engine?.loader, knowledge: session.engine?.knowledge });
  const before = host.observe();
  const declared = {area,view,bindings,host,observation:before,
    focus:focus ?? session.newEngineFocus?.[view],targetUnique,unapplied,readKnowledge};
  const previews = compiledPlan ? null : await readDegreeBases({candidates:[candidate],
    preflight:current=>compileNativeCapability(current,declared),
    prepare:args=>createAreaHost(area,{args,state:structuredClone(nativeState),instanceId:before.instanceId,loader:session.engine?.loader,knowledge:session.engine?.knowledge})});
  const context = previews ? {...declared,previews} : declared;
  let preliminary;
  const sceneDefaults = compiledPlan ? null : await readSceneDefaults({host,knowledge:session.engine?.knowledge,candidates:[candidate],
    preflight:current=>preliminary ??= compileNativeCapability(current,context)});
  const plan = compiledPlan ?? (sceneDefaults ? compileNativeCapability(candidate,{...context,sceneDefaults})
    : preliminary ?? compileNativeCapability(candidate,context));
  return { area, nativeState, host, before, plan };
}

async function runNativePlan(session, candidate, { area, nativeState, host, before, plan, view, invocation, text }) {
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
    session.engine?.onWorldActivity?.({ nodeIds: ['execution:capability-policy','execution:policy',...(plan.scenePlaced?['execution:scene-default-policy','execution:scene-default-projection',...plan.catalogModules.map(module=>'knowledge-world:'+module)]:[])], phase: 'stage', label: 'Compiled declared capabilities',
      operation: 'policy.execution.compile', tool: operation.id, facts: plan.support, wires: plan.sop,
      ...(plan.sceneEvidence?{sceneEvidence:plan.sceneEvidence}:{}) });
  } catch {
    // Inspection does not affect dispatch.
  }
  // A new object with no place asked for: the placement problem the area declares, solved as std.problem (Z3 where
  // the page can run it, the internal search otherwise), gives it its place and size.
  const placed = await placeByProblem(prepared, operation, plan);
  if (placed?.solved) {
    try {
      session.engine?.onWorldActivity?.({ nodeIds: ['execution:placement-geometry','instance:' + area.world], world: area.world, operation: 'std.placement', phase: 'end',
        label: 'Solved default placement', status: 'compiled', provider: placed.provider, candidates: placed.candidates, durationMs: placed.ms, region: placed.region, solves: placed.solves, search: placed.z3, defaulted: placed.defaulted, wires: placed.choice?.input + '\n' + placed.choice?.sop });
    } catch { /* Inspection does not affect dispatch. */ }
  }
  const callArgs = placed?.solved ? placed.args : plan.args, toolInput = placed?.solved ? placed.toolInput : plan.toolInput;
  const intent = describeNativeControl({ operation, args: callArgs, before: observed });
  const scopedRemoval = isScopedRemoval(plan);
  const original = plan.selector || scopedRemoval ? structuredClone(nativeState) : undefined;
  const receipt = await invokeObservedNativeTool(session, { area, host: prepared, invocation,
    expectedVersion: observed.version, sop: toolInput });
  if (receipt.status === 'refused') return reply('I could not apply that action. Nothing changed.', false,
    { reason: receipt.reason, receipt, compiledSop: plan.sop, controlIntent: toolInput });

  const after = prepared.observe();
  const effect = verifyNativeControlEffect({ intent, before: observed, after, receipt });
  const verification = scopedRemoval ? verifyRemovalPeers(plan, observed, after, effect) : effect;
  if (original && verification.status !== 'verified') {
    session.isession.state[area.world] = original;
    return reply('I could not confirm the requested change. I restored the previous state.', false, {
      reason: scopedRemoval ? 'unverified-removal-effect' : 'unverified-selector-effect', compiledSop: plan.sop, controlIntent: toolInput, receipt, effectVerification: verification,
    });
  }
  const old = new Set(before.objects.map((object) => object.id));
  // A made object is reported by itself, not by its first part: parts are observed under their object (in/role).
  const added = after.objects.filter(value => !old.has(value.id)), made = added.filter(value => (value.in ?? value.parent) === undefined);
  const object = made[0] ?? added[0] ?? before.objects.find((value) => String(value.id) === plan.id);
  const previousFocus = session.newEngineFocus?.[view];
  const nextFocus = plan.act === 'remove' ? after.objects.find((item) => item.id === previousFocus)?.id : object?.id;
  session.newEngineFocus = { ...session.newEngineFocus, [view]: nextFocus ?? null };
  const kind = object?.kind ?? plan.kind;
  const notes = [...plan.notes];
  if (plan.targets.length > 1) notes.unshift(plan.act === 'remove'
    ? 'More than one matched. I used ' + kind + ' ' + plan.id + '. You can undo this.'
    : 'I used the most recent matching ' + plan.kind + '.');
  if (plan.skipped.length) notes.push('I could not apply ' + plan.skipped.join(', ') + '.');
  const addedOfKind = operation.spatial?.countKey && made.filter(value => value.sourceType === operation.on && value.kind === kind).length;
  const created = addedOfKind>1 ? `Created ${addedOfKind} objects of kind ${kind}.` : `Created a ${kind}.`;
  const said = plan.act === 'make' ? created : plan.act === 'remove' ? `Removed the ${kind}.` : `Updated the ${kind}.`;
  const measured = retainPropertyEffect(session, { candidate, text, view, plan, before: observed, after, receipt, verification, message: notes.join(' ') });
  const message = measured?.text ?? [said, ...notes].join(' ');
  return {
    ...reply(message, true, { assessment: measured?.assessment ?? receipt.status, journal: measured?.journal, receipt, reading: candidate, compiledSop: plan.sop,
      ...(placed ? { solver: { provider: placed.solved ? placed.provider : null, compileMs: placed.ms, region: placed.region, solves: placed.solves, z3: placed.z3, defaulted: placed.defaulted ?? [], choice: placed.choice?.sop ?? null } } : {}),
      controlIntent: toolInput, effectVerification: verification, binding: { operation: plan.operation, alternatives: plan.alternatives.filter((choice) => choice.reason) },
      uncertainty: notes, alternatives: plan.alternatives.filter((choice) => !choice.reason).map((choice) => choice.operation), partial: plan.skipped.length > 0 }),
    state: { [area.world]: structuredClone(session.isession.state[area.world]) },
    effects: receipt.status === 'changed' ? [{ operation: plan.operation }] : [],
  };
}

/** The declared default placement of a make without coordinates: the solved place and the call that carries it (the plan stays as compiled). */
async function placeByProblem(host, operation, plan) {
  const port = operation?.spatial, args = plan.args;
  if (plan.act !== 'make' || !port?.xKey || !port?.yKey || args[port.xKey] !== undefined || args[port.yKey] !== undefined) return null;
  if (port.countKey && args[port.countKey] !== undefined && args[port.countKey] !== 1) return null;
  const scalar = value => typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || typeof value === 'string';
  if (!Object.values(args).every(scalar)) return null;
  const token = value => typeof value === 'string' ? quote(value) : String(value);
  const call = values => '@placement.call ' + operation.id + Object.entries(values).map(([key, value]) => ' ' + key + '=' + token(value)).join('');
  const placed = await solveDefaultPlacement(host, { intent: call(args) });
  if (!placed?.solved) return placed;
  placed.args = { ...args, [port.xKey]: placed.x, [port.yKey]: placed.y, ...(port.sizeKey && args[port.sizeKey] === undefined ? { [port.sizeKey]: placed.size } : {}) };
  placed.toolInput = call(placed.args);
  return placed;
}

/**
 * Several new objects made by one request: a count the family declares repeatable ("draw three houses"), or
 * coordinated things ("draw a cat and 2 dogs", one compiled plan each). All of them are placed together in one
 * placement problem (solveGroupPlacement), then each call is made through the same observed native tool path as a
 * single make, in order. The reply says what was made, and which of them could not keep clear of other objects.
 * `members`: [{ candidate, plan }] with compiled make plans of the same area.
 */
export async function executeNativeGroup(session, members, { view, invocation = globalThis.crypto.randomUUID(), dropped = [] } = {}) {
  const area = NATIVE_AREAS[view], nativeState = area && session.isession.state[area.world];
  if (!nativeState || !members.length || members.some(({ plan }) => plan.status !== 'compiled' || plan.act !== 'make')) return null;
  const original = structuredClone(nativeState);
  const restore = (text, reason, trace = {}) => { session.isession.state[area.world] = original; return reply(text, false, { reason, ...trace }); };
  // The knowledge each tool declares for its arguments (a catalog drawing by name), loaded for every member.
  const lookups = {};
  for (const { plan } of members) {
    let prepared;
    try { prepared = await prepareNativeControlHost(session, { view, operation: plan.operation, args: plan.args, invocation }); }
    catch (error) { return restore(`I understood the request for ${plan.kind}, but could not load the knowledge required by its tool. Nothing changed.`, 'native-knowledge-unavailable', { error: String(error?.message ?? error) }); }
    for (const input of prepared.bindings().find((op) => op.id === plan.operation)?.knowledgeInputs ?? []) {
      const value = plan.args[input.argument];
      if (value !== undefined && !(lookups[input.argument] ??= []).includes(value)) lookups[input.argument].push(value);
    }
  }
  const host = await createAreaHost(area, { args: lookups, state: session.isession.state[area.world], instanceId: instanceIdFor(session, area.world),
    loader: session.engine?.loader, knowledge: session.engine?.knowledge });
  const subjects = members.flatMap(({ candidate, plan }) => Array.from({ length: plan.repeat ?? 1 }, () => ({ candidate, plan,
    operation: host.bindings().find((op) => op.id === plan.operation) })));
  if (subjects.some(({ operation }) => !operation) || subjects.length > 16) return restore('I could not apply that action. Nothing changed.', 'group-binding');
  const scalar = (value) => typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || typeof value === 'string';
  const token = (value) => typeof value === 'string' ? quote(value) : String(value);
  const call = (operation, values) => '@placement.call ' + operation.id + Object.entries(values).map(([key, value]) => ' ' + key + '=' + token(value)).join('');
  // One placement problem for every subject that asks for no place of its own.
  const free = subjects.filter(({ plan, operation }) => operation.spatial?.xKey && operation.spatial?.yKey && plan.args[operation.spatial.xKey] === undefined &&
    plan.args[operation.spatial.yKey] === undefined && Object.values(plan.args).every(scalar));
  const placed = free.length ? await solveGroupPlacement(host, { intents: free.map(({ plan, operation }) => call(operation, plan.args)) }) : null;
  if (placed?.solved) {
    free.forEach((subject, i) => { const port = subject.operation.spatial, place = placed.places[i];
      subject.args = { ...subject.plan.args, [port.xKey]: place.x, [port.yKey]: place.y, ...(port.sizeKey && subject.plan.args[port.sizeKey] === undefined ? { [port.sizeKey]: place.size } : {}) };
      subject.overlaps = place.overlaps; });
    try {
      session.engine?.onWorldActivity?.({ nodeIds: ['execution:placement-geometry', 'instance:' + area.world], world: area.world, operation: 'std.placement', phase: 'end',
        label: 'Solved group placement', status: 'compiled', provider: placed.provider, durationMs: placed.ms, subjects: free.length, solves: placed.solves, search: placed.z3, defaulted: placed.defaulted, wires: placed.choice?.input + '\n' + placed.choice?.sop });
    } catch { /* Inspection does not affect dispatch. */ }
  }
  const made = [], receipts = [], verifications = [], refused = [];
  for (const subject of subjects) {
    const args = subject.args ?? subject.plan.args, observed = host.observe(), toolInput = call(subject.operation, args);
    const intent = describeNativeControl({ operation: subject.operation, args, before: observed });
    const receipt = await invokeObservedNativeTool(session, { area, host, invocation: globalThis.crypto.randomUUID(), expectedVersion: observed.version, sop: toolInput });
    // The area's rules may refuse one thing (a kind it cannot draw) and accept the others: it is named, not made.
    if (receipt.status === 'refused') { refused.push({ kind: subject.plan.kind, reason: receipt.reason }); continue; }
    const after = host.observe();
    verifications.push(verifyNativeControlEffect({ intent, before: observed, after, receipt }));
    receipts.push(receipt);
    const old = new Set(observed.objects.map((object) => object.id));
    const object = after.objects.find((value) => !old.has(value.id) && (value.in ?? value.parent) === undefined);
    made.push({ subject, object, kind: object?.kind ?? subject.plan.kind });
  }
  const refusedList = [...new Set(refused.map((r) => r.kind))];
  if (!made.length) return restore('I could not make ' + refusedList.map((k) => 'a ' + k).join(' or ') + '. Nothing changed.', refused[0]?.reason ?? 'group-refused', { refused });
  session.newEngineFocus = { ...session.newEngineFocus, [view]: made.at(-1)?.object?.id ?? null };
  // "Created a cat and 2 dogs." The kinds in the order asked, each with its number.
  const counts = new Map();
  for (const { kind } of made) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const phrase = ([kind, count]) => count === 1 ? 'a ' + kind : count + ' ' + en.plural(kind);
  const list = [...counts].map(phrase), joined = list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list.at(-1) : list[0];
  const notes = [...new Set(members.flatMap(({ plan }) => plan.notes))];
  const crowded = made.filter(({ subject }) => subject.overlaps);
  if (crowded.length) notes.push(crowded.length === made.length ? 'There was no free room, so they overlap other objects.' : crowded.length + ' of them overlap other objects: there was no free room for them.');
  if (refusedList.length) notes.push('I could not make ' + refusedList.map((k) => 'a ' + k).join(' or ') + ' here.');
  const skipped = [...new Set(members.flatMap(({ plan }) => plan.skipped))];
  if (skipped.length) notes.push('I could not apply ' + skipped.join(', ') + '.');
  if (dropped.length) notes.push('I could not read ' + dropped.map((d) => JSON.stringify(d)).join(', ') + '.');
  const message = ['Created ' + joined + '.', ...notes].join(' ');
  return {
    ...reply(message, true, { assessment: receipts.every((r) => r.status === 'changed') ? 'changed' : receipts.at(-1)?.status, receipts, reading: members[0].candidate,
      readings: members.map(({ candidate }) => candidate), compiledSop: members.map(({ plan }) => plan.sop).join('\n'),
      group: { made: made.map(({ object, kind, subject }) => ({ id: object?.id ?? null, kind, overlaps: !!subject.overlaps })), requested: subjects.length, refused },
      ...(placed ? { solver: { provider: placed.solved ? placed.provider : null, compileMs: placed.ms, solves: placed.solves, z3: placed.z3 } } : {}),
      effectVerification: verifications.find((v) => v.status !== 'verified') ?? verifications[0], uncertainty: notes, partial: skipped.length > 0 || dropped.length > 0 || refused.length > 0 }),
    state: { [area.world]: structuredClone(session.isession.state[area.world]) },
    effects: receipts.filter((r) => r.status === 'changed').map(() => ({ operation: members[0].plan.operation })),
  };
}
