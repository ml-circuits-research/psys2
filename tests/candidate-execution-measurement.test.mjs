import test from 'node:test';import assert from 'node:assert/strict';
import {measureCandidateExecution} from '../scripts/lib/candidate-execution-measurement.mjs';
import {measureCandidateExecutionNode} from '../scripts/lib/candidate-executor-identity.mjs';
import {drawingObjects,drawingState} from './drawing-state.mjs';
const text='fixture source';
const candidate={request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=change mood=do source=$s root=$c\n@t std.request.target request=$r mode=existing kind=circle\n@c std.request.constraint request=$r target=$t concept=colour operator=eq value=purple character=requirement polarity=positive`};
const oneCircle=await drawingState([{kind:'circle',color:'red'}]),twoCircles=await drawingState([{kind:'circle',color:'red'},{kind:'circle'}]);
const fixture=(board=oneCircle)=>{board=structuredClone(board);return {state:{'art.draw':board,'ui.shell':{activeTab:'draw'}},candidate,text,view:'draw',identity:{model:'synthetic-graph-fixture',executor:'actual-import'},expectation:{status:'unreviewed'}};};
test('actual detached executor changes only the fresh state and retains typed observation evidence without correctness',async()=>{
 const input=fixture(),original=structuredClone(input);const out=await measureCandidateExecution(input);
 assert.equal(out.status,'observed');assert.equal(out.reply.trace.assessment,'changed');assert.equal(drawingObjects(out.after['art.draw'])[0].color,'#800080');assert.equal(out.receipt.status,'changed');assert.equal(out.journal.length,1);assert.equal(out.originalUnchanged,true);assert.deepEqual(input,original);assert.equal(out.intent.correct,null);assert.equal(out.admission.eligible,false);
 const again=await measureCandidateExecution(input);assert.equal(again.reply.trace.assessment,'changed');assert.notEqual(again.journal[0].invocation,out.journal[0].invocation);
 out.after['art.draw'].sop=out.after['art.draw'].sop.replace(/colour=\S+/,'colour=mutated');assert.deepEqual(input,original);
});
test('unsupported area, ambiguity and malformed graphs retain no-effect refusals rather than correct labels',async()=>{
 for(const change of [x=>x.view='calendar',x=>x.state['art.draw']=structuredClone(twoCircles),x=>x.candidate={request:'r',wires:'not a graph'}]){
  const input=fixture();change(input);const out=await measureCandidateExecution(input);assert.equal(out.executed,true);assert.deepEqual(out.reply.statuses,['unsupported']);assert.equal(out.stateChanged,false);assert.equal(out.intent.correct,null);assert.equal(out.originalUnchanged,true);
 }
});
test('invalid state descriptors and byte limits refuse before executing getters or the native path',async()=>{
 const input=fixture();let reads=0;Object.defineProperty(input.state,'bad',{enumerable:true,get(){reads++;return {};}});assert.equal((await measureCandidateExecution(input)).executed,false);assert.equal(reads,0);assert.equal((await measureCandidateExecution({...fixture(),maxBytes:8})).executed,false);
});
test('Node wrapper records actual static executor source separately from caller identity',async()=>{
 const out=await measureCandidateExecutionNode(fixture());assert.equal(out.observedExecutor.unchanged,true);assert.ok(out.observedExecutor.before.files.some(x=>x.path==='src/dialog/new-engine.mjs'));assert.match(out.observedExecutor.before.sha256,/^[a-f0-9]{64}$/);assert.equal(out.intent.correct,null);
});
