import test from 'node:test';import assert from 'node:assert/strict';
import {planDeclaredCandidates} from '../src/dialog/declared-candidate-plan.mjs';
import {validateNativeArguments,createNativeToolHost} from '../worlds/native-tool-host.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
const proof={sourceWorld:'fixture.declarations',sourceWire:'fixture.binding',moduleVersion:'1',sourceSnapshotSHA:'a'.repeat(64)};
const graph=(act='make',extra='',targetExtra='',kind='fixture.item')=>({entries:[{id:'entry',request:'r',after:[],wires:`@s std.request.source text="Declared fixture"
@r std.request act=${act} mood=do source=$s
@t std.request.target request=$r mode=${act==='make'?'new':'existing'} kind=${kind} ${targetExtra}
${extra}`}]});
const result=(id,concept,tokens)=>`@${id} std.request.constraint request=$r target=$t concept=${concept} operator=eq value=${tokens} character=requirement polarity=positive`;
const value=(concept,tokens,native)=>({from:'result',concept,...proof,values:[{tokens,value:native,...proof}]});
const cap=(host,operation,kind,sourceType,scope,args,act='make')=>({id:'fixture.capability',host:'host',operation,act,mode:act==='make'?'new':'existing',semanticKind:'fixture.item',nativeKind:kind,sourceType,scope,arguments:args,...proof});
const plan=(batch,host,capability,extra={})=>planDeclaredCandidates(batch,{registry:{host},capabilities:[capability],...extra});
test('lifecycle make preparation covers four real native hosts without invoking them',async()=>{
 const cases=[
  [createDrawingHost({state:initialDrawingState(),instanceId:'d'}),'drawing.object.make','circle','art.draw.object','drawing.object-lifecycle',{kind:{from:'kind'}},''],
  [await createDiagramHost({state:initialDiagramState(),instanceId:'g'}),'diagram.node.make','rectangle','diagram.sketch.node','diagram.lifecycle', {kind:{from:'kind'}},''],
  [createDocumentHost({state:initialDocumentState(),instanceId:'doc'}),'document.write','document','docs.editor.document','document.lifecycle',{title:{from:'name',...proof},blocks:value('fixture.blocks',['"[]"'],[])},result('c','fixture.blocks','"[]"')],
  [createCalendarHost({state:{people:[{id:'p',label:'P'}],rooms:[],meetings:[]},instanceId:'cal'}),'calendar.meeting.add','meeting','time.calendar.meeting','calendar.lifecycle-store',{id:value('fixture.identity',['"m"'],'m'),title:{from:'name',...proof},start:value('fixture.start',['0'],0),duration:value('fixture.duration',['1'],1),participants:value('fixture.people',['"p"'],['p']),room:value('fixture.room',['none'],null)},[result('i','fixture.identity','"m"'),result('a','fixture.start','0'),result('b','fixture.duration','1'),result('c','fixture.people','"p"'),result('d','fixture.room','none')].join('\n')]
 ];
 for(const [host,operation,kind,type,_scope,args,extra]of cases){const observation=host.observe(),capability=cap(host,operation,kind,type,observation.scope,args),before=JSON.stringify(observation),batch=graph('make',extra,Object.hasOwn(args,'title')?'name="Example"':'');let invoked=0;const guarded={bindings:()=>host.bindings(),observe:()=>host.observe(),invoke:()=>{invoked++;throw Error('forbidden');}};const r=plan(batch,guarded,capability);assert.equal(r.ok,true,JSON.stringify(r.unresolved));assert.equal(r.plans[0].expectedVersion,observation.version);assert.equal(r.plans[0].policy,'pending-native-validation');assert.equal(r.executable,false);assert.equal(invoked,0);assert.equal(JSON.stringify(host.observe()),before);}
});
test('remove resolves actual historical identity and named mismatches remain unresolved',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'d'});host.invoke({invocation:'setup',expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind:'circle',name:'First'}});
 const c=cap(host,'drawing.object.remove','circle','art.draw.object',host.observe().scope,{ids:{from:'subjects',representation:'ids'}},'remove');c.nameBinding={...proof,binding:{id:'drawing.object.name',key:'name',sourceType:'art.draw.object'}};
 const r=plan(graph('remove','','name="First"'),host,c);assert.equal(r.ok,true,JSON.stringify(r.unresolved));assert.equal(r.plans[0].subjects.length,1);assert.deepEqual(r.plans[0].args.ids,[host.observe().objects[0].id]);assert.equal(plan(graph('remove','','name="Other"'),host,c).ok,false);
});
test('missing explicit native requirements and unsupported semantics refuse the whole plan',()=>{
 const host=createDocumentHost({state:initialDocumentState(),instanceId:'doc'}),c=cap(host,'document.write','document','docs.editor.document',host.observe().scope,{title:{from:'name',...proof}});
 assert.equal(plan(graph('make','','name="Example"'),host,c).unresolved[0].reason,'missing-argument');
 const unknown=graph('make',result('c','unsupported','blue'),'name="Example"');assert.equal(plan(unknown,host,c).ok,false);
 const many=graph();many.entries.push({...many.entries[0],id:'bad',wires:many.entries[0].wires+'\n@x unknown.type'});let observed=0;const r=plan(many,{bindings:()=>host.bindings(),observe:()=>{observed++;return host.observe();}},c);assert.equal(r.ok,false);assert.equal(observed,0);
});
test('pure native admission reuses exact invoke validation and does not mutate arguments or state',()=>{
 const state={value:0},op={id:'set',act:'change',on:'fixture',params:{n:{type:'integer',required:true,min:1},flag:{type:'boolean',default:false}}},host=createNativeToolHost({state,instanceId:'n',scope:'all',operations:[op],handlers:{set:(ctx,args)=>{ctx.state.value=args.n;return {status:'supported'};}},view:()=>[]});
 for(const args of [{},{n:'1'},{n:0},{n:1,extra:1}]){const before=JSON.stringify(state),pure=validateNativeArguments(op,args),actual=host.invoke({invocation:JSON.stringify(args),expectedVersion:'0',operation:'set',args});assert.equal(pure.reason,actual.reason);assert.equal(JSON.stringify(state),before);}
 const args={n:2},r=validateNativeArguments(op,args);assert.deepEqual(args,{n:2});assert.deepEqual(r.args,{n:2,flag:false});assert.equal(r.defaults[0].parameter,'flag');assert.deepEqual(state,{value:0});
});

