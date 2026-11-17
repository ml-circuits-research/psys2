import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{exportNativeReaderBindings}from'../training/sop-bert/export-native-reader-bindings.mjs';
import{mergeNativeReaderBindings}from'../src/dialog/native-reader-bindings.mjs';
import{bridgeRawStructure,RAW_STRUCTURAL_FORMAT}from'../src/dialog/raw-structural-bridge.mjs';
import{projectContextAction}from'../src/dialog/project-context-action.mjs';import{executeDeclaredRequest}from'../src/dialog/declared-execution.mjs';
import{createFacts}from'../src/knowledge/facts.mjs';import{createKnowledgeSource}from'../src/loaders/knowledge-source.mjs';
import{initialAvatarState}from'../worlds/ui.avatar/declared-host.mjs';import{createDrawingHost,initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
const inventory=JSON.parse(await readFile(new URL('../training/sop-bert/data/ui-natural-v1/inventory.json',import.meta.url),'utf8'));
const knowledge=createFacts({source:createKnowledgeSource(new URL('../../sop-knowledge-worlds/docs/worlds/',import.meta.url).pathname)}),faces=await knowledge.faces();
const overlay=await exportNativeReaderBindings({inventory,knowledge}),bindings=mergeNativeReaderBindings({format:'sop.structural-bindings/1',kinds:[],properties:[],families:[],units:[]},overlay),sha=createHash('sha256').update(JSON.stringify(bindings)).digest('hex');
const raw=(area,type,key,value)=>{const text='change '+type+' to '+value,start=text.indexOf(value);return{format:RAW_STRUCTURAL_FORMAT,area,source:{text,unit:'unicode-scalar'},model:{kind:'structural-graph',sha256:'a'.repeat(64),decoderVersion:1},requestCount:1,coverage:{complete:true,truncated:false},unresolved:[],ranges:[{path:['requests','0','constraints','0','value_span'],range:[start,start+value.length]}],requests:[{span:text,trigger:'change',act:'change',mood:'do',target:{type,mode:'existing'},constraints:[{key:type+'.'+key,value,value_span:value,operator:'eq',phase:'result',character:'requirement',polarity:'positive'}]}]};};
test('gold requests use actual native family/property declarations for avatar composition and drawing labels',async()=>{
 const avatar=initialAvatarState(faces),drawing=initialDrawingState(),session={isession:{state:{'ui.avatar':avatar,'art.draw':drawing}},engine:{knowledge}};
 const faceRaw=raw('avatar','face','base','man');faceRaw.requests[0].target.fill='context';
 const initial=bridgeRawStructure(faceRaw,{bindings,bindingSha256:sha});assert.equal(initial.decoded?.candidates.length??0,0);
 const projected=await projectContextAction({raw:faceRaw,coverage:{complete:false},failures:initial.diagnostics},session,{bindings,registry:{},view:'avatar'});assert.ok(projected);
 const faceReply=await executeDeclaredRequest(session,projected.proposal.candidates[0],faceRaw.source.text,{bindings,view:'avatar'});assert.equal(faceReply.statuses[0],'supported',JSON.stringify(faceReply));assert.equal(faceReply.trace.binding.operation,'avatar.face.compose');assert.equal(avatar.face.base,'man');assert.equal(faceReply.trace.effectVerification.status,'verified');
 const host=createDrawingHost({state:drawing,instanceId:'fixture'});await host.invoke({invocation:'fixture.make',expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind:'house'}});
 const drawingRaw=raw('drawing','drawn','label','Cabin'),bridge=bridgeRawStructure(drawingRaw,{bindings,bindingSha256:sha});assert.equal(bridge.decoded?.candidates.length,1,JSON.stringify(bridge.diagnostics));
 const result=await executeDeclaredRequest(session,bridge.decoded.candidates[0],drawingRaw.source.text,{bindings,view:'draw'});assert.equal(result.statuses[0],'supported',JSON.stringify(result));assert.equal(drawing.objects[0].label,'Cabin');assert.equal(result.trace.effectVerification.status,'verified');
});
test('native overlay preserves semantic identities and reports actual parameter enums without interpreting source descriptions',()=>{
 const known={area:'drawing',key:'drawn.label',canonical:'existing.semantic.label'};const base={format:'sop.structural-bindings/1',properties:[known],families:[],kinds:[]};const merged=mergeNativeReaderBindings(base,overlay);assert.equal(merged.properties.find(p=>p.area==='drawing'&&p.key==='drawn.label').canonical,known.canonical);assert.deepEqual(base.properties,[known]);
 const property=overlay.properties.find(p=>p.area==='avatar'&&p.key==='face.base');assert.ok(property.hostBinding.parameterContract.enum.includes('man'));const source=overlay.nativeInterfaces.find(s=>s.sourceWorld===property.sourceWorld);assert.ok(source.wires.includes('@'+property.sourceWire+' core.slot'));assert.match(source.wires,/enum="man"/);assert.equal(createHash('sha256').update(source.wires).digest('hex'),property.sourceSnapshotSHA);
 assert.equal(overlay.readerAreaByView.avatar,'avatar');assert.equal(overlay.families.filter(f=>f.area==='drawing'&&f.type==='part').length,1);
});
