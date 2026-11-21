import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World,parse } from '../src/vendor/sopworld/sopworld.mjs';
import { resolveRequestRoute } from '../src/dialog/request-routing-policy.mjs';
import { compareDeclaredReadings } from '../src/dialog/declared-execution.mjs';
import { routeNewEngine } from '../src/dialog/reader-routing.mjs';
import { emptyDrawingState } from '../worlds/art.draw/sop-drawing.mjs';
import { drawingObjects } from './drawing-state.mjs';

function request(act,body=''){
 return {request:'request',wires:'@source std.request.source text="Observed request"\n'
  +'@request std.request act='+act+' mood=do source=$source\n'+body};
}
const subject='@subject std.request.target request=$request mode=new kind=fixture.fish\n';
const anchor='@anchor std.request.target request=$request mode=existing kind=fixture.house\n';
const relation=name=>'@relation std.request.constraint request=$request target=$subject goal=$anchor concept=place operator=relation relation='
 +name+' polarity=positive character=requirement';
const placement=relationName=>request('make',subject+anchor+relation(relationName));

test('request interpreter routing requires an owned relation and distinct owned targets',()=>{
 const actOnly=resolveRequestRoute(request('make'));
 const targetOnly=resolveRequestRoute(request('make',subject));
 for(const result of [actOnly,targetOnly]){
  assert.equal(result.method,'capability');
  assert.equal(result.rule,'route.capability');
 }
 for(const candidate of [
  request('make',subject+relation('near')),
  request('make',anchor+relation('near')),
  request('make',subject+anchor+relation('near').replace('goal=$anchor','goal=$subject')),
  request('make',subject+anchor+relation('near').replace('goal=$anchor','goal=$source')),
 ]){
  assert.notEqual(resolveRequestRoute(candidate).method,'spatial');
 }
 const selected=resolveRequestRoute(placement('near'));
 assert.equal(selected.method,'spatial');
 assert.equal(selected.rule,'route.spatial');
 assert.equal(selected.proof.from.find(row=>row.via)?.via,'route.bind-placement');
 assert.equal(parse(selected.wires).filter(row=>row.type==='app.request.route.selection').length,1);
 assert.equal(resolveRequestRoute({...placement('near'),request:'wrong'}).reason,'invalid-routing-request');
 const injected=request('make',subject+'@bad app.request.route.selection request=$request method=spatial');
 assert.equal(resolveRequestRoute(injected).reason,'invalid-routing-request');
 const history=resolveRequestRoute(request('undo'));
 assert.equal(history.rule,'route.history');
 assert.ok(history.proof.from.some(row=>row.id==='history.undo'&&row.told));
});

