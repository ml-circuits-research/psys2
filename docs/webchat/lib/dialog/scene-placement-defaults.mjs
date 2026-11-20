// The compiler receives exact catalog regions and current renderer evidence.
import { parse, quote } from '../vendor/sopworld/sopworld.mjs?v=adaae660f3';
import { readCompositionRegions, projectionLoaded, sceneProjectionSource } from './composition-knowledge.mjs?v=ca34a8983e';
import POLICY from '../../worlds/app.project/scene-default-policy-source.mjs?v=5158428d8d';
import SCHEMA from '../../worlds/app.project/scene-default-schema-source.mjs?v=cde8a3092d';

const family = 'app.sceneDefault.';
const coordinateKeys = ['min_x', 'min_y', 'max_x', 'max_y'];
const first = (row, key) => row.attrs[key]?.[0];
const isBox = box => box && coordinateKeys.every(key => Number.isFinite(box[key]));
export const sceneDefaultModule = { name: 'app.sceneDefault', schema: SCHEMA, policy: POLICY, projection: sceneProjectionSource };
export const sceneDefaultInspection = () => ({...sceneDefaultModule, projectionLoaded:projectionLoaded()});

export async function readSceneDefaults({ host, knowledge, candidates, preflight }) {
  if (!host.observeSpatial || !host.measureSpatial || !(knowledge?.base ?? knowledge)?.wireSource) return null;
  const targets = candidates.flatMap(candidate => {
    const kinds = new Set(parse(candidate.wires).filter(row =>
      row.type === 'std.request.target' && first(row,'mode') === 'new' &&
      first(row,'request') === '$'+candidate.request).map(row => first(row,'kind')).filter(Boolean));
    return kinds.size===1 ? [{candidate,canonical:[...kinds][0]}] : [];
  });
  if (!targets.length) return null;
  const operations = new Map(host.bindings().map(operation => [operation.id,operation]));
  const groups = new Map(), signatures = new Map();
  for (const {candidate,canonical} of targets) {
    const plan = preflight(candidate);
    const port = operations.get(plan.operation)?.spatial;
    if (plan.status !== 'compiled' || plan.act !== 'make' || !port?.projection || !port.layout || !port.kindKey) continue;
    const { [port.xKey]:x, [port.yKey]:y, ...args } = plan.args;
    const name = args[port.kindKey], count = port.countKey ? args[port.countKey] : undefined;
    if (typeof name !== 'string' || x !== undefined && y !== undefined) continue;
    if (port.countKey && (!Number.isSafeInteger(count) || count < 1)) continue;
    if (Object.values(args).some(value => !['string','number','boolean'].includes(typeof value))) continue;
    const key = JSON.stringify([port.projection,port.layout,port.role]);
    if (!groups.has(key)) groups.set(key,{port,subjects:[]});
    const variant = JSON.stringify([plan.operation,canonical,count]);
    const signature = JSON.stringify(Object.entries(args).sort(([a],[b])=>a.localeCompare(b)));
    if (signatures.has(variant)) {
      if(signatures.get(variant)!==signature)signatures.set(variant,null);
      continue;
    }
    signatures.set(variant,signature);
    groups.get(key).subjects.push({operation:plan.operation,canonical,name,args,count,variant});
  }
  for (const [key,group] of groups) {
    group.subjects=group.subjects.filter(subject=>signatures.get(subject.variant)!==null);
    if(!group.subjects.length)groups.delete(key);
  }
  if (!groups.size) return null;
  const spatial = host.observeSpatial();
  if (!spatial.observation.complete || spatial.unknown.some(entity => spatial.occupants.includes(entity))) return null;
  const available = new Set(spatial.occupants), boxes = new Map(spatial.boxes.filter(isBox).map(box => [box.entity,box]));
  const bounds = boxes.get(spatial.viewport ?? spatial.bounds);
  if (!bounds) return null;
  const peers = spatial.observation.objects.flatMap((object, order) => available.has(object.id) && boxes.has(object.id)
    ? [{ ...boxes.get(object.id), name: object.kind, source: object.source, order }] : []);
  const anchors = peers.map(row => row.name);
  const projections = (await Promise.all([...groups.values()].map(async ({port,subjects}) => {
    try {
      const source = await readCompositionRegions(knowledge, {
        subjects: subjects.map(row => row.name), anchors, layout:port.layout, role:port.role,
      },port.projection);
      const rows = parse(source);
      return rows.length && rows[0].type !== 'std.compile.result' ? {rows,subjects,port} : null;
    } catch (error) {
      if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error;
      return null;
    }
  }))).filter(Boolean);
  return projections.length ? {projections,bounds,peers} : null;
}

export function writeSceneDefaults(scene, host, scope, operations, write, wires) {
  if (typeof host.bindings !== "function") return;
  const declared = new Map(host.bindings().map(operation => [operation.id,operation]));
  for (const operation of declared.values()) {
    const port = operation.spatial;
    if (port?.xKey && port?.yKey && operations.has(operation.id)) {
      write(family + 'port', {scope, operation: operations.get(operation.id), xKey: quote(port.xKey), yKey: quote(port.yKey), countKey:port.countKey?quote(port.countKey):undefined});
    }
  }
  if (!scene) return;
  const coordinates = box => Object.fromEntries(coordinateKeys.map(key => [key,String(box[key])]));
  write(family + 'frame', { scope, ...coordinates(scene.bounds) });
  for (const peer of scene.peers) write(family + 'peer', { scope, entity: quote(String(peer.entity)), name: quote(peer.name),
    source: quote(peer.source), order: String(peer.order), ...coordinates(peer) });
  const rows = new Map();
  const admitted = new Set();
  for (const projection of scene.projections) {
    const projectedOperations = new Set(projection.subjects.map(subject => operations.get(subject.operation)).filter(Boolean));
    for (const row of projection.rows) {
      rows.set(row.id,row);
      for (const operation of projectedOperations) {
        const key = JSON.stringify([operation,row.id]);
        if (admitted.has(key)) continue;
        admitted.add(key);
        const {projection:profile,layout,role} = projection.port;
        write(family + 'region', {operation,value:'$'+row.id,profile:quote(profile),layout:quote(layout),...(role ? {role:quote(role)} : {})});
      }
    }
  }
  wires.push(...rows.values());

  for (const {port,subjects} of scene.projections) for (const subject of subjects) {
    const operation = operations.get(subject.operation);
    if (!operation) continue;
    const args = Object.entries(subject.args).map(([key,value])=>key+'='+JSON.stringify(value));
    let extent;
    try { extent = host.measureSpatial('@scene.measure '+subject.operation+' '+args.join(' ')); }
    catch (error) { if (error?.name === 'BudgetExceeded' || error?.name === 'TurnAborted') throw error; continue; }
    if (!extent || !Number.isFinite(extent.width) || !Number.isFinite(extent.height)) continue;
    const {minX=-extent.width/2,minY=-extent.height/2,maxX=extent.width/2,maxY=extent.height/2} = extent;
    if (![minX,minY,maxX,maxY].every(Number.isFinite)) continue;
    const guard = port.countKey ? write('std.capability.arg',{name:quote(port.countKey),value:String(subject.count)}) : undefined;
    write(family + 'subject', { scope, canonical:subject.canonical, name:quote(subject.name), operation, guard, guarded:String(Boolean(guard)),
      xKey:quote(port.xKey), yKey:quote(port.yKey), minX:String(minX), minY:String(minY), maxX:String(maxX), maxY:String(maxY) });
  }
}
