// SPDX-License-Identifier: AGPL-3.0-only
import { World, parse, quote, str } from '../../src/vendor/sopworld/sopworld.mjs';
import SOURCE from '../../src/dialog/new-engine-source.mjs';
import FEEDBACK from './spatial-feedback-source.mjs';
import FEEDBACK_SCHEMA from './spatial-feedback-schema-source.mjs';
import { nativeIdentitySnapshot, restoreNativeIdentitySnapshot } from '../../src/dialog/instance-identity.mjs';
import { spatialWire } from '../native-spatial-interface.mjs';

const namespace = 'k.spatial2d';
const tool = 'app.spatial-profile';
const profile = quote('session placement');
const limit = 64;
const stores = new WeakMap();
const scopeFields = ['frame', 'scope'];
let base;

function model(policy = FEEDBACK) {
  if (!SOURCE.spatial) return null;
  if (policy === FEEDBACK && base) return base;
  const world = new World({ library: { [namespace]: SOURCE.spatial.schema, 'app.spatialFeedback': FEEDBACK_SCHEMA } });
  if (!world.use(namespace).ok || !world.tell(SOURCE.spatial.facts, { factsOnly: true }).ok || !world.tell(policy).ok) return null;
  if (policy === FEEDBACK) base = world;
  return world;
}

export function inspectSpatialFeedback() {
  return { loaded: !!base, policy: FEEDBACK, schema: FEEDBACK_SCHEMA };
}

const stateOf = session => {
  if (!stores.has(session)) stores.set(session, { settings: [], corrections: [], links: [] });
  return stores.get(session);
};
const value = (wire, key) => wire?.attrs[key]?.length === 1 ? wire.attrs[key][0] : undefined;
const policyOf = (relation, metric) => model()?.ofType(namespace + '.policy').find(row =>
  value(row, 'relation') === relation && (metric === undefined || value(row, 'metric') === metric) &&
  value(row, 'profiled') === 'true' && value(row, 'hard') === 'false');
const scopeOf = spatial => ({ instance: spatial.observation.instanceId, frame: spatial.frame, scope: spatial.scope });
const tagsOf = (spatial, context = scopeOf(spatial)) => Object.fromEntries(Object.entries({...context, revision:spatial.revision}).map(([key,v])=>[key,quote(v)]));
const inScope = (event, scope) => event.instance === scope.instance && scopeFields.every(key => event[key] === scope[key]);
const comparison = scope => quote(scope.frame);
const applicable = (events, scope) => events.filter(event => inScope(event, scope));
const boundedAppend = (items, item) => [...items.slice(1 - limit), item];

export function readPlacementProfile(session, spatial) {
  const scope = scopeOf(spatial), state = stateOf(session), tags = tagsOf(spatial, scope);
  const wires = [spatialWire('profile.active', namespace + '.profile', { name: profile, ...tags, comparison: comparison(scope) })];
  const explicit = new Map();
  for (const event of applicable(state.settings, scope)) explicit.set(event.relation + '/' + event.metric, event);
  for (const [index, event] of [...explicit.values()].entries()) {
    wires.push(spatialWire('profile.setting.' + index, namespace + '.preference', {
      profile, frame: tags.frame, scope: tags.scope, relation: event.relation, metric: event.metric,
      clearance: event.clearance, weight: event.weight, evidence: quote(event.id),
    }));
  }
  for (const [index, event] of applicable(state.corrections, scope).entries()) {
    wires.push(spatialWire('profile.correction.' + index, namespace + '.correction', {
      profile, frame: tags.frame, scope: tags.scope, relation: event.relation, metric: event.metric,
      comparison: comparison(scope), event: quote(event.id), before: event.before, clearance: event.clearance,
      'core.source': quote(JSON.stringify([event.subject, event.anchor, event.beforeRevision, event.afterRevision])),
    }));
  }
  return wires.join('\n');
}

