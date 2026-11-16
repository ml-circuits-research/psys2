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
