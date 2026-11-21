// SPDX-License-Identifier: AGPL-3.0-only
// A make request whose reading saw several kinds for its one target ("draw a cat and 2 dogs") or left a list after its
// kind unread ("draw a boy and a girl") is a coordination of noun phrases. The split is the library's
// (sopworld coordinationParts); this adapter hands it the reader's mentions and ranges and the words of w.lang.en
// (coordinators, pronouns, determiners, prepositions). Nothing here names a word.
import {coordinationParts as splitCoordination} from '../vendor/sopworld/sopworld.mjs';
import {en} from '../lang/en.mjs';

/** The kind mentions a reading could not hold for its one target (absolute source ranges), in source order. */
export function kindMentions(read){
 const start=read?.sourceCut?.spans?.[0]?.[0]??0;
 for(const failure of read?.failures??[]){
  const d=failure.detail;
  if(d?.reason!=='ambiguous-global-mention'||d.head?.path!=='target.kind'||!Array.isArray(d.head.ranges))continue;
  const ranges=d.head.ranges.filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isSafeInteger)).map(([a,b])=>[a+start,b+start]);
  return ranges.length>1?ranges:null;
 }
 return null;
}

/** The conjunct texts of a coordinated make reading, or null when it is not one. */
export function coordinationParts(text,read){
 const trigger=read?.raw?.ranges?.find(r=>r.path?.[0]==='requests'&&r.path.at(-1)==='trigger')?.range;
 if(!trigger||read.raw?.requests?.length!==1||read.raw.requests[0].act!=='make')return null;
 const cut=read?.sourceCut?.spans?.[0]??[0,Array.from(text).length];
 const kind=read.raw.ranges?.find(r=>r.path?.join('.')==='requests.0.target.kind_span')?.range??null;
 return splitCoordination(text,{cut,trigger,mentions:kindMentions(read),kind,
  words:{separators:en.words('coord.sep','things'),pronouns:en.words('pron','acts'),determiners:en.words('det'),prepositions:en.words('prep')}});
}
