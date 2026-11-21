// SPDX-License-Identifier: AGPL-3.0-only
// Declared readings of said values (specs/semantic-frame.md §5), applied to a raw reading before it is bridged, like
// the declared raw readings of partial-admission.mjs. Each is a row of the execution policy; nothing here names a word,
// a key or a world:
//  - an amount (app.execution.amount): a key said with operator delta, a step and one number ("bump Thu up by 70")
//    reads as the declared amount key of that step, its value the number with the number's own words as evidence;
//  - a range (app.execution.range): a span that spells two numbers said for the low or the high key of a declared pair
//    ("run the y axis from 0 to 10") gives the first number to the low key and the second to the high key;
//  - a position (app.execution.position): a target ordinal ("the third bar", "the first month") is a selector on the
//    family's declared position key, its value the ordinal's number (k.values ordinals; declared-bindings.mjs gives
//    the key its normalizations).
import {str} from '../vendor/sopworld/sopworld.mjs?v=935d4d1757';
import {executionPolicyWorld} from './execution-policy.mjs?v=3dd93446cd';
import {parseNumberRun} from '../knowledge/number-run.mjs?v=efcde74940';
import {numberInfo} from '../knowledge/values.mjs?v=b0000e82a7';
import {budget} from './budget.mjs?v=d42dc656e7';

const one=(row,key)=>row.attrs[key]?.length?str(row.attrs[key][0]):undefined;
let declared=null;
export function declaredValueRows(){
 if(declared)return declared;
 const pol=executionPolicyWorld();
 return declared={
  amounts:pol.ofType('app.execution.amount').map(r=>({area:one(r,'area'),key:one(r,'key'),step:one(r,'step'),as:one(r,'as')})),
  ranges:pol.ofType('app.execution.range').map(r=>({area:one(r,'area'),low:one(r,'low'),high:one(r,'high')})),
  positions:pol.ofType('app.execution.position').map(r=>({area:one(r,'area'),type:one(r,'type'),key:one(r,'key'),sourceType:one(r,'sourceType'),binding:one(r,'binding')})),
 };
}

const scalars=text=>Array.from(text);
// The numbers a span spells (digits, or a run of declared number words), each with its scalar range in the span.
function numbersIn(text){
 const words=[];
 for(const m of text.matchAll(/[^\s,;:!?()]+/g)){const start=scalars(text.slice(0,m.index)).length;words.push({w:m[0].toLowerCase(),start,end:start+scalars(m[0]).length});}
 const found=[];
 for(let i=0;i<words.length;i++){
  budget.tick('value-readings.numbers');
  if(/^[-+]?\d+(\.\d+)?$/.test(words[i].w)){found.push({value:Number(words[i].w),start:words[i].start,end:words[i].end});continue;}
  const run=parseNumberRun(words.map(x=>x.w),i);
  if(run){found.push({value:run.value,start:words[i].start,end:words[i+run.length-1].end});i+=run.length-1;}
 }
 return found;
}
const rangeOf=(raw,path)=>raw.ranges?.find(r=>JSON.stringify(r.path)===JSON.stringify(path));
// Narrow a constraint's value to a part of its span (the number's own words), moving its evidence ranges with it.
function narrow(raw,index,ci,part){
 const c=raw.requests[index].constraints[ci],base=['requests',String(index),'constraints',String(ci)];
 const span=rangeOf(raw,[...base,'value_span']);
 const text=scalars(c.value_span).slice(part.start,part.end).join('');
 c.value=text;c.value_span=text;
 raw.ranges=(raw.ranges??[]).filter(r=>!(JSON.stringify(r.path)===JSON.stringify([...base,'value'])));
 if(span)span.range=[span.range[0]+part.start,span.range[0]+part.end];
}
const located=(raw,index,ci)=>{const c=raw.requests[index].constraints[ci];const span=rangeOf(raw,['requests',String(index),'constraints',String(ci),'value_span']);
 return typeof c.value_span==='string'&&span&&scalars(raw.source.text).slice(...span.range).join('')===c.value_span;};

