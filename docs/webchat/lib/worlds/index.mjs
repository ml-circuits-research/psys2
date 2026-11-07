/**
 * World model (spec 02). Builds worlds from a loader; browser-safe.
 *
 * Loader contract (see src/loaders):
 *   listWorlds()            -> Promise<string[]>        world ids (namespaces)
 *   readFile(id, name)      -> Promise<string | null>   file text, null when absent
 *   loadOps(id)             -> Promise<object | null>   module namespace of ops.mjs
 */
import { parse, get, getAll } from '../soplang/index.mjs';
import { Legends } from '../legends/index.mjs';

const FILES = ['world.sop', 'legend.sop', 'lexicon.sop', 'patterns.sop', 'operations.sop', 'kb.sop', 'templates.sop', 'tests.sop'];
const worldIdOf = (s) => (s.startsWith('world.') ? s.slice(6) : s);
const txt = (w, k) => get(w, k)?.v;

/** One loaded world. */
export class World {
  constructor(id) {
    this.id = id;
    this.errors = [];
    this.manifest = null;
    this.imports = [];
    this.legendWires = [];
    this.lexicons = [];
    this.patterns = [];
    this.operations = [];
    this.kbRaw = [];
    this.kb = [];        // kb wires with full keys (filled once legends are built)
    this.templates = [];
    this.tests = [];
    this.ops = {};
    this.wires = [];     // every wire of every file, for validation lookups
  }
  get title() { return txt(this.manifest ?? { entries: [] }, 'title') ?? this.id; }
  get status() { return txt(this.manifest ?? { entries: [] }, 'status'); }
  get version() { return txt(this.manifest ?? { entries: [] }, 'version'); }
  /** Short phrase of what the world lets the assistant do ("do sums"); undefined when not declared, '' to stay out of the capabilities answer. */
  get summaryPhrase() { return txt(this.manifest ?? { entries: [] }, 'summary'); }
  get doc() { return txt(this.manifest ?? { entries: [] }, 'doc'); }
  get language() { return txt(this.manifest ?? { entries: [] }, 'language') ?? 'en'; }
  /** Plain summary for listings. */
  summary() {
    return { id: this.id, title: this.title, summary: this.summaryPhrase, status: this.status, version: this.version, doc: this.doc,
      language: this.language, imports: this.imports, formalization: txt(this.manifest ?? { entries: [] }, 'formalization') ?? 'rules' };
  }
}

/** The set of loaded worlds plus the shared legend registry. */
export class WorldSet {
  constructor() {
    this.worlds = new Map();
    this.legends = new Legends();
    this.errors = [];
    this._cache = new Map();
  }
  get(id) { return this.worlds.get(id); }
  /** Worlds in dependency order (imports first). */
  list() { return [...this.worlds.values()]; }
  /** Transitive imports of a world (including itself), in dependency order. */
  available(id) {
    const out = [];
    const visit = (i) => {
      if (out.includes(i)) return;
      const w = this.worlds.get(i);
      if (!w) return;
      for (const d of w.imports) visit(d);
      out.push(i);
    };
    visit(id);
    return out;
  }
  /** Operations (all worlds) whose outputs include the full key. */
  operationsFor(fullKey) {
    return this.list().flatMap((w) => w.operations.filter((o) => o.outputs.includes(fullKey)));
  }
  /** Memoize derived indexes (lexicon index, template index ...). */
  memo(name, build) {
    if (!this._cache.has(name)) this._cache.set(name, build());
    return this._cache.get(name);
  }
  /** Every problem found at load time (parse errors, legend errors, kb normalization). */
  allErrors() {
    return [...this.errors, ...this.list().flatMap((w) => w.errors.map((e) => ({ worldId: w.id, ...e }))),
      ...this.legends.problems().map((e) => ({ ...e, phase: 'legend' }))];
  }
}

function readEntries(world, file, text) {
  if (text == null) return [];
  const { wires, errors } = parse(text, { source: `${world.id}/${file}` });
  for (const e of errors) world.errors.push({ file, ...e });
  world.wires.push(...wires);
  return wires;
}

