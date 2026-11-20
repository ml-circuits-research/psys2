// SPDX-License-Identifier: AGPL-3.0-only
// A tab defined by its area.sop: which catalog modules form its instance and knowledge, which rule files
// compile its commands and project its drawing, the things it starts with and the open choices of its native
// interface. This module only reads that declaration; it holds no knowledge of any tab.
import {World, str} from '../src/vendor/sopworld/sopworld.mjs';
import {catalogWorld} from './catalog-world.mjs';
import {readNativeToolInterface} from './native-tool-interface.mjs';
import {toolInvocationContext} from './native-tool-host.mjs';
import {createSopWorldHost, initialSopWorldState, worldOf} from './sop-world-host.mjs';
import {renderPrimitives} from './sop-primitives.mjs';

const read = (fact, key) => { const raw = fact?.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };
const all = (fact, key) => (fact?.attrs[key] ?? []).map((raw) => raw.startsWith('"') ? str(raw) : raw);
const cache = new Map(), resolved = new Map();

function declaration(text) {
  const world = new World();
  if (!world.load(text).ok) throw Error('invalid-area-declaration');
  const [area] = world.ofType('app.area');
  if (!area) throw Error('missing-area');
  const owned = (type) => world.ofType(type).filter((fact) => fact.attrs.area?.[0] === '$' + area.id);
  return { area, owned, declarations: world };
}

/** The shared base World of an area: catalog modules, the area's rule files and its own declaration. */
export async function areaBase({ world, loader, readCatalog }) {
  if (cache.has(world)) return cache.get(world);
  const promise = (async () => {
    const text = await loader.readFile(world, 'area.sop');
    if (!text) throw Error('area-declaration-unavailable');
    const { area, owned, declarations } = declaration(text);
    const instance = read(area, 'instance'), knowledge = all(area, 'knowledge');
    const lookups = owned('app.area.lookup'), lookupWorlds = [...new Set(lookups.map((lookup) => read(lookup, 'world')))];
    const base = await catalogWorld(readCatalog, { modules: [instance, ...knowledge, ...lookupWorlds], use: ['std.acts', instance, ...knowledge, ...lookupWorlds],
      shardsOf: (entry) => knowledge.includes(entry?.id) ? (entry.shards ?? []).map((shard) => typeof shard === 'string' ? shard : shard.path) : [] });
    const actSchema = await loader.readFile('app.project', 'act-schema.sop');
    if (!base.load(actSchema).ok) throw Error('act-schema-refused');
    for (const rules of owned('app.area.rules').sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n')))) {
      const source = await loader.readFile(world, read(rules, 'file'));
      if (!source || !base.load(source).ok) throw Error('area-rules-refused:' + read(rules, 'file'));
    }
    const kinds = base.ofType('std.schema.kind').map((kind) => read(kind, 'of')).filter((kind) => kind.startsWith(instance + '.'));
    return { base, area, owned, declarations, kinds, instance, lookups, loadedShards: new Set(), readCatalog };
  })();
  cache.set(world, promise);
  try { const value = await promise; resolved.set(world, value); return value; } catch (error) { cache.delete(world); throw error; }
}

/**
 * Whether a shard holds a fact of an indexed type whose indexed field has one of the values: the index keys are
 * coarse (one key list per shard), the indexed fields say which facts define a name.
 */
export function definesAny(text, indexedFields, values) {
  if (!indexedFields) return true;
  for (const line of text.split('\n')) {
    const [, type, rest] = line.match(/^@\S+ (\S+) (.*)$/) ?? [];
    for (const field of indexedFields[type] ?? []) for (const [, raw] of rest.matchAll(new RegExp('(?:^| )' + field + '=("[^"]*"|\\S+)', 'g')))
      if (values.has(raw.replace(/^"|"$/g, ''))) return true;
  }
  return false;
}

/**
 * Knowledge by lookup: for each declared app.area.lookup, the values of an instance key, of named command
 * arguments, its fixed values and the area's declared choices select the catalog shards whose index keys contain them; each shard is told once into the base.
 */
async function ensureLookups(declared, state, args = {}) {
  if (!declared.lookups.length) return;
  declared.index ??= JSON.parse(await declared.readCatalog('index.json'));
  const entries = new Map([...(declared.index.worlds ?? []), ...(declared.index.schemas ?? [])].map((entry) => [entry.id, entry]));
  const live = state?.sop ? worldOf(declared.base, state) : null;
  for (const lookup of declared.lookups) {
    const values = new Set();
    const [from, key] = [read(lookup, 'from'), read(lookup, 'key')];
    if (live && from && key) for (const fact of live.ofType(from)) for (const raw of fact.attrs[key] ?? []) values.add(raw.startsWith('"') ? str(raw) : raw);
    for (const name of all(lookup, 'arg')) for (const value of [].concat(args[name] ?? [])) if (typeof value === 'string') values.add(value);
    // Fixed values the area always looks up (value=...: the layout its page follows).
    for (const value of all(lookup, 'value')) values.add(value);
    // What the area offers by name (its declared choices) is drawable before any command names it.
    for (const offered of Object.values(choices(declared))) for (const value of [].concat(offered)) if (typeof value === 'string') values.add(value);
    const entry = entries.get(read(lookup, 'world'));
    for (const shard of entry?.shards ?? []) {
      const path = typeof shard === 'string' ? shard : shard.path, keys = typeof shard === 'string' ? [] : shard.keys ?? [];
      if (declared.loadedShards.has(path) || !keys.some((k) => values.has(k))) continue;
      declared.shardTexts ??= new Map();
      if (!declared.shardTexts.has(path)) declared.shardTexts.set(path, await declared.readCatalog(path));
      const text = declared.shardTexts.get(path);
      if (!definesAny(text, entry.indexedFields, values)) continue;
      declared.loadedShards.add(path);
      const told = declared.base.tell(text, { factsOnly: true });
      if (!told.ok) throw Error('lookup-shard-refused:' + path);
    }
  }
}

