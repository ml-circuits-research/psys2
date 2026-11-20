// SPDX-License-Identifier: AGPL-3.0-only
import { parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import { decodeCapabilityCall } from '../vendor/sopworld/capability-call.mjs?v=ed3b773c65';
import POLICY from '../../worlds/app.project/capability-policy.mjs?v=281892343f';
import CLOCK from '../../worlds/app.project/clock-projection-source.mjs?v=7d09f121c5';
import { executionPolicyWorld } from './execution-policy.mjs?v=a4fd91036a';
import { projectionModule } from './composition-knowledge.mjs?v=5c7e8ecb12';
import { sceneDefaultModule, writeSceneDefaults } from './scene-placement-defaults.mjs?v=cb0a7e6152';
import { nativeKindCandidates } from './native-binding-candidates.mjs?v=9e204238e4';
import { observedReaderContext } from './native-reader-context.mjs?v=fd7d15346c';
import { budget } from './budget.mjs?v=00bce6e369';
import { en } from '../lang/en.mjs?v=3eccaf3ffb';

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

let identityNames;
const identityParameters = () => identityNames ??= new Set(parse(POLICY).filter((wire) => wire.type === NS + 'seed' &&
  ['target.list', 'target.id'].includes(take(wire, 'source'))).map((wire) => take(wire, 'parameter')));

function interfaceFacts({ area, view, bindings, host, observation, focus, targetUnique, unapplied, readKnowledge, sceneDefaults, previews = [] }, concepts, said = [], selectors = new Set()) {
  const { write, value, wires } = factWriter();
  const scope = write(NS + 'scope', {
    instance: quote(observation.instanceId), version: quote(observation.version), population: typeof observation.scope==='string' ? quote(observation.scope) : undefined,
    populationComplete: String(observation.complete===true), focus: focus === undefined ? undefined : quote(String(focus)),
    newId: quote(globalThis.crypto.randomUUID()), targetUnique: targetUnique ? "true" : undefined, clock: String(Date.now()), unapplied: unapplied.map(quote),
  }, 'capability.scope');
  const declarations = host.capabilityFacts(scope);
  wires.push(...declarations);
  const admitted = declarations.filter((wire) => wire.type === NS + 'operation');
  const operations = new Map(admitted.map((wire) => [take(wire, 'name'), ref(wire.id)]));
  const sourceTypes = new Set(admitted.map((wire) => take(wire, 'on')));
  writeSceneDefaults(sceneDefaults,host,scope,operations,write,wires);
  const readerArea = bindings.readerAreaByView?.[view] ?? area.area;
  // A kind whose own source name is aligned (whole-source-family) is named by it; its word forms (plurals,
  // synonyms joined through source words) are the reader's surface, not further native names.
  const kindRows = nativeKindCandidates(bindings).filter((row) => row.area === readerArea);
  const ownNamed = new Set(kindRows.filter((row) => row.alignment?.kind === 'whole-source-family').map((row) => row.canonical));
  for (const row of kindRows) {
    const binding = row.nativeFamilyBinding;
    if (!binding || !operations.has(binding.operation)) continue;
    if (row.alignment?.kind === 'source-word-value-join' && ownNamed.has(row.canonical)) continue;
    const args = Object.entries(binding.arguments || {}).map(([name, datum]) =>
      write(NS + 'arg', { name: quote(name), value: value(datum) }));
    write(NS + 'target', { scope, canonical: row.canonical, label: quote(row.lemma), operation: operations.get(binding.operation), argument: args, family: row.familyIdentity ? 'true' : undefined });
  }

  const executionPolicy = executionPolicyWorld();
  const valueMappings = new Map(executionPolicy.ofType('app.execution.values').map((row) => [take(row, 'concept'), row]));
  const observed = executionPolicy.ofType('app.execution.observedProperty');
  const measures = executionPolicy.ofType('app.execution.observedMeasure');
  const normalizedBindings = new Set(observed.filter((row) => row.attrs.format).map((row) => take(row, 'binding')));
  // A reference concept's values are the observed objects it can name (capability-policy.sop: by code, name or kind).
  const references = new Set(executionPolicy.ofType('app.execution.reference').map((row) => take(row, 'concept')));
  // A parameter that takes one of its declared names (an enum: the diagram's colour names) takes the said name itself,
  // not the value a lookup would give for it (an RGB code).
  const named = new Set((typeof host.bindings === 'function' ? host.bindings() : []).flatMap((operation) =>
    Object.entries(operation.params ?? {}).filter(([, parameter]) => Array.isArray(parameter.enum) && parameter.enum.length)
      .map(([name]) => operation.on + '\0' + name)));
  const codecs = { 'number-list': 'number.list', 'string-list': 'string.list' };
  let propertyOrder = Math.max(-1, ...[...observed, ...measures].map((row) => Number(take(row, 'order')))) + 1;
  // A selector on a parameter the policy fills with the target's own identity (std.capability.seed
  // source=target.list|target.id: "ids", "id") names the object itself ("the Plan label", "node n1"): its concept is
  // a reference concept of its source type (by code, name or kind), observed on each object as the object's code.
  const identities = new Map(), mappedConcepts = new Set();
  for (const row of bindings.properties || []) {
    const binding = row.hostBinding;
    if (row.area !== readerArea || !sourceTypes.has(binding?.sourceType)) continue;
    const identity = selectors.has(row.canonical) && identityParameters().has(binding.parameter);
    const observedAs = identity ? 'identity:' + binding.sourceType + '.' + binding.parameter : binding.id;
    if (identity && !identities.has(row.canonical + '\0' + binding.sourceType)) {
      identities.set(row.canonical + '\0' + binding.sourceType, { sourceType: binding.sourceType, binding: observedAs, key: binding.parameter });
      write('app.execution.reference', { concept: row.canonical, sourceType: quote(binding.sourceType) });
    }
    // A key declared with said values (declared-bindings.mjs rule 5: legend "hide" is the parameter's "none") resolves
    // each said value through its declared parameter value.
    const mapped = !identity && Array.isArray(row.valueMap) && row.valueMap.length;
    if (mapped) for (const { said, value: datum } of row.valueMap) {
      if (mappedConcepts.has(row.canonical + '\0' + said)) continue;
      mappedConcepts.add(row.canonical + '\0' + said);
      write(NS + 'value', { concept: row.canonical, label: quote(said), value: typeof datum === 'string' ? quote(datum) : token(datum) });
    }
    write(NS + 'property', { scope, concept: row.canonical, on: quote(binding.sourceType), parameter: quote(binding.parameter),
      binding: observedAs ? quote(observedAs) : undefined,
      codec: identity || mapped ? 'lookup' : codecs[binding.codec] || (references.has(row.canonical) || take(valueMappings.get(row.canonical), 'codec') === 'lookup' && !named.has(binding.sourceType + '\0' + binding.parameter) ? 'lookup' : undefined), order: String(propertyOrder++) });
  }
  // The single-valued observations of the objects a preview of a compiled call creates (degree-bases.mjs).
  for (const { operation, kind, objects } of previews) for (const object of objects) for (const field of object.inputs ?? []) {
    if (field.values?.length === 1) write('app.execution.preview', { scope, operation: quote(operation), kind, on: quote(object.sourceType),
      binding: quote(field.binding), value: field.values[0] });
  }

  const knowledgeTypes = new Set([...valueMappings].filter(([concept]) => concepts.has(concept))
    .map(([, mapping]) => take(mapping, 'valueType')));
  for (const row of executionPolicy.ofType('app.execution.knowledge'))
    if (concepts.has(take(row, 'concept'))) knowledgeTypes.add(take(row, 'valueType'));
  for (const type of knowledgeTypes) wires.push(...readKnowledge().ofType(type));
  // The values the request says for concepts with declared values, as said: declared rules may project them
  // (clock-projection.sop: a clock time for an instant).
  for (const { concept, label, mode } of said)
    if (valueMappings.has(concept)) write('app.execution.requestValue', { scope, concept, label: quote(label), mode });

  const names = observedReaderContext(area.area, observation).context.existing;
  for (const [order, object] of observation.objects.entries()) {
    const id = write(NS + 'object', {
      scope, id: quote(String(object.id)), source: quote(object.source), version: quote(object.version),
      on: quote(object.sourceType), kind: quote(object.kind), name: names[order]?.name === undefined ? undefined : quote(names[order].name),
      order: String(order),
    });
    for (const identity of identities.values()) if (identity.sourceType === object.sourceType)
      write(NS + 'field', { object: id, binding: quote(identity.binding), key: quote(identity.key), value: quote(String(object.id)) });
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
  const scenePlaced = proof.some(id => world.get(id)?.type === 'app.sceneDefault.option');
  let sceneEvidence;
  const catalogModules = new Set();
  if (scenePlaced) {
    const sceneFacts = proof.map(id => world.get(id)).filter(row => row?.type.startsWith(sceneDefaultModule.name + '.'));
    const usedRegions = sceneFacts.filter(row => row.type === sceneDefaultModule.name + '.region');
    const projectedIds = new Set(world.ofType(sceneDefaultModule.name + '.region').map(row => row.attrs.value[0].slice(1)));
    const catalogIds = new Set();
    for (const region of usedRegions) {
      const module = projectionModule(take(region, 'profile'));
      if (module) catalogModules.add(module);
      catalogIds.add(region.attrs.value[0].slice(1));
    }
    // A projected record can refer to evidence returned by the same profile.
    // Traverse those edges once, without guessing source families from their type names.
    for (const id of catalogIds) {
      budget.tick('capability.projected-evidence');
      for (const token of Object.values(world.get(id)?.attrs ?? {}).flat()) {
        if (token.startsWith('$') && projectedIds.has(token.slice(1))) catalogIds.add(token.slice(1));
      }
    }
    for (const id of catalogIds) if (!proof.includes(id)) proof.push(id);
    sceneEvidence = serialize([...sceneFacts, ...[...catalogIds].map(id => world.get(id)).filter(Boolean)]);
  }
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
    scenePlaced, sceneEvidence, catalogModules:[...catalogModules], skipped: values(result, 'skipped'), notes: values(result, 'note'), support: proof, knowledgeSupport,
    selector: take(result, 'selector'),
    selection: (result?.attrs.selection || []).map(find).map((row) => ({
      id: take(row, 'id'), status: take(row, 'status'), support: support(row),
    })),
    covered: values(result, 'covered'),
    // A count the family declares repeatable (std.capability.repeat): the call is made that many times.
    repeat: Number(result?.attrs.repeat?.[0]) > 1 ? Number(result.attrs.repeat[0]) : 1,
    operation: call?.operation, args: call?.args ?? {}, toolInput, alternatives,
  };
}

let declarations;
/** The concepts an area's binding table binds to an identity parameter (std.capability.seed source=target.list|target.id). */
export function identityConcepts(bindings, readerArea) {
  return new Set((bindings?.properties || []).filter((row) => row.area === readerArea && identityParameters().has(row.hostBinding?.parameter)).map((row) => row.canonical));
}
export function inspectCapabilityPolicy() {
  return { loaded: !!declarations, source: 'worlds/app.project/capability-policy.sop', wires: POLICY };
}

/** Compose live interface facts and compile the original SOP graph. */
function compilerWorld(context, nodes) {
  if (!declarations) {
    const world = executionPolicyWorld().fork();
    if (!world.use('std.interpret').ok) throw Error('capability-contract-unavailable');
    world.load(POLICY);
    world.load(CLOCK);
    world.load(sceneDefaultModule.policy);
    declarations = world;
  }
  const constraints = nodes.filter(wire => wire.type === 'std.request.constraint');
  const concepts = new Set(constraints.map(wire => take(wire, 'concept')));
  const targets = new Map(nodes.filter(wire => wire.type === 'std.request.target').map(wire => ['$' + wire.id, take(wire, 'mode')]));
  const said = constraints.map(wire => ({ concept: take(wire, 'concept'), label: take(wire, 'value'), mode: targets.get(wire.attrs.target?.[0]) }))
    .filter(row => typeof row.label === 'string' && ['new', 'existing'].includes(row.mode));
  const selectorIds = new Set(nodes.filter(wire => wire.type === 'std.request.target').flatMap(wire => values(wire, 'selector')));
  const selectors = new Set(constraints.filter(wire => selectorIds.has('$' + wire.id)).map(wire => take(wire, 'concept')));
  const compose = sceneDefaults => {
    const {wires,scope}=interfaceFacts({...context,sceneDefaults},concepts,said,selectors);
    const world=declarations.fork();
    return world.tell(serialize(wires),{factsOnly:true}).ok ? {world,scope} : null;
  };
  // Optional scene evidence may exceed the rule budget or be inconsistent.
  const configured=compose(context.sceneDefaults) ?? (context.sceneDefaults && compose(null));
  if(!configured)throw Error('invalid-capability-interface');
  return configured;
}
function contextWire(id,request,scope) {
  return {id,type:NS+'context',attrs:{request:[ref(request)],scope:[scope]}};
}
// A declared act form (execution-policy.sop app.execution.actForm): the request's act compiles as another act when
// its target has the declared mode ("connect A to B" makes the line between them).
function declaredActForm(nodes) {
  const request=nodes.find(wire=>wire.type==='std.request'),act=take(request,'act');
  const target=nodes.find(wire=>wire.type==='std.request.target'&&wire.attrs.request?.[0]==='$'+request?.id);
  // `results`: whether the request says what to change (a constraint that is not the target's selector).
  const selectors=new Set(nodes.filter(wire=>wire.type==='std.request.target').flatMap(wire=>values(wire,'selector')));
  const results=nodes.some(wire=>wire.type==='std.request.constraint'&&!selectors.has('$'+wire.id))?'some':'none';
  const form=executionPolicyWorld().ofType('app.execution.actForm').find(row=>take(row,'act')===act&&take(row,'mode')===take(target,'mode')&&(!row.attrs.results||take(row,'results')===results)&&(!row.attrs.of||values(row,'of').includes(take(target,'kind'))));
  if(!form)return nodes;
  return nodes.map(wire=>wire===request?{...wire,attrs:{...wire.attrs,act:[take(form,'as')]}}:wire);
}
// A target named by the same words as its identity selector ("the line e1": name e1, link.ids = e1) is picked by the
// selector, which matches a code, a name or a kind; the name alone would require an observed name (a line has none).
function identityNamesToSelectors(nodes, bindings) {
  const identity = new Set((bindings?.properties || []).filter((row) => identityParameters().has(row.hostBinding?.parameter)).map((row) => row.canonical));
  const byId = new Map(nodes.map((wire) => [wire.id, wire]));
  return nodes.map((wire) => {
    if (wire.type !== 'std.request.target' || take(wire, 'name') === undefined) return wire;
    const c = byId.get(String(wire.attrs.selector?.[0] ?? '').slice(1));
    if (!c || c.type !== 'std.request.constraint' || take(c, 'operator') !== 'eq' || take(c, 'polarity') !== 'positive' || !identity.has(take(c, 'concept')) || take(c, 'value') !== take(wire, 'name')) return wire;
    const { name, ...attrs } = wire.attrs;
    return { ...wire, attrs };
  });
}
// A list said with the language's coordinators ("Q2 and Sample", "Jan, Feb and Mar") for a property whose parameter
// takes a list (string-list, number-list) is the list of its conjuncts (w.lang.en coord.sep): the compiler's list
// codec reads comma-separated items.
let separators;
function saidLists(nodes,bindings){
  const listed=new Set((bindings?.properties??[]).filter(row=>['string-list','number-list'].includes(row.hostBinding?.codec)).map(row=>row.canonical));
  if(!listed.size)return nodes;
  separators??=[...en.words('coord.sep','things')].map(word=>/^[\p{L}\p{N}]+$/u.test(word)?'\\s+'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+':'\\s*'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*');
  const split=new RegExp('(?:'+separators.join('|')+')+','iu');
  return nodes.map(wire=>{
    if(wire.type!=='std.request.constraint'||!listed.has(take(wire,'concept')))return wire;
    const said=take(wire,'value');
    if(typeof said!=='string'||/^\s*\[/.test(said))return wire;
    const items=said.split(split).map(item=>item.trim());
    if(items.length<2||items.some(item=>!item))return wire;
    const joined=items.join(', ');
    return joined===said?wire:{...wire,attrs:{...wire.attrs,value:[quote(joined)]}};
  });
}
export function compileNativeCapability(candidate, context) {
  const nodes=saidLists(declaredActForm(parse(candidate.wires)),context?.bindings), {world,scope}=compilerWorld(context,nodes);
  if(!nodes.some(w=>w.type==='std.request'&&w.id===candidate.request))return readPlan(world,'@compile.result std.compile.result status=not-applicable reason=request-root');
  const plan=readPlan(world,world.compileRequest(serialize([...nodes,contextWire('capability.context',candidate.request,scope)])));
  // Only when no object has the said name (a line has none), the identity selector alone picks the target.
  if(plan?.reason!=='target')return plan;
  const named=identityNamesToSelectors(nodes,context?.bindings);
  if(named.every((wire,i)=>wire===nodes[i]))return plan;
  const second=compilerWorld(context,named);
  return readPlan(second.world,second.world.compileRequest(serialize([...named,contextWire('capability.context',candidate.request,second.scope)])));
}

export function compileNativeQuery(sop,context){
  const nodes=parse(sop),root=nodes.find(wire=>wire.type==='std.request');
  if(!root?.attrs.query?.length)return '@compile.result std.compile.result status=unavailable reason=query-root';
  const {world,scope}=compilerWorld(context,nodes);
  return world.compileRequest(serialize([...nodes,contextWire('capability.context',root.id,scope)]));
}

/** Keep each proposal's private identifiers distinct while preserving its actual request wires. */
export function compareNativeReadings(candidates, context) {
  const graphs=candidates.map(candidate=>saidLists(parse(candidate.wires),context.bindings));
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