function buildWorld(id, files, ops) {
  const w = new World(id);
  w.ops = ops ?? {};
  const wires = Object.fromEntries(FILES.map((f) => [f, readEntries(w, f, files[f])]));
  w.manifest = wires['world.sop'].find((x) => x.type === 'core.world') ?? null;
  if (!w.manifest) w.errors.push({ message: 'world.sop has no core.world wire' });
  else {
    const ns = txt(w.manifest, 'namespace');
    if (ns !== id) w.errors.push({ message: `manifest namespace '${ns}' differs from directory '${id}'` });
    w.imports = getAll(w.manifest, 'imports').map((v) => worldIdOf(v.v));
  }
  w.legendWires = wires['legend.sop'];
  w.lexicons = wires['lexicon.sop'].filter((x) => x.type === 'core.lexicon').map((x) => ({
    id: x.id, wire: x, worldId: id, class: txt(x, 'class'), words: getAll(x, 'word').map((v) => v.v),
    plurals: getAll(x, 'plural').map((v) => v.v), gender: txt(x, 'gender'),
  }));
  w.patterns = wires['patterns.sop'].filter((x) => x.type === 'core.pattern').map((x) => ({
    id: x.id, wire: x, worldId: id, match: txt(x, 'match'), emit: txt(x, 'emit'),
    kind: txt(x, 'kind') ?? 'statement', priority: Number(txt(x, 'priority') ?? 0),
    examples: getAll(x, 'example').map((v) => v.v),
  }));
  w.operations = wires['operations.sop'].filter((x) => x.type === 'core.operation').map((x) => ({
    id: x.id, wire: x, worldId: id, impl: txt(x, 'impl'), semantics: txt(x, 'semantics') ?? 'query',
    action: txt(x, 'action'), outputs: getAll(x, 'outputs').map((v) => v.v), inputs: getAll(x, 'inputs').map((v) => v.v),
    doc: txt(x, 'doc'),
  }));
  w.kbRaw = wires['kb.sop'];
  w.templates = wires['templates.sop'].filter((x) => x.type === 'core.template').map((x) => ({
    id: x.id, wire: x, worldId: id, for: txt(x, 'for'), status: txt(x, 'status') ?? 'supported',
    mode: txt(x, 'mode') ?? 'value', text: txt(x, 'text'), when: getAll(x, 'when').map((v) => v.v),
  }));
  w.tests = wires['tests.sop'].filter((x) => x.type === 'core.test').map((x) => ({
    id: x.id, wire: x, worldId: id, input: txt(x, 'input'), expect: getAll(x, 'expect').map((v) => v.v),
    expectStatus: txt(x, 'expectStatus'),
    expectState: getAll(x, 'expectState').map((v) => v.v), expectEffect: getAll(x, 'expectEffect').map((v) => v.v), language: txt(x, 'language') ?? 'en', session: txt(x, 'session'),
  }));
  return w;
}

/** Load every world the loader lists. Never throws on world content errors; see `allErrors()`. */
export async function loadWorlds(loader) {
  const set = new WorldSet();
  const ids = await loader.listWorlds();
  const built = new Map();
  for (const id of ids) {
    const files = {};
    await Promise.all(FILES.map(async (f) => { files[f] = await loader.readFile(id, f); }));
    let ops = null;
    try { ops = await loader.loadOps(id); } catch (e) { ops = null; built.set(id + ':opsError', e); }
    const w = buildWorld(id, files, ops);
    if (built.has(id + ':opsError')) w.errors.push({ message: `ops.mjs failed to load: ${built.get(id + ':opsError').message}` });
    built.set(id, w);
  }
  // dependency order
  const order = [];
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { set.errors.push({ message: `import cycle: ${[...stack, id].join(' -> ')}` }); return; }
    state.set(id, 1);
    const w = built.get(id);
    for (const d of w.imports) {
      if (!built.has(d)) w.errors.push({ message: `imports unknown world '${d}'` });
      else visit(d, [...stack, id]);
    }
    state.set(id, 2);
    order.push(id);
  };
  for (const id of ids) if (built.get(id) instanceof World) visit(id, []);
  for (const id of order) {
    const w = built.get(id);
    set.worlds.set(id, w);
    set.legends.add(w.legendWires, { worldId: id });
  }
  for (const w of set.list()) {
    w.kb = [];
    for (const raw of w.kbRaw) {
      if (!set.legends.hasType(raw.type)) { w.errors.push({ message: `kb wire '${raw.id}' has unknown type '${raw.type}'` }); continue; }
      const { wire, errors } = set.legends.normalizeWire(raw);
      for (const e of errors) w.errors.push({ file: 'kb.sop', ...e });
      w.kb.push(wire);
    }
  }
  return set;
}
