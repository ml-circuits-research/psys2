// Shared helpers for the test suites (not a test file).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createBundleLoader } from '../src/loaders/bundle-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';

export const FIXTURES = fileURLToPath(new URL('./fixtures/worlds', import.meta.url));

/** Engine over the real worlds plus the test-only fixture worlds. */
export const fixtureEngine = (extra = {}) => {
  // Only the platform worlds plus the fixtures: the demo worlds (kids.arith, kids.shop, ...) overlap with
  // test.counting on purpose and have their own tests (tests/kids-worlds.test.mjs, `test-world`).
  const loader = createFsLoader({ roots: [DEFAULT_ROOT, FIXTURES] });
  const listWorlds = loader.listWorlds.bind(loader);
  loader.listWorlds = async () => (await listWorlds()).filter((id) => id === 'core' || id === 'lang.common' || id === 'kids.common' || id === 'ui.help' || (id.startsWith('test.') && id !== 'test.seating'));   // test.seating is a schema world with its own engine (tests/acts.test.mjs); beside test.counting it would answer its questions
  return createEngine({ loader, ...extra });
};

/** `data:` URL of an ES module, so inline worlds can have operations without touching disk. */
export const moduleUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');

/** Bundle for createBundleLoader: files are { name: text }. Always includes the real core world. */
export async function bundleWith(worlds) {
  const { readFile } = await import('node:fs/promises');
  const core = {};
  for (const f of ['world.sop', 'legend.sop']) core[f] = await readFile(new URL(`../worlds/core/${f}`, import.meta.url), 'utf8');
  return { worlds: { core: { files: core }, ...worlds } };
}

export async function bundleEngine(worlds, extra = {}) {
  return createEngine({ loader: createBundleLoader(await bundleWith(worlds)), ...extra });
}
export async function bundleSet(worlds) {
  return loadWorlds(createBundleLoader(await bundleWith(worlds)));
}

/** Minimal world manifest + legend text for inline worlds. */
export const mini = (ns, { imports = ['core'], legend = '', files = {}, opsSrc } = {}) => ({
  files: {
    'world.sop': `@world.${ns} core.world\n    namespace=${ns}\n    legend=$legend.${ns}\n${imports.map((i) => `    imports=world.${i}\n`).join('')}    title="${ns}"\n    status=fixture\n`,
    'legend.sop': `@legend.${ns} core.legend\n    namespace=${ns}\n${legend}`,
    ...files,
  },
  opsUrl: opsSrc ? moduleUrl(opsSrc) : undefined,
});

// ---- fast / full suites (scripts/run-tests.mjs sets these variables) ---------------------------------------------
// PSYS2_SUITE=fast: exhaustive sweeps run on a deterministic ~10% sample (seed PSYS2_SAMPLE_SEED, default the date);
// PSYS2_SUITE=full (also the default when a file is run directly with `node --test`): everything in full.
// PSYS2_CHANGED_WORLDS=a,b | all: worlds whose files differ from the main branch run their sweeps in full even in the fast suite.
export const SUITE = ['fast', 'smoke'].includes(process.env.PSYS2_SUITE) ? 'fast' : 'full';   // smoke = fast sampling
export const SAMPLE_SEED = process.env.PSYS2_SAMPLE_SEED || new Date().toISOString().slice(0, 10);
const CHANGED = (process.env.PSYS2_CHANGED_WORLDS || '').split(',').filter(Boolean);
export const SAMPLE_RATE = 0.1;

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

/** True when the sweep item `key` of `world` belongs to this run: always in the full suite and for changed worlds, else about 10% by seeded hash. */
export const inSample = (key, world = '', rate = SAMPLE_RATE) =>
  SUITE === 'full' || CHANGED.includes('all') || (world !== '' && CHANGED.includes(world)) || fnv(`${SAMPLE_SEED}|${key}`) / 4294967296 < rate;

/** Items of a sweep that this suite runs (all of them in the full suite). `key(item, index)` names an item stably; `world` may be a string or `(item) => id`. */
export const sampled = (items, { key = (x) => String(x), world = '' } = {}) =>
  items.filter((x, i) => inSample(key(x, i), typeof world === 'function' ? world(x) : world));

/** Test options for a test that belongs to the full suite only: `test(name, fullOnly({ timeout }), fn)`. */
export const fullOnly = (opts = {}) => (SUITE === 'full' ? opts : { ...opts, skip: 'full suite only (npm run test:full)' });

/** The fixture catalog (tests/fixtures/catalog) as the engine's knowledge: the questions of the kids worlds are Talk frames over the catalog (KNOWLEDGE-OUT step 5), so a test that asks them needs one. */
export async function fixtureCatalog() {
  const { createFacts } = await import('../src/knowledge/facts.mjs');
  const { createKnowledgeSource } = await import('../src/loaders/knowledge-source.mjs');
  return createFacts({ source: createKnowledgeSource(fileURLToPath(new URL('./fixtures/catalog', import.meta.url))) });
}

/** In-memory catalog files plus whole worlds of the fixture catalog (tests/fixtures/catalog): index entries, schema, shards and the vocabulary keys of those worlds (`ids` such as ['k.geo']). */
export function withFixtureWorlds(files, ids) {
  const dir = new URL('./fixtures/catalog/', import.meta.url);
  const out = { ...files };
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  const vocab = JSON.parse(out['vocab.json'] ?? '{}');
  const worlds = out['index.json'] ? JSON.parse(out['index.json']).worlds : [];
  for (const w of index.worlds.filter((x) => ids.includes(x.id))) {
    worlds.push(w);
    for (const sh of w.shards) for (const k of sh.keys) { const a = (vocab[k.toLowerCase()] ??= []); if (!a.includes(sh.id)) a.push(sh.id); }
    out[w.schema] = readFileSync(new URL(w.schema, dir), 'utf8');
    for (const sh of w.shards) out[sh.path] = readFileSync(new URL(sh.path, dir), 'utf8');
  }
  out['vocab.json'] = JSON.stringify(vocab);
  out['index.json'] = JSON.stringify({ worlds });
  return out;
}

/**
 * `index.json` for an in-memory catalog (the knowledge reader finds worlds, types and keys through the index, KNOWLEDGE-ALL-WORLDS): built from the files a test holds, `vocab.json` (word -> shard ids)
 * and the shards `<world>/shards/<name>.sop`. Returns a copy of `files` with `index.json` added; the worlds of an `index.json` already there are kept.
 */
export function withCatalogIndex(files) {
  const out = { ...files };
  const vocab = JSON.parse(out['vocab.json'] ?? '{}');
  const worlds = new Map((out['index.json'] ? JSON.parse(out['index.json']).worlds : []).map((w) => [w.id, w]));
  for (const [path, text] of Object.entries(out)) {
    const m = /^(k\.[a-z]+)\/shards\/(.+)\.sop$/.exec(path);
    if (!m || [...worlds.values()].some((w) => w.shards.some((s) => s.path === path))) continue;
    const w = worlds.get(m[1]) ?? worlds.set(m[1], { id: m[1], version: '1', exports: [], shards: [] }).get(m[1]);
    for (const line of String(text).split('\n')) { const t = /^@\S+\s+(\S+)/.exec(line); if (t && !w.exports.includes(t[1])) w.exports.push(t[1]); }
    const id = `${m[1]}/shards/${m[2]}`;
    w.shards.push({ id, path, keys: Object.keys(vocab).filter((k) => (vocab[k] ?? []).includes(id)), sources: ['t'] });
  }
  out['index.json'] = JSON.stringify({ worlds: [...worlds.values()] });
  return out;
}

