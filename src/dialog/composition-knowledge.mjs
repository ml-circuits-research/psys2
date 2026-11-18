// The scene adapter passes observed parameter values to the authored projection profile.
import { World, quote } from '../vendor/sopworld/sopworld.mjs';
import PROJECTION from '../../worlds/app.project/scene-default-projection-source.mjs';

export const sceneProjectionSource = PROJECTION;
let context;
export const projectionLoaded = () => Boolean(context);

export async function readCompositionRegions(knowledge, parameters) {
 const catalog = knowledge?.base ?? knowledge;
 if (!catalog?.wireSource || !parameters.subjects.length) return '';
 if (!context) {
  const world = new World();
  const admitted = world.tell(PROJECTION);
  if (!admitted.ok) throw Error('invalid-scene-projection:' + admitted.violations[0]?.kind);
  context = world;
 }
 const facts = [], references = [];
 for (const [param, values] of Object.entries(parameters)) {
  const tokens = Array.isArray(values) ? values : [values];
  if (!tokens.length) continue;
  const id = 'scene.projection.binding.' + facts.length;
  references.push('binding=$' + id);
  facts.push('@' + id + ' std.knowledge.binding param=' + param + ' ' +
   [...new Set(tokens)].map(value => 'value=' + quote(value)).join(' '));
 }
 return await context.compileRequest([
  '@scene.projection.request std.knowledge.request profile=$scene.projection ' + references.join(' '),
  ...facts,
 ].join('\n'), {catalog});
}
