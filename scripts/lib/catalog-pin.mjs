// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The local checkout of the knowledge catalog at the pin (src/knowledge/catalog-pin.mjs; P4). Build scripts and measurements read the catalog through `pinnedCatalog()`,
 * never through a moving head: the folder is `<cache>/catalog/<commit>/docs/worlds`, extracted once with `git archive` from a clone of the catalog repository
 * (`<cache>/catalog-repo`, fetched when the pinned commit is missing). <cache> is `PSYS2_CATALOG_CACHE` or `.cache/` of this repository (git-ignored).
 *
 *   import { pinnedCatalog } from './lib/catalog-pin.mjs';
 *   const { dir, commit } = pinnedCatalog();      // dir = the docs/worlds folder at the pin
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CATALOG_PIN, catalogUrl } from '../../src/knowledge/catalog-pin.mjs';

export { CATALOG_PIN, catalogUrl };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
  return r.stdout;
};

/** { dir, commit, url, short }: the catalog folder at the pin, made on first use (needs git and the network once). */
export function pinnedCatalog({ pin = CATALOG_PIN, cache = process.env.PSYS2_CATALOG_CACHE || join(REPO, '.cache') } = {}) {
  const root = join(cache, 'catalog', pin.commit), dir = join(root, pin.path), done = join(root, '.complete');
  if (!existsSync(done)) {
    const clone = join(cache, 'catalog-repo');
    if (!existsSync(join(clone, '.git'))) { mkdirSync(cache, { recursive: true }); run('git', ['clone', '-q', '--no-checkout', pin.repo, clone]); }
    const has = spawnSync('git', ['-C', clone, 'cat-file', '-e', `${pin.commit}^{commit}`]).status === 0;
    if (!has) run('git', ['-C', clone, 'fetch', '-q', 'origin']);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const tar = spawnSync('git', ['-C', clone, 'archive', '--format=tar', pin.commit, pin.path], { maxBuffer: 1 << 30 });
    if (tar.status !== 0) throw new Error(`git archive ${pin.commit}: ${String(tar.stderr).trim()}`);
    run('tar', ['-x', '-C', root], { input: tar.stdout });
    writeFileSync(done, `${pin.commit}\n`);
  }
  return { dir, commit: pin.commit, short: pin.commit.slice(0, 7), url: catalogUrl(pin) };
}
