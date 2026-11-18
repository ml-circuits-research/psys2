// SPDX-License-Identifier: AGPL-3.0-only
import { parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b7d50d9480';
import { decodeCapabilityCall } from '../vendor/sopworld/capability-call.mjs?v=ed3b773c65';
import POLICY from '../../worlds/app.project/capability-policy.mjs?v=9f3103a196';
import { executionPolicyWorld } from './execution-policy.mjs?v=9ad12c3289';
import { nativeKindCandidates } from './native-binding-candidates.mjs?v=5d5aa4bc25';
import { observedReaderContext } from './native-reader-context.mjs?v=1f97f6d3a1';
import { budget } from './budget.mjs?v=00bce6e369';

const NS = 'std.capability.';
const take = (wire, key) => str(wire?.attrs[key]?.[0]);
const token = (value) => Object.is(value, -0) ? '-0' : JSON.stringify(value);
const ref = (wire) => '$' + wire;
const values = (wire, key) => (wire?.attrs[key] || []).map(str);

function factWriter() {
  const wires = [];
  let values = 0;
  function write(type, fields, id = 'capability.input.' + wires.length) {
    const attrs = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, [].concat(value)]));
    wires.push({ id, type, attrs, pattern: false });
    return ref(id);
  }
  function value(data, depth = 0) {
    budget.tick('capability.encode');
    if (++values > 100000 || depth > 24) throw Error('capability-value-budget');
    if (data === null || typeof data !== 'object') return token(data);
    if (Array.isArray(data)) {
      return write(NS + 'list', { member: data.map((item, index) =>
        write(NS + 'item', { index: String(index), value: value(item, depth + 1) })) });
    }
    return write(NS + 'record', { entry: Object.entries(data).map(([name, datum]) =>
      write(NS + 'arg', { name: quote(name), value: value(datum, depth + 1) })) });
  }
  return { write, value, wires };
}

function interfaceFacts({ area, view, bindings, host, observation, focus, targetUnique, unapplied, readKnowledge }, concepts) {
  const { write, value, wires } = factWriter();
  const scope = write(NS + 'scope', {
    instance: quote(observation.instanceId), version: quote(observation.version), focus: focus === undefined ? undefined : quote(String(focus)),
    newId: quote(globalThis.crypto.randomUUID()), targetUnique: targetUnique ? "true" : undefined, clock: String(Date.now()), unapplied: unapplied.map(quote),
  }, 'capability.scope');
  const declarations = host.capabilityFacts(scope);
  wires.push(...declarations);
  const admitted = declarations.filter((wire) => wire.type === NS + 'operation');
  const operations = new Map(admitted.map((wire) => [take(wire, 'name'), ref(wire.id)]));
  const sourceTypes = new Set(admitted.map((wire) => take(wire, 'on')));
  const readerArea = bindings.readerAreaByView?.[view] ?? area.area;
  for (const row of nativeKindCandidates(bindings)) {
    const binding = row.nativeFamilyBinding;
    if (row.area !== readerArea || !binding || !operations.has(binding.operation)) continue;
    const args = Object.entries(binding.arguments || {}).map(([name, datum]) =>
      write(NS + 'arg', { name: quote(name), value: value(datum) }));
    write(NS + 'target', { scope, canonical: row.canonical, label: quote(row.lemma), operation: operations.get(binding.operation), argument: args });
  }

  const executionPolicy = executionPolicyWorld();
  const valueMappings = new Map(executionPolicy.ofType('app.execution.values').map((row) => [take(row, 'concept'), row]));
  const observed = executionPolicy.ofType('app.execution.observedProperty');
  const normalizedBindings = new Set(observed.filter((row) => row.attrs.format).map((row) => take(row, 'binding')));
  const codecs = { 'number-list': 'number.list', 'string-list': 'string.list' };
  let propertyOrder = Math.max(-1, ...observed.map((row) => Number(take(row, 'order')))) + 1;
  for (const row of bindings.properties || []) {
    const binding = row.hostBinding;
    if (row.area !== readerArea || !sourceTypes.has(binding?.sourceType)) continue;
    write(NS + 'property', { scope, concept: row.canonical, on: quote(binding.sourceType), parameter: quote(binding.parameter),
      binding: binding.id ? quote(binding.id) : undefined,
      codec: codecs[binding.codec] || take(valueMappings.get(row.canonical), 'codec'), order: String(propertyOrder++) });
  }

  const knowledgeTypes = new Set([...valueMappings].filter(([concept]) => concepts.has(concept))
    .map(([, mapping]) => take(mapping, 'valueType')));
  for (const type of knowledgeTypes) wires.push(...readKnowledge().ofType(type));

  const names = observedReaderContext(area.area, observation).context.existing;
  for (const [order, object] of observation.objects.entries()) {
    const id = write(NS + 'object', {
      scope, id: quote(String(object.id)), source: quote(object.source), version: quote(object.version),
      on: quote(object.sourceType), kind: quote(object.kind), name: names[order]?.name === undefined ? undefined : quote(names[order].name),
      order: String(order),
    });
    for (const field of object.inputs) {
      if (field.source !== object.source || field.sourceType !== object.sourceType ||
          field.version !== observation.version || object.version !== observation.version) continue;
      const type = normalizedBindings.has(field.binding) ? 'app.execution.observedField' : NS + 'field';
      write(type, { object: id, binding: quote(field.binding), key: quote(field.key), value: field.values });
    }
  }
  return { wires, scope };
}

