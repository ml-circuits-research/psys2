// Shared helpers for the test suites (not a test file).
import { fileURLToPath } from 'node:url';
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
  loader.listWorlds = async () => (await listWorlds()).filter((id) => id === 'core' || id === 'lang.common' || id === 'kids.common' || id === 'ui.help' || id.startsWith('test.'));
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
