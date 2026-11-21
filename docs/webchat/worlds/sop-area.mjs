// SPDX-License-Identifier: AGPL-3.0-only
// A tab defined by its area.sop: which catalog modules form its instance and knowledge, which rule files
// compile its commands and project its drawing, the things it starts with and the open choices of its native
// interface. This module only reads that declaration; it holds no knowledge of any tab.
import {World, parse, quote, serialize, str, nearestRelative} from '../lib/vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import {budget} from '../lib/dialog/budget.mjs?v=d42dc656e7';
import {catalogWorld} from './catalog-world.mjs?v=4f1c9b590e';
import {readNativeToolInterface} from './native-tool-interface.mjs?v=59ae4399a8';
import {toolInvocationContext} from './native-tool-host.mjs?v=c6ea65e776';
import {createSopWorldHost, forgetDerived, initialSopWorldState, orderedInputs, worldOf} from './sop-world-host.mjs?v=1c1c1bd8e4';
import {renderPrimitives} from './sop-primitives.mjs?v=2fc551236d';

const read = (fact, key) => { const raw = fact?.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };
const all = (fact, key) => (fact?.attrs[key] ?? []).map((raw) => raw.startsWith('"') ? str(raw) : raw);
const cache = new Map(), resolved = new Map();
// A declared value with its type: quoted text stays text; true, false and numbers are themselves.
const typedValue = (raw) => raw.startsWith('"') ? str(raw) : raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;

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
    // An area may hold several instance modules (instance= repeated: a drawing and the faces of the people on it);
    // the first is its main one.
    const instances = all(area, 'instance'), instance = instances[0], knowledge = all(area, 'knowledge');
    // app.area.subset: for a knowledge module, only its shards named with one of the prefixes (and its shards named with
    // no dash: slots, colours, presets), as an offline subset is chosen; every shard otherwise.
    // strict=true: only the shards named with a prefix.
    const subsets = new Map(owned('app.area.subset').map((fact) => [read(fact, 'world'), { prefixes: all(fact, 'prefix'), strict: read(fact, 'strict') === 'true' }]));
    const inSubset = (id, path) => { const subset = subsets.get(id), name = path.split('/').pop().replace(/\.sop$/, ''); return !subset || subset.prefixes.some((prefix) => name.startsWith(prefix)) || (!subset.strict && !name.includes('-')); };
    const lookups = owned('app.area.lookup'), lookupWorlds = [...new Set(lookups.map((lookup) => read(lookup, 'world')))];
    // An area whose rules derive deeply declares its derivation depth (depth=); otherwise the library's default.
    const depth = Number(read(area, 'depth')), options = Number.isSafeInteger(depth) && depth > 0 ? { maxDepth: depth } : {};
    // An area whose pages hold many derived facts declares its rule-firing budget per derivation (steps=).
    const steps = Number(read(area, 'steps'));
    if (Number.isSafeInteger(steps) && steps > 0) options.maxSteps = steps;
    const base = await catalogWorld(readCatalog, { modules: [...instances, ...knowledge, ...lookupWorlds], use: ['std.acts', ...instances, ...knowledge, ...lookupWorlds], options,
      shardsOf: (entry) => knowledge.includes(entry?.id) ? (entry.shards ?? []).map((shard) => typeof shard === 'string' ? shard : shard.path).filter((path) => inSubset(entry.id, path)) : [] });
    const actSchema = await loader.readFile('app.project', 'act-schema.sop');
    if (!base.load(actSchema).ok) throw Error('act-schema-refused');
    // calls=instance: the compiled calls run in a world of the instance schema (and knowledge schemas) without the
    // area's rules, so an act does not re-derive the area's projection (an area whose rules derive deeply asks for it).
    const callBase = read(area, 'calls') === 'instance' ? base.fork() : null;
    // The rule files in their declared order, loaded as one source: the world compiles its rules once, not once per
    // file. A refusal names the files (the area is not built).
    // world=: a rule file another area owns and shares (the face rules of the Avatar tab, read by the Drawing tab).
    const ruleFiles = owned('app.area.rules').sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n'))),
      ruleSources = await Promise.all(ruleFiles.map((rules) => loader.readFile(read(rules, 'world') ?? world, read(rules, 'file'))));
    ruleFiles.forEach((rules, n) => { if (!ruleSources[n]) throw Error('area-rules-refused:' + read(rules, 'file')); });
    if (ruleFiles.length && !base.load(ruleSources.join('\n')).ok) throw Error('area-rules-refused:' + ruleFiles.map((rules) => read(rules, 'file')).join(','));
    // The key namespaces the area's own rule files declare (core.namespace prefix=...): an area may keep kinds of its own
    // under them in its state (diagram.sketch's bends of a link), besides the instance modules' kinds.
    const owns = ruleFiles.flatMap((rules, n) => read(rules, 'world') ? [] : [...ruleSources[n].matchAll(/^@\S+ core\.namespace prefix=(\S+)/gm)].map((match) => match[1]));
    // The world the calls run in (calls=instance) holds the schema the area's own rule files add to its instance: the
    // slots it gives instance types and the kinds of its own namespaces (diagram.sketch's link sides and bends).
    if (callBase) {
      const ownsType = (type) => instances.some((id) => type.startsWith(id + '.')) || owns.some((prefix) => type.startsWith(prefix));
      const schema = ruleFiles.flatMap((rules, n) => read(rules, 'world') ? [] : parse(ruleSources[n])).filter((wire) => !wire.pattern && (wire.type === 'core.namespace'
        || (['core.slot', 'core.type', 'std.schema.kind', 'std.schema.limit'].includes(wire.type) && ownsType(String(wire.attrs.of?.[0] ?? '')))));
      if (schema.length && !callBase.load(serialize(schema)).ok) throw Error('area-call-schema-refused');
    }
    const kinds = base.ofType('std.schema.kind').map((kind) => read(kind, 'of')).filter((kind) => instances.some((id) => kind.startsWith(id + '.')) || owns.some((prefix) => kind.startsWith(prefix)));
    return { base, callBase, area, owned, declarations, kinds, instance, lookups, loadedShards: new Set(), readCatalog };
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

