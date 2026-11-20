import {World,serialize,quote,str} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import SCHEMA from '../../worlds/app.project/reference-schema-source.mjs?v=c95e0e0936';
import POLICY from '../../worlds/app.project/reference-policy-source.mjs?v=e04490324e';
import {compileObservedChoice} from './observed-choice.mjs?v=2a2b4c3e8a';

let base;
export function referencePolicyWorld() {
  if (base) return base;
  const world = new World({library:{'app.reference':SCHEMA}});
  world.load(POLICY);
  base = world;
  return world;
}

export function inspectReferencePolicy() {
  return {loaded:!!base,schema:SCHEMA,policy:POLICY};
}

// The reader provides the observed values. Its missing heads remain absent.
function record(id,type,values) {
  const fields = Object.entries(values).filter(([,value]) => value !== undefined);
  return {id,type:'app.reference.'+type,attrs:Object.fromEntries(fields.map(([key,value])=>
    [key,[typeof value === 'boolean' ? String(value) : quote(value)]]))};
}
const get = (row,key) => str(row.attrs[key]?.[0]);

export function readReferenceTurn(request,baseWorld=referencePolicyWorld()) {
  const world = baseWorld.fork();
  const target = request.target;
  const reading = record('ref.input','reading',{turn:'current',act:request.act,mood:request.mood,
    mode:target.mode,fill:target.fill,quantifier:target.quantifier,fragment:request.turn?.fragment});
  if (!world.tell(serialize([reading]),{factsOnly:true}).ok) return null;
  const routes = world.ofType('app.reference.resolution');
  return routes.length === 1 ? {world,values:get(routes[0],'values'),policy:get(routes[0],'policy')} : null;
}

export function resolveObservedReference(route,objects,mappings,focus) {
  const {world,policy,values} = route;
  const facts = objects.map((object,i) => record('ref.object.'+i,'object',
    {id:object.id,kind:object.kind,sourceType:object.sourceType}));
  for (const mapping of mappings) {
    if (!mapping.nativeFamilyBinding?.sourceType || !mapping.canonical || !mapping.lemma) continue;
    facts.push(record('ref.mapping.'+facts.length,'mapping',{sourceType:mapping.nativeFamilyBinding.sourceType,
      lemma:mapping.lemma,canonical:mapping.canonical,family:!!mapping.familyIdentity}));
  }
  if (!world.tell(serialize(facts),{factsOnly:true}).ok) return null;
  const byId = new Map(objects.map((object,order) => [object.id,{object,order}]));
  const options = world.ofType('app.reference.match').map(row => ({
    ...byId.get(get(row,'id')),canonical:get(row,'canonical'),exact:get(row,'exact')==='true',
  }));
  const choice = compileObservedChoice(world,policy,
    options.map(({object,order,exact}) => ({focused:Number(object.id===focus),order,exact:Number(exact)})));
  if (choice.selected === undefined) return null;
  return {selected:options[choice.selected],options,choice,values};
}
