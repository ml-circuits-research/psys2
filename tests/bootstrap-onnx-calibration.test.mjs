import {test} from 'node:test';import assert from 'node:assert/strict';
import {measurePair,emptyCounts,summarizeCounts,scalarCounts,calibrateBootstrapOnnx} from '../training/sop-bert/calibrate-bootstrap-onnx.mjs';
const spans=[[0,0],[4,1],[1,5],[0,0]],row=(label,span=null)=>({label,span});
test('fixed zero logit threshold retains all positive and negative confusion outcomes',()=>{
 const entries=[measurePair({row:row(1),logit:0,spanLogits:spans,alignment:null,tokenParity:true}),measurePair({row:row(0),logit:0.01,spanLogits:spans,alignment:null,tokenParity:true}),measurePair({row:row(1),logit:-0.01,spanLogits:spans,alignment:null,tokenParity:true}),measurePair({row:row(0),logit:-2,spanLogits:spans,alignment:null,tokenParity:true})];
 const total=scalarCounts(Object.fromEntries(entries.map((value,index)=>[index,value]))),summary=summarizeCounts(total);assert.equal(total.pairs,4);assert.equal(total.positivePairs,2);for(const key of ['tp','fp','fn','tn'])assert.equal(total[key],1);assert.equal(summary.pairAccuracy,.5);assert.equal(summary.negativeOnlyAccuracy,.5);assert.equal(summary.positivePrecision,.5);assert.equal(summary.positiveRecall,.5);
});
test('span scoring needs exact reference alignment and full tokenizer parity',()=>{
 const gold=measurePair({row:row(1,[2,7]),logit:2,spanLogits:spans,alignment:[1,2],tokenParity:true});assert.equal(gold.spanRequested,1);assert.equal(gold.spanAligned,1);assert.equal(gold.spanCorrect,1);
 const mismatch=measurePair({row:row(1,[2,7]),logit:2,spanLogits:spans,alignment:[1,2],tokenParity:false});assert.equal(mismatch.spanAligned,0);assert.equal(mismatch.spanCorrect,0);assert.equal(mismatch.spanUnsupportedTokenization,1);assert.equal(mismatch.tp,1);
 const unaligned=measurePair({row:row(1,[2,7]),logit:2,spanLogits:spans,alignment:null,tokenParity:true});assert.equal(unaligned.spanRequested,1);assert.equal(unaligned.spanAligned,0);
});
test('argmax includes all token positions exactly as baseline, with first-position tie handling',()=>{
 const paddingWins=measurePair({row:row(1,[0,1]),logit:1,spanLogits:[[0,0],[2,2],[9,9]],alignment:[1,1],tokenParity:true});assert.equal(paddingWins.spanAligned,1);assert.equal(paddingWins.spanCorrect,0);
 const ties=measurePair({row:row(1,[0,1]),logit:1,spanLogits:[[2,2],[2,2]],alignment:[0,0],tokenParity:true});assert.equal(ties.spanCorrect,1);
});
test('empty support is explicit and malformed logits/alignment never become successful metrics',()=>{
 const empty=summarizeCounts(emptyCounts());for(const key of ['pairAccuracy','positivePrecision','positiveRecall','negativeOnlyAccuracy','spanExact'])assert.equal(empty[key],null);
 for(const changes of [{logit:NaN},{spanLogits:[[Infinity,0]]},{alignment:[9,10]},{row:row(2)}])assert.throws(()=>measurePair({row:row(1,[0,1]),logit:1,spanLogits:spans,alignment:[1,2],tokenParity:true,...changes}));
});
test('unsafe batch/steps/options refuse before runtime loading',async()=>{
 for(const options of [{batchSize:0},{batchSize:129},{maxSteps:-1},{threads:9}])await assert.rejects(calibrateBootstrapOnnx({out:'/nonexistent/fixture-output',python:'fixture-python',...options}),/invalid-calibration-options/);
});
