// Node C1 wrapper. Source hashes are observed files, not a browser code attestation.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {measureCandidateExecution} from './candidate-execution-measurement.mjs';
const root=new URL('../../',import.meta.url),entry=new URL('../../src/dialog/new-engine.mjs',import.meta.url);
export async function observeExecutorSource(){
 const pending=[entry],seen=new Set(),files=[];let bytes=0;
 while(pending.length){
  const url=pending.pop();if(seen.has(url.href))continue;if(seen.size>=256)throw Error('executor-source-file-budget');seen.add(url.href);
  if(!url.href.startsWith(root.href))throw Error('executor-source-outside-repository');
  const buffer=await readFile(url);bytes+=buffer.length;if(bytes>16000000)throw Error('executor-source-byte-budget');
  const source=buffer.toString('utf8');files.push({path:url.href.slice(root.href.length),bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
  for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\sfrom\s*)?['"]([^'"]+)['"]/g)){
   if(match[1].startsWith('.'))pending.push(new URL(match[1],url));
  }
 }
 files.sort((a,b)=>a.path.localeCompare(b.path));return {format:'psys2.observed-executor-source/1',platform:'node',node:process.version,arch:process.arch,os:process.platform,files,
  sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),scope:'Observed static local import closure; no dynamic loader, in-memory module byte attestation or browser equivalence claim'};
}
export async function measureCandidateExecutionNode(input){
 const before=await observeExecutorSource(),result=await measureCandidateExecution(input),after=await observeExecutorSource();
 return {...result,observedExecutor:{before,after,unchanged:before.sha256===after.sha256},status:before.sha256===after.sha256?result.status:'invalid'};
}
