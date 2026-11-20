import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
const source={sourceWorld:'fixture.source',moduleVersion:'1',sourceSnapshotSHA:'b'.repeat(64)},bindingSha256='c'.repeat(64);
const bindings={format:'sop.structural-bindings/1',kinds:[{area:'toy',type:'item',lemma:'widget',canonical:'fixture.widget',sourceWire:'fixture.widget',...source}],properties:[{area:'toy',key:'item.tint',canonical:'tint',valueKind:'string',sourceWire:'fixture.tint',...source}],units:[],projectionPolicy:{unmarkedConditions:'and',sourcePromptSha256:'d'.repeat(64)}};
const condition=(value,phase='result')=>({key:'item.tint',value,value_span:value,phase,operator:'eq',character:'requirement',polarity:'positive'});
const raw=(request,text=request.span)=>({format:RAW_STRUCTURAL_FORMAT,area:'toy',source:{text,unit:'unicode-scalar'},model:{kind:'structural-graph',sha256:'a'.repeat(64),decoderVersion:1},requestCount:1,requests:[request],coverage:{complete:true,truncated:false},unresolved:[],ranges:[]});
const sample=()=>({span:'set widget cerulean',trigger:'set',act:'change',mood:'do',target:{type:'item',mode:'existing',kind:'widget',kind_span:'widget'},constraints:[condition('cerulean')]});
const bridge=p=>bridgeRawStructure(p,{bindings,bindingSha256});
test('generated toy supported structures match C1 deterministic projection exactly',()=>{
 const fixtures=[sample(),{...sample(),span:'set red widget cerulean',constraints:[condition('red','selector'),condition('cerulean')]},{...sample(),span:'set each widget cerulean',target:{...sample().target,mode:'bound',quantifier:'each'}},{...sample(),span:'set red amber widget cerulean',constraints:[condition('red','selector'),condition('amber','selector'),condition('cerulean')]}];
 for(const original of fixtures){const prediction=raw(original,'😀 '+original.span),row={id:'toy',world:'toy',text:prediction.source.text,requests:prediction.requests};
 const code="import importlib.util,json,sys;s=importlib.util.spec_from_file_location('p','training/sop-bert/project-structural-gold.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);x=json.load(sys.stdin);print(json.dumps(m.project_row(x['row'],'haiku-v2',x['bindings'])))";
 const expected=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify({row,bindings}),encoding:'utf8'}));const result=bridge(prediction);assert.deepEqual(result.diagnostics,[]);assert.deepEqual(result.packet.hypotheses[0].requests,expected.labels.requests);assert.equal(result.decoded.candidates.length,1,JSON.stringify(result.decoded.issues));assert.equal(result.decoded.coverage.executable,false);assert.equal(result.decoded.candidates[0].confidence,null);}
});
test('predicted scalar pointers disambiguate repeated source spans without guessing',()=>{
 const p=raw(sample(),'set widget cerulean; set widget cerulean');p.ranges=[{path:['requests','0','span'],range:[21,40]}];const r=bridge(p);assert.deepEqual(r.packet.hypotheses[0].requests[0].span,[21,40]);assert.equal(r.decoded.candidates.length,1,JSON.stringify(r.diagnostics));
 const missing=bridge({...p,ranges:[]});assert.ok(missing.diagnostics.some(d=>d.reason==='ambiguous-or-missing-request-span'));assert.equal(missing.decoded.candidates.length,0);
 p.ranges[0].range=[20,40];assert.ok(bridge(p).diagnostics.some(d=>d.reason==='incompatible-predicted-range'));
});
test('unknown counts, fields, bindings, turns and dependencies remain unresolved',()=>{
 const cases=[p=>{p.requestCount=null;p.unresolved=[{path:['requestCount'],reason:'overflow'}];},p=>{p.requests[0].constraints[0].key='item.unknown';},p=>{p.requests[0].constraints[0].unknownFlag=true;},p=>{p.requests[0].turn={objection:'too_much'};},p=>{p.requests.push(sample());p.requestCount=2;},p=>{p.requests[0].target.fill='context';}];
 for(const edit of cases){const p=raw(sample());edit(p);const r=bridge(p);assert.ok(r.diagnostics.length);assert.equal(r.decoded?.candidates.length??0,0);assert.deepEqual(r.raw,p);assert.equal(r.executable,false);}
 const conflicting={...bindings,kinds:[...bindings.kinds,{...bindings.kinds[0],canonical:'fixture.other'}]};assert.ok(bridgeRawStructure(raw(sample()),{bindings:conflicting,bindingSha256}).diagnostics.some(d=>d.reason==='unresolved-canonical-kind-binding'));
});
test('negative utterances, source-safe literal values, bounds and provenance remain explicit',()=>{
 const empty=raw(sample(),'hello');empty.requests=[];empty.requestCount=0;const r=bridge(empty);assert.equal(r.decoded.candidates[0].outcome,'no-request');
 const p=raw({...sample(),span:'set widget $untrusted',constraints:[condition('$untrusted')]});const v=bridge(p);assert.equal(v.packet.hypotheses[0].requests[0].constraints[0].value.kind,'string');assert.equal(v.decoded.candidates.length,1);
 assert.equal(bridgeRawStructure(raw(sample()),{bindings,bindingSha256,budget:1}).packet,null);
 const noProvenance={...bindings,kinds:[{...bindings.kinds[0],sourceSnapshotSHA:'bad'}]};assert.ok(bridgeRawStructure(raw(sample()),{bindings:noProvenance,bindingSha256}).diagnostics.length);
});

