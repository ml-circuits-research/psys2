// A part's length on the Avatar tab along the catalog's declared scale (k.faces.feature key=length: the k.values scale
// short < medium < long), for a named step ("give her long hair") and a comparative ("make her hair shorter": one step
// from the group's length), with refusal past either end of the scale. Hair is one group (w.face.slot group=hair: the
// back and the front hair). The rules are worlds/ui.avatar/act-rules.sop; the comparative reaches the tab as the
// relative step through the declared ordinal projection (worlds/app.project/comparative-projection.sop).
import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSopArea,initialSopAreaState} from '../worlds/sop-area.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import NATIVE_INTERFACE from '../worlds/ui.avatar/native-interface-source.mjs';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
import {comparativeSteps} from '../src/dialog/comparative-projection.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {emptyAvatarState,createAvatarArea} from '../worlds/ui.avatar/sop-avatar.mjs';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';

const K=PINNED_CATALOG;
const available=existsSync(new URL('k.faces/shards/features.sop',K));
const skip=available?false:'knowledge with k.faces.feature unavailable';
const options={world:'ui.avatar',interfaceSource:NATIVE_INTERFACE,
 loader:{readFile:(world,file)=>readFile(new URL('../worlds/'+world+'/'+file,import.meta.url),'utf8').catch(()=>null)},
 readCatalog:path=>readFile(new URL(path,K),'utf8')};

async function avatar(){
 const state=await initialSopAreaState(options);
 const host=await createSopArea({...options,state,instanceId:'avatar-feature-scale-'+Math.random().toString(16).slice(2)});
 host.invoke('@c avatar.face.preset preset=\"girl\"',toolInvocationContext('girl-start',host.observe().version));
 let n=0;
 const variant=slot=>host.observe().objects.find(o=>o.id===slot)?.inputs.find(f=>f.key==='variant')?.values[0];
 const length=(ids,value)=>host.invoke(`@c avatar.part.change ids="${ids}" length="${value}"`,toolInvocationContext('length-'+(n++),host.observe().version));
 return {host,variant,length};
}
const quoted=name=>JSON.stringify(name);

test('a comparative moves the hair one step along the declared scale, with its group, and stops at the ends',{skip},async()=>{
 const {variant,length}=await avatar();
 // The girl: pigtails (back hair, medium) and a fringe (front hair, short). Her hair is as long as its longest part.
 assert.equal(variant('hair_back'),quoted('pigtails'));
 assert.equal(variant('hair_front'),quoted('fringe'));
 // Shorter: the back hair has no short variant in its style and its slot is optional, so it leaves the face.
 assert.equal(length('hair_front','less').status,'changed');
 assert.equal(variant('hair_back'),undefined);
 assert.equal(variant('hair_front'),quoted('fringe'));
 // Shorter again: short is the first step of the scale.
 const end=length('hair_front','less');
 assert.equal(end.status,'refused');
 assert.match(String(end.reason),/feature-scale-end/);
 // Longer twice: medium, then long, keeping the straight feel of the fringe.
 assert.equal(length('hair_front','more').status,'changed');
 assert.equal(variant('hair_front'),quoted('centre parting'));
 assert.equal(length('hair_front','more').status,'changed');
 assert.equal(variant('hair_front'),quoted('long sides'));
 assert.equal(length('hair_front','more').status,'refused');
});

test('a named step sets the group to that length; a name the scale does not have is refused',{skip},async()=>{
 const {variant,length}=await avatar();
 // Long: the longest part (the back hair, medium) takes a long variant of its slot.
 assert.equal(length('hair_front','long').status,'changed');
 const back=JSON.parse(variant('hair_back'));
 const knowledge=readFileSync(new URL('k.faces/shards/plain-hair-back.sop',K),'utf8');
 assert.match(knowledge,new RegExp(`name=${back.includes(' ')?quoted(back):back} style=plain length=long`));
 // Short: every part longer than short takes a short variant or, in an optional slot without one, leaves.
 assert.equal(length('hair_back','short').status,'changed');
 assert.equal(variant('hair_back'),undefined);
 assert.equal(variant('hair_front'),quoted('fringe'));
 assert.notEqual(length('hair_front','huge').status,'changed');
});

const deployment=JSON.parse(readFileSync(new URL('../docs/webchat/models/sop-bert/deployment.json',import.meta.url),'utf8'));
const bindingsText=readFileSync(new URL('../docs/webchat/'+deployment.artifactBase+deployment.bindingsArtifact.path,import.meta.url),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');
const bound=bindings.properties.some(p=>p.area==='avatar'&&p.key==='part.length'&&p.hostBinding);

test('the reader labels of "make her hair shorter" and "give her long hair" change the hair through the app route',{skip:skip||(bound?false:'deployed bindings without part.length')},async()=>{
 const state={'ui.avatar':emptyAvatarState(),'ui.shell':{activeTab:'avatar'}};
 // The default figure is the robot; this test is about the girl's hair.
 {const area=await createAvatarArea({state:state['ui.avatar']});area.invoke('@c avatar.face.preset preset="girl"',toolInvocationContext('girl-start',area.observe().version));}
 let read;
 const session={isession:{state},newEngineJournal:[],engine:{onWorldActivity:()=>{},requestReader:{bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}})}}};
 const hair={type:'part',mode:'existing',determiner:'definite',fill:'description',kind:'hair',kind_span:'hair'};
 const say=async(text,constraint)=>{
  const raw={format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area:'avatar',model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},requestCount:1,
   requests:[{span:text,trigger:text.split(' ')[0],act:'change',mood:'do',target:hair,constraints:[{key:'part.length',phase:'result',polarity:'positive',character:'requirement',...constraint}]}],
   ranges:[],coverage:{complete:true,truncated:false}};
  const out=bridgeRawStructure(raw,{bindings,bindingSha256,comparatives:comparativeSteps()});
  assert.deepEqual(out.diagnostics,[]);
  read=out.decoded.candidates[0];
  return {reply:await routeNewEngine(session,text,{view:'avatar'}),wires:parse(read.wires)};
 };
 const variant=slot=>(state['ui.avatar'].sop.match(new RegExp('w\\.face\\.'+slot+' [^\\n]*variant=("[^"]*"|\\S+)'))??[])[1];
 const shorter=await say('make her hair shorter',{operator:'delta',step:'less',value_span:'shorter'});
 // The comparative is the relative step of the ordinal concept, not a factor.
 const constraint=shorter.wires.find(w=>w.type==='std.request.constraint');
 assert.deepEqual([constraint.attrs.concept[0],constraint.attrs.operator[0],constraint.attrs.value[0]],['k.faces.variant.length','degree','less']);
 assert.equal(shorter.reply.statuses[0],'supported',shorter.reply.text);
 assert.equal(variant('hair_back'),undefined);
 const again=await say('make her hair shorter',{operator:'delta',step:'less',value_span:'shorter'});
 assert.equal(again.reply.statuses[0],'unsupported');
 const long=await say('give her long hair',{operator:'degree',value:'long',value_span:'long'});
 assert.equal(long.reply.statuses[0],'supported',long.reply.text);
 assert.equal(variant('hair_front'),quoted('long sides'));
});
