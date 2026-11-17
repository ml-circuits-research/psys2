// Actual archives emitted by the published 3ce runtime, with their original facts/history.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {restoreNativeInstances,snapshotNativeInstances} from '../src/dialog/instance-persistence.mjs';
import {readInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
import {toNativeCalendarState,createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/instance-3ce-saved-worlds.json',import.meta.url),'utf8'));
const records=await Promise.all(fixture.records.map(async({world,instanceId,revision,wires,wiresFile})=>({world,instanceId,revision,wires:wires??await readFile(new URL('./fixtures/'+wiresFile,import.meta.url),'utf8')})));
const archives=new Map(records.map(record=>[record.world,readInstanceState(record.wires)]));
const semantic=objects=>objects.map(object=>{const copy=structuredClone(object);if(copy.metadata){delete copy.metadata.inputs;if(!Object.keys(copy.metadata).length)delete copy.metadata;}return copy;});
const projection=(world,state)=>world==='time.calendar'?toNativeCalendarState(state):state;
const exported=(record)=>record.world==='time.calendar'?{projection:toNativeCalendarState({sop:record.wires}),objects:nativeObservationObjects(createCalendarHost({state:{sop:record.wires},instanceId:record.instanceId}).observe())}:readInstanceState(record.wires);
const session=()=>({isession:{state:{}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}});
function difference(actual,expected,at='$'){
 if(isDeepStrictEqual(actual,expected))return null;
 if(actual&&expected&&typeof actual==='object'&&typeof expected==='object')for(const key of new Set([...Object.keys(expected),...Object.keys(actual)])){const found=difference(actual[key],expected[key],at+'.'+key);if(found)return found;}
 return {at,actual:JSON.stringify(actual)?.slice(0,160),expected:JSON.stringify(expected)?.slice(0,160)};
}
const exact=(actual,expected,label)=>assert.ok(isDeepStrictEqual(actual,expected),label+': '+JSON.stringify(difference(actual,expected)));

test('the historical fixture contains populated, unmodified published instances in all five editors',()=>{
 assert.equal(fixture.captureCommit,'3ce766837cefb972b3f70ca224de3f2712f2b9ba');
 assert.deepEqual([...archives.keys()].sort(),['art.draw','diagram.sketch','docs.editor','time.calendar','ui.avatar']);
 const drawing=archives.get('art.draw').projection;
 assert.ok(drawing.objects.some(object=>object.shape?.members?.length>=2));
 assert.ok(drawing.objects.some(object=>object.rotation!==0));
 const diagram=archives.get('diagram.sketch').projection;
 assert.ok(diagram.groups.some(group=>group.members.length>=2&&group.chartId));assert.ok(diagram.edges.length);
 assert.ok(diagram.chartTools.charts.some(chart=>chart.projection?.status==='linked'&&chart.datasets[0].data.some(value=>value>0)));
 const document=archives.get('docs.editor').projection;
 assert.ok(document.blocks.some(block=>block.kind==='heading'&&block.level===1));assert.ok(document.blocks.some(block=>block.kind==='paragraph'&&block.text));
 const avatar=archives.get('ui.avatar').projection;
 assert.equal(avatar.face.expression,'happy');assert.ok(Object.values(avatar.face.adj).some(value=>value.s!==1||value.dx||value.dy));assert.ok(avatar.face.history.length>=3);
 assert.equal(Object.hasOwn(avatar,'selectedSlot'),false,'published absence is retained, without stripping newer fields from a current capture');
 const calendar=archives.get('time.calendar').projection;
 assert.ok(calendar.meetings.some(event=>event.participants.length&&event.room&&event.calendar&&event.duration>0));assert.equal(Object.hasOwn(calendar,'selectedEvent'),false);
});

for(const record of records)test(`published ${record.world} SOP archive restores every fact, full projection and stable IDs`,async()=>{
 const target=session(),archive=archives.get(record.world),original=JSON.stringify(record);
 await restoreNativeInstances(target,[record]);
 exact(projection(record.world,target.isession.state[record.world]),archive.projection,'every renderer field and native history remains exact');if(record.world==='time.calendar')assert.deepEqual(Object.keys(target.isession.state[record.world]),['sop']);
 assert.equal(target.nativeInstanceIds[record.world],record.instanceId);
 assert.equal(target.nativeInstanceRevisions[record.world],record.revision);
 const [roundtrip]=await snapshotNativeInstances(target,{worlds:[record.world]}),next=exported(roundtrip);
 exact(next.projection,archive.projection,'projection after re-export');exact(next.objects,semantic(archive.objects),'all semantic facts, values and relations after re-export; binding declarations are no longer copied');
 assert.equal(roundtrip.instanceId,record.instanceId);assert.equal(roundtrip.revision,record.revision);if(record.world!=='time.calendar')assert.equal(next.schemaVersion,archive.schemaVersion);else assert.doesNotMatch(roundtrip.wires,/std\.instance\./);
 assert.equal(JSON.stringify(record),original,'the original archive is never rewritten or stripped');
});

test('all five published archives restore together without losing native data or partially adopting state',async()=>{
 const target=session(),result=await restoreNativeInstances(target,records);
 assert.deepEqual(result.worlds,records.map(record=>record.world));
 for(const record of records)exact(projection(record.world,target.isession.state[record.world]),archives.get(record.world).projection,record.world+' full projection');
 for(const record of await snapshotNativeInstances(target,{worlds:records.map(record=>record.world)})){
  const next=exported(record),original=archives.get(record.world);exact(next.objects,semantic(original.objects),record.world+' all object facts');exact(next.projection,original.projection,record.world+' complete projection');assert.equal(record.instanceId,original.instanceId);assert.equal(record.revision,original.revision);
 }
});
