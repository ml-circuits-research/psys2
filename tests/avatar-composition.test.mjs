import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFacts} from '../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {createAvatarHost,initialAvatarState,avatarColourScope} from '../worlds/ui.avatar/declared-host.mjs';
import {DEFAULT_FACE} from '../worlds/ui.avatar/default-face.mjs';
import {expressionParts} from '../worlds/ui.avatar/composition.mjs';
import {variantFor} from '../worlds/ui.avatar/facedraw.mjs';
const data=await createFacts({source:createKnowledgeSource(new URL('../../sop-knowledge-worlds/docs/worlds',import.meta.url).pathname)}).faces();
const call=(h,operation,args)=>h.invoke({invocation:crypto.randomUUID(),operation,args,expectedVersion:h.observe().version});
const integrationTest=(name,fn)=>test(name,{skip:!data&&'the sibling knowledge catalog is not checked out'},fn);
integrationTest('catalog adapter retains character kinds and sparse knowledge goals, with alternatives free',()=>{
 assert.equal(data.presets.robot.kind,'robot');assert.equal(data.presets.girl.kind,'human');
 assert.deepEqual(data.expressions.happy.goals.find(g=>g.slot==='mouth'),{slot:'mouth',property:'feel',value:'smiling'});
 assert.equal(data.expressions.happy.goals.filter(g=>g.slot==='mouth').length,1);
});
integrationTest('composition changes preserve explicit constituent, colour, removal, size and placement edits',()=>{
 const state=initialAvatarState(data),h=createAvatarHost({state,data,instanceId:'composition'});
 assert.equal(call(h,'avatar.part.change',{ids:['mouth'],variant:'smile'}).status,'changed');
 call(h,'avatar.part.change',{ids:['hair_front'],variant:'curly'});
 call(h,'avatar.part.change',{ids:avatarColourScope(data,state.face,'hair_front','black'),colour:'black'});
 call(h,'avatar.part.change',{ids:['eyes'],size:'big'});call(h,'avatar.part.move',{ids:['eyes'],place:'right'});
 call(h,'avatar.part.remove',{ids:['hat']});
 const grade=structuredClone(state.face.grade),adj=structuredClone(state.face.adj);
 assert.equal(call(h,'avatar.face.compose',{characterKind:'robot'}).status,'changed');
 assert.equal(state.face.base,'robot');assert.equal(state.face.slots.head,'box');
 for(const [slot,variant]of [['mouth','smile'],['hair_front','curly'],['hat','none']])assert.equal(state.face.slots[slot],variant);
 assert.equal(state.face.colours.hair,'black');assert.deepEqual(state.face.grade,grade);assert.deepEqual(state.face.adj,adj);
 assert.equal(call(h,'avatar.face.compose',{base:'woman'}).status,'changed');assert.equal(state.face.slots.hair_front,'curly');assert.equal(state.face.slots.mouth,'smile');
 const before=structuredClone(state);assert.equal(call(h,'avatar.face.compose',{characterKind:'robot',base:'woman'}).status,'refused');assert.deepEqual(state,before);
});
integrationTest('happy preserves two different compatible smiling mouths and exposes the variants actually rendered',()=>{
 for(const mouth of ['smile','big smile']){
  const state=initialAvatarState(data),h=createAvatarHost({state,data,instanceId:'emotion'});
  call(h,'avatar.part.change',{ids:['mouth'],variant:mouth});call(h,'avatar.face.expression',{expression:'happy'});
  assert.equal(state.face.expressionParts.mouth,mouth);assert.equal(variantFor(data,state.face,'mouth').name,mouth);
  const observed=h.observe().objects.find(o=>o.id==='mouth').inputs.find(i=>i.key==='variant').values[0];assert.equal(JSON.parse(observed),mouth);
  call(h,'avatar.face.expression',{expression:''});assert.equal(state.face.expression,'');assert.equal(state.face.slots.mouth,mouth);
 }
});
integrationTest('an unfamiliar emotion uses declarative feature goals without a runtime name branch',()=>{
 const custom=structuredClone(data);custom.expressions.reflective={name:'reflective',over:{},oneEye:null,mouthAlt:null,goals:[{slot:'mouth',property:'feel',value:'closed'},{slot:'eyebrows',property:'feel',value:'thick'}]};
 const state=initialAvatarState(custom),h=createAvatarHost({state,data:custom,instanceId:'new-emotion'});call(h,'avatar.part.change',{ids:['mouth'],variant:'full lips'});
 assert.equal(call(h,'avatar.face.expression',{expression:'reflective'}).status,'changed');assert.equal(state.face.expressionParts.mouth,'full lips');
 const brow=custom.slots.find(s=>s.name==='eyebrows').variants.find(v=>v.name===state.face.expressionParts.eyebrows);assert.ok(brow.features.feel.includes('thick'));
 assert.deepEqual(expressionParts(custom,state.face,'unknown'),null);
});
integrationTest('constituent feature edits use available knowledge alternatives and refuse impossible combinations',()=>{
 const state=initialAvatarState(data),h=createAvatarHost({state,data,instanceId:'features'});
 assert.equal(call(h,'avatar.part.feature',{id:'mouth',property:'feel',value:'smiling'}).status,'changed');
 const variant=data.slots.find(s=>s.name==='mouth').variants.find(v=>v.name===state.face.slots.mouth);assert.ok(variant.features.feel.includes('smiling'));
 const before=structuredClone(state);assert.equal(call(h,'avatar.part.feature',{id:'mouth',property:'age',value:'old'}).status,'refused');assert.deepEqual(state,before);
});

