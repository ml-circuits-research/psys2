// Quantities and coordinated things in one make request, end to end through the app route (routeNewEngine) on the
// real Drawing and Diagram areas: the reader's raw readings (as the deployed reader gives them for these sentences)
// are bridged by the real structural bridge; everything after is the application: the coordination split
// (coordination-split.mjs: coordinators from w.lang.en), the vague amounts (k.expect.amount) and plural lemmas
// (quantity-projection.mjs), the repeatable family (std.capability.repeat) and ONE placement problem for all the
// objects made (default-placement.mjs solveGroupPlacement; the library's std.placement general path for a relation).
// The checks are geometric: how many of each, no overlaps, regions and relations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
import {comparativeSteps} from '../src/dialog/comparative-projection.mjs';
import {referenceProjection} from '../src/dialog/reference-projection.mjs';
import {readReaderSource} from '../src/dialog/reader-source.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {completeBindings} from '../src/dialog/declared-bindings.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {emptyDiagramState} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindingsText=readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');
const catalogRoot=new URL('catalog/',webchat).pathname,catalogCommit=readdirSync(catalogRoot).find(name=>/^[0-9a-f]{40}$/.test(name));
// The bridge reads the deployed table completed from the live declarations, as the reader pipeline does.
const live=await completeBindings(bindings);
const knowledge=createFacts({source:createKnowledgeSource(catalogRoot+catalogCommit)});

// A raw reading as the reader gives it, with the source ranges of its trigger, kind and count, bridged to candidates.
function reading(area,text,request,failures=[]){
 const chars=Array.from(text),at=value=>{const i=text.indexOf(value);return i<0?null:[Array.from(text.slice(0,i)).length,Array.from(text.slice(0,i)).length+Array.from(value).length];};
 const req={span:text,mood:'do',...request};
 const ranges=[['trigger',req.trigger],['target.kind_span',req.target?.kind_span],['target.count_span',req.target?.count_span]].filter(([,v])=>v&&at(v))
  .map(([path,v])=>({path:['requests','0',...path.split('.')],range:at(v)}));
 ranges.push({path:['requests','0','span'],range:[0,chars.length]});
 const raw={format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area,model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},requestCount:1,requests:[req],ranges,coverage:{complete:!failures.length,truncated:false},unresolved:failures};
 if(failures.length)return {raw,candidates:[],coverage:{complete:false,graphProposal:false,executable:false},failures,sourceCut:{spans:[[0,chars.length]]},selectionScore:{definition:'psys2.model-minimum/1',value:.85}};
 const out=bridgeRawStructure({...raw,ranges:[]},{bindings:live,bindingSha256,comparatives:comparativeSteps(),references:referenceProjection()});
 const issues=[...out.diagnostics,...(out.decoded?.issues??[])];
 assert.deepEqual(issues,[],'the bridge reads '+JSON.stringify(text));
 return {raw,candidates:out.decoded.candidates,coverage:{complete:true,graphProposal:true,executable:false},failures:[],sourceCut:{spans:[[0,chars.length]]},selectionScore:{definition:'psys2.model-minimum/1',value:.85}};
}
const ambiguous=ranges=>[{reason:'provider-unresolved',path:['requests','0'],detail:{reason:'ambiguous-global-mention',key:'request.target.kind',head:{path:'target.kind',ranges}}}];
const target=(kind,extra={})=>({kind,kind_span:kind,mode:'new',determiner:'indefinite',type:'drawn',...extra});
const anchor=(span,relation,relationSpan)=>[{key:'drawn.anchor',value_span:span,value:span,character:'requirement',operator:'relation',phase:'selector',polarity:'positive'},
 {key:'drawn.relation',value_span:relationSpan,value:relation,character:'requirement',operator:'relation',phase:'result',polarity:'positive'}];

function drawing(reads){
 const s={isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},engine:{knowledge,onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,registry:()=>({}),provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1,bindingsSha256:bindingSha256}),
  propose:async sop=>{const text=readReaderSource(sop);assert.ok(reads[text],'a reading for '+JSON.stringify(text));return reads[text]();}}}};
 const objects=()=>parse(s.isession.state['art.draw'].sop).filter(w=>w.type==='w.drawing.object').map(w=>{
  const v=k=>{const raw=w.attrs[k]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
  const x=Number(v('x')),y=Number(v('y')),size=Number(v('size'));
  return {id:v('code'),kind:v('drawing'),x,y,size,x0:x-size/2,y0:y-size/2,x1:x+size/2,y1:y+size/2};
 });
 return {s,objects,draw:args=>performGesture(s,{view:'draw',operation:'drawing.object.make',args}),say:text=>routeNewEngine(s,text,{view:'draw'})};
}
const overlap=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
function apart(list){for(let i=0;i<list.length;i++)for(let j=0;j<i;j++)assert.ok(!overlap(list[i],list[j]),'no overlap: '+JSON.stringify([list[i],list[j]]));}
const ofKind=(objects,kind)=>objects.filter(o=>o.kind===kind);

