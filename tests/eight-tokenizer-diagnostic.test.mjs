import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makePlan,compareEntries} from '../scripts/diagnose-eight-tokenizer-inputs.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const inputs=[],node=[],python=[];
 for(let i=0;i<8;i++){
  const id=String(i),text='😀x',context={area:'drawing',context:{existing:[]}};
  inputs.push({id,text,...context});
  node.push({id,area:'drawing',sourceTextSha256:hash(text),result:{sourceContext:context,diagnostics:[
   {component:'cutter',result:{packet:{source:{text},spans:[[0,1],[1,2]]}}}
  ]}});
  python.push({id,pipeline:{cutter:{spans:[[0,2]]}}});
 }
 return {inputs,node,python};
}
test('bounded plan preserves actual source/context and scalar union of independently predicted cuts',()=>{
 const f=fixture(),plan=makePlan(f.inputs,f.node,f.python);
 assert.equal(plan.caseCount,8);assert.equal(plan.annotationGold,false);assert.equal(plan.requests.length,32);
 assert.equal(plan.cases.every(c=>c.contextEqual&&!c.cutsEqual),true);
 const first=plan.requests.filter(r=>r.id==='0');
 assert.deepEqual(first.map(r=>r.text),['😀x','😀','😀x','x']);
 assert.deepEqual(first[1].sourceRange,[0,1]);
 assert.deepEqual(first[2].origins,['whole-message-control','python-predicted']);
});
test('teacher fields, duplicate IDs, overlaps and non-eight scope refuse',()=>{
 const f=fixture();f.inputs[0].requests=[];
 assert.throws(()=>makePlan(f.inputs,f.node,f.python),/source-only/);
 const g=fixture();g.inputs.pop();assert.throws(()=>makePlan(g.inputs,g.node,g.python),/eight/);
 const h=fixture();h.node[1].id=h.node[0].id;assert.throws(()=>makePlan(h.inputs,h.node,h.python),/duplicate/);
 const j=fixture();j.node[0].result.diagnostics[0].result.packet.spans=[[0,2],[1,2]];
 assert.throws(()=>makePlan(j.inputs,j.node,j.python),/predicted-cuts/);
});
test('comparison detects context bytes, model feeds and offsets separately',()=>{
 const entry={entryId:'x',id:'0',kind:'key',sourceRange:[0,1],origins:['node-predicted'],
  text:'x',contextJSON:'{}',contextUTF8Sha256:hash('{}'),full:{inputIds:[101,1,102],attentionMask:[1,1,1]},
  padded:{inputIds:[101,1,102,0],attentionMask:[1,1,1,0],sourceOffsets:[null,[0,1],null,null]},sourceOffsetError:null};
 assert.equal(compareEntries([entry],[structuredClone(entry)])[0].equal,true);
 const offset=structuredClone(entry);offset.padded.sourceOffsets[1]=[0,2];
 const a=compareEntries([entry],[offset])[0];assert.deepEqual(a.mismatches,['padded']);assert.equal(a.nodeFeedSha256,a.pythonFeedSha256);
 const feed=structuredClone(entry);feed.padded.inputIds[1]=2;
 const b=compareEntries([entry],[feed])[0];assert.notEqual(b.nodeFeedSha256,b.pythonFeedSha256);
 const context=structuredClone(entry);context.contextJSON='{ }';
 assert.ok(compareEntries([entry],[context])[0].mismatches.includes('contextJSON'));
});
