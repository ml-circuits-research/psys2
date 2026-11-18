import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parse} from '../src/vendor/sopworld/sopworld.mjs';
import {projectQueryAction} from '../src/dialog/project-query-action.mjs';
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
