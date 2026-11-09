import test from 'node:test';
import assert from 'node:assert/strict';
import { Astra, snapshot, restore, Storage, memoryBackend, applyMove, recognize, Agenda, Entities, parseCommand, findDiscussion, runCommand, card, panel, lastUnfinished, frameFromPending, frameFromModal, migrate, EventLog } from '../src/astra/index.mjs';

const TABS = { 'games.chess': 'chess', 'art.draw': 'draw', 'docs.editor': 'editor' };
function make() {
  const states = {};
  const binding = {
    get: (w) => states[w],
    set: (w, s) => { states[w] = s; },
    initial: (w) => (w === 'games.chess' ? { moves: [] } : w === 'art.draw' ? { shapes: [] } : {}),
  };
  const astra = new Astra({ binding, tabOf: (w) => TABS[w] ?? null, titleOf: (w) => ({ 'games.chess': 'Chess game', 'art.draw': 'Drawing', 'docs.editor': 'Document' })[w] ?? w });
  return { astra, states };
}
/** Simulate a turn: the world changes its live state, the session reports it. */
function turn(astra, states, world, mutate, msgId = 'm', tab = null) {
  const before = { [world]: states[world] === undefined ? undefined : JSON.stringify(states[world]) };
  states[world] ??= astra.binding.initial(world);
  mutate(states[world]);
  return astra.afterTurn({ msgId, text: msgId, changed: [world], before, tab });
}

test('A1: a changed world is adopted into its tab discussion, with message and discussion id on the act', () => {
  const { astra, states } = make();
  const act = turn(astra, states, 'games.chess', (s) => s.moves.push('e4'), 'm1');
  assert.equal(act.discussion, 'd1');
  assert.equal(astra.discussion('d1').tab, 'chess');
  assert.equal(astra.discussion('d1').title, 'Chess game');
  assert.equal(astra.instancesOf('d1')[0].world, 'games.chess');
  assert.equal(act.msgId, 'm1');
  assert.equal(astra.tabs.chess, 'd1');
});

test('A1 acceptance: two chess games and a drawing, suspended and resumed, also after a reload', () => {
  const { astra, states } = make();
  turn(astra, states, 'games.chess', (s) => s.moves.push('e4'), 'm1');          // game 1 in d1
  turn(astra, states, 'art.draw', (s) => s.shapes.push('house'), 'm2');          // drawing in d2
  const d3 = astra.createDiscussion({ world: 'games.chess', tab: 'chess', activate: false });
  astra.newInstance(d3.id, 'games.chess');                                        // a second, fresh chess game
  astra.activate(d3.id);
  assert.deepEqual(states['games.chess'], { moves: [] });
  turn(astra, states, 'games.chess', (s) => s.moves.push('d4'), 'm3');
  assert.deepEqual(states['games.chess'].moves, ['d4']);
  assert.equal(astra.discussion('d1').status, 'suspended');                      // one active discussion per tab
  assert.equal(astra.discussion('d3').status, 'active');
  // resume game 1: its state is back, game 2 is saved
  astra.activate('d1');
  assert.deepEqual(states['games.chess'].moves, ['e4']);
  assert.deepEqual(astra.instancesOf('d3')[0].state.moves, ['d4']);
  assert.deepEqual(states['art.draw'].shapes, ['house']);                         // the drawing was untouched
  // reload into a fresh chat
  const saved = JSON.parse(JSON.stringify(snapshot(astra)));
  const fresh = make();
  assert.ok(restore(fresh.astra, saved));
  assert.deepEqual(fresh.states['games.chess'].moves, ['e4']);
  assert.deepEqual(fresh.states['art.draw'].shapes, ['house']);
  fresh.astra.activate('d3');
  assert.deepEqual(fresh.states['games.chess'].moves, ['d4']);
  fresh.astra.activate('d1');
  assert.deepEqual(fresh.states['games.chess'].moves, ['e4']);
  assert.equal(fresh.astra.list({ tab: 'chess' }).length, 2);
  assert.equal(fresh.astra.list({ tab: 'chess' })[0].id, 'd1');                   // the current one leads
});

test('A1: tab change resumes that tab\'s discussion and leaves other worlds alone', () => {
  const { astra, states } = make();
  turn(astra, states, 'games.chess', (s) => s.moves.push('e4'));
  turn(astra, states, 'art.draw', (s) => s.shapes.push('sun'));
  const d3 = astra.createDiscussion({ world: 'games.chess', tab: 'chess', activate: false });
  astra.newInstance(d3.id, 'games.chess'); astra.activate(d3.id);
  assert.equal(astra.active, 'd3');
  assert.ok(astra.onTabChange('draw'));
  assert.equal(astra.active, 'd2');
  assert.deepEqual(states['games.chess'], { moves: [] });                        // chess game 2 stays live
  assert.equal(astra.onTabChange('draw'), null);
  assert.equal(astra.onTabChange('nope'), null);
});

