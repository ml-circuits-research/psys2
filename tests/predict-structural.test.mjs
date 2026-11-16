import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/structural-normalization.json',import.meta.url)));
const predict=f=>JSON.parse(execFileSync('python3',['-c',"import importlib.util,json,sys;s=importlib.util.spec_from_file_location('p','training/sop-bert/predict-structural.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);x=json.load(sys.stdin);print(json.dumps(m.normalize_predictions(**{k:v for k,v in x.items()if k!='expected'})))"],{input:JSON.stringify(f),encoding:'utf8'}));
const copy=()=>structuredClone(fixture);const hot=(n,i)=>Array.from({length:n},(_,j)=>i===j?10:0);
test('all 59 learned outputs normalize to shared source-only raw fixture',()=>{assert.equal(Object.keys(fixture.logits).length,59);const r=predict(fixture);assert.deepEqual(r.prediction,fixture.expected);assert.equal(r.graphConfidence,null);assert.equal(r.executable,false);});
test('typed unknown, absent, literal values and count contradictions remain distinct',()=>{
 const unknown=copy();unknown.logits['c:value'][0][0]=hot(3,1);assert.ok(predict(unknown).prediction.unresolved.some(i=>i.reason==='unknown-label'));
 const absent=copy();absent.logits['c:value'][0][0]=hot(3,0);assert.equal(Object.hasOwn(predict(absent).prediction.requests[0].constraints[0],'value'),false);
 const literal=copy();literal.config.banks['c:value'][2].value='<ABSENT>';assert.equal(predict(literal).prediction.requests[0].constraints[0].value,'<ABSENT>');
 for(const mutate of [f=>f.logits.count=hot(3,2),f=>f.logits.presence=hot(2,0)]){const f=copy();mutate(f);const p=predict(f).prediction;assert.equal(p.requestCount,null);assert.deepEqual(p.requests,[]);assert.equal(p.coverage.complete,false);}
 const conditions=copy();conditions.logits.conditionCount[0]=hot(3,2);assert.equal(Object.hasOwn(predict(conditions).prediction.requests[0],'constraints'),false);
});
test('source pointers reject context tokens, reversed ranges, truncation and missing parent spans',()=>{
 for(const mutate of [f=>f.sequences[3]=1,f=>f.logits['c:value_span:start'][0][0]=hot(5,4),f=>f.logits['r:span:state'][0]=hot(3,0),f=>f.truncated=true]){const f=copy();mutate(f);assert.equal(predict(f).prediction.coverage.complete,false);}
 const tied=copy();tied.logits['r:act'][0]=[1,1,1];assert.ok(predict(tied).prediction.unresolved.some(i=>i.reason==='ambiguous-logit-maximum'));
 const unicode=copy();unicode.text='set widget 🟦';unicode.offsets[3]=[11,12];unicode.config.banks['c:value'][2].value='🟦';const r=predict(unicode).prediction;assert.equal(r.requests[0].constraints[0].value_span,'🟦');assert.deepEqual(r.ranges.at(-1).range,[11,12]);
});
