// SPDX-License-Identifier: AGPL-3.0-only
// The coherence gate of the A/B (REGRESSION-AB, spec 15): over a fixed sample of dialogues, matrix mode (the default) is never worse than `ops`.
// It runs `scripts/ab-sopworld.mjs --sets dialogues --ids <sample> --no-write` (both engines in one process, every dialogue in both) and fails on any
// session classed "ops better": a turn that is judged worse in matrix (a not-understood turn that changes what the user sees, a chess undo that takes back the
// wrong plies, a reply that lost its point). The sample holds the seven dialogues that were "ops better" after the 0.9.0 re-vendor plus the other
// dialogues the two modes differ on, so a coherence bug in those paths fails here, in `npm test`, before the full A/B is run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FULL_SAMPLE = [
  // the seven (REGRESSION-AB)
  'dlg.kidsA#010', 'dlg.drm#011', 'dlg.drm#014', 'dlg.drm#021', 'dlg.gms#002', 'dlg.gms#006', 'dlg.doc#035',
  // the other chess, kids, draw, music and editor dialogues the modes differ on (undo, redo, wording)
  'dlg.kidsB#016', 'dlg.avt#001', 'dlg.avt#011', 'dlg.avt#036', 'dlg.drm#007', 'dlg.drm#025', 'dlg.drm#031', 'dlg.drm#038', 'dlg.ed#006',
];
// smoke suite (PSYS2_SUITE=smoke): the chess/undo dialogues, the kind of coherence bug that broke before; the other dialogues run in the full suite
export const SAMPLE = process.env.PSYS2_SUITE === 'smoke' ? ['dlg.gms#002', 'dlg.gms#006', 'dlg.doc#035', 'dlg.kidsA#010', 'dlg.drm#011'] : FULL_SAMPLE;

test(`A/B gate: no "ops better" dialogue in the fixed sample (${SAMPLE.length} dialogues)`, { timeout: 280000 }, () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/ab-sopworld.mjs'), '--sets', 'dialogues', '--ids', SAMPLE.join(','), '--no-write'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 270000 });
  assert.equal(r.status, 0, r.stderr.slice(-500));
  const out = JSON.parse(r.stdout);
  assert.equal(out.sessions, SAMPLE.length, 'every dialogue of the sample exists');
  assert.deepEqual(out.ops_better, [], `matrix is worse than ops in: ${out.ops_better.join(', ')}`);
});
