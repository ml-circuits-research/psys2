import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,str} from '../src/vendor/sopworld/sopworld.mjs';
import {createNativeToolHost,nativeToken} from '../worlds/native-tool-host.mjs';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {describeNativeControl,verifyNativeControlEffect,NATIVE_CONTROL_INTENT_SCHEMA} from '../src/dialog/native-control-intent.mjs';
import {readNativeIntent,compactNativeIntent} from '../src/dialog/native-intent-reader.mjs';

const invoke=(host,operation,args)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
function capture(host,id,args,options={}){
 const before=host.observe(),operation=host.bindings().find(op=>op.id===id),intent=describeNativeControl({operation,args,before,...options}),receipt=invoke(host,id,args),after=host.observe();
 return {before,after,intent,receipt,verification:verifyNativeControlEffect({intent,before,after,receipt})};
}
test('Calendar typed intent preserves every argument, Unicode provenance and exact reference evidence as SOP',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'intent.calendar'});
 invoke(host,'calendar.calendar.add',{id:'work',label:'Work'});
 const args={id:'event',title:'Plan 🐟\nSecond line',start:1000,duration:100,participants:[],room:null,calendar:'work',notes:'Use "quotes"'};
 const frozen=JSON.stringify(args),r=capture(host,'calendar.meeting.add',args);
 assert.match(r.intent.text,/^Create an event/);
 assert.equal(r.intent.schema,'app.control.intent');assert.match(r.intent.semantics,/declared tool command/);
 assert.deepEqual(r.intent.expected.providedArgs,args);assert.equal(JSON.stringify(args),frozen);
 assert.equal(r.verification.status,'verified');
 const world=new World();assert.equal(world.load(NATIVE_CONTROL_INTENT_SCHEMA).ok,true);assert.equal(world.tell(r.intent.wires).ok,true);
 const values=world.ofType('app.control.value');
 assert.ok(values.some(v=>str(v.attrs['observed.id']?.[0])==='work'));
 assert.ok(values.some(v=>str(v.attrs.kind?.[0])==='array'));
 assert.ok(values.some(v=>str(v.attrs.kind?.[0])==='null'));
 for(const range of r.intent.sourceRanges)assert.equal(Array.from(r.intent.text).slice(range.start,range.end).join(''),range.rendered);
 assert.doesNotMatch(r.intent.text,/with id/);
});

test('same generic intent/verification applies to Drawing, Diagram and Documents exact observed fields',async()=>{
 const drawing=createDrawingHost({state:initialDrawingState(),instanceId:'intent.draw'});
 const made=capture(drawing,'drawing.object.make',{kind:'triangle',name:'Peak',x:123,y:200,color:'#112233'});
 assert.equal(made.verification.status,'verified');
 const diagram=await createDiagramHost({state:initialDiagramState(),instanceId:'intent.diagram'});
 const node=invoke(diagram,'diagram.node.make',{kind:'rectangle'}).changed[0];
 const renamed=capture(diagram,'diagram.node.change',{ids:[node],label:'Start'});
 assert.equal(renamed.verification.status,'verified');
 const docs=createDocumentHost({state:initialDocumentState(),instanceId:'intent.docs'});
 const written=invoke(docs,'document.write',{title:'Notes',blocks:[]}).changed[0];
 const block=capture(docs,'document.block.make',{parent:written,kind:'paragraph',text:'Exact literal text',name:'Intro'});
 assert.equal(block.verification.status,'verified');
});

test('a fifth world retains nested typed values without domain mappings and never claims unobserved parameters verified',()=>{
 const state={rows:[]},host=createNativeToolHost({state,instanceId:'fifth',scope:'synthetic',operations:[{id:'storage.make',act:'make',on:'invented.crate',params:{id:{type:'string',required:true},label:{type:'string',required:true},payload:{type:'object',required:true}}}],handlers:{'storage.make':(ctx,a)=>{ctx.state.rows.push(a);return {status:'supported',changed:[a.id]};}},view:s=>s.rows.map(r=>({id:r.id,kind:'crate',sourceType:'invented.crate',inputs:[{binding:'invented.label',key:'label',values:[nativeToken(r.label)]}]}))});
 const payload={items:['first',false,null,{n:2.5}],empty:[]},r=capture(host,'storage.make',{id:'crate1',label:'A crate',payload});
 assert.deepEqual(r.intent.expected.args.payload,payload);
 const world=new World();world.load(NATIVE_CONTROL_INTENT_SCHEMA);assert.equal(world.tell(r.intent.wires).ok,true);
 assert.equal(r.verification.status,'unverified');
 assert.ok(r.verification.checks.some(c=>c.parameter==='payload'&&c.status==='unknown'));
 assert.doesNotMatch(r.intent.text,/storage\.make/);
});

