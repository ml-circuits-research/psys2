// Owner Drawing-tab log (2026-11-20): grounding follows only kind evidence, never invents a kind, and the
// reply names what was read but not applied. The readings are the shapes the deployed reader emitted for the
// owner's sentences (ranges, failures, retries); the knowledge is the pinned site catalog; the policies are
// worlds/app.project/creation-policy.sop and query-reading-policy.sop.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {World} from '../src/vendor/sopworld/sopworld.mjs';
import {groundMention} from '../src/dialog/lexical-grounding.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {createFacts} from '../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../src/loaders/knowledge-source.mjs';
import {drawingObjects,drawingState} from './drawing-state.mjs';
import POLICY from '../worlds/app.project/creation-policy-source.mjs';
import SCHEMA from '../worlds/app.project/creation-schema-source.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const registry=JSON.parse(JSON.parse(readFileSync(new URL(deployment.manifestPath,webchat),'utf8')).configJSON).registry;
const catalogRoot=new URL('catalog/',webchat).pathname,commit=readdirSync(catalogRoot).find(name=>/^[0-9a-f]{40}$/.test(name));
const knowledge=createFacts({source:createKnowledgeSource(catalogRoot+commit)});
const kindOf=lemma=>bindings.kinds.find(row=>row.area==='drawing'&&row.lemma===lemma)?.canonical;
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};

const at=(text,word)=>{const start=text.indexOf(word);return [start,start+word.length];};
/** An incomplete single-request reading with exact source ranges, as the key reader emits it. */
function reading(text,request,{failures=[],spans={}}={}){
 const ranges=[{path:['requests','0','span'],range:[0,Array.from(text).length]}];
 if(request.trigger)ranges.push({path:['requests','0','trigger'],range:at(text,request.trigger)});
 for(const key of ['kind_span','name_span','count_span'])if(request.target?.[key])ranges.push({path:['requests','0','target',key],range:at(text,request.target[key])});
 for(const [path,word] of Object.entries(spans))ranges.push({path:['requests','0',...path.split('.')],range:at(text,word)});
 return {coverage:{complete:false,graphProposal:false,executable:false},candidates:[],selectionScore:{definition:'psys2.model-minimum/1',value:0.6},
  failures:[{reason:'incomplete-provider-coverage'},...failures],
  raw:{source:{text,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},requests:[{span:text,constraints:[],...request}],ranges}};
}
const several=(key,path,text,words)=>({reason:'provider-unresolved',path:['requests',0],detail:{reason:'ambiguous-global-mention',key,head:{path,ranges:words.map(word=>at(text,word))}}});
const unbound={reason:'unresolved-canonical-kind-binding',path:['requests',0,'targets','t0','kind']};
async function drawingSession(reader,objects=[]){
 const state={'art.draw':await drawingState(objects),'ui.shell':{activeTab:'draw'}};
 return {isession:{state},engine:{knowledge,onWorldActivity:()=>{},requestReader:{provenance:()=>provenance,bindings:()=>bindings,registry:()=>registry,...reader}}};
}
const kinds=session=>drawingObjects(session.isession.state['art.draw']).map(object=>object.kind);
const make=(kind,extra={})=>({act:'make',mood:'do',trigger:'draw',target:{determiner:'indefinite',mode:'new',type:'drawn',...(kind?{kind,kind_span:kind}:{}),...extra}});

test('a part-of parent is not kind evidence and a known word is never spelling-repaired',async()=>{
 const world=new World({library:{'app.creation':SCHEMA}});
 assert.ok(world.tell(POLICY).ok);
 const lemmas=['cat','person','sun','star','circle','round','dog','lake','pond'];
 const ground=async mention=>{const decision=await groundMention(world,'app.creation',mention,lemmas.map(lemma=>({lemma,measures:{otherType:0,otherFamily:0}})),knowledge);
  return {...decision,lemma:decision.selected===undefined?undefined:lemmas[decision.selected]};};
 const eyes=await ground('eyes');
 assert.equal(eyes.lemma,undefined,'"eyes" is a part of a cat, a person and the sun, not a kind of any of them');
 assert.ok(!eyes.edges.some(edge=>/part_of/.test(edge.relation)),JSON.stringify(eyes.edges));
 const groundWord=await ground('ground');
 assert.equal(groundWord.policy,'app.creation.word');
 assert.equal(groundWord.lemma,undefined,'"ground" is a word, never "round"');
 const dogs=await ground('dogs');
 assert.equal(dogs.lemma,'dog');
 assert.deepEqual(dogs.evidence.get(dogs.selected).path,['lemma:dog']);
 const typo=await ground('lakw');
 assert.equal(typo.policy,'app.creation','an unknown token keeps spelling repair');
 assert.equal(typo.lemma,'lake');
});

test('"draw a cat and 2 dogs": two kinds for one target create nothing, and the reply names both',async()=>{
 const text='draw a cat and 2 dogs';
 const read=reading(text,make(undefined,{count:2,count_span:'2'}),{failures:[several('request.target.kind','target.kind',text,['cat','dogs'])]});
 const session=await drawingSession({propose:async()=>read});
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.equal(reply.statuses[0],'unsupported',reply.text);
 assert.deepEqual(kinds(session),[],'no kind was read, so nothing is created (never the first catalog kind)');
 assert.match(reply.text,/"cat" and "dogs"/);
 assert.doesNotMatch(reply.text,/medal/);
});

