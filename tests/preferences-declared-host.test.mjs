// Standing preferences (worlds/app.project/preference-rules.sop) on the declared hosts: the Avatar figure (declared
// default the friendly robot; described, refined, reset) and the Diagram's link style, palette and object IDs. The
// expected presets and parts are read from the pinned catalog, not written per case.
import {PINNED_CATALOG} from './fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createSopArea,initialSopAreaState,projectSopArea} from '../worlds/sop-area.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import AVATAR_INTERFACE from '../worlds/ui.avatar/native-interface-source.mjs';
import DIAGRAM_INTERFACE from '../worlds/diagram.sketch/native-interface-source.mjs';
import {chartToolInterface} from '../worlds/data.charts/declared-host.mjs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';

const K=PINNED_CATALOG;
const skip=existsSync(new URL('w.preferences/schema.sop',K))?false:'catalog without w.preferences';
const loader={readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8').catch(()=>null)};
const readCatalog=path=>readFile(new URL(path,K),'utf8');
const val=raw=>raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;
const prefs=state=>parse(state.sop).filter(f=>f.type==='w.preferences.preference').map(f=>Object.fromEntries(Object.entries(f.attrs).map(([k,v])=>[k,val(v[0])])));

async function area(world,interfaceSource,extra={}){
 const options={world,interfaceSource,loader,readCatalog,...extra};
 const state=await initialSopAreaState(options);
 const host=await createSopArea({...options,state,instanceId:world+'-prefs-'+Math.random().toString(16).slice(2)});
 return {state,host,view:()=>projectSopArea(world,state)};
}
const sopCall=(op,args)=>['@c '+op,...Object.entries(args).flatMap(([k,v])=>[].concat(v).map(x=>k+'='+JSON.stringify(x)))].join(' ');

async function avatar(){
 const a=await area('ui.avatar',AVATAR_INTERFACE);
 const say=(op,args={})=>a.host.invoke(Object.keys(args).length?sopCall(op,args):'@c '+op,toolInvocationContext('s'+Math.random(),a.host.observe().version));
 const face=()=>a.view().objects.find(o=>o.id==='face');
 const slot=id=>a.view().objects.find(o=>o.id===id);
 const fig=()=>a.view().inputs.face;
 return {...a,say,face,slot,fig};
}

test('the avatar starts as the declared default figure, the friendly robot, held in the instance as a default',{skip},async()=>{
 const a=await avatar();
 assert.equal(a.face().base,'robot');
 assert.equal(a.slot('head').variant,'dome');
 assert.equal(a.slot('mouth').variant,'light smile');
 const held=prefs(a.state).filter(p=>p.key==='avatar.figure');
 assert.deepEqual(held.map(p=>[p.field,p.value,p.source,p.at]).sort(),[['kind','robot','default','0'],['preset','robot','default','0']]);
 assert.equal(a.fig()['figure.preset'],'robot');
});

test('an old man with glasses: a kind of person, an age and a trait compose through the people model; later statements refine',{skip},async()=>{
 const a=await avatar();
 const r=a.say('avatar.figure.describe',{person:'man',age:'old',traits:['spectacled'],about:'an old man with glasses'});
 assert.equal(r.status,'changed',JSON.stringify(r));
 assert.equal(a.face().base,'old man');
 assert.ok(a.slot('glasses'),'glasses made by the trait');
 const stated=prefs(a.state).filter(p=>p.source==='stated');
 assert.ok(stated.some(p=>p.field==='age'&&p.value==='old'&&p.about==='an old man with glasses'));
 assert.ok(stated.some(p=>p.field==='kind'&&p.value==='human'));
 // Refine: younger keeps the sex and the glasses.
 a.say('avatar.figure.describe',{age:'younger'});
 assert.equal(a.face().base,'man');
 assert.ok(a.slot('glasses'),'the glasses stay');
 // No glasses: the slot is left empty, the trait taken back.
 a.say('avatar.figure.describe',{without:['glasses']});
 assert.equal(a.slot('glasses'),undefined);
 assert.ok(!prefs(a.state).some(p=>p.field==='trait'&&p.value==='spectacled'));
 // Back to default: the stated values go, the declared default is in force again.
 a.say('avatar.figure.default');
 assert.equal(a.face().base,'robot');
 assert.deepEqual(prefs(a.state).filter(p=>p.key==='avatar.figure').map(p=>p.source),['default','default']);
});

test('a named figure from the Composition control is stated too; a beard and short grey hair refine it; a blue robot',{skip},async()=>{
 const a=await avatar();
 a.say('avatar.face.preset',{preset:'girl'});
 assert.equal(a.face().base,'girl');
 assert.equal(a.fig()['figure.preset'],'girl');
 assert.equal(a.fig()['figure.age'],'child');
 a.say('avatar.figure.describe',{kind:'human',traits:['bearded','short-haired','grey-haired']});
 assert.ok(a.slot('beard'));
 assert.equal(a.slot('hair_front')?.variant,'short');
 assert.equal(a.slot('hair_back'),undefined,'short hair takes the back hair away');
 a.say('avatar.figure.describe',{without:['beard']});
 assert.equal(a.slot('beard'),undefined);
 a.say('avatar.figure.describe',{kind:'robot',colour:'blue'});
 assert.equal(a.face().base,'robot');
 assert.equal(a.view().inputs.face.skin,'blue');
 a.say('avatar.figure.describe',{preset:'robot-classic'});
 assert.equal(a.slot('mouth').variant,'grille');
});

test('ids: a stated standing preference keeps object IDs on while the view says nothing; a reset takes it back',{skip},async()=>{
 const a=await avatar();
 assert.equal(a.view().inputs.face.ids,undefined);
 a.say('avatar.preference.state',{key:'ids',value:'always',about:'keep IDs on'});
 assert.equal(a.view().inputs.face.ids,'always');
 const p=prefs(a.state).find(x=>x.key==='ids');
 assert.deepEqual([p.scope,p.source,p.about],['app','stated','keep IDs on']);
 a.say('avatar.preference.reset',{key:'ids'});
 assert.equal(a.view().inputs.face.ids,undefined);
});

test('diagram: dashed lines and a pastel palette fill in what a diagram does not say; its own style wins; IDs stay on',{skip},async()=>{
 const a=await area('diagram.sketch',DIAGRAM_INTERFACE,{interfaceImports:{'data.charts':chartToolInterface}});
 const say=(op,args)=>a.host.invoke(sopCall(op,args),toolInvocationContext('d'+Math.random(),a.host.observe().version));
 for(const label of ['A','B','C'])say('diagram.node.make',{kind:'rectangle',label});
 say('diagram.link.make',{from:'n1',to:'n2'});say('diagram.link.make',{from:'n2',to:'n3',style:'solid'});
 const dashes=()=>[...a.view().svg.matchAll(/stroke-dasharray="([^"]+)"/g)].length;
 assert.equal(dashes(),0);
 say('diagram.preference.state',{key:'link.style',value:'dashed',about:'always use dashed lines'});
 assert.equal(dashes(),1,'the unstyled link is dashed; the solid one stays solid');
 say('diagram.link.make',{from:'n1',to:'n3'});
 assert.equal(dashes(),2,'a new link follows the preference');
 const before=a.view().svg;
 say('diagram.preference.state',{key:'palette',value:'pastel'});
 assert.notEqual(a.view().svg,before);
 assert.match(a.view().svg,/#ece6f7/i,'the pastel theme fill');
 say('diagram.preference.state',{key:'ids',value:'always'});
 assert.match(a.view().svg,/>n1</);
 const held=prefs(a.state);
 assert.deepEqual(held.map(p=>[p.key,p.value,p.scope,p.at]),[['link.style','dashed','kind','1'],['palette','pastel','app','2'],['ids','always','app','3']]);
 say('diagram.preference.reset',{key:'link.style'});
 assert.equal(dashes(),0);
 // A declared key without an effect yet is still kept.
 say('diagram.preference.state',{key:'placement.side',value:'right'});
 assert.ok(prefs(a.state).some(p=>p.key==='placement.side'));
});
