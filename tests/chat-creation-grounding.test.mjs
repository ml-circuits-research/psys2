// Chat creation in the Drawing tab when the reader's structure is incomplete: the stated noun is grounded
// against the whole published kind catalogue (exact identity before longer or misspelled names), the
// grounding request stays inside the library's request budget, a reading conditioned on the previous
// message is retried on its own, and a failed turn leaves no state behind.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/vendor/sopworld/sopworld.mjs';
import {groundMention} from '../src/dialog/lexical-grounding.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {drawingObjects} from './drawing-state.mjs';
import POLICY from '../worlds/app.project/creation-policy-source.mjs';
import SCHEMA from '../worlds/app.project/creation-schema-source.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const registry=JSON.parse(JSON.parse(readFileSync(new URL(deployment.manifestPath,webchat),'utf8')).configJSON).registry;
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};

const requirement=(key,value)=>({key,value,value_span:value,character:'requirement',operator:'eq',phase:'result',polarity:'positive'});
const at=(text,word)=>{const start=text.lastIndexOf(word);return [start,start+word.length];};
/** An incomplete single-request reading with exact source ranges, in the shape the structural reader emits. */
function reading(text,target,constraints){
 const trigger=text.split(' ')[0],ranges=[{path:['requests','0','trigger'],range:[0,trigger.length]}];
 if(target.kind_span)ranges.push({path:['requests','0','target','kind_span'],range:at(text,target.kind_span)});
 constraints.forEach((entry,index)=>ranges.push({path:['requests','0','constraints',String(index),'value_span'],range:at(text,entry.value_span)}));
 return {coverage:{complete:false,graphProposal:false,executable:false},candidates:[],failures:[{reason:'incomplete-provider-coverage'}],
  selectionScore:{definition:'psys2.model-minimum/1',value:0.6},
  raw:{source:{text,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},
   requests:[{span:text,act:'make',trigger,mood:'do',target:{determiner:'indefinite',mode:'new',...target},constraints}],ranges}};
}
// A coextensive part key (concept part_kind) is declared by the creation policy; the deployed reader's registry has
// none at present, so the fixture declares one in the reader-registry shape to exercise that declared path.
const partKey={'drawing.part.part':{concept:'part_kind',head:'candidate',src:'fixture: a coextensive part word',area:'drawing',type:'part',key:'part',role:'domain'}};
function drawingSession(reader,extra={}){
 const state={'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}};
 return {isession:{state},engine:{onWorldActivity:()=>{},requestReader:{provenance:()=>provenance,bindings:()=>bindings,registry:()=>({...registry,...extra}),...reader}}};
}

test('grounding a mention over more candidates than one library request holds ranks the same admitted set',async()=>{
 const world=new World({library:{'app.creation':SCHEMA}});
 assert.ok(world.tell(POLICY).ok);
 const filler=Array.from({length:3000},(_,n)=>({lemma:'filler'+n.toString(36),measures:{otherType:1,otherFamily:0}}));
 const named=[{lemma:'mountain lake',measures:{otherType:0,otherFamily:0}},{lemma:'lake',measures:{otherType:1,otherFamily:0}},{lemma:'lane',measures:{otherType:0,otherFamily:0}}];
 const small=await groundMention(world,'app.creation','lake',named);
 for(const candidates of [[...named,...filler],[...filler,...named],[filler[0],named[0],...filler.slice(1),named[1],named[2]]]){
  const decision=await groundMention(world,'app.creation','lake',candidates);
  const lemma=index=>candidates[index].lemma;
  assert.equal(lemma(decision.selected),'lake','the exact lemma wins over longer and misspelled names');
  assert.deepEqual(decision.alternatives.map(lemma),small.alternatives.map(index=>named[index].lemma));
  assert.equal(decision.evidence.get(decision.selected).route,'exact');
 }
});

for(const [label,text,target,constraints,kind,extra] of [
 ['a kind value as a constraint of the page, no target kind','draw a lake',{type:'page'},[requirement('drawn.kind','lake')],'lake'],
 ['a kind under the wrong target type','draw a fish',{type:'page',kind:'fish',kind_span:'fish'},[],'fish'],
 ['a part word as the only noun','draw a cloud',{type:'page'},[requirement('part.part','cloud')],'cloud',partKey],
])test('an incomplete creation reading ('+label+') creates the exactly named catalogue kind, with alternatives and undo',async()=>{
 const session=drawingSession({propose:async()=>reading(text,target,constraints)},extra);
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.equal(reply.statuses[0],'supported',reply.text+' '+JSON.stringify(reply.trace.readerRouting?.unresolved));
 assert.deepEqual(drawingObjects(session.isession.state['art.draw']).map(object=>object.kind),[kind]);
 const interpretation=reply.trace.readerRouting.interpretation;
 assert.equal(interpretation.profile,'declared-creation/1');
 assert.equal(interpretation.alternatives[0].lemma,kind);
 assert.equal(interpretation.alternatives[0].cost,0);
 assert.ok(interpretation.alternatives.length>1,'ranked alternatives are retained');
 assert.match(reply.text,/undo/);
 assert.equal(session.newEngineUndo.length,1);
});

test('a reading conditioned on the previous message is retried on its own; the attempt is disclosed and traced',async()=>{
 const text='draw a boat',calls=[];
 const session=drawingSession({
  // The contextual reading carries over a colour that this text never states (no source range).
  propose:async()=>{calls.push('contextual');const read=reading(text,{type:'drawn'},[]);read.raw.requests[0].constraints=[requirement('drawn.colour','blue')];return read;},
  proposeIndependent:async()=>{calls.push('independent');return reading(text,{type:'drawn',kind:'boat',kind_span:'boat'},[]);},
  proposeLiteral:async()=>{calls.push('literal');return null;},
 });
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.deepEqual(calls,['contextual','independent']);
 assert.equal(reply.statuses[0],'supported',reply.text);
 assert.deepEqual(drawingObjects(session.isession.state['art.draw']).map(object=>object.kind),['boat']);
 assert.match(reply.text,/without the previous one/);
 const retry=reply.trace.readerRouting.contextRetry;
 assert.equal(retry.used,'independent');
 assert.deepEqual(retry.attempts.map(attempt=>attempt.profile),['independent']);
 assert.ok(retry.primary.failures.length>0,'the first reading keeps its diagnostics');
});

test('a failed turn changes nothing and does not affect the next turn',async()=>{
 let next=null;
 const session=drawingSession({propose:async()=>next,proposeIndependent:async()=>null,proposeLiteral:async()=>null});
 next=reading('draw a fish',{type:'drawn',kind:'fish',kind_span:'fish'},[]);
 assert.equal((await routeNewEngine(session,'draw a fish',{view:'draw'})).statuses[0],'supported');
 const state=structuredClone(session.isession.state),undo=structuredClone(session.newEngineUndo),last=structuredClone(session.newEngineLastAction);
 next=reading('draw a qqqqzzzz',{type:'drawn',kind:'qqqqzzzz',kind_span:'qqqqzzzz'},[]);
 const failed=await routeNewEngine(session,'draw a qqqqzzzz',{view:'draw'});
 assert.equal(failed.statuses[0],'unsupported');
 assert.match(failed.text,/Nothing changed/);
 assert.deepEqual(session.isession.state,state);
 assert.deepEqual(session.newEngineUndo,undo);
 assert.deepEqual(session.newEngineLastAction,last);
 next=reading('draw a lake',{type:'page'},[requirement('drawn.kind','lake')]);
 const after=await routeNewEngine(session,'draw a lake',{view:'draw'});
 assert.equal(after.statuses[0],'supported',after.text);
 assert.deepEqual(drawingObjects(session.isession.state['art.draw']).map(object=>object.kind),['fish','lake']);
});