// The values of one field of the rows of a type in a shard's text (quoted values unquoted).
const fieldValues = (rest, field) => [...rest.matchAll(new RegExp('(?:^| )' + field.replace(/\./g, '\\.') + '=("[^"]*"|\\S+)', 'g'))].map((m) => m[1].replace(/^"|"$/g, ''));
const rowsOf = (text, type) => {
  const rows = [], marker = ' ' + type + ' ';
  for (const line of text.split('\n')) { const at = line.indexOf(marker); if (line.charCodeAt(0) === 64 && at > 0 && line.indexOf(' ') === at) rows.push(line.slice(at + marker.length)); }
  return rows;
};

/**
 * The closest drawable relative of a kind that has no drawing of its own (app.area.relative): the area declares the
 * taxonomy type (type=, its row key=, its parent field parent= and its dimension field dimension=), the type of
 * what can be drawn (drawable=), the types that already define a name (known=: nothing is derived for them) and the
 * fact it tells (tell=, with the kind under its key `name` and the relative under to=). The ranking is declared:
 * first a drawable parent along the near= dimension (the kind is one), the most specific first; else the drawable kind
 * sharing the most parents, each shared parent counting its dimension's weight (weight.<dimension>=, absent 0) times
 * its specificity, ln(names seen / names under that parent); ties by name. Nothing is told when nothing is found.
 */
