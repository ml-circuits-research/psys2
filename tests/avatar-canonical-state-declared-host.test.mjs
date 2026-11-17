import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,serialize} from '../src/vendor/sopworld/sopworld.mjs';
import {initialAvatarState,createAvatarHost} from '../worlds/ui.avatar/declared-host.mjs';
import {snap} from '../worlds/ui.avatar/face.mjs';
import {AVATAR_STATE_SCHEMA,canonicalAvatarState,toNativeAvatarState,avatarStateWorld,adoptCanonicalAvatarState} from '../worlds/ui.avatar/canonical-state.mjs';
const roundtrip=native=>{const canonical=canonicalAvatarState(native);assert.deepEqual(Object.keys(canonical),['sop']);assert.deepEqual(toNativeAvatarState(canonical),native);return canonical;};
const invoke=(host,operation,args)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
test('Avatar state schema source is exact and all current fields roundtrip without JSON carriers',()=>{
 assert.equal(AVATAR_STATE_SCHEMA,readFileSync('worlds/ui.avatar/instance-schema.sop','utf8'));
 const state=initialAvatarState(),face=state.face;state.name='Ada';state.selectedSlot='eyes';state.idDisplay={mode:'temporary',expiresAt:123456};
 face.paint.eyes='#FFBF00';face.adj.eyes={s:1.2,dx:-0,dy:-3.5};face.adj.face={s:1.25};face.grade.eyes='big';face.expression='happy';face.expressionParts={mouth:'smile'};face.explicit={slots:['eyes','mouth'],roles:['skin'],paint:['eyes']};face.stepGroup='step.17';face.n=7;face.options={slot:'eyes',variants:['bright','round']};face.refs=[{thing:'eyes'},{thing:'face'}];
 face.saved={'First saved':{name:'Saved face',...snap(face)}};face.history=[{...snap(face),label:'Resize the eyes.'},{...snap(face),label:'Change colour.'}];face.future=[{...snap(face),label:'Move the eyes.'}];
 const c=roundtrip(state),nodes=parse(c.sop);assert(nodes.some(n=>n.type==='ui.avatar.state.part'&&n.attrs.variant&&n.attrs.paint&&n.attrs['geometry.s']));assert(!nodes.some(n=>n.type.includes('value')||n.type.includes('record')));assert(!c.sop.includes('std.instance'));assert(!c.sop.includes('presets'));assert(avatarStateWorld(c).get('avatar.face').type==='ui.avatar.state.composition');
 assert.equal(c.sop.match(/@avatar\.face\.part\.[^ ]+ /g).length,Object.keys(face.slots).length+1,'current geometry face transform is one actual part record, snapshots have independent ownership');
});
test('presence, empty maps, optional nulls, journal ordering and arbitrary slot identities are exact',()=>{
 for(const map of ['slots','colours','paint','adj','grade','expressionParts'])for(const include of [true,false]){
  const s=initialAvatarState();if(include)s.face[map]={};else delete s.face[map];roundtrip(s);
 }
 const s=initialAvatarState();delete s.selectedSlot;s.face.stepGroup=null;s.face.explicit={};s.face.options={slot:'custom antenna',variants:[]};s.face.history=[{slots:{},base:'one'},{slots:{},base:'two'}];s.face.refs=[];s.face.saved={};
 s.face.slots['custom antenna']='disc';s.face.adj['custom antenna']={};s.face.paint['custom antenna']='blue';Object.defineProperty(s.face.slots,'__proto__',{value:'custom',enumerable:true,writable:true,configurable:true});roundtrip(s);
});
test('every native operation result roundtrips with its real undo state and observation',()=>{
 const native=initialAvatarState(),host=createAvatarHost({state:native,instanceId:'roundtrip'});
 for(const [operation,args]of [['avatar.part.select',{id:'eyes'}],['avatar.face.resize',{scale:1.1}],['avatar.part.resize',{ids:['eyes'],scale:1.2}],['avatar.part.move',{ids:['eyes'],place:'up'}],['avatar.face.expression',{expression:'happy'}],['avatar.part.feature',{id:'eyes',property:'kind',value:'round'}],['avatar.undo',{}],['avatar.redo',{}],['avatar.ids.show',{mode:'always'}]]){
  const result=invoke(host,operation,args);roundtrip(native);assert(!['native-error','invalid-policy-result'].includes(result.reason),operation);
 }
});
test('unknown native fields, invalid geometries and cyclic state are rejected instead of dropped',()=>{
 for(const mutate of [s=>s.extra=1,s=>s.face.extra=1,s=>s.face.adj.eyes={rotation:3},s=>s.face.history=[{slots:{},extra:3}],s=>s.face.refs=[{thing:'face',extra:2}],s=>s.face.explicit={slots:[2]},s=>s.face.stepGroup=3,s=>s.face.slots.eyes={value:'round'},s=>s.face.future=[s.face]]){
  const s=initialAvatarState();mutate(s);assert.throws(()=>canonicalAvatarState(s));
 }
});
test('SOP domain edits are authoritative; extra facts and corrupted ownership are rejected',()=>{
 const c=roundtrip(initialAvatarState()),nodes=parse(c.sop),eyes=nodes.find(n=>n.type==='ui.avatar.state.part'&&n.attrs.id?.[0]==='"eyes"');eyes.attrs.variant=['"new variant"'];const edited={sop:serialize(nodes)};assert.equal(toNativeAvatarState(edited).face.slots.eyes,'new variant');
 const target={old:'discarded'};adoptCanonicalAvatarState(target,edited);assert.deepEqual(Object.keys(target),['sop']);assert.equal(toNativeAvatarState(target).face.slots.eyes,'new variant');
 for(const alter of [ns=>ns.push({...eyes,id:'unowned'}),ns=>ns.find(n=>n.id==='avatar.face').attrs.slots.push('$avatar.face'),ns=>ns.find(n=>n.id==='avatar.face').attrs.history=['$avatar.face'],ns=>ns.find(n=>n.id==='avatar.face').attrs['has.history']=['false']]){
  const corrupted=parse(c.sop);alter(corrupted);assert.throws(()=>toNativeAvatarState({sop:serialize(corrupted)}));
 }
 assert.throws(()=>toNativeAvatarState({...c,native:initialAvatarState()}),/carrier/);
});
