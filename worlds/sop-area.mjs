// SPDX-License-Identifier: AGPL-3.0-only
// A tab defined by its area.sop: which catalog modules form its instance and knowledge, which rule files
// compile its commands and project its drawing, the things it starts with and the open choices of its native
// interface. This module only reads that declaration; it holds no knowledge of any tab.
import {World, str} from '../src/vendor/sopworld/sopworld.mjs';
import {catalogWorld} from './catalog-world.mjs';
import {readNativeToolInterface} from './native-tool-interface.mjs';
import {toolInvocationContext} from './native-tool-host.mjs';
import {createSopWorldHost, initialSopWorldState, worldOf} from './sop-world-host.mjs';
import {renderPrimitives} from '../docs/webchat/ui/sop-primitives.mjs';

const read = (fact, key) => { const raw = fact?.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };
const all = (fact, key) => (fact?.attrs[key] ?? []).map((raw) => raw.startsWith('"') ? str(raw) : raw);
const cache = new Map();

function declaration(text) {
  const world = new World();
  if (!world.load(text).ok) throw Error('invalid-area-declaration');
  const [area] = world.ofType('app.area');
  if (!area) throw Error('missing-area');
  const owned = (type) => world.ofType(type).filter((fact) => fact.attrs.area?.[0] === '$' + area.id);
  return { area, owned };
}

/** The shared base World of an area: catalog modules, the area's rule files and its own declaration. */
export async function areaBase({ world, loader, readCatalog }) {
  if (cache.has(world)) return cache.get(world);
  const promise = (async () => {
    const text = await loader.readFile(world, 'area.sop');
    if (!text) throw Error('area-declaration-unavailable');
    const { area, owned } = declaration(text);
    const instance = read(area, 'instance'), knowledge = all(area, 'knowledge');
    const base = await catalogWorld(readCatalog, { modules: [instance, ...knowledge], use: ['std.acts', instance, ...knowledge],
      shardsOf: (entry) => knowledge.includes(entry?.id) ? (entry.shards ?? []).map((shard) => typeof shard === 'string' ? shard : shard.path) : [] });
    const actSchema = await loader.readFile('app.project', 'act-schema.sop');
    if (!base.load(actSchema).ok) throw Error('act-schema-refused');
    for (const rules of owned('app.area.rules').sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n')))) {
      const source = await loader.readFile(world, read(rules, 'file'));
      if (!source || !base.load(source).ok) throw Error('area-rules-refused:' + read(rules, 'file'));
    }
    const kinds = base.ofType('std.schema.kind').map((kind) => read(kind, 'of')).filter((kind) => kind.startsWith(instance + '.'));
    return { base, area, owned, kinds, instance };
  })();
  cache.set(world, promise);
  try { return await promise; } catch (error) { cache.delete(world); throw error; }
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

export async function createSopArea({ world, loader, readCatalog, state, instanceId, identityRegistry, interfaceSource }) {
  const declared = await areaBase({ world, loader, readCatalog });
  const toolInterface = readNativeToolInterface(interfaceSource).realize(choices(declared));
  const host = createSopWorldHost({ base: declared.base, kinds: declared.kinds, state, instanceId, scope: read(declared.area, 'scope'), toolInterface, identityRegistry });
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
  const declared = await areaBase(options), [draw] = declared.owned('app.area.draw');
  const types = Object.fromEntries(['draw', 'fill', 'point', 'orient'].map((k) => [k, read(draw, k)]));
  return renderPrimitives(worldOf(declared.base, state), types, { w: Number(read(declared.area, 'frame.w')), h: Number(read(declared.area, 'frame.h')) }, opts);
}
