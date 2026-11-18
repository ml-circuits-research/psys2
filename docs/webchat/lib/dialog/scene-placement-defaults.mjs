// The compiler receives exact catalog regions and current renderer evidence.
import { parse, quote } from '../vendor/sopworld/sopworld.mjs?v=3a48344175';
import { nativeKindCandidates } from './native-binding-candidates.mjs?v=f6d6f43960';
import { readCompositionRegions, projectionLoaded, sceneProjectionSource } from './composition-knowledge.mjs?v=6b420e733f';
import POLICY from '../../worlds/app.project/scene-default-policy-source.mjs?v=06eaeac5e8';
import SCHEMA from '../../worlds/app.project/scene-default-schema-source.mjs?v=0a4d397328';

const family = 'app.sceneDefault.';
const coordinateKeys = ['min_x', 'min_y', 'max_x', 'max_y'];
const first = (row, key) => row.attrs[key]?.[0];
const isBox = box => box && coordinateKeys.every(key => Number.isFinite(box[key]));
const style = parse(POLICY).find(row => row.type === family + 'style');
export const sceneDefaultModule = { name: 'app.sceneDefault', schema: SCHEMA, policy: POLICY, projection: sceneProjectionSource };
export const sceneDefaultInspection = () => ({...sceneDefaultModule, projectionLoaded:projectionLoaded()});

export async function readSceneDefaults({ host, bindings, area, view, knowledge, candidates }) {
  if (!host.observeSpatial || !host.measureSpatial || !(knowledge?.base ?? knowledge)?.wireSource) return null;
  const targets = new Set(candidates.flatMap(candidate => parse(candidate.wires)
    .filter(row => row.type === 'std.request.target' && first(row, 'mode') === 'new').map(row => first(row, 'kind'))));
  if (!targets.size) return null;
  const readerArea = bindings.readerAreaByView?.[view] ?? area.area;
  const mappings = nativeKindCandidates(bindings).filter(row => row.area === readerArea && targets.has(row.canonical) &&
    row.nativeFamilyBinding && typeof row.lemma === 'string');
  if (!mappings.length) return null;
  const spatial = host.observeSpatial();
  if (!spatial.observation.complete || spatial.unknown.some(entity => spatial.occupants.includes(entity))) return null;
  const available = new Set(spatial.occupants), boxes = new Map(spatial.boxes.filter(isBox).map(box => [box.entity,box]));
  const bounds = boxes.get(spatial.viewport ?? spatial.bounds);
  if (!bounds) return null;
  const peers = spatial.observation.objects.flatMap((object, order) => available.has(object.id) && boxes.has(object.id)
    ? [{ ...boxes.get(object.id), name: object.kind, source: object.source, order }] : []);
  let regions;
  try { regions = await readCompositionRegions(knowledge, {
    subjects: [...new Set(mappings.map(row => row.lemma))],
    anchors: [...new Set(peers.map(row => row.name))],
    layout: first(style,'layout'),
  }); } catch (error) {
    if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
    return null;
  }
  if (!regions) return null;
  const regionRows = parse(regions);
  if (!regionRows.length || regionRows[0].type === 'std.compile.result') return null;
  return { regions: regionRows, bounds, peers, mappings, spatial };
}

export function writeSceneDefaults(scene, host, scope, operations, write, wires) {
  if (typeof host.bindings !== "function") return;
  const declared = new Map(host.bindings().map(operation => [operation.id,operation]));
  for (const operation of declared.values()) {
    const port = operation.spatial;
    if (port?.xKey && port?.yKey && operations.has(operation.id)) {
      write(family + 'port', {scope, operation: operations.get(operation.id), xKey: quote(port.xKey), yKey: quote(port.yKey)});
    }
  }
  if (!scene) return;
  const coordinates = box => Object.fromEntries(coordinateKeys.map(key => [key,String(box[key])]));
  write(family + 'frame', { scope, ...coordinates(scene.bounds) });
  for (const peer of scene.peers) write(family + 'peer', { scope, entity: quote(String(peer.entity)), name: quote(peer.name),
    source: quote(peer.source), order: String(peer.order), ...coordinates(peer) });
  wires.push(...scene.regions);

  for (const mapping of scene.mappings) {
    const binding = mapping.nativeFamilyBinding, operation = declared.get(binding.operation), place = operation?.spatial;
    if (!place?.kindKey || !operations.has(binding.operation)) continue;
    const data = { ...binding.arguments,[place.kindKey]: mapping.lemma };
    if (Object.values(data).some(value => !['string','number','boolean'].includes(typeof value))) continue;
    const args = Object.entries(data).map(([key,value])=>key+'='+JSON.stringify(value));
    let extent;
    try { extent = host.measureSpatial('@scene.measure '+operation.id+' '+args.join(' ')); }
    catch (error) { if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error; continue; }
    if (!extent || !Number.isFinite(extent.width) || !Number.isFinite(extent.height)) continue;
    write(family + 'subject', { scope, canonical: mapping.canonical, name: quote(mapping.lemma), operation: operations.get(binding.operation),
      xKey: quote(place.xKey), yKey: quote(place.yKey), width: String(extent.width), height: String(extent.height) });
  }
}
