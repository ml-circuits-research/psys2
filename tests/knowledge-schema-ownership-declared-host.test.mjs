import test from 'node:test';
import assert from 'node:assert/strict';
import {createFacts} from '../src/knowledge/facts.mjs';
import {inspectWorldsRuntime} from '../src/dialog/worlds-inspection.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import {BUNDLED_DIAGRAMS} from '../src/knowledge/bundled-diagrams.mjs';
import {BUNDLED_PERSON} from '../src/knowledge/bundled-person.mjs';
import {bundledDiagramWorld} from '../src/knowledge/diagram-world.mjs';
import {pinnedCatalog} from '../scripts/lib/catalog-pin.mjs';
import {siteCatalogFiles} from '../scripts/lib/site-catalog.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {drawingPartsOf} from '../worlds/art.draw/part-tools.mjs';
import {createAvatarHost,initialAvatarState} from '../worlds/ui.avatar/declared-host.mjs';
import {toNativeAvatarState} from '../worlds/ui.avatar/canonical-state.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

test('schema lookup follows an explicit separately owned vocabulary without merging its source',async()=>{
 const paths=[],schema='@item core.type of=sample.item closed=true\n@size core.slot of=sample.item key=extent kind=number\n';
 const words='@size.word core.word text=width means=sample.item.extent\n';
 const files={
  'index.json':JSON.stringify({worlds:[{id:'sample',schema:'sample/structure.sop',vocabulary:'sample/lexicon/properties.sop',exports:['sample.item'],shards:[{id:'sample/lexicon/properties',path:'sample/lexicon/properties.sop',keys:[]}]}]}),
  'sample/structure.sop':schema,
  'sample/lexicon/properties.sop':words,
 };
 const knowledge=createFacts({source:{text:async path=>{paths.push(path);return files[path]??null;}}});
 const result=await knowledge.schema();
 assert.deepEqual(result.slots.get('sample.item').extent,{kind:['number'],enum:[],many:false,id:false});
 assert.deepEqual([...result.slotWords.get('width')],['sample.item.extent']);
 const lexical=await knowledge.wires('core.word',{world:'sample'});
 assert.equal(lexical.length,1);assert.equal(lexical[0].shard,'sample/lexicon/properties');
 assert.equal(paths.filter(path=>path==='sample/structure.sop').length,1);
 assert.equal(paths.filter(path=>path==='sample/lexicon/properties.sop').length,1,'shared explicit vocabulary dependency is fetched once');
 assert.equal(files['sample/structure.sop'],schema);assert.equal(files['sample/lexicon/properties.sop'],words);
});

test('an undeclared vocabulary path is not inferred from a conventional filename',async()=>{
 const paths=[],knowledge=createFacts({source:{text:async path=>{
  paths.push(path);
  if(path==='index.json')return JSON.stringify({worlds:[{id:'sample',schema:'sample/schema.sop',shards:[{id:'sample/shards/words',keys:[]}]}]});
  if(path==='sample/schema.sop')return '@type core.type of=sample.item\n';
  if(path==='sample/shards/words.sop')return '@word core.word text=guess means=sample.item\n';
  return null;
 }}});
 const result=await knowledge.schema();assert.equal(result.slotWords.size,0);
 assert.equal(paths.includes('sample/shards/words.sop'),false);
});

test('Worlds retains schema and explicit vocabulary as distinct owned sources',()=>{
 const schema='@type core.type of=sample.item closed=true',vocabulary='@word core.word text=items means=sample.item';
 const index={worlds:[{id:'sample',schema:'sample/schema.sop',vocabulary:'sample/lexical/words.sop',shards:[{path:'sample/lexical/words.sop'}]}]};
 const graph=inspectWorldsRuntime({knowledgeFiles:[{path:'index.json',text:JSON.stringify(index)},{path:'sample/schema.sop',text:schema},{path:'sample/lexical/words.sop',text:vocabulary}],instances:[{world:'example',instanceId:'example-instance',revision:0,wires:'@item sample.item'}]});
 const byId=new Map(graph.nodes.map(node=>[node.id,node])),world=byId.get('knowledge-world:sample');
 assert.deepEqual(world.sourceFiles.map(file=>[file.path,file.role]),[['sample/schema.sop','schema'],['sample/lexical/words.sop','knowledge']]);
 assert.equal(byId.get('knowledge-file:sample/schema.sop').wires,schema);
 assert.equal(byId.get('knowledge-file:sample/lexical/words.sop').wires,vocabulary);
 assert.ok(graph.edges.some(edge=>edge.from===world.id&&edge.to==='knowledge-file:sample/lexical/words.sop'&&edge.label==='loaded vocabulary'));
 assert.equal(byId.get('instance:example').wires,'@item sample.item');
});

