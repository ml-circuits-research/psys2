// SPDX-License-Identifier: AGPL-3.0-only
// Partial admission on the key route (specs/semantic-frame.md §5). A reader proposal that the strict path refuses is
// bridged again in partial mode: fields the reader left out take the declared defaults and roles that cannot be bound
// are dropped and disclosed, so the consistent part of the request executes. Everything that decides is declared:
// defaults, admitted act classes, reply wording and the run-time fallback ladder (interpretation-policy.sop), the
// admission decision (reader-admission-policy.sop) and every binding (the deployed binding table). Nothing here names a
// word, a sentence, a tool or a world.
import {bridgeRawStructure,pruneLabel} from './raw-structural-bridge.mjs?v=ce5f87d0ba';
import {decodeModelGraphs} from './model-graph-decoder.mjs?v=46eaca7d28';
import {comparativeSteps} from './comparative-projection.mjs?v=9386e7bcbf';
import {referenceProjection} from './reference-projection.mjs?v=c26c543c75';
import {interpretationPolicy} from './interpretation-policy.mjs?v=41e7ad7c89';

const scalarsOf=text=>Array.from(text);
// Adjacent mentions of one target-kind head that only whitespace or a hyphen separates and that together spell a
// declared kind lemma of the target's family ("bar" + "chart" when "bar chart" is a declared kind) are one mention.
function joinKindMentions(raw,failures,bindings,cuts){
 let changed=null,skipped=null;
 for(const failure of failures??[]){
  const detail=failure?.detail;
  if(detail?.reason!=='ambiguous-global-mention'||detail.head?.path!=='target.kind'||!Array.isArray(detail.head.ranges)||detail.head.ranges.length<2)continue;
  const index=failure.path?.[1];if(!Number.isSafeInteger(index))continue;
  const request=(changed??raw).requests?.[index];if(!request||request.target?.kind)continue;
  const offset=cuts?.[index]?.[0]??0,text=scalarsOf(raw.source.text),ranges=[...detail.head.ranges].sort((a,b)=>a[0]-b[0]).map(([a,b])=>[a+offset,b+offset]);
  const type=request.target?.type,area=raw.area,declared=lemma=>(bindings.kinds??[]).some(k=>k.area===area&&k.type===type&&k.lemma===lemma);
  // Runs of adjacent mentions, each joined into one span; a joined run that spells a declared kind is one mention.
  const runs=[];for(const r of ranges){const last=runs.at(-1);if(last&&/^[\s-]+$/.test(text.slice(last.at(-1)[1],r[0]).join('')))last.push(r);else runs.push([r]);}
  const options=runs.flatMap(run=>run.length>1?[[run[0][0],run.at(-1)[1]],...run]:run);
  // Otherwise the mentions are several things in one request: the first that names a declared kind (a joined run
  // before its own parts) is made and the others are disclosed (ranked by source order; the coordination reader had
  // its turn before partial admission).
  const span=options.find(r=>declared(text.slice(...r).join('')))??null,lemma=span?text.slice(...span).join(''):null;
  if(!span)continue;
  for(const r of ranges)if(r[1]<=span[0]||r[0]>=span[1])(skipped??=[]).push({request:index,reason:'several-kind-mentions',role:'theme',text:text.slice(...r).join('')});
  changed??=structuredClone(raw);
  const target=changed.requests[index].target;target.kind=lemma;target.kind_span=lemma;
  changed.ranges=[...(changed.ranges??[]).filter(r=>JSON.stringify(r.path)!==JSON.stringify(['requests',String(index),'target','kind_span'])),{path:['requests',String(index),'target','kind_span'],range:span}];
 }
 const result=changed??raw;
 return skipped?{raw:result,skipped}:{raw:result,skipped:[]};
}

/** The partial reading of one proposal; {refused} with the remaining diagnostics when no request keeps its action and theme. */
export function partialReading(proposal,{bindings,bindingSha256}){
 const raw=proposal?.raw;
 if(!raw||!bindings||!bindingSha256||!Array.isArray(raw.requests)||!raw.requests.length)return null;
 const policy=interpretationPolicy().partial;
 const {raw:repaired,skipped}=joinKindMentions(raw,proposal.failures,bindings,proposal.sourceCut?.spans);
 const bridge=bridgeRawStructure(repaired,{bindings,bindingSha256,comparatives:comparativeSteps(),references:referenceProjection(),partial:{defaults:policy.defaults}});
 const candidates=bridge.decoded?.candidates??[];
 if(bridge.diagnostics.length||!candidates.length||bridge.decoded?.issues?.length)return {refused:[...bridge.diagnostics,...(bridge.decoded?.issues??[])].map(d=>d.reason+(d.path?.length?':'+d.path.join('.'):''))};
 // Heads the reader itself could not decode consistently are disclosed by key; their spans did not reach the request.
 const readerIssues=(proposal.failures??[]).filter(f=>f.reason==='provider-unresolved').map(f=>({reason:f.detail?.reason,key:f.detail?.key})).filter(f=>f.reason);
 const disclosed=[...skipped,...bridge.disclosed];
 return {proposal:{...proposal,raw:repaired,candidates,coverage:{complete:false,partial:true,graphProposal:true,executable:false},failures:[],
  interpretation:{profile:'partial-admission/1',disclosed,defaulted:bridge.defaulted,readerIssues,unresolved:proposal.failures??[]}},
  packet:bridge.packet,disclosed,defaulted:bridge.defaulted,joined:repaired!==raw};
}

