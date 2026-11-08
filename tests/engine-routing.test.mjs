// Engine improvements (spec 03 section 4 and 2): game controls emit the active game's action, tab-only patterns, specificity,
// bare tempo words, the `cap` emit filter and four-word lexicon entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createRouter, emptyContext, clearlyMoreSpecific, effectivePriority, specificity } from '../src/formalizer/routing.mjs';
import { formalize, FormSession } from '../src/formalizer/index.mjs';
import { bundleSet, mini } from './helpers.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

/** Wires' request actions of `text` formalized on `tab` (null = no tab state). */
async function actionsOn(tab, text) {
  const s = engine.createSession();
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  const r = await s.send(text);
  return { r, actions: r.wires.filter((w) => w.type === 'core.request').map((w) => w.entries.find((e) => e.key === 'core.request.action')?.value.v) };
}

// ---- 1. Q5: game controls emit the active game's own action on a game tab, the shell form elsewhere
const GAMES = [
  { tab: 'tictactoe', new: 'ttt.new', hint: 'ttt.hint', giveUp: 'ttt.giveup' },
  { tab: 'hangman', new: 'hm.new', hint: 'hm.hint', giveUp: 'hm.giveup' },
  { tab: 'chess', new: 'chess.new', hint: 'chess.hint', giveUp: 'chess.resign' },
  { tab: 'guess', new: 'guess.start', hint: 'guess.hint', giveUp: 'guess.giveup' },
];
const PHRASES = { new: ['New game.', 'Play again.'], hint: ['Give me a hint.', 'Hint please.'], giveUp: ['I give up.', 'Quit the game.'] };
const SHELL = { new: 'ui.newGame', hint: 'ui.hint', giveUp: 'ui.giveUp' };

for (const g of GAMES) {
  test(`game controls on the ${g.tab} tab emit the game's own actions`, async () => {
    for (const control of ['new', 'hint', 'giveUp']) {
      for (const text of PHRASES[control]) {
        const { actions, r } = await actionsOn(g.tab, text);
        assert.deepEqual(actions, [g[control]], `${g.tab}: "${text}" -> ${actions}`);
        assert.ok(!actions.some((a) => a.startsWith('ui.')), 'no shell form on a game tab');
        assert.equal(r.trace.routing[0].tier, 3);
      }
    }
  });
}

test('off a game tab the shell form of the game controls stays', async () => {
  for (const tab of ['robot', 'draw', 'music', 'documents', null]) {
    for (const control of ['new', 'hint', 'giveUp']) {
      const text = PHRASES[control][0];
      const { actions } = await actionsOn(tab, text);
      // another world may claim "Give me a hint." off the tab (a game world), but the shell wires must never be game actions
      if (actions[0]?.startsWith('ui.')) assert.equal(actions[0], SHELL[control], `${tab}: ${text}`);
    }
  }
  assert.deepEqual((await actionsOn('robot', 'I give up.')).actions, ['ui.giveUp']);
  assert.deepEqual((await actionsOn('draw', 'New game.')).actions, ['ui.newGame']);
  assert.deepEqual((await actionsOn(null, 'Quit the game.')).actions, ['ui.giveUp']);
});

test('chess declares its undo action for the game controls (tabUndo)', () => {
  assert.equal(engine.set.get('games.chess').gameControls.undo, 'chess.undo');
  assert.equal(engine.set.get('games.tictactoe').gameControls.giveUp, 'ttt.giveup');
});

// ---- 2. tab-only patterns and tab-only priority
const cand = (world, id, { priority = 10, literals = 1, skips = 0, slots = {}, emit = '', order = 0, tabOnly = false, tabPriority = null } = {}) =>
  ({ pattern: { id, worldId: world, priority, emit, tabOnly, tabPriority }, literals, skips, slots, order });
const route = (matches, context) => createRouter().route({ matches, context: { ...emptyContext(), ...context }, scores: [] });

