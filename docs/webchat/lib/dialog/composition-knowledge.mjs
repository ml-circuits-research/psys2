// The scene adapter passes observed parameter values to the authored projection profile.
import { World, parse, quote } from '../vendor/sopworld/sopworld.mjs?v=f63db0e6f1';
import PROJECTION from '../../worlds/app.project/scene-default-projection-source.mjs?v=695010e833';

export const sceneProjectionSource = PROJECTION;
const declarations = new Map(parse(PROJECTION).map(wire => [wire.id, wire]));
const profiles = new Map([...declarations.values()].filter(wire => wire.type === 'std.knowledge.profile').map(wire => [
 wire.id, new Set(['input','read','select'].flatMap(key => wire.attrs[key] ?? [])
  .map(ref => declarations.get(ref.slice(1)).attrs.param[0])),
]));
let context;
export const projectionLoaded = () => Boolean(context);
export const projectionModule = profile => declarations.get(profile)?.attrs.module?.[0];

export async function readCompositionRegions(knowledge, parameters, profile) {
 const catalog = knowledge?.base ?? knowledge;
 const ports = profiles.get(profile);
 if (!catalog?.wireSource || !ports) return '';
 if (!context) {
  const world = new World();
  const admitted = world.tell(PROJECTION);
  if (!admitted.ok) throw Error('invalid-scene-projection:' + admitted.violations[0]?.kind);
  context = world;
 }
 const facts = [], references = [];
 for (const [param, values] of Object.entries(parameters)) {
  if (!ports.has(param) || values == null) continue;
  const tokens = Array.isArray(values) ? values : [values];
  if (!tokens.length) continue;
  const id = 'scene.projection.binding.' + facts.length;
  references.push('binding=$' + id);
  facts.push('@' + id + ' std.knowledge.binding param=' + param + ' ' +
   [...new Set(tokens)].map(value => 'value=' + quote(value)).join(' '));
 }
 return await context.compileRequest([
  '@scene.projection.request std.knowledge.request profile=$' + profile + ' ' + references.join(' '),
  ...facts,
 ].join('\n'), {catalog});
}