test('remove plans preserve source incarnations across all four real areas',async()=>{
 const cases=[
  [createDrawingHost({state:initialDrawingState(),instanceId:'d2'}),'drawing.object.make',{kind:'star'},'drawing.object.remove','star','art.draw.object',{ids:{from:'subjects',representation:'ids'}}],
  [await createDiagramHost({state:initialDiagramState(),instanceId:'g2'}),'diagram.node.make',{kind:'rectangle'},'diagram.node.remove','rectangle','diagram.sketch.node',{ids:{from:'subjects',representation:'ids'}}],
  [createDocumentHost({state:initialDocumentState(),instanceId:'doc2'}),'document.write',{title:'Document',blocks:[]},'document.remove','document','docs.editor.document',{}],
  [createCalendarHost({state:{people:[],rooms:[],meetings:[]},instanceId:'cal2'}),'calendar.person.add',{id:'p',label:'Person'},'calendar.person.remove','person','time.calendar.person',{id:{from:'subjects',representation:'id'}}]
 ];
 for(const [host,make,args,remove,kind,type,projection]of cases){const receipt=host.invoke({invocation:'setup',expectedVersion:host.observe().version,operation:make,args});assert.equal(receipt.status,'changed');const before=host.observe(),c=cap(host,remove,kind,type,before.scope,projection,'remove'),r=plan(graph('remove'),host,c);assert.equal(r.ok,true,JSON.stringify(r.unresolved));assert.equal(r.plans[0].subjects[0].subject.source,before.objects[0].source);assert.deepEqual(host.observe(),before);}
});
test('logical selectors use the shared resolver and require complete leaf-consumption evidence',async()=>{
 const {selectNativeObjects}=await import('../src/dialog/native-selection.mjs');
 const host=createDrawingHost({state:initialDrawingState(),instanceId:'selection'});for(const name of ['First','Second'])host.invoke({invocation:name,expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind:'circle',name,color:'#0000ff'}});
 const c=cap(host,'drawing.object.remove','circle','art.draw.object',host.observe().scope,{ids:{from:'subjects',representation:'ids'}},'remove');
 const batch=graph('remove',`${result('a','color','"#0000ff"')}\n${result('b','name','"First"')}\n@both std.request.group request=$r operator=and member=$a member=$b`,'selector=$both');
 const evaluateSelector=({constraint,bindings},{observation})=>{const subject=bindings.t.subject,concept=constraint.attrs.concept[0],objects=observation.objects.filter(o=>o.source===subject.source),selected=selectNativeObjects({...observation,objects,complete:true},{scope:observation.scope,kind:{native:{kind:'circle',sourceType:'art.draw.object'},witness:proof},predicates:[{binding:{id:`drawing.object.${concept}`,key:concept,sourceType:'art.draw.object'},expected:{values:constraint.attrs.value,witness:proof}}]});const status=selected.considered[0]?.status;return {truth:status==='match'?'true':status==='mismatch'?'false':'unknown',evidence:[selected],consumed:Object.keys(constraint.attrs).map(k=>JSON.stringify([constraint.id,k]))};};
 const r=plan(batch,host,c,{evaluateSelector});assert.equal(r.ok,true,JSON.stringify(r.unresolved));assert.equal(r.plans[0].subjects.length,1);assert.equal(plan(batch,host,c).ok,false);assert.equal(plan(batch,host,c,{evaluateSelector:()=>({truth:'true',evidence:[],consumed:[]})}).ok,false);
 const partial={bindings:()=>host.bindings(),observe:()=>({...host.observe(),complete:false})};assert.equal(plan(batch,partial,c,{evaluateSelector}).ok,false);
});
test('Document child plans require explicit live parent references and reject stale witnesses',()=>{
 const host=createDocumentHost({state:initialDocumentState(),instanceId:'parent'});host.invoke({invocation:'setup',expectedVersion:host.observe().version,operation:'document.write',args:{title:'Parent',blocks:[]}});const o=host.observe(),parent=o.objects.find(x=>x.kind==='document');
 const descriptor=value('fixture.parent',['"parent"'],parent.id);descriptor.reference={sourceType:'docs.editor.document',representation:'id'};descriptor.values[0].references=[{context:{instanceId:o.instanceId,scope:o.scope,version:o.version},subject:{id:parent.id,source:parent.source,sourceType:parent.sourceType,version:parent.version}}];
 const c=cap(host,'document.block.make','paragraph','docs.editor.block',o.scope,{kind:{from:'kind'},parent:descriptor});
 assert.equal(plan(graph(),host,c).unresolved[0].reason,'missing-argument');const batch=graph('make',result('c','fixture.parent','"parent"'));const r=plan(batch,host,c);assert.equal(r.ok,true,JSON.stringify(r.unresolved));assert.equal(r.plans[0].args.parent,parent.id);assert.equal(r.plans[0].mapping.defaults[0].parameter,'text');
 host.invoke({invocation:'replace',expectedVersion:host.observe().version,operation:'document.write',args:{title:'Other',blocks:[]}});assert.equal(plan(batch,host,c).unresolved[0].reason,'stale-native-reference');
});

test('new-target selectors and unmapped predicates cannot be marked consumed',()=>{
 const host=createDrawingHost({state:initialDrawingState(),instanceId:'admission'}),c=cap(host,'drawing.object.make','circle','art.draw.object',host.observe().scope,{kind:{from:'kind'}});
 for(const batch of [graph('make',result('c','color','blue'),'selector=$c'),graph('make',result('c','color','blue'))]){const r=plan(batch,host,c);assert.equal(r.ok,false);assert.deepEqual(r.plans,[]);assert.equal(host.observe().objects.length,0);}
});
