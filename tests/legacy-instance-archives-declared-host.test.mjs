import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
// Actual archives emitted by the published 3ce runtime, with their original facts/history.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {restoreNativeInstances} from '../src/dialog/instance-persistence.mjs';
import {readInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
import {NATIVE_AREAS,createAreaHost} from '../src/dialog/app-reader-context.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {toNativeCalendarState,createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/instance-3ce-saved-worlds.json',import.meta.url),'utf8'));
const records=await Promise.all(fixture.records.map(async({world,instanceId,revision,wires,wiresFile})=>({world,instanceId,revision,wires:wires??await readFile(new URL('./fixtures/'+wiresFile,import.meta.url),'utf8')})));
const archives=new Map(records.map(record=>[record.world,readInstanceState(record.wires)]));
const semantic=objects=>objects.map(object=>{const copy=structuredClone(object);if(copy.metadata){delete copy.metadata.inputs;if(!Object.keys(copy.metadata).length)delete copy.metadata;}return copy;});
const projection=(world,state)=>world==='art.draw'?toNativeDrawingState(state):world==='time.calendar'?toNativeCalendarState(state):state;
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

// The Avatar now keeps a w.face SOP instance; an archive of the retired native face is refused, never adopted.
test('a published archive of the retired native avatar face is refused and stays readable',async()=>{
 const record=records.find(row=>row.world==='ui.avatar'),original=JSON.stringify(record),target=session();
 await assert.rejects(restoreNativeInstances(target,[record]));
 assert.deepEqual(target.isession.state,{});
 exact(readInstanceState(record.wires),archives.get('ui.avatar'),'the original wire archive remains losslessly readable');
 assert.equal(JSON.stringify(record),original);
});
for(const record of records.filter(row=>row.world!=='ui.avatar'))test(`published ${record.world} archive remains lossless while its old knowledge pin is not silently adopted`,async()=>{
 const archive=archives.get(record.world),original=JSON.stringify(record),target=session();
 assert.notEqual(archive.metadata.knowledge.version,CATALOG_PIN.commit);
 // Verify the historical facts against a fresh adapter without presenting the old archive as a current work file.
 const state=structuredClone(archive.projection),area=Object.values(NATIVE_AREAS).find(area=>area.world===record.world);
 const options={state,instanceId:record.instanceId,loader:target.engine.loader};
 const host=await (area.legacyHost?area.legacyHost(options):createAreaHost(area,options));
 exact(projection(record.world,state),archive.projection,'all historical renderer fields and native history remain representable');
 exact(nativeObservationObjects(host.observe()),semantic(archive.objects),'all historical semantic values and references remain exact');
 await assert.rejects(restoreNativeInstances(target,[record]),/instance-knowledge-migration-required/);
 assert.deepEqual(target.isession.state,{});assert.equal(target.nativeInstanceIds,undefined);
 exact(readInstanceState(record.wires),archive,'the original wire archive remains losslessly readable');
 assert.equal(JSON.stringify(record),original,'the original archive and declared old pin are never rewritten');
});

test('incompatible historical archive batch is refused before adopting any instance',async()=>{
 const target=session(),original=JSON.stringify(records),sentinel={keep:true};target.isession.state={sentinel};target.nativeInstanceIds={sentinel:'original'};
 await assert.rejects(restoreNativeInstances(target,records),/instance-knowledge-migration-required/);
 assert.deepEqual(target.isession.state,{sentinel});assert.deepEqual(target.nativeInstanceIds,{sentinel:'original'});
 assert.equal(target.nativeInstanceRevisions,undefined);assert.equal(target.instanceWorlds,undefined);
 assert.equal(JSON.stringify(records),original);
});
