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

// LAZY WORLDS (reviewer 2026-11-15 03:15 item 5; live owner check row 2): the page took its "before" snapshot while only the start worlds existed; the turn loaded the others,
// and the what-happened log listed each of them as changed "(was none)" with a view effect. The baseline is the page snapshot plus the loaded worlds as the turn started
// (the worker's `before`, their initial state): only what the turn did counts.
test('the what-happened diff counts a world loaded during the turn from its initial state, not as "(was none)"', async () => {
  const { snapshotState, describeChanges, turnBaseline } = await import('../docs/webchat/ui/state-diff.mjs');
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const START = new Set(['ui.shell', 'art.draw', 'session.things', 'session.dialogue']);   // what a lazy page has before its first turn on the Drawing tab
  const full = s.state();
  const page = snapshotState(Object.fromEntries(Object.entries(full).filter(([id]) => START.has(id))));
  const loaded = Object.fromEntries(Object.entries(full).filter(([id]) => !START.has(id)));
  assert.ok(Object.keys(loaded).length >= 5, 'worlds the turn loads');
  const r = await s.send('Draw something random');
  const after = snapshotState(s.state());
  const addressed = new Set(r.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean));
  const stray = (changes) => changes.map((c) => c.world).filter((w) => !addressed.has(w) && !SESSION_WIDE.has(w));
  assert.ok(stray(describeChanges(page, after)).length >= 5, 'the old baseline (the page snapshot alone) lists the loaded worlds as changed');
  assert.deepEqual(stray(describeChanges(turnBaseline(page, loaded), after)), [], 'the turn baseline lists only what the turn changed');
  assert.ok(describeChanges(turnBaseline(page, loaded), after).some((c) => c.world === 'art.draw'), 'the drawing itself is still listed');
  // a world the page already had keeps the page's state (the worker's copy never overrides it)
  const b = turnBaseline({ 'art.draw': '{"objects":[]}' }, { 'art.draw': { objects: [1] }, 'geo.map': { zoom: 2 } });
  assert.deepEqual(b, { 'art.draw': '{"objects":[]}', 'geo.map': '{"zoom":2}' });
  // a world a background load added AFTER the turn ended (in the page's state by the time the log is written) is not the turn's change either
  const { turnAfter } = await import('../docs/webchat/ui/state-diff.mjs');
  const late = { ...after, 'late.world': '{"notes":[]}' };
  const endIds = Object.keys(s.state());
  assert.deepEqual(stray(describeChanges(turnBaseline(page, loaded), turnAfter(late, turnBaseline(page, loaded), endIds))), [], 'loaded after the turn: not listed');
  assert.equal(turnAfter(late, {}, null), late, 'no end list (an in-page engine): the state as it is');
});
