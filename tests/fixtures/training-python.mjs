// SPDX-License-Identifier: AGPL-3.0-only
// The Python runtime for tests that run training/export code (torch, numpy, onnx ...). The virtual environment is git-ignored and lives in the main
// checkout, so a linked worktree (git worktree add) has none of its own. Resolution order: SOP_PYTHON, this checkout's .venv, the main checkout's .venv
// (found through git's common directory), then python3 on PATH. The first one that imports every required module is used; when none does, tests skip
// with the reason instead of failing on a missing environment.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const probed = new Map();

function candidates() {
  const list = [];
  if (process.env.SOP_PYTHON) list.push(process.env.SOP_PYTHON);
  list.push(join(REPO, '.venv/bin/python'));
  const common = spawnSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status === 0 && common.stdout.trim()) list.push(join(dirname(common.stdout.trim()), '.venv/bin/python'));
  list.push('python3');
  return [...new Set(list)].filter(path => path === 'python3' || existsSync(path));
}

/** { python, skip }: an interpreter that imports `modules`, or skip = the reason none was found (pass as node:test's skip option). */
export function trainingPython(modules = ['torch']) {
  const key = modules.join(',');
  if (probed.has(key)) return probed.get(key);
  let found = null;
  for (const python of candidates()) {
    const r = spawnSync(python, ['-c', modules.map(name => `import ${name}`).join(';') || 'pass'], { encoding: 'utf8', env: { ...process.env, CUDA_VISIBLE_DEVICES: '' } });
    if (r.status === 0) { found = { python, skip: false }; break; }
  }
  found ??= { python: 'python3', skip: `training Python environment missing: no interpreter imports ${key} (set SOP_PYTHON or create .venv in the main checkout)` };
  probed.set(key, found);
  return found;
}
