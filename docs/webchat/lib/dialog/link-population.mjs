// SPDX-License-Identifier: AGPL-3.0-only
// Lines between a population (execution-policy.sop app.execution.linkPattern): when one end of a line names several
// observed objects ("connect the circles": the kind lemma of the phrase, after its determiners, matches every circle)
// the request is expanded into one request per line of the declared pattern: a chain in reading order when the other
// end is not said, a star from the other end when it names one object. Nothing here names a word or a kind.
import {parse,serialize,str,quote} from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import {LANG_EN_FACTS} from '../lang/en.facts.generated.mjs?v=bd66855a30';
import {en} from '../lang/en.mjs?v=0d85b0a1f8';
import {executionPolicyWorld} from './execution-policy.mjs?v=0660424711';
import {budget} from './budget.mjs?v=00bce6e369';

const one=(row,key)=>row?.attrs[key]?.length?str(row.attrs[key][0]):undefined;
let determiners;
const dets=()=>determiners??=new Set(parse(LANG_EN_FACTS.determiners).map(w=>str(w.attrs.text?.[0]??'')).filter(Boolean).map(t=>t.toLowerCase()));

/** The observed objects a phrase names as a population: its last word's lemma as their kind, two or more of them. */
function population(phrase,objects,sourceType){
 if(typeof phrase!=='string')return null;
 const words=phrase.toLowerCase().split(/\s+/).filter(Boolean);
 while(words.length>1&&dets().has(words[0])){budget.tick('link-population.determiner');words.shift();}
 if(!words.length)return null;
 const last=words.at(-1),lemma=en.singular(last,'lemma');
 if(lemma===last)return null;   // a plural names a population; a singular names one object
 const head=[...words.slice(0,-1),lemma].join(' ');
 const found=objects.filter(o=>{budget.tick('link-population.match');return o.sourceType===sourceType&&String(o.kind).toLowerCase()===head;});
 return found.length>=2?found:null;
}
const centre=o=>{const v=k=>Number(o.inputs?.find(i=>i.key===k)?.values?.[0]);return {x:v('x'),y:v('y'),h:v('height')||0};};
/** Reading order: rows top to bottom (a row is within half the taller height), then left to right. */
function readingOrder(objects){
 return [...objects].sort((a,b)=>{const p=centre(a),q=centre(b),band=Math.max(p.h,q.h,1)/2;
  if(Number.isFinite(p.y)&&Number.isFinite(q.y)&&Math.abs(p.y-q.y)>band)return p.y-q.y;
  return (p.x||0)-(q.x||0)||String(a.id).localeCompare(String(b.id));});
}

/** The expanded candidates for a line request whose end names a population, or null. */
export function linkPopulationCandidates(candidate,objects){
 const patterns=executionPolicyWorld().ofType('app.execution.linkPattern');
 if(!patterns.length||!candidate?.wires)return null;
 const refs=new Map(executionPolicyWorld().ofType('app.execution.reference').map(r=>[one(r,'concept'),one(r,'sourceType')]));
 const rows=parse(candidate.wires);
 for(const pattern of patterns){
  const from=one(pattern,'from'),to=one(pattern,'to'),max=Number(one(pattern,'max'));
  const ends=[from,to].map(concept=>rows.find(w=>w.type==='std.request.constraint'&&one(w,'concept')===concept&&one(w,'operator')==='eq'&&one(w,'polarity')==='positive'));
  const sourceType=refs.get(from);
  if(!sourceType||refs.get(to)!==sourceType)continue;
  const groups=ends.map(c=>c?population(one(c,'value'),objects,sourceType):null);
  const at=groups.findIndex(Boolean);if(at<0)continue;
  const members=readingOrder(groups[at]),other=ends[1-at];
  if(groups[1-at])continue;   // two populations: not declared
  let pairs;
  if(!other)pairs=members.slice(1).map((o,i)=>[members[i].id,o.id]);
  else{
   const said=String(one(other,'value')??'').toLowerCase();
   const hub=objects.filter(o=>o.sourceType===sourceType&&(String(o.id).toLowerCase()===said||o.inputs?.some(i=>['label','name'].includes(i.key)&&String(i.values?.[0]??'').replace(/^"|"$/g,'').toLowerCase()===said)));
   if(hub.length!==1)continue;
   pairs=members.filter(o=>o.id!==hub[0].id).map(o=>at===0?[o.id,hub[0].id]:[hub[0].id,o.id]);
  }
  if(pairs.length<1||pairs.length>max)continue;
  const fromRow=ends[0]??ends[1];
  return {pattern:other?one(pattern,'hub'):one(pattern,'open'),declaration:pattern.id,members:members.map(o=>o.id),candidates:pairs.map(([a,b],k)=>{
   const out=rows.map(w=>({...w,attrs:{...w.attrs}}));
   const set=(concept,value)=>{let c=out.find(w=>w.type==='std.request.constraint'&&one(w,'concept')===concept);
    if(!c){const request=out.find(w=>w.type==='std.request');if(request)delete request.attrs.root;   // a root naming one end alone would leave the new end outside it
     c={...fromRow,id:fromRow.id+'_'+concept.split('.').pop(),attrs:{...fromRow.attrs,concept:[concept]}};delete c.attrs.source;delete c.attrs['source.start'];delete c.attrs['source.end'];out.push(c);}
    c.attrs.value=[quote(value)];};
   set(from,a);set(to,b);
   // The lines of the pattern are made: the line the ends belong to is a new one (whatever mode the reading gave it).
   const line=out.find(w=>w.id===String(fromRow.attrs.target?.[0]??'').slice(1));if(line){line.attrs.mode=['new'];delete line.attrs.name;}
   return {...candidate,wires:serialize(out),populationLine:k};
  })};
 }
 return null;
}
