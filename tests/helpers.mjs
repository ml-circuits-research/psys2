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
