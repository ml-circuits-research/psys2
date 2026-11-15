// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one way a script that GENERATES from the knowledge catalog finds its catalog and writes its outputs (P4, reviewer 2026-11-15 02:05 item 3).
 *   - the catalog: the first argument that is not a flag, else PSYS2_KNOWLEDGE, else the catalog at the pin (src/knowledge/catalog-pin.mjs, checked out by ./catalog-pin.mjs);
 *     only the pinned catalog has a commit, and a generated header names it (`stamp`), so a bundle made from another folder is stale against the pin;
 *   - `--check`: nothing is written; each output is compared with what the catalog gives and the script exits 1 naming the stale files (`done`).
 *
 *   import { catalogFolder, emit, done, stamp } from './lib/generated.mjs';
 *   const { dir, commit } = await catalogFolder();
 *   emit(file, `// GENERATED ... (k.x version 3${stamp(commit)}) ...`);
 *   done('build-bundled-x');
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CHECK = process.argv.includes('--check');

/** The positional arguments of the script (flags left out). */
export const positional = () => process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** { dir, commit }: the catalog folder this run reads; commit only for the pinned catalog. */
export async function catalogFolder() {
  const given = positional()[0] ?? process.env.PSYS2_KNOWLEDGE;
  if (given) return { dir: /^https?:/.test(given) ? given : resolve(given), commit: null };
  const { pinnedCatalog } = await import('./catalog-pin.mjs');
  const p = pinnedCatalog();
  return { dir: p.dir, commit: p.commit };
}

/** The words a generated header adds for the catalog commit (empty when the catalog is not the pinned one). */
export const stamp = (commit) => (commit ? `, catalog commit ${commit}` : '');

const stale = [];
/** Writes `text` to `file`, or with --check records the file as stale when it differs. */
export function emit(file, text) {
  const f = String(file instanceof URL ? file.pathname : file);
  if (!CHECK) { writeFileSync(f, text); return; }
  let cur = null;
  try { cur = readFileSync(f, 'utf8'); } catch { /* missing: stale */ }
  if (cur !== text) stale.push(f);
}

/** With --check: prints the verdict and exits 1 when an output is stale. */
export function done(name) {
  if (!CHECK) return;
  if (stale.length) {
    console.error(`${name}: stale against the catalog${process.env.PSYS2_KNOWLEDGE || positional()[0] ? '' : ' at the pin (src/knowledge/catalog-pin.mjs)'}: ${stale.map((f) => f.replace(/^.*?\/(src|worlds)\//, '$1/')).join(', ')}; run node scripts/${name}.mjs`);
    process.exit(1);
  }
  console.log(`${name}: fresh`);
}