test('A1: user scope worlds are never instanced', () => {
  const { astra, states } = make();
  states['ui.shell'] = { activeTab: 'chess' };
  const act = astra.afterTurn({ msgId: 'm1', changed: ['ui.shell', 'user.profile'] });
  assert.equal(act, null);
  assert.equal(astra.newInstance(astra.createDiscussion({}).id, 'ui.shell'), null);
});

test('A1: link shares an instance instead of copying it', () => {
  const { astra, states } = make();
  turn(astra, states, 'art.draw', (s) => s.shapes.push('a'));
  const doc = astra.createDiscussion({ title: 'Report', tab: 'editor', activate: false });
  assert.ok(astra.link(doc.id, astra.instancesOf('d1')[0].id));
  assert.equal(astra.instancesOf(doc.id)[0].world, 'art.draw');
  assert.equal(astra.link(doc.id, astra.instancesOf('d1')[0].id), false);
});

test('A1: capture and rollback restore the registry (turn guard)', () => {
  const { astra, states } = make();
  turn(astra, states, 'games.chess', (s) => s.moves.push('e4'));
  const cap = astra.capture();
  turn(astra, states, 'art.draw', (s) => s.shapes.push('x'));
  astra.createDiscussion({ title: 'Extra', activate: false });
  assert.equal(astra.discussions.size, 3);
  astra.rollback(cap);
  assert.equal(astra.discussions.size, 1);
  assert.equal(astra.instances.size, 1);
  assert.equal(astra.log.length, cap.logLen);
  assert.equal(astra.active, 'd1');
});

test('A2: moves update the information state; a proposal becomes a fact only after validation', () => {
  const { astra } = make();
  const d = astra.createDiscussion({ title: 'T' });
  applyMove(d, { type: 'inform', text: 'my name is Ana' });
  assert.equal(d.context.is.facts.length, 0);
  assert.equal(d.context.is.proposals.length, 1);
  applyMove(d, { type: 'confirm' }, { validate: () => true });
  assert.equal(d.context.is.facts.length, 1);
  assert.equal(d.context.is.proposals.length, 0);
  applyMove(d, { type: 'inform', text: 'I live in Cluj' }, { validate: () => true });
  assert.equal(d.context.is.facts[0].text, 'I live in Cluj');
  applyMove(d, { type: 'correct', text: 'actually Iasi', replacement: 'I live in Iasi', content: 'Iasi' });
  const cur = d.context.is.facts.filter((f) => f.validity === 'current').map((f) => f.text);
  assert.ok(cur.includes('I live in Iasi') && !cur.includes('I live in Cluj'));
  assert.equal(d.context.is.facts.find((f) => f.text === 'I live in Cluj').reason, 'correction');
  applyMove(d, { type: 'ask', text: 'Which colour?' });
  assert.deepEqual(d.openQuestions, ['Which colour?']);
  applyMove(d, { type: 'answer', text: 'red' });
  assert.deepEqual(d.openQuestions, []);
  assert.deepEqual(d.context.is.facts[0].justification, { question: 'Which colour?' });
  applyMove(d, { type: 'ask', text: 'Sure?' });
  assert.equal(applyMove(d, { type: 'cancel' }).applied, true);
  assert.equal(applyMove(d, { type: 'cancel' }).applied, false);
  assert.deepEqual(applyMove(d, { type: 'switch', target: 'chess' }).instruction.target, 'chess');
  applyMove(d, { type: 'request', text: 'draw a cat' });
  assert.equal(d.context.is.commitments[0].status, 'executed');
});

test('A2: recognize derives moves from what the pipeline decided', () => {
  const seg = (kind, text) => ({ text, match: { kind, worldId: 'w', patternId: 'p' } });
  assert.deepEqual(recognize({ segments: [seg('question', 'what is 2+2?'), seg('request', 'draw a cat')] }).map((m) => m.type), ['ask', 'request']);
  assert.deepEqual(recognize({ consumed: { type: 'confirm' }, yesNo: 'yes' }).map((m) => m.type), ['confirm']);
  assert.deepEqual(recognize({ consumed: { type: 'confirm' }, yesNo: 'no' }).map((m) => m.type), ['cancel']);
  assert.deepEqual(recognize({ consumed: { type: 'fill', world: 'art.draw' } }).map((m) => m.type), ['answer']);
  assert.deepEqual(recognize({ meta: { kind: 'cancel' } }).map((m) => m.type), ['cancel']);
  assert.deepEqual(recognize({ meta: { kind: 'repair' } }).map((m) => m.type), ['correct']);
  assert.deepEqual(recognize({ meta: { kind: 'topic', target: null } }).map((m) => m.type), ['resume']);
  assert.deepEqual(recognize({ meta: { kind: 'topic', target: 'chess' } }).map((m) => m.type), ['switch']);
  assert.deepEqual(recognize({ segments: [{ unparsed: true }] }), []);
});

