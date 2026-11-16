import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
test('inventory bootstrap preserves request, constraint instance, selector/result phases and repeatability',()=>{
 const dir=mkdtempSync(join(tmpdir(),'inventory-bootstrap-'));
 try{
  const root=join(dir,'input');mkdirSync(join(root,'heads'),{recursive:true});mkdirSync(join(root,'data/haiku-v2/drawing'),{recursive:true});
  for(const file of ['inventory.json','coverage_v1.py'])copyFileSync(`training/sop-bert/heads/${file}`,join(root,'heads',file));
  const row={id:'independent',world:'drawing',text:'Separate selectors and results.',requests:[{act:'change',constraints:[{key:'drawn.colour',value:'red',phase:'selector'},{key:'drawn.colour',value:'blue',phase:'result'}]},{act:'remove',constraints:[{key:'drawn.colour',value:'green',phase:'selector'}]}]};
  writeFileSync(join(root,'data/haiku-v2/drawing/fixture.jsonl'),JSON.stringify(row)+'\n');
  const prepare=out=>execFileSync('python3',['training/sop-bert/inventory-bootstrap.py','prepare','--root',root,'--out',out]);
  const a=join(dir,'a'),b=join(dir,'b');prepare(a);prepare(b);
  const all=['train','calibration'].flatMap(split=>{const bytes=readFileSync(join(a,split+'.jsonl'),'utf8');assert.equal(bytes,readFileSync(join(b,split+'.jsonl'),'utf8'));return bytes.trim()?bytes.trim().split('\n').map(JSON.parse):[];});
  const positives=all.filter(x=>x.label===1&&x.instance.endsWith('.value'));assert.equal(positives.length,3);
  assert.deepEqual(positives.map(x=>[x.request,x.instance,x.phase]),[[0,'constraints.0.value','selector'],[0,'constraints.1.value','result'],[1,'constraints.0.value','selector']]);
  assert.equal(new Set(positives.map(x=>x.id)).size,3);
  const reserved={...row,id:'reserved-development',requests:[{act:'reserved-only-label'}]};writeFileSync(join(root,'data/haiku-v2/drawing/reserved.jsonl'),JSON.stringify(reserved)+'\n');
  const exclude=join(dir,'exclude.json');writeFileSync(exclude,JSON.stringify([reserved.id]));
  const clean=join(dir,'clean');execFileSync('python3',['training/sop-bert/inventory-bootstrap.py','prepare','--root',root,'--out',clean,'--exclude-ids',exclude,'--gzip']);
  const cleanRows=['train','calibration'].flatMap(split=>gunzipSync(readFileSync(join(clean,split+'.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.equal(cleanRows.some(r=>r.source_id===reserved.id||r.candidate==='reserved-only-label'),false);
  const manifest=JSON.parse(readFileSync(join(clean,'data-manifest.json')));assert.equal(manifest.exclusion.foundIds,1);assert.equal(manifest.exclusion.beforeCandidateBank,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