test('"draw a cat and 2 dogs": a cat and two dogs, one placement problem, none overlapping',async()=>{
 const text='draw a cat and 2 dogs';
 const {objects,say}=drawing({
  [text]:()=>reading('drawing',text,{act:'make',trigger:'draw',target:{mode:'new',determiner:'indefinite',type:'drawn',count:2,count_span:'2'}},ambiguous([[7,10],[17,21]])),
  'draw a cat':()=>reading('drawing','draw a cat',{act:'make',trigger:'draw',target:target('cat')}),
  'draw 2 dogs':()=>reading('drawing','draw 2 dogs',{act:'make',trigger:'draw',target:target('dogs',{count:2,count_span:'2'})})});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 assert.equal(reply.text,'Created a cat and 2 dogs.');
 const made=objects();
 assert.equal(ofKind(made,'cat').length,1);assert.equal(ofKind(made,'dog').length,2);assert.equal(made.length,3);
 apart(made);
 assert.equal(reply.trace.group.requested,3,'the three objects were placed together');
 assert.equal(reply.trace.solver.solves.length>=1,true);
});

test('"draw a boy and a girl": both noun phrases are read and each is made or named, never dropped silently',async()=>{
 const text='draw a boy and a girl';
 const {objects,say}=drawing({
  [text]:()=>reading('drawing',text,{act:'make',trigger:'draw',target:target('boy')}),
  'draw a boy':()=>reading('drawing','draw a boy',{act:'make',trigger:'draw',target:target('boy')}),
  'draw a girl':()=>reading('drawing','draw a girl',{act:'make',trigger:'draw',target:target('girl')})});
 const reply=await say(text);
 assert.deepEqual(reply.trace.coordination.parts.map(p=>[p.said,p.admitted]),[['a boy',true],['a girl',true]]);
 const made=objects();
 for(const kind of ['boy','girl'])assert.ok(made.length===2||reply.text.includes(kind),kind+' is made or named: '+reply.text);
 apart(made);
});

test('"sketch a red fish and call it cat": a clause naming what was made is not a further noun phrase; one fish named cat',async()=>{
 const text='sketch a red fish and call it cat';
 const said=(key,value)=>({key,value,value_span:value,character:'requirement',operator:'eq',phase:'result',polarity:'positive'});
 const {s,objects,say}=drawing({[text]:()=>reading('drawing',text,{act:'make',trigger:'sketch',target:target('fish'),constraints:[said('drawn.colour','red'),said('drawn.name','cat')]}),
  // What the reader gives for the pieces a cut at "and" would read (the deployed reader, real-use run cmp-v11-runtime-417e5cb81).
  'sketch a red fish':()=>reading('drawing','sketch a red fish',{act:'make',trigger:'sketch',target:target('fish'),constraints:[said('drawn.colour','red')]}),
  'sketch call it cat':()=>reading('drawing','sketch call it cat',{act:'make',trigger:'sketch',target:{mode:'new',determiner:'indefinite',type:'drawn'},constraints:[said('drawn.name','cat')]})});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 assert.equal(reply.trace.coordination,undefined,'not cut at "and"');
 const made=objects();
 assert.deepEqual(made.map(o=>o.kind),['fish']);
 assert.equal(str(parse(s.isession.state['art.draw'].sop).find(w=>w.type==='w.drawing.object')?.attrs.name?.[0]??'""'),'cat');
});

test('"draw two cats" then "call them Tom and Jerry": a spelled count makes two; a plural reference names the two made, in order',async()=>{
 const said=(key,value,phase='result')=>({key,value,value_span:value,character:'requirement',operator:'eq',phase,polarity:'positive'});
 const call='call them Tom and Jerry';
 const {s,objects,say}=drawing({
  'draw two cats':()=>reading('drawing','draw two cats',{act:'make',trigger:'draw',target:target('cats',{determiner:'definite'}),constraints:[said('drawn.count','two')]}),
  [call]:()=>{const r=reading('drawing',call,{act:'change',trigger:'call',target:{determiner:'definite',fill:'context',mode:'existing',type:'drawn'},constraints:[said('drawn.name','Tom and Jerry')]},
   [{reason:'context-reference-not-bound',path:['requests',0,'targets','t0']}]);
   r.raw.ranges.push({path:['requests','0','constraints','0','value_span'],range:[10,23]});return r;}});
 const made=await say('draw two cats');
 assert.ok(made.statuses.includes('supported'),made.text);
 assert.equal(ofKind(objects(),'cat').length,2,'"two" is the count 2: '+made.text);
 const named=await say(call);
 assert.ok(named.statuses.includes('supported'),named.text);
 const names=parse(s.isession.state['art.draw'].sop).filter(w=>w.type==='w.drawing.object').map(w=>w.attrs.name?.[0]?str(w.attrs.name[0]):undefined);
 assert.deepEqual(names,['Tom','Jerry'],named.text);
});

