// Degree words compile into tool values through declared degree scales (std.capability.degree) and the value
// the tool itself would choose (std.capability.base: the area's own default, measured by a preview of the call).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const kindOf=lemma=>bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma)?.canonical;
const objects=state=>parse(state.sop).filter(w=>w.type==='w.drawing.object').map(w=>{
 const v=k=>{const raw=w.attrs[k]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
 return {id:v('code'),kind:v('drawing'),size:Number(v('size'))};
});
/** A reading as the reader projects it: one target, optional result conditions (on its size unless named). */
function reading(text,act,lemma,conditions=[]) {
 const wires=[`@source std.request.source text=${JSON.stringify(text)}`,`@r std.request act=${act} mood=do source=$source`,
  `@t std.request.target request=$r mode=${act==='make'?'new':'existing'} kind=${kindOf(lemma)}${act==='make'?'':' determiner=definite'}`];
 conditions.forEach((condition,n)=>wires.push(`@c${n} std.request.constraint request=$r target=$t ${/concept=/.test(condition)?'':'concept=size '}${condition} polarity=positive character=requirement`));
 return {request:'r',wires:wires.join('\n')};
}
function session() {
 let read;
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 return {s,draw:args=>performGesture(s,{view:'draw',operation:'drawing.object.make',args}),
  say:async(text,...rest)=>{read=reading(text,...rest);return routeNewEngine(s,text,{view:'draw'});},
  objects:()=>objects(s.isession.state['art.draw'])};
}
const supported=reply=>assert.equal(reply.statuses[0],'supported',reply.trace?.error??reply.trace?.reason??reply.text);

test('"draw a small sun" < "draw a sun" < "draw a big sun": the degree scales the size the area would choose',async()=>{
 const sizes={};
 for(const [word,conditions] of [['small',['operator=degree value=small']],['plain',[]],['big',['operator=degree value=big']]]){
  const {say,objects}=session();
  const reply=await say(word==='plain'?'Draw a sun.':`Draw a ${word} sun.`,'make','sun',conditions);
  supported(reply);
  assert.doesNotMatch(reply.text,/could not apply/,reply.text);
  const [sun]=objects();
  assert.equal(sun.kind,'sun');
  sizes[word]=sun.size;
 }
 assert.ok(sizes.small<sizes.plain&&sizes.plain<sizes.big,JSON.stringify(sizes));
});

test('"draw a big yellow sun": the degree and the colour both reach the tool, and the sun keeps its place in the sky',async()=>{
 const plain=session();supported(await plain.say('Draw a sun.','make','sun'));
 const {s,say,objects}=session();
 const reply=await say('Draw a big yellow sun.','make','sun',['operator=degree value=big','concept=colour operator=eq value="yellow"']);
 supported(reply);
 assert.equal(reply.text.includes('could not apply'),false,reply.text);
 const [sun]=objects();
 assert.ok(sun.size>plain.objects()[0].size,'bigger than the sun drawn without the word');
 const fact=parse(s.isession.state['art.draw'].sop).find(w=>w.type==='w.drawing.object');
 assert.ok(Number(fact.attrs.y[0])+sun.size/2<=350,'still in the sky');
 // Both conditions are covered, with the degree scale and the measured base as evidence.
 const result=parse(reply.trace.compiledSop)[0],support=result.attrs.support.map(str);
 assert.deepEqual(result.attrs.covered.map(str),['c0','c1']);
 assert.ok(support.some(id=>id.startsWith('_degree.value'))&&support.some(id=>id.startsWith('_base.value')),support.join(' '));
});

test('"make the house bigger" scales the size the house has now',async()=>{
 const {s,draw,say,objects}=session();
 await draw({kind:'house',x:600,y:500,size:100});
 const before=objects()[0].size;
 const reply=await say('Make the house bigger.','change','house',['operator=degree value=big']);
 supported(reply);
 const after=objects()[0].size;
 assert.ok(after>before,`${before} -> ${after}`);
 const again=await say('Make the house twice as big.','change','house',['operator=factor value=2 baseline=before anchor=size']);
 supported(again);
 assert.equal(objects()[0].size,after*2);
 assert.ok(s.isession.state['art.draw'].sop.includes('size='+after*2));
});
