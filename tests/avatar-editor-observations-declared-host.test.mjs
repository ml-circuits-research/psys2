// The Avatar editor's controls that need SOP pieces (specs/ui-parity.md, Avatar): compose by character kind picks one
// preset, the presets' kinds, the features of each part and the feature command, the colour scope and fitting colours,
// the words for a part and the optional slots. All are rules of worlds/ui.avatar/act-rules.sop over the catalog
// (k.faces); the expected values here are read from the same catalog, not written per part.
import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {createSopArea,initialSopAreaState,projectSopArea} from '../worlds/sop-area.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import NATIVE_INTERFACE from '../worlds/ui.avatar/native-interface-source.mjs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';

const K=PINNED_CATALOG;
const available=existsSync(new URL('k.faces/shards/words.sop',K));
const skip=available?false:'knowledge with k.faces unavailable';
const options={world:'ui.avatar',interfaceSource:NATIVE_INTERFACE,
 loader:{readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8').catch(()=>null)},
 readCatalog:path=>readFile(new URL(path,K),'utf8')};
const value=raw=>raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;
const facts=(shard,type)=>parse(readFileSync(new URL('k.faces/shards/'+shard,K),'utf8')).filter(f=>f.type===type);
const list=v=>v===undefined?[]:[].concat(v);

async function avatar(){
 const state=await initialSopAreaState(options);
 const host=await createSopArea({...options,state,instanceId:'avatar-editor-'+Math.random().toString(16).slice(2)});
 let n=0;
 const run=sop=>host.invoke(sop,toolInvocationContext('editor-'+(n++),host.observe().version));
 const view=()=>projectSopArea('ui.avatar',state);
 const face=()=>view().objects.find(o=>o.id==='face');
 const variant=slot=>view().objects.find(o=>o.id===slot)?.variant;
 return {run,view,face,variant};
}
const plainPresets=()=>facts('presets.sop','k.faces.preset').filter(f=>value(f.attrs.style[0])==='plain');

test('compose by character kind keeps a base of that kind, else composes the first preset of the kind',{skip},async()=>{
 const {run,face}=await avatar();
 assert.equal(face().base,'girl');
 // The girl is human: composing a human keeps her.
 assert.notEqual(run('@c avatar.face.compose characterKind="human"').status,'refused');
 assert.equal(face().base,'girl');
 for(const kind of ['robot','human']){
  const first=plainPresets().find(f=>value(f.attrs.kind[0])===kind);
  const r=run(`@c avatar.face.compose characterKind="${kind}"`);
  assert.equal(r.status,'changed',r.reason);
  assert.equal(face().base,value(first.attrs.name[0]));
  assert.equal(face().characterKind,kind);
 }
 // A named base wins over the kind.
 assert.equal(run('@c avatar.face.compose base="robot" characterKind="human"').status,'changed');
 assert.equal(face().base,'robot');
});

test('each preset of the face style is observed with its kind, so the bases follow the chosen kind',{skip},async()=>{
 const {view}=await avatar();
 const kinds=view().inputs.preset;
 for(const preset of plainPresets())assert.equal(kinds[value(preset.attrs.name[0])],value(preset.attrs.kind[0]));
});

test('a part shows the features its slot offers and has; the feature command picks a variant with the feature',{skip},async()=>{
 const {run,view,variant}=await avatar();
 const variants=facts('plain-mouth.sop','k.faces.variant');
 const mouth=view().inputs.mouth,shown=variants.find(v=>value(v.attrs.name[0])===variant('mouth'));
 const feels=[...new Set(variants.flatMap(v=>(v.attrs.feel??[]).map(value)))];
 assert.deepEqual(list(mouth['features.feel']).sort(),feels.sort());
 assert.deepEqual(list(mouth['feature.feel']).sort(),(shown.attrs.feel??[]).map(value).sort());
 // A feel the shown mouth lacks: the first mouth with it.
 const goal=feels.find(feel=>!(shown.attrs.feel??[]).map(value).includes(feel));
 const r=run(`@c avatar.part.feature id="mouth" property="feel" value="${goal}"`);
 assert.equal(r.status,'changed',r.reason);
 const now=variants.find(v=>value(v.attrs.name[0])===variant('mouth'));
 assert.ok((now.attrs.feel??[]).map(value).includes(goal),variant('mouth'));
 assert.equal(value(now.attrs.name[0]),value(variants.find(v=>(v.attrs.feel??[]).map(value).includes(goal)).attrs.name[0]));
 // The mouth has it now: nothing changes.
 assert.notEqual(run(`@c avatar.part.feature id="mouth" property="feel" value="${goal}"`).status,'changed');
 // A feature no variant of the slot has is refused.
 const r2=run('@c avatar.part.feature id="mouth" property="feel" value="curly"');
 assert.equal(r2.status,'refused');
 assert.match(String(r2.reason),/unavailable-feature-combination/);
 // An absent part is added with a variant that has the feature.
 assert.equal(run('@c avatar.parts.remove ids="hair_front"').status,'changed');
 assert.equal(variant('hair_front'),undefined);
 assert.equal(run('@c avatar.part.feature id="hair_front" property="feel" value="curly"').status,'changed');
 const hair=facts('plain-hair-front.sop','k.faces.variant').find(v=>value(v.attrs.name[0])===variant('hair_front'));
 assert.ok((hair.attrs.feel??[]).map(value).includes('curly'));
});

test('a tinted part names its face colour, the parts that colour affects and the colours of its tint',{skip},async()=>{
 const {run,view}=await avatar();
 const inputs=view().inputs;
 const hair=inputs.hair_front;
 assert.equal(hair.colourRole,'hair');
 // The girl's back hair (pigtails) takes the hair colour too.
 assert.ok(list(hair.colourScope).includes('hair_front')&&list(hair.colourScope).includes('hair_back'),JSON.stringify(hair.colourScope));
 assert.deepEqual(list(hair.colours).sort(),facts('colours.sop','k.faces.colour').filter(c=>c.attrs.of[0]==='hair').map(c=>value(c.attrs.name[0])).sort());
 // Every part in a tinted scope shows a shape of that colour: a hair colour change reaches each of them.
 for(const id of list(hair.colourScope))assert.ok(view().objects.some(o=>o.id===id),id);
 const colour=list(hair.colours).find(c=>c!==inputs.face.hair_colour);
 assert.equal(run(`@c avatar.part.change ids="hair_front" colour="${colour}"`).status,'changed');
 assert.equal(view().inputs.face.hair_colour,colour);
 // An untinted part affects only itself.
 for(const [id,own] of Object.entries(inputs))if(own.colourScope!==undefined&&own.colourRole===undefined)assert.deepEqual(list(own.colourScope),[id]);
});

test('the words for a part and its optional slot come from the catalog',{skip},async()=>{
 const {view}=await avatar();
 const inputs=view().inputs;
 const words=facts('words.sop','core.word').filter(w=>w.attrs.of?.[0]==='k.faces.slot.name');
 for(const word of words){
  const slot=word.attrs.means[0];
  assert.deepEqual(list(inputs[slot]?.word).sort(),word.attrs.text.map(value).sort(),slot);
 }
 for(const slot of facts('slots.sop','k.faces.slot').filter(s=>value(s.attrs.style[0])==='plain')){
  const name=slot.attrs.name[0];
  assert.equal(inputs[name]?.optional,slot.attrs.optional?.[0]==='true'?true:undefined,name);
 }
});
