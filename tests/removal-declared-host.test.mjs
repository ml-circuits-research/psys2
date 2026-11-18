import test from 'node:test';
import assert from 'node:assert/strict';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createAreaHost,NATIVE_AREAS} from '../src/dialog/app-reader-context.mjs';

const cases=[
 {view:'draw',area:'drawing',type:'drawn',sourceType:'art.draw.object',make:'drawing.object.make',remove:'drawing.object.remove',initial:initialDrawingState,kinds:['tree','house']},
 {view:'diagram',area:'diagram',type:'node',sourceType:'diagram.sketch.node',make:'diagram.node.make',remove:'diagram.node.remove',initial:initialDiagramState,kinds:['circle','rectangle']},
];
const mention=(context,noun)=>{
 const text='Delete the '+noun,span='the '+noun;
 const diagnostic=context.view==='diagram'
  ?{reason:'presence-span-inconsistent',key:'request.target.description',head:{path:'target.description_span',present:false,ranges:[[7,text.length]]}}
  :{reason:'presence-span-inconsistent',key:'request.target.kind',head:{path:'target.kind',present:true,ranges:[]}};
 const failures=[{reason:'incomplete-provider-coverage',path:['requests',0]},
  {reason:'provider-unresolved',path:['requests',0],detail:diagnostic}];
 return {text,proposal:{coverage:{complete:false},candidates:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.8},failures,
  raw:{area:context.area,source:{text,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},unresolved:failures,
   requests:[{act:'remove',mood:'do',trigger:'Delete',target:{type:context.type,mode:'existing',fill:'written',determiner:'definite',name_span:span,description_span:span},constraints:[]}],
   ranges:[{path:['requests','0','trigger'],range:[0,6]},...['name_span','description_span'].map(key=>({path:['requests','0','target',key],range:[7,text.length]}))]},
 }};
};
for(const context of cases)test('exact grounded removal and Undo use actual native state in '+context.view,async()=>{
 const {view,area,type,sourceType,kinds,initial,make,remove}=context,world=NATIVE_AREAS[view].world;
 const bindings={kinds:kinds.map(lemma=>({area,type,canonical:'fixture.'+lemma,lemma,nativeFamilyBinding:{operation:make,sourceType}}))};
 const events=[];let current=mention(context,kinds[0]);
 const session={isession:{state:{[world]:initial(),'ui.shell':{activeTab:view}}},
  engine:{onWorldActivity:event=>events.push(event),requestReader:{bindings:()=>bindings,registry:()=>({}),
   provenance:()=>({modelSha256:'a'.repeat(64)}),propose:async()=>current.proposal}}};
 for(const kind of kinds)assert.equal((await performGesture(session,{view,operation:make,args:{kind}})).ok,true);
 const observe=async()=>(await createAreaHost(NATIVE_AREAS[view],{state:session.isession.state[world],instanceId:'check'})).observe().objects.filter(row=>row.sourceType===sourceType);
 const before=await observe();
 const reply=await routeNewEngine(session,current.text);
 assert.deepEqual(reply.statuses,['supported'],JSON.stringify(reply.trace));
 assert.equal(reply.trace.effectVerification.status,'verified');
 assert.ok(events.some(event=>event.operation===remove&&event.sop===reply.trace.controlIntent));
 assert.equal(reply.trace.readerRouting.unresolved.length,2);
 assert.deepEqual((await observe()).map(row=>row.id),[before[1].id]);
 const undo=await routeNewEngine(session,'@s std.request.source text="Undo" @r std.request act=undo mood=do source=$s');
 assert.deepEqual(undo.statuses,['supported']);
 assert.deepEqual((await observe()).map(row=>row.id),before.map(row=>row.id));
 current=mention(context,'purple '+kinds[0]);
 const refused=await routeNewEngine(session,current.text);
 assert.deepEqual(refused.statuses,['unsupported']);
 assert.deepEqual((await observe()).map(row=>row.id),before.map(row=>row.id));
 assert.equal((await performGesture(session,{view,operation:make,args:{kind:kinds[0]}})).ok,true);
 const three=await observe();
 current=mention(context,kinds[0]);
 const ambiguous=await routeNewEngine(session,current.text);
 assert.deepEqual(ambiguous.statuses,['supported']);
 assert.match(ambiguous.text,/More than one matched/);
 assert.match(ambiguous.trace.compiledSop,/target="[^"]+" target="[^"]+"/);
 assert.deepEqual((await observe()).map(row=>row.id),three.slice(0,2).map(row=>row.id));
 const restored=await routeNewEngine(session,'@s std.request.source text="Undo" @r std.request act=undo mood=do source=$s');
 assert.deepEqual(restored.statuses,['supported']);
 assert.deepEqual((await observe()).map(row=>row.id),three.map(row=>row.id));
});
