import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{createAppReaderContext}from'../src/dialog/app-reader-context.mjs';
import{observedReaderContext}from'../src/dialog/native-reader-context.mjs';
import{fitKeyReaderContext}from'../src/dialog/key-reader-inference.mjs';
import{createDrawingArea,emptyDrawingState}from'../worlds/art.draw/sop-drawing.mjs';
const board=async()=>{const state=emptyDrawingState(),host=await createDrawingArea({state});for(const kind of ['house','car','tree'])invokeToolCommand(host,{invocation:kind,expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind,name:kind}});return {state,host};};
// The Drawing SOP area observes each drawn k.objects part under its object (role = the part name).
test('model context ranks actual roots and requested descendants while full observation and legacy identity indexing remain complete',
 async()=>{
 const {state,host}=await board(),observation=host.observe(),before=structuredClone(observation);let retained;
 const read=createAppReaderContext({getState:()=>({'ui.shell':{activeTab:'draw'},'art.draw':state}),getInstanceId:()=>observation.instanceId,onObservation:value=>retained=value});
 const compact=await read('Add another object');assert.equal(compact.context.existing.length,3);assert.deepEqual(new Set(compact.context.existing.map(row=>row.kind)),new Set(['house','car','tree']));assert.ok(retained.observation.objects.length>3);assert.ok(retained.contextSelection.omittedDescendants>0);
 const full=observedReaderContext('drawing',observation);assert.equal(full.context.existing.length,observation.objects.length);assert.deepEqual(observation,before);
 const roof=observation.objects.find(object=>object.role==='roof');assert.ok(roof);const referenced=await read('Move the roof');assert.ok(retained.contextSelection.rankedIds.includes(roof.id));assert.ok(referenced.context.existing.some(row=>row.name==='roof'));
 state.runtime.view.selected=roof.id;const focused=await read('Move it');assert.ok(retained.contextSelection.rankedIds.includes(roof.id));assert.ok(focused.context.existing.length>=3,'other root alternatives remain available');
});
const fakeTokenizer=seen=>async([text],options)=>{seen.push(text);const count=(text+' '+options.text_pair[0]).match(/[\p{L}\p{N}_]+|[^\s]/gu).length+3;return {input_ids:{dims:[1,count],data:BigInt64Array.from(Array(count).fill(1),BigInt)},attention_mask:{dims:[1,count],data:BigInt64Array.from(Array(count).fill(1),BigInt)}};};
test('actual context token fitting removes optional context rather than shortening the request or mutating native context',async()=>{
 const seen=[],text='Create another object with a label',context={existing:Array.from({length:30},(_,i)=>({kind:'object',name:'Object '+i})),previous:'Earlier context '.repeat(300)},before=structuredClone(context),fitted=await fitKeyReaderContext(fakeTokenizer(seen),text,'unfamiliar',context,96);
 assert.ok(fitted.full.input_ids.data.length<=96);assert.ok(fitted.summary.includedExisting<30);assert.equal(fitted.summary.omittedPrevious,true);assert.ok(seen.every(value=>value===text));assert.deepEqual(context,before);
});
test('an overlong utterance remains whole and over budget for the existing explicit refusal path',async()=>{
 const seen=[],text='word '.repeat(200),fitted=await fitKeyReaderContext(fakeTokenizer(seen),text,'unfamiliar',{existing:[],previous:null},96);assert.ok(fitted.full.input_ids.data.length>96);assert.ok(seen.every(value=>value===text));
});

test('declared context roles rank exact mentions, then focus, roots and recent source order',()=>{
 const shape=(id,details={})=>({id,source:id+'@1',version:'1',sourceType:'novel.item',kind:'piece',inputs:[],...details});
 const observation={complete:true,instanceId:'scope',scope:'all',version:'1',objects:[
  shape('earliest',{members:['hidden','focused']}),
  shape('hidden',{role:'roof'}),
  shape('focused',{inputs:[{key:'selected',values:['true']}]}),
  shape('newest',{parent:'unobserved'}),
  shape('self',{parent:'self',relations:{members:['mentioned']}}),
  shape('mentioned',{role:'arch'}),
 ]};
 const read=text=>{
  let ids;
  observedReaderContext('novel',observation,null,{compact:true,text,onSummary:value=>{ids=value.rankedIds;}});
  return ids;
 };
 assert.deepEqual(read('Move the arch by the roofing'),['mentioned','focused','self','newest','earliest']);
 assert.deepEqual(read('Move the roof'),['hidden','focused','self','newest','earliest']);
});
