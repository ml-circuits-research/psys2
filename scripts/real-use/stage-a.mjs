// SPDX-License-Identifier: AGPL-3.0-only
// Official real-use test, Stage A: deterministic decisions only, no judging. Uses mass-eval's semantic diff judge
// (labels vs instance-world diff), its reading comparison (reader wires vs gold labels) and its cause classifier.
// A row is DECIDED only when the outcome is unambiguous; everything else goes to Stage B (judged on the record).
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {PSYS2} from './paths.mjs';
const imp=p=>import(path.join(PSYS2,p));
const {judgeRow,setKindTable}=await imp('scripts/mass-eval/judge.mjs');
const {classify,compareReading}=await imp('scripts/mass-eval/causes.mjs');
const {trainerRequest}=await imp('scripts/mass-eval/gold-reader.mjs');
const inventory=JSON.parse(readFileSync(path.join(PSYS2,'official-dataset/inventory.json'),'utf8'));
export const initStageA=bindings=>setKindTable(bindings);
const REASON={reading:['reader','nothing-read-no-action'],'native-binding-gap':['binding','read-but-binding-gap'],'tool-binding':['binding','read-but-binding-gap'],
 'unbound-target':['binding','reference-unresolved'],target:['binding','reference-unresolved'],'no-declared-action':['binding','no-declared-action'],value:['binding','value-not-resolved'],
 'request-shape':['binding','read-but-binding-gap'],'unsupported-query-graph':['binding','question-unanswered'],'query-unavailable':['binding','question-unanswered'],
 'overwrite-needs-stricter-admission':['binding','overwrite-admission-refused'],'drawing-not-in-catalog':['knowledge','unknown-kind-refused'],
 'no-feasible-placement':['sop-rule','no-feasible-placement'],'empty-history':['setup','history-not-reproduced'],'link-exists':['sop-rule','link-exists']};
const LAYER={reader:'reader',cutter:'reader',bindings:'binding',binding:'binding',compile:'binding',rule:'sop-rule',execution:'sop-rule',knowledge:'knowledge',renderer:'renderer',reply:'reply',setup:'setup',data:'data'};
const CAVEAT=/could not|did not apply|not declared|cannot apply|I left out/i;

/** -> {judge:{verdict,failed}, reading:{exact,first}, decision:null|{verdict,honest,layer,pattern,note}} */
export function stageA(row,raw,setupFailures){
 const {before,after,reply,error,proposals}=raw;
 let v;try{v=judgeRow(row,{before,after,reply,error});}catch(e){v={verdict:'error',detail:String(e?.message??e)};}
 const gold=(row.requests??[]).map(r=>trainerRequest(r,row.world,inventory,[]));
 const predicted=(proposals??[]).filter(p=>p&&!p.__retry).flatMap(p=>p.raw?.requests??[]);
 let reading=null;try{reading=compareReading(gold,predicted);}catch{}
 let cause=null;if(!['success','plausible'].includes(v.verdict)){try{cause=classify(row,{before,after,reply,error,proposals,setup:{failures:setupFailures??[]}},v,{level:'e2e',oracleOk:null,readerDiff:reading});}catch{}}
 const text=String(reply?.text??''),reason=reply?.trace?.reason??null,failed=(v.failed??[]).map(c=>c.name);
 const out={judge:{verdict:v.verdict,failed:failed.slice(0,4)},reading:reading?{exact:reading.exact,first:reading.first}:null,cause:cause?{layer:cause.layer,cause:cause.cause}:null,decision:null};
 const readerWrong=reading&&!reading.exact;
 const dec=(verdict,layer,pattern,note,honest='yes')=>{out.decision={verdict,honest,layer,pattern,note,by:'stage-a'};};
 if(v.verdict==='error')dec('useless','setup','harness-error',String(v.detail??error).slice(0,80),'n/a');
 else if(!(row.requests??[]).length){
  if(v.verdict==='success')/could not identify/i.test(text)?dec('partial','reply','chitchat-robotic-reply','chit-chat answered with could-not-identify-action; nothing changed'):dec('full','','','sensible reply, nothing changed');
  else dec('wrong','reader','chitchat-acted-on','no request, but the state changed');
 }
 else if(v.verdict==='refused'){
  let [layer,pattern]=REASON[reason]??['binding','read-but-binding-gap'];
  if(layer==='binding'&&readerWrong&&reason!=='native-binding-gap')layer='reader';
  if((setupFailures??[]).length&&['target','unbound-target'].includes(reason)){layer='setup';pattern='setup-context-missing';}
  const q=(row.requests??[]).some(r=>r.act==='answer'||r.mood==='ask'||r.mood==='check');if(q&&layer!=='setup')pattern='question-unanswered';
  dec('useless',layer,pattern,'nothing changed; '+text.slice(0,70),/Nothing changed|could not|did not|no earlier|already has|cannot/i.test(text)?'yes':'no');
 }
 else if(v.verdict==='success'&&!readerWrong&&!CAVEAT.test(text))dec('full','','','labels satisfied on the diff, reader exact, no caveat');
 else if(v.verdict==='wrong-effect'&&failed.some(n=>/^(target|removed-target)$/.test(n)))dec('wrong',readerWrong?'reader':'binding','wrong-target-edited','changed/removed an object other than the one meant');
 else if(v.verdict==='partial'&&/some-requests-refused/.test(failed.join(' '))&&(row.requests??[]).length>1)dec('partial',readerWrong?'reader':'binding','compound-request-dropped','some requests done, others refused (disclosed)');
 // everything else (plausible, partial with disclosed caveats, kind mismatches, wrong-effect on values/relations,
 // success with an inexact reading) is undecided: Stage B judges the record.
 if(out.decision&&out.decision.verdict!=='full'&&!out.decision.layer)out.decision.layer=LAYER[cause?.layer]??'binding';
 return out;
}

