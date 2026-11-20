// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. Aggregates mass-eval records into summary.md / summary.json / failures.jsonl /
// missing-capabilities.md. Rates are population estimates: each sampled row carries the weight N_stratum/n_stratum
// (1 in the full mode); intervals are Wilson 95% on the effective sample size.
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const OK=new Set(['success','plausible']);
const TABS=['drawing','diagram','document','calendar','avatar'];
const pct=x=>x===null||Number.isNaN(x)?'–':(100*x).toFixed(1)+'%';
function wilson(p,n,z=1.96){if(!n)return [null,null];const d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-h),Math.min(1,c+h)];}
/** Weighted rate of pred over rows (excluded rows left out), with Wilson interval on n_eff. */
function rate(rows,level,pred=v=>OK.has(v)){
 const xs=rows.filter(r=>r.levels?.[level]&&r.levels[level].verdict!=='excluded');
 if(!xs.length)return {n:0,p:null,lo:null,hi:null};
 let sw=0,sw2=0,sy=0;for(const r of xs){const w=r.weight??1;sw+=w;sw2+=w*w;if(pred(r.levels[level].verdict))sy+=w;}
 const p=sy/sw,neff=sw*sw/sw2,[lo,hi]=wilson(p,neff);return {n:xs.length,p,lo,hi,neff};
}
const fmt=r=>r.n?`${pct(r.p)} [${pct(r.lo)}–${pct(r.hi)}]`:'–';
const under=r=>r.n<20||(r.hi!==null&&r.hi-r.lo>0.3);

function causeTable(results,level,{filter=()=>true}={}){
 const m=new Map();
 for(const r of results){const l=r.levels?.[level];if(!l||OK.has(l.verdict)||l.verdict==='excluded'||!l.cause||!filter(r,l))continue;
  const e=m.get(l.cause)??{cause:l.cause,layer:l.layer,rows:0,estimate:0,tabs:{},examples:[],details:{}};
  e.rows++;e.estimate+=r.weight??1;e.tabs[r.world]=(e.tabs[r.world]??0)+1;if(e.examples.length<3)e.examples.push({id:r.id,text:r.text});
  if(l.causeDetail&&typeof l.causeDetail==='string')e.details[l.causeDetail]=(e.details[l.causeDetail]??0)+1;m.set(l.cause,e);}
 return [...m.values()].sort((a,b)=>b.estimate-a.estimate||b.rows-a.rows);
}
const groupBy=(xs,f)=>{const m=new Map();for(const x of xs)for(const k of [].concat(f(x))){if(!m.has(k))m.set(k,[]);m.get(k).push(x);}return m;};

