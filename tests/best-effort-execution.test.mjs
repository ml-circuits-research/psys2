import {readReaderSource} from '../src/dialog/reader-source.mjs';
import {drawingObjects,drawingState} from './drawing-state.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {NATIVE_AREAS} from '../src/dialog/app-reader-context.mjs';
import {createDrawingArea,emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {emptyCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';
import {emptyDiagramState as initialDiagramState} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {selectedProbability,binaryDecisionProbability,combineModelScores} from '../src/dialog/model-selection-score.mjs';
const calendarPolicy=await (await import('node:fs/promises')).readFile(new URL('../worlds/time.calendar/scheduling-policy.sop',import.meta.url),'utf8');
const text='fixture source';
const graph=(act='make')=>({request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=${act} mood=do source=$s`+(act==='undo'?'':'\n@t std.request.target request=$r mode=new kind=fixture.entity name="A name"')});
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};
const cases=[['draw','drawing','art.draw',emptyDrawingState,'house','drawing.object.make'],['diagram','diagram','diagram.sketch',initialDiagramState,'rectangle','diagram.node.make'],['editor','document','docs.editor',initialDocumentState,'document','document.write'],['calendar','calendar','time.calendar',emptyCalendarArea,'person','calendar.person.add']];
for(const [tab,area,key,initial,kind,operation] of cases)test('declared creation acts with disclosed uncertainty and undo in '+area,async()=>{
 const state={[key]:initial(),'ui.shell':{activeTab:tab}},before=structuredClone(state),session={isession:{state},engine:{loader:{readFile:async()=>calendarPolicy}}};let candidate=graph();
 session.engine.requestReader={provenance:()=>provenance,bindings:()=>({kinds:[{area,canonical:'fixture.entity',lemma:kind,nativeFamilyBinding:{operation}}],properties:[]}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[candidate],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.63}})};
 const made=await routeNewEngine(session,text);assert.equal(made.statuses[0],'supported',JSON.stringify(made.trace));assert.notDeepEqual(session.isession.state[key],before[key]);assert.match(made.text,/Created/);assert.equal(made.trace.readerRouting.admission.mode,'uncalibrated-best-effort');assert.equal(made.trace.readerRouting.admission.uncertain,true);
 // Undo in one area preserves an unrelated area's newer state.
 session.isession.state.unrelated={newer:true};candidate=graph('undo');const undo=await routeNewEngine(session,text);assert.equal(undo.statuses[0],'supported',JSON.stringify(undo.trace));assert.deepEqual(session.isession.state[key],NATIVE_AREAS[tab].canonicalizeState?.(before[key])??before[key]);assert.deepEqual(session.isession.state.unrelated,{newer:true});assert.match(undo.text,/Undid/);
});
test('destructive requests retain stricter admission instead of borrowing reversible best effort',async()=>{
 const session={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{provenance:()=>provenance,propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[{request:'r',wires:`@s std.request.source text="${text}"\n@r std.request act=remove mood=do source=$s\n@t std.request.target request=$r mode=existing kind=fixture.entity`}],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.99}})}}};
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

test('context value correction and other-target correction use actual objects and restore the mistaken target',async()=>{
 const board=await drawingState(['house','fish'].map(kind=>({kind,color:'#ff0000'})));
 const state={'art.draw':board,'ui.shell':{activeTab:'draw'}},session={isession:{state},engine:{loader:{readFile:async()=>calendarPolicy}}};
 const bindings={kinds:['house','fish'].map(kind=>({area:'drawing',type:'drawn',lemma:kind,canonical:'fixture.'+kind,nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]};
 let input='fixture blue',other=false;
 session.engine.requestReader={provenance:()=>provenance,bindings:()=>bindings,registry:()=>({'drawing.drawn.colour':{concept:'colour'}}),propose:async()=>({coverage:{complete:false},candidates:[],failures:[{reason:'context-reference-not-bound'}],selectionScore:{definition:'psys2.model-minimum/1',value:0.67},
  raw:{source:{text:input,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},requests:[{act:'change',mood:'do',target:other?{mode:'bound',type:'drawn',quantifier:'other'}:{mode:'existing',type:'drawn',fill:'context'},constraints:other?[]:[{key:'drawn.colour',value:'blue',value_span:'blue',phase:'result',operator:'eq',polarity:'positive',character:'requirement'}],turn:{fragment:'replaces'}}],ranges:other?[]:[{path:['requests','0','constraints','0','value_span'],range:[8,12]}]}})};
 let r=await routeNewEngine(session,input);assert.equal(r.statuses[0],'supported');assert.equal(drawingObjects(board).find(o=>o.kind==='fish').color,'#0000ff');assert.equal(drawingObjects(board).find(o=>o.kind==='house').color,'#ff0000');assert.match(r.text,/fish/);
 input='fixture target revision';other=true;r=await routeNewEngine(session,input);const current=session.isession.state['art.draw'];assert.equal(r.statuses[0],'supported',JSON.stringify(r.trace));assert.equal(drawingObjects(current).find(o=>o.kind==='house').color,'#0000ff');assert.equal(drawingObjects(current).find(o=>o.kind==='fish').color,'#ff0000');assert.match(r.text,/other house/);assert.equal(r.trace.interpretation.alternatives.length,2);
});

import {projectCreateAction} from '../src/dialog/project-create-action.mjs';
import creationPolicy from '../worlds/app.project/creation-policy-source.mjs';
import {executeDeclaredRequest} from '../src/dialog/declared-execution.mjs';
test('creation projection resolves conflicting type heads by anchored declared identity and guesses a declared typo',async()=>{
 const session={isession:{state:{'art.draw':emptyDrawingState()}}},bindings={kinds:[{area:'drawing',type:'drawn',canonical:'fixture.house',lemma:'house',nativeFamilyBinding:{operation:'drawing.object.make'}}],properties:[]};
 const message='fixture hosue',p={coverage:{complete:false},candidates:[],failures:[{reason:'unresolved-canonical-kind-binding'}],raw:{source:{text:message,unit:'unicode-scalar'},requestCount:1,coverage:{truncated:false},requests:[{act:'make',mood:'do',trigger:'fixture',target:{mode:'new',type:'a-conflicting-class',kind:'hosue',kind_span:'hosue'},constraints:[]}],ranges:[{path:['requests','0','trigger'],range:[0,7]},{path:['requests','0','target','kind_span'],range:[8,13]}]}};
 const original=structuredClone(session.isession.state),result=await projectCreateAction(p,session,{bindings,registry:{},view:'draw'});assert.equal(result.coverage.complete,true);assert.match(result.candidates[0].wires,/fixture.house/);assert.match(result.interpretation.note,/hosue/);assert.deepEqual(session.isession.state,original);assert.equal(p.coverage.complete,false);
 const unsupported=structuredClone(p);unsupported.raw.requests[0].constraints=[{polarity:'negative'}];assert.equal(await projectCreateAction(unsupported,session,{bindings,registry:{},view:'draw'}),null);
});

test('creation hypotheses preserve exact identities, consume coextensive evidence and apply an independently anchored name',async()=>{
 const authored=await (await import('node:fs/promises')).readFile(new URL('../worlds/app.project/creation-policy.sop',import.meta.url),'utf8');assert.equal(creationPolicy,authored);
 const source='Draw a square named Oval',query={mode:'new',type:'drawn',kind:'square',kind_span:'square'};
 const makeup=(key,value)=>({key,value,value_span:value,operator:'eq',phase:'result',polarity:'positive',character:'requirement'});
 const proposal={coverage:{complete:false},candidates:[],failures:[{reason:'unresolved-canonical-kind-binding'}],selectionScore:{definition:'psys2.model-minimum/1',value:0.7},
  raw:{source:{text:source,unit:'unicode-scalar'},requestCount:1,coverage:{truncated:false},
   requests:[{act:'make',mood:'do',trigger:'Draw',target:query,constraints:[makeup('shape','square'),makeup('name','Oval')]}],
   ranges:[{path:['requests','0','trigger'],range:[0,4]},{path:['requests','0','target','kind_span'],range:[7,13]},
    {path:['requests','0','constraints','0','value_span'],range:[7,13]},{path:['requests','0','constraints','1','value_span'],range:[20,24]}]}};
 const kinds=[{canonical:'fixture.square',lemma:'square'},{canonical:'fixture.square',lemma:'square'},{canonical:'fixture.outline.square',lemma:'square'}];
 const bindings={kinds:kinds.map(k=>({...k,area:'drawing',type:'drawn',nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]};
 const registry={'drawing.shape':{concept:'shape'},'drawing.name':{concept:'name'}};
 const board=emptyDrawingState(),before=structuredClone(board);
 const session={isession:{state:{'art.draw':board,'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{
  provenance:()=>provenance,bindings:()=>bindings,registry:()=>registry,propose:async()=>proposal,
 }}};
 const completed=await projectCreateAction(proposal,session,{view:'draw',bindings,registry});
 assert.deepEqual(completed.interpretation.alternatives.map(row=>row.canonical),['fixture.square','fixture.outline.square']);
 assert.equal(completed.candidates.length,2);
 assert.deepEqual(completed.interpretation.unapplied,[]);
 const made=await routeNewEngine(session,source,{view:'draw'});
 assert.equal(made.statuses[0],'supported',JSON.stringify(made.trace));
 assert.equal(made.trace.readerRouting.admission.alternatives.length,2);
 assert.match(made.trace.readingComparison,/std.interpret.reading/);
 assert.match(made.text,/I named it "Oval"/);
 assert.deepEqual(drawingObjects(session.isession.state['art.draw']).map(({kind,name})=>({kind,name})),[{kind:'square',name:'Oval'}]);
 assert.equal(session.newEngineUndo.length,1);
 const undone=await routeNewEngine(session,`@r std.request act=undo mood=do source=$s @s std.request.source text="Undo"`,{view:'draw'});
 assert.equal(undone.statuses[0],'supported');
 assert.deepEqual(session.isession.state['art.draw'],before);
 const forged=structuredClone(proposal);forged.raw.ranges.at(-1).range=[7,13];
 assert.equal(await projectCreateAction(forged,session,{view:'draw',bindings,registry}),null);
 const otherPolicy=creationPolicy.replace('role=name parameter="name"', 'role=name parameter="unavailable-name"');
 const alternative=await projectCreateAction(proposal,session,{view:'draw',bindings,registry,policy:otherPolicy});
 assert.deepEqual(alternative.interpretation.unapplied,['name Oval']);
 assert.doesNotMatch(alternative.candidates[0].wires,/\bname=/);
 const applied=await executeDeclaredRequest(session,alternative.candidates[0],source,{view:'draw',bindings,unapplied:alternative.interpretation.unapplied});
 assert.equal(applied.statuses[0],'supported');
 assert.match(applied.text,/could not apply name Oval/);
 assert.equal(drawingObjects(session.isession.state['art.draw'])[0].name,undefined);

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

import {DialogSession} from '../src/dialog/index.mjs';
test('interface translation reaches only the English reader; unavailable input translation never invokes it',async()=>{
 let reads=0,seen=null;
 const session={language:'fr',isession:{state:{}},engine:{translator:{machineTranslate:async()=>{throw Error('not available');}},requestReader:{propose:async sourceSop=>{reads++;seen=readReaderSource(sourceSop);return {candidates:[],failures:[]};}}}};
 let r=await DialogSession.prototype._send.call(session,'source text');
 assert.equal(reads,0);assert.equal(r.trace.reason,'translation-unavailable');assert.deepEqual(r.effects,[]);
 const translations=[];
 session.engine.translator.machineTranslate=async(input,pair)=>{translations.push(pair);return pair.to==='en'?'English source text':'Translated effect reply';};
 r=await DialogSession.prototype._send.call(session,'source text');
 assert.equal(reads,1);assert.equal(seen,'English source text');assert.equal(r.trace.translation.original,'source text');assert.equal(r.text,'Translated effect reply');assert.deepEqual(translations,[{from:'fr',to:'en'},{from:'en',to:'fr'}]);
 session.engine.translator.detectInput=async()=>[{detectedLanguage:'en',confidence:0.99}];
 translations.length=0;r=await DialogSession.prototype._send.call(session,'English typed input');
 assert.equal(seen,'English typed input');assert.equal(translations.length,1);assert.equal(translations[0].from,'en');
 session.engine.translator.machineTranslate=async()=>{throw Error('output failed');};
 r=await DialogSession.prototype._send.call(session,'English typed input');assert.equal(reads,3);assert.equal(r.trace.replyTranslation,'unavailable');assert.match(r.text,/Nothing changed/);
});

import {samplingSchema,createNativeRequestSampler} from '../src/dialog/native-request-sampler.mjs';

test('request sampling reads capability declarations and actual objects in an additional area',()=>{
 const shape=samplingSchema({area:'fixture',operations:[{id:'fixture.make',act:'make',on:'fixture.entity',params:{kind:{enum:['widget']}}},{id:'fixture.change',act:'change',on:'fixture.entity',params:{height:{type:'number',min:1,max:8}}}],observation:{objects:[{id:'current',kind:'widget',inputs:[]}]},bindings:{kinds:[{area:'fixture',lemma:'widget',nativeFamilyBinding:{operation:'fixture.make'}}],properties:[{area:'fixture',canonical:'height',hostBinding:{operation:'fixture.change',parameter:'height'}}]}});
 assert.deepEqual(shape.schema.kinds.widget.acts,['make','change']);assert.deepEqual(shape.things.map(t=>t.id),['current']);assert.equal(shape.schema.attrs.height.max,8);
});
test('background probes yield to a host task before the next reader call',async()=>{
 // Reader calls that settle as microtasks would otherwise run every probe before a host message (a task) is seen.
 const bindings={kinds:[{area:'drawing',lemma:'circle',canonical:'fixture.circle',nativeFamilyBinding:{operation:'drawing.object.make'}}],properties:[]};
 let reads=0;const session={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{bindings:()=>bindings,provenance:()=>provenance,propose:async()=>{reads++;return {candidates:[],failures:[{reason:'fixture-unread'}],coverage:{complete:false}};}}}};
 const before=structuredClone(session.isession.state),host=await createDrawingArea({state:structuredClone(session.isession.state['art.draw']),instanceId:'yield-test'});
 let hostAsked=false;setTimeout(()=>{hostAsked=true;},0);
 const result=await createNativeRequestSampler().sample({session,area:'drawing',view:'draw',world:'art.draw',host,createHost:createDrawingArea,bindings,count:4,shouldYield:()=>hostAsked});
 assert.equal(reads,0,'a pending host task is honoured before the next reader call');assert.equal(result.probes,0);assert.equal(result.items.length,0);assert.deepEqual(session.isession.state,before);
});
test('dice probes use the normal reader on an isolated state and reject a non-changing reader',async()=>{
 const bindings={kinds:[{area:'drawing',lemma:'circle',canonical:'fixture.circle',nativeFamilyBinding:{operation:'drawing.object.make'}}],properties:[]};
 const session={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{requestReader:{bindings:()=>bindings,provenance:()=>provenance,propose:async sourceSop=>({coverage:{complete:true,graphProposal:true},failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.7},candidates:[{request:'r',wires:`@s std.request.source text=${JSON.stringify(readReaderSource(sourceSop))}\n@r std.request act=make mood=do source=$s\n@t std.request.target request=$r mode=new kind=fixture.circle`}]})}}};
 const before=structuredClone(session.isession.state),host=await createDrawingArea({state:structuredClone(session.isession.state['art.draw']),instanceId:'dice-test'});
 const options={session,area:'drawing',view:'draw',world:'art.draw',host,createHost:createDrawingArea,bindings};
 const r=await createNativeRequestSampler().sample(options);assert.equal(r.items.length,1);assert.equal(r.items[0].verifiedEffect,true);assert.deepEqual(session.isession.state,before);assert.equal(session.newEngineUndo,undefined);
 let yieldNow=false;
 const propose=session.engine.requestReader.propose;
 session.engine.requestReader.propose=async source=>{const result=await propose(source);yieldNow=true;return result;};
 const interrupted=await createNativeRequestSampler().sample({...options,count:4,shouldYield:()=>yieldNow});
 assert.equal(interrupted.probes,1);
 assert.equal(interrupted.items.length,1);
 assert.deepEqual(session.isession.state,before);
 session.engine.requestReader.propose=async()=>({candidates:[],failures:[]});const refused=await createNativeRequestSampler().sample(options);assert.equal(refused.items.length,0);assert.deepEqual(session.isession.state,before);
});
