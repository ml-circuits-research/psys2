// Compact C1 diagnostics; never consumes annotation answers or produces correctness labels.
const fields={'mood':'request.request.mood','act':'request.request.act','target.type':'request.target.type','target.mode':'request.target.mode','target.fill':'request.target.fill'};
const at=(object,path)=>path.split('.').reduce((v,k)=>v?.[k],object);
export function summarizeReaderStages(measurement,config){
 const diagnostics=measurement?.diagnostics??[],reasons=[];
 const add=(stage,issue,path=[])=>{if(issue&&typeof issue.reason==='string')reasons.push({stage,reason:issue.reason,path:Array.isArray(issue.path)?issue.path:path,...(typeof issue.key==='string'?{key:issue.key}:{}),...(typeof issue.detail?.reason==='string'?{underlying:{reason:issue.detail.reason,...(typeof issue.detail.key==='string'?{key:issue.detail.key}:{})}}:{})});};
 const cutter=diagnostics.find(x=>x.component==='cutter')?.result?.packet;
 for(const issue of cutter?.unresolved??[])add('cutter',issue);
 const requests=[];
 for(const [index,entry] of diagnostics.filter(x=>x.component==='key-reader').entries()){
  const r=entry.result,raw=r?.raw,request=raw?.request,heads={};
  for(const [path,key] of Object.entries(fields)){
   const selected=r?.auxiliary?.selectedLogits?.find(x=>x.key===key&&x.query===0),bank=config?.banks?.[key];
   heads[path]={capability:Array.isArray(bank),emitted:request?at(request,path)!==undefined:null,classState:selected?bank?.[selected.index]?.state??'invalid-index':'not-observed'};
  }
  const constraints=Array.isArray(request?.constraints)?request.constraints:null,keys={};
  const required={operator:0,phase:0,polarity:0,character:0};
  if(constraints)for(const c of constraints){keys[c.key??'<missing>']=(keys[c.key??'<missing>']??0)+1;for(const key of Object.keys(required))if(c[key]!==undefined)required[key]++;}
  for(const issue of raw?.unresolved??[])add('key-reader',issue,['requests',String(index)]);
  for(const issue of r?.diagnostics??[])add('packet-adapter',issue,['requests',String(index)]);
  requests.push({index,heads,constraints:constraints?.length??null,constraintKeys:keys,requiredMetadataPresent:constraints?required:null,rawComplete:raw?.coverage?.complete??null,truncated:raw?.coverage?.truncated??null});
 }
 const p=measurement?.proposal;
 for(const issue of p?.failures??[])add('pipeline',issue);
 return {cutter:cutter?{available:true,complete:cutter.coverage?.complete??null,truncated:cutter.coverage?.truncated??null,spanCount:Array.isArray(cutter.spans)?cutter.spans.length:null,spans:cutter.spans??null}:{available:false,spanCount:null},requests,
  raw:{available:!!p?.raw,requestCount:p?.raw?.requestCount??null,complete:p?.raw?.coverage?.complete??null},
  bridgeReached:!!p?.raw,decoder:{reached:p?.coverage?.graphProposal===true?true:null,reason:'not-retained-separately'},pipeline:{outputObserved:!!p?.coverage,complete:p?.coverage?.complete??null,nonemptyGraph:p?.coverage?.graphProposal??null,candidateCount:Array.isArray(p?.candidates)?p.candidates.length:null,emptyReading:p?.coverage?.complete===true&&p.coverage.graphProposal===false},
  reasons,contextError:measurement?.contextError??null,correct:null};
}
export function rankStageReasons(rows){
 const counts=new Map();for(const row of rows){const seen=new Set();for(const issue of row.stages?.reasons??[]){const key=JSON.stringify([issue.stage,issue.reason]);const c=counts.get(key)??{stage:issue.stage,reason:issue.reason,rows:0,occurrences:0};c.occurrences++;if(!seen.has(key)){c.rows++;seen.add(key);}counts.set(key,c);}}
 return [...counts.values()].sort((a,b)=>b.rows-a.rows||b.occurrences-a.occurrences||a.reason.localeCompare(b.reason));
}

// Prefer direct component issues; propagated wrappers do not multiply leaf occurrences.
export function rankLeafReasons(rows){
 const normalized=rows.map(row=>{const issues=row.stages?.reasons??[],direct=issues.filter(x=>x.stage!=='pipeline'),seen=new Set(direct.map(x=>JSON.stringify([x.reason,x.key??null])));const reasons=[...direct];
  for(const original of issues){const issue=original.underlying?{...original,...original.underlying}:original;if(issue.stage!=='pipeline'||['provider-unresolved','incomplete-provider-coverage','incomplete-request-cut'].includes(issue.reason))continue;if(!seen.has(JSON.stringify([issue.reason,issue.key??null])))reasons.push(issue);}
  return {stages:{reasons:reasons.map(x=>({stage:'underlying',reason:x.reason+(x.key?' ['+x.key+']':''),path:x.path}))}};});
 return rankStageReasons(normalized);
}