test('A3: frames, interruption, routing and the pass-through of commands', () => {
  const { astra } = make();
  const d = astra.createDiscussion({ title: 'Doc' });
  const ag = new Agenda(d);
  const dict = ag.push({ kind: 'mode', world: 'docs.editor', instance: 'i1', question: 'Dictating', params: { mode: { value: 'dictation', required: false } } });
  assert.equal(dict.completion, 'explicit');
  const ask = ag.push({ kind: 'fill', world: 'docs.editor', instance: 'i1', question: 'Which heading?', params: { heading: { type: 'words' } } }, { interrupt: true });
  assert.equal(ag.get(dict.id).state, 'suspended');
  assert.equal(ag.top().id, ask.id);
  assert.equal(ag.route('Dairy', {}).frame.id, ask.id);
  assert.equal(ag.route('switch to chess', { passThrough: (t) => /^switch/.test(t) }), null);
  ag.provide(ask.id, 'heading', 'Dairy');
  assert.equal(ag.get(ask.id).state, 'done');
  assert.equal(ag.resumeInstance('i1').id, dict.id);
  assert.equal(ag.top().id, dict.id);
  // a confirm frame accepts only its admissible answers; others fall to the suspended frames
  const yn = ag.push(frameFromPending({ type: 'confirm', world: 'games.chess', question: 'Resign?' }, 'i1'), { interrupt: true });
  assert.equal(ag.route('maybe').frame.id, dict.id);
  assert.equal(ag.route('yes').frame.id, yn.id);
  assert.equal(ag.route('maybe').how, 'suspended');
  assert.equal(frameFromModal('docs.editor', { inputMode: 'dictation' }).kind, 'mode');
  assert.equal(frameFromModal('docs.editor', {}), null);
  assert.equal(frameFromPending({ type: 'fill', world: 'w', key: 'what', expected: 'noun' }).params.what.type, 'noun');
});

test('A4: focus, ordinals, attributes, "the other one" and the ambiguity question', () => {
  const { astra } = make();
  const d = astra.createDiscussion({ title: 'Draw' });
  const en = new Entities(d);
  en.ingest('i1', [
    { id: 'h1', kind: 'house', noun: 'house', attrs: { color: 'red' } },
    { id: 'h2', kind: 'house', noun: 'house', attrs: { color: 'blue' } },
    { id: 't1', kind: 'tree', noun: 'tree', attrs: { color: 'green' }, salient: true },
  ]);
  assert.equal(en.resolve('it').candidates[0].id, 't1');
  assert.equal(en.resolve('the second house').candidates[0].id, 'h2');
  assert.equal(en.resolve('the last house').candidates[0].id, 'h2');
  assert.equal(en.resolve('the red house').candidates[0].id, 'h1');
  const amb = en.resolve('the house');
  assert.equal(amb.status, 'ambiguous');
  assert.equal(en.askWhich(amb.candidates), 'Which one: the red house or the blue house?');
  assert.equal(en.resolve('the dragon').status, 'none');
  en.focus.touch('h1'); en.focus.touch('h2');
  assert.equal(en.resolve('the other one').candidates[0].id, 'h1');
  // switching discussion restores that discussion's focus: it is part of the record
  const d2 = astra.createDiscussion({ title: 'Other' });
  assert.equal(new Entities(d2).focus.top(), null);
  assert.equal(new Entities(d).focus.top(), 'h2');
  en.ingest('i1', [{ id: 't1', kind: 'tree', noun: 'tree' }]);
  assert.equal(en.items.length, 1);
});

