import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInstanceStore} from '../docs/webchat/ui/instance-store.mjs';
const row=(world,wires='@instance example.instance name="Exact SOP"\n')=>({world,instanceId:'instance.'+world,wires,revision:0});
test('memory carrier preserves exact SOP archives and commits complete multiworld batches',async()=>{
 const store=createInstanceStore({persistent:false}),records=[row('time.calendar'),row('docs.editor','@block document.block text="Line\\nquoted"\n')];
 await store.saveMany(records);assert.deepEqual(await store.all(),records.toSorted((a,b)=>a.world.localeCompare(b.world)));assert.equal(await store.exportWorld('docs.editor'),records[1].wires);
 const exposed=await store.all();exposed[0].wires='changed externally';assert.notEqual((await store.all())[0].wires,'changed externally');
 assert.deepEqual(await createInstanceStore({persistent:false}).all(),[]);await store.clear();assert.deepEqual(await store.all(),[]);
});
test('invalid batches cannot partially replace earlier archives or add native state fields',async()=>{
 const store=createInstanceStore({persistent:false}),original=row('ui.avatar');await store.saveMany([original]);
 for(const invalid of [[row('ui.avatar','new'),{...row('docs.editor'),nativeState:{blocks:[]}}],[row('ui.avatar','new'),row('ui.avatar','duplicate')],[{...row('ui.avatar'),wires:{slots:[]}}]]){await assert.rejects(store.saveMany(invalid));assert.deepEqual(await store.all(),[original]);}
 await store.saveMany([{...original,revision:'1',wires:'@updated example.instance\n'}]);assert.equal((await store.all())[0].revision,'1');
});
