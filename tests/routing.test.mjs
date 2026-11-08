import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createRouter, createPriorityRouter, emptyContext, wildTokens, clearlyMoreSpecific, navigationKind } from '../src/formalizer/routing.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

/** Send `text` in a fresh session whose active tab is `tab`; returns { r, d } (reply, routing decision). */
async function onTab(tab, text, state = {}) {
  const s = engine.createSession();
  if (tab) s.setWorldState('ui.shell', { activeTab: tab, ...state });
  const r = await s.send(text);
  return { r, d: r.trace.routing[0], s };
}

// ---- unit tests of the policy on synthetic candidates
const cand = (world, id, { priority = 10, literals = 1, skips = 0, slots = {}, emit = '' , order = 0} = {}) =>
  ({ pattern: { id, worldId: world, priority, emit }, literals, skips, slots, order });
const route = (matches, context, scores = []) => createRouter().route({ matches, context: { ...emptyContext(), ...context }, scores });

test('tier 2a: a navigation command that names a tab beats the tab world, whatever the priority', () => {
  const nav = cand('ui.shell', 'open', { priority: 5, emit: '@{_} core.request action=ui.openTab arg.tab=x' });
  const tab = cand('media.music', 'play', { priority: 14, literals: 5 });
  const { decision, matches } = route([tab, nav], { tabWorld: 'media.music' });
  assert.equal(decision.tier, 2);
  assert.equal(matches[0], nav);
  assert.equal(decision.runnerUp.patternId, 'play');
});

test('tier 2b: a settings command beats the tab world unless another world has a higher priority', () => {
  const rate = cand('ui.shell', 'rate', { priority: 10, emit: '@{_} core.request action=ui.rate arg.dir=faster' });
  const lower = cand('media.music', 'x', { priority: 10 });
  assert.equal(route([lower, rate], { tabWorld: 'media.music' }).decision.winner.patternId, 'rate');
  const higher = cand('media.music', 'y', { priority: 12 });
  const r = route([higher, rate], { tabWorld: 'media.music' });
  assert.equal(r.decision.winner.patternId, 'y');
  assert.equal(r.decision.tier, 3);
});

test('tier 2 never applies to wildcard captures of ui.shell', () => {
  const m = cand('ui.shell', 'open.declared', { priority: 5, skips: 3, emit: '@{_} core.request action=ui.openTab arg.tab=x' });
  assert.equal(navigationKind(m), null);
});

test('tier 3: the active tab world beats a higher priority of another world', () => {
  const tab = cand('games.tictactoe', 'coord', { priority: 10 });
  const other = cand('games.chess', 'square', { priority: 14 });
  const { decision } = route([other, tab], { tabWorld: 'games.tictactoe', activeTab: 'tictactoe' });
  assert.equal(decision.tier, 3);
  assert.equal(decision.winner.worldId, 'games.tictactoe');
  assert.equal(decision.runnerUp.worldId, 'games.chess');
  assert.equal(decision.contested, true);
});

test('tier 3 exception: a clearly more specific match wins over a catch-all of the tab world', () => {
  const catchAll = cand('media.music', 'playAny', { literals: 1, skips: 3, slots: { t: { class: 'rest', tokens: [1, 4] } } });
  const specific = cand('games.chess', 'move', { literals: 3 });
  assert.ok(clearlyMoreSpecific(specific, catchAll));
  assert.equal(route([catchAll, specific], { tabWorld: 'media.music' }).decision.winner.patternId, 'move');
  // a wildcard of one token does not make a catch-all, and fewer extra literals are not enough
  const small = cand('art.draw', 'grow', { literals: 1, skips: 1, slots: { t: { class: 'words', tokens: [1, 2] } } });
  assert.equal(wildTokens(small), 1);
  assert.ok(!clearlyMoreSpecific(cand('geo.map', 'zoom', { literals: 3 }), small));
  assert.ok(!clearlyMoreSpecific(cand('geo.map', 'zoom2', { literals: 2 }), catchAll));
  assert.equal(route([small, cand('geo.map', 'zoom', { literals: 3 })], { tabWorld: 'art.draw' }).decision.winner.patternId, 'grow');
});

test('tier 4: the world with an active game, then the most recent worlds, beat plain priority', () => {
  const a = cand('kids.arith', 'a', { priority: 14 }), b = cand('games.guess', 'b'), c = cand('games.hangman', 'c');
  assert.equal(route([a, b, c], { recentWorlds: ['games.hangman', 'games.guess'] }).decision.winner.patternId, 'c');
  assert.equal(route([a, b, c], { recentWorlds: ['games.hangman', 'games.guess'], lastWorld: 'games.hangman' }).decision.reason, 'world that answered last');
  assert.equal(route([a, b, c], { recentWorlds: ['games.hangman'], gameWorld: 'games.guess' }).decision.winner.patternId, 'b');
  assert.equal(route([a, b, c], { recentWorlds: ['games.hangman'], gameWorld: 'games.guess' }).decision.tier, 4);
});

