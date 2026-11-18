import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse,str,readInstanceState,serializeInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
import {initialCanonicalDocumentState,initialDocumentState,createDocumentHost} from '../worlds/docs.editor/declared-host.mjs';
import {documentStateWorld,toNativeDocumentState,DOCUMENT_STATE_SCHEMA} from '../worlds/docs.editor/canonical-state.mjs';
import {documentTextId} from '../worlds/docs.editor/native-editing.mjs';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
import {snapshotNativeInstances,restoreNativeInstances,observeNativeInstanceWorlds} from '../src/dialog/instance-persistence.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {workFile,readWorkFile} from '../docs/webchat/ui/work-files.mjs';
import {createInstanceStore} from '../docs/webchat/ui/instance-store.mjs';

const world='docs.editor';
const session=state=>({engine:{},isession:{state:state?{[world]:state}:{}}});
const native=(s)=>toNativeDocumentState(s.isession.state[world]);
const control=(s,operation,args={})=>invokeNativeControl(s,{view:'editor',operation,args});
const checked=async(s,operation,args)=>{
 const outcome=await control(s,operation,args);
 assert.equal(outcome.ok,true,JSON.stringify(outcome.receipt??outcome));
 return outcome.receipt.changed;
};

test('Documents edits canonical typed content and restores a portable work file before exact UI Undo',async()=>{
 const source=session(initialCanonicalDocumentState());
 const [doc,chapter,paragraph]=await checked(source,'document.write',{
  title:'Field report',genre:'report',topic:'Observations',blocks:[
   {kind:'heading',level:1,text:'Introduction'},
   {kind:'paragraph',text:'First line 😀\nSecond line "as written".',from:['record.a','record.a']},
  ],
 });
 const [list]=await checked(source,'document.list.make',{parent:doc,style:'task',items:['Repeat','Repeat']});
 await checked(source,'document.list.change',{id:list,checked:[true,false]});
 const [table]=await checked(source,'document.table.make',{parent:doc,rows:[['Same','Same'],['Cell','Quoted \"text\"']],header:true});
 await checked(source,'document.block.mark',{id:table,at:'1:0',from:0,to:4,mark:'link',enabled:true,attrs:{href:'https://example.invalid/reference'}});
 const beforeOrder=documentStateWorld(source.isession.state[world]).ofType('docs.editor.content.block');
 await checked(source,'document.block.reorder',{ids:[chapter,table,paragraph,list]});
 const before=structuredClone(source.isession.state[world]),rendered=native(source),semantic=documentStateWorld(before);
 assert.deepEqual(Object.keys(before),['sop','runtime']);
 assert.ok(!Object.hasOwn(before,'doc')&&!Object.hasOwn(before,'stats')&&!Object.hasOwn(before,'blocks'));
 assert.deepEqual(semantic.ofType('docs.editor.content.block').map(w=>w.id).sort(),beforeOrder.map(w=>w.id).sort());
 const root=semantic.get('docs.editor.content.document');
 assert.deepEqual(root.attrs.block.map(reference=>str(semantic.get(reference.slice(1)).attrs.id[0])),[chapter,table,paragraph,list]);
 const types=new Set(parse(before.sop).map(wire=>wire.type));
 assert.deepEqual([...types].sort(),['block','document','mark','row','source','text'].map(type=>'docs.editor.content.'+type).sort());
 assert.doesNotMatch(before.sop,/history=|stats=|doc=/);
 assert.deepEqual(rendered.blocks.find(block=>block.id===list).items,['Repeat','Repeat']);
 assert.deepEqual(rendered.blocks.find(block=>block.id===list).checked,[true,false]);
 assert.deepEqual(rendered.blocks.find(block=>block.id===paragraph).from,['record.a','record.a']);
 assert.match(JSON.stringify(rendered.doc),/Field report/);

 const [record]=await snapshotNativeInstances(source,{worlds:[world]});
 const [observed]=await observeNativeInstanceWorlds(source,{worlds:[world]});
 assert.equal(observed.authoritative,true);
 assert.equal(observed.wires,record.wires);
 assert.equal(record.wires,before.sop);
 assert.ok(readInstanceState(record.runtime).projection.history.length>=1);
 const store=createInstanceStore({persistent:false});
 await store.saveMany([record]);
 assert.equal(await store.exportWorld(world),record.wires);
 const saved=readWorkFile(JSON.stringify(workFile('fixture-build',await store.all())),'fixture-build');
 const restored=session();await restoreNativeInstances(restored,saved);
 assert.deepEqual(native(restored),rendered);
 assert.deepEqual(restored.isession.state[world],before);
 assert.deepEqual(await snapshotNativeInstances(restored,{worlds:[world]}),[record]);
 await checked(restored,'document.container.change',{id:documentTextId(table,'1:0'),text:'Edited cell'});
 assert.equal(native(restored).blocks.find(block=>block.id===table).rows[1][0],'Edited cell');
 assert.ok((await control(restored,'undo')).ok);
 assert.deepEqual(restored.isession.state[world],before);
 assert.deepEqual(native(restored),rendered);
 const local=createDocumentHost({state:restored.isession.state[world],instanceId:'doc.aux-history'});
 const undo=invokeToolCommand(local,{expectedVersion:local.observe().version,operation:'document.undo',args:{},invocation:'saved.history.undo'});
 assert.equal(undo.status,'changed');
 assert.deepEqual(native(restored).blocks.map(block=>block.id),[chapter,paragraph,list,table]);
});

