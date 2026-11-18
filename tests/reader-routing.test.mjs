import test from 'node:test';import assert from 'node:assert/strict';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {readerCalibrationIdentity,readerCalibrationScope,READER_RUNTIME_IDENTITY_FIELDS,scoreReaderProposal,assessReaderProposal} from '../src/dialog/reader-admission.mjs';
import {World,retainSelectiveCalibration,quote,parse} from '../src/vendor/sopworld/sopworld.mjs';
import {readFileSync} from 'node:fs';
import {compileReaderAdmission,readerCalibrationErrorLimit} from '../src/dialog/reader-policy.mjs';
import POLICY from '../worlds/app.project/reader-admission-policy-source.mjs';
import {canonicalDrawingState,toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import {initialState,makeObject} from '../worlds/art.draw/board.mjs';
const text='Change the colour of the circle to purple.';
const setup=()=>{const s=initialState();s.objects=[{...makeObject(s,'circle'),color:'red'}];return {engine:{},isession:{state:{'art.draw':canonicalDrawingState(s),'ui.shell':{activeTab:'draw'}}},newEngineJournal:[]};};
const drawing=session=>toNativeDrawingState(session.isession.state['art.draw']);
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};
const candidate=()=>({request:'r',wires:`@source std.request.source text=${quote(text)}\n@r std.request act=change mood=do source=$source root=$c\n@t std.request.target request=$r mode=existing kind=circle\n@c std.request.constraint request=$r target=$t concept=colour operator=eq value="purple" character=requirement polarity=positive`});
const proposal=()=>({candidates:[candidate()],coverage:{complete:true,executable:false,graphProposal:true},graphConfidence:null,failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.95}});
function install(s,p=proposal()){s.engine.requestReader={bindings:()=>({kinds:[{area:'drawing',canonical:'circle',lemma:'circle',nativeFamilyBinding:{operation:'drawing.object.make'}}]}),provenance:()=>provenance,propose:async()=>p};}
function calibration(s,{wrong=false,area='draw',support=2,maxErrorRate=0}={}){
 const runtimeIdentity=Object.fromEntries(READER_RUNTIME_IDENTITY_FIELDS.map(k=>[k,'b'.repeat(64)])),world=new World(),reference={owner:'fixture.calibration',revision:'1'};
 const row=(id,correct)=>({id,source:id,score:0.95,eligible:true,correct});
 const retained=retainSelectiveCalibration(world,{...reference,identity:readerCalibrationIdentity(provenance,runtimeIdentity),scope:readerCalibrationScope(area),policy:{minFitAccepted:2,minEvaluationAccepted:2,maxErrorRate},fitRows:Array.from({length:support},(_,i)=>row('fit'+i,true)),evaluationRows:[row('eval0',true),row('eval1',!wrong)]});assert.equal(retained.ok,true);
 s.engine.requestReaderAdmission={world,reference,runtimeIdentity};return retained;
}
test('missing graph model refuses without fallback or state mutation',async()=>{const s=setup(),r=await routeNewEngine(s,text);assert.deepEqual(r.statuses,['unsupported']);assert.equal(drawing(s).objects[0].color,'red');assert.equal(r.trace.readerRouting.selected,null);assert.equal(r.trace.readerRouting.reason,'model-provider-unavailable');});
test('model receives source only; auxiliary output cannot borrow evaluation conditioning',async()=>{const s=setup();let args;s.engine.requestReader={propose:async(...a)=>{args=a;return {candidates:[],coverage:{complete:false,graphProposal:false},failures:[{reason:'graph-proposal-unavailable'}]};}};const r=await routeNewEngine(s,text,{expectedGold:'must-not-be-passed'});assert.deepEqual(args,[text]);assert.equal(r.trace.readerRouting.reason,'graph-proposal-unavailable');});
test('old arbitrary callbacks and output confidence cannot authorize execution',async()=>{const s=setup(),p=proposal();p.coverage.executable=true;p.graphConfidence=1;delete p.selectionScore;install(s,p);let called=false;s.engine.requestReaderGate={status:'approved',wrong:0,better:true,compared:999,reportSha256:'a'.repeat(64),modelSha256:provenance.modelSha256,decoderVersion:1,accepts:()=>{called=true;return true;}};const r=await routeNewEngine(s,text);assert.equal(called,false);assert.equal(r.trace.readerRouting.selected,null);assert.equal(r.trace.readerRouting.reason,'model-calibration-gate-closed');assert.equal(drawing(s).objects[0].color,'red');});
test('retained synthetic report admits complete proposal despite executablefalse and preserves native observed assessment',async()=>{const s=setup();install(s);calibration(s);const r=await routeNewEngine(s,text);assert.equal(r.trace.readerRouting.selected,'sop-bert',JSON.stringify(r.trace));assert.equal(r.trace.readerRouting.admission.score,0.95);assert.equal(r.trace.readerRouting.admission.assessment.admitted,true);assert.equal(drawing(s).objects[0].color,'#800080');assert.equal(r.trace.assessment,'changed');});
test('incorrect independent labels, inadequate support, wrong area or changed implementation keep gate closed',async()=>{
 for(const options of [{wrong:true},{support:1},{area:'other'},{changed:true},{wrong:true,maxErrorRate:1}]){const s=setup();install(s);calibration(s,options);if(options.changed)s.engine.requestReaderAdmission.runtimeIdentity.executorSha256='c'.repeat(64);const r=await routeNewEngine(s,text);assert.equal(r.trace.readerRouting.selected,null);assert.equal(drawing(s).objects[0].color,'red');}
});
test('malformed graph and source mismatch refuse before admission, with unchanged host',async()=>{for(const change of [p=>p.candidates[0].wires='@x core.rule',p=>p.candidates[0].wires=p.candidates[0].wires.replace(quote(text),quote('other'))]){const s=setup(),p=proposal();change(p);install(s,p);calibration(s);const r=await routeNewEngine(s,text);assert.equal(r.trace.readerRouting.selected,null);assert.equal(drawing(s).objects[0].color,'red');}});
test('report admission does not bypass native unsupported semantics or imply whole-request success',async()=>{const s=setup(),p=proposal();p.candidates[0].wires=`@source std.request.source text=${quote(text)}\n@r std.request act=make mood=do source=$source\n@t std.request.target request=$r mode=new kind=undeclared.subject`;install(s,p);calibration(s);const before=structuredClone(s.isession.state),r=await routeNewEngine(s,text);assert.equal(r.trace.readerRouting.selected,'sop-bert');assert.deepEqual(r.statuses,['unsupported']);assert.deepEqual(s.isession.state,before);});
test('model score ranks complete graphs independently of model executable',()=>{const p=proposal();assert.equal(scoreReaderProposal(p,text).score,0.95);p.coverage.executable=true;assert.equal(scoreReaderProposal(p,text).score,0.95);p.coverage.truncated=true;assert.equal(scoreReaderProposal(p,text).eligible,false);delete p.coverage.truncated;p.coverage.complete=false;assert.equal(scoreReaderProposal(p,text).eligible,false);assert.equal(scoreReaderProposal(p,text).score,0);});
test('invalid or non-English input does not invoke a model',async()=>{const s=setup();let calls=0;s.engine.requestReader={propose:async()=>{calls++;}};for(const [value,options] of [['',{}],['x'.repeat(65537),{}],['sample',{language:'ro'}]]){const r=await routeNewEngine(s,value,options);assert.deepEqual(r.statuses,['unsupported']);}assert.equal(calls,0);});

