import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{inspectCatalogSources}from'../docs/webchat/ui/knowledge-source-inspection.mjs';
import{CATALOG_PIN}from'../src/knowledge/catalog-pin.mjs';
const index={worlds:[{id:'example',schema:'example/schema.sop',shards:[{path:'example/shards/facts.sop',bytes:12},{path:'example/shards/more.sop',bytes:12}]}]};
test('source inspection returns complete exact files and bounded pagination without executing anything',async()=>{
 const reads=[],texts={'example/schema.sop':'@example core.world','example/shards/facts.sop':'exact facts\n','example/shards/more.sop':'exact more\n'},readText=async path=>{reads.push(path);return texts[path];};
 const first=await inspectCatalogSources({nodeId:'knowledge-world:example',index,readText,maxFiles:2});assert.equal(first.status,'partial');assert.equal(first.nextOffset,2);assert.deepEqual(reads,['example/schema.sop','example/shards/facts.sop']);assert.deepEqual(first.sources.map(source=>source.text),[texts[reads[0]],texts[reads[1]]]);assert.equal(first.inspectionOnly,true);assert.equal(first.runtimeUseStatus,'unchanged');assert.equal(first.compiledByInspection,false);assert.equal(first.truncated,false);
 const last=await inspectCatalogSources({nodeId:first.nodeId,index,readText,offset:first.nextOffset});assert.equal(last.nextOffset,null);assert.equal(last.status,'loaded');assert.equal(last.sources[0].text,texts['example/shards/more.sop']);
});
test('only catalog-declared SOP node identities are readable; paths and JSON manifests cannot be requested',async()=>{
 let calls=0;for(const nodeId of ['index.json','knowledge-file:index.json','knowledge-world:absent','knowledge-file:../secret.sop','knowledge-file:example/missing.sop'])await assert.rejects(inspectCatalogSources({nodeId,index,readText:async()=>{calls++;}}),/unknown-catalog-source-node/);assert.equal(calls,0);
 await assert.rejects(inspectCatalogSources({nodeId:'knowledge-world:example',index:{worlds:[{id:'example',schema:'../secret.sop'}]},readText:async()=>{calls++;}}),/invalid-catalog-sop-path/);assert.equal(calls,0);
});
test('byte bounds never shorten a file and individual oversized sources fail explicitly',async()=>{
 const custom={worlds:[{id:'x',schema:'x/schema.sop',shards:[{path:'x/facts.sop',bytes:8}]}]},readText=async path=>path.endsWith('schema.sop')?'schema':'12345678';
 const page=await inspectCatalogSources({nodeId:'knowledge-world:x',index:custom,readText,maxBytes:10});assert.equal(page.status,'partial');assert.deepEqual(page.sources.map(source=>source.text),['schema']);assert.equal(page.nextOffset,1);assert.equal(page.truncated,false);
 await assert.rejects(inspectCatalogSources({nodeId:'knowledge-file:x/facts.sop',index:custom,readText,maxBytes:5}),/exceeds-byte-limit/);
});
test('k.interest inspection reads only its actual published schema and declared shards',async()=>{
 const base=new URL('../docs/webchat/catalog/'+CATALOG_PIN.commit+'/',import.meta.url),catalog=JSON.parse(await readFile(new URL('index.json',base),'utf8')),world=catalog.worlds.find(world=>world.id==='k.interest'),paths=[world.schema,...world.shards.map(shard=>shard.path)],reads=[];
 const result=await inspectCatalogSources({nodeId:'knowledge-world:k.interest',index:catalog,readText:async path=>{reads.push(path);return readFile(new URL(path,base),'utf8');}});assert.deepEqual(reads,paths);assert.equal(result.status,'loaded');assert.equal(result.sources.length,paths.length);for(const source of result.sources)assert.equal(source.text,await readFile(new URL(source.path,base),'utf8'));assert.ok(result.sources.every(source=>source.path.startsWith('k.interest/')&&source.language==='sop'&&source.purpose==='inspection'));
});
test('read-only instance inspection skips preparation while retaining cached native face semantics',async()=>{
 const [{NATIVE_AREAS,createAreaHost},{observeNativeInstanceWorlds},{initialAvatarState},{DEFAULT_FACE}]=await Promise.all([import('../src/dialog/app-reader-context.mjs'),import('../src/dialog/instance-persistence.mjs'),import('../worlds/ui.avatar/declared-host.mjs'),import('../worlds/ui.avatar/default-face.mjs')]);
 let preparations=0;const knowledge={async faces(){preparations++;return DEFAULT_FACE;},peekFaces:()=>DEFAULT_FACE},state=initialAvatarState(DEFAULT_FACE),session={isession:{state:{'ui.avatar':state}},engine:{knowledge}};
 const inspected=await observeNativeInstanceWorlds(session,{worlds:['ui.avatar'],includeHostInterface:true,prepareKnowledge:false});assert.equal(preparations,0);assert.equal(inspected.length,1);assert.ok(inspected[0].observation.objects.some(object=>object.sourceType==='ui.avatar.face'));
 const prepared=await createAreaHost(NATIVE_AREAS.avatar,{state,instanceId:inspected[0].observation.instanceId,knowledge});assert.equal(preparations,1);assert.deepEqual(prepared.observe().objects,inspected[0].observation.objects);assert.deepEqual(prepared.bindings(),inspected[0].nativeInterface.operations);
});
