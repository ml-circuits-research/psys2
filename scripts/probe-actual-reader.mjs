// Bounded C1 source-only backend probe. No application session, admission or effects.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const [specPath,inputPath,outputPath]=process.argv.slice(2);
if(!specPath||!inputPath||!outputPath)throw Error('usage: probe-actual-reader SPEC INPUT_JSONL OUTPUT_JSON');
const specBytes=readFileSync(specPath),inputBytes=readFileSync(inputPath);
if(specBytes.length>1000000||inputBytes.length>1000000)throw Error('probe-input-budget');
const rows=inputBytes.toString('utf8').trim().split('\n').map(JSON.parse),ids=new Set();
if(rows.length<1||rows.length>64)throw Error('probe-row-budget');
for(const row of rows){if(!row||Object.keys(row).sort().join(',')!=='area,context,id,text'||typeof row.id!=='string'||ids.has(row.id)||typeof row.text!=='string'||typeof row.area!=='string')throw Error('invalid-source-only-probe');ids.add(row.id);}
const reader=await loadActualReplayReader(JSON.parse(specBytes)),results=[];
for(const row of rows){
 const result=await reader.probe(row.text,{area:row.area,context:row.context});
 // Preserve all raw predictions/ranges/unknown/support and provenance; numerical logits are not needed for this comparison.
 result.diagnostics=result.diagnostics.map(({component,result:r})=>({component,result:Object.fromEntries(Object.entries(r).filter(([key])=>key!=='auxiliary'))}));
 results.push({id:row.id,area:row.area,sourceTextSha256:sha(row.text),result});
 if(Buffer.byteLength(JSON.stringify(results))>8000000)throw Error('probe-output-budget');
 console.log(JSON.stringify({id:row.id,candidates:result.proposal.candidates.length,complete:result.proposal.coverage.complete}));
}
if(sha(readFileSync(inputPath))!==sha(inputBytes)||sha(readFileSync(specPath))!==sha(specBytes))throw Error('probe-input-mutated');
writeFileSync(outputPath,JSON.stringify({format:'psys2.actual-source-probe/1',complete:true,inputs:{path:inputPath,sha256:sha(inputBytes)},spec:{path:specPath,sha256:sha(specBytes)},verified:reader.verified,rows:results,excludedDiagnostics:['auxiliary numerical logits only; no raw field/range/coverage/support/unresolved omission'],semanticAccuracy:null,calibration:null,executionEligible:false},null,2)+'\n');