test('value anchors require identity or a unique source-backed declared normalization',()=>{
 const mismatched=raw({...sample(),span:'set widget blue',constraints:[{...condition('red'),value_span:'blue'}]});
 const refusal=bridge(mismatched);assert.ok(refusal.diagnostics.some(d=>d.reason==='unresolved-source-value-normalization'));assert.equal(refusal.decoded.candidates.length,0);
 const normalized=raw({...sample(),span:'set widget two',constraints:[{...condition('2'),value_span:'two'}]});
 const numeric={...bindings,properties:[{...bindings.properties[0],valueKind:'literal'}]};
 assert.ok(bridgeRawStructure(normalized,{bindings:numeric,bindingSha256}).diagnostics.some(d=>d.reason==='unresolved-source-value-normalization'));
 const record={area:'toy',key:'item.tint',canonical:'tint',source:'two',value:'2',valueKind:'literal',sourceWire:'fixture.number.two',...source};
 const declared={...numeric,valueNormalizations:[record]};const result=bridgeRawStructure(normalized,{bindings:declared,bindingSha256});assert.deepEqual(result.diagnostics,[]);assert.equal(result.decoded.candidates.length,1);const projected=result.packet.hypotheses[0].requests[0];assert.deepEqual(projected.constraints[0].value,{kind:'literal',value:'2'});assert.equal(projected.evidence.find(e=>e.path.at(-1)==='value').declaration,'fixture.number.two');
 for(const rows of [[record,{...record,sourceWire:'fixture.other'}],[{...record,sourceSnapshotSHA:'bad'}],[{...record,key:'other.quantity'}]])assert.ok(bridgeRawStructure(normalized,{bindings:{...numeric,valueNormalizations:rows},bindingSha256}).diagnostics.length);
 const unicode=raw({...sample(),span:'set widget 🟦',constraints:[condition('🟦')]});assert.equal(bridge(unicode).decoded.candidates.length,1);
 const empty=raw({...sample(),constraints:[{...condition('cerulean'),value_span:''}]});assert.ok(bridge(empty).diagnostics.some(d=>d.reason==='unresolved-source-value-normalization'));
});

test('explicit value copies preserve wider evidence and require exact contained scalar ranges',()=>{
 const p=raw({...sample(),span:'set widget to 🟦',constraints:[{...condition('🟦'),value_span:'to 🟦'}]});
 p.ranges=[{path:['requests','0','constraints','0','value_span'],range:[11,15]},{path:['requests','0','constraints','0','value'],range:[14,15]}];
 const r=bridge(p);assert.deepEqual(r.diagnostics,[]);assert.equal(r.decoded.candidates.length,1);
 const request=r.packet.hypotheses[0].requests[0];assert.deepEqual(request.constraints[0].source,[11,15]);assert.deepEqual(request.evidence.find(e=>e.path.at(-1)==='value').ranges,[[14,15]]);
 for(const edit of [q=>{q.requests[0].constraints[0].value='red';},q=>{q.ranges[1].range=[4,10];q.requests[0].constraints[0].value='widget';},q=>{q.ranges[0].range=[11,13];}]){const q=structuredClone(p);edit(q);const rejected=bridge(q);assert.equal(rejected.decoded.candidates.length,0);assert.ok(rejected.diagnostics.some(d=>d.reason==='invalid-source-copy-range'));}
 const repeated=raw({...sample(),span:'set widget blue',constraints:[{...condition('blue'),value_span:'blue'}]},'blue; set widget blue');repeated.ranges=[{path:['requests','0','span'],range:[6,21]},{path:['requests','0','constraints','0','value'],range:[0,4]}];assert.equal(bridge(repeated).decoded.candidates.length,0);
});

