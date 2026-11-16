import {test} from 'node:test';import assert from 'node:assert/strict';
import {createInventoryBootstrapInference} from '../src/dialog/inventory-bootstrap-inference.mjs';
const manifest={format:'sop.inventory-bootstrap.browser',version:1,executable:false,graphProposal:false,maxLength:8,checkpointSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),tokenizerSha256:'c'.repeat(64),calibrationSha256:'d'.repeat(64)};
const field={concept:'colour',key:'drawing.thing.colour',phase:'selector',instance:'constraints.0',candidate:'red'};
const inputs={input_ids:{dims:[1,3],data:[1,2,3]},attention_mask:{dims:[1,3],data:[1,1,1]}};
const output={candidate_logits:{dims:[1],data:[2]},span_logits:{dims:[1,3,2],data:[0,1,2,3,4,5]}};
test('auxiliary candidate inference preserves conditioning and refuses to claim a graph',async()=>{
 let query;const reader=createInventoryBootstrapInference({manifest,tokenizer:async(texts,queries,options)=>{assert.deepEqual(texts,['red object']);query=queries[0];assert.equal(options.truncation,false);return inputs;},model:async()=>output});
 const result=await reader.scoreFields('red object',[field]);assert.equal(query,'concept=colour key=drawing.thing.colour phase=selector instance=constraints.0 candidate=red');assert.deepEqual(result.scores[0].conditioning,field);assert.equal(result.scores[0].logit,2);assert.deepEqual(result.scores[0].spanLogits,[[0,1],[2,3],[4,5]]);assert.deepEqual(result.candidates,[]);assert.equal(result.coverage.complete,false);assert.equal(result.coverage.topology,'unresolved');assert.equal(result.providers[0].modelSha256,manifest.modelSha256);assert.equal(result.providers[0].quantizedCalibration,false);
 const proposed=await reader.propose('red object');assert.deepEqual(proposed.candidates,[]);assert.equal(proposed.failures[0].reason,'graph-proposal-unavailable');
});
test('input overflow and malformed model output cannot escape as scores',async()=>{
 let invoked=false;const oversized=createInventoryBootstrapInference({manifest,tokenizer:async()=>({input_ids:{dims:[1,9]},attention_mask:{dims:[1,9]}}),model:async()=>{invoked=true;return output;}});assert.equal((await oversized.scoreFields('object',[field])).failures[0].reason,'encoded-input-over-budget');assert.equal(invoked,false);
 for(const broken of [{...output,candidate_logits:{dims:[1],data:[NaN]}},{...output,span_logits:{dims:[1,3,3],data:Array(9).fill(0)}}]){const reader=createInventoryBootstrapInference({manifest,tokenizer:async()=>inputs,model:async()=>broken});const result=await reader.scoreFields('object',[field]);assert.equal(result.scores.length,0);assert.equal(result.coverage.complete,false);}
});
test('conditioning has explicit instance/phase and never executes accessor fields',async()=>{
 let invoked=false;const reader=createInventoryBootstrapInference({manifest,tokenizer:async()=>{invoked=true;return inputs;},model:async()=>output});let accessed=false;const hostile={...field};Object.defineProperty(hostile,'candidate',{get(){accessed=true;return 'red';},enumerable:true});for(const row of [hostile,{...field,phase:undefined},{...field,unknown:'ignored'}])assert.equal((await reader.scoreFields('object',[row])).scores.length,0);assert.equal(accessed,false);assert.equal(invoked,false);
 assert.throws(()=>createInventoryBootstrapInference({manifest:{...manifest,graphProposal:true},tokenizer:()=>inputs,model:()=>output}));
});
