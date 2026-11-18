// Operational C1 scheduling policy. Ordering independent cuts is not a causal claim.
import {World,parse,serialize,str} from '../vendor/sopworld/sopworld.mjs?v=f5d53a8da9';
import SOURCE from '../../worlds/app.project/request-composition-policy-source.mjs?v=e190149088';
import SCHEMA from '../../worlds/app.project/request-composition-policy-schema-source.mjs?v=1b5c95ad54';
export const REQUEST_COMPOSITION_POLICY_SOURCE=SOURCE;
const schemaModule='app.request.composition';
const declarations=parse(SOURCE);
const imports=declarations.filter(wire=>wire.type==='core.use');
const facts=declarations.filter(wire=>wire.type!=='core.use');
let world;
export function requestCompositionPolicy(){
 if(!world){
  const context=new World({library:{[schemaModule]:SCHEMA}});
  if(!context.tell(imports).ok)throw Error('invalid-request-composition-policy-schema');
  const policy=context.fork();
  if(!policy.tell(facts,{factsOnly:true}).ok)throw Error('invalid-request-composition-policy');
  world=policy;
 }
 const declaration=world.get('composition.default'),value=key=>str(declaration?.attrs[key]?.[0]);
 return {enabled:value('independent.order')==='source'&&value('explicit.dependencies')==='preserve',order:value('independent.order'),dependencies:value('explicit.dependencies'),undo:value('undo'),world:schemaModule,declaration:'composition.default'};
}
export const inspectRequestCompositionPolicy=()=>({
 loaded:!!world,
 world:world??null,
 source:REQUEST_COMPOSITION_POLICY_SOURCE,
 facts:serialize(facts),
 schema:{module:schemaModule,source:'worlds/app.project/request-composition-policy-schema.sop',wires:SCHEMA,loaded:!!world},
 dependencies:imports.map(wire=>str(wire.attrs.world[0])),
});
