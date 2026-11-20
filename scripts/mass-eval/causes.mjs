// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. The layer and the missing-capability "cause" of a row that did not succeed, from the reader
// proposal failures (bridge diagnostics), the reply trace (execution) and the judge's failed checks. A cause names a
// reusable piece (a binding, an operation, a rule/projection, knowledge), never the sentence.
const CONSEQUENCES=new Set(['incomplete-structural-coverage','unconsumed-predicted-range','incomplete-model-coverage','incomplete-provider-coverage','unresolved-model-output']);

/** The label key a bridge path points at (requests,R,constraints,cR_I,...) -> world.key. */
function keyAt(row,path,request){
 const i=path.indexOf('constraints');if(i<0)return null;
 const id=String(path[i+1]??''),m=/^c(\d+)_(\d+)$/.exec(id),reqIndex=Number(path[1]);
 const req=request??row.__requests?.[Number.isSafeInteger(reqIndex)?reqIndex:0]??row.requests?.[0];
 const c=m?req?.constraints?.[Number(m[2])]:req?.constraints?.[Number(id)];
 return c?row.world+'.'+c.key:null;
}
const targetOf=(row,path)=>{const r=row.requests?.[Number(path?.[1])]??row.requests?.[0];return r;};

/** One bridge/provider failure -> {layer, cause, detail}. */
function bridgeCause(row,f,requestOf){
 const path=f.path??[],reason=f.reason??'unknown',req=f.req??requestOf(path)??targetOf(row,path),t=req?.target??{},fam=row.world+'.'+(t.type??'?');
 const key=keyAt(row,path,req);
 switch(reason){
  case 'unresolved-canonical-property-binding':return {layer:'bindings',cause:`binding missing for ${key??fam+' property'}`};
  case 'unresolved-value-representation':return {layer:'bindings',cause:`value representation missing for ${key??fam}`};
  case 'unresolved-source-value-normalization':return {layer:'bindings',cause:`value normalization missing for ${key??fam}`};
  case 'unresolved-canonical-kind-binding':
   if(path.includes('kind')&&t.kind)return {layer:'knowledge',cause:`knowledge: kind words of ${fam} not bound`,detail:String(t.kind).toLowerCase()};
   return {layer:'bindings',cause:`binding missing: ${fam} target without a kind word (fill=${t.fill??'-'})`};
  case 'unresolved-anchor-reference':return {layer:'bindings',cause:`binding missing: relation anchor reference in ${row.world}`};
  case 'requires-declared-step-projection':return {layer:'rule',cause:`rule missing: comparative step projection for ${key??fam}`};
  case 'requires-operator-reference-projection':{const c=req?.constraints?.[Number(/_(\d+)$/.exec(path[3]??'')?.[1])];return {layer:'rule',cause:`rule missing: operator ${c?.operator??'?'} projection for ${key??fam}`};}
  case 'context-reference-not-bound':return {layer:'rule',cause:`rule missing: context reference (fill=context) for ${fam}`};
  case 'requires-declared-query-projection':return {layer:'rule',cause:`rule missing: query projection ask=${req?.question?.ask??'?'} for ${fam}`};
  case 'unprojected-population-reference':case 'quantifier-binder-not-projected':case 'description-reference-without-predicate':
   return {layer:'rule',cause:`rule missing: population/description reference (fill=${t.fill??'-'}${t.quantifier?', '+t.quantifier:''}) for ${fam}`};
  case 'missing-or-ambiguous-field-anchor':
   if(path.at(-1)==='act')return {layer:'rule',cause:`bridge: act without trigger words (${req?.act??'?'} fragments)`};
   return {layer:'rule',cause:`bridge: field anchor missing for ${path.slice(2).filter(x=>!/^\d+$/.test(x)).join('.')}`};
  case 'request-dependencies-not-annotated':return {layer:'rule',cause:'bridge: several requests in one cut (dependencies)'};
  case 'oracle-no-label-for-text':return {layer:'rule',cause:'application re-reads a sub-text (coordination split) the labels do not cover'};
  case 'provider-unresolved':return {layer:'reader',cause:`reader: ${f.detail?.reason??'unresolved'}${f.detail?.key?' '+f.detail.key:''}`};
  default:return {layer:'rule',cause:`bridge: ${reason}`+(key?` (${key})`:'')};
 }
}

