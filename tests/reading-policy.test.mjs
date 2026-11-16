// SPDX-License-Identifier: AGPL-3.0-only
// Reviewer 2026-11-16 02:30 (Q50; spec 05 "Reading fallback"): the machine translator does not read the request in a language with a rules translator; data, reversible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { machineReads } from '../src/translate/reading-policy.mjs';
import { gatherCandidates } from '../src/translate/candidates.mjs';

test('Romanian is read by the rules chain only; other languages keep the machine reading; a host override puts it back', async () => {
  assert.equal(machineReads('ro'), false);
  assert.equal(machineReads('ro-RO'), false);
  assert.equal(machineReads('de'), true);
  assert.equal(machineReads('ro', { ro: true }), true);
  let asked = 0;
  const translator = { candidatesViaMT: async () => { asked++; return [{ source: 'model', text: 'draw a cat' }]; }, rules: { translate: async () => ({ text: 'draw a cat', unknown: [] }) } };
  const off = await gatherCandidates('deseneaza o pisica', { from: 'ro', translator, machine: machineReads('ro') });
  assert.equal(asked, 0);
  assert.deepEqual(off.map((c) => c.source), ['rules']);
  const on = await gatherCandidates('deseneaza o pisica', { from: 'ro', translator, machine: machineReads('ro', { ro: true }) });
  assert.equal(asked, 1);
  assert.equal(on[0].source, 'model');
});
