// The owner's Diagram session (phrase log v4, 2026-11-20) and variants, each read as the deployed reader read it (or
// as a correct reading of it) and routed through the app route against a real Diagram area. Every win is a generic
// piece (specs/diagram-reading-analysis.md):
// - a family word ("box", "node", "step") makes a node with the declared default shape (execution-policy.sop);
// - a kind of the family the members lie in ("a diagram with 5 nodes") names the page (bindings.containment);
// - the diagram's raw node count key binds to the make's count port (semantic-alignments-v2: node.n);
// - "connect" with a new target makes the line (app.execution.actForm) and a line's ends name observed nodes by code,
//   label or kind (app.execution.reference);
// - a code ("e1", "n2") names its object whatever family the reader gave it (project-code-reference.mjs);
// - a parameter with declared names takes the said colour name, not its RGB lookup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../src/dialog/raw-structural-bridge.mjs';
import {comparativeSteps} from '../src/dialog/comparative-projection.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {emptyDiagramState} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindingsText=readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');
const catalogRoot=new URL('catalog/',webchat).pathname,catalogCommit=readdirSync(catalogRoot).find(name=>/^[0-9a-f]{40}$/.test(name));
const knowledge=createFacts({source:createKnowledgeSource(catalogRoot+catalogCommit)});
const eq=(key,value,phase='result')=>({key,value,value_span:value,character:'requirement',operator:'eq',phase,polarity:'positive'});

