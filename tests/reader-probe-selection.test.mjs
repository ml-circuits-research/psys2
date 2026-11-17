import test from 'node:test';import assert from 'node:assert/strict';import {selectReaderProbes} from '../scripts/select-reader-probes.mjs';
const areas=['calendar','diagram','document','drawing'];
const make=(area,i,version='haiku-v2')=>({id:`${version}/${area}/${i}`,source_path:`data/${version}/${area}/source.jsonl`,source_line:i,source_sha256:'a'.repeat(64),split:'calibration',world:area,context:{existing:[],previous:null},source:{text:`source ${i}`,unit:'unicode-scalar'},annotations:{notInput:true},complete:i===3,labels:{notInput:true}});
const bytes=rows=>Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
test('selection uses only version and source order, including incomplete annotations',()=>{
 const rows=areas.flatMap(area=>[make(area,0,'haiku-v1'),make(area,1),make(area,2),make(area,3)]),r=selectReaderProbes(bytes(rows),{version:'haiku-v2'});
 assert.equal(r.inputs.length,8);assert.deepEqual(r.inputs.map(x=>x.id),areas.flatMap(a=>[`haiku-v2/${a}/1`,`haiku-v2/${a}/2`]));
 assert.ok(r.inputs.every(x=>Object.keys(x).sort().join(',')==='area,context,id,text'));
 for(const row of rows){row.complete=true;row.annotations={changed:true};row.labels={changed:true};}
 assert.deepEqual(selectReaderProbes(bytes(rows),{version:'haiku-v2'}).inputs,r.inputs);
});
test('incomplete population, duplicate selected IDs and wrong split refuse',()=>{
 const rows=areas.flatMap(a=>[make(a,1),make(a,2)]);
 assert.throws(()=>selectReaderProbes(bytes(rows.slice(1)),{version:'haiku-v2'}),/insufficient/);
 const duplicate=structuredClone(rows);duplicate[1].id=duplicate[0].id;assert.throws(()=>selectReaderProbes(bytes(duplicate),{version:'haiku-v2'}),/invalid-source/);
 const wrong=structuredClone(rows);wrong[0].split='holdout';assert.throws(()=>selectReaderProbes(bytes(wrong),{version:'haiku-v2'}),/invalid-source/);
});
import {compareReaderProbes} from '../scripts/compare-reader-probes.mjs';
test('semantic parity ignores only model identity; ranges, unknowns and support remain compared',()=>{
 const packet={source:{text:'input'},request:{act:'change'},ranges:[{path:['act'],range:[0,1]}],coverage:{complete:false,support:[{key:'x',support:'unknown'}]},unresolved:[{reason:'unresolved'}],model:{sha256:'python'}};
 const p={inputSha256:'input',artifactManifestSha256:'manifest',cases:[{id:'one',pipeline:{cutter:{spans:[[0,5]],issues:[],truncated:false},readings:[{sourceRange:[0,5],packet}]}}]};
 const n={inputs:{sha256:'input'},verified:{manifestSha256:'manifest'},rows:[{id:'one',area:'drawing',result:{proposal:{candidates:[],failures:[]},diagnostics:[{component:'cutter',result:{packet:{spans:[[0,5]],unresolved:[],coverage:{truncated:false},model:{sha256:'node'}}}},{component:'key-reader',result:{raw:{...structuredClone(packet),model:{sha256:'node'}}}}]}}]};
 assert.equal(compareReaderProbes(n,p).equal,1);n.rows[0].result.diagnostics[1].result.raw.ranges[0].range[1]=2;
 const changed=compareReaderProbes(n,p);assert.equal(changed.equal,0);assert.ok(changed.rows[0].allDifferencePaths.some(p=>p.includes('ranges')));
 n.inputs.sha256='other';assert.throws(()=>compareReaderProbes(n,p),/identity-mismatch/);
});
