// Schedule actual independent cuts after observing the result of the previous step.
import {World,parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=851c80bc87';
import SOURCE from '../../worlds/app.project/request-composition-policy-source.mjs?v=21f4be0430';
import SCHEMA from '../../worlds/app.project/request-composition-policy-schema-source.mjs?v=c1db2074cc';
export const REQUEST_COMPOSITION_POLICY_SOURCE=SOURCE;
const schemaModule='app.request.composition';
const declarations=parse(SOURCE);
const imports=declarations.filter(wire=>wire.type==='core.use');
const rules=declarations.filter(wire=>wire.type!=='core.use');
const get=(wire,key)=>str(wire?.attrs[key]?.[0]);
let world;

function worldFor(source){
 if(source===SOURCE&&world)return world;
 const policy=new World({library:{[schemaModule]:SCHEMA}});
 const declaration=parse(source);
 policy.load(serialize(declaration.filter(wire=>wire.type==='core.use')));
 policy.load(serialize(declaration.filter(wire=>wire.type!=='core.use')));
 const declarations=policy.ofType('app.request.composition.policy');
 if(declarations.length!==1)throw Error('invalid-request-composition-policy');
 if(source===SOURCE)world=policy;
 return policy;
}

export function requestCompositionPolicy(source=SOURCE){
 const base=worldFor(source);
 const [declaration]=base.ofType('app.request.composition.policy');
 return {enabled:get(declaration,'independent.order')==='source'&&get(declaration,'explicit.dependencies')==='preserve',
  order:get(declaration,'independent.order'),dependencies:get(declaration,'explicit.dependencies'),undo:get(declaration,'undo'),
  world:schemaModule,declaration:declaration.id};
}

export function scheduleFollowingCut(reply,remaining,source=SOURCE){
 if(!Number.isInteger(remaining)||remaining<1||remaining>32)throw Error('invalid-request-composition-count');
 const complete=reply.statuses?.length>0&&reply.statuses.every(status=>status==='supported')&&!reply.trace?.partial;
 const input='@composition.observed app.request.composition.progress previous='+ (complete?'complete':'unresolved') +' remaining='+remaining;
 const trial=worldFor(source).fork();
 if(!trial.tell(input,{factsOnly:true}).ok)throw Error('invalid-request-composition-observation');
 const decisions=trial.ofType('app.request.composition.decision');
 if(decisions.length!==1)throw Error('invalid-request-composition-decision');
 return {action:get(decisions[0],'action'),sop:input+'\n'+serialize(decisions)};
}

export const inspectRequestCompositionPolicy=()=>({
 loaded:!!world,
 world:world??null,
 source:REQUEST_COMPOSITION_POLICY_SOURCE,
 facts:serialize(rules),
 schema:{module:schemaModule,source:'worlds/app.project/request-composition-policy-schema.sop',wires:SCHEMA,loaded:!!world},
 dependencies:imports.map(wire=>str(wire.attrs.world[0])),
});