test('a tabOnly pattern is ignored unless its world owns the active tab', () => {
  const only = cand('games.chess', 'newGame', { priority: 12, tabOnly: true });
  const other = cand('kids.common', 'x', { priority: 8 });
  assert.equal(route([only, other], { tabWorld: 'media.music' }).matches.length, 1);
  assert.equal(route([only, other], {}).decision.winner.patternId, 'x');
  assert.equal(route([only, other], { tabWorld: 'games.chess' }).decision.winner.patternId, 'newGame');
});

test('tabPriority raises the priority only while the world owns the tab', () => {
  const g = cand('games.chess', 'hint', { priority: 8, tabPriority: 14 });
  const o = cand('games.guess', 'hint', { priority: 12 });
  assert.equal(effectivePriority(g, { tabWorld: 'games.chess' }), 14);
  assert.equal(effectivePriority(g, { tabWorld: 'media.music' }), 8);
  assert.equal(route([o, g], { recentWorlds: [] }).decision.winner.patternId, 'hint');
  assert.equal(route([g, o], {}).decision.winner.worldId, 'games.guess');
  assert.equal(route([g, o], { tabWorld: 'games.chess' }).decision.winner.worldId, 'games.chess');
});

test('pattern files declare tabOnly and tabPriority (inline world, formalizer level)', async () => {
  const pa = '@pat.x.a.reset core.pattern\n    match="reset everything"\n    emit="@{_} core.request action=x.reset"\n    kind=request\n    priority=12\n    tabOnly=true\n    example="reset everything"\n';
  const pb = '@pat.x.b.reset core.pattern\n    match="reset everything"\n    emit="@{_} core.request action=y.reset"\n    kind=request\n    priority=9\n    example="reset everything"\n';
  const set = await bundleSet({ 'x.a': mini('x.a', { files: { 'patterns.sop': pa } }), 'x.b': mini('x.b', { files: { 'patterns.sop': pb } }) });
  const run = (context) => formalize('reset everything', { worlds: set, session: new FormSession(), context }).segments[0].match?.patternId;
  assert.equal(run({ tabWorld: 'x.a' }), 'pat.x.a.reset');
  assert.equal(run({ tabWorld: 'x.b' }), 'pat.x.b.reset');
  assert.equal(run({}), 'pat.x.b.reset');
});

// ---- 3. specificity
test('a specific zero-wildcard match beats a catch-all of the active tab (priority or two more literals)', () => {
  const catchAll = cand('ui.avatar', 'letUs', { priority: 8, literals: 2, skips: 3, slots: { r: { class: 'rest', tokens: [2, 5] } } });
  const specific = cand('games.tictactoe', 'level', { priority: 14, literals: 2 });
  assert.ok(clearlyMoreSpecific(specific, catchAll));
  const out = route([catchAll, specific], { tabWorld: 'ui.avatar', activeTab: 'robot' });
  assert.equal(out.decision.winner.patternId, 'level');
  assert.equal(out.decision.tier, 3);
  assert.ok(specificity(specific) > specificity(catchAll));
});

test('a lower-priority literal match of another world does not steal from the tab catch-all', () => {
  const catchAll = cand('docs.reader', 'count', { priority: 12, literals: 2, skips: 3, slots: { r: { class: 'words', tokens: [2, 5] } } });
  const literal = cand('kids.arith', 'countWords', { priority: 10, literals: 4 });
  assert.ok(!clearlyMoreSpecific(literal, catchAll));
  assert.equal(route([literal, catchAll], { tabWorld: 'docs.reader' }).decision.winner.patternId, 'count');
});

test('a catch-all of another world never beats a specific match of the active tab', () => {
  const tab = cand('games.tictactoe', 'level', { priority: 8, literals: 3 });
  const wild = cand('ui.avatar', 'letUs', { priority: 14, literals: 1, skips: 6, slots: { r: { class: 'rest', tokens: [1, 7] } } });
  assert.ok(!clearlyMoreSpecific(wild, tab));
  assert.equal(route([wild, tab], { tabWorld: 'games.tictactoe' }).decision.winner.patternId, 'level');
});

test('integration: "let us play level three" on the robot tab reads as a game level, not as chat', async () => {
  const { r } = await actionsOn('robot', 'let us play level three');
  assert.notEqual(r.trace.routing[0].winner.worldId, 'ui.avatar');
});

