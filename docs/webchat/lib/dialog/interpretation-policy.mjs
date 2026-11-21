// SPDX-License-Identifier: AGPL-3.0-only
// Declared reader interpretation policy (worlds/app.project/interpretation-policy.sop): the order and eligibility of
// context re-readings, the bounds of reading comparison, which readings go to the coordination reader first, and the
// confidence at which a detected input language replaces the selected one. The routing code reads these facts; it
// holds no order, bound or threshold of its own.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=d86f897e0e';
import SCHEMA from '../../worlds/app.project/interpretation-schema-source.mjs?v=6b76e19282';
import POLICY from '../../worlds/app.project/interpretation-policy-source.mjs?v=8b329bdf50';

const MODULE='app.interpret';
let loaded=null,policy=null;
const one=(row,key)=>row.attrs[key]?.length===1?str(row.attrs[key][0]):undefined;
const all=(row,key)=>(row.attrs[key]??[]).map(str);
const dropKey=drops=>[...new Set(drops)].sort().join(' ');

function policyWorld(source=POLICY){
 if(source===POLICY&&loaded)return loaded;
 const world=new World({library:{[MODULE]:SCHEMA}});
 const told=world.tell(source);
 if(!told.ok)throw Error('invalid-interpretation-policy: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 if(source===POLICY)loaded=world;
 return world;
}

/** The policy as plain data, validated against the schema. A malformed policy throws (no silent default). */
export function interpretationPolicy(source=POLICY){
 if(source===POLICY&&policy)return policy;
 const world=policyWorld(source);
 const retries=world.ofType(MODULE+'.retry').map(row=>({id:row.id,profile:one(row,'profile'),method:one(row,'method'),order:Number(one(row,'order')),when:one(row,'when'),drops:all(row,'drops'),label:one(row,'label')}))
  .sort((a,b)=>a.order-b.order||a.profile.localeCompare(b.profile));
 if(new Set(retries.map(retry=>retry.order)).size!==retries.length)throw Error('invalid-interpretation-policy: retry orders must be distinct');
 const compare=Object.fromEntries(world.ofType(MODULE+'.compare').map(row=>[one(row,'mode'),{id:row.id,min:Number(one(row,'min')),max:Number(one(row,'max'))}]));
 for(const [mode,bounds] of Object.entries(compare))if(bounds.min>bounds.max)throw Error('invalid-interpretation-policy: compare '+mode+' min > max');
 const areaRetry=world.ofType(MODULE+'.areaRetry').map(row=>({id:row.id,reasons:all(row,'reason'),label:one(row,'label')}))[0]??null;
 const coordination=world.ofType(MODULE+'.coordination').map(row=>({id:row.id,act:one(row,'act'),requests:Number(one(row,'requests'))}));
 const detect=world.ofType(MODULE+'.language').filter(row=>one(row,'role')==='detect');
 if(detect.length!==1)throw Error('invalid-interpretation-policy: exactly one language detection rule');
 const notes=Object.fromEntries(world.ofType(MODULE+'.note').map(row=>[dropKey(all(row,'drops')),one(row,'text')]));
 const defaults=world.ofType(MODULE+'.default').map(row=>({field:one(row,'field'),value:one(row,'value'),...(one(row,'when')?{when:one(row,'when')}:{})}));
 const drops=Object.fromEntries(world.ofType(MODULE+'.drop').map(row=>[one(row,'reason'),one(row,'text')]));
 const fallbacks=world.ofType(MODULE+'.fallback').map(row=>({step:one(row,'step'),order:Number(one(row,'order')),text:one(row,'text')})).sort((a,b)=>a.order-b.order);
 if(new Set(fallbacks.map(f=>f.order)).size!==fallbacks.length)throw Error('invalid-interpretation-policy: fallback orders must be distinct');
 const families=world.ofType(MODULE+'.family').map(row=>({area:one(row,'area'),type:one(row,'family'),kind:one(row,'kind')}));
 const familyOperations=world.ofType(MODULE+'.familyOperation').map(row=>({id:row.id,area:one(row,'area'),type:one(row,'family'),operation:one(row,'operation')}));
 // The acts whose operation a key bound by its parameter name takes first (app.interpret.parameterAct).
 const parameterActs=world.ofType(MODULE+'.parameterAct').flatMap(row=>all(row,'act'));
 // The spelling tolerance of a said kind word (app.interpret.spelling, spellingStep): sopworld readLexicalPhrase's.
 const numberJoiners=world.ofType(MODULE+'.numberJoiner').map(row=>one(row,'text'));
 const spell=world.ofType(MODULE+'.spelling')[0];
 const spelling=spell?{minLength:Number(one(spell,'minLength')),doubled:one(spell,'doubled')==='true',swapped:one(spell,'swapped')==='true',
  steps:world.ofType(MODULE+'.spellingStep').map(row=>({above:Number(one(row,'above')),edits:Number(one(row,'edits'))})).sort((a,b)=>a.above-b.above)}:null;
 const relations=world.ofType(MODULE+'.relation').map(row=>({id:row.id,area:one(row,'area'),key:one(row,'key'),anchor:one(row,'anchor'),like:one(row,'like'),
  values:Object.fromEntries(world.ofType(MODULE+'.relationValue').filter(v=>v.attrs.of?.[0]==='$'+row.id).map(v=>[one(v,'value'),one(v,'relation')]))}));
 const control={verbs:Object.fromEntries(world.ofType(MODULE+'.controlVerb').map(row=>[one(row,'act'),one(row,'text')])),modifiers:Object.fromEntries(world.ofType(MODULE+'.controlModifier').map(row=>[one(row,'parameter'),one(row,'text')]))};
 if(!control.verbs.other)throw Error('invalid-interpretation-policy: a control verb for act other');
 // What each answer mode allows a turn to try (app.interpret.mode; the mode itself is the interaction.mode preference).
 const modes=Object.fromEntries(world.ofType(MODULE+'.mode').map(row=>[one(row,'mode'),Object.freeze({id:row.id,mode:one(row,'mode'),retries:Number(one(row,'retries')),compare:Number(one(row,'compare')),
  fallbacks:Number(one(row,'fallbacks')),areas:Number(one(row,'areas')),placement:one(row,'placement'),label:one(row,'label')})]));
 if(!modes.fast||!modes.thinking)throw Error('invalid-interpretation-policy: the fast and thinking modes must be declared');
 const result=Object.freeze({retries,notes,compare,modes,coordination,areaRetry,control,language:{id:detect[0].id,minConfidence:Number(one(detect[0],'min.confidence'))},partial:{defaults,drops,fallbacks,families,relations,familyOperations,parameterActs,spelling,numberJoiners}});
 if(source===POLICY)policy=result;
 return result;
}

/**
 * The reply sentence for a used re-reading: its drops that are its own (no earlier profile drops them) plus the drops
 * of earlier profiles that produced a reading. `produced` is the set of profiles whose re-reading existed.
 */
export function retryNote(used,produced,source=POLICY){
 const {retries,notes}=interpretationPolicy(source),index=retries.findIndex(retry=>retry.profile===used);
 if(index<0)return null;
 const earlier=retries.slice(0,index),own=retries[index].drops.filter(drop=>!earlier.some(retry=>retry.drops.includes(drop)));
 const shown=retries[index].drops.filter(drop=>own.includes(drop)||earlier.some(retry=>produced.has(retry.profile)&&retry.drops.includes(drop)));
 return notes[dropKey(shown)]??null;
}

/** Whether a raw reader proposal is first offered to the coordination reader. */
export function coordinationEligible(proposal,source=POLICY){
 const requests=proposal?.raw?.requests;
 if(!Array.isArray(requests))return null;
 return interpretationPolicy(source).coordination.find(rule=>requests.length===rule.requests&&requests.every(request=>request?.act===rule.act))??null;
}

/** The comparison bounds of an admission mode, or null when that mode compares nothing. */
export function comparisonBounds(mode,source=POLICY){return interpretationPolicy(source).compare[mode]??null;}

export const inspectInterpretationPolicy=()=>({source:'worlds/app.project/interpretation-policy.sop',wires:POLICY,schema:SCHEMA,loaded:!!loaded});
