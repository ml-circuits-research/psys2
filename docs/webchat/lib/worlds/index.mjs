/**
 * World model (spec 02). Builds worlds from a loader; browser-safe.
 *
 * Loader contract (see src/loaders):
 *   listWorlds()            -> Promise<string[]>        world ids (namespaces)
 *   readFile(id, name)      -> Promise<string | null>   file text, null when absent
 *   loadOps(id)             -> Promise<object | null>   module namespace of ops.mjs
 */
import { parse, get, getAll } from '../soplang/index.mjs?v=26885599a7';
import { Legends } from '../legends/index.mjs?v=48b634e4da';
import { expandShape } from '../formalizer/rules/shapes.mjs?v=5d5cc75c7e';
import { describePatterns, descriptionFor, readDescriptionWires, slotDeclarations, emitKey, EN } from './describe.mjs?v=bc8d4bc227';
import { checkPattern } from '../formalizer/rules/index.mjs?v=ac0b50e4b0';
import { lexIndex } from './lexicon.mjs?v=a107e43628';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

const FILES = ['world.sop', 'legend.sop', 'lexicon.sop', 'patterns.sop', 'operations.sop', 'kb.sop', 'templates.sop', 'tests.sop'];
// Reasoner files (spec 15). `matrix.sop` and `mapping.sop` are data for src/reasoner. The `matrix.*.sop` extras are appended to the world's own
// patterns, operations and templates only when the engine runs with reasoner=matrix and the world says reasoner=matrix (the `ops` fallback loads none of them).
const MATRIX_FILES = ['matrix.sop', 'mapping.sop'];
const MATRIX_EXTRAS = { 'patterns.sop': 'matrix.patterns.sop', 'operations.sop': 'matrix.operations.sop', 'templates.sop': 'matrix.templates.sop' };
// Operation descriptions (E3, spec 03 section 2c): describe.sop is read only when PSYS_GEN_PATTERNS is `add` (generated patterns are appended to the
// hand-written ones) or `only` (hand-written patterns and shapes of the described operations are dropped first). Default: off, nothing is read.
const genMode = () => { const m = globalThis.PSYS_GEN_PATTERNS ?? globalThis.process?.env?.PSYS_GEN_PATTERNS; return m === 'add' || m === 'only' ? m : null; };
/** READER-ROUTE (spec 16 section 7): the reader needs the English words of `describe.sop` (not its generated patterns), so the file is read when the reader is on (`PSYS2_READER` = fill or choose). */
const readerOn = () => { const m = globalThis.PSYS2_READER ?? globalThis.process?.env?.PSYS2_READER; return m === 'fill' || m === 'choose'; };
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
    this.phrases = [];   // core.phrase macros (spec 03 section 2.5)
    this.patterns = [];
    this.descriptions = [];   // core.describe declarations (spec 03 section 2c), read only with PSYS_GEN_PATTERNS
    this.generated = null;
    this.shapes = [];    // core.shape declarations (spec 03 section 2b); their patterns are generated at load and appended to `patterns`
    this.operations = [];
    this.kbRaw = [];
    this.kb = [];        // kb wires with full keys (filled once legends are built)
    this.templates = [];
    this.tests = [];
    this.ops = {};
    this.wires = [];     // every wire of every file, for validation lookups
    this.raw = {};       // reasoner data as text: { legend, kb, matrix, mapping } (only the files the world has)
    this.fns = null;     // functions of fns.mjs (actions and calc functions of the matrix), or null
    this.toState = null; // `toState(ctx)` of fns.mjs (the session state ops.mjs would keep), or null
    this.problem = null;   // `problem(ctx)` of fns.mjs: the sentence for a statement the library cannot take (a refusal or a new issue), or null
    this.whyWords = null;  // `why(ctx)` of fns.mjs: the words of "why?" about a fact the user can name (matrix strategy), or null
    this.adopt = null;   // `adopt({ state, find })` of fns.mjs: the library wires for a state the operations changed (the inverse of toState), or null
    this.stateKey = null;   // `stateKey(state)` of fns.mjs: a cheap text that changes when the state does (the host compares it instead of stringifying a big state), or null
    this.guard = null;   // `guard({ action, args, state, check })` of fns.mjs: refuses a request whose target does not exist, with the reason (the rules say it), or null
    this.isView = null;  // `isView({ before, after })` of fns.mjs: true when a library step changed only what the user looks at (selection, cursor), so "undo" skips it, or null
    this.closeOffer = null;   // `closeOffer(state)` of fns.mjs: closes the offer a confirmation answered when an undo brought it back (spec 15, "Undoing a confirmation")
    this.undoWords = null;   // `undoWords({ before, after })` of fns.mjs: what "undo" says once the library went back, or null
    this.assumed = null;   // `assumed(cell)` of fns.mjs (the words for a default or guessed value an answer rests on), or null
    this.voice = null;   // `voice(ctx)` of fns.mjs (reply facts for the templates), or null
  }
  get title() { return txt(this.manifest ?? { entries: [] }, 'title') ?? this.id; }
  get status() { return txt(this.manifest ?? { entries: [] }, 'status'); }
  get version() { return txt(this.manifest ?? { entries: [] }, 'version'); }
  /** Short phrase of what the world lets the assistant do ("do sums"); undefined when not declared, '' to stay out of the capabilities answer. */
  get summaryPhrase() { return txt(this.manifest ?? { entries: [] }, 'summary'); }
  get doc() { return txt(this.manifest ?? { entries: [] }, 'doc'); }
  /** Which reasoner the world opts into: `ops` (default, operations.sop + ops.mjs) or `matrix` (matrix.sop on the sopworld library, spec 15). */
  get reasoner() { return txt(this.manifest ?? { entries: [] }, 'reasoner') === 'matrix' ? 'matrix' : 'ops'; }
  /** The action that takes the last move back (`undo=<action>` in world.sop): the host layer answers it by rewinding the library (spec 15), or null. */
  get undoAction() { return txt(this.manifest ?? { entries: [] }, 'undo') ?? null; }
  /** The action that takes an undo back (`redo=<action>` in world.sop; with `undo=`): the host layer re-applies what the last undo took out, or null. */
  get redoAction() { return txt(this.manifest ?? { entries: [] }, 'redo') ?? null; }
  /** A world whose state follows the other worlds (the shell's tab: an editor brings its tab forward): what another world's request changed in it is not a step of the turn, so undoing that turn leaves it alone (`passive=true`). Only a turn of its own undoes its changes. */
  get passive() { return txt(this.manifest ?? { entries: [] }, 'passive') === 'true'; }
  /** Wire types the world's operations emit that only the session memory keeps (`untold=<type>`, repeatable): the library does not hold them (facts the engine reads from its own state: the sentences of a document). */
  get untold() { return getAll(this.manifest ?? { entries: [] }, 'untold').map((v) => v.v); }
  /** Wire types the world's matrix actions write and other worlds read from the session memory (`mirror=<type>`, repeatable): the host layer copies them there. */
  get mirrors() { return getAll(this.manifest ?? { entries: [] }, 'mirror').map((v) => v.v); }
  /** How the world calls its own facts in "why?" (`source="the price list"`), or null (the host says "what I know"). */
  get sourcePhrase() { return txt(this.manifest ?? { entries: [] }, 'source') ?? null; }
  /** Keys (`type.key`) whose questions the matrix leaves to the operations (`ops=<key>`, repeatable). */
  get opsKeys() { return getAll(this.manifest ?? { entries: [] }, 'ops').map((v) => v.v); }
  /** Worlds this composite world composes (`compose=<world>`, repeatable; spec 15): ids, in the order written. */
  get compose() { return getAll(this.manifest ?? { entries: [] }, 'compose').map((v) => worldIdOf(v.v)); }
  /** Worlds whose legends and knowledge bases this world's matrix reads facts of (`reads=world.<id>`, repeatable; spec 15): their wires are copied into this world's instance, their matrices are not loaded. */
  get reads() { return getAll(this.manifest ?? { entries: [] }, 'reads').map((v) => worldIdOf(v.v)); }
  get language() { return txt(this.manifest ?? { entries: [] }, 'language') ?? 'en'; }
  /** Plain summary for listings. */
  summary() {
    return { id: this.id, title: this.title, summary: this.summaryPhrase, status: this.status, version: this.version, doc: this.doc,
      language: this.language, imports: this.imports, formalization: txt(this.manifest ?? { entries: [] }, 'formalization') ?? 'rules', tab: this.tab };
  }
  /**
   * The game's own actions for the shell's game controls (spec 03 section 4): gameNew, gameHint, gameGiveUp, gameUndo in the
   * manifest, falling back to tabNew, tabHint, tabGiveUp, tabUndo. null when the world declares none.
   */
  get gameControls() {
    const m = this.manifest ?? { entries: [] };
    const t = this.tab;
    const out = { new: txt(m, 'gameNew') ?? t?.new ?? null, hint: txt(m, 'gameHint') ?? t?.hint ?? null,
      giveUp: txt(m, 'gameGiveUp') ?? t?.giveUp ?? null, undo: txt(m, 'gameUndo') ?? t?.undo ?? null };
    return Object.values(out).some(Boolean) ? out : null;
  }

  /**
   * Tab declared by a tool world in its manifest (spec 07 §6): tab, tabTitle, tabAlias (repeatable), tabOrder,
   * tabKind (tool|game), tabNew, tabHint, tabGiveUp, tabUndo (action names). null when the world has no tab.
   */
  get tab() {
    const m = this.manifest ?? { entries: [] };
    const id = txt(m, 'tab');
    if (!id) return null;
    const all = (k) => m.entries.filter((e) => e.key === k || e.key.endsWith('.' + k)).map((e) => String(e.value.v));
    return { id, title: txt(m, 'tabTitle') ?? this.title, aliases: all('tabAlias').map((a) => a.replace(/_/g, ' ')),
      order: Number(txt(m, 'tabOrder') ?? 100), kind: txt(m, 'tabKind') ?? 'tool',
      new: txt(m, 'tabNew') ?? null, hint: txt(m, 'tabHint') ?? null, giveUp: txt(m, 'tabGiveUp') ?? null, undo: txt(m, 'tabUndo') ?? null };
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
      budget.tick('index.visit');
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

function buildWorld(id, files, ops, { fns = null, voice = null, toState = null, adopt = null, guard = null, isView = null, stateKey = null, assumed = null, undoWords = null, closeOffer = null, problem = null, whyWords = null, matrix = false } = {}) {
  const w = new World(id);
  w.problem = problem;
  w.whyWords = whyWords;
  w.ops = ops ?? {};
  w.fns = fns;
  w.voice = voice;
  w.assumed = assumed;
  w.undoWords = undoWords;
  w.closeOffer = closeOffer;
  w.toState = toState;
  w.adopt = adopt;
  w.guard = guard;
  w.stateKey = stateKey;
  w.isView = isView;
  for (const [k, f] of [['legend', 'legend.sop'], ['kb', 'kb.sop'], ['matrix', 'matrix.sop'], ['mapping', 'mapping.sop']]) if (files[f] != null) w.raw[k] = files[f];
  if (matrix && /\breasoner=matrix\b/.test(files['world.sop'] ?? '')) {
    // templates: the extras go first (the renderer tries the templates of a status in file order, so a matrix-mode wording wins); patterns and operations: order does not matter
    for (const [base, extra] of Object.entries(MATRIX_EXTRAS)) if (files[extra] != null) files[base] = base === 'templates.sop' ? files[extra] + '\n' + (files[base] ?? '') : (files[base] ?? '') + '\n' + files[extra];
  }
  const wires = Object.fromEntries([...FILES, 'describe.sop'].map((f) => [f, readEntries(w, f, f === 'describe.sop' && !genMode() && !readerOn() ? slotDeclarations(files[f]) || null : files[f])]));
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
    extends: getAll(x, 'extends').map((v) => String(v.v).replace(/^\$/, '')), exclude: getAll(x, 'exclude').map((v) => String(v.v).toLowerCase()),
    open: txt(x, 'open') ?? null, catalogs: getAll(x, 'catalog').map((v) => String(v.v)),   // open=knowledge: also any word of these catalog worlds, looked up when a sentence is read (src/knowledge/open-words.mjs)
  }));
  w.phrases = wires['lexicon.sop'].filter((x) => x.type === 'core.phrase').map((x) => ({
    id: x.id.replace(/^phrase\./, ''), wireId: x.id, wire: x, worldId: id, frame: txt(x, 'frame') !== 'false',
    alts: [...new Set(getAll(x, 'alt').map((v) => String(v.v).toLowerCase()))].map((a) => a.split('_').filter(Boolean)),
  }));
  for (const ph of w.phrases) {
    if (!ph.wireId.startsWith('phrase.')) w.errors.push({ file: 'lexicon.sop', message: `phrase '${ph.wireId}' must have an id starting with 'phrase.'` });
    if (!ph.alts.length) w.errors.push({ file: 'lexicon.sop', message: `phrase '${ph.wireId}' has no alternatives` });
  }
  w.patterns = wires['patterns.sop'].filter((x) => x.type === 'core.pattern').map((x) => ({
    id: x.id, wire: x, worldId: id, match: txt(x, 'match'), emit: txt(x, 'emit'),
    kind: txt(x, 'kind') ?? 'statement', priority: Number(txt(x, 'priority') ?? 0),
    // routing hints (spec 03 section 4): tabOnly=true (only while the world's own tab is active), tabPriority=<n> (priority
    // while the world's tab is active), yieldsTo=<world> (a tier 2b setting that gives way to that world when it is the tab or recent),
    // needsState=<path> (the pattern is considered only while that path of its world's state is non-empty, or its world owns the active tab)
    tabOnly: txt(x, 'tabOnly') === 'true', tabPriority: txt(x, 'tabPriority') == null ? null : Number(txt(x, 'tabPriority')),
    yieldsTo: getAll(x, 'yieldsTo').map((v) => v.v),
    needsState: txt(x, 'needsState') ?? null,
    // onlyWhile=<path>: the pattern is considered only while that path of its world's state is truthy, also when its world owns the tab
    onlyWhile: txt(x, 'onlyWhile') ?? null,
    // tabFollow=true: a bare reading (a coordinate such as "b1") that only the world of the active tab, the active game or a recently used world may claim (RD2)
    tabFollow: txt(x, 'tabFollow') === 'true',
    // signal=true: the pattern carries an explicit signal of its world (a named shape, an arrow between names, a flowchart word): a match that is not a catch-all beats the active tab's own matches (routing tier 3, DIAG)
    signal: txt(x, 'signal') === 'true',
    // tabClaim=true: while its world owns the active tab, this pattern is read by it even when the message names another world ("make a diagram of this" on the Talk tab is a transfer, not a new diagram)
    tabClaim: txt(x, 'tabClaim') === 'true',
    // whole=true: the pattern reads a whole list statement ("I like chess, music and maps"); when the rules read the whole message with it, a dispatcher cut into pieces never overrides it (COMPUTE-BUDGET C)
    whole: txt(x, 'whole') === 'true',
    examples: [...new Set([...getAll(x, 'example').map((v) => v.v), ...getAll(x, 'canonical').map((v) => v.v)])],
    canonical: [...new Set(getAll(x, 'canonical').map((v) => v.v))],   // canonical examples (src/worlds/canonical.mjs): what help and "Did you mean" may show
  }));
  w.shapes = wires['patterns.sop'].filter((x) => x.type === 'core.shape').map((x) => {
    const t = (k) => txt(x, k);
    return {
      id: x.id.replace(/^shape\./, ''), wireId: x.id, wire: x, worldId: id, family: t('family'), verb: t('verb'), obj: t('obj'), val: t('val'), noun: t('noun'),
      det: t('det'), link: t('link'), extra: t('extra'), emit: t('emit'), emitOpts: t('emitOpts'), forms: t('forms'), skip: t('skip'), sample: t('sample'), mod: t('mod'), objmod: t('objmod'), pron: t('pron'), rel: t('rel'), objdet: t('objdet'), poss: t('poss'), cont: t('cont'),
      priority: t('priority') == null ? undefined : Number(t('priority')), kind: t('kind'), example: getAll(x, 'example').map((v) => v.v), canonical: getAll(x, 'canonical').map((v) => v.v),
    };
  });
  w.operations = wires['operations.sop'].filter((x) => x.type === 'core.operation').map((x) => ({
    id: x.id, wire: x, worldId: id, impl: txt(x, 'impl'), semantics: txt(x, 'semantics') ?? 'query',
    action: txt(x, 'action'), outputs: getAll(x, 'outputs').map((v) => v.v), inputs: getAll(x, 'inputs').map((v) => v.v),
    doc: txt(x, 'doc'),
  }));
  const read = readDescriptionWires(wires['describe.sop'] ?? []);
  w.descriptions = [...read.descriptions.values()];   // core.describe wires with their arguments and wording (spec 03 section 2c)
  w.argSlots = new Map();                              // action (the `op` of a description) -> Map(argument -> `<type>.<key>`): what the arguments of a host-run action fill
  for (const d of w.descriptions) { const m = new Map(d.args.filter((a) => a.slot).map((a) => [a.name, a.slot])); if (m.size && d.op) w.argSlots.set(d.op, m); }
  w.descReader = read;                                 // { descriptions, words, errors }: a language pack adds to it
  for (const m of read.errors) w.errors.push({ file: 'describe.sop', message: m });
  w.kbRaw = wires['kb.sop'];
  w.templates = wires['templates.sop'].filter((x) => x.type === 'core.template').map((x) => ({
    id: x.id, wire: x, worldId: id, for: txt(x, 'for'), status: txt(x, 'status') ?? 'supported',
    mode: txt(x, 'mode') ?? 'value', text: txt(x, 'text'), when: getAll(x, 'when').map((v) => v.v),
  }));
  w.tests = wires['tests.sop'].filter((x) => x.type === 'core.test').map((x) => ({
    id: x.id, wire: x, worldId: id, input: txt(x, 'input'), expect: getAll(x, 'expect').map((v) => v.v),
    expectStatus: txt(x, 'expectStatus'),
    expectState: getAll(x, 'expectState').map((v) => v.v), expectEffect: getAll(x, 'expectEffect').map((v) => v.v), given: getAll(x, 'given').map((v) => v.v), language: txt(x, 'language') ?? 'en', session: txt(x, 'session'),
    reasoner: txt(x, 'reasoner'),   // `ops` or `matrix`: the test only runs with that reasoner strategy (spec 15); absent = both
  }));
  return w;
}