/** The raw reading with the declared value readings applied; the same object when none applies. */
export function declaredValueReadings(raw){
 if(!raw||!Array.isArray(raw.requests)||typeof raw.source?.text!=='string')return raw;
 const {amounts,ranges,positions}=declaredValueRows();
 if(!amounts.length&&!ranges.length&&!positions.length)return raw;
 let out=null;const edit=()=>out??=structuredClone(raw);
 for(const [index,request] of raw.requests.entries()){
  const constraints=Array.isArray(request?.constraints)?request.constraints:[];
  // Amounts.
  for(const [ci,c] of constraints.entries()){
   if(c?.operator!=='delta'||typeof c.step!=='string'||['measure','measure_span','unit'].some(k=>c[k]!==undefined))continue;
   const row=amounts.find(a=>a.area===raw.area&&a.key===c.key&&a.step===c.step);if(!row||!located(raw,index,ci))continue;
   const numbers=numbersIn(c.value_span);if(numbers.length!==1)continue;
   const o=edit(),oc=o.requests[index].constraints[ci];
   narrow(o,index,ci,numbers[0]);oc.key=row.as;oc.operator='eq';delete oc.step;
  }
  // Ranges.
  for(const row of ranges.filter(r=>r.area===raw.area)){
   const at=[row.low,row.high].map(key=>constraints.findIndex(c=>c?.key===key&&c.phase==='result'&&c.operator==='eq'));
   const said=at.filter(i=>i>=0);if(!said.length)continue;
   const spans=new Set(said.map(i=>constraints[i].value_span));if(spans.size!==1||!said.every(i=>located(raw,index,i)))continue;
   const numbers=numbersIn(constraints[said[0]].value_span);if(numbers.length!==2)continue;
   const o=edit(),list=o.requests[index].constraints;
   // A range said for one key of the pair gives the other key its number too (the same words as evidence).
   for(const [side,i] of at.entries())if(i<0){
    const from=said[0],ci=list.length;list.push({...list[from],key:side===0?row.low:row.high});
    const span=rangeOf(o,['requests',String(index),'constraints',String(from),'value_span']);
    o.ranges.push({path:['requests',String(index),'constraints',String(ci),'value_span'],range:[...span.range]});at[side]=ci;
   }
   narrow(o,index,at[0],numbers[0]);narrow(o,index,at[1],numbers[1]);
  }
  // Positions.
  const target=request?.target,ordinal=target?.ordinal;
  if(typeof ordinal==='string'&&ordinal){
   const row=positions.find(p=>p.area===raw.area&&p.type===target.type),info=numberInfo(ordinal,'ordinal')??(/^\d+$/.test(ordinal)?{value:Number(ordinal)}:null);
   const text=scalars(raw.source.text),reqSpan=rangeOf(raw,['requests',String(index),'span']);
   if(row&&info&&Number.isSafeInteger(info.value)&&info.value>0&&reqSpan){
    // The ordinal's own words in the request (one occurrence) are the selector's evidence.
    const local=text.slice(...reqSpan.range).join(''),hits=[...local.matchAll(new RegExp('(?<![\\p{L}\\p{N}])'+ordinal.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'(?![\\p{L}\\p{N}])','giu'))];
    if(hits.length===1){
     const start=reqSpan.range[0]+scalars(local.slice(0,hits[0].index)).length,end=start+scalars(hits[0][0]).length;
     const o=edit(),r=o.requests[index],ci=(r.constraints??=[]).length;
     r.constraints.push({key:row.key,value:String(info.value),value_span:hits[0][0],operator:'eq',phase:'selector',polarity:'positive',character:'requirement'});
     o.ranges=(o.ranges??[]).filter(x=>JSON.stringify(x.path)!==JSON.stringify(['requests',String(index),'target','ordinal']));
     o.ranges.push({path:['requests',String(index),'constraints',String(ci),'value_span'],range:[start,end]});
     delete r.target.ordinal;
    }
   }
  }
 }
 return out??raw;
}