test('explicit binding aliases and set semantics are separate from retained exact array order',()=>{
 const operation={id:'toy.change',act:'change',on:'toy.item',params:{id:{type:'string',required:true},names:{type:'array',required:true}}};
 const object={id:'one',kind:'item',source:'identity',sourceType:'toy.item',version:'0',inputs:[{key:'members',binding:'toy.members',values:['"A"','"B"']}]},before={instanceId:'toy',scope:'all',version:'0',complete:true,objects:[object]},after={...before,version:'1',objects:[{...object,version:'1'}]};
 const intent=describeNativeControl({operation,args:{id:'one',names:['B','A']},before,parameterBindings:[{parameter:'names',binding:'toy.members',mode:'set'}]});
 assert.deepEqual(intent.expected.args.names,['B','A']);
 assert.equal(verifyNativeControlEffect({intent,before,after,receipt:{status:'changed',operation:operation.id}}).status,'verified');
 const noMapping=describeNativeControl({operation,args:{id:'one',names:['B','A']},before});
 assert.equal(verifyNativeControlEffect({intent:noMapping,before,after,receipt:{status:'changed'}}).status,'unverified');
});

test('refusals, stale evidence and incorrect observed values retain their real status',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'refusal'});
 const invalid=capture(host,'calendar.meeting.add',{id:'m',title:'M',start:0,duration:100,participants:[],room:null});
 assert.equal(invalid.verification.status,'refused');
 const created=capture(host,'calendar.calendar.add',{id:'personal',label:'Personal',colour:'#112233'});
 const tampered=structuredClone(created.after);tampered.objects[0].inputs.find(i=>i.key==='colour').values=['"#ffffff"'];
 assert.equal(verifyNativeControlEffect({...created,after:tampered}).status,'mismatch');
 assert.equal(verifyNativeControlEffect({...created,after:{...created.after,instanceId:'other'}}).status,'unverified');
 assert.equal(verifyNativeControlEffect({...created,receipt:{...created.receipt,operation:'different'}}).status,'mismatch');
 assert.equal(verifyNativeControlEffect({...created,receipt:{...created.receipt,beforeVersion:'stale'}}).status,'unverified');
});

test('all selected identities are checked, and modification of an unselected peer is a mismatch',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'scope'});
 const first=invoke(host,'drawing.object.make',{kind:'triangle'}).changed[0],second=invoke(host,'drawing.object.make',{kind:'triangle'}).changed[0];
 const changed=capture(host,'drawing.object.change',{ids:[first],color:'#123456'});
 assert.equal(changed.verification.status,'verified');
 const tampered=structuredClone(changed.after);tampered.objects.find(o=>o.id===second).inputs.find(i=>i.key==='color').values=['"#ffffff"'];
 assert.equal(verifyNativeControlEffect({...changed,after:tampered}).status,'mismatch');
 const removed=capture(host,'drawing.object.remove',{ids:[first,second]});
 assert.equal(removed.verification.status,'verified');
});

test('defaults are explicitly separated from original UI arguments, and null clears verify against absent slots',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'clear'});
 invoke(host,'calendar.room.add',{id:'room',label:'Room',capacity:4,location:'Floor 2'});
 const cleared=capture(host,'calendar.room.change',{id:'room',capacity:null,location:null});
 assert.equal(cleared.verification.status,'verified');
 const operation={id:'toy.default',act:'make',on:'toy.item',params:{label:{type:'string',default:'Untitled'}}};
 const intent=describeNativeControl({operation,args:{},before:host.observe()});
 assert.deepEqual(intent.expected.providedArgs,{});assert.deepEqual(intent.expected.args,{label:'Untitled'});assert.equal(intent.expected.defaults.length,1);
});