function session(){
 let read;
 const s={isession:{state:{'diagram.sketch':emptyDiagramState(),'ui.shell':{activeTab:'diagram'}}},engine:{knowledge,onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>read.raw&&!read.coverage?.complete?read:({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 const facts=type=>parse(s.isession.state['diagram.sketch'].sop??'').filter(w=>w.type===type);
 const bridge=(text,request)=>bridgeRawStructure({format:RAW_STRUCTURAL_FORMAT,source:{text,unit:'unicode-scalar'},area:'diagram',model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},
  requestCount:1,requests:[{span:text,trigger:text.split(' ')[0],mood:'do',...request}],ranges:[],coverage:{complete:true,truncated:false}},{bindings,bindingSha256,comparatives:comparativeSteps()});
 return {s,nodes:()=>facts('w.diagram.node'),edges:()=>facts('w.diagram.edge'),
  node:(args)=>performGesture(s,{view:'diagram',operation:'diagram.node.make',args}),
  link:(args)=>performGesture(s,{view:'diagram',operation:'diagram.link.make',args}),
  // A complete reading: the bridge must accept it as it is.
  say:async(text,request)=>{const out=bridge(text,request);assert.deepEqual(out.diagnostics,[],text);read=out.decoded.candidates[0];return routeNewEngine(s,text,{view:'diagram'});},
  // An incomplete reading, with the unresolved heads the reader reported.
  sayIncomplete:async(text,request,unresolved)=>{const out=bridge(text,request);
   read={raw:{...out.raw,coverage:{complete:false,truncated:false},unresolved},candidates:[],coverage:{complete:false},failures:[...unresolved,...out.diagnostics],provenance:{bindingsSha256:bindingSha256},selectionScore:{definition:'psys2.model-minimum/1',value:.85}};
   return routeNewEngine(s,text,{view:'diagram'});}};
}
const supported=reply=>assert.equal(reply.statuses[0],'supported',reply.trace?.reason+': '+reply.text);
const attr=(wire,key)=>wire.attrs[key]?.[0];
const idsUnresolved=[{reason:'provider-unresolved',path:['requests',0],detail:{reason:'presence-span-inconsistent',key:'diagram.node.ids'}}];

test('"add a box", "add another box", "add a step": a family word makes a node with the declared default shape, and says so',async()=>{
 for(const [text,kind] of [['add a box','box'],['add another box','box'],['add a step','step'],['add a node','node']]){
  const t=session(),reply=await t.say(text,{act:'make',target:{type:'node',mode:'new',determiner:'indefinite',kind,kind_span:kind},constraints:[]});
  supported(reply);
  assert.deepEqual(t.nodes().map(n=>attr(n,'shape')),['rectangle'],text);
  assert.match(reply.text,/I chose the shape/);
 }
});

test('a named shape keeps its own shape: "add a circle", "add a square"',async()=>{
 for(const kind of ['circle','square']){
  const t=session(),reply=await t.say('add a '+kind,{act:'make',target:{type:'node',mode:'new',determiner:'indefinite',kind,kind_span:kind},constraints:[]});
  supported(reply);
  assert.deepEqual(t.nodes().map(n=>attr(n,'shape')),[kind]);
  assert.doesNotMatch(reply.text,/I chose the shape/);
 }
});

test('"ad a diagram with 5 nodes": the diagram is the page, the five nodes are made on it',async()=>{
 for(const [text,kind,n,shape] of [['ad a diagram with 5 nodes','diagram','5','rectangle'],['create a flowchart with 4 steps','flowchart','4','rectangle'],['make a diagram with 3 circles','circles','3','circle']]){
  const t=session(),reply=await t.say(text,{act:'make',target:{type:'node',mode:'new',determiner:'indefinite',kind,kind_span:kind},constraints:[eq('node.n',n)]});
  supported(reply);
  assert.equal(t.nodes().length,Number(n),text);
  assert.ok(t.nodes().every(node=>attr(node,'shape')===shape),text);
 }
});

test('a diagram word for a new member of another family is not a page: "a diagram" as a link stays unresolved',()=>{
 const t=session(),out=bridgeRawStructure({format:RAW_STRUCTURAL_FORMAT,source:{text:'remove the diagram',unit:'unicode-scalar'},area:'diagram',model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},
  requestCount:1,requests:[{span:'remove the diagram',trigger:'remove',mood:'do',act:'remove',target:{type:'node',mode:'existing',determiner:'definite',kind:'diagram',kind_span:'diagram'},constraints:[]}],ranges:[],coverage:{complete:true,truncated:false}},{bindings,bindingSha256});
 assert.ok(out.diagnostics.some(d=>d.reason==='unresolved-canonical-kind-binding'),'an existing target named by the page kind is not re-read as a member');
 assert.ok(t);
});

test('"connect A to B", "connect n1 to n3", "draw an arrow from B to C": the ends name observed nodes by label, code or kind',async()=>{
 const t=session();
 await t.node({kind:'circle',label:'A'});await t.node({kind:'rectangle',label:'B'});await t.node({kind:'diamond',label:'C'});
 supported(await t.say('connect A to B',{act:'connect',target:{type:'link',mode:'new',determiner:'indefinite'},constraints:[eq('link.from','A'),eq('link.to','B')]}));
 supported(await t.say('connect n1 to n3',{act:'connect',target:{type:'link',mode:'new',determiner:'indefinite'},constraints:[eq('link.from','n1'),eq('link.to','n3')]}));
 supported(await t.say('draw an arrow from B to C',{act:'make',target:{type:'link',mode:'new',determiner:'indefinite',kind:'arrow',kind_span:'arrow'},constraints:[eq('link.from','B'),eq('link.to','C')]}));
 const code=ref=>t.nodes().find(n=>'$'+n.id===ref).attrs.code[0];
 assert.deepEqual(t.edges().map(e=>[code(attr(e,'from')),code(attr(e,'to'))]).sort(),[['n1','n2'],['n1','n3'],['n2','n3']]);
 // A kind two nodes share names neither: nothing is guessed.
 await t.node({kind:'circle',label:'D'});
 const before=t.edges().length,reply=await t.say('connect the circle to C',{act:'connect',target:{type:'link',mode:'new',determiner:'indefinite'},constraints:[eq('link.from','circle'),eq('link.to','C')]});
 assert.notEqual(reply.statuses[0],'supported');assert.equal(t.edges().length,before);
});

test('"make e1 dashed", "delete e1", "make n2 red": a code names its object whatever family the reader gave it',async()=>{
 const t=session();
 await t.node({kind:'circle',label:'A'});await t.node({kind:'circle',label:'B'});await t.link({from:'n1',to:'n2'});
 let reply=await t.sayIncomplete('make e1 dashed',{act:'change',target:{type:'link',mode:'existing',determiner:'definite',fill:'written',name_span:'e1'},constraints:[eq('link.style','dashed'),eq('node.ids','e1','selector')]},idsUnresolved);
 supported(reply);assert.equal(attr(t.edges()[0],'style'),'dashed');assert.match(reply.text,/I took "e1" as the link e1/);
 reply=await t.sayIncomplete('make n2 red',{act:'change',target:{type:'node',mode:'existing',determiner:'definite',fill:'written',name_span:'n2'},constraints:[eq('node.colour','red'),eq('node.ids','n','selector')]},idsUnresolved);
 supported(reply);assert.deepEqual(t.nodes().map(n=>[attr(n,'code'),attr(n,'colour')]).sort(),[['n1',undefined],['n2','red']]);
 reply=await t.sayIncomplete('delete e1',{act:'remove',target:{type:'node',mode:'existing',determiner:'definite',fill:'written',name_span:'e1'},constraints:[eq('node.ids','e1','selector')]},[]);
 supported(reply);assert.equal(t.edges().length,0);assert.equal(t.nodes().length,2);assert.match(reply.text,/the reader took it as a node/);
 // A code nothing has is not guessed.
 reply=await t.sayIncomplete('delete e7',{act:'remove',target:{type:'node',mode:'existing',determiner:'definite',fill:'written',name_span:'e7'},constraints:[eq('node.ids','e7','selector')]},[]);
 assert.notEqual(reply.statuses[0],'supported');assert.equal(t.nodes().length,2);
});

test('"make the circle red": a parameter with declared colour names takes the name itself',async()=>{
 const t=session();
 await t.node({kind:'circle',label:'A'});
 supported(await t.say('make the circle red',{act:'change',target:{type:'node',mode:'existing',determiner:'definite',fill:'written',kind:'circle',kind_span:'circle'},constraints:[eq('node.colour','red')]}));
 assert.equal(attr(t.nodes()[0],'colour'),'red');
});
