import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{describeWorldsNode,describeWorldsNodes}from'../src/dialog/worlds-node-metadata.mjs';
import{inspectWorldsRuntime}from'../src/dialog/worlds-inspection.mjs';import{CATALOG_WORLD_PURPOSES,CATALOG_WORLD_PURPOSE_CONTEXT}from'../src/dialog/catalog-world-purpose.mjs';import{CATALOG_PIN}from'../src/knowledge/catalog-pin.mjs';
test('implementation identity never promotes native handlers or JSON to SOP because their labels mention SOP',()=>{
 const rows=describeWorldsNodes([{id:'interpreter:fixture',kind:'adapter',implementation:'JavaScript + SOP declarations',wires:'@a fixture'}, {id:'component:reader',kind:'component',wires:'model code'}, {id:'knowledge-file:index.json',kind:'knowledge',wires:'{"worlds":[]}'}, {id:'instance:fixture',kind:'instance',wires:'@a fixture.item n=2'}, {id:'world:fixture',kind:'world',packageHasNativeCode:true,wires:'@a core.world'}]);
 assert.deepEqual(rows.map(n=>n.representation),['javascript','model','catalog','sop','javascript']);assert.deepEqual(rows.map(n=>n.sopAvailable),[false,false,false,true,false]);assert.ok(rows.every(n=>typeof n.why==='string'&&n.why.length>30));
 const empty=describeWorldsNode({id:'schema:fixture',kind:'schema',wires:''});assert.equal(empty.wires,undefined);assert.equal(empty.sopAvailable,false);
});
test('every published catalog world has concrete authored purpose and declared SOP sources without pretending they were used',async()=>{
 const index=JSON.parse(await readFile(new URL('../docs/webchat/catalog/'+CATALOG_PIN.commit+'/index.json',import.meta.url),'utf8'));
 assert.equal(CATALOG_WORLD_PURPOSE_CONTEXT.catalogCommit,CATALOG_PIN.commit);assert.deepEqual(Object.keys(CATALOG_WORLD_PURPOSES).sort(),index.worlds.map(w=>w.id).sort());
 const graph=inspectWorldsRuntime({knowledgeFiles:[{path:'index.json',text:JSON.stringify(index),purposes:['runtime']}]});const worlds=graph.nodes.filter(n=>n.id.startsWith('knowledge-world:'));
 assert.equal(worlds.length,index.worlds.length);for(const node of worlds){assert.equal(node.why,CATALOG_WORLD_PURPOSES[node.label]);assert.equal(node.representation,'sop');assert.equal(node.usage,'available');assert.ok(node.sourceFiles.length>0);assert.ok(node.sourceFiles.every(f=>f.path.endsWith('.sop')));assert.equal(node.wires,undefined);assert.equal(node.sopAvailable,true);}
 const interest=worlds.find(n=>n.label==='k.interest');assert.match(interest.why,/novelty|relevance/);assert.match(interest.usageReason,/catalog membership does not establish/);const schema=graph.nodes.find(n=>n.id==='knowledge-file:'+interest.sourceFiles[0].path);assert.equal(schema.sopAvailable,true);assert.equal(schema.sourceFiles[0].loaded,false);
});
test('opening catalog sources cannot become evidence that their reasoning mechanism ran',()=>{
 const index={worlds:[{id:'k.interest',schema:'k.interest/schema.sop',shards:[{path:'k.interest/data.sop'}]}]},base={path:'index.json',text:JSON.stringify(index)},source={path:'k.interest/schema.sop',text:'@a core.type of=k.interest.measure'};
 const find=files=>inspectWorldsRuntime({knowledgeFiles:[base,...files]}).nodes.find(n=>n.id==='knowledge-world:k.interest');
 assert.equal(find([{...source,purposes:['inspection']}]).usage,'inspection-only');assert.equal(find([{...source,purposes:['runtime']}]).usage,'runtime-read');assert.match(find([{...source,purposes:['runtime']}]).usageReason,/does not activate/);
});
