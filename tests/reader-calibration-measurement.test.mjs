import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calibrationObservation,retainCalibrationCohorts} from '../scripts/lib/reader-calibration-measurement.mjs';
const text='fixture source';
const candidate={request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=change mood=do source=$s root=$c\n@t std.request.target request=$r mode=existing kind=widget\n@c std.request.constraint request=$r target=$t concept=tint operator=eq value=cyan character=requirement polarity=positive`};
const proposal=()=>({coverage:{complete:true,graphProposal:true},candidates:[candidate],failures:[]});
const expectation={status:'canonical-expectation',expectedGraphs:[candidate]};
test('incomplete proposals retain their original ineligibility and unknown correctness',()=>{
 let calls=0;const r=calibrationObservation({coverage:{complete:false},failures:[{reason:'missing-span'}]},text,expectation,{compareRequestGraphs:()=>{calls++;}});
 assert.equal(r.eligible,false);assert.equal(r.correct,null);assert.equal(r.reason,'missing-span');assert.equal(calls,0);
});
test('full graph agreement alone cannot produce a positive correctness label',()=>{
 const r=calibrationObservation(proposal(),text,expectation,{compareRequestGraphs:(a,b)=>{assert.equal(a.request,'r');assert.equal(a.nodes.find(n=>n.id==='r').attrs.act[0].kind,'literal');assert.equal(b.nodes.length,4);return {ok:true,equal:true};}});
 assert.equal(r.eligible,true);assert.equal(r.graphAgreement,true);assert.equal(r.correct,null);assert.equal(r.reason,'intent-and-effect-checker-unavailable');
});
test('graph differences and missing comparison both retain unknown semantic correctness',()=>{
 const r=calibrationObservation(proposal(),text,expectation,{compareRequestGraphs:()=>({ok:true,equal:false})});assert.equal(r.correct,null);assert.equal(r.graphAgreement,false);assert.equal(r.reason,'graph-difference-needs-intent-review');assert.equal(r.eligible,true);
 for(const options of [{},{compareRequestGraphs:()=>({ok:false})}]){const unknown=calibrationObservation(proposal(),text,expectation,options);assert.equal(unknown.correct,null);assert.equal(unknown.eligible,true);}
 assert.equal(calibrationObservation(proposal(),text,{status:'unknown'}).reason,'canonical-teacher-expectation-unavailable');
});
const policy={minFitAccepted:2,minEvaluationAccepted:2,maxErrorRate:0};
const rows=()=>Array.from({length:4},(_,i)=>({id:'id'+i,source:'source'+i,partition:i<2?'fit':'evaluation',area:'arbitrary',eligible:false,score:0,correct:null}));
test('empty eligible cohort stays closed; unknown eligible labels cannot be hidden as abstentions',()=>{
 const r=retainCalibrationCohorts(rows(),{identity:{fixture:'synthetic'},policy});assert.equal(r.arbitrary.approved,false);assert.equal(r.arbitrary.reason,'no-fit-threshold');assert.equal(r.arbitrary.fit.total,2);assert.equal(r.arbitrary.evaluation.total,2);
 const unknown=rows();unknown[0].eligible=true;unknown[0].score=1;const u=retainCalibrationCohorts(unknown,{identity:{fixture:'synthetic'},policy});assert.equal(u.arbitrary.reason,'unknown-eligible-label');assert.equal(u.arbitrary.unknownEligible,1);assert.equal(u.arbitrary.total,4);
});
