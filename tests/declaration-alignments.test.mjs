import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {proposeDeclarationAlignments} from '../training/sop-bert/propose-declaration-alignments.mjs';
function run(text,keys,options={}) {
  const wires=parse(text), world=World.fromJSON({format:'sopworld',version:1,log:[{op:'tell',wires,facts:wires.filter(w=>!['core.type','core.slot'].includes(w.type)).map(w=>w.id)}]});
  return proposeDeclarationAlignments({world,str,inventory:{arbitrary:{entity:{keys:Object.fromEntries(keys.map(k=>[k,{head:'span',concept:k}]))}}},families:[{area:'arbitrary',type:'entity',status:'aligned',canonical:'toy.child'}],...options});
}
const base='@toy.parent core.type of=toy.parent\n@toy.child core.type of=toy.child extends=toy.parent\n';
test('effective inherited slots, overriding child slots and exact declared aliases',()=>{
 const r=run(base+'@p core.slot of=toy.parent key=shade enum=cyan\n@c core.slot of=toy.child key=shade enum=gold\n@a core.word text=tint means=c', ['shade','tint']);
 assert.equal(r.rows.length,2);for(const row of r.rows){assert.equal(row.status,'declared-proposal');assert.equal(row.candidates[0].canonical,'c');assert.deepEqual(row.candidates[0].valueContract.declaration.enumValues,['gold']);}
});
test('cross-owner aliases are excluded and polysemy stays ambiguous',()=>{
 const r=run(base+'@p core.slot of=toy.parent key=shade\n@c core.slot of=toy.child key=title\n@x core.slot of=toy.unrelated key=foreign\n@a core.word text=shade means=c\n@b core.word text=foreign means=x', ['shade','foreign']);
 assert.equal(r.rows[0].reason,'ambiguous-applicable-property');assert.equal(r.rows[0].candidates.length,2);assert.equal(r.rows[1].reason,'missing-owning-property-or-alias');assert.equal(r.executionEligible,false);
});
test('reference, temporal and cardinality contracts are retained without coercion',()=>{
 const r=run(base+'@a core.slot of=toy.child key=when kind=time.clock\n@b core.slot of=toy.child key=items type=toy.parent many=true', ['when','items']);
 assert.deepEqual(r.rows[0].candidates[0].valueContract.declaration.kinds,['time.clock']);
 assert.ok(r.rows[1].candidates[0].valueContract.obligations.includes('resolve-typed-reference-and-role-ownership'));assert.ok(r.rows[1].candidates[0].valueContract.obligations.includes('preserve-declared-cardinality'));
});
test('provider values and aliases require exact type/by and word ownership',()=>{
 const r=run(base+'@s core.slot of=toy.child key=shade type=toy.palette by=name\n@v toy.palette name=cyan\n@a core.word text=azure means=cyan of=toy.palette.name\n@b core.word text=wrong means=cyan of=other.name',['shade']);
 const c=r.rows[0].candidates[0].valueContract;assert.deepEqual(c.providerValues.map(x=>x.value),['cyan']);assert.deepEqual(c.aliases.map(x=>x.text),['azure']);
});
test('undeclared parent contributes no inferred property; explicit owned slot remains visible',()=>{
 const r=run('@toy.child core.type of=toy.child extends=unknown\n@a core.slot of=toy.child key=value',['value','absent']);assert.equal(r.rows[0].status,'declared-proposal');assert.deepEqual(r.rows[0].family.missingParents,['unknown']);assert.equal(r.rows[1].status,'unresolved');
});
test('cycles and exhausted budgets fail the export instead of emitting partial success',()=>{
 assert.throws(()=>run('@toy.child core.type of=toy.child extends=toy.child',['x']),/inheritance-cycle/);
 assert.throws(()=>run(base,['x'],{budget:1}),/join-budget/);
 assert.throws(()=>run(base+'@s core.slot of=toy.child key=x type=toy.p by=name\n@v toy.p name=a name=b',['x'],{maxValues:1}),/value-budget/);
});
test('missing families stay grouped knowledge tasks, with every descriptor retained',()=>{
 const r=run(base,['first','second'],{families:[]});assert.equal(r.rows.length,2);assert.equal(r.rows.filter(x=>x.status==='unresolved').length,2);assert.ok(r.tasks.every(t=>t.reason==='missing-applicable-family-identity'));assert.ok(r.tasks.every(t=>t.details.required.includes('shared class')));
});
