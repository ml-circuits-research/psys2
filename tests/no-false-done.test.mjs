// THE HARD GATE (reviewer 2026-11-16 10:20, item 1): through Session.send, over the bound acts of Drawing, Diagram, Documents and the avatar, a reply that says something changed
// (I moved / I added / ...) is produced only when the world's real state changed; otherwise the reply says nothing changed. A property over short sessions per tab, including the
// owner's false "done" of 2026-11-16 (T17: "move it to the lake" said "I moved the bird to the lake." with the state unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { contentOf, verifyRun } from '../src/dialog/verify-run.mjs';
import { CLAIMS } from '../scripts/owner-session.mjs';

const META = new Set(['ui.shell', 'ui.help', 'talk', 'conversation', 'kids.common']);
const SESSIONS = {
  draw: ['draw a landscape with a lake and a house', 'add a green duck', 'move it to the lake', 'move the house down', 'down', 'move the flowers down', 'down', 'move the birds near the lake', 'put a swing', 'put a child on the swing', 'change the colour of the bird to yellow', 'move the house over water', 'delete the house', 'undo'],
  diagram: ['draw a flowchart with five steps', 'make it bigger', 'move the first step up', 'remove the last step', 'add arrows', 'make it prettier', 'undo'],
  editor: ['write a short letter about a fox', 'longer', 'shorter', 'longer', 'undo', 'write a story about a fox'],
  avatar: ['make the avatar a man', 'look sad', 'become a boy', 'become a bearded man', 'become a boy'],
};

for (const [tab, lines] of Object.entries(SESSIONS)) {
  test(`${tab}: a reply that claims a change comes with a change of the state`, async () => {
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
    const s = engine.createSession({ language: 'en', formalizer: 'rules', spell: true, partial: true, bestEffort: true });
    s.setWorldState('ui.shell', { activeTab: tab === 'avatar' ? 'draw' : tab });
    for (const said of lines) {
      const before = s.state();
      const b = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, contentOf(v)]));
      const r = await s.send(said);
      const after = s.state();
      const changed = Object.keys(after).some((w) => !META.has(w) && contentOf(after[w]) !== (b[w] ?? contentOf(undefined)));
      assert.ok(changed || !CLAIMS.test(r.text), `false done after "${said}": "${r.text}" with the state unchanged`);
    }
  });
}

test('verifyRun: an entry the state does not confirm is dropped; with none confirmed the run is a refusal', () => {
  const diff = { added: [], removed: [], changed: [{ id: 'o1', kind: 'bird', key: 'place', from: 'corner', to: 'lake' }, { id: 'o2', kind: 'bird', key: 'place', from: 'corner', to: 'lake' }] };
  const before = { objects: [{ id: 'o1', x: 1 }, { id: 'o2', x: 1 }] };
  const some = verifyRun({ ok: true, diff }, before, { objects: [{ id: 'o1', x: 1 }, { id: 'o2', x: 9 }] });
  assert.equal(some.run.diff.changed.length, 1);
  const none = verifyRun({ ok: true, diff }, before, { objects: [{ id: 'o1', x: 1 }, { id: 'o2', x: 1 }] });
  assert.equal(none.run.ok, false);
  assert.equal(none.run.failed.reply, 'refused.unchanged');
});
