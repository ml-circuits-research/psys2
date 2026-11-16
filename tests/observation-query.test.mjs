import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluateQueryJobs} from '../src/dialog/observation-query.mjs';
const fixture=(complete=true)=>({instanceId:'instance',scope:'all-objects',version:'7',complete,objects:[{id:'a',kind:'item',source:'incarnation-a',sourceType:'native.item',version:'7',inputs:[{binding:'native.value',source:'incarnation-a',sourceType:'native.item',key:'value',version:'7',values:['"red"']}]},{id:'b',kind:'item',source:'incarnation-b',sourceType:'native.item',version:'7',inputs:[]}]});
const binding={id:'native.value',sourceType:'native.item',key:'value',concept:'colour'};
const selection=(sources=['incarnation-a'])=>({instanceId:'instance',scope:'all-objects',version:'7',sources,unknownSources:[]});
const run=(operation,sel=selection(),observation=fixture(),extra={})=>evaluateQueryJobs([{id:'query',operation,selection:sel,...extra}],{observations:[observation],bindings:[binding]});
test('generic query aggregation keeps selected-set identity and exact property input provenance',()=>{
 assert.equal(run('count',selection(['incarnation-a','incarnation-b'])).answers[0].value,2);
 assert.deepEqual(run('members').answers[0].value.map(o=>o.source),['incarnation-a']);
 const observation=fixture();const result=run('values',selection(),observation,{concept:'colour'});assert.equal(result.status,'answered');assert.deepEqual(result.answers[0].rows[0].values,['"red"']);result.answers[0].evidence.observation.objects.length=0;assert.equal(observation.objects.length,2);
});
test('positive existence permits a witnessed partial view; counts and negative existence require completeness',()=>{
 assert.equal(run('exists',selection(),fixture(false)).answers[0].value,true);
 for(const operation of ['count','members','values'])assert.equal(run(operation,selection(),fixture(false),operation==='values'?{concept:'colour'}:{}).status,'unsupported');
 assert.equal(run('exists',selection([]),fixture(false)).status,'unsupported');assert.equal(run('exists',selection([])).answers[0].value,false);
 const uncertain={...selection([]),unknownSources:['incarnation-b']};assert.equal(run('exists',uncertain).status,'unsupported');
});
test('missing or forged input identity stays unknown; bounded selection cannot import foreign objects',()=>{
 assert.equal(run('values',selection(['incarnation-b']),fixture(),{concept:'colour'}).status,'unsupported');
 for(const alter of [o=>o.objects[0].inputs[0].version='old',o=>o.objects[0].inputs[0].source='other',o=>o.objects[0].inputs[0].values=[]]){const o=fixture();alter(o);assert.equal(run('values',selection(),o,{concept:'colour'}).status,'unsupported');}
 assert.equal(run('count',selection(['foreign'])).reason,'foreign-selection');
 assert.equal(evaluateQueryJobs([{id:'q',operation:'count',selection:selection()}],{observations:[fixture()],maxSteps:1}).reason,'query-budget');
});
test('property queries retain dimensional metadata and reject declared frame mismatch',()=>{
 const observation=fixture();Object.assign(observation.objects[0].inputs[0],{dimension:'time',unit:'millisecond',frame:'unix'});
 const b={...binding,concept:'time.instant',dimension:'time',unit:'millisecond',frame:'unix'};
 const job={id:'q',operation:'values',concept:'time.instant',selection:selection()};
 const result=evaluateQueryJobs([job],{observations:[observation],bindings:[b]});assert.equal(result.status,'answered');assert.equal(result.answers[0].rows[0].input.frame,'unix');
 assert.equal(evaluateQueryJobs([job],{observations:[observation],bindings:[{...b,frame:'local-clock'}]}).reason,'incompatible-property-dimension');
});
