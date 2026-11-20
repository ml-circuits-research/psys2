// SPDX-License-Identifier: AGPL-3.0-only
// Official real-use test: a plain RANDOM fixed-seed ~1% sample of the official training dataset (all tabs).
// No stratification. Classes are only computed afterwards, for reporting.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {PSYS2} from './paths.mjs';

export function rng(seed){let a=seed>>>0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const hashSeed=s=>parseInt(createHash('sha256').update(String(s)).digest('hex').slice(0,8),16);

export function loadTrain(){
 return gunzipSync(readFileSync(path.join(PSYS2,'official-dataset/train.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
}

/** Random sample: each row independently with a seeded order; the first round(rate*N) of a seeded shuffle. */
export function randomSample(rows,{rate=0.01,seed='real-use-v1'}={}){
 const r=rng(hashSeed(seed)),idx=rows.map((_,i)=>i);
 for(let i=idx.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
 return idx.slice(0,Math.round(rate*rows.length)).sort((a,b)=>a-b).map(i=>rows[i]);
}

const PEOPLE=/\b(person|people|man|men|woman|women|boy|girl|kid|child|children|baby|mom|mum|dad|mother|father|family|friend|teacher|doctor|grandma|grandpa|someone|player|king|queen|princess|nurse|farmer|figure)s?\b/i;
/** Reporting class (one per row, first match wins). */
export function realUseClass(r){
 const q=r.requests??[];
 if(r.context?.previous)return 'follow-up';
 if(!q.length)return 'no-request';
 if(q.length>1)return 'compound';
 const x=q[0],a=x.act,t=x.target??{},cs=x.constraints??[],keys=cs.map(c=>c.key).join(' ');
 if(a==='answer'||x.mood==='ask'||x.mood==='check')return 'question';
 if(['undo','redo','repeat'].includes(a))return 'history';
 if(/chart|series|point|bar|slice/.test((t.type??'')+' '+keys+' '+(t.kind??'')))return 'chart';
 if(a==='connect'||a==='disconnect'||/^(link|edge|arrow)/.test(t.type??''))return 'link';
 if(PEOPLE.test(String(t.kind??'')+' '+String(t.kind_span??''))||['face','part'].includes(t.type))return 'people';
 if(a==='place'||cs.some(c=>c.operator==='relation'||/\.(relation|anchor)$/.test(c.key)))return 'place/relate';
 if(a==='make'&&t.mode!=='existing')return 'create';
 return 'edit';
}
export function tierOf(r){
 const s=String(r.style??'');
 return /complex|tangle/.test(s)?'complex':/simplif/.test(s)?'simplified':/typo|asr|robust/.test(s)?'noisy':/equivalent|natural|direct|human/.test(s)?'natural':/haiku/.test(s)?'haiku':/mechanical/.test(s)?'mechanical':s||'-';
}
