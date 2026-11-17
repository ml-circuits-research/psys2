import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarHost,initialAvatarState,avatarCapabilities} from '../worlds/ui.avatar/declared-host.mjs';
import {DEFAULT_FACE} from '../worlds/ui.avatar/default-face.mjs';
import {describeNativeControl,verifyNativeControlEffect} from '../src/dialog/native-control-intent.mjs';
const invoke=(host,operation,args)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
const customData=()=>{
 const data=structuredClone(DEFAULT_FACE);
 data.slots.push({name:'signal',optional:true,x:5,y:5,w:10,h:10,z:20,mirror:false,variants:[{name:'round signal',features:{},parts:[{name:'disc',shape:'circle',x:5,y:5,w:10,h:10,z:1,colour:['red'],rgb:'#ff0000',points:[]}]}]});
 return data;
};
test('avatar declarations derive only drawable presets/variants and reuse catalog-backed face primitives',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'face'}),caps=host.capabilities();
 assert.deepEqual(caps.presets,['girl'],'bundled default has complete drawings for the default preset only');
 assert.ok(host.observe().objects.some(o=>o.id==='face'&&o.sourceType==='ui.avatar.face'));
 assert.equal(invoke(host,'avatar.face.expression',{expression:'happy'}).status,'changed');
 assert.equal(state.face.expression,'happy');
 assert.equal(invoke(host,'avatar.part.change',{ids:['eyes'],size:'big'}).status,'changed');
 assert.equal(state.face.grade.eyes,'big');
 assert.equal(invoke(host,'avatar.part.move',{ids:['eyes'],place:'up'}).status,'changed');
 assert.ok(state.face.adj.eyes.dy<0);
 assert.equal(invoke(host,'avatar.part.remove',{ids:['head']}).reason,'needed');
});

test('a new knowledge slot appears as a tool choice and can be added, recoloured, removed and undone',()=>{
 const data=customData(),state=initialAvatarState(data),host=createAvatarHost({state,instanceId:'custom',knowledge:{peekFaces:()=>data}});
 assert.ok(host.capabilities().slots.find(s=>s.id==='signal').variants.includes('round signal'));
 assert.equal(invoke(host,'avatar.part.add',{id:'signal',variant:'round signal'}).status,'changed');
 assert.equal(state.face.slots.signal,'round signal');
 assert.equal(invoke(host,'avatar.part.change',{ids:['signal'],colour:'red'}).status,'changed');
 assert.equal(state.face.paint.signal,'red');
 assert.equal(invoke(host,'avatar.part.remove',{ids:['signal']}).status,'changed');
 assert.equal(host.observe().objects.some(o=>o.id==='signal'),false);
 assert.equal(invoke(host,'avatar.undo',{}).status,'changed');
 assert.ok(host.observe().objects.some(o=>o.id==='signal'));
 assert.equal(invoke(host,'avatar.redo',{}).status,'changed');
 assert.equal(state.face.slots.signal,'none');
});

test('unknown, undrawable and incompatible avatar actions refuse atomically',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'atomic'}),before=structuredClone(state);
 for(const [operation,args]of [
  ['avatar.face.preset',{preset:'robot'}],
  ['avatar.part.change',{ids:['not-a-slot'],colour:'red'}],
  ['avatar.part.change',{ids:['eyes'],variant:'not a variant'}],
  ['avatar.part.change',{ids:['eyes'],colour:'not a colour'}],
  ['avatar.part.remove',{ids:['face']}],
  ['avatar.face.name',{name:' '}],
 ]){assert.equal(invoke(host,operation,args).status,'refused',operation);assert.deepEqual(state,before,operation);}
});

test('avatar controls produce expected typed intent and observed expression effects without a reader',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'intent'}),before=host.observe(),operation=host.bindings().find(o=>o.id==='avatar.face.expression'),args={expression:'sad'};
 const intent=describeNativeControl({operation,args,before}),receipt=invoke(host,operation.id,args),after=host.observe();
 assert.match(intent.text,/expression "sad"/);
 assert.equal(verifyNativeControlEffect({intent,before,after,receipt}).status,'verified');
 assert.equal(state.face.expression,'sad');
});

test('resizing a part keeps its exact primary target and declares derived attached placement as unverified',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'resize'}),before=host.observe(),operation=host.bindings().find(o=>o.id==='avatar.part.change'),args={ids:['hair_front'],size:'big'};
 const intent=describeNativeControl({operation,args,before}),receipt=invoke(host,operation.id,args),after=host.observe(),verification=verifyNativeControlEffect({intent,before,after,receipt});
 assert.equal(receipt.status,'changed');assert.equal(state.face.grade.hair_front,'big');assert.deepEqual(intent.expected.providedArgs.ids,['hair_front']);
 assert.equal(verification.status,'unverified');assert.ok(verification.checks.some(c=>c.parameter==='size'&&c.status==='met'));assert.ok(verification.checks.some(c=>c.parameter==='$scope'&&c.status==='unknown'&&c.changedKeys.includes('place')));assert.ok(!verification.checks.some(c=>c.status==='failed'));
});

test('selecting the current preset is an actual unchanged result without undefined host data',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'same-preset'}),before=structuredClone(state);
 const result=invoke(host,'avatar.face.preset',{preset:'girl'});
 assert.equal(result.status,'unchanged');assert.deepEqual(state,before);assert.equal(Object.hasOwn(state.face,'stepGroup'),false);
});