export function placementProfileSop(session, spatial, sop) {
  const invalid = { ok: false, message: 'Invalid placement setting.' };
  if (typeof sop !== 'string' || sop.length > 512) return invalid;
  let command;
  try {
    const wires = parse(sop);
    if (wires.length !== 1) return invalid;
    [command] = wires;
  } catch { return invalid; }

  const kind = command.type.slice(tool.length + 1);
  if (!['inspect', 'set', 'undo'].includes(kind) || command.type !== tool + '.' + kind) return invalid;
  const keys = kind === 'set' ? ['relation', 'metric', 'clearance'] : ['relation', 'metric'];
  if (Object.keys(command.attrs).length !== keys.length || keys.some(key => value(command, key) === undefined)) return invalid;
  const relation = value(command, 'relation'), metric = value(command, 'metric'), policy = policyOf(relation, metric);
  if (!policy || !spatial?.observation?.complete) return { ok: false, message: 'Placement spacing is unavailable in this editor.' };
  const scope = scopeOf(spatial), state = stateOf(session);
  const forPolicy = event => inScope(event, scope) && event.relation === relation && event.metric === metric;
  const previous = state.settings.findLast(forPolicy);
  if (kind === 'set') {
    const input = value(command, 'clearance'), clearance = Number(input);
    if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(input) || !Number.isFinite(clearance) || clearance < 0) return invalid;
    if (!previous || previous.clearance !== clearance) {
      state.settings = boundedAppend(state.settings, { ...scope, relation, metric, clearance, weight: Number(value(policy, 'weight')), id: crypto.randomUUID() });
    }
  }
  if (kind === 'undo' && previous) state.settings = state.settings.filter(event => event.id !== previous.id);
  const active = state.settings.findLast(forPolicy);
  return { ok: true, clearance: active?.clearance ?? null, defaultClearance: Number(value(policy, 'clearance')), canUndo: !!active,
    message: kind === 'set' ? 'Spacing preference saved.' : kind === 'undo' ? previous ? 'Undid the last spacing setting.' : 'There is no spacing setting to undo.' : '' };
}

const coordinateKeys = ['min_x','min_y','max_x','max_y'];
const coordinates = box => coordinateKeys.map(key => box[key]);

function readPair(spatial, subjectId, anchorId) {
  if (subjectId === anchorId || !spatial?.observation?.complete) return null;
  const rows = [subjectId, anchorId].map(id => {
    const object = spatial.observation.objects.find(row => row.id === id);
    const box = spatial.boxes.find(row => row.entity === id && row.scope === spatial.scope &&
      row.revision === spatial.revision && row.frame === spatial.frame && row.instance === spatial.observation.instanceId);
    return object?.source && box && { source:object.source, box };
  });
  if (rows.some(row => !row || !coordinates(row.box).every(Number.isFinite))) return null;
  return { subject:rows[0], anchor:rows[1] };
}

function gapWires(spatial, pair, relation) {
  const tags = tagsOf(spatial), id = label => quote(pair[label].box.entity);
  const box = label => spatialWire('profile.box.' + label, namespace + '.box', {
    ...tags, entity:id(label), evidence:pair[label].box.evidence,
    ...Object.fromEntries(coordinateKeys.map(key=>[key,pair[label].box[key]])),
  });
  return [box('subject'),box('anchor'),spatialWire('profile.relation', namespace + '.relation',
    { ...tags, subject:id('subject'), object:id('anchor'), kind:relation })];
}

function observedGap(spatial, pair, relation) {
  const tree = model()?.fork();
  if (!tree) return null;
  const result = tree.tell(gapWires(spatial,pair,relation).join('\n'), { factsOnly:true });
  if (!result.ok) return null;
  const rows = tree.ofType(namespace + '.pair_geometry');
  const gap = Number(rows.length === 1 ? value(rows[0], 'separation') : undefined);
  return Number.isFinite(gap) && gap >= 0 ? gap : null;
}

export function rememberPlacement(session, spatial, subjectId, anchorId, relation) {
  const policy = policyOf(relation), pair = readPair(spatial, subjectId, anchorId);
  if (!policy || !pair) return;
  const before = observedGap(spatial, pair, relation);
  if (before === null) return;
  const state = stateOf(session), scope = scopeOf(spatial);
  state.links = boundedAppend(state.links.filter(link => !inScope(link, scope) || link.subjectId !== subjectId), {
    ...scope, subjectId, anchorId, relation, metric:value(policy,'metric'), before,
    subject:pair.subject.source, anchor:pair.anchor.source, subjectBox:coordinates(pair.subject.box), anchorBox:coordinates(pair.anchor.box),
  });
}

