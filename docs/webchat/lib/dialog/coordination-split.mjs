// SPDX-License-Identifier: AGPL-3.0-only
// A make request whose reading saw several kinds for its one target ("draw a cat and 2 dogs", "draw a boy and a
// girl") is a coordination of noun phrases. It is split at the coordinators between the kind mentions (the
// separators of w.lang.en, bundled from the catalog: w.lang.en.coord.sep in=things), and each noun phrase, with its
// own determiner, count and modifiers, is read again as its own request with the shared act (the words up to the
// trigger) and the shared tail (a relation or region after the last noun, when no earlier noun phrase has words
// after its noun). A noun phrase whose reading is not usable is reported as dropped, never silently. Nothing here
// names a word: the coordinators are facts, the readings are the reader's.
import {en} from '../lang/en.mjs?v=911f0ab5a1';

/** The kind mentions a reading could not hold for its one target (absolute source ranges), in source order. */
export function kindMentions(read){
 const start=read?.sourceCut?.spans?.[0]?.[0]??0;
 for(const failure of read?.failures??[]){
  const d=failure.detail;
  if(d?.reason!=='ambiguous-global-mention'||d.head?.path!=='target.kind'||!Array.isArray(d.head.ranges))continue;
  const ranges=d.head.ranges.filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isSafeInteger)).map(([a,b])=>[a+start,b+start]);
  return ranges.length>1?ranges.sort((a,b)=>a[0]-b[0]):null;
 }
 return null;
}

/**
 * The conjunct texts of a coordinated make reading, or null when it is not one. `text` the whole message; `read`
 * the reading with the several kind mentions (its cut, its trigger range).
 */
export function coordinationParts(text,read){
 const chars=Array.from(text),cut=read?.sourceCut?.spans?.[0]??[0,chars.length],slice=(a,b)=>chars.slice(a,b).join('');
 const trigger=read?.raw?.ranges?.find(r=>r.path?.[0]==='requests'&&r.path.at(-1)==='trigger')?.range;
 if(!trigger||read.raw?.requests?.length!==1||read.raw.requests[0].act!=='make')return null;
 const separators=en.words('coord.sep','things');
 const kinds=kindMentions(read)??listAfter(read,separators,slice,cut);
 if(!kinds||trigger[1]>kinds[0][0])return null;
 // A later conjunct whose words hold a pronoun as the object of a verb ("and call it cat", "and paint them red") is a
 // clause about what an earlier noun phrase made, not a further noun phrase: the reading of the whole message stands.
 const parts=splitParts(kinds,text,read,chars,cut,slice,trigger,separators);
 return parts&&parts.slice(1).some(part=>refersBack(slice(...part.range)))?null:parts;
}

// A pronoun of w.lang.en (view acts, not also a determiner) not governed by a preposition of w.lang.en.
function refersBack(phrase){
 const words=[...phrase.toLowerCase().matchAll(/[\p{L}]+/gu)].map(m=>m[0]),pronouns=en.words('pron','acts'),determiners=en.words('det'),prepositions=en.words('prep');
 return words.some((w,i)=>pronouns.has(w)&&!determiners.has(w)&&!prepositions.has(words[i-1]));
}

function splitParts(kinds,text,read,chars,cut,slice,trigger,separators){
 if(kinds.list)return kinds.list.map(([a,b],i)=>{const own=slice(a,b).trim();return {said:i===0?slice(trigger[1],b).trim():own,text:(i===0?own:slice(cut[0],trigger[1]).trim()+' '+own).replace(/\s+/g,' ').trim(),range:[a,b]};});
 // In each gap between two kind mentions, the last coordinator token separates the noun phrases.
 const cuts=[];
 for(let i=1;i<kinds.length;i++){
  const gap=slice(kinds[i-1][1],kinds[i][0]);
  const tokens=[...gap.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)].filter(m=>separators.has(m[0].toLowerCase()));
  if(!tokens.length)return null;
  // "a cat, and a dog": the separators run together; the noun phrase starts after the last, the previous one ends at the first.
  let first=tokens.at(-1);
  for(let k=tokens.length-2;k>=0;k--){if(gap.slice(tokens[k].index+tokens[k][0].length,first.index).trim())break;first=tokens[k];}
  const last=tokens.at(-1);
  cuts.push([kinds[i-1][1]+first.index,kinds[i-1][1]+last.index+last[0].length]);
 }
 const segments=kinds.map((_,i)=>[i?cuts[i-1][1]:cut[0],i<cuts.length?cuts[i][0]:cut[1]]);
 // The tail after the last noun is shared when no earlier noun phrase has words after its noun.
 const shared=kinds.slice(0,-1).every((k,i)=>!slice(k[1],segments[i][1]).trim());
 const tail=shared?slice(kinds.at(-1)[1],cut[1]):'';
 const head=slice(cut[0],trigger[1]);
 return segments.map(([a,b],i)=>{
  const own=slice(a,b).trim(),phrase=i===kinds.length-1&&shared?slice(a,kinds.at(-1)[1]).trim():own;
  const reading=(i===0?phrase:head.trim()+' '+phrase)+(shared?tail.replace(/\s+$/,''):'');
  return {said:i===0?slice(trigger[1],b).trim():phrase,text:reading.replace(/\s+/g,' ').trim(),range:[a,b]};
 });
}

/**
 * A reading that holds one kind and leaves a list after it unread ("draw a boy and a girl" read as the boy; "draw a
 * sun, three clouds and a bird" read as the sun): when the words right after the kind's noun are a coordinator, the
 * rest of the request is cut at its coordinators into the further noun phrases. Answers { list: [[start, end]] }.
 */
function listAfter(read,separators,slice,cut){
 const kind=read.raw.ranges?.find(r=>r.path?.join('.')==='requests.0.target.kind_span')?.range;
 if(!kind)return null;
 const rest=slice(kind[1],cut[1]),tokens=[...rest.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)];
 if(!tokens.length||!separators.has(tokens[0][0].toLowerCase()))return null;
 const bounds=[];let open=null;
 for(const t of tokens){
  const at=kind[1]+t.index,end=at+t[0].length;
  if(separators.has(t[0].toLowerCase())){if(open&&!open.closed)bounds.push([open.start,at]);open={sep:true,after:end};continue;}
  if(open?.sep)open={start:open.after,closed:false};
 }
 if(open&&!open.sep)bounds.push([open.start,cut[1]]);
 const firstSep=kind[1]+tokens[0].index;
 const list=[[cut[0],firstSep],...bounds].filter(([a,b])=>slice(a,b).trim());
 return list.length>1?Object.assign([kind],{list}):null;
}
