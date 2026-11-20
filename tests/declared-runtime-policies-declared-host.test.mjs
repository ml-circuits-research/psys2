// Runtime decisions that used to be JavaScript constants are declared SOP facts read by generic code:
//  - worlds/app.project/interpretation-policy.sop: reader re-reading order, eligibility and notes, comparison bounds,
//    the coordination trigger and the language-detection confidence (reader-routing.mjs, index.mjs);
//  - worlds/app.project/area-registry.sop: the editor views, their reader areas, worlds and focus paths (NATIVE_AREAS);
//  - worlds/app.project/placement-default-policy.sop: default-placement defaults, the region choice and the ranked
//    alternative reading of a failed relation placement;
//  - worlds/app.project/creation-policy.sop app.creation.limits: creation retention limits.
// Voice admission holds no word list: every spoken message reaches the reader unless the wake-word setting holds it back.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,parse,serialize} from '../src/vendor/sopworld/sopworld.mjs';
import {interpretationPolicy,retryNote,coordinationEligible,comparisonBounds} from '../src/dialog/interpretation-policy.mjs';
import INTERPRETATION from '../worlds/app.project/interpretation-policy-source.mjs';
import {NATIVE_AREAS,loadAreaRegistry} from '../src/dialog/app-reader-context.mjs';
import AREAS from '../worlds/app.project/area-registry-source.mjs';
import {resolveObjective,chooseRegion,stopAtNoOverlap,placementHypotheses} from '../src/dialog/placement-default-policy.mjs';
import {regionProblem} from '../src/dialog/default-placement.mjs';
import CREATION from '../worlds/app.project/creation-policy-source.mjs';
import CREATION_SCHEMA from '../worlds/app.project/creation-schema-source.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {classifyVoice} from '../docs/webchat/ui/voice-noise.mjs';

test('the reader interpretation policy is read from SOP facts and validated',()=>{
 const policy=interpretationPolicy();
 assert.deepEqual(policy.retries.map(retry=>[retry.profile,retry.method,retry.drops]),[['independent','proposeIndependent',['previous']],['literal','proposeLiteral',['previous','objects']]]);
 assert.deepEqual(comparisonBounds('uncalibrated-best-effort'),{id:'interpret.compare.best-effort',min:2,max:16});
 assert.equal(comparisonBounds('calibrated'),null);
 assert.equal(policy.language.minConfidence,0.8);
 assert.equal(coordinationEligible({raw:{requests:[{act:'make'}]}})?.id,'interpret.coordination.make');
 assert.equal(coordinationEligible({raw:{requests:[{act:'make'},{act:'make'}]}}),null);
 assert.equal(coordinationEligible({raw:{requests:[{act:'remove'}]}}),null);
 // The reply names only the context a used re-reading actually left out.
 assert.match(retryNote('independent',new Set()),/without the previous one\.$/);
 assert.match(retryNote('literal',new Set(['independent'])),/previous one or the objects/);
 assert.match(retryNote('literal',new Set()),/without the objects on the page/);
 // Reordering is a policy change, not a code change.
 const reordered=INTERPRETATION.replace('order=1 when','order=3 when');
 assert.deepEqual(interpretationPolicy(reordered).retries.map(retry=>retry.profile),['literal','independent']);
 // A malformed policy never falls back to a built-in default.
 assert.throws(()=>interpretationPolicy(INTERPRETATION.replace('min.confidence=0.8','min.confidence=1.5')),/invalid-interpretation-policy/);
 assert.throws(()=>interpretationPolicy(INTERPRETATION.replace('min=2 max=16','min=9 max=3')),/min > max/);
});

test('every declared re-reading attempt is traced and lights the map, also an unavailable or failed one',async()=>{
 const events=[],calls=[];
 const incomplete={coverage:{complete:false,graphProposal:false,executable:false},candidates:[],failures:[{reason:'incomplete-provider-coverage'}],raw:{requests:[{act:'change'}]}};
 const session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':emptyDrawingState()}},newEngineJournal:[],
  engine:{onWorldActivity:event=>events.push(event),requestReader:{provenance:()=>null,bindings:()=>null,registry:()=>null,
   propose:async()=>{calls.push('primary');return structuredClone(incomplete);},
   proposeIndependent:async()=>{calls.push('independent');throw Error('reader worker lost');},
   proposeLiteral:async()=>{calls.push('literal');return null;}}}};
 const before=structuredClone(session.isession.state);
 const reply=await routeNewEngine(session,'make it fancy',{view:'draw'});
 assert.deepEqual(calls,['primary','independent','literal'],'the declared order');
 assert.deepEqual(reply.statuses,['unsupported']);
 assert.deepEqual(session.isession.state,before);
 const retry=reply.trace.readerRouting.contextRetry;
 assert.deepEqual(retry.unavailable.map(entry=>[entry.profile,entry.reason]),[['independent','failed'],['literal','no-reading']]);
 assert.match(retry.unavailable[0].error,/reader worker lost/);
 const lit=events.filter(event=>event.operation==='app.reader.retry');
 assert.deepEqual(lit.map(event=>[event.profile,event.available]),[['independent',false],['literal',false]]);
});

