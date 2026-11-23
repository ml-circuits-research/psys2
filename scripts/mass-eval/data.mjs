// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. Loads every labelled row we have (official-dataset train/dev/test and the data-drop batches the
// data worker announced DONE in management/questions.md), classifies each row (usage class, operation, key
// families) and draws the stratified sample of the quick mode.
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';

const lines=text=>text.split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l));

/** Data-drop batches announced DONE ("## DONE-<batch>") in management/questions.md. */
export function doneDropBatches(managementRoot){
 const q=path.join(managementRoot,'questions.md');if(!existsSync(q))return [];
 return [...readFileSync(q,'utf8').matchAll(/^## DONE-([A-Za-z0-9._-]+)/gm)].map(m=>m[1]).filter(b=>existsSync(path.join(managementRoot,'data-drop',b)));
}

export function loadRows({root,managementRoot,drops=true,human=true}){
 const off=path.join(root,'official-dataset'),rows=[],seen=new Set(),sources={};
 const key=r=>r.world+'\u0000'+r.text+'\u0000'+JSON.stringify(r.context??{});
 // needs: a list of {frame,...} per request (some drops write one object or null).
 const norm=r=>{for(const q of r.requests??[]){if(q.needs===null||q.needs===undefined)delete q.needs;else if(!Array.isArray(q.needs))q.needs=[q.needs];}return r;};
 const push=(r,src)=>{norm(r);const k=key(r);if(seen.has(k)){sources[src+':duplicate']=(sources[src+':duplicate']??0)+1;return;}seen.add(k);rows.push(r);sources[src]=(sources[src]??0)+1;};
 for(const name of ['train.jsonl.gz','dev.jsonl','test.jsonl'])if(!existsSync(path.join(off,name)))throw new Error(path.join(off,name)+' is missing: run python3 official-dataset/sop_dataset.py load');
 for(const r of lines(gunzipSync(readFileSync(path.join(off,'train.jsonl.gz'))).toString('utf8')))push(r,'official');
 for(const s of ['dev','test'])for(const r of lines(readFileSync(path.join(off,s+'.jsonl'),'utf8')))push(r,'official');
 const batches=drops&&managementRoot?doneDropBatches(managementRoot):[];
 for(const b of batches){
  const dir=path.join(managementRoot,'data-drop',b);
  for(const world of ['drawing','diagram','document','calendar','avatar']){
   const f=path.join(dir,world+'.jsonl');if(!existsSync(f))continue;
   lines(readFileSync(f,'utf8')).forEach((r,i)=>push({...r,world:r.world??world,id:r.id??`data-drop:${b}:${world}:${i}`,source:'data-drop:'+b,operation:r.operation??(r.classes??[]).join('+'),context:r.context??{existing:[],previous:null}},'data-drop:'+b));
  }
 }
 if(human){const dir=path.join(root,'training/sop-bert/benchmarks/human-benchmark-v1/items');
  for(const world of ['drawing','diagram','document','calendar','avatar']){const f=path.join(dir,world+'.jsonl');if(!existsSync(f))continue;
   for(const item of lines(readFileSync(f,'utf8'))){if(item.session?.length){sources['human-benchmark-v1:session-skipped']=(sources['human-benchmark-v1:session-skipped']??0)+1;continue;}
    push({id:'human-benchmark-v1:'+item.id,world,text:item.text,context:{existing:item.context?.existing??[],previous:null},requests:expectRequests(world,item.expect),source:'human-benchmark-v1',operation:(item.construction??[]).join('+')||'-',
     __levels:['e2e'],__expect:true},'human-benchmark-v1');}
  }}
 return {rows,sources,batches};
}

// human-benchmark-v1 items carry semantic effects, not reader labels: they become judge-only requests (end-to-end
// level only; the oracle needs reader-shaped labels). Families per tab are the dataset's target families.
const FAMILY={drawing:'drawn',diagram:'node',document:'section',calendar:'meeting',avatar:'part'};
function expectRequests(world,expect){
 const type=FAMILY[world],out=[];
 for(const e of expect?.effects??[]){
  const cs=[];const rel=e.relation?[{key:type+'.relation',value:e.relation.rel,operator:'relation',phase:'result'},{key:type+'.anchor',value:e.relation.landmark,value_span:e.relation.landmark,operator:'relation',phase:'selector'}]:[];
  const target=e.target==='all'?{type,mode:'existing',fill:'all'}:e.target?{type,mode:'existing',fill:'written',name_span:e.target}:{type,mode:'existing'};
  if(e.type==='create'){for(const [k,v]of Object.entries(e.attrs??{}))cs.push({key:type+'.'+k,value:String(v),operator:'eq',phase:'result'});out.push({act:'make',target:{type,mode:'new',...(e.kind?{kind:e.kind}:{}),...(Number.isSafeInteger(e.count)?{count:e.count}:{})},constraints:[...cs,...rel]});}
  else if(e.type==='change')out.push({act:'change',target,constraints:e.property?[{key:type+'.'+e.property,...(e.value!==undefined?{value:String(e.value)}:{}),operator:'eq',phase:'result'}]:[]});
  else if(e.type==='move')out.push({act:'place',target,constraints:rel});
  else if(e.type==='remove')out.push({act:'remove',target,constraints:[]});
  else if(e.type==='connect')out.push({act:'connect',target:{type:'link',mode:'new'},constraints:[]});
  else if(e.type==='layout')out.push({act:'arrange',target,constraints:[]});
  else if(e.type==='query')out.push({act:'answer',mood:'ask',target:{type,mode:'existing'},constraints:[]});
 }
 return out;
}

/** Usage class: the construction a row exercises (one class per row). */
export function usageClass(r){
 const q=r.requests??[];
 if(!q.length)return 'no-request';
 if(q.length>1)return 'multi-request';
 const x=q[0],a=x.act,t=x.target??{},cs=x.constraints??[];
 if(x.needs?.length)return 'needs';
 if(['undo','redo','repeat'].includes(a))return 'history';
 if(a==='answer'||x.mood==='ask'||x.mood==='check')return 'question';
 const rel=cs.some(c=>c.operator==='relation'||/\.relation$/.test(c.key));
 if(cs.some(c=>c.operator==='delta'))return 'comparative';
 if(a==='make'&&t.mode!=='existing'){
  if(rel)return 'create-relation';
  if(t.count_span||t.quantifier)return 'create-quantity';
  if(cs.some(c=>c.phase==='result'))return 'create-with-attributes';
  return 'create';
 }
 if(a==='place')return rel?'place-relation':'place';
 if(a==='change')return t.fill==='all'?'edit-population':t.fill==='context'?'edit-context':'edit';
 if(a==='remove')return 'remove';
 if(a==='connect'||a==='disconnect')return 'connect';
 if(a==='select')return 'select';
 return 'structure';
}
export const rowKeys=r=>[...new Set((r.requests??[]).flatMap(q=>(q.constraints??[]).map(c=>r.world+'.'+c.key)))];
export const rowActs=r=>[...new Set((r.requests??[]).map(q=>r.world+'.'+q.act+':'+(q.target?.type??'-')))];

/** Deterministic PRNG (mulberry32). */
export function rng(seed){let a=seed>>>0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const hashSeed=s=>parseInt(createHash('sha256').update(String(s)).digest('hex').slice(0,8),16);

/** Stratified sample: strata = tab x usage class; per stratum max(min, rate*N) (all rows of small strata);
 * then every (tab, operation) and every key family gets at least opMin / keyMin rows. Each row carries the
 * weight N_stratum / n_stratum so that tab and overall rates are population estimates. */
export function stratifiedSample(rows,{rate=0.01,min=20,opMin=3,keyMin=5,seed=1,perTab=null}={}){
 const random=rng(hashSeed(seed)),strata=new Map();
 for(const r of rows){const s=r.world+'|'+usageClass(r);if(!strata.has(s))strata.set(s,[]);strata.get(s).push(r);}
 const chosen=new Set();
 const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const plan={};
 for(const [s,list]of [...strata].sort()){
  const n=perTab?Math.min(list.length,Math.max(1,Math.round(perTab/[...strata.keys()].filter(k=>k.split('|')[0]===s.split('|')[0]).length))):Math.min(list.length,Math.max(min,Math.ceil(rate*list.length)));
  for(const r of shuffle(list).slice(0,n))chosen.add(r);plan[s]={N:list.length,n};
 }
 if(!perTab){
  const top=(groups,need)=>{for(const list of groups.values()){const have=list.filter(r=>chosen.has(r)).length;if(have>=need)continue;for(const r of shuffle(list.filter(r=>!chosen.has(r))).slice(0,need-have))chosen.add(r);}};
  const byOp=new Map(),byKey=new Map();
  for(const r of rows){const o=r.world+'|'+(r.operation??'-');(byOp.get(o)??byOp.set(o,[]).get(o)).push(r);for(const k of rowKeys(r))(byKey.get(k)??byKey.set(k,[]).get(k)).push(r);}
  top(byOp,opMin);top(byKey,keyMin);
 }
 const sample=[...chosen];
 for(const [s,list]of strata){const n=list.filter(r=>chosen.has(r)).length;plan[s].n=n;}
 for(const r of sample){const p=plan[r.world+'|'+usageClass(r)];r.__weight=p.N/p.n;}
 return {sample,plan};
}
