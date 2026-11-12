// SPDX-License-Identifier: AGPL-3.0-only
// The Romanian-input tests of the conversation worlds. They used to sit in the worlds' tests.sop with `language=ro`; Romanian does not belong in a world
// (user decision 2026-11-12), so they live here, in tests/fixtures/ro-boundary-world-tests.json, and run through the translator boundary in both reasoners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/ro-boundary-world-tests.json', import.meta.url), 'utf8'));
const statePath = (v, p) => { for (const k of p.split('.')) { if (v == null) return undefined; v = v[k]; } return v; };

for (const reasoner of ['matrix', 'ops']) {
  test(`Romanian input through the translator, conversation worlds (${reasoner})`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), reasoner });
    const sessions = new Map();
    for (const t of CASES) {
      if (t.reasoner && t.reasoner !== reasoner) continue;
      const key = `${t.world}/${t.session}`;
      let s = sessions.get(key);
      if (!s) { s = engine.createSession({ language: 'en' }); sessions.set(key, s); }
      const reply = await s.send(t.input, { language: 'ro' });
      const shown = reply.answers.at(-1)?.text ?? reply.text;
      for (const sub of t.expect ?? []) assert.ok(shown.includes(sub), `${t.id}: expected "${sub}" in "${shown}"`);
      for (const spec of t.expectState ?? []) {
        const m = String(spec).match(/^(?:([\w.]+):)?([^=]+)=(.*)$/);
        const actual = statePath(s.state(m[1] ?? t.world), m[2].trim());
        assert.equal(typeof actual === 'object' && actual !== null ? JSON.stringify(actual) : String(actual), m[3], `${t.id}: state ${m[2]}`);
      }
      if (t.expectStatus) assert.equal(reply.statuses.at(-1), t.expectStatus, `${t.id}: status`);
    }
  });
}