// Reply patterns: the first Stage A signal (the reply text alone shows most failures). Declared patterns only.
export function replyPattern(r){
 const t=String(r.reply??''),st=r.statuses??[],touched=(r.created?.length??0)+(r.changed?.length??0)+(r.removed?.length??0);
 if(r.error&&!t)return 'error';
 if(/no executable circuit/i.test(t))return touched?'partial':'no-executable-circuit';
 if(!st.includes('supported'))return touched?'partial':'refused';
 if(/\b(could not|did not apply|cannot|not declared|I left out|I made only the first)\b/i.test(t))return touched?'partial':'answer-with-caveat';
 if(!touched)return 'answer-or-no-change';
 return 'clean-success';
}
const CAVEATS=[[/chart\.type|sample data|chart\.(kind|layout)/i,'chart-type-or-data-ignored'],[/\d{4}-\d\d-\d\d|UTC|\b\d{1,2}:\d\d\b|minutes?\b|duration|calendar/i,'date-time-ignored'],[/call it|named? it|labell?ed|\bname\b|could not make a drawn/i,'name-ignored'],[/placement|relation|left of|right of|below|above|beside|next to|near|under|behind|in front|top_|art\.draw\.object\.at/i,'relation-ignored'],
 [/count|\bnumber\b/i,'count-wrong'],[/made only the first thing|ask for the others/i,'compound-request-dropped'],[/For "/,'compound-request-dropped'],[/size|large|little|small|big|huge|tiny/i,'size-ignored'],
 [/colou?r/i,'colour-ignored'],[/facing|looking|smil|sad|happy|pose|style|glow|outline|font|italic|bold/i,'style-ignored'],[/no tool here takes that property/i,'property-unbound'],[/position in the list|second|first|third|last/i,'ordinal-ignored']];
/** Reply-pattern decision for a row Stage A left undecided: a disclosed partial with a real effect is partial. */
export function replyDecision(row,r){
 if(r.stageA?.decision)return r.stageA.decision;
 const p=replyPattern(r);
 if(p==='partial'){
  const caveat=String(r.reply??'').split(/(?<=\.)\s/).filter(s=>/could not|did not apply|cannot|not declared|made only the first|No executable/i.test(s)).join(' ');
  let pattern=(CAVEATS.find(([re])=>re.test(caveat))??[null,'attribute-ignored'])[1];
  // Only stray tokens left unapplied ("Status", "please", "Goal", "400"): the request itself was done.
  const quoted=[...caveat.matchAll(/"([^"]+)"/g)].map(m=>m[1].trim());
  if(pattern==='attribute-ignored'&&quoted.length&&quoted.every(q=>/^(please|thanks|would you|quick|[A-Z][a-z]+( \d+)?|\d+)$/.test(q)))pattern='noise-token-ignored';
  const wrongish=(r.stageA?.judge?.failed??[]).some(n=>/^(kind|count|target|removed-target)$/.test(n));
  if(wrongish)return null;// the effect itself may be wrong: Stage B looks at it
  const layer=r.stageA?.reading?.exact===false&&!/could not apply|editor could not/i.test(caveat)?'reader':'binding';
  return {verdict:'partial',honest:'yes',layer,pattern,note:'disclosed: '+caveat.slice(0,90),by:'stage-a'};
 }
 return null;
}