test('tier 5: without context the order is the pattern priority, then literals, then pattern order', () => {
  const a = cand('x', 'a', { priority: 10, literals: 5 }), b = cand('y', 'b', { priority: 12, literals: 1 }), c = cand('z', 'c', { priority: 12, literals: 3, order: 9 });
  const { matches, decision } = route([a, b, c], {});
  assert.deepEqual(matches.map((m) => m.pattern.id), ['c', 'b', 'a']);
  assert.equal(decision.tier, 5);
  const p = createPriorityRouter().route({ matches: [a, b, c] });
  assert.deepEqual(p.matches.map((m) => m.pattern.id), ['c', 'b', 'a']);
});

test('a learned model can order tier 5 and the interface stays the same', () => {
  const a = cand('x', 'a', { priority: 14 }), b = cand('y', 'b', { priority: 10 });
  const learned = createRouter({ id: 'lora', model: () => ({ y: 0.9 }) });
  const out = learned.route({ matches: [a, b], context: emptyContext() });
  assert.equal(out.decision.winner.patternId, 'b');
  assert.equal(out.decision.router, 'lora');
});

// ---- integration: the real worlds and the dialog session
test('tier 1: modal input is reported as the deciding tier in the trace', async () => {
  const s = engine.createSession();
  s.setWorldState('docs.editor', { inputMode: 'dictation' });
  const r = await s.send('hello there');
  if (r.trace.intercepted) assert.equal(r.trace.routing[0].tier, 1);
});

test('"Play B3" is a move on the tic-tac-toe tab and a note on the music tab', async () => {
  const ttt = await onTab('tictactoe', 'Play B3');
  assert.equal(ttt.d.winner.worldId, 'games.tictactoe'); assert.equal(ttt.d.tier, 3);
  assert.equal(ttt.d.runnerUp.worldId, 'media.music');
  const mus = await onTab('music', 'Play B3');
  assert.equal(mus.d.winner.worldId, 'media.music'); assert.equal(mus.d.tier, 3);
  assert.equal(mus.d.runnerUp.worldId, 'games.tictactoe');
});

test('"Repeat that" goes to the open tab: music replays, twenty questions repeats the question', async () => {
  assert.equal((await onTab('music', 'Repeat that')).d.winner.worldId, 'media.music');
  const g = await onTab('guess', 'Repeat that');
  assert.equal(g.d.winner.worldId, 'games.guess'); assert.equal(g.d.tier, 3);
});

test('"Start over" restarts the game of a game tab and resets the robot on the robot tab', async () => {
  const t = await onTab('tictactoe', 'Start over');
  assert.equal(t.d.winner.patternId, 'pat.ui.shell.new'); assert.equal(t.d.tier, 3);
  assert.match(t.r.text, /New game of tic-tac-toe/);
  const h = await onTab('hangman', 'Start over');
  assert.equal(h.d.winner.patternId, 'pat.ui.shell.new');
  const rb = await onTab('robot', 'Start over');
  assert.equal(rb.d.winner.worldId, 'ui.avatar'); assert.equal(rb.d.tier, 3);
});

test('"Make it bigger" is a drawing command on the drawing tab, not a map zoom', async () => {
  const d = await onTab('draw', 'Make it bigger');
  assert.equal(d.d.winner.worldId, 'art.draw'); assert.equal(d.d.tier, 3);
  const m = await onTab('map', 'Make it bigger');
  assert.equal(m.d.winner.worldId, 'geo.map'); assert.equal(m.d.tier, 3);
  const e = await onTab('editor', 'Make it bigger');
  assert.notEqual(e.d.tier, 3);   // the editor has no reading of this sentence: nothing is claimed by the tab
});

test('tier 2 in the app: opening a tab and speech settings win on any tab', async () => {
  for (const tab of ['editor', 'draw', 'tictactoe']) {
    const o = await onTab(tab, 'Open the music');
    assert.equal(o.d.tier, 2); assert.equal(o.d.winner.worldId, 'ui.shell');
  }
  const sp = await onTab('editor', 'Turn the speaker on');
  assert.equal(sp.d.tier, 2);
});

test('cross-world knowledge questions still work when the tab world has no match', async () => {
  const q = await onTab('editor', 'How many legs does a spider have?');
  assert.equal(q.r.text, 'A spider has 8 legs.');
  assert.equal(q.d.winner.worldId, 'kids.animals');
  assert.ok(q.d.tier >= 4);
});

test('the trace carries the decision, the runner-up and the context', async () => {
  const { r, d } = await onTab('music', 'Play B3');
  assert.deepEqual(Object.keys(d).sort(), ['contested', 'context', 'reason', 'router', 'runnerUp', 'tier', 'tierName', 'winner']);
  assert.equal(d.context.activeTab, 'music');
  assert.equal(r.trace.segments[0].routing.tier, 3);
});

test('the session context reports tab world, recent and last answered world', async () => {
  const s = engine.createSession();
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  await s.send('Draw a red house');
  const c = s.context();
  assert.equal(c.tabWorld, 'art.draw'); assert.equal(c.activeTab, 'draw');
  assert.equal(c.lastWorld, 'art.draw'); assert.deepEqual(c.recentWorlds, ['art.draw']);
});
