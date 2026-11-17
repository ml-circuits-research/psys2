// Diagnostic parity only: compare all semantic packet fields, excluding only model identity.
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const omitModel=packet=>Object.fromEntries(Object.entries(packet).filter(([key])=>key!=='model'));
export function compareReaderProbes(node,python){
 if(node.inputs?.sha256!==python.inputSha256||node.verified?.manifestSha256!==python.artifactManifestSha256)throw Error('probe-identity-mismatch');
 if(!Array.isArray(node.rows)||!Array.isArray(python.cases)||node.rows.length!==python.cases.length||node.rows.length>64)throw Error('probe-population-mismatch');
 const by=new Map(python.cases.map(row=>[row.id,row]));if(by.size!==python.cases.length||new Set(node.rows.map(row=>row.id)).size!==node.rows.length)throw Error('duplicate-probe-id');
 let work=0;
 function diff(a,b,path='$',depth=0){
  if(++work>1000000||depth>64)throw Error('comparison-budget');
  if(a===b)return [];if(a===null||b===null||typeof a!==typeof b||Array.isArray(a)!==Array.isArray(b))return [path+':type'];
  if(Array.isArray(a))return [...(a.length!==b.length?[path+':length']:[]),...a.slice(0,b.length).flatMap((v,i)=>diff(v,b[i],`${path}[${i}]`,depth+1))];
  if(typeof a==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>!Object.hasOwn(a,k)||!Object.hasOwn(b,k)?[path+'.'+k+':missing']:diff(a[k],b[k],path+'.'+k,depth+1));
  return [path];
 }
 const reasonCounts=entries=>entries.reduce((counts,e)=>{counts[e.reason]=(counts[e.reason]??0)+1;return counts;},{});
 const rows=node.rows.map(row=>{
  const reference=by.get(row.id);if(!reference)throw Error('probe-id-mismatch');
  const cutter=row.result.diagnostics.filter(d=>d.component==='cutter');if(cutter.length!==1)throw Error('missing-cutter-diagnostic');
  const cut=cutter[0].result.packet,reads=row.result.diagnostics.filter(d=>d.component==='key-reader').map(d=>d.result.raw);
  const actual={cutter:{spans:cut.spans,issues:cut.unresolved,truncated:cut.coverage.truncated},readings:reads.map((r,i)=>({sourceRange:cut.spans[i],packet:omitModel(r)}))};
  const expected={...reference.pipeline,readings:reference.pipeline.readings.map(r=>({...r,packet:omitModel(r.packet)}))};
  const differences=diff(actual,expected);
  return {id:row.id,area:row.area,equal:differences.length===0,allDifferencePaths:differences,cuts:cut.spans.length,rawPackets:reads.length,rawComplete:reads.filter(r=>r.coverage.complete).length,canonicalCandidates:row.result.proposal.candidates.length,rawUnresolved:reasonCounts(reads.flatMap(r=>r.unresolved)),pipelineFailures:reasonCounts(row.result.proposal.failures),nodeModels:{cutter:cut.model,readers:reads.map(r=>r.model)},pythonModels:reference.pipeline.readings.map(r=>r.packet.model)};
 });
 return {format:'psys2.actual-node-python-probe-parity/1',cases:rows.length,equal:rows.filter(r=>r.equal).length,rows,nodeVerified:node.verified,pythonModelIdentity:python.logicalModelIdentity,excludedFields:['per-packet model identity only; identities retained separately'],semanticAccuracy:null,calibration:null,executionEligible:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [nodePath,pythonPath,output]=process.argv.slice(2);if(!nodePath||!pythonPath||!output)throw Error('usage: compare-reader-probes NODE_JSON PYTHON_JSON OUTPUT');
 const n=readFileSync(nodePath),p=readFileSync(pythonPath);if(n.length>8000000||p.length>8000000)throw Error('comparison-input-budget');
 const report=compareReaderProbes(JSON.parse(n),JSON.parse(p));writeFileSync(output,JSON.stringify({...report,nodeSource:{path:nodePath,sha256:sha(n)},pythonSource:{path:pythonPath,sha256:sha(p)}},null,2)+'\n');console.log(JSON.stringify({cases:report.cases,equal:report.equal}));
}