test('human commands omit generated ids, preserve literal names and use declared time/reference wording',()=>{
 const before={instanceId:'ui',version:'0',complete:true,objects:[{id:'room-uuid',kind:'room',sourceType:'toy.room',source:'room-source',version:'0',inputs:[{key:'label',binding:'toy.room.name',values:['"Oak"']}]}]};
 const operation={id:'toy.make',act:'make',on:'toy.event',params:{id:{type:'string',required:true},label:{type:'string',required:true},room:{type:'string'},start:{type:'integer'},duration:{type:'integer'}},intent:{subject:'event',parameters:{room:{label:'in room',reference:true},start:{label:'starting at',format:'unix-ms'},duration:{label:'lasting',format:'duration-ms'}}}};
 const intent=describeNativeControl({operation,args:{id:'new-uuid',label:'room-uuid',room:'room-uuid',start:0,duration:1800000},before});
 assert.doesNotMatch(intent.text,/new-uuid/);
 assert.match(intent.text,/named "room-uuid"/,'a literal label is not replaced just because it equals an observed id');
 assert.match(intent.text,/in room "Oak"/);
 assert.match(intent.text,/1970-01-01T00:00:00.000Z/);
 assert.match(intent.text,/lasting 30 minutes/);
 assert.equal(intent.expected.args.id,'new-uuid');
 assert.equal(intent.sourceRanges.some(r=>r.parameter==='id'),false);
 for(const range of intent.sourceRanges)assert.equal(Array.from(intent.text).slice(range.start,range.end).join(''),range.rendered);
});

test('typed SOP intent is interpreted back into exact native arguments before execution',async()=>{
 const {readNativeIntent}=await import('../src/dialog/native-intent-reader.mjs');
 const operation={id:'example.collection.make',act:'make',on:'example.collection',params:{name:{type:'string',required:true},values:{type:'array',required:true},options:{type:'object',required:true}}};
 const args={name:'A "quoted" name',values:[1,2.5,null,false,'x'],options:{nested:['one',{two:2}],empty:[]}};
 const intent=describeNativeControl({operation,args,before:null}),decoded=readNativeIntent(intent.wires);
 assert.equal(decoded.operation,operation.id);assert.deepEqual(decoded.args,args);assert.equal(decoded.text,intent.text);
 assert.throws(()=>readNativeIntent(intent.wires+'\n@other app.control.intent'),/one-control/);
});

test('a declared source identity is retained in text without restricting the new result identity',()=>{
 const operation={id:'toy.derive',act:'make',on:'toy.result',result:{identityParameter:null},params:{id:{type:'string',required:true},label:{type:'string',required:true}},intent:{parameters:{id:{role:'source',reference:true,label:'from source'}}}};
 const source={id:'source-1',kind:'source',sourceType:'toy.source',source:'source-evidence',version:'0',inputs:[{key:'label',values:['"Original"']}]};
 const before={instanceId:'derive',version:'0',complete:true,objects:[source]},created={id:'result-2',kind:'result',sourceType:'toy.result',source:'result-evidence',version:'1',inputs:[{key:'label',values:['"Derived"']}]},after={...before,version:'1',objects:[source,created]};
 const intent=describeNativeControl({operation,args:{id:source.id,label:'Derived'},before});
 assert.match(intent.text,/from source "Original"/);assert.equal(intent.expected.targets[0].id,undefined);
 assert.equal(verifyNativeControlEffect({intent,before,after,receipt:{status:'changed',operation:operation.id}}).status,'verified');
});