const familyTable=()=>({...structuredClone(bindings),families:[{area:'toy',type:'item',canonical:'fixture.item',sourceWire:'fixture.item',...source,alignment:{kind:'explicit-raw-family-identity'}}]});
test('declared abstract family projects absent lexical kind with declaration and request evidence only',()=>{const p=raw({...sample(),span:'set cerulean',target:{type:'item',mode:'existing'}}),r=bridgeRawStructure(p,{bindings:familyTable(),bindingSha256});assert.deepEqual(r.diagnostics,[]);assert.equal(r.packet.hypotheses[0].requests[0].targets[0].kind,'fixture.item');const evidence=r.packet.hypotheses[0].requests[0].evidence.find(e=>e.path.join('.')==='targets.t0.kind');assert.deepEqual(evidence.ranges,[[0,12]]);assert.equal(evidence.origin,'declaration');assert.equal(evidence.declaration,'fixture.item');assert.equal(r.decoded.coverage.graphProposal,true);assert.equal(r.executable,false);});
test('family declarations never override present unknown, ambiguous or orphan lexical evidence',()=>{for(const target of [{kind:'absent'},{kind:''},{kind:null},{kind_span:'widget'}]){const p=raw({...sample(),target:{type:'item',mode:'existing',...target}}),r=bridgeRawStructure(p,{bindings:familyTable(),bindingSha256});assert.equal(r.decoded?.candidates.length??0,0);assert.ok(r.diagnostics.some(x=>x.reason==='unresolved-canonical-kind-binding'));}const table=familyTable();table.kinds.push({...table.kinds[0],canonical:'fixture.other'});assert.equal(bridgeRawStructure(raw(sample()),{bindings:table,bindingSha256}).decoded.candidates.length,0);});
test('family conflicts, malformed provenance and table budgets fail closed; legacy table behavior unchanged',()=>{const p=raw({...sample(),target:{type:'item',mode:'existing'}});assert.ok(bridge(p).diagnostics.some(x=>x.reason==='unresolved-canonical-kind-binding'));const table=familyTable();table.families.push({...table.families[0],canonical:'fixture.other'});assert.equal(bridgeRawStructure(p,{bindings:table,bindingSha256}).decoded.candidates.length,0);const invalid=familyTable();invalid.families[0].sourceSnapshotSHA='bad';assert.ok(bridgeRawStructure(p,{bindings:invalid,bindingSha256}).diagnostics.some(x=>x.reason==='invalid-family-binding-record'));const big=familyTable();big.families=Array(257).fill(big.families[0]);assert.ok(bridgeRawStructure(p,{bindings:big,bindingSha256}).diagnostics.some(x=>x.reason==='invalid-family-binding-table'));assert.deepEqual(bridgeRawStructure(raw(sample()),{bindings:familyTable(),bindingSha256}).packet,bridge(raw(sample())).packet);});
test('abstract family identity does not create a binding for bound context targets',()=>{const r=bridgeRawStructure(raw({...sample(),target:{type:'item',mode:'bound'}}),{bindings:familyTable(),bindingSha256});assert.equal(r.decoded?.candidates.length??0,0);assert.ok(!r.packet?.hypotheses?.[0]?.requests?.[0]?.targets?.[0]?.kind);});
test('catalogue does not authorize graph-node slots merely because a broad-family lexical kind resolved',()=>{const p=raw({...sample(),constraints:[{...condition('cerulean'),key:'node.label'}]}),table=structuredClone(bindings);table.properties=table.properties.filter(x=>x.key!=='node.label');const r=bridgeRawStructure(p,{bindings:table,bindingSha256});assert.ok(r.packet.hypotheses[0].requests[0].targets[0].kind);assert.equal(r.decoded.candidates.length,0);assert.ok(r.diagnostics.some(x=>x.reason==='unresolved-canonical-property-binding'));});

test('a grounded new-target cardinal span retains count while ordinal or conflicting evidence stays unresolved',()=>{
 const candidate=(count_span,count)=>raw({
  span:'make '+count_span+' widget',trigger:'make',act:'make',mood:'do',
  target:{type:'item',mode:'new',kind:'widget',kind_span:'widget',count_span,...(count===undefined?{}:{count})},
  constraints:[],
 });
 for(const text of ['three','3']){
  const r=bridge(candidate(text,3));
  assert.deepEqual(r.diagnostics,[]);
  const wires=r.decoded.candidates[0].wires;
  assert.match(wires,/concept=count.*value=3/);
  assert.match(wires,/source\.start=5/);
 }
 for(const input of [candidate('third',3),candidate('three',2),candidate('0',0)]){
  const r=bridge(input);
  assert.equal(r.decoded.candidates.length,0);
  assert.ok(r.diagnostics.some(d=>d.reason==='requires-declared-count-projection'));
 }
});
// Relative positions, comparatives, degree values and context targets (official-dataset label space).
const placed={...bindings,kinds:[...bindings.kinds,{area:'toy',type:'item',lemma:'pond',canonical:'fixture.pond',sourceWire:'fixture.pond',...source}],
 properties:[...bindings.properties,
  {area:'toy',key:'item.relation',canonical:'fixture.relation.kind',valueKind:'string',sourceWire:'fixture.relation.kind',projection:{kind:'relation',values:{left_of:'left',in:'in'}},...source},
  {area:'toy',key:'item.anchor',canonical:'fixture.relation.object',valueKind:'string',sourceWire:'fixture.relation.object',projection:{kind:'relation-anchor'},...source},
  {area:'toy',key:'item.size',canonical:'size',valueKind:'string',sourceWire:'fixture.size',...source}]};