test('"some eyes" with a sun on the page does not create a cat; "draw the ground" does not create a circle',async()=>{
 for(const [text,kind] of [['some eyes','eyes'],['draw the ground','ground']]){
  const read=reading(text,{...make(kind),trigger:kind==='eyes'?'eyes':'draw'},{failures:[unbound]});
  const session=await drawingSession({propose:async()=>read},[{kind:'sun'}]);
  const reply=await routeNewEngine(session,text,{view:'draw'});
  assert.equal(reply.statuses[0],'unsupported',reply.text);
  assert.deepEqual(kinds(session),['sun']);
  assert.match(reply.text,new RegExp('"'+kind+'"'));
 }
});

test('"who is eyes a cat?" is not answered as a count of cats',async()=>{
 const text='who is eyes a cat?';
 const question=(ask,target)=>({act:'answer',mood:'ask',trigger:'who',question:{ask},target:{determiner:'definite',mode:'existing',type:'drawn',kind:'cat',kind_span:'cat',...target}});
 const failures=[{reason:'requires-declared-query-projection',path:['requests',0,'queries']}];
 const session=await drawingSession({
  propose:async()=>reading(text,question('what',{fill:'written',name_span:'eyes'}),{failures}),
  proposeIndependent:async()=>reading(text,question('count',{fill:'description'}),{failures}),
 },[{kind:'cat'}]);
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.doesNotMatch(reply.text,/Count/,reply.text);
 assert.match(reply.text,/"eyes"/);
 assert.equal(reply.trace.readerRouting.contextRetry.attempts[0].used,false);
});

test('a creation names the mentions it read and did not apply, and explains a non-obvious kind',async()=>{
 const text='draw a lake over that background';
 const session=await drawingSession({propose:async()=>reading(text,make('lake',{name_span:'background'}))});
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.equal(reply.statuses[0],'supported',reply.text);
 assert.deepEqual(kinds(session),['lake']);
 assert.match(reply.text,/"background"/);
 const typo=await drawingSession({propose:async()=>reading('draw a lakw',make('lakw'),{failures:[unbound]})});
 const repaired=await routeNewEngine(typo,'draw a lakw',{view:'draw'});
 assert.deepEqual(kinds(typo),['lake']);
 assert.match(repaired.text,/I took "lakw" as lake \(a close spelling\)/);
 const plural=await drawingSession({propose:async()=>reading('draw dogs',make('dogs'),{failures:[unbound]})});
 const dogs=await routeNewEngine(plural,'draw dogs',{view:'draw'});
 assert.deepEqual(kinds(plural),['dog']);
 assert.doesNotMatch(dogs.text,/I took/,'an inflection needs no explanation');
});

// The legitimate cases keep working: a stated catalog kind through grounding, and compiled readings.
test('"draw a cat" and "draw a lake" ground to the named kinds with knowledge loaded',async()=>{
 for(const kind of ['cat','lake']){
  const session=await drawingSession({propose:async()=>reading('draw a '+kind,make(kind),{failures:[unbound]})});
  const reply=await routeNewEngine(session,'draw a '+kind,{view:'draw'});
  assert.equal(reply.statuses[0],'supported',reply.text);
  assert.deepEqual(kinds(session),[kind]);
  assert.doesNotMatch(reply.text,/I took/);
 }
});

function compiled(wires,text){
 return {propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[{request:'r',wires:[`@source std.request.source text=${JSON.stringify(text)}`,...wires].join('\n')}],failures:[],
  selectionScore:{definition:'psys2.model-minimum/1',value:.85}})};
}
test('"draw a boat in the lake" and "make the house blue" still apply',async()=>{
 const boat='draw a boat in the lake';
 const scene=await drawingSession(compiled(['@r std.request act=make mood=do source=$source','@boat std.request.target request=$r mode=new kind='+kindOf('boat'),
  '@lake std.request.target request=$r mode=existing kind='+kindOf('lake'),'@in std.request.constraint request=$r target=$boat concept=place operator=relation relation=in goal=$lake polarity=positive character=requirement'],boat),[{kind:'lake'}]);
 const placed=await routeNewEngine(scene,boat,{view:'draw'});
 assert.equal(placed.statuses[0],'supported',placed.text);
 assert.deepEqual(kinds(scene),['lake','boat']);
 const blue='make the house blue';
 const house=await drawingSession(compiled(['@r std.request act=change mood=do source=$source root=$c','@t std.request.target request=$r mode=existing kind='+kindOf('house'),
  '@c std.request.constraint request=$r target=$t concept=colour operator=eq value=blue character=requirement polarity=positive'],blue),[{kind:'house'}]);
 const coloured=await routeNewEngine(house,blue,{view:'draw'});
 assert.equal(coloured.statuses[0],'supported',coloured.text);
 assert.equal(drawingObjects(house.isession.state['art.draw'])[0].color,'#0000ff');
});
