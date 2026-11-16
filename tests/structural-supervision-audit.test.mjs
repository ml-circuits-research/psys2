import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
test('structural audit preserves explicit evidence, distinguishes scalar labels from refs and excludes reserved rows before walking',()=>{
 const dir=mkdtempSync(join(tmpdir(),'structural-evidence-'));try{
  const root=join(dir,'root'),source='data/haiku-v2/calendar/fixture.jsonl';mkdirSync(join(root,'data/haiku-v2/calendar'),{recursive:true});
  const ids={};for(let i=0;!ids.train||!ids.calibration;i++){const id='row-'+i,split=Number.parseInt(createHash('sha256').update(source+':'+id).digest('hex').slice(0,8),16)%10===0?'calibration':'train';ids[split]??=id;}
  const request={span:'red',target:{type:'item',quantifier:'all'},constraints:[{key:'item.tint',phase:'selector',group:'or',value_span:'red'},{key:'other.tint',phase:'result',value_span:'red'}]};
  const rows=[{id:ids.train,world:'calendar',text:'red red',requests:[request]},{id:ids.calibration,world:'calendar',text:'red blue',requests:[{...request,span:'red blue',id:'explicit-id','source.start':0,'source.end':8}]},{id:'reserved',world:'calendar',text:'excluded',requests:[{root:'must-not-leak',bind:'must-not-leak'}]}];writeFileSync(join(root,source),rows.map(JSON.stringify).join('\n')+'\n');
  const exclude=join(dir,'exclude.json');writeFileSync(exclude,'["reserved"]');const a=join(dir,'a.json'),b=join(dir,'b.json');
  for(const out of [a,b])execFileSync('python3',['training/sop-bert/audit-structural-supervision.py','--root',root,'--exclude-ids',exclude,'--out',out]);
  assert.equal(readFileSync(a,'utf8'),readFileSync(b,'utf8'));const report=JSON.parse(readFileSync(a));assert.equal(report.graphGoldGenerated,false);assert.equal(report.exclusion.foundIds,1);
  const train=report.groups['train:haiku-v2:calendar'],cal=report.groups['calibration:haiku-v2:calendar'];assert.equal(train.counts.requestsWithSelectorAndResultPhase,1);assert.equal(train.counts.requestObjectsWithExplicitId,0);assert.equal(cal.counts.requestObjectsWithExplicitId,1);assert.equal(cal.counts.explicitSourceCoordinateFields,2);assert.equal(cal.counts.requestSpansUniqueInSource,1);assert.equal(cal.counts.childSpansMechanicallyRecoverable,2);
  assert.equal(train.counts.constraintTypePrefixDiffersFromTargetType,1);assert.equal(train.quantifiers['"all"'],1);assert.equal(train.spanEvidence['request.span:matchesInRow=many'],1);assert.equal(Object.keys(train.paths).some(p=>p.endsWith('.root')||p.endsWith('.bind')),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