const relational=(relation,span)=>({span:`make a widget ${span} the pond`,trigger:'make',act:'make',mood:'do',target:{type:'item',mode:'new',kind:'widget',kind_span:'widget'},
 constraints:[{key:'item.anchor',value:'the pond',value_span:'the pond',operator:'relation',phase:'selector',character:'requirement',polarity:'positive'},
  {key:'item.relation',value:relation,value_span:span,operator:'relation',phase:'result',character:'requirement',polarity:'positive'}]});
test('a relation and its anchor mention become one relation constraint whose goal is the declared anchor kind',()=>{
 for(const [relation,span,expected]of [['left_of','left of','left'],['in','in','in']]){
  const out=bridgeRawStructure(raw(relational(relation,span)),{bindings:placed,bindingSha256,references:{definite:['the']}});
  assert.deepEqual(out.diagnostics,[]);const wires=out.decoded.candidates[0].wires;
  assert.match(wires,new RegExp(`operator=relation polarity=positive relation=${expected} `));assert.match(wires,/@t0_a0 std\.request\.target determiner=definite kind=fixture\.pond mode=existing/);assert.match(wires,/goal=\$t0_a0/);assert.doesNotMatch(wires,/phase=/);
 }
 const undeclared=bridgeRawStructure(raw(relational('behind','behind')),{bindings:placed,bindingSha256,references:{definite:['the']}});
 assert.ok(undeclared.diagnostics.some(d=>d.reason==='undeclared-relation-value'));
 const unknownAnchor=bridgeRawStructure(raw(relational('in','in')),{bindings:placed,bindingSha256,references:{definite:[]}});
 assert.ok(unknownAnchor.diagnostics.some(d=>d.reason==='unresolved-anchor-reference'));
 const lone=relational('in','in');lone.constraints.shift();assert.ok(bridgeRawStructure(raw(lone),{bindings:placed,bindingSha256}).diagnostics.some(d=>d.reason==='unpaired-relation-mention'));
});
test('a comparative consumes the copied step word, a degree value is a vocabulary name and a context target takes the resolved kind',()=>{
 const text='make it bigger',comparative={span:text,trigger:'make',act:'change',mood:'do',target:{type:'item',mode:'existing',fill:'context'},constraints:[{key:'item.size',value:'bigger',value_span:'bigger',operator:'delta',step:'more',phase:'result',character:'requirement',polarity:'positive'}]};
 const prediction={...raw(comparative),ranges:[{path:['requests','0','constraints','0','value'],range:[8,14]}]},steps=[{concept:'size',step:'more',factor:1.5,declaration:'fixture.more'}];
 const bare=bridgeRawStructure(prediction,{bindings:placed,bindingSha256,comparatives:steps});assert.deepEqual(bare.diagnostics.map(d=>d.reason).sort(),['context-reference-not-bound','unresolved-canonical-kind-binding']);
 const bound=bridgeRawStructure(prediction,{bindings:placed,bindingSha256,comparatives:steps,contextTarget:{kind:'fixture.widget',declaration:'observed.object'}});
 assert.deepEqual(bound.diagnostics,[]);assert.match(bound.decoded.candidates[0].wires,/baseline=before .*operator=factor .*value=1\.5/);assert.match(bound.decoded.candidates[0].wires,/kind=fixture\.widget/);
 const degree={span:'make a big widget',trigger:'make',act:'make',mood:'do',target:{type:'item',mode:'new',kind:'widget',kind_span:'widget'},constraints:[{key:'item.size',value:'big',value_span:'big',operator:'degree',phase:'result',character:'requirement',polarity:'positive'},condition('cerulean')]};
 degree.span='make a big cerulean widget';const both=bridgeRawStructure(raw(degree),{bindings:placed,bindingSha256});
 assert.deepEqual(both.diagnostics,[]);assert.match(both.decoded.candidates[0].wires,/operator=degree .*value=big(\s|$)/);
});