async function ensureRelatives(declared, entries, args, read) {
  const relatives = declared.owned('app.area.relative');
  const extra = new Set();
  if (!relatives.length) return extra;
  declared.relatives ??= new Map();
  const shardsWith = (worldOf, value) => (entries.get(worldOf)?.shards ?? []).filter((shard) => typeof shard !== 'string' && (shard.keys ?? []).includes(value));
  const exportsOf = (type) => [...entries.values()].find((entry) => entry.exports?.includes(type))?.id;
  // The row of a type naming a value (its rest of line), else null.
  const defines = async (type, value) => {
    const owner = exportsOf(type);
    if (!owner) return null;
    for (const shard of shardsWith(owner, value)) { const row = rowsOf(await read(shard.path), type).find((rest) => fieldValues(rest, 'name')[0] === value); if (row) return row; }
    return null;
  };
  for (const relative of relatives) {
    const taxonomy = all(relative, 'world')[0], type = all(relative, 'type')[0], parentKey = all(relative, 'parent')[0] ?? 'is_a', dimKey = all(relative, 'dimension')[0] ?? 'dimension';
    const near = new Set(all(relative, 'near')), drawable = all(relative, 'drawable')[0], tell = all(relative, 'tell')[0], to = all(relative, 'to')[0] ?? 'drawing';
    const weights = Object.fromEntries(Object.keys(relative.attrs).filter((k) => k.startsWith('weight.')).map((k) => [k.slice(7), Number(all(relative, k)[0] ?? 0)])), qualifiers = all(relative, 'qualifier');
    if (!entries.has(taxonomy) || !type || !drawable || !tell) continue;
    for (const name of all(relative, 'arg')) for (const value of [].concat(args[name] ?? [])) {
      if (typeof value !== 'string' || !value) continue;
      const memo = relative.id + '|' + value;
      if (!declared.relatives.has(memo)) declared.relatives.set(memo, (async () => {
        // A name already defined is not derived; a stand-in of the told type brings its own drawing to look up.
        for (const known of all(relative, 'known')) { const row = await defines(known, value); if (row) return known === tell ? { drawing: fieldValues(row, to)[0], told: true } : null; }
        // The kind's own parents (a parent told apart by its qualifier fields: "animal with legs" of value 4 is not that
        // of value 2), then every row under one of them: the parents' members and how many names were seen. The ranking
        // is the library's (nearestRelative).
        const identity = (rest, parent) => [parent, ...qualifiers.flatMap((q) => fieldValues(rest, q))].join('\u0000');
        const own = new Map();
        for (const shard of shardsWith(taxonomy, value)) for (const rest of rowsOf(await read(shard.path), type))
          if (fieldValues(rest, 'name')[0] === value) for (const parent of fieldValues(rest, parentKey)) if (parent !== value) own.set(identity(rest, parent), { key: identity(rest, parent), parent, dimension: fieldValues(rest, dimKey)[0] });
        if (!own.size) return null;
        const members = new Map([...own.keys()].map((parent) => [parent, new Set()])), seen = new Set(), paths = new Set();
        for (const { parent } of own.values()) for (const shard of shardsWith(taxonomy, parent)) paths.add(shard.path);
        for (const path of paths) for (const rest of rowsOf(await read(path), type)) {
          const member = fieldValues(rest, 'name')[0];
          seen.add(member);
          for (const parent of fieldValues(rest, parentKey)) { const key = identity(rest, parent); if (members.has(key) && member !== value) members.get(key).add(member); }
        }
        const found = await nearestRelative({ own: [...own.values()], members, seen: seen.size, near: [...near], weights, accept: async (name) => !!(await defines(drawable, name)) });
        return found ? { drawing: found.name } : null;
      })());
      const result = await declared.relatives.get(memo);
      if (!result?.drawing) continue;
      const found = result.drawing;
      extra.add(found);
      if (result.told) continue;
      if (!declared.toldRelatives?.has(memo)) {
        // Its declared looks (look.<field>=<type>: the colour k.attributes.thing gives a flamingo), when the knowledge
        // gives the kind exactly one value of that field.
        const looks = [];
        for (const key of Object.keys(relative.attrs).filter((k) => k.startsWith('look.'))) {
          const field = key.slice(5), owner = exportsOf(all(relative, key)[0]), values = new Set();
          if (owner) for (const shard of shardsWith(owner, value)) for (const rest of rowsOf(await read(shard.path), all(relative, key)[0]))
            if (fieldValues(rest, 'name')[0] === value) for (const v of fieldValues(rest, field)) values.add(v);
          if (values.size === 1) looks.push(' ' + field + '=' + quote([...values][0]));
        }
        const told = '@relative.' + declared.relatives.size + '.' + value.replace(/[^A-Za-z0-9_]/g, '_') + ' ' + tell + ' name=' + quote(value) + ' ' + to + '=' + quote(found) + looks.join('') + ' core.source="relative ' + type + '"';
        (declared.toldRelatives ??= new Set()).add(memo);
        if (!declared.base.tell(told, { factsOnly: true }).ok) throw Error('relative-refused:' + value);
        forgetDerived(declared.base);
      }
    }
  }
  return extra;
}

/**
 * Knowledge by lookup: for each declared app.area.lookup, the values of an instance key, of named command
 * arguments, its fixed values and the area's declared choices select the catalog shards whose index keys contain them; each shard is told once into the base.
 */