test('bad content and mismatched detached runtime are rejected before replacing the document',async()=>{
 const source=session(initialCanonicalDocumentState()),target=session(initialCanonicalDocumentState());
 await checked(source,'document.write',{title:'Report',blocks:[{kind:'paragraph',text:'Text'}]});
 const [record]=await snapshotNativeInstances(source,{worlds:[world]}),initial=structuredClone(target.isession.state);
 const malformed=[
  {...record,instanceId:'different'},
  {...record,wires:record.wires+'\n@foreign core.use world=std.request'},
  {...record,wires:record.wires.replace(/block=\$[^\s]+/,'block=$missing.block')},
 ];
 for(const value of malformed){
  await assert.rejects(restoreNativeInstances(target,[value]));
  assert.deepEqual(target.isession.state,initial);
 }
 const contentOnly={world,instanceId:record.instanceId,revision:record.revision,wires:record.wires};
 await restoreNativeInstances(target,[contentOnly]);
 assert.equal(native(target).title,'Report');
 assert.deepEqual(native(target).history,[]);
 const readable=await readFile(new URL('../worlds/docs.editor/state-schema.sop',import.meta.url),'utf8');
 assert.deepEqual(parse(readable),parse(DOCUMENT_STATE_SCHEMA));
});

test('a supported native projection archive is verified and adopts current canonical authority',async()=>{
 const raw=initialDocumentState(),instanceId='old.document',legacy=createDocumentHost({state:raw,instanceId});
 assert.equal(invokeToolCommand(legacy,{invocation:'write.legacy',expectedVersion:legacy.observe().version,operation:'document.write',args:{
  title:'Existing work',blocks:[{kind:'paragraph',text:'Literal content and provenance',from:['old.source']}],
 }}).status,'changed');
 const archive=serializeInstanceState({world,instanceId,revision:0,schemaVersion:'psys2.native-instance/1',
  objects:nativeObservationObjects(legacy.observe()),projection:raw,
  metadata:{projection:'native-host-data/1',knowledge:{repository:CATALOG_PIN.repo,version:CATALOG_PIN.commit}},
 });
 const restored=session();
 await restoreNativeInstances(restored,[{world,instanceId,revision:0,wires:archive}]);
 assert.deepEqual(restored.isession.state[world].runtime.history,raw.history);
 assert.equal(native(restored).title,raw.title);
 assert.deepEqual(native(restored).blocks,raw.blocks);
 assert.equal(typeof restored.isession.state[world].sop,'string');
});
