import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('structural target banks preserve explicit null, absence, arbitrary sentinel strings and unseen values',()=>{
 const code=`import importlib.util,json
s=importlib.util.spec_from_file_location('t','training/sop-bert/train-structural.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
rows=[{'source_path':'data/haiku-v2/drawing/a.jsonl','annotations':[{'target':{'kind':None},'constraints':[{'value':None},{'value':'null'},{'value':'<ABSENT>'},{'value':'<UNKNOWN>'}]}]}]
c=m.configuration(rows);bank=c['banks']['c:value'];mapping=m.bank_mapping(bank)
values=[m.MISSING,None,'null','<ABSENT>','<UNKNOWN>','never-observed']
print(json.dumps({'ids':[m.encode_category(v,mapping)for v in values],'bank':bank,'missing':m.field({},'value')is m.MISSING,'null':m.field({'value':None},'value')is None,'requests':c['maxRequests'],'conditions':c['maxConstraints'],'ambiguous':m.unique('x x','x')}))`;
 const r=JSON.parse(execFileSync('python3',['-c',code],{encoding:'utf8'}));assert.equal(r.ids[0],0);assert.equal(r.ids.at(-1),1);assert.equal(new Set(r.ids).size,r.ids.length);assert.equal(r.missing,true);assert.equal(r.null,true);assert.equal(r.conditions,4);assert.equal(r.requests,1);assert.equal(r.ambiguous,null);assert.equal(r.bank[r.ids[1]].value,null);
});
test('truncation tracks source and context independently, including complete-source/incomplete-context rows',()=>{
 const code="import importlib.util,json;s=importlib.util.spec_from_file_location('t','training/sop-bert/train-structural.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps([m.truncation_details([None,0,0,None,1,1,1,None],[None,0,0,None,1,None]),m.truncation_details([None,0,0,None,1,None],[None,0,None,1,None])]))";
 const r=JSON.parse(execFileSync('python3',['-c',code],{encoding:'utf8'}));assert.deepEqual(r,[{source:false,context:true},{source:true,context:false}]);
});
