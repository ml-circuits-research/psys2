import {test} from 'node:test';import assert from 'node:assert/strict';
import {copyHostData,createNativeToolHost} from '../worlds/native-tool-host.mjs';
const fixture=(handler,state={items:[]},view=s=>s.items.map(id=>({id,kind:'item',sourceType:'fixture.item',inputs:[]})))=>({state,host:createNativeToolHost({state,instanceId:'fixture',scope:'all-items',operations:[{id:'edit',params:{}}],handlers:{edit:handler},view})});
const call=(h,id='edit')=>h.invoke({invocation:id,expectedVersion:h.observe().version,operation:'edit',args:{}});
test('native transaction refuses unsafe JSON without invoking getters or losing hidden properties',()=>{
 let invoked=0;const accessor=Object.defineProperty({},'x',{enumerable:true,get(){invoked++;return 1;}});
 const hidden=Object.defineProperty({},'x',{value:1});const symbol={[Symbol('x')]:1};const cycle={};cycle.self=cycle;
 for(const data of [accessor,hidden,symbol,cycle,[,1],new Date(),{x:NaN},{x:undefined}])assert.throws(()=>copyHostData(data));assert.equal(invoked,0);
 const hostile=JSON.parse('{"__proto__":{"safe":true}}');const copy=copyHostData(hostile);assert.equal(Object.getPrototypeOf(copy),Object.prototype);assert.deepEqual(copy.__proto__,{safe:true});
});
test('native transaction stages effects, rolls back failed handlers and validates projections before commit',()=>{
 for(const [handler,view] of [
  [ctx=>{ctx.state.items.push('a');ctx.request('open',{});throw Error('fail');}],
  [ctx=>{ctx.state.items.push('a');return {status:'missing',code:'unsupported'};}],
  [ctx=>{ctx.state.items.push('a');return {status:'supported'};},s=>s.items.map(id=>({id,kind:'item',sourceType:'fixture.item',inputs:{}}))],
 ]){const {state,host}=fixture(handler,undefined,view);assert.equal(call(host).status,'refused');assert.deepEqual(state,{items:[]});}
 const {state,host}=fixture(ctx=>{ctx.state.items.push('a');ctx.request('open',{tab:'fixture'});return {status:'supported',changed:['a']};});const r=call(host);assert.equal(r.status,'changed');assert.deepEqual(r.effects,[{name:'open',args:{tab:'fixture'}}]);assert.equal(r.verification,'unverified');assert.deepEqual(state.items,['a']);
});
test('native identity tracks removal/reappearance and complete snapshots ignore UI selection',()=>{
 const state={items:['a','b'],selected:'a'},f=fixture(ctx=>{ctx.state.items=[];return {status:'supported'};},state);const first=f.host.observe();assert.equal(first.complete,true);assert.equal(first.objects.length,2);call(f.host);state.items=['a'];const restored=f.host.observe();assert.notEqual(restored.objects[0].source,first.objects[0].source);assert.notEqual(restored.version,first.version);
 const version=restored.version;Object.defineProperty(state,'hidden',{value:true});assert.equal(f.host.invoke({operation:'edit',args:{},invocation:'unsafe',expectedVersion:version}).status,'refused');assert.deepEqual(state.items,['a']);
});
test('native transaction refuses immutable state and invalid budgets before losing data',()=>{
 const state=Object.freeze({items:[]});const {host}=fixture(ctx=>{ctx.state.items.push('a');return {status:'supported'};},state);assert.equal(call(host).reason,'immutable-state');assert.deepEqual(state.items,[]);
 assert.throws(()=>createNativeToolHost({maxObjects:NaN}));
});
