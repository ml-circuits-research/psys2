// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The local checkout of the knowledge catalog at the pin (src/knowledge/catalog-pin.mjs; P4). Build scripts and measurements read the catalog through `pinnedCatalog()`,
 * never through a moving head: the folder is `<cache>/catalog/<commit>/docs/worlds`, extracted once with `git archive` from a clone of the catalog repository
 * (`<cache>/catalog-repo`, fetched when the pinned commit is missing). <cache> is `PSYS2_CATALOG_CACHE` or `.cache/` of this repository (git-ignored).
 *
 *   import { pinnedCatalog } from './lib/catalog-pin.mjs';
 *   const { dir, commit } = pinnedCatalog();      // dir = the docs/worlds folder at the pin
 */
import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
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

/** Path of the local clone of the catalog repository that contains `commit` (cloned once, fetched when the commit is missing); safe under concurrent callers. */
export function catalogRepo({ pin = CATALOG_PIN, commit = pin.commit, cache = process.env.PSYS2_CATALOG_CACHE || join(REPO, '.cache') } = {}) {
  const clone = join(cache, 'catalog-repo');
  if (!existsSync(join(clone, '.git'))) {
    mkdirSync(cache, { recursive: true });
    const tmpClone = `${clone}.tmp-${process.pid}-${Date.now()}`;
    run('git', ['clone', '-q', '--no-checkout', pin.repo, tmpClone]);
    try { renameSync(tmpClone, clone); } catch { rmSync(tmpClone, { recursive: true, force: true }); }
  }
  const has = spawnSync('git', ['-C', clone, 'cat-file', '-e', `${commit}^{commit}`]).status === 0;
  if (!has) run('git', ['-C', clone, 'fetch', '-q', 'origin']);
  return clone;
}

/** { dir, commit, url, short }: the catalog folder at the pin, made on first use (needs git and the network once). */
export function pinnedCatalog({ pin = CATALOG_PIN, cache = process.env.PSYS2_CATALOG_CACHE || join(REPO, '.cache') } = {}) {
  const root = join(cache, 'catalog', pin.commit), dir = join(root, pin.path), done = join(root, '.complete');
  if (!existsSync(done)) {
    // Concurrent test processes may all find the folder missing: each clones and extracts into its own temporary folder and renames it into place,
    // so no process ever reads or deletes another one's half-written extraction; the loser of a rename race discards its copy.
    const tag = `.tmp-${process.pid}-${Date.now()}`;
    const clone = catalogRepo({ pin, cache });
    const tmpRoot = `${root}${tag}`;
    mkdirSync(tmpRoot, { recursive: true });
    try {
      const tar = spawnSync('git', ['-C', clone, 'archive', '--format=tar', pin.commit, pin.path], { maxBuffer: 1 << 30 });
      if (tar.status !== 0) throw new Error(`git archive ${pin.commit}: ${String(tar.stderr).trim()}`);
      run('tar', ['-x', '-C', tmpRoot], { input: tar.stdout });
      writeFileSync(join(tmpRoot, '.complete'), `${pin.commit}\n`);
      if (!existsSync(done)) {
        if (existsSync(root)) rmSync(root, { recursive: true, force: true }); // an incomplete folder left by an interrupted older run
        try { renameSync(tmpRoot, root); } catch (error) { if (!existsSync(done)) throw error; }
      }
    } finally { rmSync(tmpRoot, { recursive: true, force: true }); }
  }
  return { dir, commit: pin.commit, short: pin.commit.slice(0, 7), url: catalogUrl(pin) };
}
