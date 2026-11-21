// SPDX-License-Identifier: AGPL-3.0-only
// Declared application defaults of the default-placement problem and the rule that picks a solved candidate region
// (worlds/app.project/placement-default-policy.sop). default-placement.mjs holds no weight, budget or ordering itself.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import SCHEMA from '../../worlds/app.project/placement-default-schema-source.mjs?v=170e03c550';
import POLICY from '../../worlds/app.project/placement-default-policy-source.mjs?v=b1864ccb45';
import {compileObservedChoice} from './observed-choice.mjs?v=ca9485e4cd';

let loaded=null;
function policy(){
 if(loaded)return loaded;
 const world=new World({library:{'app.placement':SCHEMA}}),told=world.tell(POLICY);
 if(!told.ok)throw Error('invalid-placement-default-policy: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 const rows=world.ofType('app.placement.default');
 if(rows.length!==1)throw Error('invalid-placement-default-policy: exactly one app.placement.default');
 const defaults=Object.freeze(Object.fromEntries(Object.entries(rows[0].attrs).map(([key,values])=>[key,Number(str(values[0]))])));
 // The solver may stop at a candidate with no overlap only while overlaps is the first declared criterion (min).
 const criteria=world.ofType('std.decide.criterion').filter(row=>str(row.attrs.of[0])==='app.place.region').sort((a,b)=>Number(str(a.attrs.n[0]))-Number(str(b.attrs.n[0])));
 const first=criteria[0];
 const stopAtNoOverlap=!!first&&str(first.attrs.measure[0])==='overlaps'&&str(first.attrs.dir[0])==='min';
 const hypotheses=world.ofType('app.placement.hypothesis').map(row=>Object.fromEntries([['id',row.id],...Object.entries(row.attrs).map(([key,values])=>[key,str(values[0])])])).map(h=>({...h,rank:Number(h.rank)})).sort((a,b)=>a.rank-b.rank);
 const texts=type=>Object.fromEntries(world.ofType(type).map(row=>[str(row.attrs[type==='app.placement.disclosure'?'stage':'relation'][0]),str(row.attrs.text[0])]));
 return loaded={world,defaults,stopAtNoOverlap,hypotheses,disclosures:texts('app.placement.disclosure'),relationWords:texts('app.placement.relationWord')};
}

/** The objective with every missing key filled from the declared defaults, and the list of keys that were filled. */
export function resolveObjective(objective={}){
 const {defaults}=policy(),resolved={...objective},defaulted=[];
 for(const [key,value] of Object.entries(defaults))if(resolved[key]===undefined||resolved[key]===null||resolved[key]===''){resolved[key]=value;defaulted.push(key);}
 return {objective:resolved,defaulted};
}

export const stopAtNoOverlap=()=>policy().stopAtNoOverlap;

/** Picks among solved candidates [{overlaps, order}] by the declared criteria; answers { index, input, sop }. */
export function chooseRegion(candidates){
 const trace=compileObservedChoice(policy().world,'app.place.region',candidates.map(({overlaps,order})=>({overlaps,order})));
 return {index:trace.selected,input:trace.input,sop:trace.sop};
}

/** The declared alternative readings of a failed relation placement, by rank. */
export const placementHypotheses=()=>policy().hypotheses;

/** The declared reply text of a placement stage (a method fallback, an anchor drawn first), its {relation}, {anchor}, {direction} and {rule} filled in; '' when none is declared. */
export function placementDisclosure(stage,{relation,anchor,direction,rule}={}){
 const {disclosures,relationWords}=policy(),text=disclosures[stage];
 if(!text)return '';
 const values={relation:relationWords[relation]??relation??'',anchor:anchor??'',direction:direction??'',rule:rule??''};
 return text.replace(/\{(relation|anchor|direction|rule)\}/g,(_,key)=>values[key]);
}

export const inspectPlacementDefaultPolicy=()=>({source:'worlds/app.project/placement-default-policy.sop',wires:POLICY,schema:SCHEMA,loaded:!!loaded});
