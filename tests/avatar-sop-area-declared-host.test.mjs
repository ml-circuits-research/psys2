// The Avatar tab defined by worlds/ui.avatar/area.sop through the generic SOP area: catalog loading by index,
// the declared start state and the drawing all come from SOP declarations.
import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {createSopArea,initialSopAreaState,renderSopArea} from '../worlds/sop-area.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import NATIVE_INTERFACE from '../worlds/ui.avatar/native-interface-source.mjs';

const K=PINNED_CATALOG;
const available=existsSync(new URL('w.face/schema.sop',K))&&readFileSync(new URL('w.face/schema.sop',K),'utf8').includes('w.face.slot');
const options={world:'ui.avatar',interfaceSource:NATIVE_INTERFACE,
 loader:{readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8').catch(()=>null)},
 readCatalog:path=>readFile(new URL(path,K),'utf8')};

test('the declared area starts from its preset, draws it and changes it through the same host',{skip:available?false:'knowledge with w.face.slot unavailable'},async()=>{
 const state=await initialSopAreaState(options);
 const host=await createSopArea({...options,state,instanceId:'avatar-area-test'});
 const ids=()=>host.observe().objects.map(o=>o.id);
 assert.ok(ids().includes('face')&&ids().includes('hair_front'),JSON.stringify(ids()));
 const girl=await renderSopArea(options,state);
 assert.ok((girl.match(/<g /g)??[]).length>20);
 const result=host.invoke('@c avatar.face.preset preset="robot"',toolInvocationContext('robot',host.observe().version));
 assert.equal(result.status,'changed',result.reason);
 const robot=await renderSopArea(options,state);
 assert.notEqual(robot,girl);
 assert.ok(!ids().includes('hair_front'));
});