const keysOf=req=>[...new Set((req?.constraints??[]).filter(c=>c.phase!=='selector').map(c=>c.key))].sort().join(',');

/** Classify a non-successful run. level: 'oracle' | 'e2e'. */
export function classify(row,run,verdict,{level,oracleOk,readerDiff}={}){
 const setupMissing=(run.setup?.failures??[]);
 if(run.error&&!run.reply&&run.layerHint==='data')return {layer:'data',cause:'labels: '+run.error};
 if(verdict.verdict==='error')return {layer:'execution',cause:'execution error: '+String(verdict.detail??run.error).replace(/[0-9a-f-]{20,}/g,'…').slice(0,90)};
 if(level==='e2e'&&oracleOk){
  const d=readerDiff?.first;return {layer:'reader',cause:d?`reader: ${d}`:'reader: reading differs from labels (execution differs)'};
 }
 const needs=(row.requests??[]).flatMap(r=>r.needs??[]);
 const proposals=(run.proposals??[]).filter(Boolean);
 // Each failure keeps the raw request it was raised on (a composition proposal reads one cut: request 0 of its raw).
 const failures=proposals.flatMap(p=>(p.failures??[]).map(f=>({...f,req:p.raw?.requests?.[Number(f.path?.[1])]??p.raw?.requests?.[0]})));
 const requestOf=()=>null;
 const informative=failures.filter(f=>!CONSEQUENCES.has(f.reason));
 const reply=run.reply,trace=reply?.trace??{},reason=trace.reason;
 const first=(row.requests??[])[0],fam=row.world+'.'+(first?.target?.type??'-');
 let out=null;
 if(verdict.verdict==='refused'||verdict.verdict==='partial'){
  // An execution-side refusal (a complete reading reached the executor) names the execution cause; a refused
  // reading ('reading', or no reason) names the first failing reusable piece of the bridge diagnostics.
  const executed=reason&&reason!=='reading';
  const disclosed=verdict.disclosed??[];
  if(!informative.length&&disclosed.length){const d=disclosed[0];
   // The disclosed text names the mention; the labelled constraint whose words it holds gives the key.
   const labelled=(row.requests??[]).flatMap(r=>r.constraints??[]).find(c=>c.value_span&&String(d.text??'').includes(c.value_span)&&!/\.anchor$/.test(c.key))??(row.requests??[]).flatMap(r=>r.constraints??[]).find(c=>c.value_span&&String(d.text??'').includes(c.value_span));
   const key=d.key?row.world+'.'+d.key:labelled?row.world+'.'+labelled.key:row.world+' '+d.role;
   out=/property-binding/.test(d.reason)?{layer:'bindings',cause:`binding missing for ${key}`}:/value-representation/.test(d.reason)?{layer:'bindings',cause:`value representation missing for ${key}`}:
    /refused-by-host/.test(d.reason)?{layer:'execution',cause:`host refused ${key} (${first?.act??'?'} ${fam})`}:{layer:'rule',cause:`not applied (${d.reason}) for ${key}`};}
  else if(informative.length&&!executed){
   // prefer property bindings over their value representation; one cause per row (the first failing piece)
   const ranked=[...informative].sort((a,b)=>rank(a.reason)-rank(b.reason));
   out={...bridgeCause(row,ranked[0],requestOf),all:[...new Set(informative.map(f=>bridgeCause(row,f,requestOf).cause))]};
  }else if(reason==='no-declared-action')out={layer:'no-operation',cause:`no operation for ${first?.act??'?'} ${fam}${keysOf(first)?' ['+keysOf(first)+']':''}`};
  else if(reason==='native-binding-gap')out={layer:'bindings',cause:`tool argument binding missing for ${first?.act??'?'} ${fam}${keysOf(first)?' ['+keysOf(first)+']':''}`};
  else if(reason==='target'||reason==='target-resolution')out=setupMissing.length?{layer:'setup',cause:`setup: context object not creatable (${setupMissing[0].kind}: ${setupMissing[0].reason})`}:{layer:'execution',cause:`target not resolved for ${first?.act??'?'} ${fam} (fill=${first?.target?.fill??'-'})`};
  else if(trace.placement||/placement|request-shape/.test(String(reason)))out={layer:'execution',cause:`placement refused (${reason}) for ${first?.act??'?'} ${fam} [${[...new Set((first?.constraints??[]).map(c=>c.key+(c.phase==='selector'?' (selector)':'')))].sort().join(', ')}]`};
  else if(reason==='reading')out={layer:'rule',cause:'reading refused without diagnostics'};
  else out={layer:'execution',cause:`refused: ${reason??'unknown'} for ${first?.act??'?'} ${fam}`};
 }else if(verdict.verdict==='wrong-effect'){
  const f=verdict.failed?.[0],req=row.requests?.[f?.request??0]??first;
  out={layer:'wrong-effect',cause:`wrong effect: ${f?.name??'?'} for ${req?.act??'?'} ${row.world}.${req?.target?.type??'-'}`,detail:f?.detail};
 }else if(verdict.verdict==='excluded')out={layer:'excluded',cause:'excluded: '+verdict.excluded};
 if(out&&needs.length&&['refused','wrong-effect','partial'].includes(verdict.verdict))out={...out,layer:'needs',cause:`needs (meaning without a key): ${[...new Set(needs.map(n=>n.frame??n.key??'?'))].join(',')}`,underlying:out.cause};
 if(out&&setupMissing.length)out.setupIncomplete=true;
 return out;
}
const ORDER=['unresolved-canonical-property-binding','unresolved-canonical-kind-binding','unresolved-anchor-reference','requires-declared-step-projection','requires-operator-reference-projection','context-reference-not-bound','requires-declared-query-projection','unprojected-population-reference','quantifier-binder-not-projected','unresolved-source-value-normalization','unresolved-value-representation'];
const rank=r=>{const i=ORDER.indexOf(r);return i<0?ORDER.length:i;};

