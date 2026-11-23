// Facing on the Drawing tab (worlds/art.draw/render-projection.sop, act-rules.sop, native-interface.sop): a drawn thing
// faces left or right (the facing given on make, catalog make or change, else its drawing's own: ui.draw.natural, right
// when undeclared); it is drawn mirrored about its own middle when its facing differs from its drawing's, parts, looks
// and side faces included, label and shadow not; flipping turns it to the other side; toward faces the side another
// object is on. Facing is observed on every object.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDrawingArea,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {catalogDir,peopleArea} from './fixtures/people-area.mjs';

async function area() {
 const state={sop:'',runtime:{view:{}}},host=await createDrawingArea({state});let n=0;
 const run=(command)=>host.invoke(command,toolInvocationContext('facing-'+(n++),host.observe().version));
 const object=(id)=>host.observe().objects.find(o=>o.id===id);
 const input=(id,key)=>{const v=object(id)?.inputs.find(i=>i.key===key)?.values;return v?.length===1?JSON.parse(v[0]):v?.map(x=>JSON.parse(x));};
 return {state,host,run,input,view:()=>projectDrawingArea(state)};
}
const changed=r=>assert.equal(r.status,'changed',r.reason??r.code);
// The horizontal scales an object's draws are drawn with (its parts' groups; text and shadows have one scale).
const scales=(svg,code)=>[...svg.matchAll(new RegExp('<g transform="[^"]*scale\\((-?[\\d.]+) [\\d.]+\\)[^"]*" data-select="'+code+'">','g'))].map(m=>Number(m[1]));
const mirrored=(svg,code)=>{const s=scales(svg,code);assert.ok(s.length>0,code+' has scaled parts');return s.every(v=>v<0)?true:s.every(v=>v>0)?false:s;};

test('a thing faces the side it was made facing, mirrored when its drawing faces the other way',async()=>{
 const {run,input,view}=await area();
 changed(run('@c drawing.object.make kind="cat" x=200 y=400 size=150 facing="right" label="Tom"'));
 changed(run('@c drawing.object.make kind="dog" x=600 y=400 size=150'));
 changed(run('@c drawing.object.make kind="house" x=850 y=400 size=150'));
 assert.deepEqual(['o1','o2','o3'].map(id=>input(id,'facing')),['right','left','right'],'given, the drawing\'s own (the dog looks left), the default');
 const {svg}=view();
 assert.equal(mirrored(svg,'o1'),true,'the cat drawing looks left: facing right mirrors it');
 assert.equal(mirrored(svg,'o2'),false);assert.equal(mirrored(svg,'o3'),false);
 assert.match(svg,/translate\(200 [\d.]+\) scale\(-1\.5 1\.5\) translate\(-50 -50\)/,'mirrored about its own middle (x=200)');
 assert.match(svg,/<g transform="translate\(0 0\) scale\(1\) translate\(0 0\)" data-select="o1"><text[^>]*>Tom</,'its label is not mirrored');
 assert.equal(run('@c drawing.object.make kind="cat" facing="up"').status,'refused','facing is a closed list');
});

test('flipping turns a thing the other way, and back; a change turns it to a side or toward another thing',async()=>{
 const {run,input,view}=await area();
 changed(run('@c drawing.object.make kind="dog" x=300 y=400 size=150'));
 changed(run('@c drawing.object.make kind="fish" x=700 y=400 size=100'));
 changed(run('@c drawing.object.flip ids="o1"'));
 assert.equal(input('o1','facing'),'right');assert.equal(mirrored(view().svg,'o1'),true);
 changed(run('@c drawing.object.flip ids="o1" ids="o2"'));
 assert.deepEqual([input('o1','facing'),input('o2','facing')],['left','right']);
 assert.equal(mirrored(view().svg,'o1'),false);assert.equal(mirrored(view().svg,'o2'),true);
 changed(run('@c drawing.object.change ids="o2" facing="left"'));
 assert.equal(input('o2','facing'),'left');assert.equal(mirrored(view().svg,'o2'),false);
 changed(run('@c drawing.object.change ids="o1" toward="o2"'));
 assert.equal(input('o1','facing'),'right','the fish is to the right of the dog');
 assert.equal(run('@c drawing.object.change ids="o2" toward="o1"').status,'unchanged','the fish already faces the dog');
 assert.equal(input('o2','facing'),'left');
 assert.equal(run('@c drawing.object.change ids="o1" toward="o9"').reason,'facing-target-not-on-page');
});

test('a new thing made toward another faces the side that thing is on, from where it goes',async()=>{
 const {run,input}=await area();
 changed(run('@c drawing.object.make kind="cat" x=200 y=400 size=150'));
 changed(run('@c drawing.object.make kind="bird" x=800 y=200 size=100 toward="o1"'));
 assert.equal(input('o2','facing'),'left');
 changed(run('@c drawing.object.make kind="dog" toward="o2"'));
 const placed=input('o3','x');
 assert.equal(input('o3','facing'),placed<800?'right':'left','the side of the bird from where the dog was placed');
});

test('the parts of a mirrored thing are observed and placed where they are drawn',async()=>{
 const {run,input}=await area();
 changed(run('@c drawing.object.make kind="house" x=500 y=400 size=200'));
 const plain=input('o1.2','x');
 changed(run('@c drawing.object.flip ids="o1"'));
 assert.equal(Math.round(input('o1.2','x')),Math.round(1000-plain),'a part left of the middle is drawn right of it');
 changed(run('@c drawing.part.place id="o1" index=2 x=560 y=300'));
 assert.deepEqual([input('o1.2','x'),input('o1.2','y')],[560,300],'a part moves to the page place asked, mirrored or not');
});

test('a person is mirrored whole: face and figure; a catalog drawing takes a facing too',{skip:catalogDir?false:'the pinned catalog is not available'},async()=>{
 const t=await peopleArea('art.draw');
 changed(await t.run('drawing.catalog.make',{name:'girl',facing:'left'}));
 changed(await t.run('drawing.catalog.make',{name:'boy'}));
 assert.deepEqual(['o1','o2'].map(id=>t.input(t.objects().find(o=>o.id===id),'facing')),['left','right']);
 const svg=await t.render();
 assert.equal(mirrored(svg,'o1'),true,'every part of the girl, her looks included, is mirrored');
 assert.equal(mirrored(svg,'o2'),false);
 changed(await t.run('drawing.object.flip',{ids:'o2'}));
 assert.equal(mirrored(await t.render(),'o2'),true);
});
