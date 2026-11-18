import {toNativeAvatarState,adoptCanonicalAvatarState} from '../worlds/ui.avatar/canonical-state.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarHost,initialAvatarState,avatarCapabilities} from '../worlds/ui.avatar/declared-host.mjs';
import {DEFAULT_FACE} from '../worlds/ui.avatar/default-face.mjs';
import {invokeToolCommand,describeNativeControl,verifyNativeControlEffect} from '../src/dialog/native-control-intent.mjs';
import {readNativeIntent} from '../src/dialog/native-intent-reader.mjs';
import {renderFace} from '../worlds/ui.avatar/facedraw.mjs';
const invoke=(host,operation,args)=>invokeToolCommand(host,{invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
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
 assert.equal(toNativeAvatarState(state).face.expression,'happy');
 assert.equal(invoke(host,'avatar.part.change',{ids:['eyes'],size:'big'}).status,'changed');
 assert.equal(toNativeAvatarState(state).face.grade.eyes,'big');
 assert.equal(invoke(host,'avatar.part.move',{ids:['eyes'],place:'up'}).status,'changed');
 assert.ok(toNativeAvatarState(state).face.adj.eyes.dy<0);
 assert.equal(invoke(host,'avatar.part.remove',{ids:['head']}).reason,'needed');
});

test('a new knowledge slot appears as a tool choice and can be added, recoloured, removed and undone',()=>{
 const data=customData(),state=initialAvatarState(data),host=createAvatarHost({state,instanceId:'custom',knowledge:{peekFaces:()=>data}});
 assert.ok(host.capabilities().slots.find(s=>s.id==='signal').variants.includes('round signal'));
 assert.equal(invoke(host,'avatar.part.add',{id:'signal',variant:'round signal'}).status,'changed');
 assert.equal(toNativeAvatarState(state).face.slots.signal,'round signal');
 assert.equal(invoke(host,'avatar.part.change',{ids:['signal'],colour:'red'}).status,'changed');
 assert.equal(toNativeAvatarState(state).face.paint.signal,'red');
 assert.equal(invoke(host,'avatar.part.remove',{ids:['signal']}).status,'changed');
 assert.equal(host.observe().objects.some(o=>o.id==='signal'),false);
 assert.equal(invoke(host,'avatar.undo',{}).status,'changed');
 assert.ok(host.observe().objects.some(o=>o.id==='signal'));
 assert.equal(invoke(host,'avatar.redo',{}).status,'changed');
 assert.equal(toNativeAvatarState(state).face.slots.signal,'none');
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
 assert.equal(toNativeAvatarState(state).face.expression,'sad');
});

test('resizing a part keeps its exact primary target and declares derived attached placement as unverified',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'resize'}),before=host.observe(),operation=host.bindings().find(o=>o.id==='avatar.part.change'),args={ids:['hair_front'],size:'big'};
 const intent=describeNativeControl({operation,args,before}),receipt=invoke(host,operation.id,args),after=host.observe(),verification=verifyNativeControlEffect({intent,before,after,receipt});
 assert.equal(receipt.status,'changed');assert.equal(toNativeAvatarState(state).face.grade.hair_front,'big');assert.deepEqual(intent.expected.providedArgs.ids,['hair_front']);
 assert.equal(verification.status,'unverified');assert.ok(verification.checks.some(c=>c.parameter==='size'&&c.status==='met'));assert.ok(verification.checks.some(c=>c.parameter==='$scope'&&c.status==='unknown'&&c.changedKeys.includes('place')));assert.ok(!verification.checks.some(c=>c.status==='failed'));
});

test('selecting the current preset is an actual unchanged result without undefined host data',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'same-preset'}),before=structuredClone(state);
 const result=invoke(host,'avatar.face.preset',{preset:'girl'});
 assert.equal(result.status,'unchanged');assert.deepEqual(state,before);assert.equal(Object.hasOwn(toNativeAvatarState(state).face,'stepGroup'),false);
});

test('precise resize is a declared compact command, changes real geometry and undoes exactly',()=>{
 const data=customData(),state=initialAvatarState(data),host=createAvatarHost({state,data,instanceId:'precise-size'});
 invoke(host,'avatar.part.add',{id:'signal',variant:'round signal'});
 const before=host.observe(),original=structuredClone(toNativeAvatarState(state).face),operation=host.bindings().find(op=>op.id==='avatar.part.resize'),args={ids:['signal'],scale:1.237816294576};
 const intent=describeNativeControl({operation,args,before}),decoded=readNativeIntent(intent.wires,{operation}),receipt=invoke(host,decoded.operation,decoded.args);
 assert.equal(intent.wires,'@update avatar.part.resize ids="signal" scale=1.237816294576');
 assert.equal(receipt.status,'changed');assert.equal(toNativeAvatarState(state).face.adj.signal.s,args.scale);
 assert.match(renderFace(data,toNativeAvatarState(state).face),/scale\(1\.237816294576\)/,'renderer keeps the requested transform precision');
 assert.equal(verifyNativeControlEffect({intent,before,after:host.observe(),receipt}).status,'verified');
 assert.equal(invoke(host,'avatar.undo',{}).status,'changed');assert.deepEqual(toNativeAvatarState(state).face.adj,original.adj);
 assert.equal(invoke(host,'avatar.redo',{}).status,'changed');assert.equal(toNativeAvatarState(state).face.adj.signal.s,args.scale);
 const stable=structuredClone(state);assert.equal(invoke(host,'avatar.part.resize',{ids:['signal'],scale:args.scale}).status,'unchanged');assert.deepEqual(state,stable);
 for(const args of [{ids:['signal'],scale:.59},{ids:['signal'],scale:1.51},{ids:['missing'],scale:1},{ids:['signal','signal'],scale:1}]){assert.equal(invoke(host,'avatar.part.resize',args).status,'refused');assert.deepEqual(state,stable);}
});

