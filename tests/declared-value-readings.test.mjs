// SPDX-License-Identifier: AGPL-3.0-only
// Declared readings of said values (src/dialog/declared-value-readings.mjs; execution-policy.sop app.execution.amount,
// range, position): an amount, a range said once for two keys, a target ordinal as a position selector.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declaredValueReadings} from '../src/dialog/declared-value-readings.mjs';
const at=(text,part)=>{const i=Array.from(text).join('').indexOf(part);return [Array.from(text.slice(0,i)).length,Array.from(text.slice(0,i)).length+Array.from(part).length];};
function raw(text,request,spans){
 return {source:{text},area:'diagram',requests:[request],ranges:[{path:['requests','0','span'],range:[0,Array.from(text).length]},...spans.map(([path,part])=>({path:['requests','0',...path],range:at(text,part)}))]};
}
test('an amount said with a step reads as the declared amount key',()=>{
 const text='bump Thu up by 70',r=raw(text,{span:text,act:'change',target:{type:'point'},constraints:[{key:'point.value',value:'by 70',value_span:'by 70',operator:'delta',step:'more',phase:'result'}]},[[['constraints','0','value_span'],'by 70']]);
 const c=declaredValueReadings(r).requests[0].constraints[0];
 assert.deepEqual([c.key,c.operator,c.value,c.value_span,c.step],['point.add','eq','70','70',undefined]);
});
test('a range said once gives its numbers to the floor and the top',()=>{
 const text='run the y axis from 0 to 10',r=raw(text,{span:text,act:'change',target:{type:'chart'},constraints:[{key:'chart.max',value:'from 0 to 10',value_span:'from 0 to 10',operator:'eq',phase:'result'}]},[[['constraints','0','value_span'],'from 0 to 10']]);
 const out=declaredValueReadings(r),cs=out.requests[0].constraints;
 assert.deepEqual(cs.map(c=>[c.key,c.value]),[['chart.max','10'],['chart.min','0']]);
 const range=out.ranges.find(x=>x.path.join('.')==='requests.0.constraints.1.value_span').range;
 assert.equal(Array.from(text).slice(...range).join(''),'0');
});
test('a target ordinal is a selector on the declared position key',()=>{
 const text='set the third bar to 10',r=raw(text,{span:text,act:'change',target:{type:'point',ordinal:'third'},constraints:[{key:'point.value',value:'10',value_span:'10',operator:'eq',phase:'result'}]},[[['constraints','0','value_span'],'10']]);
 const req=declaredValueReadings(r).requests[0];
 assert.equal(req.target.ordinal,undefined);
 assert.deepEqual(req.constraints.at(-1),{key:'point.index',value:'3',value_span:'third',operator:'eq',phase:'selector',polarity:'positive',character:'requirement'});
});
