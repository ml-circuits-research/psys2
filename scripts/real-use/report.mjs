// SPDX-License-Identifier: AGPL-3.0-only
// Aggregates the official real-use test: usefulness per tab and class with Wilson 95% intervals, examples per
// verdict with PNG links, and failure patterns by count with their layer. findings.md (hand-written) is included.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {replyPattern} from './stage-a.mjs';
const jl=f=>existsSync(f)?readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const V=['full','partial','useless','wrong'],LV=['L0','L1','L2','L3','L4'];
// Owner scale (2026-11-20): L0 nothing/refused; L1 understood but wrong or only a fragment; L2 reasonable (recognised,
// sensible result, finesse may be off); L3 correct as asked; L4 polished. Phase target: share of L2+.
export const FINESSE=new Set(['size-ignored','noise-token-ignored','relation-approximate','chitchat-robotic-reply','facing-ignored','coordinates-ignored','scene-background-unsupported','style-ignored']);
export function levelOf(j){if(j.level)return 'L'+String(j.level).replace(/^L/,'');if(j.verdict==='useless')return 'L0';if(j.verdict==='wrong')return 'L1';if(j.verdict==='full')return 'L3';return FINESSE.has(j.pattern)?'L2':'L1';}
const ORDER=['drawing','diagram','document','calendar','avatar'];
function wilson(k,n,z=1.96){if(!n)return [0,0];const p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-h),Math.min(1,c+h)];}
const pct=(k,n)=>{if(!n)return '-';const [a,b]=wilson(k,n);return `${(100*k/n).toFixed(0)}% [${(100*a).toFixed(0)}–${(100*b).toFixed(0)}]`;};
function rng(seed){let a=seed>>>0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const cell=s=>String(s??'').replace(/\|/g,'/').replace(/\n/g,' ');
export function writeReport(dir){
 const meta=existsSync(path.join(dir,'meta.json'))?JSON.parse(readFileSync(path.join(dir,'meta.json'),'utf8')):{};
 const sample=new Map(jl(path.join(dir,'sample.jsonl')).map(r=>[r.id,r])),res=new Map(jl(path.join(dir,'results.jsonl')).map(r=>[r.id,r]));
 // Stage A decisions first; Stage B judgments only fill undecided rows.
 const J=new Map();for(const j of jl(path.join(dir,'judgments-b.jsonl')))if(sample.has(j.id))J.set(j.id,{...j,by:j.by??'stage-b'});
 for(const j of jl(path.join(dir,'judgments-a.jsonl')))if(sample.has(j.id))J.set(j.id,j);
 const bSub=existsSync(path.join(dir,'b-judge-subsample.json'))?new Set(JSON.parse(readFileSync(path.join(dir,'b-judge-subsample.json'),'utf8'))):null;
 // Scope: all of sample A; the judged subsample of B. A row outside scope never counts.
 for(const r of sample.values()){r.setsAll=r.sets;}
 for(const r of sample.values())r.sets=(r.sets??['A']).filter(S=>S==='A'||!bSub||bSub.has(r.id));
 const scope=[...sample.values()].filter(r=>r.sets.length);
 const rows=scope.filter(r=>J.has(r.id)).map(r=>({...r,j:J.get(r.id),level:levelOf(J.get(r.id)),res:res.get(r.id)??{}}));
 const unjudged=scope.filter(r=>!J.has(r.id));
 const L=[];
 L.push(`# Official real-use test — ${meta.date??''} — reader bundle ${meta.bundle??'?'}`,'',
  `Two random ${100*meta.rate}% samples of the official training dataset (${meta.trainingRows} rows, all tabs): **A** fixed seed \`${meta.seed}\` (${meta.sizeA} rows, identical on every run, for reader/runtime comparison) and **B** fresh seed \`${meta.seedB}\` (${meta.sizeB} rows, drawn anew on every run, never reused); ${meta.sampled} distinct rows. Each row ran through the full application path with the deployed reader (text → SOP-BERT reader → compiler → tool → new area state) on its context objects; usefulness was judged on the actual result (reply, state diff, PNG) with \`psys2/scripts/real-use/JUDGING.md\`, not by a string judge. In scope: all of A and a seeded random ${bSub?bSub.size:'?'}-row subsample of B (${scope.length} rows); judged ${rows.length} — ${rows.filter(r=>r.j.by==='stage-a').length} decided deterministically by Stage A, ${rows.filter(r=>r.j.by!=='stage-a').length} judged in Stage B${unjudged.length?`; **${unjudged.length} not yet judged (excluded from the percentages)**`:''}. Intervals are Wilson 95%.`,'',
  'Re-run for the next reader: `cd psys2 && node scripts/real-use-eval.mjs --inherit ../management/real-use/<this dir>` → judge the new cards → `node scripts/real-use-eval.mjs --report <new dir>`.','');
 const by=(list,f)=>{const m=new Map();for(const r of list){const k=f(r);(m.get(k)??m.set(k,[]).get(k)).push(r);}return m;};
 // HEADLINE (owner format): both suites, per tab, L0 / L1 / L2+ with counts and Wilson CIs.
 const cnt=(k,n)=>n?`${k} · ${pct(k,n)}`:'-';
 L.push('## Headline: levels per tab, fixed 1% (A) and fresh 1% (B)','','L0 nothing/refused · L1 understood but wrong or only a fragment · L2+ reasonable or better (phase target). Cells: count · % [95% CI].','',
  '| tab | suite | n | L0 | L1 | **L2+** |','|---|---|---|---|---|---|');
 for(const w of [...ORDER,'ALL'])for(const S of ['A','B']){const list=rows.filter(x=>(x.sets??[]).includes(S)&&(w==='ALL'||x.world===w)),n=list.length;if(!n)continue;const c=v=>list.filter(x=>x.level===v).length;
  L.push(`| ${w} | ${S} | ${n} | ${cnt(c('L0'),n)} | ${cnt(c('L1'),n)} | **${cnt(c('L2')+c('L3')+c('L4'),n)}** |`);}
 L.push('');
 // Top causes of L0 and L1, by layer, with examples.
 for(const lv of ['L0','L1']){const list=rows.filter(r=>r.level===lv),groups=[...by(list,r=>(r.j.layer||'-')+' / '+(r.j.pattern||'untagged'))].sort((a,b)=>b[1].length-a[1].length).slice(0,10);
  L.push(`## Top ${lv} causes (layer / pattern), ${list.length} rows`,'','| # | layer / pattern | rows | tabs | examples (asked → happened) |','|---|---|---|---|---|');
  groups.forEach(([g,x],i)=>{const tabs=[...by(x,r=>r.world)].sort((a,b)=>b[1].length-a[1].length).map(([t,y])=>`${t} ${y.length}`).join(', ');
   const ex=x.filter(r=>r.world==='drawing'||r.world==='diagram').concat(x).filter((r,k,arr)=>arr.indexOf(r)===k).slice(0,2).map(r=>`“${cell(r.text).slice(0,80)}” → ${cell(r.res.reply).slice(0,90)}${r.res.svg?` ([png](png/${r.res.svg}.png))`:''}`).join('<br>');
   L.push(`| ${i+1} | ${g} | ${x.length} | ${tabs} | ${ex} |`);});
  const lay=[...by(list,r=>r.j.layer||'-')].sort((a,b)=>b[1].length-a[1].length).map(([l,x])=>`${l} ${x.length}`).join(', ');L.push('',`Layers: ${lay}.`,'');}
 if(existsSync(path.join(dir,'findings.md')))L.push(readFileSync(path.join(dir,'findings.md'),'utf8').trim(),'');
 // Short supporting sections.
 {const P=['clean-success','partial','answer-or-no-change','answer-with-caveat','refused','no-executable-circuit','error'];
  L.push('## Reply patterns (every recorded row, no judging)','','| tab | suite | n | '+P.join(' | ')+' |','|---|---|---|'+P.map(()=>'---').join('|')+'|');
  for(const w of [...ORDER,'ALL'])for(const S of ['A','B']){const list=[...sample.values()].filter(r=>(r.setsAll??[]).includes(S)&&(w==='ALL'||r.world===w)&&res.has(r.id));if(!list.length)continue;
   const c=new Map();for(const r of list){const p=replyPattern(res.get(r.id));c.set(p,(c.get(p)??0)+1);}
   L.push(`| ${w} | ${S} | ${list.length} | `+P.map(p=>c.get(p)?`${(100*c.get(p)/list.length).toFixed(0)}%`:'-').join(' | ')+' |');}
  L.push('');}
 const table=(title,groups)=>{L.push(`## ${title}`,'','| class | n | L0 | L1 | **L2+** |','|---|---|---|---|---|');
  for(const [g,list]of groups){const n=list.length,c=v=>list.filter(r=>r.level===v).length;L.push(`| ${g} | ${n} | ${cnt(c('L0'),n)} | ${cnt(c('L1'),n)} | **${cnt(c('L2')+c('L3')+c('L4'),n)}** |`);}
  L.push('');};
 for(const w of ['drawing','diagram'])table(`${w} per class (A+B pooled)`,[...by(rows.filter(r=>r.world===w),r=>r.class)].sort((a,b)=>b[1].length-a[1].length));
 {const fin=[...by(rows.filter(r=>r.level==='L2'),r=>r.j.pattern||'-')].sort((a,b)=>b[1].length-a[1].length);L.push('## Finesse notes (L2 rows; later-phase work, not failures)','',fin.map(([p,x])=>`${p} ${x.length}`).join(', '),'');}
 const below=rows.filter(r=>r.level<'L3');L.push(`Reply honest about what was not done (rows below L3): ${pct(below.filter(r=>r.j.honest==='yes').length,below.length)}.`,'');
 const r=rng(20261120);
 for(const v of LV){const all=rows.filter(x=>x.level===v);if(!all.length)continue;const list=all.map(x=>({x,k:(x.world==='drawing'||x.world==='diagram'?0:1)+r()})).sort((a,b)=>a.k-b.k).slice(0,12).map(o=>o.x).sort((a,b)=>ORDER.indexOf(a.world)-ORDER.indexOf(b.world));
  L.push(`## Examples ${v} (${list.length} of ${all.length})`,'','| tab / class | request | reply | note | image |','|---|---|---|---|---|');
  for(const x of list)L.push(`| ${x.world} / ${x.class} | ${cell(x.text).slice(0,140)} | ${cell(x.res.reply).slice(0,140)} | ${cell(x.j.note).slice(0,100)} | ${x.res.svg?`[png](png/${x.res.svg}.png)`:'-'} |`);
  L.push('');}
 writeFileSync(path.join(dir,'REPORT.md'),L.join('\n')+'\n');
 return rows.length;
}
