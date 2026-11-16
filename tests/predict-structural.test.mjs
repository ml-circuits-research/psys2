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

const version2=()=>{const f=copy();f.config.format='psys2.raw-structural-model/2';f.config.valuePolicy={modeHead:'c:valueMode',copyPointer:'c:copy_span',auxiliaryHeads:['c:value']};f.config.banks['c:valueMode']=[{kind:'absent'},{kind:'unknown'},{kind:'value',value:'source-span'},{kind:'value',value:'declared-symbol'}];f.config.constraintSpans.push('copy_span');f.logits['c:valueMode']=[[hot(4,2)]];for(const part of ['state','start','end'])f.logits['c:copy_span:'+part]=structuredClone(f.logits['c:value_span:'+part]);return f;};
test('v2 internal value heads emit only exact source copies and never the auxiliary bank',()=>{
 const shared=JSON.parse(readFileSync(new URL('./fixtures/structural-normalization-v2.json',import.meta.url)));assert.equal(Object.keys(shared.logits).length,63);assert.deepEqual(predict(shared).prediction,shared.expected);
 const f=version2();f.config.banks['c:value'][2].value='invented auxiliary value';f.logits['c:value'][0][0]=[1,1,1];const p=predict(f).prediction;assert.equal(p.coverage.complete,true);assert.equal(p.requests[0].constraints[0].value,'blue');assert.equal(Object.hasOwn(p.requests[0].constraints[0],'valueMode'),false);assert.equal(Object.hasOwn(p.requests[0].constraints[0],'copy_span'),false);assert.deepEqual(p.ranges.at(-1),{path:['requests','0','constraints','0','value'],range:[11,15]});
 for(const mode of [0,1,3]){const q=version2();q.logits['c:valueMode']=[[hot(4,mode)]];const out=predict(q).prediction;assert.equal(Object.hasOwn(out.requests[0].constraints[0],'value'),false);if(mode)assert.equal(out.coverage.complete,false);}
 const outside=version2();outside.logits['c:copy_span:start'][0][0]=hot(5,2);assert.equal(predict(outside).prediction.coverage.complete,false);
 const unicode=version2();unicode.text='set widget 🟦';unicode.offsets[3]=[11,12];const u=predict(unicode).prediction;assert.equal(u.requests[0].constraints[0].value,'🟦');assert.deepEqual(u.ranges.at(-1).range,[11,12]);
 const missing=version2();missing.logits['c:value_span:state'][0][0]=hot(3,0);assert.equal(predict(missing).prediction.coverage.complete,false);
});
