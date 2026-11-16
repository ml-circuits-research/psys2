import {test} from 'node:test';import assert from 'node:assert/strict';
import {createInventoryBootstrapInference} from '../src/dialog/inventory-bootstrap-inference.mjs';
const manifest={format:'sop.inventory-bootstrap.browser',version:1,executable:false,graphProposal:false,maxLength:8,checkpointSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),tokenizerSha256:'c'.repeat(64),calibrationSha256:'d'.repeat(64)};
const field={concept:'colour',key:'drawing.thing.colour',phase:'selector',instance:'constraints.0',candidate:'red'};
const inputs={input_ids:{dims:[1,3],data:[1,2,3]},attention_mask:{dims:[1,3],data:[1,1,1]}};
const output={candidate_logits:{dims:[1],data:[2]},span_logits:{dims:[1,3,2],data:[0,1,2,3,4,5]}};
test('auxiliary candidate inference preserves conditioning and refuses to claim a graph',async()=>{
 let query;const reader=createInventoryBootstrapInference({manifest,tokenizer:async(texts,options)=>{assert.deepEqual(texts,['red object']);query=options.text_pair[0];assert.equal(options.truncation,false);return inputs;},model:async()=>output});
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

// Optional real artifact check: no remote access, and no fabricated model fixture.
test('frozen exported model runs through the real Transformers.js pair tokenizer',{skip:!process.env.SOP_BOOTSTRAP_MODEL_DIR||!process.env.SOP_TRANSFORMERS_RUNTIME},async()=>{
 const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto'),{resolve,dirname,basename}=await import('node:path'),{pathToFileURL}=await import('node:url');
 const directory=resolve(process.env.SOP_BOOTSTRAP_MODEL_DIR),runtime=await import(pathToFileURL(resolve(process.env.SOP_TRANSFORMERS_RUNTIME)).href),manifest=JSON.parse(readFileSync(directory+'/bootstrap-manifest.json','utf8'));
 const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');assert.equal(sha(directory+'/onnx/model_quantized.onnx'),manifest.modelSha256);assert.equal(sha(directory+'/tokenizer.json'),manifest.tokenizerSha256);
 runtime.env.allowLocalModels=true;runtime.env.allowRemoteModels=false;runtime.env.useBrowserCache=false;runtime.env.localModelPath=dirname(directory)+'/';
 const tokenizer=await runtime.AutoTokenizer.from_pretrained(basename(directory),{local_files_only:true}),model=await runtime.AutoModel.from_pretrained(basename(directory),{device:'cpu',dtype:'q8',local_files_only:true,session_options:{intraOpNumThreads:2}}),reader=createInventoryBootstrapInference({tokenizer,model,manifest});
 const result=await reader.scoreFields('An invented red object.',[field,{...field,phase:'result',candidate:'blue'}]);assert.equal(result.scores.length,2,JSON.stringify(result.failures));assert.ok(result.scores.every(s=>Number.isFinite(s.logit)&&s.spanLogits.length>0));assert.equal(result.coverage.complete,false);assert.deepEqual(result.candidates,[]);
 // Independently inspect the tokenizer's pair segment: the candidate query is
 // present after the source separator, never ignored as a positional argument.
 const encoded=await tokenizer(['An invented red object.'],{text_pair:['concept=colour key=drawing.thing.colour phase=selector instance=constraints.0 candidate=red'],padding:true,truncation:false});assert.ok(encoded.input_ids.dims[1]>10);
});