test('the editor views come from the declared area registry',()=>{
 assert.deepEqual(Object.entries(NATIVE_AREAS).map(([view,area])=>[view,area.area,area.world]),
  [['avatar','avatar','ui.avatar'],['draw','drawing','art.draw'],['diagram','diagram','diagram.sketch'],['editor','document','docs.editor'],['calendar','calendar','time.calendar']]);
 assert.deepEqual(NATIVE_AREAS.draw.historySelection,[['runtime','view','selected'],['runtime','view','part']]);
 assert.deepEqual(NATIVE_AREAS.editor.historySelection.map(path=>path.at(-1)),['selected','from','to','at']);
 assert.deepEqual(NATIVE_AREAS.diagram.historyView,[['runtime','view','ids']]);
 assert.equal(NATIVE_AREAS.calendar.historyView,undefined);
 assert.equal(typeof NATIVE_AREAS.draw.create,'function');
 // A view whose world has no native host, or a path of an undeclared view, is an error, never a silent skip.
 assert.throws(()=>loadAreaRegistry(AREAS+'\n@area.map app.area.view view=map area=map world=geo.map separate.runtime=true\n'),/without-native-host/);
 assert.throws(()=>loadAreaRegistry(AREAS+'\n@area.ghost.focus app.area.path view=ghost role=focus order=0 key=runtime\n'),/path-without-view/);
});

test('default placement takes omitted objective keys from declared defaults and picks regions by declared criteria',()=>{
 const {objective,defaulted}=resolveObjective({gap:10,peerWeight:10000,grid:10});
 assert.equal(objective.budget,2000);assert.equal(objective.stackWeight,50);assert.equal(objective.peerWeight,10000);
 assert.ok(defaulted.includes('budget')&&!defaulted.includes('peerWeight'));
 const packet=regionProblem({region:{size:20,min_x:0,min_y:0,max_x:100,max_y:100},frame:{min_x:0,min_y:0,max_x:400,max_y:400},peers:[],objective:{}});
 assert.match(packet,/std\.problem\.request budget=2000 /);
 assert.match(packet,/name=x min=\S+ max=\S+ step=10$/m,'grid: the shorter frame side over the declared 40 divisions');
 // Fewest overlaps first, then the declared order.
 assert.equal(chooseRegion([{overlaps:2,order:0},{overlaps:1,order:1},{overlaps:1,order:2}]).index,1);
 assert.equal(chooseRegion([{overlaps:0,order:0},{overlaps:0,order:1}]).index,0);
 assert.equal(stopAtNoOverlap(),true);
 const [hypothesis]=placementHypotheses();
 assert.deepEqual([hypothesis.name,hypothesis.when,hypothesis.act,hypothesis['act.to']],['create-absent-target','unbound-target','place','make']);
});

test('creation retention limits are declared facts of the creation policy',()=>{
 const world=new World({library:{'app.creation':CREATION_SCHEMA}});
 assert.ok(world.tell(CREATION).ok);
 const [limits,...more]=world.ofType('app.creation.limits');
 assert.equal(more.length,0);
 assert.deepEqual(Object.fromEntries(Object.entries(limits.attrs).map(([key,[value]])=>[key,Number(value)])),{alternatives:5,batch:200,lemma:64});
 // The constant family criterion is gone: no criterion measures what nothing observes.
 assert.doesNotMatch(CREATION,/otherFamily/);
});

test('voice admission holds no word list: the reader decides, only the wake-word setting holds a message back',async()=>{
 for(const text of ['a dog chasing a cat over the hill','yes','purple']){
  const verdict=await classifyVoice(text,{});
  assert.equal(verdict.ignore,false,text);
 }
 assert.equal((await classifyVoice('draw a house',{wake:true})).ignore,true);
 assert.equal((await classifyVoice('robot draw a house',{wake:true})).ignore,false);
 assert.equal((await classifyVoice('   ',{})).ignore,true);
});
