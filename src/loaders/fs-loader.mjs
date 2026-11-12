/**
 * Node loader: reads world directories and imports ops.mjs dynamically.
 * `roots` are directories that contain one sub-directory per world (default: <repo>/worlds).
 * A world found in an earlier root shadows the same id in a later root.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEFAULT_ROOT = fileURLToPath(new URL('../../worlds', import.meta.url));

const exists = (p) => stat(p).then(() => true, () => false);

export function createFsLoader({ roots = [DEFAULT_ROOT] } = {}) {
  const dirs = new Map(); // id -> directory
  let scanned = false;
  async function scan() {
    if (scanned) return;
    scanned = true;
    for (const root of roots) {
      let names = [];
      try { names = await readdir(root); } catch { continue; }
      for (const name of names.sort()) {
        const dir = path.join(root, name);
        if (!dirs.has(name) && (await exists(path.join(dir, 'world.sop')))) dirs.set(name, dir);
      }
    }
  }
  return {
    roots,
    async listWorlds() { await scan(); return [...dirs.keys()]; },
    async readFile(id, name) {
      await scan();
      const dir = dirs.get(id);
      if (!dir) return null;
      try { return await readFile(path.join(dir, name), 'utf8'); } catch { return null; }
    },
    /** A file of a language pack, `<repo>/lang/<lang>/<name>.sop` (outside the worlds; opt-in, `PSYS_GEN_LANG`), or null. */
    async readLangPack(lang, name) {
      try { return await readFile(path.join(DEFAULT_ROOT, '..', 'lang', lang, `${name}.sop`), 'utf8'); } catch { return null; }
    },
    async loadOps(id) {
      await scan();
      const dir = dirs.get(id);
      if (!dir) return null;
      const file = path.join(dir, 'ops.mjs');
      if (!(await exists(file))) return null;
      return import(pathToFileURL(file).href);
    },
    /** fns.mjs of a world (the actions of its matrix, spec 15), or null. */
    async loadFns(id) {
      await scan();
      const dir = dirs.get(id);
      if (!dir) return null;
      const file = path.join(dir, 'fns.mjs');
      if (!(await exists(file))) return null;
      return import(pathToFileURL(file).href);
    },
  };
}
