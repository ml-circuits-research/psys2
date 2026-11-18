import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';

const query=(operations=['count','members','values','exists'],colour='red')=>`@s std.request.source text="Which houses are red?"
@r std.request act=inspect mood=ask source=$s ${operations.map((_,i)=>'query=$q'+i).join(' ')}
@t std.request.target request=$r mode=existing kind=fixture.house selector=$selected
@selected std.request.constraint request=$r target=$t concept=colour operator=eq value="${colour}" character=requirement polarity=positive
${operations.map((operation,i)=>'@q'+i+' std.request.query request=$r target=$t operation='+operation+(operation==='values'?' concept=colour':'')).join('\n')}`;
const at=(row,key)=>str(row.attrs[key]?.[0]);

test('authored query answers from two real coloured Drawing objects without writing or replacing the prior action',async()=>{
 const drawing='art.draw',view='draw',events=[];
 const session={engine:{nativeBindings:{kinds:[{area:'drawing',type:'drawn',lemma:'house',canonical:'fixture.house',
  nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}}],properties:[
  {area:'drawing',key:'drawn.colour',canonical:'colour',hostBinding:{id:'drawing.object.change',sourceType:'art.draw.object',parameter:'color'}}]},
  onWorldActivity:event=>events.push(event)},
  isession:{state:{[drawing]:initialDrawingState()}},newEngineLastAction:{draw:{label:'previous'}}};
 for(const [name,color]of [['Crimson cottage','#ff0000'],['Blue bungalow','#0000ff']]){
  const result=await invokeNativeControl(session,{view,operation:'drawing.object.make',args:{kind:'house',name,color}});
  assert.equal(result.ok,true);
 }
 const state=structuredClone(session.isession.state),undo=structuredClone(session.newEngineUndo),previous=structuredClone(session.newEngineLastAction);
 const afterSetup=events.length;
 const reply=await routeNewEngine(session,query(),{view});
 assert.equal(reply.statuses[0],'supported',JSON.stringify(reply.trace));
 assert.match(reply.text,/Count: 1/);
 assert.match(reply.text,/Crimson cottage/);
 assert.doesNotMatch(reply.text,/Blue bungalow/);
 assert.equal(reply.trace.readOnly,true);
 assert.equal(reply.trace.executionRoute.rule,'route.query');
 const answer=parse(reply.trace.compiledSop);
 assert.deepEqual(answer.filter(row=>row.type==='std.capability.query.answer').map(row=>[at(row,'operation'),at(row,'value')]),[
  ['count','1'],['members',undefined],['values',undefined],['exists','true'],
 ]);
 assert.ok(answer.some(row=>row.type==='std.capability.query.member'&&at(row,'name')==='Crimson cottage'&&at(row,'value')==='#ff0000'));
 assert.deepEqual(answer.filter(row=>row.type==='std.capability.selection').slice(0,2).map(row=>at(row,'status')),['match','mismatch']);
 assert.ok(events.slice(afterSetup).some(event=>event.operation==='std.capability.query'&&event.wires===reply.trace.compiledSop));
 assert.deepEqual(reply.effects,[]);
 assert.deepEqual(session.isession.state,state);
 assert.deepEqual(session.newEngineUndo,undo);
 assert.deepEqual(session.newEngineLastAction,previous);
 const empty=await routeNewEngine(session,query(['count','exists'],'green'),{view});
 assert.match(empty.text,/Count: 0/);
 assert.match(empty.text,/No objects match/);
 assert.deepEqual(session.isession.state,state);
});