function readPlan(world,sop) {
  const rows = parse(sop), byId = new Map(rows.map((wire) => [wire.id, wire]));
  const result = rows.find((wire) => wire.type === NS + 'result') ?? rows.find((wire) => wire.type === 'std.compile.result');
  const find = (id) => byId.get(id?.slice(1));
  const toolInput = result?.attrs.call ? world.compileToolInput(sop) : undefined;
  const call = toolInput ? decodeCapabilityCall(parse(toolInput)) : null;
  if (call?.reason) throw Error(call.reason);
  const support = (wire) => [...new Set(values(wire, 'support').flatMap(id =>
    [id, ...(world.why(id)?.steps || []).map(step => step.id)]))];
  const proof = support(result);
  const knowledgeTypes = new Set(world.ofType('app.execution.values').map(row => take(row, 'valueType')));
  const knowledgeSupport = proof.filter(id => knowledgeTypes.has(world.get(id)?.type));
  const alternatives = (result?.attrs.alternative || []).map((id) => {
    const alternative = find(id);
    return { operation: take(alternative, 'operation'), status: take(alternative, 'status'), reason: take(alternative, 'reason') };
  });
  return {
    sop, status: take(result, 'status'), reason: take(result, 'reason'), message: take(result, 'message'),
    act: take(result, 'act'), kind: take(result, 'kind'), id: take(result, 'id'), source: take(result, 'source'),
    instance: take(result, 'instance'), version: take(result, 'version'), targets: values(result, 'target'),
    skipped: values(result, 'skipped'), notes: values(result, 'note'), support: proof, knowledgeSupport,
    selector: take(result, 'selector'),
    selection: (result?.attrs.selection || []).map(find).map((row) => ({
      id: take(row, 'id'), status: take(row, 'status'), support: support(row),
    })),
    covered: values(result, 'covered'),
    operation: call?.operation, args: call?.args ?? {}, toolInput, alternatives,
  };
}

let declarations;
export function inspectCapabilityPolicy() {
  return { loaded: !!declarations, source: 'worlds/app.project/capability-policy.sop', wires: POLICY };
}

/** Compose live interface facts and compile the original SOP graph. */
function compilerWorld(context, nodes) {
  if (!declarations) {
    const world = executionPolicyWorld().fork();
    if (!world.use('std.interpret').ok) throw Error('capability-contract-unavailable');
    world.load(POLICY);
    declarations = world;
  }
  const concepts = new Set(nodes.filter(wire => wire.type === 'std.request.constraint').map(wire => take(wire, 'concept')));
  const {wires,scope}=interfaceFacts(context, concepts);
  const world=declarations.fork();
  if (!world.tell(serialize(wires),{factsOnly:true}).ok) throw Error('invalid-capability-interface');
  return {world,scope};
}
function contextWire(id,request,scope) {
  return {id,type:NS+'context',attrs:{request:[ref(request)],scope:[scope]}};
}
export function compileNativeCapability(candidate, context) {
  const nodes=parse(candidate.wires), {world,scope}=compilerWorld(context,nodes);
  if(!nodes.some(w=>w.type==='std.request'&&w.id===candidate.request))return readPlan(world,'@compile.result std.compile.result status=not-applicable reason=request-root');
  return readPlan(world,world.compileRequest(serialize([...nodes,contextWire('capability.context',candidate.request,scope)])));
}

/** Keep each proposal's private identifiers distinct while preserving its actual request wires. */
export function compareNativeReadings(candidates, context) {
  const graphs=candidates.map(candidate=>parse(candidate.wires));
  const {world,scope}=compilerWorld(context,graphs.flat());
  const packet=[],requests=new Map(),originals=[],options=[];
  for(const [index,nodes] of graphs.entries()){
    budget.tick('interpretation.source');
    const prefix='proposal.'+index+'.', ids=new Map(nodes.map((w,i)=>[w.id,prefix+i]));
    const request=ids.get(candidates[index].request);
    requests.set(request,index);
    originals.push(new Map([...ids].map(([original, renamed]) => [renamed, original])));
    const members=nodes.map(w=>({...w,id:ids.get(w.id),attrs:Object.fromEntries(Object.entries(w.attrs).map(([key,tokens])=>
      [key,tokens.map(v=>v[0]==='$'&&ids.has(v.slice(1))?ref(ids.get(v.slice(1))):v)]))}));
    members.push(contextWire(prefix+'context',request,scope));
    const id=prefix+'option';
    packet.push(...members,{id,type:'std.interpret.proposal',attrs:{request:[ref(request)],member:members.map(w=>ref(w.id))}});
    options.push(ref(id));
  }
  packet.push({id:'interpret.input',type:'std.interpret.input',attrs:{proposal:options}});
  const sop=world.compileRequest(serialize(packet)),records=parse(sop),summary=records[0];
  const selected=records.find(w=>ref(w.id)===summary.attrs.choice?.[0]);
  const index=selected?requests.get(take(selected,'request')):undefined;
  if(index===undefined)return {sop};
  const planRoot=records.find(w=>ref(w.id)===summary.attrs.plan?.[0]);
  const plan=readPlan(world,serialize([planRoot,...records.filter(w=>w.id.startsWith('interpret.plan.')&&w!==planRoot)]));
  const origin = originals[index];
  plan.covered = plan.covered.map(id => origin.get(id) ?? id);
  if (plan.selector) plan.selector = origin.get(plan.selector) ?? plan.selector;
  return {sop,index,plan};
}
