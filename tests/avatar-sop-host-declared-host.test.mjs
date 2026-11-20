// The avatar's native commands run through the generic SOP world host: each command compiles to std.acts
// calls by worlds/ui.avatar/act-rules.sop and face-rules.sop; no avatar-specific handler exists in JavaScript.
import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {World,str} from '../src/vendor/sopworld/sopworld.mjs';
import {readNativeToolInterface} from '../worlds/native-tool-interface.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {createSopWorldHost,initialSopWorldState,worldOf} from '../worlds/sop-world-host.mjs';
import NATIVE_INTERFACE from '../worlds/ui.avatar/native-interface-source.mjs';

const K=PINNED_CATALOG,W=new URL('../worlds/',import.meta.url);
const read=path=>readFileSync(new URL(path,K),'utf8'),local=path=>readFileSync(new URL(path,W),'utf8');
const available=existsSync(new URL('w.face/schema.sop',K))&&read('w.face/schema.sop').includes('w.face.slot');
const value=v=>v?.startsWith('"')?str(v):v;

function baseWorld(){
 const library=Object.fromEntries(readdirSync(K).filter(d=>existsSync(new URL(d+'/schema.sop',K))).map(d=>[d,read(d+'/schema.sop')]));
 const world=new World({library});
 const must=(r,what)=>assert.equal(r.ok,true,what+' '+JSON.stringify(r.violations?.[0]));
 must(world.load('@acts core.use world=std.acts\n@face core.use world=w.face\n@faces core.use world=k.faces\n@parts core.use world=k.parts\n@objects core.use world=k.objects'),'schemas');
 for(const file of readdirSync(new URL('k.faces/shards/',K)).filter(f=>f.startsWith('plain-')||f.startsWith('figure-')||['slots.sop','colours.sop','presets.sop'].includes(f)))
  must(world.tell(read('k.faces/shards/'+file),{factsOnly:true}),file);
 for(const file of ['art.draw/look-projection.sop','ui.avatar/view-projection.sop','app.project/act-schema.sop','art.draw/look-rules.sop','art.draw/person-rules.sop','ui.avatar/act-rules.sop'])must(world.load(local(file)),file);
 return world;
}
// Interface choices read from the same SOP world (the facts the interface enumerates).
function realize(world){
 const all=(type,key,filter=()=>true)=>[...new Set(world.ofType(type).filter(filter).map(f=>value(f.attrs[key]?.[0])).filter(Boolean))];
 const plain=f=>value(f.attrs.style?.[0])==='plain';
 return readNativeToolInterface(NATIVE_INTERFACE).realize({
  'avatar.characterKinds':all('k.faces.preset','kind',plain),'avatar.presets':all('k.faces.preset','name',plain),
  'avatar.expressions':all('k.faces.expression','name',plain),'avatar.visibleSlots':all('w.face.slot','slot'),
  'avatar.minScale':0.6,'avatar.maxScale':1.5,'avatar.variants':all('k.faces.variant','name',plain),
  'avatar.colours':all('k.faces.colour','name'),'avatar.features':['length'],'avatar.featureValues':['long'],
  'avatar.sizes':all('ui.avatar.size','grade'),'avatar.directions':all('ui.avatar.step','place'),
  'avatar.resizeRelated':[],'avatar.sizeRelated':[],
 });
}
function session(){
 const base=baseWorld(),kinds=base.ofType('std.schema.kind').map(k=>value(k.attrs.of[0])).filter(k=>k.startsWith('w.face.'));
 const state=initialSopWorldState(base,{kinds,make:[{kind:'w.face.face',name:'Avatar',style:'plain'}]});
 const host=createSopWorldHost({base,kinds,state,instanceId:'avatar-test',scope:'ui.avatar',toolInterface:realize(base)});
 let n=0;
 const run=sop=>host.invoke(sop,toolInvocationContext('call-'+(++n),host.observe().version));
 return {base,state,host,run,ids:()=>host.observe().objects.map(o=>o.id).sort(),shown:()=>Object.fromEntries(worldOf(base,state).ofType('ui.avatar.shown').map(s=>[s.attrs.slot[0],value(s.attrs.variant[0])]))};
}

test('a preset and part edits run as declared act rules over the w.face instance',{skip:available?false:'knowledge with w.face.slot unavailable'},()=>{
 const s=session();
 assert.equal(s.run('@c avatar.face.preset preset="child"').status,'changed');
 assert.ok(s.ids().includes('head')&&s.ids().includes('mouth'),JSON.stringify(s.ids()));
 const child=s.shown();
 assert.equal(s.run('@c avatar.part.add id="hat" variant="cap"').status,'changed');
 assert.equal(s.shown().hat,'cap');
 assert.notEqual(s.run('@c avatar.part.add id="hat" variant="cap"').status,'changed','one hat per face');
 {const r=s.run(`@c avatar.part.change ids="mouth" variant="big smile"`);assert.equal(r.status,"changed",r.reason);}
 assert.equal(s.shown().mouth,'big smile');
 assert.equal(s.run('@c avatar.part.move ids="hat" place="up"').status,'changed');
 const hat=worldOf(s.base,s.state).ofType('w.face.hat')[0];
 assert.equal(hat.attrs.y[0],'-3');
 assert.equal(s.run('@c avatar.face.expression expression="happy"').status,'changed');
 assert.equal(s.shown().eyebrows,'arched');
 assert.equal(s.run('@c avatar.parts.remove ids="hat"').status,'changed');
 assert.equal(s.shown().hat,undefined);
 // Undo and redo are the application's journal (tests/native-clear-editors.test.mjs).
 assert.equal(s.shown().head,child.head);
});

test('a tinted part colour sets the face colour its tint names; size grades come from the SOP table',{skip:available?false:'knowledge with w.face.slot unavailable'},()=>{
 const s=session();
 s.run('@c avatar.face.preset preset="child"');
 assert.equal(s.run('@c avatar.part.change ids="hair_front" colour="blond"').status,'changed');
 assert.equal(value(worldOf(s.base,s.state).ofType('w.face.face')[0].attrs.hair_colour[0]),'blond');
 assert.equal(s.run('@c avatar.part.change ids="mouth" size="big"').status,'changed');
 assert.equal(worldOf(s.base,s.state).ofType('w.face.mouth')[0].attrs.size[0],'1.2');
});
