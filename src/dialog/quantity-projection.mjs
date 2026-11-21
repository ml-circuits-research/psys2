// SPDX-License-Identifier: AGPL-3.0-only
// Counts a reading leaves implicit in a request that makes things. The rules of raw-reading-policy.sop decide
// (implicit counts): a vague amount (k.expect.amount of the execution knowledge, said before the kind's plural noun or
// given by the reader as the count's value) makes its typical number; a counted kind, an amount, or a kind the
// number-agreement rules read by its singular binds what its singular binds. This module tells the reading's words and
// the bridged count to the rules and applies their conclusions to each candidate; it names no word.
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs';
import {NATIVE_AREAS} from './app-reader-context.mjs';
import {declaredQuantities} from './raw-reading-policy.mjs';

const attr=(wire,key)=>{const raw=wire?.attrs[key]?.[0];return raw===undefined?undefined:raw.startsWith('"')?str(raw):raw;};
const words=text=>[...String(text).matchAll(/[\p{L}\p{N}]+/gu)].map(m=>m[0].toLowerCase());

/** The named amounts with a typical count (k.expect.amount name typical), from the knowledge rows given. */
export function amountsOf(rows){
 return rows.map(row=>({name:attr(row,'name'),typical:Number(attr(row,'typical')),min:Number(attr(row,'min')),max:Number(attr(row,'max')),id:row.id}))
  .filter(a=>typeof a.name==='string'&&Number.isInteger(a.typical)&&a.typical>1);
}

/**
 * The reading with each make request's implicit count made explicit. `read` is a reader proposal (candidates and
 * raw requests with source ranges); `amounts` from amountsOf; `bindings` the reader's kind bindings. Answers the
 * same proposal when nothing applies, else a copy whose candidates carry the count constraints and `quantities`
 * (what was read, for the reply and the trace).
 */
export function projectQuantities(read,{amounts=[],bindings,view}={}){
 const raw=read?.raw,candidates=read?.candidates;
 if(!Array.isArray(candidates)||!candidates.length||raw?.requests?.length!==1)return read;
 const request=raw.requests[0],text=raw.source?.text??'';
 const range=path=>raw.ranges?.find(r=>r.path?.join('.')===path)?.range;
 const kindRange=range('requests.0.target.kind_span'),trigger=range('requests.0.trigger'),span=range('requests.0.span');
 if(request.act!=='make'||request.target?.mode!=='new'||!kindRange)return read;
 const noun=Array.from(text).slice(...kindRange).join('');
 // The words of the noun phrase before its kind: after the act's trigger, within the request.
 const from=trigger&&trigger[1]<=kindRange[0]?trigger[1]:span?.[0]??0,before=words(Array.from(text).slice(from,kindRange[0]).join(''));
 const area=bindings?.readerAreaByView?.[view]??NATIVE_AREAS[view]?.area;
 const kinds=area?(bindings?.kinds??[]).filter(row=>row.area===area):[];
 let changed=false;
 const projected=candidates.map(candidate=>{
  const nodes=parse(candidate.wires),root=nodes.find(w=>w.type==='std.request'&&w.id===candidate.request);
  const target=nodes.find(w=>w.type==='std.request.target'&&w.attrs.request?.[0]==='$'+root?.id&&attr(w,'mode')==='new');
  if(!target)return candidate;
  const countRow=nodes.find(w=>w.type==='std.request.constraint'&&attr(w,'concept')==='count'&&w.attrs.target?.[0]==='$'+target.id);
  const concluded=declaredQuantities(raw,{words:before,amounts,kinds,count:countRow?words(attr(countRow,'value')??''):null});
  const quantities={};
  if(concluded.amount){
   const {name,count,amount,how}=concluded.amount;
   quantities.amount={said:name,count,knowledge:amount};
   if(how==='said')countRow.attrs.value=[String(count)];
   else nodes.push({id:'quantity.count',type:'std.request.constraint',attrs:{character:['requirement'],concept:['count'],operator:['eq'],polarity:['positive'],
    request:['$'+root.id],target:['$'+target.id],value:[String(count)]},pattern:false});
  }
  if(concluded.kind&&concluded.kind!==attr(target,'kind')){
   quantities.kind={said:noun,as:concluded.kind,instead:attr(target,'kind')};
   target.attrs.kind=[concluded.kind];
  }
  if(!Object.keys(quantities).length)return candidate;
  changed=true;
  return {...candidate,wires:serialize(nodes),quantities};
 });
 return changed?{...read,candidates:projected}:read;
}

/** What the reply says about a projected quantity ("I read "some" as 3."). */
export function quantityNote(candidate){
 const amount=candidate?.quantities?.amount;
 return amount?'I read '+JSON.stringify(amount.said)+' as '+amount.count+'.':'';
}
