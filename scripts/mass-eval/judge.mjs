// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. Semantic judging of one executed row: the labelled requests (act, target, constraints) against
// the instance-world diff of the tab's SOP area (observation before/after), plus the failure layer and a
// capability "cause" for every row that did not succeed. Nothing here feeds back into the runtime.
import {colorHex} from '../../worlds/art.draw/scene.mjs';
import {positiveCardinalProof} from '../../src/dialog/key-reader-value-proof.mjs';

const IGNORED_INPUTS=new Set(['selected','index','version']);
const TOP={drawing:/^art\.draw\.object$/,diagram:/^diagram\.sketch\.(node|link|group|series|point)$|^data\.charts\./,document:/^docs\.editor\.(document|section|block)$/,calendar:/^time\.calendar\./,avatar:/^ui\.avatar\./};
const lc=s=>String(s??'').toLowerCase().trim();
const unq=v=>{const s=String(v);if(s.startsWith('"')){try{return JSON.parse(s);}catch{return s;}}return s;};
const singular=w=>{w=lc(w).replace(/^(the|a|an|that|this|those|these|my|her|his|its|some|all)\s+/,'');return w.endsWith('ies')?w.slice(0,-3)+'y':w.endsWith('ses')||w.endsWith('xes')||w.endsWith('ches')||w.endsWith('shes')?w.slice(0,-2):w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;};
const inputMap=o=>Object.fromEntries((o?.inputs??[]).map(i=>[i.key,i.values.map(unq)]));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};

/** The object-level diff of two observations. */
export function diffObservations(before,after,world){
 const top=o=>TOP[world]?.test(o.sourceType)??true;
 const b=new Map((before?.objects??[]).map(o=>[o.id,o])),a=new Map((after?.objects??[]).map(o=>[o.id,o]));
 const created=[...a.values()].filter(o=>!b.has(o.id)&&top(o)),removed=[...b.values()].filter(o=>!a.has(o.id)&&top(o)),changed=[];
 for(const [id,o]of a){const p=b.get(id);if(!p||!top(o))continue;const x=inputMap(p),y=inputMap(o),keys=new Set([...Object.keys(x),...Object.keys(y)]);
  const diff=[...keys].filter(k=>!IGNORED_INPUTS.has(k)&&JSON.stringify(x[k])!==JSON.stringify(y[k]));if(diff.length)changed.push({object:o,before:p,keys:diff});}
 const selection=[...a.values()].some(o=>{const p=b.get(o.id);return p&&JSON.stringify(inputMap(p).selected)!==JSON.stringify(inputMap(o).selected);});
 return {created,removed,changed,selection,touched:created.length+removed.length+changed.length};
}

const mentions=(o)=>{const m=inputMap(o);return [o.kind,o.id,...['name','label','title','drawing','kind','variant','text','layout'].flatMap(k=>m[k]??[])].map(lc).filter(Boolean);};
// Canonical kinds of the deployed binding table (lemma -> canonical per area): a label kind and an object kind
// agree when they are the same words or bind to the same canonical kind ("gurney" and "stretcher").
let KINDS=null;
export function setKindTable(bindings){KINDS=new Map();for(const r of bindings?.kinds??[]){const k=r.area+'|'+lc(r.lemma);if(!KINDS.has(k))KINDS.set(k,new Set());KINDS.get(k).add(r.canonical);}
 FAMILIES=new Set((bindings?.families??[]).map(f=>f.canonical));}
let FAMILIES=new Set();
// Declared key alignments of the live binding table (declared-bindings.mjs rule 5): a key observed under its native
// parameter's name (chart.grid as gridlines) and a said value as its declared parameter value (legend "hide" as none).
let ALIGNED=new Map();
export function setPropertyTable(bindings){ALIGNED=new Map();for(const r of bindings?.properties??[])if(r.alignment?.kind==='declared-key-parameter'&&r.hostBinding?.parameter)
 ALIGNED.set(r.area+'|'+r.key,{parameter:r.hostBinding.parameter,values:new Map((r.valueMap??[]).map(v=>[lc(v.said),String(v.value)]))});}
