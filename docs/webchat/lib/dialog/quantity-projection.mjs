// SPDX-License-Identifier: AGPL-3.0-only
// Counts a reading leaves implicit in a request that makes things. Nothing here names a word:
//  - a vague amount ("some clouds", "a few birds", "a couple of trees") is a k.expect.amount of the execution
//    knowledge (its name, said before the kind's plural noun); the request makes its typical number, and the reply
//    says how it read it;
//  - a counted kind is read by its singular (w.lang.en morphology, bundled from the catalog): "three houses" binds
//    the kind the reader binds for "house", not a thing whose own name is the plural (the emoji "houses"); the
//    plural's own binding stays as an alternative in the trace;
//  - a kind the declared number-agreement rules read by its singular (raw-reading-policy.sop app.reading.bySingular:
//    "draw a women") binds what its singular binds, like a counted kind.
import {parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=935d4d1757';
import {en} from '../lang/en.mjs?v=d028d63371';
import {NATIVE_AREAS} from './app-reader-context.mjs?v=3e86b7f558';
import {readsBySingular} from './raw-reading-policy.mjs?v=7d611bb87a';

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
 // A kind the declared reading rules read by its singular (no vague amount was said).
 const single=plural&&!amount&&readsBySingular(raw,0);
 const singularKind=plural&&area?bindings?.kinds?.find(row=>row.area===area&&row.lemma===singular)?.canonical:undefined;
 let changed=false;
 const projected=candidates.map(candidate=>{
  const nodes=parse(candidate.wires),root=nodes.find(w=>w.type==='std.request'&&w.id===candidate.request);
  const target=nodes.find(w=>w.type==='std.request.target'&&w.attrs.request?.[0]==='$'+root?.id&&attr(w,'mode')==='new');
  if(!target)return candidate;
  const countRow=nodes.find(w=>w.type==='std.request.constraint'&&attr(w,'concept')==='count'&&w.attrs.target?.[0]==='$'+target.id);
  // A count the reader gave as a vague amount's name ("several", "a few") is that amount's typical number.
  const named=countRow&&!/^\d+$/.test(String(attr(countRow,'value')??''))?amounts.find(a=>words(attr(countRow,'value')??'').join(' ')===a.name||words(attr(countRow,'value')??'').includes(a.name)):undefined;
  const counted=!!countRow;
  if(!counted&&!amount&&!single)return candidate;
  const quantities={};
  if(named){quantities.amount={said:named.name,count:named.typical,knowledge:named.id};countRow.attrs.value=[String(named.typical)];}
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