test('actual declared capability, spatial and history interpreters route once and keep refusals local',async()=>{
 const activities=[],world='art.draw';
 const bindings={kinds:['house','fish'].map(lemma=>({area:'drawing',type:'drawn',lemma,canonical:'fixture.'+lemma,
  nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]};
 const session={engine:{nativeBindings:bindings,onWorldActivity:event=>activities.push(event)},
  isession:{state:{[world]:emptyDrawingState()}}};
 const observe=()=>drawingObjects(session.isession.state[world]).map(({kind})=>kind);
 const run=async(candidate,method)=>{
  const start=activities.length;
  const result=await routeNewEngine(session,candidate.wires,{view:'draw'});
  const events=activities.slice(start);
  const routes=events.filter(event=>event.operation==='app.request.route');
  assert.deepEqual(routes.map(event=>event.method),[method]);
  assert.equal(result.trace.executionRoute.method,method);
  assert.equal(routes[0].rule,result.trace.executionRoute.rule);
  return {result,events};
 };
 const creation=request('make',subject.replace('fixture.fish','fixture.house'));
 const made=await run(creation,'capability');
 assert.equal(made.result.statuses[0],'supported',JSON.stringify(made.result.trace));
 assert.equal(made.events.filter(event=>event.operation==='policy.execution.compile').length,1);
 assert.deepEqual(observe(),['house']);
 const placed=await run(placement('near'),'spatial');
 assert.equal(placed.result.statuses[0],'supported',JSON.stringify(placed.result.trace));
 assert.equal(placed.result.trace.geometryVerified,true);
 assert.equal(placed.events.filter(event=>event.operation==='std.placement'&&event.phase==='start').length,1);
 assert.deepEqual(observe(),['house','fish']);
 const refused=await run(placement('unknown-relation'),'spatial');
 assert.equal(refused.result.statuses[0],'unsupported');
 assert.equal(refused.result.trace.reason,'undeclared-relation');
 assert.ok(refused.result.trace.placement);
 assert.equal(refused.events.filter(event=>event.operation==='policy.execution.compile').length,0);
 assert.deepEqual(observe(),['house','fish']);
 const comparison=await compareDeclaredReadings(session,[placement('unknown-relation'),creation],{view:'draw',bindings});
 assert.equal(comparison.index,1);
 assert.equal(comparison.plan.status,'compiled');
 const compared=parse(comparison.sop);
 assert.equal(compared.find(row=>row.type==='app.request.route.comparison').attrs.reason[0],'no-common-interpreter-comparison');
 assert.deepEqual(compared.filter(row=>row.type==='app.request.route.alternative').map(row=>[row.attrs.method[0],row.attrs.assessed[0]]),
  [['spatial','false'],['capability','true']]);
 assert.equal(compared.filter(row=>row.type==='std.interpret.reading').length,1);
 assert.deepEqual(observe(),['house','fish']);
 const scoped=await run(request('undo',subject),'history');
 const inquiry=request('undo');
 inquiry.wires=inquiry.wires.replace('mood=do','mood=ask');
 const asked=await run(inquiry,'history');
 for(const rejected of [scoped,asked]){
  assert.equal(rejected.result.statuses[0],'unsupported');
  assert.ok(rejected.result.trace.compiledSop);
 }
 assert.deepEqual(observe(),['house','fish']);
 const undone=await run(request('undo'),'history');
 assert.equal(undone.result.statuses[0],'supported');
 assert.equal(undone.events.filter(event=>event.operation==='std.compile').length,1);
 assert.deepEqual(observe(),['house']);
 const redone=await run(request('redo'),'history');
 assert.equal(redone.result.statuses[0],'supported');
 assert.deepEqual(observe(),['house','fish']);

 // An unavailable first spatial hypothesis cannot obscure a fully compiled capability reading.
 session.engine.requestReader={bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64)}),
  propose:async()=>({candidates:[placement('unknown-relation'),creation],coverage:{complete:true,graphProposal:true},
   failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}})};
 const original=World.prototype.compileRequest,compilations=[];
 try{
  World.prototype.compileRequest=function(sop){compilations.push(sop);return original.call(this,sop);};
  const mixed=await routeNewEngine(session,'Observed request',{view:'draw',interactionMode:'thinking'});   // the comparison is the Thinking path; Fast takes the readings in order
  assert.equal(mixed.statuses[0],'supported',JSON.stringify(mixed.trace));
  assert.equal(mixed.trace.executionRoute.method,'capability');
  assert.match(mixed.trace.readingComparison,/no-common-interpreter-comparison/);
  assert.equal(mixed.trace.readerRouting.admission.alternatives.length,2);
  assert.deepEqual(observe(),['house','fish','house']);
  // One reading comparison; the default placement's declared region choice (std.choice) is a separate request.
  const interpreted=compilations.filter(sop=>/std.interpret.input/.test(sop));
  assert.equal(interpreted.length,1);
  assert.equal(compilations.length-interpreted.length,compilations.filter(sop=>/std.choice.request/.test(sop)).length);
  assert.doesNotMatch(interpreted[0],/unknown-relation/);
 }finally{World.prototype.compileRequest=original;}
});
