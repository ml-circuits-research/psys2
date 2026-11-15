// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The build a measurement was taken on (spec 16 section 14, "Measurement"; reviewer 2026-11-14 23:50). A result file records `build` (git HEAD, short) and `tree`, a hash of the
 * contents of every file the measurement depends on (the runtime, the worlds, the catalog, the judge and the set), read from the working tree, so uncommitted changes count.
 * `record`, the learning curve and tests/real-result-fresh.test.mjs compare a result file's `tree` with the current files: a result older than the tree it claims to measure
 * is flagged (and refused by `record`).
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** What the real set measures: the runtime, the worlds, the catalog, the browser translation switch it uses, the judge and the set. */
export const REAL_SET_INPUTS = ['src', 'worlds', 'knowledge', 'docs/webchat/ui/translation.mjs', 'docs/webchat/ui/settings.mjs', 'docs/webchat/models/dispatcher/meta.json', 'scripts/real-set.mjs', 'scripts/lib', 'training/eval/real-2026-11-15.jsonl', 'training/eval/owner-log-knowledge'];

const git = (repo, args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });

/** The git HEAD (short), or null outside a repository. */
export function headOf(repo) { const r = git(repo, ['rev-parse', '--short', 'HEAD']); return r.status === 0 ? r.stdout.trim() : null; }

/** sha256 (16 hex) over the tracked files under `paths` (path + content, sorted, read from disk). Null outside a repository. */
export function treeOf(repo, paths = REAL_SET_INPUTS) {
  const r = git(repo, ['ls-files', '-z', '--', ...paths]);
  if (r.status !== 0) return null;
  const files = r.stdout.split('\0').filter(Boolean).sort();
  const h = createHash('sha256');
  for (const f of files) { const p = join(repo, f); if (!existsSync(p)) continue; h.update(f); h.update('\0'); h.update(readFileSync(p)); h.update('\0'); }
  return h.digest('hex').slice(0, 16);
}

/** { build, tree } of the current working tree. */
export const buildInfo = (repo, paths = REAL_SET_INPUTS) => ({ build: headOf(repo), tree: treeOf(repo, paths) });

/** Is a result (with `tree`) from the current files? { fresh, why }. A result without `tree` is never fresh. */
export function freshness(repo, result, paths = REAL_SET_INPUTS) {
  if (!result?.tree) return { fresh: false, why: `the result records no tree (build ${result?.build ?? 'unknown'}, ${result?.date ?? 'no date'}): re-run it` };
  const now = treeOf(repo, paths);
  return now === result.tree ? { fresh: true, why: null } : { fresh: false, why: `measured on tree ${result.tree} (build ${result.build ?? '?'}), the files are now tree ${now}: re-run it` };
}