/** The interface's open choices, each read from the facts its declaration names. */
function choices({ base, owned }) {
  const values = {};
  for (const choice of owned('app.area.choice')) {
    const type = read(choice, 'type'), key = read(choice, 'key'), filters = Object.keys(choice.attrs).filter((k) => !['area', 'input', 'type', 'key'].includes(k));
    values[read(choice, 'input')] = [...new Set(base.ofType(type).filter((fact) => filters.every((k) => read(fact, k) === read(choice, k)))
      .map((fact) => read(fact, key)).filter((value) => value !== undefined))];
  }
  for (const constant of owned('app.area.constant')) values[read(constant, 'input')] = Number(read(constant, 'value'));
  return values;
}

export async function createSopArea({ world, loader, readCatalog, state, instanceId, identityRegistry, interfaceSource, args }) {
  const declared = await areaBase({ world, loader, readCatalog });
  await ensureLookups(declared, state, args);
  const toolInterface = readNativeToolInterface(interfaceSource).realize(choices(declared));
  const host = createSopWorldHost({ base: declared.base, kinds: declared.kinds, state, instanceId, scope: read(declared.area, 'scope'), toolInterface, identityRegistry, spatialObservation: read(declared.area, 'spatial') === 'true' });
  return host;
}

/** A first state: the declared things, then the declared start commands, through the same host. */
export async function initialSopAreaState(options) {
  const declared = await areaBase(options);
  const make = declared.owned('app.area.make').map((fact) => Object.fromEntries(Object.keys(fact.attrs).filter((k) => k !== 'area').map((k) => [k, read(fact, k)])));
  const state = initialSopWorldState(declared.base, { kinds: declared.kinds, make });
  const host = await createSopArea({ ...options, state, instanceId: 'initial.' + options.world });
  for (const command of declared.owned('app.area.command')) host.invoke(read(command, 'sop'), toolInvocationContext(globalThis.crypto.randomUUID(), host.observe().version));
  return state;
}

/** What the tab shows: the area's declared primitive facts, drawn as they are. */
export async function renderSopArea(options, state, opts) {
  const declared = await areaBase(options), { types, select, frame } = drawTypes(declared);
  return renderPrimitives(worldOf(declared.base, state), types, frame, { ...opts, select });
}

/** The area's base once loaded (synchronous readers: a state projection for the view). */
export const peekAreaBase = (world) => resolved.get(world);

function drawTypes(declared) {
  const [draw] = declared.owned('app.area.draw');
  return { types: Object.fromEntries(['draw', 'fill', 'point', 'orient'].map((k) => [k, read(draw, k)])), select: read(draw, 'select'),
    frame: { w: Number(read(declared.area, 'frame.w')), h: Number(read(declared.area, 'frame.h')) } };
}

/**
 * What a view shows of a state: the drawn SVG, the observed objects, the declared options per object and the
 * view keys. Synchronous; before the base is loaded it says so.
 */
export function projectSopArea(world, state, opts = {}) {
  const declared = resolved.get(world);
  if (!declared) return { sop: state?.sop ?? '', runtime: state?.runtime ?? { view: {} }, pending: true };
  state = { sop: state?.sop ?? '', runtime: state?.runtime ?? { view: {} } };
  const live = worldOf(declared.base, state), { types, select, frame } = drawTypes(declared);
  const objects = live.ofType('app.observe.object').map((fact) => Object.fromEntries(Object.keys(fact.attrs).map((k) => [k, read(fact, k)])));
  const options = {};
  for (const fact of live.ofType('app.observe.option')) (options[read(fact, 'id')] ??= []).push(read(fact, 'value'));
  const view = state.runtime?.view ?? {}, selected = view.selected ?? null, present = objects.some((object) => object.id === selected);
  const controls = declared.owned('app.area.control').sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n'))).map((control) => {
    const key = read(control, 'options'), when = read(control, 'when');
    return { label: read(control, 'label'), operation: read(control, 'operation'), param: read(control, 'param') ?? null,
      options: key === undefined ? [] : key === 'selected' ? options[selected] ?? [] : options[key] ?? [],
      target: read(control, 'target') ?? null, list: read(control, 'list') ?? null,
      fields: declared.declarations.ofType('app.area.field').filter((field) => field.attrs.control?.[0] === '$' + control.id)
        .sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n')))
        .map((field) => ({ param: read(field, 'param'), label: read(field, 'label'), input: read(field, 'input'), scale: Number(read(field, 'scale') ?? 1) })),
      available: read(control, 'target') !== 'selected' || (selected !== null && !all(control, 'except').includes(selected) && (when === undefined || (when === 'present') === present)) };
  });
  // The state itself travels with what is derived from it, so a projection canonicalizes back to its state.
  return { sop: state.sop, runtime: state.runtime ?? { view: {} }, svg: renderPrimitives(live, types, frame, { ...opts, select }), objects, options, controls, selected };
}