test('whole-avatar selection and exact scale affect its renderer, preserve parts and undo natively',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'whole-size'}),original=structuredClone(toNativeAvatarState(state).face);
 assert.equal(invoke(host,'avatar.face.select',{id:'face'}).status,'changed');assert.equal(toNativeAvatarState(state).selectedSlot,'face');
 const operation=host.bindings().find(op=>op.id==='avatar.face.resize'),before=host.observe(),args={id:'face',scale:.8123456789123},intent=describeNativeControl({operation,args,before}),decoded=readNativeIntent(intent.wires,{operation}),receipt=invoke(host,decoded.operation,decoded.args);
 assert.equal(receipt.status,'changed');assert.equal(toNativeAvatarState(state).face.adj.face.s,args.scale);assert.deepEqual(toNativeAvatarState(state).face.slots,original.slots);
 assert.match(renderFace(DEFAULT_FACE,toNativeAvatarState(state).face),/data-avatar-face="face" transform="[^"]*scale\(0\.8123456789123\)/);
 assert.equal(verifyNativeControlEffect({intent,before,after:host.observe(),receipt}).status,'verified');
 assert.equal(invoke(host,'avatar.undo',{}).status,'changed');assert.deepEqual(toNativeAvatarState(state).face.adj,original.adj);
 assert.equal(invoke(host,'avatar.part.select',{id:'eyes'}).status,'changed');assert.equal(toNativeAvatarState(state).selectedSlot,'eyes');
});

test('continuous resize follows catalog attachment geometry and refuses conflicting or out-of-bounds derived parts',()=>{
 const data=customData(),state=initialAvatarState(data),host=createAvatarHost({state,data,instanceId:'attachments'}),slot=data.slots.find(s=>s.name==='head');
 const related=host.bindings().find(op=>op.id==='avatar.part.resize').effectScope.related.filter(row=>row.when.includes===slot.name);
 assert.ok(related.length,'catalog geometry supplies attachments');
 const before=host.observe(),operation=host.bindings().find(op=>op.id==='avatar.part.resize'),args={ids:[slot.name],scale:1.1},intent=describeNativeControl({operation,args,before}),receipt=invoke(host,operation.id,args);
 assert.equal(receipt.status,'changed');assert.equal(toNativeAvatarState(state).face.adj[slot.name].s,1.1);
 const verification=verifyNativeControlEffect({intent,before,after:host.observe(),receipt});assert.ok(!verification.checks.some(check=>check.status==='failed'));
 const child=related.find(row=>host.observe().objects.some(object=>object.id===row.id));assert.ok(child);
 const changed=toNativeAvatarState(state);changed.face.adj[child.id].s=1.5;adoptCanonicalAvatarState(state,changed);const stable=structuredClone(state);
 assert.equal(invoke(host,'avatar.part.resize',{ids:[slot.name],scale:1.2}).reason,'attached-part-scale-bound');assert.deepEqual(state,stable);
});

test('ID identification and visibility are native compact commands with optional, clocked observation state',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'native-ids'}),face=structuredClone(toNativeAvatarState(state).face),operation=host.bindings().find(op=>op.id==='avatar.ids.show');
 const observed=()=>host.observe().objects.find(row=>row.id==='face').inputs;
 assert.equal(Object.hasOwn(state,'idDisplay'),false);assert.equal(observed().some(input=>['mode','expiresAt'].includes(input.key)),false);
 const args={mode:'temporary',duration:25},intent=describeNativeControl({operation,args,before:host.observe()}),decoded=readNativeIntent(intent.wires,{operation}),before=Date.now();
 assert.equal(intent.wires,'@show avatar.ids.show mode="temporary" duration=25');assert.equal(invoke(host,decoded.operation,decoded.args).status,'changed');
 assert.equal(toNativeAvatarState(state).idDisplay.mode,'temporary');assert.ok(toNativeAvatarState(state).idDisplay.expiresAt>=before+25&&toNativeAvatarState(state).idDisplay.expiresAt<=Date.now()+25);assert.deepEqual(toNativeAvatarState(state).face,face);
 assert.deepEqual(observed().find(input=>input.key==='mode').values,['"temporary"']);assert.deepEqual(observed().find(input=>input.key==='expiresAt').values,[String(toNativeAvatarState(state).idDisplay.expiresAt)]);
 assert.equal(invoke(host,operation.id,{mode:'always'}).status,'changed');assert.deepEqual(toNativeAvatarState(state).idDisplay,{mode:'always'});assert.equal(observed().some(input=>input.key==='expiresAt'),false);
 const stable=structuredClone(state);assert.equal(invoke(host,operation.id,{mode:'always'}).status,'unchanged');assert.deepEqual(state,stable);
 for(const args of [{mode:'guessed'},{mode:'temporary',duration:0},{mode:'temporary',duration:60001}]){assert.equal(invoke(host,operation.id,args).status,'refused');assert.deepEqual(state,stable);}
 assert.equal(invoke(host,operation.id,{mode:'off'}).status,'changed');assert.deepEqual(toNativeAvatarState(state).idDisplay,{mode:'off'});assert.deepEqual(toNativeAvatarState(state).face,face);
});
