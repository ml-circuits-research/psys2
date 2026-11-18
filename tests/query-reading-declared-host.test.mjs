import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {projectQueryAction,recoverQueryProjection} from '../src/dialog/project-query-action.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';

const bindings={kinds:[{area:'drawing',type:'drawn',lemma:'house',canonical:'fixture.house',nativeFamilyBinding:{operation:'drawing.object.make'}}],
 properties:[{area:'drawing',key:'drawn.colour',canonical:'colour'}]};
const options={view:'draw',bindings};
const session={isession:{state:{'art.draw':initialDrawingState()}}};
const proposalFor=(text,request,ranges)=>({failures:[{reason:'requires-declared-query-projection'}],raw:{source:{text},requestCount:1,
 requests:[{act:'answer',mood:'ask',constraints:[],...request}],
 ranges:ranges.map(([path,range])=>({path:['requests','0',...path],range}))}});
const target={kind:'houses',kind_span:'houses',type:'drawn'};
const condition={key:'drawn.colour',value:'red',value_span:'red',operator:'eq',polarity:'positive',character:'requirement',phase:'result'};

test('Grounded question heads choose projections and preserve the actual selector evidence',async()=>{
 const proposal=proposalFor('How many red houses',{trigger:'How many',question:{ask:'count'},target,constraints:[condition]},
  [[['trigger'],[0,8]],[['target','kind_span'],[13,19]],[['constraints','0','value_span'],[9,12]]]);
 const result=await projectQueryAction(proposal,session,options);
 const wires=parse(result.candidates[0].wires);
 assert.equal(wires.find(row=>row.type==='std.request.query').attrs.operation[0],'count');
 assert.equal(wires.find(row=>row.type==='std.request.target').attrs.kind[0],'fixture.house');
 assert.equal(wires.find(row=>row.type==='std.request.constraint').attrs.value[0],'"red"');
 assert.match(result.interpretation.decision.sop,/std.choice.result/);
 assert.deepEqual(result.interpretation.unresolved,proposal.failures);
 proposal.raw.ranges[2].range=[1,4];
 assert.equal(await projectQueryAction(proposal,session,options),null);
});

test('A property projection requires its own exact span and a member question needs target evidence in the cue',async()=>{
 const proposal=proposalFor('What colour are houses',{trigger:'What colour',question:{ask:'what',asked_key:'colour'},target},
  [[['trigger'],[0,11]],[['target','kind_span'],[16,22]],[['question','asked_key_span'],[5,11]]]);
 const result=await projectQueryAction(proposal,session,options);
 const values=parse(result.candidates[0].wires).find(row=>row.type==='std.request.query');
 assert.deepEqual(values.attrs.operation,['values']);
 assert.deepEqual(values.attrs.concept,['colour']);
 delete proposal.raw.requests[0].question.asked_key;
 assert.equal(await projectQueryAction(proposal,session,options),null);
 const members=proposalFor('Which houses',{trigger:'Which houses',question:{ask:'which'},target},
  [[['trigger'],[0,12]],[['target','kind_span'],[6,12]]]);
 assert.match((await projectQueryAction(members,session,options)).candidates[0].wires,/operation=members/);
 members.raw.requests[0].trigger='Which';members.raw.ranges[0].range=[0,5];
 assert.equal(await projectQueryAction(members,session,options),null);
});

test('A grounded filter may be distributed per member only when its scope is declared',async()=>{
 const predicate={...condition,phase:'selector',scope:'each'};
 const proposal=proposalFor('Are there any red houses',{trigger:'Are there',question:{ask:'exists'},target,constraints:[predicate]},
  [[['trigger'],[0,9]],[['target','kind_span'],[18,24]],[['constraints','0','value_span'],[14,17]]]);
 const result=await projectQueryAction(proposal,session,options);
 assert.match(result.candidates[0].wires,/operation=exists/);
 assert.match(result.candidates[0].wires,/value="red"/);
 assert.match(result.interpretation.evidence,/scope=each/);
 predicate.scope='group';
 assert.equal(await projectQueryAction(proposal,session,options),null);
});

const modelGap=(head)=>({reason:'provider-unresolved',path:['requests',0],
 detail:{reason:'presence-span-inconsistent',head:{present:true,ranges:[],...head}}});
const question='Are there any red houses';
const observation={scope:'drawing',instance:'board-1',revision:'9'};
const makeExistence=({noun=true,filter=true}={})=>{
 const proposal=proposalFor(question,{trigger:'Are there',question:{ask:'exists'},
  target:noun?target:{type:'drawn',mode:'bound'},constraints:filter?[condition]:[]},
  [[['trigger'],[0,9]],...(noun?[[['target','kind_span'],[18,24]]]:[]),
   ...(filter?[[['constraints','0','value_span'],[14,17]]]:[])]);
 proposal.sourceObservation=observation;
 return proposal;
};