/** Field-level comparison of the deployed reader's raw requests with the trainer-view labels. */
export function compareReading(goldRequests,predicted){
 const fields=['act','mood','target.type','target.mode','target.determiner','target.fill','target.kind_span','target.name_span','target.count','question.ask'];
 const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
 const out={fields:{},constraints:{tp:0,fp:0,fn:0},requestCount:[goldRequests.length,predicted.length],exact:goldRequests.length===predicted.length,first:null};
 if(goldRequests.length!==predicted.length)out.first=`request count ${goldRequests.length}→${predicted.length}`;
 goldRequests.forEach((g,i)=>{
  const p=predicted[i]??{};
  for(const f of fields){const gv=get(g,f),pv=get(p,f);if(gv===undefined&&pv===undefined)continue;const ok=String(gv??'')===String(pv??'');(out.fields[f]??={ok:0,n:0}).n++;if(ok)out.fields[f].ok++;else{out.exact=false;out.first??=`${f} ${gv??'∅'}→${pv??'∅'}`;}}
  const sig=c=>c.key+'|'+(c.operator??'')+'|'+(c.phase??'');
  const gs=(g.constraints??[]).map(sig),ps=(p.constraints??[]).map(sig),left=[...ps];
  for(const s of gs){const j=left.indexOf(s);if(j>=0){left.splice(j,1);out.constraints.tp++;}else{out.constraints.fn++;out.exact=false;out.first??=`missed constraint ${s.split('|')[0]}`;}}
  out.constraints.fp+=left.length;if(left.length){out.exact=false;out.first??=`extra constraint ${left[0].split('|')[0]}`;}
 });
 return out;
}