test('offline consumer profiles preserve moved words separately from structural schemas',()=>{
 assert.ok(Object.keys(BUNDLED_DIAGRAMS.schemas).length>0);
 for(const schema of Object.values(BUNDLED_DIAGRAMS.schemas))assert.equal(lib.parse(schema).some(node=>node.type==='core.word'),false);
 for(const facts of Object.values(BUNDLED_DIAGRAMS.files))assert.equal(lib.parse(facts).some(node=>lib.SCHEMA_TYPES.has(node.type)),false);
 assert.ok(BUNDLED_DIAGRAMS.vocabularies['w.diagram/shards/words.sop']);
 const diagram=bundledDiagramWorld(lib);
 assert.ok(diagram.words().get('arrow').some(entry=>entry.means==='w.diagram.edge'));
 assert.equal(lib.parse(BUNDLED_PERSON.schema).some(node=>node.type==='core.word'),false);
 assert.equal(BUNDLED_PERSON.vocabularyPath,'w.person/shards/words.sop');
 const profile=new lib.World();profile.load(BUNDLED_PERSON.schema);
 assert.equal(profile.ofType('core.word').length,0);
 assert.equal(profile.tell(BUNDLED_PERSON.vocabulary,{factsOnly:true}).ok,true);
 assert.ok(profile.words().get('job').some(entry=>entry.means==='w.person.person.occupation'));
});

test('pinned vocabulary dependencies remain available to lookups, actual hosts and the site copy',async()=>{
 const {dir}=pinnedCatalog(),knowledge=createFacts({source:createKnowledgeSource(dir)}),schema=await knowledge.schema();
 assert.ok(schema.slotWords.get('leg').has('k.animals.animal.legs'));
 assert.ok(schema.slotWords.get('avatar').has('k.faces.preset'));
 assert.ok(schema.slotWords.get('month').has('k.time.month'));
 const aliases=await knowledge.wires('core.word',{world:'k.faces'});
 assert.ok(aliases.some(word=>word.f.text?.includes('android')&&word.f.means?.includes('robot')));
 const drawing=initialDrawingState(),drawHost=createDrawingHost({state:drawing,instanceId:'owned-source-drawing',knowledge});
 await knowledge.thing('apple');
 const added=drawHost.invoke({invocation:'owned-source-create',expectedVersion:drawHost.observe().version,operation:'drawing.catalog.make',args:{name:'apple',x:120,y:180,size:80}});
 assert.equal(added.status,'changed');assert.equal(drawing.objects[0].semanticKind,'apple');assert.ok(drawingPartsOf(drawing.objects[0]).length>1);
 const faces=await knowledge.faces();assert.ok(faces?.aliases.glasses?.includes('eyeglasses'));
 const avatar=initialAvatarState(faces),avatarHost=createAvatarHost({state:avatar,instanceId:'owned-source-avatar',knowledge});
 const resized=avatarHost.invoke({invocation:'owned-source-resize',expectedVersion:avatarHost.observe().version,operation:'avatar.part.resize',args:{ids:['eyes'],scale:1.1}});
 assert.equal(resized.status,'changed');assert.equal(toNativeAvatarState(avatar).face.adj.eyes.s,1.1);
 const catalog=JSON.parse(await readFile(path.join(dir,'index.json'),'utf8')),served=new Set(await siteCatalogFiles(dir));
 for(const world of [...catalog.worlds,...catalog.schemas])if(world.vocabulary)assert.ok(served.has(world.vocabulary),world.vocabulary+' must travel with the site catalog');
});
