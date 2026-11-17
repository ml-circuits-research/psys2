// Operational C1 scheduling policy. Ordering independent cuts is not a causal claim.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=20fdd56a67';
import SOURCE from '../../worlds/app.project/request-composition-policy-source.mjs?v=d87022200d';
export const REQUEST_COMPOSITION_POLICY_SOURCE=SOURCE;
let world;
export function requestCompositionPolicy(){
 if(!world){world=new World();if(!world.load(REQUEST_COMPOSITION_POLICY_SOURCE).ok)throw Error('invalid-request-composition-policy');}
 const declaration=world.get('composition.default'),value=key=>str(declaration?.attrs[key]?.[0]);
 return {enabled:value('independent.order')==='source'&&value('explicit.dependencies')==='preserve',order:value('independent.order'),dependencies:value('explicit.dependencies'),undo:value('undo'),world:'app.request.composition',declaration:'composition.default'};
}
export const inspectRequestCompositionPolicy=()=>({loaded:!!world,world:world??null,source:REQUEST_COMPOSITION_POLICY_SOURCE});