test('"draw some clouds": the typical number of k.expect.amount some, in the sky, apart',async()=>{
 const text='draw some clouds';
 const {objects,say}=drawing({[text]:()=>reading('drawing',text,{act:'make',trigger:'draw',target:target('clouds')})});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 assert.match(reply.text,/^Created 3 clouds\. I read "some" as 3\./);
 const clouds=ofKind(objects(),'cloud');
 assert.equal(clouds.length,3);apart(clouds);
 for(const c of clouds)assert.ok(c.y1<=350,'in the sky '+JSON.stringify(c));
});

test('"a few birds in the sky": three birds (k.expect.amount few), in the sky, apart',async()=>{
 const text='a few birds in the sky';
 const {objects,say}=drawing({[text]:()=>reading('drawing',text,{act:'make',trigger:'a',target:target('birds')})});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 const birds=ofKind(objects(),'bird');
 assert.equal(birds.length,3,reply.text);apart(birds);
 for(const b of birds)assert.ok(b.y1<=350,'in the sky '+JSON.stringify(b));
});

test('"draw three houses near the lake": three houses (not the "houses" emoji), each near the lake, off it and apart',async()=>{
 const text='draw three houses near the lake';
 const {objects,draw,say}=drawing({[text]:()=>reading('drawing',text,{act:'make',trigger:'draw',target:target('houses',{count:3,count_span:'three'}),constraints:anchor('the lake','next_to','near the')})});
 await draw({kind:'lake',x:500,y:550});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 assert.match(reply.text,/^Created 3 houses\./);
 const made=objects(),lake=ofKind(made,'lake')[0],houses=ofKind(made,'house');
 assert.equal(houses.length,3);assert.equal(made.length,4,'nothing else was drawn');
 apart(made);
 const gap=(a,b)=>Math.max(b.x0-a.x1,a.x0-b.x1,0)+Math.max(b.y0-a.y1,a.y0-b.y1,0);
 if(!/as close as the scene allows/.test(reply.text))for(const h of houses)assert.ok(gap(h,lake)<=80,'near the lake '+JSON.stringify(h));
});

test('"two trees left of the house": two trees, each left of the house, apart',async()=>{
 const text='two trees left of the house';
 const {objects,draw,say}=drawing({[text]:()=>reading('drawing',text,{act:'make',trigger:'two',target:target('trees',{count:2,count_span:'two'}),constraints:anchor('the house','left_of','left of')})});
 await draw({kind:'house',x:700,y:550});
 const reply=await say(text);
 assert.ok(reply.statuses.includes('supported'),reply.text);
 const made=objects(),house=ofKind(made,'house')[0],trees=ofKind(made,'tree');
 assert.equal(trees.length,2);apart(made);
 for(const t of trees)assert.ok(t.x1<=house.x0,'left of the house '+JSON.stringify(t));
});

test('Diagram "add three circles": the count is the node tool\'s own n (one call, three nodes)',async()=>{
 const text='add three circles';
 const read=reading('diagram',text,{act:'make',trigger:'add',target:{kind:'circles',kind_span:'circles',mode:'new',determiner:'indefinite',type:'node',count:3,count_span:'three'}});
 const s={isession:{state:{'diagram.sketch':emptyDiagramState(),'ui.shell':{activeTab:'diagram'}}},engine:{knowledge,onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1,bindingsSha256:bindingSha256}),propose:async()=>read}}};
 const reply=await routeNewEngine(s,text,{view:'diagram'});
 assert.ok(reply.statuses.includes('supported'),reply.text);
 const nodes=parse(s.isession.state['diagram.sketch'].sop??'').filter(w=>w.type==='w.diagram.node');
 assert.equal(nodes.length,3,reply.text);
 assert.ok(nodes.every(w=>w.attrs.kind?.[0]?.includes('circle')||w.attrs.shape?.[0]?.includes('circle')||JSON.stringify(w.attrs).includes('circle')),'three circles');
});