/** Of several readings of the same text, the partial one that drops the least (ties keep the earlier reading). */
export function bestPartialReading(proposals,options){
 let best=null;const refused=[];
 for(const proposal of proposals){
  let reading=null;try{reading=partialReading(proposal,options);}catch(error){reading={refused:[String(error?.message??error)]};}
  if(reading?.refused){refused.push(...reading.refused);continue;}
  if(reading&&(!best||reading.disclosed.length<best.disclosed.length))best=reading;
 }
 return best??(refused.length?{refused:[...new Set(refused)]}:null);
}

const PLACEMENT_OPERATORS=new Set(['relation','region']);
const decodeVariant=(packet,requests)=>{
 const decoded=decodeModelGraphs({...packet,hypotheses:[{requests}]});
 return decoded.issues.length?null:decoded.candidates[0]??null;
};
/**
 * The declared fallback ladder for a partial reading the editor refused (interpretation-policy.sop
 * app.interpret.fallback), each step as {step, text, candidates (run in order)}. Split: a new thing is made with its
 * placement first, then a second request changes the made thing's other properties (the placement compiler takes
 * relations and a count only). Without placement: relations and regions dropped. Theme only: every constraint but the
 * count dropped.
 */
export function fallbackLadder(packet){
 const requests=packet?.hypotheses?.[0]?.requests,chars=Array.from(packet?.source?.text??'');
 // A dropped relation is named with its anchor ("near the house"): from the relation word to the end of the anchor's kind.
 const extent=c=>{if(!Array.isArray(c.source))return null;const anchor=c.goal&&requests?.[0]?.evidence?.find(e=>e.path[0]==='targets'&&e.path[1]===c.goal&&e.path[2]==='kind')?.ranges?.[0];return anchor&&anchor[1]>c.source[1]?[c.source[0],anchor[1]]:c.source;};
 const named=list=>list.map(c=>{const r=extent(c);return {reason:'refused-by-host',role:'constraint',...(r?{text:chars.slice(...r).join('')}:{})};});
 if(!Array.isArray(requests)||requests.length!==1)return [];
 const label=requests[0],placement=c=>PLACEMENT_OPERATORS.has(c.operator),count=c=>c.concept==='count';
 const steps=[];
 for(const {step,text} of interpretationPolicy().partial.fallbacks){
  const reduced=keep=>{const copy=structuredClone(label);return pruneLabel(copy,new Set(copy.constraints.filter(c=>!keep(c)).map(c=>c.id)));};
  if(step==='split'){
   const other=label.constraints.filter(c=>c.phase==='result'&&!placement(c)&&!count(c));
   if(label.act!=='make'||!label.constraints.some(placement)||!other.length)continue;
   const placed=decodeVariant(packet,[reduced(c=>placement(c)||count(c))]);
   const target=label.targets[0];
   const follow=reduced(c=>other.includes(c));
   follow.act='change';follow.targets=follow.targets.map(t=>t.id===target.id?{id:t.id,mode:'existing',...(t.kind?{kind:t.kind}:{}),determiner:'definite'}:t);
   follow.evidence=follow.evidence.filter(e=>!(e.path[0]==='targets'&&e.path[1]===target.id&&e.path[2]==='name'));
   delete follow.targets.find(t=>t.id===target.id)?.name;
   const changed=decodeVariant(packet,[follow]);
   if(placed&&changed)steps.push({step,text,candidates:[placed,changed],dropped:[],followDropped:named(other)});
  }else if(step==='without-placement'){
   if(!label.constraints.some(placement))continue;
   const c=decodeVariant(packet,[reduced(x=>!placement(x))]);if(c)steps.push({step,text,candidates:[c],dropped:named(label.constraints.filter(placement))});
  }else if(step==='theme-only'){
   if(!label.constraints.some(c=>!count(c)))continue;
   const c=decodeVariant(packet,[reduced(count)]);if(c)steps.push({step,text,candidates:[c],dropped:named(label.constraints.filter(x=>!count(x)))});
  }
 }
 return steps;
}

/** The reply sentence naming what a partial reading left out and why. */
export function partialNote(disclosed,applied=true){
 const {drops}=interpretationPolicy().partial,named=new Map();let unnamed=0;
 for(const d of disclosed??[]){
  if(!d.text){unnamed++;continue;}
  const why=drops[d.reason]??drops.generic;
  if(!named.has(d.text))named.set(d.text,why);
 }
 const parts=[...named].map(([text,why])=>JSON.stringify(text)+' ('+why+')');
 if(!parts.length&&!unnamed)return '';
 return (parts.length?'I did not apply '+parts.join(', ')+'.':'I left out part of the request that I could not read.')+(applied?' You can undo this.':'');
}