test('selection, move and colour commands use one tool wire with exact primitive values',()=>{
 const cases=[
  [{id:'drawing.object.select',act:'pick',on:'art.draw.object',params:{id:{type:'string',required:true}}},{id:'o2'},'@select drawing.object.select id="o2"'],
  [{id:'drawing.object.place',act:'place',on:'art.draw.object',params:{ids:{type:'array',required:true},x:{type:'number',required:true},y:{type:'number',required:true}}},{ids:['o2'],x:271,y:527},'@move drawing.object.place ids="o2" x=271 y=527'],
  [{id:'drawing.object.change',act:'change',on:'art.draw.object',params:{ids:{type:'array',required:true},color:{type:'string',required:true}}},{ids:['o2','o9'],color:'#ffeedd'},'@update drawing.object.change ids="o2" ids="o9" color="#ffeedd"']
 ];
 for(const [operation,args,wire]of cases){
  const intent=describeNativeControl({operation,args,before:{complete:true,instanceId:'source-instance',version:'197',objects:[]}});
  assert.equal(intent.wires,wire);assert.equal(intent.schema,operation.id);
  assert.deepEqual(readNativeIntent(wire,{operation}).args,args);
  assert.match(intent.expandedWires,/instance="source-instance" version="197"/);
  assert.doesNotMatch(wire,/source-instance|197|app\.control|source=/);
  assert.equal(intent.expected.before.version,'197');
 }
 assert.match(describeNativeControl({operation:cases[0][0],args:cases[0][1]}).text,/^Select /);
 const operation=cases[1][0],args={ids:['o2','o9'],x:271.1234567890123,y:-0},intent=describeNativeControl({operation,args});
 assert.match(intent.wires,/x=271\.1234567890123 y=-0$/);
 assert.deepEqual(readNativeIntent(intent.wires,{operation}).args,args);
 assert.match(intent.text,/271\.1234567890123/);
});

test('unfamiliar declaration determines scalar and array multiplicity even for one token',()=>{
 const operation={id:'quasar.sample.record',act:'make',on:'quasar.sample',params:{scalar:{type:'string',required:true},samples:{type:'array',required:true},enabled:{type:'boolean'},count:{type:'integer'}}};
 const args={scalar:'true',samples:[1,null,false,'$reference','?variable','line\n"quote"'],enabled:true,count:3};
 const intent=describeNativeControl({operation,args});
 assert.equal(intent.wires.split('\n').length,1);assert.deepEqual(readNativeIntent(intent.wires,{operation}).args,args);
 const one='@record quasar.sample.record scalar="one" samples="one"';
 assert.deepEqual(readNativeIntent(one,{operation}).args,{scalar:'one',samples:['one']});
 assert.throws(()=>readNativeIntent(one),/declaration-required/);
 assert.throws(()=>readNativeIntent(one,{operation:{...operation,id:'quasar.other'}}),/operation-mismatch/);
 assert.throws(()=>readNativeIntent(one+' scalar="two"',{operation}),/duplicate-control-parameter/);
 assert.throws(()=>readNativeIntent('@record quasar.sample.record scalar=1 samples="one"',{operation}),/argument-type/);
 assert.throws(()=>readNativeIntent(one+' count=1.5',{operation}),/argument-type/);
 assert.throws(()=>readNativeIntent(one+' extra="x"',{operation}),/unknown-control-parameter/);
 assert.throws(()=>readNativeIntent('@record quasar.sample.record samples="one"',{operation}),/missing-argument/);
 assert.throws(()=>readNativeIntent(one+' enabled=$value',{operation}),/invalid-control-primitive/);
});

test('a compact move executes the decoded full-precision values on the actual declared host',()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'compact.draw'});
 const id=invoke(host,'drawing.object.make',{kind:'triangle'}).changed[0],operation=host.bindings().find(o=>o.id==='drawing.object.place');
 const before=host.observe(),args={ids:[id],x:271.1234567890123,y:527.9876543210987},intent=describeNativeControl({operation,args,before});
 const decoded=readNativeIntent(intent.wires,{operation}),receipt=invoke(host,decoded.operation,decoded.args),after=host.observe();
 assert.equal(receipt.status,'changed');assert.equal(state.objects.find(o=>o.id===id).x,args.x);assert.equal(state.objects.find(o=>o.id===id).y,args.y);
 assert.equal(verifyNativeControlEffect({intent,before,after,receipt}).status,'verified');
});

