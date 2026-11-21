#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Compares two real-use runs of the same rows row by row (typically `--browser` against the Node runner):
//   same            identical outcome (reply, objects created/changed/removed);
//   differs, same grade / browser worse / browser better   by the Stage-A grade (judgments) or, for undecided rows, the deterministic judge verdict.
// Also prints wall-time percentiles per tab and the browser's watchdog stops, engine worker starts and kills.
// usage: node scripts/real-use/compare-runs.mjs <run dir A (browser)> <run dir B (node)> [--rows]
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

const [A,B]=process.argv.slice(2).filter(a=>!a.startsWith('--')).map(d=>path.resolve(d));
if(!A||!B){console.error('usage: compare-runs.mjs <browser run> <node run> [--rows]');process.exit(2);}
const rowsOut=process.argv.includes('--rows');
const jsonl=f=>existsSync(f)?readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const byId=list=>new Map(list.map(r=>[r.id,r]));
const grades=d=>byId([...jsonl(path.join(d,'judgments-a.jsonl')),...jsonl(path.join(d,'judgments-b.jsonl'))]);
const ra=byId(jsonl(path.join(A,'results.jsonl'))),rb=byId(jsonl(path.join(B,'results.jsonl'))),ga=grades(A),gb=grades(B);
const sample=byId(jsonl(path.join(A,'sample.jsonl')));
const LEVEL={useless:0,wrong:1,partial:1,full:2},JUDGE={success:2,plausible:2,partial:1};
const level=(g,r)=>g?LEVEL[g.verdict]:JUDGE[r?.stageA?.judge?.verdict]??0;
const strip=({id,...o})=>o;
const sig=r=>JSON.stringify([r.reply,(r.created??[]).map(strip),(r.changed??[]).map(c=>[c.kind,c.keys,c.after]),(r.removed??[]).map(o=>o.kind)]);
const counts={},rows=[];
for(const [id,a] of ra){const b=rb.get(id);if(!b)continue;
 const la=level(ga.get(id),a),lb=level(gb.get(id),b);
 const cat=sig(a)===sig(b)?'same':la<lb?'browser worse':la>lb?'browser better':'differs, same grade';
 counts[cat]=(counts[cat]??0)+1;rows.push({id,cat,a,b});}
console.log(`rows compared ${rows.length}:`,counts);
const pct=(x,p)=>{const s=[...x].sort((m,n)=>m-n);return s.length?s[Math.min(s.length-1,Math.floor(s.length*p))]:null;};
for(const tab of [...new Set(rows.map(r=>sample.get(r.id)?.world))]){
 const sel=rows.filter(r=>sample.get(r.id)?.world===tab),wa=sel.map(r=>r.a.browser?.wallMs??r.a.ms).filter(Number.isFinite),wb=sel.map(r=>r.b.browser?.wallMs??r.b.ms).filter(Number.isFinite);
 console.log(`${tab}: A p50 ${pct(wa,.5)} p90 ${pct(wa,.9)} max ${Math.max(...wa)} >8s ${wa.filter(x=>x>8000).length} | B p50 ${pct(wb,.5)} p90 ${pct(wb,.9)} max ${Math.max(...wb)} >8s ${wb.filter(x=>x>8000).length}`);
}
const sum=k=>rows.reduce((s,r)=>s+(Number(r.a.browser?.[k])||0),0);
console.log(`A watchdog stops ${rows.filter(r=>r.a.browser?.watchdog).length}, engine worker starts ${sum('workerStarts')}, kills ${sum('kills')}`);
if(rowsOut)for(const {id,cat,a,b} of rows.filter(r=>r.cat!=='same')){
 console.log(`--- ${cat} ${id} | ${sample.get(id)?.text?.slice(0,100)}`);
 console.log(`   A: ${(a.reply??'').slice(0,160)} | +${(a.created??[]).map(o=>o.kind)} ~${(a.changed??[]).map(c=>c.kind+':'+c.keys)}${a.browser?.watchdog?' [watchdog]':''}${a.browser?.kills?' [kills '+a.browser.kills+']':''}`);
 console.log(`   B: ${(b.reply??'').slice(0,160)} | +${(b.created??[]).map(o=>o.kind)} ~${(b.changed??[]).map(c=>c.kind+':'+c.keys)}`);
}