// ---- 4. bare tempo words yield to the music world
test('"faster" and "slower" go to music on the music tab or when music answered last, to the shell otherwise', async () => {
  for (const w of ['faster', 'slower']) {
    const { r } = await actionsOn('music', w);
    assert.equal(r.trace.routing[0].winner.worldId, 'media.music', w);
    const s = engine.createSession();
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    await s.send('play a c e');
    const r2 = await s.send(w);
    assert.equal(r2.trace.routing[0].winner.worldId, 'media.music', `recent: ${w}`);
    assert.equal((await actionsOn('robot', w)).r.trace.routing[0].winner.worldId, 'ui.shell');
    assert.equal((await actionsOn(null, w)).r.trace.routing[0].winner.worldId, 'ui.shell');
  }
});

test('"Speak slower" stays a speech-rate command on the music tab (not bare)', async () => {
  const { actions, r } = await actionsOn('music', 'Speak a little slower');
  assert.equal(r.trace.routing[0].winner.worldId, 'ui.shell');
  assert.deepEqual(actions, ['ui.rate']);
});

test('the priority of the bare tempo words is unchanged', () => {
  const p = engine.set.get('ui.shell').patterns.find((x) => x.id === 'pat.ui.shell.rate.fast2');
  assert.equal(p.priority, 10);
});

// ---- 5. emit filter cap
test('emit filter {n|cap} capitalizes stored names ("my name is zed" -> "Zed")', async () => {
  const s = engine.createSession();
  const out = await s.send('my name is zed');
  const meet = out.wires.find((w) => w.type === 'core.request');
  assert.equal(meet.entries.find((e) => e.key.endsWith('arg.name')).value.v, 'Zed');
  assert.match(out.text, /Zed/);
  const set = await bundleSet({ 'x.n': mini('x.n', { files: { 'patterns.sop': '@pat.x.n.me core.pattern\n    match="call me {n:word}"\n    emit="@{_} core.request action=x.meet arg.name=\\"{n|cap}\\""\n    kind=request\n    example="call me ann"\n' } }) });
  const w = formalize('call me mary ann', { worlds: set, session: new FormSession() });
  assert.ok(w.segments[0].unparsed);
  const w2 = formalize('call me ann', { worlds: set, session: new FormSession() });
  assert.equal(w2.wires[0].entries.find((e) => e.key.endsWith('arg.name')).value.v, 'Ann');
});

test('an unknown emit filter is a pattern error', async () => {
  const set = await bundleSet({ 'x.n': mini('x.n', { files: { 'patterns.sop': '@pat.x.n.me core.pattern\n    match="call me {n:word}"\n    emit="@{_} core.request action=x.meet arg.name=\\"{n|shout}\\""\n    kind=request\n    example="call me ann"\n' } }) });
  const w = formalize('call me ann', { worlds: set, session: new FormSession() });
  assert.ok(w.segments[0].unparsed);
  assert.match(w.segments[0].errors.join(' '), /unknown emit filter/);
});

// ---- 6. multi-word lexicon entries up to four words
test('a lexicon slot captures an entry of four words (song titles)', async () => {
  const lex = '@lex.x.t.songs core.lexicon\n    class=noun\n    word=twinkle_twinkle_little_star\n    word=happy_birthday\n';
  const pat = '@pat.x.t.sing core.pattern\n    match="sing {s:lex.x.t.songs}"\n    emit="@{_} core.request action=x.sing arg.song={s}"\n    kind=request\n    example="sing happy birthday"\n';
  const set = await bundleSet({ 'x.t': mini('x.t', { files: { 'lexicon.sop': lex, 'patterns.sop': pat } }) });
  const w = formalize('sing twinkle twinkle little star', { worlds: set, session: new FormSession() });
  assert.ok(!w.segments[0].unparsed, JSON.stringify(w.segments[0].errors));
  assert.equal(w.wires[0].entries.find((e) => e.key.endsWith('arg.song')).value.v, 'twinkle_twinkle_little_star');
  assert.ok(!formalize('sing happy birthday', { worlds: set, session: new FormSession() }).segments[0].unparsed);
});