export function writeReports(out,allResults,meta,{withFailures=true}={}){
 const fatal=allResults.filter(r=>r.fatal),results=allResults.filter(r=>!r.fatal);
 const levels=meta.levels.filter(l=>results.some(r=>r.levels?.[l]));
 const L=[];const w=s=>L.push(s);
 w(`# PSys2 mass evaluation — ${meta.date} @ ${meta.commit}`);
 w('');
 w(`Mode: **${meta.mode}**, seed \`${meta.seed}\`. Rows loaded: ${meta.rowsLoaded} (${Object.entries(meta.sources).map(([k,v])=>k+' '+v).join(', ')}); evaluated: **${meta.evaluated}**. `+
  `Levels: ${levels.join(', ')}${fatal.length?` (${fatal.length} rows failed in the harness: ${[...new Set(fatal.map(r=>r.fatal))].slice(0,3).join('; ')})`:''}. Runtime ${meta.seconds.toFixed(0)} s with ${meta.workers} workers (${meta.rowsPerSecond.toFixed(2)} rows/s, each row at every level).`);
 w('');
 w('**Verdicts** (scripts/mass-eval/judge.mjs, on the instance-world diff of the tab\'s SOP area): `success` — acted and every comparable expectation held (kind, count, values, relations geometrically, target, answer); '+
  '`plausible` — acted on the right objects but some expectations had no comparable observation (degree words, values without an observed input); `wrong-effect` — acted but a hard expectation failed; '+
  '`refused` — no effect (bridge diagnostics or execution refusal); `error`; `excluded` — needs journal history (undo/redo), not in the denominators. '+
  '**Rate = success + plausible**; strict = success only. Rates are population estimates (weights N/n per tab × usage class stratum) with Wilson 95% intervals; *under-sampled* = n < 20 or interval wider than 30 points.');
 w('');
 w('**Oracle** = the gold labels as the reader output (trainer view: two-class determiners, closed-bank values outside the bank dropped; `needs` removed) through the real key-reader pipeline, bridge, compiler and executor; it measures the runtime independently of the reader. **End-to-end** = the deployed SOP-BERT bundle reads the text with context and previous message. A reader-induced failure is a row the oracle executes and the deployed reader does not.');
 w('');
 // per tab
 w('## Success per tab');
 w('');
 w('| tab | population | n | oracle | oracle strict | end-to-end | e2e strict | reader-induced | excluded |');
 w('|---|---:|---:|---|---|---|---|---:|---:|');
 const tabRows=t=>results.filter(r=>r.world===t);
 const readerInduced=xs=>xs.filter(r=>r.levels?.oracle&&OK.has(r.levels.oracle.verdict)&&r.levels?.e2e&&!OK.has(r.levels.e2e.verdict)&&r.levels.e2e.verdict!=='excluded').length;
 for(const t of [...TABS,'all']){const xs=t==='all'?results:tabRows(t);if(!xs.length)continue;
  w(`| ${t} | ${t==='all'?meta.rowsLoaded:meta.populationByTab?.[t]??''} | ${xs.length} | ${fmt(rate(xs,'oracle'))} | ${pct(rate(xs,'oracle',v=>v==='success').p)} | ${fmt(rate(xs,'e2e'))} | ${pct(rate(xs,'e2e',v=>v==='success').p)} | ${readerInduced(xs)} | ${xs.filter(r=>r.levels?.oracle?.verdict==='excluded').length} |`);}
 w('');
 // verdict distribution
 w('## Verdicts and layers');
 w('');
 for(const level of levels){
  const xs=results.filter(r=>r.levels?.[level]);const v=groupBy(xs,r=>r.levels[level].verdict),ly=groupBy(xs.filter(r=>!OK.has(r.levels[level].verdict)),r=>r.levels[level].layer??'?');
  w(`- **${level}** verdicts: ${[...v].sort((a,b)=>b[1].length-a[1].length).map(([k,x])=>`${k} ${x.length}`).join(', ')}; failure layers: ${[...ly].sort((a,b)=>b[1].length-a[1].length).map(([k,x])=>`${k} ${x.length}`).join(', ')}`);
 }
 w('');
 // per usage class
 w('## Success per tab × usage class');
 w('');
 w('| tab | usage class | population | n | oracle | end-to-end | top oracle cause |');
 w('|---|---|---:|---:|---|---|---|');
 for(const [k,xs]of [...groupBy(results,r=>r.world+'|'+r.uclass)].sort()){const [t,c]=k.split('|'),o=rate(xs,'oracle'),e=rate(xs,'e2e'),top=causeTable(xs,'oracle')[0];
  w(`| ${t} | ${c}${under(o)?' *(under-sampled)*':''} | ${meta.populationByClass?.[k]??''} | ${xs.length} | ${fmt(o)} | ${fmt(e)} | ${top?top.cause+' ('+top.rows+')':''} |`);}
 w('');
 w('## Success per usage class (all tabs)');
 w('');
 w('| usage class | n | oracle | end-to-end |');w('|---|---:|---|---|');
 for(const [c,xs]of [...groupBy(results,r=>r.uclass)].sort((a,b)=>b[1].length-a[1].length))w(`| ${c} | ${xs.length} | ${fmt(rate(xs,'oracle'))} | ${fmt(rate(xs,'e2e'))} |`);
 w('');
 w('## Success per operation (act on target family)');
 w('');
 w('| operation | n | oracle | end-to-end |');w('|---|---:|---|---|');
 for(const [c,xs]of [...groupBy(results,r=>r.acts.length?r.acts:['(no request)'])].sort((a,b)=>b[1].length-a[1].length))w(`| ${c} | ${xs.length} | ${fmt(rate(xs,'oracle'))} | ${fmt(rate(xs,'e2e'))} |`);
 w('');
 w('## Success per key family');
 w('');
 w('Rows that carry a constraint on the key (a row counts for each of its keys).');
 w('');
 w('| key | n | oracle | end-to-end |');w('|---|---:|---|---|');
 for(const [c,xs]of [...groupBy(results.filter(r=>r.keys.length),r=>r.keys)].sort((a,b)=>b[1].length-a[1].length))w(`| ${c} | ${xs.length} | ${fmt(rate(xs,'oracle'))} | ${fmt(rate(xs,'e2e'))} |`);
 w('');
 w('## Source datasets');
 w('');
 w('| source | n | oracle | end-to-end |');w('|---|---:|---|---|');
 for(const [c,xs]of [...groupBy(results,r=>r.source)].sort((a,b)=>b[1].length-a[1].length))w(`| ${c} | ${xs.length} | ${fmt(rate(xs,'oracle'))} | ${fmt(rate(xs,'e2e'))} |`);
 w('');
 if(levels.includes('e2e')){
  w('## Deployed reader vs labels (field level)');
  w('');
  const rs=results.map(r=>r.levels?.e2e?.reading).filter(Boolean),agg={};let tp=0,fp=0,fn=0,exact=0;
  for(const x of rs){if(x.exact)exact++;tp+=x.constraints.tp;fp+=x.constraints.fp;fn+=x.constraints.fn;for(const [f,v]of Object.entries(x.fields??{})){agg[f]??={ok:0,n:0};agg[f].ok+=v.ok;agg[f].n+=v.n;}}
  w(`Exact reading (all fields, all constraints, same request count): **${pct(exact/Math.max(1,rs.length))}** of ${rs.length} rows. Constraints (key+operator+phase): precision ${pct(tp/Math.max(1,tp+fp))}, recall ${pct(tp/Math.max(1,tp+fn))}.`);
  w('');w('| field | accuracy | n |');w('|---|---|---:|');
  for(const [f,v]of Object.entries(agg))w(`| ${f} | ${pct(v.ok/v.n)} | ${v.n} |`);
  w('');
  const ri=causeTable(results,'e2e',{filter:(r,l)=>l.layer==='reader'}).slice(0,15);
  w('Reader-layer failures (the reader own diagnostics, or the oracle executes and end-to-end does not; reader-induced in the tab table counts only the latter):');w('');
  w('| rows | estimate | first reading difference | example |');w('|---:|---:|---|---|');
  for(const c of ri)w(`| ${c.rows} | ${Math.round(c.estimate)} | ${c.cause.replace(/\|/g,'/')} | ${JSON.stringify(c.examples[0].text).slice(0,90).replace(/\|/g,'/')} |`);
  w('');
 }
 const ranked=causeTable(results,'oracle');
 w('## Top 20 missing capabilities (oracle level)');
 w('');
 w('Ranked by estimated rows affected in the whole data (sample rows × stratum weight); full list with examples: missing-capabilities.md.');
 w('');
 w('| # | layer | cause | sample rows | est. rows | tabs |');w('|---:|---|---|---:|---:|---|');
 ranked.slice(0,20).forEach((c,i)=>w(`| ${i+1} | ${c.layer} | ${c.cause.replace(/\|/g,'/')} | ${c.rows} | ${Math.round(c.estimate)} | ${Object.entries(c.tabs).map(([k,v])=>k+' '+v).join(', ')} |`));
 w('');
 w('## Under-sampled strata');
 w('');
 const us=[...groupBy(results,r=>r.world+'|'+r.uclass)].filter(([,xs])=>under(rate(xs,'oracle'))).map(([k,xs])=>`${k} (n=${xs.length})`);
 w(us.length?us.join(', '):'none');
 w('');
 w(`Timing: mean route time per row ${levels.map(l=>{const xs=results.filter(r=>r.levels?.[l]);return l+' '+(xs.reduce((s,r)=>s+(r.levels[l].ms??0),0)/Math.max(1,xs.length)).toFixed(0)+' ms';}).join(', ')}.`);
 writeFileSync(path.join(out,'summary.md'),L.join('\n')+'\n');

 // missing capabilities
 const M=[];const m=s=>M.push(s);
 m(`# Missing capabilities — ${meta.date} @ ${meta.commit}`);m('');
 m(`From the mass evaluation (${meta.mode}, ${meta.evaluated} rows). Each cause is the first failing reusable piece of a row (oracle level: the labels are the reading). "est. rows" scales the sample by the stratum weights. Layers: bindings (no bound property/kind/value representation), knowledge (kind words not in the catalog binding), rule (bridge projection/rule missing), no-operation (no declared capability for act+family+keys), execution (refused at execution or target), wrong-effect (acted, expectation failed), needs (labelled meaning without a key), setup (context object not creatable by the area's commands), data (labels inconsistent with the text).`);
 m('');
 for(const level of levels){
  const rk=causeTable(results,level);
  m(`## ${level==='oracle'?'Oracle level (runtime, independent of the reader)':'End-to-end level (deployed reader)'}`);m('');
  rk.slice(0,level==='oracle'?150:60).forEach((c,i)=>{
   m(`${i+1}. **${c.cause}** — ${c.rows} sample rows, ≈${Math.round(c.estimate)} rows in the data; layer ${c.layer}; ${Object.entries(c.tabs).map(([k,v])=>k+' '+v).join(', ')}`);
   const d=Object.entries(c.details).sort((a,b)=>b[1]-a[1]).slice(0,12);if(d.length)m(`   - values: ${d.map(([k,v])=>`${k} (${v})`).join(', ')}`);
   for(const e of c.examples)m(`   - \`${e.id}\`: ${JSON.stringify(e.text).slice(0,160)}`);
  });
  m('');
 }
 m('## Top causes per stratum (oracle)');m('');
 for(const [k,xs]of [...groupBy(results,r=>r.world+'|'+r.uclass)].sort()){const rk=causeTable(xs,'oracle').slice(0,3);if(!rk.length)continue;m(`- **${k}** (n=${xs.length}): ${rk.map(c=>`${c.cause} (${c.rows})`).join('; ')}`);}
 writeFileSync(path.join(out,'missing-capabilities.md'),M.join('\n')+'\n');

 if(withFailures){
  const F=[];
  for(const r of results)for(const level of levels){const l=r.levels?.[level];if(!l||OK.has(l.verdict))continue;
   F.push(JSON.stringify({id:r.id,text:r.text,world:r.world,uclass:r.uclass,level,verdict:l.verdict,layer:l.layer??null,reason:l.cause??null,underlying:l.underlying??null,allCauses:l.allCauses??null,
    failedChecks:l.failedChecks,diff:l.diff,bridgeFailures:l.failures,executionReason:l.reason,reply:l.reply,setupFailures:l.setupFailures,reading:l.reading?{first:l.reading.first,exact:l.reading.exact}:undefined}));}
  writeFileSync(path.join(out,'failures.jsonl'),F.join('\n')+'\n');
 }
 const summary={meta,tabs:Object.fromEntries([...TABS,'all'].map(t=>{const xs=t==='all'?results:tabRows(t);return [t,Object.fromEntries(levels.map(l=>[l,rate(xs,l)]))];})),
  classes:Object.fromEntries([...groupBy(results,r=>r.world+'|'+r.uclass)].map(([k,xs])=>[k,Object.fromEntries(levels.map(l=>[l,rate(xs,l)]))])),
  topCauses:Object.fromEntries(levels.map(l=>[l,causeTable(results,l).slice(0,60).map(({cause,layer,rows,estimate,tabs,examples})=>({cause,layer,rows,estimate:Math.round(estimate),tabs,examples}))]))};
 writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,1)+'\n');
}
