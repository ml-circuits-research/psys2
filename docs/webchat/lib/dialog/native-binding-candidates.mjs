import { World, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b665fdbe3d';
import { executionPolicyWorld } from './execution-policy.mjs?v=c5b63898f5';
import CONSTRUCTORS from '../../worlds/app.project/constructor-policy-source.mjs?v=91bc3b4d74';
import SCHEMA from '../../worlds/app.project/constructor-schema-source.mjs?v=97be28057e';
import { budget } from './budget.mjs?v=00bce6e369';

// Preserve declared alternatives for reversible best-effort interpretation; the strict bridge can still abstain.
// Declared kind bindings (execution-policy.sop app.execution.kindBinding) give a table kind without a native family
// binding the operation and fixed argument that draw it; every lemma of the kind in the table takes it.
let declaredKinds;
const kindDeclarations=()=>declaredKinds??=executionPolicyWorld().ofType('app.execution.kindBinding').map(row=>Object.fromEntries(['area','kind','operation','parameter','value'].filter(key=>row.attrs[key]?.length).map(key=>[key,str(row.attrs[key][0])])));
function withDeclaredKind(row){
 if(row.nativeFamilyBinding)return row;
 const declared=kindDeclarations().filter(d=>d.area===row.area&&d.kind===row.canonical);
 if(declared.length!==1)return row;
 const [d]=declared;
 return {...row,nativeFamilyBinding:{operation:d.operation,...(d.parameter?{arguments:{[d.parameter]:d.value}}:{}),declaration:'execution-policy.sop app.execution.kindBinding',boundary:'Declared kind binding: the kind is drawn by this operation with this argument.'}};
}
export function nativeKindCandidates(bindings) {
 return [...(bindings.kinds??[]).map(withDeclaredKind),...(bindings.families??[]).filter(f=>f.nativeFamilyBinding).map(f=>({...f,lemma:f.type,familyIdentity:true})),...(bindings.unresolved??[]).filter(r=>r.family==='kinds'&&r.reason==='ambiguous-canonical-kind'&&r.rawDescriptor).flatMap(r=>(r.candidates??[]).filter(c=>c.nativeFamilyBinding).map(c=>({...c,area:r.rawDescriptor.area,type:r.rawDescriptor.type,lemma:r.rawDescriptor.kind})))];
}

let loaded;
function constructorWorld() {
 if (!loaded) {
  const world = new World({ library: { 'app.constructor': SCHEMA } });
  if (!world.tell(CONSTRUCTORS).ok) throw Error('invalid-native-constructor-policy');
  loaded = world;
 }
 return loaded.fork();
}
export function inspectConstructorPolicy() {
 return { policy: CONSTRUCTORS, schema: SCHEMA, loaded: !!loaded };
}

const scalar = value => value === undefined ? [] : [quote(value)];
const wire = (id, type, attrs) => ({ id, type: 'app.constructor.' + type, attrs, pattern: false });
const indexOfReference = (row, key) => Number(row.attrs[key][0].split('.').at(-1));

// A frozen binding table cannot change, so the constructor pairs derived for it are reused while the
// declared operation metadata the facts are built from (and the area) stay the same.
const derivedPairs = new WeakMap();
const operationEvidence = operations => JSON.stringify(operations.map(operation => [operation.id, operation.act, operation.on, operation.requires?.length ?? 0,
 operation.knowledgeInputs?.length ?? 0, Object.entries(operation.params).map(([name, parameter]) => [name, parameter.enum ?? []])]));

/** Project actual tool metadata and retain all constructor pairs derived by SOP. */
export function nativeCreationCandidates(bindings, operations, area) {
 const memo = bindings && typeof bindings === 'object' && Object.isFrozen(bindings) ? (derivedPairs.get(bindings) ?? derivedPairs.set(bindings, { mappings: nativeKindCandidates(bindings).map(row => Object.freeze(row)), pairs: new Map() }).get(bindings)) : null;
 const key = memo ? JSON.stringify([area ?? null, operationEvidence(operations)]) : null, known = memo?.pairs.get(key);
 if (known) return known.map(([mapping, operation]) => ({ mapping: memo.mappings[mapping], operation: operations[operation] }));
 const mappings = memo?.mappings ?? nativeKindCandidates(bindings);
 const world = constructorWorld(), facts = [wire('constructor.query.input', 'scope', { area: scalar(area) })];
 for (const [index, mapping] of mappings.entries()) {
  budget.tick('constructor.mapping');
  const operation = mapping.nativeFamilyBinding?.operation;
  if (operation === undefined) continue;
  facts.push(wire('constructor.mapping.' + index, 'mapping', {
   area: scalar(mapping.area), lemma: scalar(mapping.lemma), operation: scalar(operation), family: [String(Boolean(mapping.familyIdentity))],
  }));
 }
 for (const [index, operation] of operations.entries()) {
  budget.tick('constructor.operation');
  const id = 'constructor.operation.' + index;
  facts.push(wire(id, 'operation', {
   name: scalar(operation.id), act: scalar(operation.act), on: scalar(operation.on),
   requirements: [String(operation.requires?.length ?? 0)], knowledge: [String(operation.knowledgeInputs?.length ?? 0)],
  }));
  for (const [name, parameter] of Object.entries(operation.params)) {
   budget.tick('constructor.parameter');
   facts.push(wire('constructor.parameter.' + facts.length, 'parameter', {
    operation: ['$' + id], name: scalar(name), enum: (parameter.enum ?? []).map(value => JSON.stringify(value)),
   }));
  }
 }
 if (!world.tell(serialize(facts), { factsOnly: true }).ok) throw Error('invalid-native-constructor-evidence');
 const pairs = world.ofType('app.constructor.candidate').map(row => [indexOfReference(row, 'mapping'), indexOfReference(row, 'operation')]).sort(([am, ao], [bm, bo]) => am - bm || ao - bo);
 if (memo) { if (memo.pairs.size >= 32) memo.pairs.delete(memo.pairs.keys().next().value); memo.pairs.set(key, pairs); }
 return pairs.map(([mapping, operation]) => ({ mapping: mappings[mapping], operation: operations[operation] }));
}
