// Predeclare source-only diagnostic inputs; selection never inspects predictions or labels.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function selectReaderProbes(bytes,{version,perArea=2,areas=['calendar','diagram','document','drawing']}={}){
 if(!['haiku-v1','haiku-v2'].includes(version)||!Number.isSafeInteger(perArea)||perArea<1||perArea>20||!Array.isArray(areas)||areas.length!==4||new Set(areas).size!==4)throw Error('invalid-probe-selection');
 if(bytes.length>100000000)throw Error('probe-source-budget');
 const counts=Object.fromEntries(areas.map(a=>[a,0])),inputs=[],selection=[],ids=new Set();
 const lines=bytes.toString('utf8').split('\n');if(lines.length>100000)throw Error('probe-row-budget');
 for(let i=0;i<lines.length;i++){
  if(!lines[i].trim())continue;const row=JSON.parse(lines[i]);
  if(typeof row.source_path!=='string'||!row.source_path.startsWith(`data/${version}/`))continue;
  if(!Object.hasOwn(counts,row.world))throw Error('unknown-source-area');
  if(counts[row.world]>=perArea)continue;
  if(row.split!=='calibration'||typeof row.id!=='string'||ids.has(row.id)||typeof row.source?.text!=='string'||row.source.unit!=='unicode-scalar')throw Error('invalid-source-probe');
  ids.add(row.id);counts[row.world]++;inputs.push({id:row.id,text:row.source.text,area:row.world,context:row.context??null});
  selection.push({id:row.id,area:row.world,sourcePath:row.source_path,sourceLine:row.source_line,sourceSha256:row.source_sha256,calibrationLine:i+1});
 }
 if(areas.some(a=>counts[a]!==perArea))throw Error('insufficient-source-probes');
 const jsonl=inputs.map(x=>JSON.stringify(x)).join('\n')+'\n';
 return {inputs,jsonl,declaration:{format:'psys2.predeclared-source-probes/1',sourceSha256:sha(bytes),version,perArea,areas,selectionPolicy:'first perArea records of each area in source order, filtered only by source_path version; never by annotations or model outputs',selection,inputSha256:sha(jsonl),labelsProvidedToModel:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [source,version,prefix]=process.argv.slice(2);if(!source||!version||!prefix)throw Error('usage: select-reader-probes SOURCE VERSION OUTPUT_PREFIX');
 const result=selectReaderProbes(readFileSync(source),{version});
 writeFileSync(prefix+'.inputs.jsonl',result.jsonl);writeFileSync(prefix+'.selection.json',JSON.stringify({...result.declaration,sourcePath:source},null,2)+'\n');console.log(JSON.stringify({inputs:result.inputs.length,inputSha256:result.declaration.inputSha256}));
}