test('alternative complete model readings are retained while the first is applied with disclosed uncertainty',async()=>{const s=setup(),p=proposal();p.candidates.push(candidate());install(s,p);const r=await routeNewEngine(s,text);assert.equal(r.trace.readerRouting.selected,'sop-bert');assert.equal(r.trace.readerRouting.admission.alternatives.length,2);assert.equal(r.trace.readerRouting.admission.uncertain,true);assert.equal(drawing(s).objects[0].color,'#800080');assert.doesNotMatch(r.text,/\?/);});

test('the authored admission declaration changes the actual derived decision',()=>{
 const source=readFileSync(new URL('../worlds/app.project/reader-admission-policy.sop',import.meta.url),'utf8');
 assert.equal(POLICY,source);
 assert.equal(readerCalibrationErrorLimit(),0.05);
 const evidence='@proposal app.reader.evidence act=change calibration.configured=true calibration.admitted=true calibration.error.limit=0.04 score.available=true model.identity.present=true uncertain=false';
 const decide=(input,policy)=>parse(compileReaderAdmission(input,policy))[0].attrs;
 assert.deepEqual(decide(evidence,source).mode,['calibrated']);
 assert.deepEqual(decide(evidence,source.replace('max.error.rate=0.05','max.error.rate=0.03')).mode,['closed']);
 const reversible=evidence.replace('configured=true','configured=false');
 assert.deepEqual(decide(reversible,source).mode,['uncalibrated-best-effort']);
 const reclassified=source+'\n@new.mapping app.reader.act act=change class=destructive';
 assert.deepEqual(decide(reversible,reclassified).mode,['closed']);
 assert.throws(()=>compileReaderAdmission(evidence+'\n@forged app.reader.decision admitted=true'),/invalid-reader-admission-evidence/);
});

test('verified calibration obeys stricter destructive policy and configured rejections do not bootstrap',()=>{
 const s=setup(),p=proposal();
 const assess=()=>assessReaderProposal({proposal:p,text,provenance,area:'draw',admission:s.engine.requestReaderAdmission});
 const mode=()=>parse(assess().decisionSop)[0].attrs.mode[0];
 assert.equal(mode(),'uncalibrated-best-effort');
 calibration(s,{maxErrorRate:0.02});
 assert.equal(mode(),'calibrated');
 p.candidates[0].wires=p.candidates[0].wires.replace('act=change','act=remove');
 const rejected=assess();
 assert.equal(rejected.assessment.admitted,true);
 assert.equal(rejected.admitted,false);
 assert.equal(rejected.mode,'closed');
 calibration(s,{maxErrorRate:0.01});
 assert.equal(mode(),'calibrated');
 delete s.engine.requestReaderAdmission;
 assert.equal(mode(),'closed');
});
