// SPDX-License-Identifier: AGPL-3.0-only
// Counts a reading leaves implicit in a request that makes things. Nothing here names a word:
//  - a vague amount ("some clouds", "a few birds", "a couple of trees") is a k.expect.amount of the execution
//    knowledge (its name, said before the kind's plural noun); the request makes its typical number, and the reply
//    says how it read it;
//  - a counted kind is read by its singular (w.lang.en morphology, bundled from the catalog): "three houses" binds
//    the kind the reader binds for "house", not a thing whose own name is the plural (the emoji "houses"); the
//    plural's own binding stays as an alternative in the trace.
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=a37e1846b3';
import {en} from '../lang/en.mjs?v=189c882fb6';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=366bfb9d86';

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
 const noun=Array.from(text).slice(...kindRange).join(''),head=words(noun).at(-1);
 if(!head)return read;
 const singular=en.singular(head,'lemma'),plural=singular!==head;
 // The words of the noun phrase before its kind: after the act's trigger, within the request.
 const from=trigger&&trigger[1]<=kindRange[0]?trigger[1]:span?.[0]??0,before=words(Array.from(text).slice(from,kindRange[0]).join(''));
 const amount=plural?amounts.find(a=>before.includes(a.name)):undefined;
 const area=bindings?.readerAreaByView?.[view]??NATIVE_AREAS[view]?.area;
 const singularKind=plural&&area?bindings?.kinds?.find(row=>row.area===area&&row.lemma===singular)?.canonical:undefined;
 let changed=false;
 const projected=candidates.map(candidate=>{
  const nodes=parse(candidate.wires),root=nodes.find(w=>w.type==='std.request'&&w.id===candidate.request);
  const target=nodes.find(w=>w.type==='std.request.target'&&w.attrs.request?.[0]==='$'+root?.id&&attr(w,'mode')==='new');
  if(!target)return candidate;
  const counted=nodes.some(w=>w.type==='std.request.constraint'&&attr(w,'concept')==='count'&&w.attrs.target?.[0]==='$'+target.id);
  if(!counted&&!amount)return candidate;
  const quantities={};
  if(singularKind&&singularKind!==attr(target,'kind')){
   quantities.kind={said:noun,as:singularKind,instead:attr(target,'kind')};
   target.attrs.kind=[singularKind];
  }
  if(!counted&&amount){
   quantities.amount={said:amount.name,count:amount.typical,knowledge:amount.id};
   nodes.push({id:'quantity.count',type:'std.request.constraint',attrs:{character:['requirement'],concept:['count'],operator:['eq'],polarity:['positive'],
    request:['$'+root.id],target:['$'+target.id],value:[String(amount.typical)]},pattern:false});
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