test('unanchored filter does not become a complete count or existence query',async()=>{
 const primary=makeExistence({filter:false});
 primary.raw.unresolved=[modelGap({area:'drawing',property:'drawn.colour'})];
 const result=await projectQueryAction(primary,session,options);
 assert.deepEqual(result.interpretation.limitation,['filter-span-missing']);
 assert.equal(result.candidates,undefined);
 assert.match(result.interpretation.proof.sop,/filter-span-missing/);
 const matching=makeExistence();
 const recovered=await recoverQueryProjection(result,session,{...options,provider:{proposeIndependent:async()=>matching}});
 assert.equal(recovered.interpretation.retry.rule,'query.recover.filter');
 assert.match(recovered.candidates[0].wires,/value="red"/);
 const wrongFilter=makeExistence();
 wrongFilter.raw.requests[0].constraints=[{...condition,key:'drawn.unrelated'}];
 assert.deepEqual((await recoverQueryProjection(result,session,{...options,provider:{proposeIndependent:async()=>wrongFilter}}))
  .interpretation.limitation,['filter-span-missing']);
});

test('a second read can supply its own target span while retaining current exact filter and observation',async()=>{
 const primary=makeExistence({noun:false});
 primary.raw.unresolved=[modelGap({path:'target.kind'})];
 const result=await projectQueryAction(primary,session,options);
 const alternate=makeExistence();
 const live={...options,provider:{proposeIndependent:async()=>alternate}};
 const recovered=await recoverQueryProjection(result,session,live);
 assert.equal(recovered.interpretation.retry.rule,'query.recover.target');
 assert.deepEqual(recovered.interpretation.retry.readings,[primary.raw,alternate.raw]);
 assert.match(recovered.candidates[0].wires,/operation=exists/);
 assert.match(recovered.interpretation.retry.input,/scope="drawing" instance="board-1" revision="9"/);
 assert.match(recovered.interpretation.retry.input,/targetText="houses" targetStart=18 targetEnd=24/);
 alternate.sourceObservation={...observation,revision:'10'};
 assert.deepEqual((await recoverQueryProjection(result,session,live)).interpretation.limitation,['target-span-missing']);
 alternate.sourceObservation=observation;
 alternate.raw.requests[0].target={...target,quantifier:'none'};
 assert.deepEqual((await recoverQueryProjection(result,session,live)).interpretation.limitation,['target-span-missing']);
 alternate.raw.requests[0].target=target;
 primary.raw.requests[0].constraints=[{...condition,scope:'group'}];
 assert.deepEqual((await recoverQueryProjection(result,session,live)).interpretation.limitation,['target-span-missing']);
 primary.raw.requests[0].constraints=[condition];
 alternate.raw.requests[0].constraints=[];
 alternate.raw.ranges=alternate.raw.ranges.filter(r=>r.path[2]!=='constraints');
 assert.deepEqual((await recoverQueryProjection(result,session,live)).interpretation.limitation,['target-span-missing']);
 primary.raw.requests[0].target.fill='context';
 assert.equal((await projectQueryAction(primary,session,options)).interpretation.reconsider,false);
});

test('a literal alternate supplies only the witnessed noun where all objects of that kind are absent',async()=>{
 const primary=makeExistence({noun:false});
 primary.raw.unresolved=[modelGap({path:'target.kind'})];
 primary.raw.requests[0].target.quantifier='any';
 const result=await projectQueryAction(primary,session,options);
 const alternate=makeExistence();
 alternate.raw.requests[0].target={kind:'houses',kind_span:'houses',quantifier:'any'};
 const attempts=[];
 const live={...options,provider:{
  proposeLiteral:async()=>{attempts.push('literal');return alternate;},
  proposeIndependent:async()=>{attempts.push('independent');return null;},
 }};
 const response=await recoverQueryProjection(result,session,live);
 assert.deepEqual(attempts,['literal']);
 assert.match(response.candidates[0].wires,/kind=fixture.house/);
 assert.match(response.candidates[0].wires,/value="red"/);
 assert.equal(response.raw.requests[0].target.type,'drawn');
 assert.equal(response.interpretation.retry.profile,'literal');
 assert.equal(response.interpretation.retry.pairRule,'query.match.literal.family');
 assert.equal(response.interpretation.retry.readings[0].requests[0].target.kind,undefined);
 assert.equal(response.interpretation.retry.readings[1].requests[0].target.type,undefined);
 const expectIncomplete=async()=>{
  const refused=await recoverQueryProjection(result,session,live);
  assert.deepEqual(refused.interpretation.limitation,['target-span-missing']);
  assert.equal(refused.candidates,undefined);
 };
 alternate.raw.requests[0].target.type='node';
 await expectIncomplete();
 delete alternate.raw.requests[0].target.type;
 alternate.raw.requests[0].target.quantifier='none';
 await expectIncomplete();
 alternate.raw.requests[0].target.quantifier='any';
 alternate.sourceObservation={...observation,scope:'different'};
 await expectIncomplete();
 alternate.sourceObservation=observation;
 alternate.raw.ranges.find(row=>row.path.at(-1)==='kind_span').range=[17,24];
 await expectIncomplete();
 alternate.raw.ranges.find(row=>row.path.at(-1)==='kind_span').range=[18,24];
 alternate.raw.requests[0].target.kind=alternate.raw.requests[0].target.kind_span='trees';
 await expectIncomplete();
});
