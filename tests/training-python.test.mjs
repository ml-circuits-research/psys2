import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Python-side tests of the training helpers (no torch/GPU needed): safe noise, windows, compositional data, sampling, selection, role pairs.
const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);

test('training python tests', { skip: py ? false : 'no python on PATH' }, () => {
  const r = spawnSync(py, [fileURLToPath(new URL('../training/tests/run_all.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /python tests passed/);
});
