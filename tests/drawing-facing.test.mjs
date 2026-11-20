// Facing on the Drawing tab (worlds/art.draw/render-projection.sop, act-rules.sop, native-interface.sop): a drawn thing
// faces the side its drawing faces (ui.draw.natural, right when undeclared), the other side when it is mirrored
// horizontally (w.drawing.object mirror, drawn by style-projection.sop about its centre). Asking for a side (facing on
// make, catalog make or change; toward: the side another object is on) sets that mirror; flipping is mirror=horizontal.
// Facing is observed on every object.
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
// Whether an object's own parts are drawn mirrored left to right: the pose of its slot (a scale(-1 ..) about a centre).
const groups=(svg,code)=>[...svg.matchAll(new RegExp('<g transform="([^"]*)" data-select="'+code+'">','g'))].map(m=>m[1]);
const mirrored=(svg,code)=>{const g=groups(svg,code).filter(t=>/scale\([\d.]+ [\d.]+\)/.test(t));assert.ok(g.length>0,code+' has parts');
 return g.every(t=>/scale\(-1 -?1\)/.test(t))?true:g.every(t=>!/scale\(-1 -?1\)/.test(t))?false:g;};

test('a thing made facing a side is mirrored when its drawing faces the other way',async()=>{
 const {state,run,input,view}=await area();
 changed(run('@c drawing.object.make kind="cat" x=200 y=400 size=150 facing="right"'));
 changed(run('@c drawing.object.make kind="dog" x=600 y=400 size=150 facing="left"'));
 changed(run('@c drawing.object.make kind="house" x=850 y=400 size=150'));
 assert.deepEqual(['o1','o2','o3'].map(id=>input(id,'facing')),['right','left','right'],'given, given (the dog looks left already), the default');
 assert.deepEqual(['o1','o2','o3'].map(id=>input(id,'mirror')),['horizontal',undefined,undefined],'facing is stored as the mirror only');
 assert.doesNotMatch(state.sop,/facing/);
 const {svg}=view();
 assert.equal(mirrored(svg,'o1'),true);assert.equal(mirrored(svg,'o2'),false);assert.equal(mirrored(svg,'o3'),false);
 assert.match(svg,/translate\(200 400\) scale\(-1 1\) translate\(-200 -400\)/,'mirrored about its own centre');
 assert.equal(run('@c drawing.object.make kind="cat" facing="up"').status,'refused','facing is a closed list');
});

test('a change turns a thing to a side or toward another, through the mirror; flipping is the mirror itself',async()=>{
 const {run,input,view}=await area();
 changed(run('@c drawing.object.make kind="dog" x=300 y=400 size=150'));
 changed(run('@c drawing.object.make kind="fish" x=700 y=400 size=100'));
 changed(run('@c drawing.object.change ids="o1" facing="right"'));
 assert.deepEqual([input('o1','facing'),input('o1','mirror')],['right','horizontal']);
 assert.equal(run('@c drawing.object.change ids="o1" facing="right"').status,'unchanged','it faces that side already');
 changed(run('@c drawing.object.change ids="o1" mirror="horizontal"'));
 assert.deepEqual([input('o1','facing'),input('o1','mirror')],['left','none'],'flipped back');
 changed(run('@c drawing.object.change ids="o2" mirror="vertical"'));
 changed(run('@c drawing.object.change ids="o2" facing="right"'));
 assert.deepEqual([input('o2','facing'),input('o2','mirror')],['right','both'],'a vertical mirror is kept');
 assert.equal(mirrored(view().svg,'o2'),true);
 changed(run('@c drawing.object.change ids="o2" toward="o1"'));
 assert.deepEqual([input('o2','facing'),input('o2','mirror')],['left','vertical'],'the dog is to the left of the fish');
 assert.equal(run('@c drawing.object.change ids="o1" toward="o2"').status,'changed');
 assert.equal(input('o1','facing'),'right');
 assert.equal(run('@c drawing.object.change ids="o1" toward="o9"').reason,'facing-target-not-on-page');
});

test('a new thing made toward another faces the side that thing is on, from where it goes',async()=>{
 const {run,input}=await area();
 changed(run('@c drawing.object.make kind="cat" x=200 y=400 size=150'));
 changed(run('@c drawing.object.make kind="bird" x=800 y=200 size=100 toward="o1"'));
 assert.deepEqual([input('o2','facing'),input('o2','mirror')],['left','horizontal'],'the bird drawing looks right');
 changed(run('@c drawing.object.make kind="dog" toward="o2"'));
 assert.equal(input('o3','facing'),input('o3','x')<800?'right':'left','the side of the bird from where the dog was placed');
});

test('the parts of a mirrored thing are observed and placed where they are drawn',async()=>{
 const {run,input}=await area();
 changed(run('@c drawing.object.make kind="house" x=500 y=400 size=200'));
 const plain=input('o1.2','x');
 changed(run('@c drawing.object.change ids="o1" facing="left"'));
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
 changed(await t.run('drawing.object.change',{ids:'o2',facing:'left'}));
 assert.equal(mirrored(await t.render(),'o2'),true);
});