async function ensureLookups(declared, state, args = {}) {
  if (!declared.lookups.length) return;
  declared.index ??= JSON.parse(await declared.readCatalog('index.json'));
  const entries = new Map([...(declared.index.worlds ?? []), ...(declared.index.schemas ?? [])].map((entry) => [entry.id, entry]));
  declared.shardTexts ??= new Map();
  const readShard = async (path) => { if (!declared.shardTexts.has(path)) declared.shardTexts.set(path, await declared.readCatalog(path).catch(() => '')); return declared.shardTexts.get(path) ?? ''; };
  // A kind with no drawing of its own is drawn as its closest drawable relative (app.area.relative); that relative's
  // knowledge is looked up with the kind's.
  const relatives = await ensureRelatives(declared, entries, args, readShard);
  if (relatives.size) { args = { ...args }; for (const name of new Set(declared.owned('app.area.relative').flatMap((r) => all(r, 'arg')))) args[name] = [...[].concat(args[name] ?? []), ...relatives]; }
  const live = state?.sop ? worldOf(declared.base, state) : null;
  // The values each lookup selects by: an instance key, named command arguments, fixed values and the declared choices.
  const valuesOf = (lookup) => {
    const values = new Set();
    const [from, key] = [read(lookup, 'from'), read(lookup, 'key')];
    if (live && from && key) for (const fact of live.ofType(from)) for (const raw of fact.attrs[key] ?? []) values.add(raw.startsWith('"') ? str(raw) : raw);
    for (const name of all(lookup, 'arg')) for (const value of [].concat(args[name] ?? [])) if (typeof value === 'string') values.add(value);
    // Fixed values the area always looks up (value=...: the layout its page follows).
    for (const value of all(lookup, 'value')) values.add(value);
    // What the area offers by name (its declared choices) is drawable before any command names it.
    for (const offered of Object.values(choices(declared))) for (const value of [].concat(offered)) if (typeof value === 'string') values.add(value);
    return values;
  };
  const candidates = (lookup, values) => (entries.get(read(lookup, 'world'))?.shards ?? []).filter((shard) => typeof shard !== 'string' && (shard.keys ?? []).some((k) => values.has(k)))
    .map((shard) => shard.path).filter((path) => !declared.loadedShards.has(path));
  // Every lookup's candidate shards are read at once (one round trip for all of them), then told lookup by lookup.
  declared.shardTexts ??= new Map();
  const wanted = [...new Set(declared.lookups.flatMap((lookup) => candidates(lookup, valuesOf(lookup))))].filter((path) => !declared.shardTexts.has(path));
  (await Promise.all(wanted.map((path) => declared.readCatalog(path)))).forEach((text, n) => declared.shardTexts.set(wanted[n], text));
  for (const lookup of declared.lookups) {
    const values = valuesOf(lookup);
    const entry = entries.get(read(lookup, 'world'));
    // The candidate shards (index keys naming a looked-up value), told in index order; one a told shard made a candidate is read now.
    const paths = candidates(lookup, values);
    const missing = paths.filter((path) => !declared.shardTexts.has(path)), texts = await Promise.all(missing.map((path) => declared.readCatalog(path)));
    missing.forEach((path, n) => declared.shardTexts.set(path, texts[n]));
    for (const path of paths) {
      if (declared.loadedShards.has(path)) continue;
      const text = declared.shardTexts.get(path);
      if (!definesAny(text, entry.indexedFields, values)) continue;
      declared.loadedShards.add(path);
      const told = declared.base.tell(text, { factsOnly: true });
      if (!told.ok) throw Error('lookup-shard-refused:' + path);
      forgetDerived(declared.base);
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

export async function createSopArea({ world, loader, readCatalog, state, instanceId, identityRegistry, interfaceSource, interfaceImports = {}, args }) {
  const declared = await areaBase({ world, loader, readCatalog });
  // The base is shared per world; a catalog reader that arrives after it was built (the application's catalog after
  // the offline subset) serves later lookups, with its own index.
  if (readCatalog && declared.readCatalog !== readCatalog) { declared.readCatalog = readCatalog; declared.index = undefined; declared.shardTexts = undefined; }
  await ensureLookups(declared, state, args);
  // interfaceImports: the native interfaces this one composes (app.native.compose module=...), by module.
  const toolInterface = readNativeToolInterface(interfaceSource, { imports: interfaceImports }).realize(choices(declared));
  const host = createSopWorldHost({ base: declared.base, callBase: declared.callBase, kinds: declared.kinds, state, instanceId, scope: read(declared.area, 'scope'), toolInterface, identityRegistry, spatialObservation: read(declared.area, 'spatial') === 'true' });
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
  const declared = await areaBase(options), { types, select, frame } = drawTypes(declared), live = worldOf(declared.base, state);
  return renderPrimitives(live, types, frameOf(live, frame), { ...opts, select });
}

/** The page the projection derives (app.observe.frame from the origin) when it declares one, else the declared frame. */
function frameOf(live, frame) {
  const [derived] = live.ofType('app.observe.frame'), w = Number(read(derived, 'x1')), h = Number(read(derived, 'y1'));
  return derived && Number(read(derived, 'x0')) === 0 && Number(read(derived, 'y0')) === 0 && w > 0 && h > 0 ? { w, h } : frame;
}

/** The area's base once loaded (synchronous readers: a state projection for the view). */
export const peekAreaBase = (world) => resolved.get(world);

/**
 * For each observed object (app.observe.object id), the state facts its observation was derived from, read from the
 * derivation's own record (each derived fact's supporting facts). Null before the base is loaded.
 */
export function observationSupport(world, state) {
  const declared = resolved.get(world);
  if (!declared) return null;
  state = { sop: state?.sop ?? '', runtime: state?.runtime ?? { view: {} } };
  const live = worldOf(declared.base, state), told = new Set(parse(state.sop).map((fact) => fact.id)), support = {};
  for (const fact of live.ofType('app.observe.object')) {
    const found = new Set(), seen = new Set(), pending = [fact.id];
    while (pending.length) {
      budget.tick('sop-area.observationSupport');
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (told.has(id)) found.add(id); else for (const from of live.wires.get(id)?.meta?.from ?? []) pending.push(from);
    }
    const list = (support[read(fact, 'id')] ??= []);
    for (const id of found) if (!list.includes(id)) list.push(id);
  }
  return support;
}

function drawTypes(declared) {
  const [draw] = declared.owned('app.area.draw');
  return { types: Object.fromEntries(['draw', 'fill', 'point', 'orient', 'layer', 'pose', 'style', 'filter'].map((k) => [k, read(draw, k)]).filter(([, v]) => v !== undefined)), select: read(draw, 'select'),
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
    return { label: read(control, 'label'), operation: read(control, 'operation'), param: read(control, 'param') ?? null, many: read(control, 'many') === 'true',
      options: key === undefined ? [] : key === 'selected' ? options[selected] ?? [] : options[key] ?? [],
      target: read(control, 'target') ?? null, list: read(control, 'list') ?? null,
      fields: declared.declarations.ofType('app.area.field').filter((field) => field.attrs.control?.[0] === '$' + control.id)
        .sort((a, b) => Number(read(a, 'n')) - Number(read(b, 'n')))
        .map((field) => ({ param: read(field, 'param'), label: read(field, 'label'), input: read(field, 'input'), scale: Number(read(field, 'scale') ?? 1) })),
      // Arguments a control always sends (app.area.arg): a fixed value, the first or every observed option of a key,
      // a key of the view's state (read as a number when kind=number), or an empty list; `key` places the value under
      // that key of an object argument.
      args: declared.declarations.ofType('app.area.arg').filter((arg) => arg.attrs.control?.[0] === '$' + control.id)
        .map((arg) => Object.fromEntries(['param', 'key', 'value', 'option', 'options', 'view', 'list', 'kind'].filter((k) => arg.attrs[k]).map((k) => [k, k === 'value' ? typedValue(arg.attrs.value[0]) : read(arg, k)]))),
      available: read(control, 'target') !== 'selected' || (selected !== null && !all(control, 'except').includes(selected) && (when === undefined || (when === 'present') === present)) };
  });
  // What a tab's editor shows of each observed object: its observed inputs (app.observe.input: key -> value, a list
  // when the key repeats, as the label, colour or members of a group) and the box it occupies on the page
  // (app.observe.box, in frame units). Numbers stay numbers.
  const inputs = {}, boxes = {};
  for (const fact of orderedInputs(live.ofType('app.observe.input'))) {
    const id = read(fact, 'id'), key = read(fact, 'key'), raw = fact.attrs.value?.[0];
    if (id === undefined || key === undefined || raw === undefined) continue;
    const value = typedValue(raw), entry = (inputs[id] ??= {});
    entry[key] = Object.hasOwn(entry, key) ? [].concat(entry[key], value) : value;
  }
  for (const fact of live.ofType('app.observe.box')) boxes[read(fact, 'id')] = Object.fromEntries(['x0', 'y0', 'x1', 'y1'].map((k) => [k, Number(read(fact, k))]));
  const page = frameOf(live, frame);
  // The state itself travels with what is derived from it, so a projection canonicalizes back to its state.
  return { sop: state.sop, runtime: state.runtime ?? { view: {} }, svg: renderPrimitives(live, types, page, { ...opts, select }), frame: page, objects, inputs, boxes, options, controls, selected };
}
