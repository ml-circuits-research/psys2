// SPDX-License-Identifier: AGPL-3.0-only
// TURN SCOPE (spec 06 "A turn touches only the worlds it addresses"; owner export 2026-11-14 22:43): "deseneaza ceva random" on the Drawing tab changed plan.seating and
// plan.timeline ("{…} (was none)") and sent view effects to their tabs. The cause was a read-only hook (the discourse's referent lookup) creating an empty state for every world it
// asked. Invariant: the worlds a turn changes are the worlds its clauses address, plus the session-wide worlds (session.things, session.dialogue) and the shell (navigation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const SESSION_WIDE = new Set(['session.things', 'session.dialogue', 'ui.shell']);
const TURNS = [
  ['draw', 'Draw something random'], ['draw', 'make the house red'], ['diagram', 'Draw a diagram in house form'], ['seating', 'add a table for 4'],
  ['timeline', 'add an event called launch on monday'], ['draw', 'what is 2 plus 3'], ['talk', 'hello'], ['map', 'show Paris'],
  ['draw', 'show the house in the diagram'], ['chart', 'make a bar chart of 3 4 5'], ['diagram', 'Which shape is the largest?'],
];

test('a turn changes only the worlds it addresses (plus session.things, session.dialogue and the shell), from the first turn of a fresh session on', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  for (const reasoner of [undefined]) {
    const s = engine.createSession({ language: 'en', ...(reasoner ? { reasoner } : {}) });
    for (const [tab, text] of TURNS) {
      s.setWorldState('ui.shell', { activeTab: tab });
      const before = s.state();
      const r = await s.send(text);
      const after = s.state();
      const addressed = new Set(r.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean));
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((w) => JSON.stringify(after[w]) !== JSON.stringify(before[w]));
      const stray = changed.filter((w) => !addressed.has(w) && !SESSION_WIDE.has(w));
      assert.deepEqual(stray, [], `"${text}" on ${tab} (addressed ${[...addressed].join(', ') || 'none'}) changed ${stray.join(', ')}`);
      const views = r.effects.filter((e) => e.name === 'view' || e.name === 'ui.view').map((e) => e.world ?? e.args?.world).filter(Boolean);
      for (const w of views) assert.ok(addressed.has(w) || changed.includes(w) || SESSION_WIDE.has(w), `"${text}": a view effect for ${w}, which the turn did not touch`);
    }
  }
});