/** Load every world the loader lists. Never throws on world content errors; see `allErrors()`. */
export async function loadWorlds(loader, { reasoner = 'matrix' } = {}) {
  const set = new WorldSet();
  const ids = await loader.listWorlds();
  const built = new Map();
  for (const id of ids) {
    const files = {};
    const matrix = reasoner === 'matrix';
    await Promise.all([...FILES, 'describe.sop', ...MATRIX_FILES, ...(matrix ? Object.values(MATRIX_EXTRAS) : [])].map(async (f) => { files[f] = await loader.readFile(id, f); }));
    let ops = null, fns = null, voice = null, toState = null, adopt = null, guard = null, isView = null, stateKey = null, assumed = null, undoWords = null, closeOffer = null, problem = null, whyWords = null;
    if (files['matrix.sop'] != null && matrix) { try { const m = await loader.loadFns?.(id); fns = m?.fns ?? null; voice = m?.voice ?? null; toState = m?.toState ?? null; adopt = m?.adopt ?? null; guard = m?.guard ?? null; isView = m?.isView ?? null; stateKey = m?.stateKey ?? null; assumed = m?.assumed ?? null; undoWords = m?.undoWords ?? null; closeOffer = m?.closeOffer ?? null; problem = m?.problem ?? null; whyWords = m?.why ?? null; } catch (e) { built.set(id + ':fnsError', e); } }
    try { ops = await loader.loadOps(id); } catch (e) { ops = null; built.set(id + ':opsError', e); }
    const w = buildWorld(id, files, ops, { fns, voice, toState, adopt, guard, isView, stateKey, assumed, undoWords, closeOffer, problem, whyWords, matrix });
    if (built.has(id + ':fnsError')) w.errors.push({ message: `fns.mjs failed to load: ${built.get(id + ':fnsError').message}` });
    if (built.has(id + ':opsError')) w.errors.push({ message: `ops.mjs failed to load: ${built.get(id + ':opsError').message}` });
    built.set(id, w);
  }
  // dependency order
  const order = [];
  const state = new Map();
  const visit = (id, stack) => {
    budget.tick('index.visit2');
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
  resolveLexiconExtends(set);
  expandShapes(set);
  expandDescriptions(set);
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

/**
 * Lexicon inheritance (spec 02): `extends=$lex.x` (repeatable) adds the words (and plurals) of the named lexicons, `exclude=<word>`
 * (repeatable) removes entries from the inherited ones. The resolved list replaces `words`, so every consumer sees one flat list.
 */
function resolveLexiconExtends(set) {
  const byId = new Map();
  for (const w of set.list()) for (const l of w.lexicons) byId.set(l.id, l);
  const state = new Map();
  const resolve = (l) => {
    budget.tick('index.resolve');
    if (!l.extends.length || state.get(l) === 2) return;
    const w = set.get(l.worldId);
    if (state.get(l) === 1) { w.errors.push({ file: 'lexicon.sop', message: `lexicon '${l.id}': extends cycle` }); return; }
    state.set(l, 1);
    const inherited = [], plurals = [];
    for (const id of l.extends) {
      const base = byId.get(id);
      if (!base) { w.errors.push({ file: 'lexicon.sop', message: `lexicon '${l.id}': extends unknown lexicon '${id}'` }); continue; }
      resolve(base);
      inherited.push(...base.words);
      plurals.push(...base.plurals);
    }
    const drop = new Set(l.exclude);
    for (const x of l.exclude) if (!inherited.some((y) => y.toLowerCase() === x)) w.errors.push({ file: 'lexicon.sop', message: `lexicon '${l.id}': exclude '${x}' is not an inherited word` });
    l.words = [...new Set([...inherited.filter((x) => !drop.has(x.toLowerCase())), ...l.words])];
    l.plurals = [...new Set([...plurals, ...l.plurals])];
    state.set(l, 2);
  };
  for (const l of byId.values()) resolve(l);
}

/**
 * Request shapes (spec 03 section 2b): after the lexicons are resolved, every `core.shape` of a world is expanded into patterns that are
 * appended to the world's own (hand-written first, so their order wins ties). Each generated pattern goes through `checkPattern`;
 * problems are load errors of the world. A shape that cannot be expanded is an error and generates nothing.
 */
function expandShapes(set) {
  if (!set.list().some((w) => w.shapes.length)) return;
  const lex = lexIndex(set);
  for (const w of set.list()) {
    for (const shape of w.shapes) {
      let list;
      try { list = expandShape(shape, { phrases: lex.phrases, lexicons: lex.lexicons }); } catch (e) { w.errors.push({ file: 'patterns.sop', message: e.message }); continue; }
      for (const g of list) {
        const p = {
          id: `pat.${g.id}`, wire: null, worldId: w.id, match: g.match, emit: g.emit, kind: g.kind, priority: g.priority,
          tabOnly: false, tabPriority: null, yieldsTo: [], needsState: null, tabFollow: false, signal: false, whole: false, examples: g.example, form: g.form, shape: shape.wireId,
          // canonical: the explicit examples of the shape (on the first generated pattern) and the generated sentences the shape marks canonical
          canonical: [...new Set([...(list[0] === g ? shape.example ?? [] : []), ...(shape.canonical ?? []).filter((e) => g.example.includes(e))])],
        };
        for (const e of p.canonical) if (!p.examples.includes(e)) p.examples = [...p.examples, e];
        for (const problem of checkPattern(p, set)) w.errors.push({ file: 'patterns.sop', message: `shape ${shape.id}: ${problem}` });
        w.patterns.push(p);
      }
    }
  }
}

/**
 * Generate the patterns of every `core.describe` wire (spec 03 section 2c); `only` first drops the hand-written patterns of the described operations.
 */
function expandDescriptions(set) {
  const mode = genMode();
  if (!mode || !set.list().some((w) => w.descriptions.length)) return;
  const lex = lexIndex(set);
  for (const w of set.list()) {
    if (!w.descriptions.length) continue;
    const keys = new Set(w.descriptions.map((d) => d.op));
    w.generated = { mode, replaced: [], patterns: [] };
    if (mode === 'only') {
      w.generated.replaced = w.patterns.filter((p) => keys.has(emitKey(p.emit))).map((p) => p.id);
      w.patterns = w.patterns.filter((p) => !keys.has(emitKey(p.emit)));
    }
    const runs = [{ lang: 'en', lg: EN }];
    for (const run of runs) {
      for (const desc of w.descriptions) {
        const d = descriptionFor(desc, run.lang);
        if (!d) continue;
        let list;
        try { list = describePatterns(d, { phrases: lex.phrases, lexicons: lex.lexicons, lg: run.lg }); } catch (e) { w.errors.push({ file: 'describe.sop', message: e.message }); continue; }
        if (emitKey(desc.emit) !== desc.op) w.errors.push({ file: 'describe.sop', message: `describe ${desc.id}: op '${desc.op}' differs from the key of its emit ('${emitKey(desc.emit)}')` });
        for (const g of list) {
          const p = {
            id: `pat.${g.id}`, wire: null, worldId: w.id, match: g.match, emit: g.emit, kind: g.kind, priority: g.priority,
            tabOnly: false, tabPriority: null, yieldsTo: [], needsState: null, tabFollow: false, signal: false, whole: false, examples: g.example, form: g.form, shape: null, generatedFrom: desc.wireId, canonical: [],
          };
          for (const problem of checkPattern(p, set)) w.errors.push({ file: 'describe.sop', message: `describe ${desc.id} (${run.lang}): ${problem}` });
          w.patterns.push(p);
          w.generated.patterns.push(p.id);
        }
      }
    }
  }
}
