import {test} from 'node:test';import assert from 'node:assert/strict';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {selectedProbability,binaryDecisionProbability,combineModelScores} from '../src/dialog/model-selection-score.mjs';
const text='fixture source';
const graph=(act='make')=>({request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=${act} mood=do source=$s`+(act==='undo'?'':'\n@t std.request.target request=$r mode=new kind=fixture.entity name="A name"')});
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};
const cases=[['draw','drawing','art.draw',initialDrawingState,'house','drawing.object.make'],['diagram','diagram','diagram.sketch',initialDiagramState,'rectangle','diagram.node.make'],['editor','document','docs.editor',initialDocumentState,'document','document.write'],['calendar','calendar','time.calendar',()=>({people:[],rooms:[],meetings:[]}),'person','calendar.person.add']];
for(const [tab,area,key,initial,kind,operation] of cases)test('declared creation acts with disclosed uncertainty and undo in '+area,async()=>{
 const state={[key]:initial(),'ui.shell':{activeTab:tab}},before=structuredClone(state),session={isession:{state},engine:{}};let candidate=graph();
 session.engine.requestReader={provenance:()=>provenance,bindings:()=>({kinds:[{area,canonical:'fixture.entity',lemma:kind,nativeFamilyBinding:{operation}}],properties:[]}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[candidate],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.63}})};
 const made=await routeNewEngine(session,text);assert.equal(made.statuses[0],'supported',JSON.stringify(made.trace));assert.notDeepEqual(session.isession.state[key],before[key]);assert.match(made.text,/Created/);assert.equal(made.trace.readerRouting.admission.mode,'uncalibrated-best-effort');assert.equal(made.trace.readerRouting.admission.uncertain,true);
 // Undo in one area preserves an unrelated area's newer state.
 session.isession.state.unrelated={newer:true};candidate=graph('undo');const undo=await routeNewEngine(session,text);assert.equal(undo.statuses[0],'supported');assert.deepEqual(session.isession.state[key],before[key]);assert.deepEqual(session.isession.state.unrelated,{newer:true});assert.match(undo.text,/Undid/);
});
test('destructive requests retain stricter admission instead of borrowing reversible best effort',async()=>{
 const session={isession:{state:{'art.draw':initialDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{provenance:()=>provenance,propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[{request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=remove mood=do source=$s\n@t std.request.target request=$r mode=existing kind=fixture.entity`}],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.99}})}}};
 const result=await routeNewEngine(session,text);assert.equal(result.statuses[0],'unsupported');assert.equal(result.trace.readerRouting.selected,null);assert.doesNotMatch(result.text,/\?/);
});
test('selection score is a real-valued minimum of neural probabilities, not an execution confidence claim',()=>{
 assert.ok(Math.abs(selectedProbability([0,1],1)-0.7310585786)<1e-9);assert.equal(binaryDecisionProbability(0),0.5);assert.equal(combineModelScores([0.9,0.72]).value,0.72);assert.equal(combineModelScores([0.9,0.72]).calibrated,false);assert.equal(combineModelScores([null,0.9]),null);assert.throws(()=>selectedProbability([Infinity],0));
});

import {projectJournalAction} from '../src/dialog/project-journal-action.mjs';
test('journal-step act is projected from learned act/fill and exact source evidence, never a command phrase',()=>{
 const raw={source:{text,unit:'unicode-scalar'},requestCount:1,requests:[{act:'undo',mood:'do',trigger:'fixture',target:{fill:'journal_step'},constraints:[]}],ranges:[{path:['requests','0','trigger'],range:[0,7]}],coverage:{complete:false,truncated:false}};
 const p={raw,candidates:[],coverage:{complete:false},failures:[{reason:'irrelevant-target-head'}]};
 const projected=projectJournalAction(p);assert.equal(projected.coverage.complete,true);assert.equal(projected.interpretation.unresolved[0].reason,'irrelevant-target-head');assert.match(projected.candidates[0].wires,/act=undo/);assert.equal(p.coverage.complete,false);
 for(const change of [r=>r.requests[0].act='make',r=>r.requests[0].mood='ask',r=>r.requests[0].constraints.push({value:'result'}),r=>r.ranges=[]]){const altered=structuredClone(p);change(altered.raw);assert.equal(projectJournalAction(altered),altered);}
});