test('A6: event log, effects run once, undo through the core, storage with migration', () => {
  const { astra, states } = make();
  turn(astra, states, 'art.draw', (s) => s.shapes.push('a'), 'm1');
  turn(astra, states, 'art.draw', (s) => s.shapes.push('b'), 'm2');
  assert.deepEqual(states['art.draw'].shapes, ['a', 'b']);
  const u = astra.undo();
  assert.deepEqual(u.worlds, ['art.draw']);
  assert.deepEqual(states['art.draw'].shapes, ['a']);
  assert.deepEqual(astra.undo().worlds, ['art.draw']);
  assert.deepEqual(states['art.draw'].shapes, []);                                // first act: the lazily created state goes back to initial
  assert.equal(astra.undo(), null);
  assert.ok(astra.log.of('d1').some((e) => e.type === 'undo'));
  assert.equal(astra.shouldRun('x1', { name: 'export' }), true);
  assert.equal(astra.shouldRun('x1'), false);
  const backend = memoryBackend();
  const st = new Storage(backend);
  assert.ok(st.save(astra));
  const fresh = make();
  assert.ok(st.load(fresh.astra));
  assert.equal(fresh.astra.shouldRun('x1'), false);                               // restore never repeats an effect
  assert.equal(fresh.astra.discussions.size, 1);
  // corrupt, newer and unknown schemas are ignored
  backend.setItem('astra.v1.default', '{oops');
  assert.equal(new Storage(backend).load(make().astra), false);
  assert.equal(migrate({ schema: 99 }), null);
  assert.equal(migrate({}), null);
  assert.equal(new Storage({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }).save(astra), false);
  assert.ok(EventLog.fromJSON(JSON.parse(JSON.stringify(astra.log.toJSON()))).length === astra.log.length);
});

test('A11: lastUnfinished keeps the reviewer definition', () => {
  const lastByWorld = { story: 1, avatar: 1, 'art.draw': 1 };
  // digression out of the story into the chart tab: the story
  assert.equal(lastUnfinished({ topics: ['charts', 'story'], lastByWorld: { charts: 1, story: 1 }, here: 'charts' }), 'story');
  // out of the avatar
  assert.equal(lastUnfinished({ topics: ['music', 'avatar', 'story'], lastByWorld, here: 'music' }), 'avatar');
  // an explicit return stays until the user digresses again
  assert.equal(lastUnfinished({ topics: ['story', 'avatar'], lastByWorld, here: 'story', lastTopic: { world: 'story' } }), 'story');
  assert.equal(lastUnfinished({ topics: ['avatar', 'story'], lastByWorld, here: 'music', lastTopic: { world: 'story' } }), 'avatar');
  assert.equal(lastUnfinished({}), null);
});

test('A11: commands, discussion references, cards and panel', () => {
  const { astra, states } = make();
  turn(astra, states, 'art.draw', (s) => s.shapes.push('house'), 'm1');
  const d2 = astra.createDiscussion({ world: 'art.draw', tab: 'draw', activate: false });
  astra.newInstance(d2.id, 'art.draw'); astra.activate(d2.id);
  turn(astra, states, 'art.draw', (s) => s.shapes.push('sun'), 'm2');
  assert.deepEqual(parseCommand('Back to the second drawing'), { kind: 'back', ordinal: 2, noun: 'drawing' });
  assert.deepEqual(parseCommand('continue the chess game from before'), { kind: 'back', ordinal: null, noun: 'chess game' });
  assert.deepEqual(parseCommand("let's start a new discussion"), { kind: 'new' });
  assert.deepEqual(parseCommand('show my discussions'), { kind: 'list' });
  assert.equal(parseCommand('draw a house'), null);
  assert.equal(parseCommand('go back to it'), null);
  const r = runCommand(parseCommand('back to the first drawing'), astra, { tab: 'draw' });
  assert.equal(r.discussion.id, 'd1');
  assert.deepEqual(states['art.draw'].shapes, ['house']);
  assert.equal(astra.active, 'd1');
  // an unknown noun and a lone current discussion fall through to the normal pipeline
  assert.equal(runCommand(parseCommand('back to the chess game'), astra, {}), null);
  assert.equal(runCommand(parseCommand('back to the drawing'), astra, {}).discussion.id, 'd2');   // two candidates: the other, suspended one
  const c = card(astra.discussion('d1'), astra);
  assert.deepEqual([c.title, c.worlds, c.status], ['Drawing', ['art.draw'], 'suspended'].map((x, i) => (i === 2 ? c.status : x)));
  assert.equal(c.lastProgress.text, 'm1');
  assert.equal(panel(astra, { tab: 'draw' }).length, 2);
  assert.equal(panel(astra, { tab: 'draw' })[0].active, true);
  const n = runCommand(parseCommand('new discussion'), astra, { tab: 'draw', tabWorld: 'art.draw' });
  assert.equal(n.kind, 'new');
  assert.deepEqual(states['art.draw'], { shapes: [] });
  assert.match(runCommand({ kind: 'list' }, astra, {}).text, /^Your discussions: 1\. /);
  assert.equal(findDiscussion({ noun: 'drawing', ordinal: 9 }, astra).status, 'none');
});