function measuredCorrection(link, before, after, prior, current, policy) {
  const tree = model(policy)?.fork();
  if (!tree) return null;
  const observation = (stage, role, source, values) => spatialWire('profile.sample.' + stage + '.' + role,
    'app.spatialFeedback.geometry', {stage, role, source:quote(source),
      ...Object.fromEntries(coordinateKeys.map((key, index)=>[key,values[index]]))});
  const samples = ['subject','anchor'].flatMap(role => [
    observation('remembered',role,link[role],link[role+'Box']),
    observation('prior',role,prior[role].source,coordinates(prior[role].box)),
    observation('current',role,current[role].source,coordinates(current[role].box)),
  ]);
  const change = spatialWire('profile.change','app.spatialFeedback.change',{
    subject:quote(link.subjectId), anchor:quote(link.anchorId), relation:link.relation, before:link.before,
    frame:quote(link.frame), scope:quote(link.scope), instance:quote(link.instance),
    prior:quote(before.revision), current:quote(after.revision),
  });
  if (!tree.tell([...gapWires(after,current,link.relation),change,...samples].join('\n'),{factsOnly:true}).ok) return null;
  const rows = tree.ofType('app.spatialFeedback.accepted');
  const clearance = Number(rows.length === 1 ? value(rows[0],'clearance') : undefined);
  return Number.isFinite(clearance) ? clearance : null;
}

export function observePlacementCorrection(session, before, after, movedId, invocation, policy = FEEDBACK) {
  if (!before || !after) return null;
  const state = stateOf(session), scope = scopeOf(before);
  const link = state.links.find(item => inScope(item, scope) && item.subjectId === movedId);
  if (!link || link.corrected) return null;
  const prior = readPair(before, movedId, link.anchorId), current = readPair(after, movedId, link.anchorId);
  if (!prior || !current) return null;
  const clearance = measuredCorrection(link, before, after, prior, current, policy);
  if (clearance === null) return null;
  const event = {
    ...scope, id:invocation, relation:link.relation, metric:link.metric, before:link.before, clearance, subject:link.subject,
    anchor:link.anchor, beforeRevision:before.revision, afterRevision:after.revision,
  };
  link.corrected = event.id;
  state.corrections = boundedAppend(state.corrections, event);
  return event;
}

export function withdrawPlacementCorrection(session, event, redo) {
  const state = stateOf(session);
  state.corrections = state.corrections.filter(row => row.id !== event.id);
  if (redo) state.corrections = boundedAppend(state.corrections, event);
}

export function prunePlacementLinks(session, spatial) {
  if (!spatial?.observation?.complete) return;
  const state = stateOf(session), scope = scopeOf(spatial);
  state.links = state.links.filter(link => {
    if (!inScope(link, scope)) return true;
    const pair = readPair(spatial, link.subjectId, link.anchorId);
    return pair && pair.subject.source === link.subject && pair.anchor.source === link.anchor;
  });
}

export function discardPlacementLinks(session, instance) {
  const state = stateOf(session);
  state.links = state.links.filter(link => link.instance !== instance);
}

// Only the worker's own recovery metadata carries this portable snapshot.
export function placementProfileSnapshot(session) {
  const { settings, corrections, links } = stateOf(session);
  return structuredClone({ settings, corrections, links, instances:session.nativeInstanceIds ?? {}, identity:nativeIdentitySnapshot(session) });
}

export function restorePlacementProfile(session, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.settings) || !Array.isArray(snapshot.corrections)) return;
  const { settings, corrections, links, instances, identity } = structuredClone(snapshot);
  const text = value => typeof value === 'string' && value.length > 0;
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  const validScope = row => row && ['instance',...scopeFields].every(key => text(row[key])) && policyOf(row.relation,row.metric);
  const validEvent = row => validScope(row) && text(row.id) && nonnegative(row.clearance);
  const validLink = row => validScope(row) && ['subjectId','anchorId','subject','anchor'].every(key => text(row[key])) &&
    nonnegative(row.before) && ['subjectBox','anchorBox'].every(key => Array.isArray(row[key]) && row[key].length === 4 && row[key].every(Number.isFinite));
  stores.set(session, {
    settings:settings.slice(-limit).filter(row => validEvent(row) && nonnegative(row.weight)),
    corrections:corrections.slice(-limit).filter(row => validEvent(row) && nonnegative(row.before) &&
      ['subject','anchor','beforeRevision','afterRevision'].every(key => text(row[key]))),
    links:Array.isArray(links) ? links.slice(-limit).filter(validLink) : [],
  });
  const ids = Object.fromEntries(Object.entries(instances ?? {}).filter(([,value]) => text(value)));
  session.nativeInstanceIds = { ...ids, ...session.nativeInstanceIds };
  restoreNativeIdentitySnapshot(session,identity);
}