// A misspelt label kind ("diaamond") still names the object the application read as a close spelling.
function edit(a,b){if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
const canon=(world,w)=>KINDS?.get(world+'|'+lc(w))??KINDS?.get(world+'|'+singular(w))??null;
const matchesKind=(o,kind,world,alt)=>{if(!kind)return true;const ks=[kind,alt].filter(Boolean),words=mentions(o);
 if(words.some(w=>{const s=singular(w);return ks.some(kind=>{const k=singular(kind);return s===k||s.includes(k)||k.includes(s)&&s.length>2||k.length>=5&&edit(s,k)<=2;});}))return true;
 if(!world)return false;
 for(const k of ks){const c=canon(world,k);if(!c)continue;if([...c].some(x=>FAMILIES.has(x)))return true;// a family word ("step", "node") names any member
  if(words.some(w=>{const d=canon(world,w);return d&&[...d].some(x=>c.has(x));}))return true;}
 return false;};
const ORDINAL=[['tiny','small','medium','large','huge'],['short','medium','long'],['thin','medium','thick'],['narrow','medium','wide']];
const order=v=>{for(const sc of ORDINAL){const i=sc.indexOf(lc(v));if(i>=0)return {sc,i};}return null;};
const matchesName=(o,name)=>{if(!name)return true;const n=lc(name).replace(/^(the|a|an)\s+/,'');return mentions(o).some(w=>w===n||singular(w)===singular(n));};
function box(o){const m=inputMap(o),x=num(m.x?.[0]),y=num(m.y?.[0]);if(x===null||y===null)return null;const w=num(m.width?.[0])??num(m.size?.[0])??0,h=num(m.height?.[0])??num(m.size?.[0])??0;return {x,y,w,h,x0:x-w/2,x1:x+w/2,y0:y-h/2,y1:y+h/2};}
const RELATIONS={
 left_of:(a,b)=>a.x<b.x,left:(a,b)=>a.x<b.x,right:(a,b)=>a.x>b.x,right_of:(a,b)=>a.x>b.x,above:(a,b)=>a.y<b.y,below:(a,b)=>a.y>b.y,under:(a,b)=>a.y>b.y,over:(a,b)=>a.y<b.y,
 near:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=Math.max(a.w,a.h,b.w,b.h)*2.5+40,next_to:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=Math.max(a.w,a.h,b.w,b.h)*2.5+40,beside:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=Math.max(a.w,a.h,b.w,b.h)*2.5+40,
 in:(a,b)=>a.x>=b.x0&&a.x<=b.x1&&a.y>=b.y0&&a.y<=b.y1,inside:(a,b)=>a.x>=b.x0&&a.x<=b.x1&&a.y>=b.y0&&a.y<=b.y1,on:(a,b)=>a.x>=b.x0-a.w&&a.x<=b.x1+a.w&&a.y<=b.y1+a.h,
};
/** Value equality across representations: numbers, colour names vs hex, case and quotes. */
function sameValue(want,have,key){
 if(have===undefined||have===null)return false;
 const w=lc(want),h=lc(have);if(!w)return false;
 if(w===h)return true;
 if(num(w)!==null&&num(h)!==null)return Math.abs(num(w)-num(h))<1e-6;
 const card=positiveCardinalProof(String(want));if(card&&num(h)===card.value)return true;
 // A clock time against a start in milliseconds of the day (the calendar's representation).
 const clock=/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(w);
 if(clock&&/time|start/.test(key)&&num(h)!==null){let hh=Number(clock[1])%12+(lc(clock[3])==='pm'?12:0);if(!clock[3])hh=Number(clock[1]);const minutes=hh*60+Number(clock[2]??0),n=num(h);return [n/60000%1440,n%1440].some(m=>Math.abs(m-minutes)<1e-6);}
 if(/colou?r/.test(key)&&/^#[0-9a-f]{6}$/i.test(h)){try{return lc(colorHex(w))===h;}catch{return false;}}
 return h.includes(w)||w.includes(h)&&h.length>2;
}
const inputsFor=(o,key)=>{const name=key.split('.').pop(),m=inputMap(o),alias={time:['time','start'],colour:['colour','color'],color:['colour','color'],label:['label','name','title','text'],name:['name','label','title'],title:['title','name','label']}[name]??[name];
 return alias.flatMap(k=>m[k]??m['feature.'+k]??[]);};

/** Candidates for an existing target, in the before-observation. */
function targetCandidates(before,req,world){
 const t=req.target??{},objs=(before?.objects??[]).filter(o=>TOP[world]?.test(o.sourceType)??true);
 const ids=(req.constraints??[]).filter(c=>c.phase==='selector'&&/\.(id|ids|name)$/.test(c.key)).map(c=>c.value??c.value_span);
 let c=objs;
 if(t.name_span)c=c.filter(o=>matchesName(o,t.name_span));
 else if(ids.length)c=c.filter(o=>ids.some(id=>matchesName(o,id)));
 if(t.kind)c=c.filter(o=>matchesKind(o,t.kind,world,t.kind_span));
 return c;
}

/** Judge one request. Returns {checks:[{name,ok,hard,detail}], judged:boolean, excluded?:reason}. */
function judgeRequest(req,ctx){
 const {diff,before,world,reply}=ctx,checks=[],t=req.target??{},act=req.act,cs=req.constraints??[];
 // A check without a comparable observation is recorded as ok:null (not verified), never as passed.
 const add=(name,ok,hard=true,detail)=>checks.push({name,ok:hard?ok:(ok?null:false),hard,...(detail!==undefined?{detail}:{})});
 // A relative position is a relation mention (key .relation, or any result constraint with operator relation such as
 // diagram node.position) and its anchor mention (.anchor / .relation_anchor).
 const isRelation=c=>c.phase!=='selector'&&(/\.relation$/.test(c.key)||c.operator==='relation');
 const results=cs.filter(c=>c.phase!=='selector'&&!isRelation(c)&&!/\.(anchor|relation_anchor)$/.test(c.key));
 const relation=cs.find(c=>isRelation(c)&&c.value),anchorC=cs.find(c=>/\.(anchor|relation_anchor)$/.test(c.key));
 const valueChecks=objs=>{for(const c of results){
  if(c.operator==='delta'){
   const k=c.key.split('.').pop(),grow=['more','much_more'].includes(c.step),pairs=diff.changed.filter(d=>objs.includes(d.object)).map(d=>[inputsFor(d.before,k)[0]??inputsFor(d.before,'size')[0]??inputsFor(d.before,'scale')[0],inputsFor(d.object,k)[0]??inputsFor(d.object,'size')[0]??inputsFor(d.object,'scale')[0]]);
   const cmp=([a,b])=>{if(num(a)!==null&&num(b)!==null)return grow?num(b)>num(a):num(b)<num(a);const x=order(a),y=order(b);if(x&&y&&x.sc===y.sc)return grow?y.i>x.i:y.i<x.i;return null;};
   const r=pairs.map(cmp),comparable=r.some(v=>v!==null);
   add('delta:'+c.key,comparable?r.some(v=>v===true):objs.length>0,comparable&&!!c.step,c.step);continue;}
  if(c.value===undefined||c.value===null||c.operator==='degree'||c.polarity==='negative'){add('value:'+c.key,objs.length>0,false,'not comparable');continue;}
  const aligned=ALIGNED.get(world+'|'+c.key),mapped=aligned?.values.get(lc(c.value));
  const have=objs.flatMap(o=>{const own=inputsFor(o,c.key);return own.length||!aligned?own:inputsFor(o,aligned.parameter);});
  if(!have.length){add('value:'+c.key,objs.length>0,false,'no observed input');continue;}
  // A list said for an observation of several values (a chart's values observed as a set): the same items, any order.
  const items=typeof c.value==='string'?c.value.split(/\s*,\s*/).filter(Boolean):[];
  const asSet=items.length>1&&have.length===items.length&&[...items].sort().every((w,i)=>sameValue(w,[...have].map(String).sort()[i],c.key));
  add('value:'+c.key,asSet||have.some(h=>sameValue(c.value,h,c.key)||mapped!==undefined&&sameValue(mapped,h,c.key)),true,{want:c.value,...(mapped!==undefined?{declared:mapped}:{}),have:have.slice(0,3)});
 }};
 const relationCheck=objs=>{
  if(!relation)return;const rel=RELATIONS[relation.value];
  const anchorText=anchorC?.value_span??anchorC?.value??relation.anchor_span;const anchors=(before?.objects??[]).filter(o=>(TOP[world]?.test(o.sourceType)??true)&&anchorText&&(matchesName(o,anchorText)||matchesKind(o,anchorText,world)));
  if(!rel||!anchors.length){add('relation:'+relation.value,objs.length>0,false,anchors.length?'relation not geometric':'anchor not found');return;}
  const ok=objs.length>0&&objs.every(o=>{const a=box(o);return a&&anchors.some(an=>{const b=box(an);return b&&rel(a,b);});});
  const measurable=objs.every(o=>box(o))&&anchors.some(an=>box(an));
  add('relation:'+relation.value,ok,measurable,measurable?undefined:'no geometry');
 };
 if(['undo','redo','repeat'].includes(act))return {checks,excluded:'needs-history'};
 if(act==='answer'||req.mood==='ask'||req.mood==='check'){
  const text=String(reply?.text??'');
  add('answered',reply?.statuses?.includes('supported')&&text.length>0);
  add('no-state-change',diff.created.length+diff.removed.length===0&&!diff.changed.some(d=>d.keys.some(k=>k!=='selected')),true);
  if(req.question?.ask==='count'&&t.kind){const n=(before?.objects??[]).filter(o=>(TOP[world]?.test(o.sourceType)??true)&&matchesKind(o,t.kind,world,t.kind_span)).length;
   add('count-answer',new RegExp('\\b'+n+'\\b').test(text)||(n===0&&/\bno\b|\bnone\b|\bzero\b/i.test(text)),true,{expected:n});}
  return {checks};
 }
 if(act==='make'&&t.mode!=='existing'){
  const want=Number.isSafeInteger(t.count)?t.count:t.count_span?positiveCardinalProof(t.count_span)?.value??null:null;
  const kindless=!t.kind;
  const made=diff.created.filter(o=>kindless||matchesKind(o,t.kind,world,t.kind_span));
  if(world==='avatar'){const touched=[...diff.created,...diff.changed.map(d=>d.object)];add('part-added-or-changed',touched.length>0);valueChecks(touched);return {checks};}
  add('created',diff.created.length>0);
  if(diff.created.length&&!kindless)add('kind',made.length>0,true,{want:t.kind,got:diff.created.slice(0,3).map(o=>o.kind)});
  if(want)add('count',made.length===want,true,{want,got:made.length});
  else if(!t.quantifier&&!/s$/.test(t.kind_span??'')&&made.length>1)add('count',false,false,{want:1,got:made.length});
  valueChecks(made.length?made:diff.created);relationCheck(made.length?made:diff.created);
  return {checks};
 }
 if(act==='connect'){const links=diff.created.filter(o=>/link|edge/.test(o.sourceType)),rewired=diff.changed.filter(d=>/link|edge/.test(d.object.sourceType)&&d.keys.some(k=>k==='from'||k==='to'));add('link-created',links.length+rewired.length>0);return {checks};}
 if(act==='select'){add('acted',reply?.statuses?.includes('supported'));add('selection-or-no-change',diff.created.length+diff.removed.length===0,true);return {checks};}
 const candidates=targetCandidates(before,req,world);
 if(act==='remove'){
  add('removed',diff.removed.length>0||diff.changed.length>0);
  if(diff.removed.length&&candidates.length)add('removed-target',diff.removed.some(o=>candidates.some(c=>c.id===o.id)),true);
  return {checks};
 }
 // change, place, arrange, group, ungroup, merge, split, copy, reverse, ...: some object of the target changed as asked
 // change/place/arrange act on existing objects: a new object does not satisfy them (structure acts may create).
 const creates=['copy','split','group','merge','repeat'].includes(act);
 // A target made earlier in the same message ("add a star called Mia; then put Mia below Sun") is not in the
 // before-observation: the made objects it names stand for it, and the values and relation are checked on them.
 const madeTargets=!candidates.length&&t.name_span?diff.created.filter(o=>matchesName(o,t.name_span)):[];
 const changedObjs=[...diff.changed.map(d=>d.object),...(creates?diff.created:madeTargets)];
 add('changed',creates?diff.touched>0:diff.changed.length+diff.removed.length+madeTargets.length>0);
 if(diff.changed.length&&candidates.length&&candidates.length<(before?.objects?.length??0)&&t.fill!=='all'&&t.fill!=='context')
  // A member of the target changed (a chart's categories reordered or recoloured) is a change of the target.
  add('target',diff.changed.some(d=>candidates.some(c=>c.id===d.object.id||(inputMap(d.object).group??[]).includes(String(c.id))))||creates&&diff.created.length>0,true);
 const onTarget=candidates.length?changedObjs.filter(o=>candidates.some(c=>c.id===o.id)):changedObjs;
 valueChecks(onTarget.length?onTarget:changedObjs);relationCheck(onTarget.length?onTarget:changedObjs);
 return {checks};
}

/** Verdict for a whole row: success | plausible | wrong-effect | refused | error | excluded. */
export function judgeRow(row,run){
 if(run.error&&!run.reply)return {verdict:'error',checks:[],detail:run.error};
 const world=row.world,diff=diffObservations(run.before,run.after,world),reply=run.reply;
 const requests=row.requests??[],supported=reply?.statuses?.includes('supported');
 if(!requests.length){const quiet=diff.created.length+diff.removed.length+diff.changed.length===0;return {verdict:quiet?'success':'wrong-effect',checks:[{name:'no-request-no-change',ok:quiet,hard:true}],diff:summary(diff)};}
 const judged=requests.map(req=>judgeRequest(req,{diff,before:run.before,world,reply}));
 if(judged.some(j=>j.excluded))return {verdict:'excluded',excluded:judged.find(j=>j.excluded).excluded,checks:[],diff:summary(diff)};
 const checks=judged.flatMap((j,i)=>j.checks.map(c=>({...c,request:i})));
 const statuses=reply?.statuses??[];
 if(!supported&&diff.touched===0)return {verdict:'refused',checks,diff:summary(diff)};
 const hardFail=checks.filter(c=>c.hard&&!c.ok),softFail=checks.filter(c=>!c.hard&&c.ok!==true);
 // Constraints the application disclosed as not applied (partial best-effort admission) make a partial row.
 const disclosed=(reply?.trace?.partialAdmission?.disclosed??[]).filter(d=>d.role!=='note');
 if(supported&&!disclosed.length&&/\bI did not apply\b/.test(String(reply?.text??'')))return {verdict:'partial',checks,failed:[{name:'unapplied (disclosed in the reply)',ok:false,hard:true,detail:String(reply.text).match(/I did not apply[^.]*/)?.[0]}],diff:summary(diff)};
 if(supported&&disclosed.length)return {verdict:'partial',checks,failed:[...new Map(disclosed.map(d=>['unapplied:'+(d.key??d.role)+':'+d.reason,{name:'unapplied:'+(d.key??d.role),ok:false,hard:true,detail:{reason:d.reason,text:d.text}}])).values()],diff:summary(diff),disclosed};
 // Some requests applied, others refused: a partial row (its cause is the refusal).
 if(statuses.includes('unsupported')&&supported)return {verdict:'partial',checks,failed:hardFail.length?hardFail:[{name:'some-requests-refused',ok:false,hard:true}],diff:summary(diff)};
 if(hardFail.length)return {verdict:supported||diff.touched?'wrong-effect':'refused',checks,failed:hardFail,diff:summary(diff)};
 return {verdict:softFail.length||checks.every(c=>!c.hard)?'plausible':'success',checks,soft:softFail,diff:summary(diff)};
}
const summary=d=>({created:d.created.map(o=>o.kind+':'+o.id).slice(0,6),removed:d.removed.map(o=>o.kind+':'+o.id).slice(0,6),changed:d.changed.map(c=>c.object.kind+':'+c.object.id+'['+c.keys.join(',')+']').slice(0,6)});
