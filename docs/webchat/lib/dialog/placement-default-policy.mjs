// SPDX-License-Identifier: AGPL-3.0-only
// Declared application defaults of the default-placement problem and the rule that picks a solved candidate region
// (worlds/app.project/placement-default-policy.sop). default-placement.mjs holds no weight, budget or ordering itself.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=a37e1846b3';
import SCHEMA from '../../worlds/app.project/placement-default-schema-source.mjs?v=c2a46c4db6';
import POLICY from '../../worlds/app.project/placement-default-policy-source.mjs?v=d6391ad140';
import {compileObservedChoice} from './observed-choice.mjs?v=f7e0516487';

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
 return loaded={world,defaults,stopAtNoOverlap,hypotheses};
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

export const inspectPlacementDefaultPolicy=()=>({source:'worlds/app.project/placement-default-policy.sop',wires:POLICY,schema:SCHEMA,loaded:!!loaded});