import {createDrawingHost} from '../worlds/art.draw/declared-host.mjs';
test('context value correction and other-target correction use actual objects and restore the mistaken target',async()=>{
 const board=initialDrawingState(),host=createDrawingHost({state:board,instanceId:'context-native-fixture'});
 for(const kind of ['house','fish'])host.invoke({invocation:kind,expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind,color:'#ff0000'}});
 const state={'art.draw':board,'ui.shell':{activeTab:'draw'}},session={isession:{state},engine:{}};
 const bindings={kinds:['house','fish'].map(kind=>({area:'drawing',type:'drawn',lemma:kind,canonical:'fixture.'+kind,nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]};
 let input='fixture blue',other=false;
 session.engine.requestReader={provenance:()=>provenance,bindings:()=>bindings,registry:()=>({'drawing.drawn.colour':{concept:'colour'}}),propose:async()=>({coverage:{complete:false},candidates:[],failures:[{reason:'context-reference-not-bound'}],selectionScore:{definition:'psys2.model-minimum/1',value:0.67},
  raw:{source:{text:input,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},requests:[{act:'change',mood:'do',target:other?{mode:'bound',type:'drawn',quantifier:'other'}:{mode:'existing',type:'drawn',fill:'context'},constraints:other?[]:[{key:'drawn.colour',value:'blue',value_span:'blue',phase:'result',operator:'eq',polarity:'positive',character:'requirement'}],turn:{fragment:'replaces'}}],ranges:other?[]:[{path:['requests','0','constraints','0','value_span'],range:[8,12]}]}})};
 let r=await routeNewEngine(session,input);assert.equal(r.statuses[0],'supported');assert.equal(board.objects.find(o=>o.kind==='fish').color,'#0000ff');assert.equal(board.objects.find(o=>o.kind==='house').color,'#ff0000');assert.match(r.text,/fish/);
 input='fixture target revision';other=true;r=await routeNewEngine(session,input);const current=session.isession.state['art.draw'];assert.equal(r.statuses[0],'supported',JSON.stringify(r.trace));assert.equal(current.objects.find(o=>o.kind==='house').color,'#0000ff');assert.equal(current.objects.find(o=>o.kind==='fish').color,'#ff0000');assert.match(r.text,/other house/);assert.equal(r.trace.interpretation.alternatives.length,2);
});

import {projectCreateAction} from '../src/dialog/project-create-action.mjs';
test('creation projection resolves conflicting type heads by anchored declared identity and guesses a declared typo',async()=>{
 const session={isession:{state:{'art.draw':initialDrawingState()}}},bindings={kinds:[{area:'drawing',type:'drawn',canonical:'fixture.house',lemma:'house',nativeFamilyBinding:{operation:'drawing.object.make'}}],properties:[]};
 const message='fixture hosue',p={coverage:{complete:false},candidates:[],failures:[{reason:'unresolved-canonical-kind-binding'}],raw:{source:{text:message,unit:'unicode-scalar'},requestCount:1,coverage:{truncated:false},requests:[{act:'make',mood:'do',trigger:'fixture',target:{mode:'new',type:'a-conflicting-class',kind:'hosue',kind_span:'hosue'},constraints:[]}],ranges:[{path:['requests','0','trigger'],range:[0,7]},{path:['requests','0','target','kind_span'],range:[8,13]}]}};
 const original=structuredClone(session.isession.state),result=await projectCreateAction(p,session,{bindings,registry:{},view:'draw'});assert.equal(result.coverage.complete,true);assert.match(result.candidates[0].wires,/fixture.house/);assert.match(result.interpretation.note,/hosue/);assert.deepEqual(session.isession.state,original);assert.equal(p.coverage.complete,false);
 const unsupported=structuredClone(p);unsupported.raw.requests[0].constraints=[{polarity:'negative'}];assert.equal(await projectCreateAction(unsupported,session,{bindings,registry:{},view:'draw'}),null);
});

import {fixtureEngine} from './helpers.mjs';
test('undo, focus and the last applied intent survive the session recreation used by lazy world loading',async()=>{
 const engine=await fixtureEngine(),first=engine.createSession({language:'en'});
 first.newEngineUndo=[{area:'draw',before:{native:{value:1}},after:{native:{value:2}}}];first.newEngineFocus={draw:'object-2'};first.newEngineLastAction={draw:graph()};
 const memory=JSON.parse(JSON.stringify(first.memoryJSON())),second=engine.createSession({language:'en'});second.restoreMemory(memory);
 assert.deepEqual(second.newEngineUndo,first.newEngineUndo);assert.deepEqual(second.newEngineFocus,first.newEngineFocus);assert.deepEqual(second.newEngineLastAction,first.newEngineLastAction);
 const snap=second.snapshot();second.newEngineUndo=[];second.newEngineFocus={};second.newEngineLastAction={};second.restore(snap);assert.deepEqual(second.newEngineUndo,first.newEngineUndo);assert.deepEqual(second.newEngineLastAction,first.newEngineLastAction);
 second.newEngineUndo[0].before.native.value=99;assert.equal(first.newEngineUndo[0].before.native.value,1);
});