integrationTest('emotion-created optional parts are observed, selectable and share their actual colour role scope',()=>{
 const state=initialAvatarState(data),h=createAvatarHost({state,data,instanceId:'emergent-part'});
 call(h,'avatar.face.compose',{characterKind:'robot'});assert.equal(state.face.slots.eyebrows,'none');
 call(h,'avatar.face.expression',{expression:'happy'});assert.ok(h.observe().objects.some(o=>o.id==='eyebrows'));
 assert.ok(avatarColourScope(data,state.face,'eyebrows','black').includes('eyebrows'));
 assert.equal(call(h,'avatar.part.move',{ids:['eyebrows'],place:'up'}).status,'changed');
 assert.equal(call(h,'avatar.part.change',{ids:['eyebrows'],variant:'thick arched'}).status,'changed');assert.equal(state.face.slots.eyebrows,'thick arched');
});

test('portable composition keeps explicit native edits while changing a data-defined character kind',()=>{
 const custom=structuredClone(DEFAULT_FACE);custom.presets.alternative={...structuredClone(custom.presets.girl),name:'alternative',kind:'synthetic-kind'};custom.presets.alternative.slots.mouth='smile';
 const state=initialAvatarState(custom),h=createAvatarHost({state,data:custom,instanceId:'portable-compose'});
 call(h,'avatar.part.change',{ids:['mouth'],variant:'big smile'});call(h,'avatar.part.change',{ids:avatarColourScope(custom,state.face,'hair_front','black'),colour:'black'});call(h,'avatar.part.change',{ids:['eyes'],size:'big'});call(h,'avatar.part.move',{ids:['eyes'],place:'right'});
 const adj=structuredClone(state.face.adj);assert.equal(call(h,'avatar.face.compose',{characterKind:'synthetic-kind'}).status,'changed');assert.equal(state.face.base,'alternative');assert.equal(state.face.slots.mouth,'big smile');assert.equal(state.face.colours.hair,'black');assert.equal(state.face.grade.eyes,'big');assert.deepEqual(state.face.adj,adj);
});
test('portable unfamiliar emotion and feature tools use actual drawable catalog features',()=>{
 const custom=structuredClone(DEFAULT_FACE);custom.expressions.reflective={name:'reflective',over:{},goals:[{slot:'mouth',property:'feel',value:'closed'},{slot:'eyebrows',property:'feel',value:'arched'}]};
 const state=initialAvatarState(custom),h=createAvatarHost({state,data:custom,instanceId:'portable-features'});call(h,'avatar.part.change',{ids:['mouth'],variant:'smile'});
 assert.equal(call(h,'avatar.face.expression',{expression:'reflective'}).status,'changed');assert.equal(state.face.expressionParts.mouth,'smile');
 assert.equal(call(h,'avatar.part.feature',{id:'mouth',property:'feel',value:'sad'}).status,'changed');assert.equal(state.face.slots.mouth,'sad');assert.equal(state.face.expression,'');
 const before=structuredClone(state);assert.equal(call(h,'avatar.part.feature',{id:'mouth',property:'length',value:'long'}).status,'refused');assert.deepEqual(state,before);
});