test('nested data, explicit empty arrays and nullable arrays retain the necessary typed representation',()=>{
 const operation={id:'quasar.sample.make',act:'make',on:'quasar.sample',params:{data:{type:'object'},samples:{type:'array',nullable:true}}};
 for(const args of [{data:{rows:[{x:2.123456789}],empty:[]}},{samples:[]},{samples:null},{samples:[{nested:true}]}]){
  const intent=describeNativeControl({operation,args});assert.equal(intent.wires,intent.expandedWires);assert.match(intent.wires,/@control\.intent app\.control\.intent/);
  assert.deepEqual(readNativeIntent(intent.wires,{operation}).args,args);
 }
 const plain=describeNativeControl({operation,args:{samples:[null]}});assert.equal(plain.wires,'@create quasar.sample.make samples=null');assert.deepEqual(readNativeIntent(plain.wires,{operation}).args,{samples:[null]});
 const scalar={id:'quasar.label.make',act:'make',on:'quasar.label',params:{label:{type:'string'}}},simple=describeNativeControl({operation:scalar,args:{label:'A'}});
 assert.throws(()=>readNativeIntent(simple.expandedWires,{operation:scalar}),/compact-control-intent-required/);
});

test('intent codec rejects unsafe declarations, prototype keys, nonfinite values and bounded input excess',()=>{
 const operation={id:'quasar.sample.make',act:'make',on:'quasar.sample',params:{label:{type:'string'},count:{type:'number'},data:{type:'object'},samples:{type:'array'}}};
 for(const wire of ['@make quasar.sample.make count=1e999','@make quasar.sample.make __proto__="x"','@make quasar.sample.make prototype="x"','@make quasar.sample.make constructor="x"','?make quasar.sample.make label="x"'])assert.throws(()=>readNativeIntent(wire,{operation}));
 assert.throws(()=>readNativeIntent(' '.repeat(4000001),{operation}),/invalid-control-intent/);
 assert.throws(()=>readNativeIntent('@make quasar.sample.make '+Array(10002).fill('samples=1').join(' '),{operation}),/budget/);
 assert.throws(()=>compactNativeIntent({...operation,params:Object.create(null)},{label:'x'}),/prototype/);
 const unsafe=JSON.parse('{"constructor":1}'),intent=describeNativeControl({operation,args:{data:unsafe}});
 assert.throws(()=>readNativeIntent(intent.wires,{operation}),/object-key/);
});

test('visible labels take priority over legacy object names in captured text',()=>{
 const operation={id:'toy.select',act:'pick',on:'toy.item',params:{id:{type:'string',required:true}}};
 const before={instanceId:'actual',version:'0',complete:true,objects:[{id:'o2',sourceType:'toy.item',source:'actual-o2',version:'0',inputs:[{key:'name',values:['"Legacy name"']},{key:'label',values:['"Visible label"']}]}]};
 const intent=describeNativeControl({operation,args:{id:'o2'},before});assert.equal(intent.text,'Select "Visible label".');assert.match(intent.wires,/id="o2"/);assert.doesNotMatch(intent.wires,/Visible label/);
});

test('declared containment ancestor changes remain unverified while unrelated sibling mutations still fail',()=>{
 const operation={id:'novel.item.resize',act:'change',on:'novel.item',params:{id:{type:'string',required:true},width:{type:'number',required:true}},effectScope:{ancestors:{via:['belongsTo'],keys:['width']}}};
 const object=(id,width,relations={})=>({id,kind:'item',sourceType:'novel.item',source:'actual-'+id,version:'0',relations,inputs:[{key:'width',binding:'novel.width',values:[String(width)]}]});
 const before={instanceId:'actual',version:'0',complete:true,objects:[object('child',10,{belongsTo:['parent']}),object('parent',20,{belongsTo:['outer']}),object('outer',30),object('sibling',8)]};
 const intent=describeNativeControl({operation,args:{id:'child',width:15},before}),after=structuredClone(before);after.version='1';after.objects[0].inputs[0].values=['15'];after.objects[1].inputs[0].values=['25'];after.objects[2].inputs[0].values=['35'];
 assert.equal(verifyNativeControlEffect({intent,before,after,receipt:{status:'changed',operation:operation.id}}).status,'unverified');
 after.objects[3].inputs[0].values=['9'];assert.equal(verifyNativeControlEffect({intent,before,after,receipt:{status:'changed',operation:operation.id}}).status,'mismatch');
});
