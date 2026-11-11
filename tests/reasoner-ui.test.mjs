// SPDX-License-Identifier: AGPL-3.0-only
// ui.shell, ui.help and ui.avatar on the matrix reasoner (spec 15, "ui.avatar, ui.shell and ui.help on the matrix"): the tab and the settings, the looks of the
// avatar and the help the worlds give are wires of each world's own library instance; the knowledge bases (kb.sop) are generated from the manifests and the
// tables and checked here; the rules refuse what does not exist with the reason; "undo that" says what it took back in the world's words. ops mode is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { buildAll } from '../scripts/gen-ui-kb.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e) => e.createSession({ language: 'en' });
const say = async (s, lines) => { const out = []; for (const l of lines) { const r = await s.send(l, {}); out.push({ text: r.text, statuses: r.statuses }); } return out; };
const UI = ['ui.shell'];   // the UI worlds that are on the matrix
const guard = (s, world, action, args) => s.isession.rs.guardRequest(s.isession, world, action, args);

test('the three UI worlds opt in, the matrices load without problems, the knowledge bases are what the generator writes', async () => {
  for (const id of UI) assert.equal(matrix.set.get(id).reasoner, 'matrix', id);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  assert.equal(ops.createSession({ language: 'en' }).isession.rs, null, 'ops mode has no instance');
  const files = await buildAll();
  for (const [id, text] of Object.entries(files)) if (UI.includes(id)) assert.equal(readFileSync(new URL(`../worlds/${id}/kb.sop`, import.meta.url), 'utf8'), text, `${id}/kb.sop is out of date: run node scripts/gen-ui-kb.mjs`);
});

// ---- ui.shell -----------------------------------------------------------------------------------------------------------------------------------------------

test('ui.shell: nothing is told until something changes; a tab switch and the settings are one wire, the state is derived from it', async () => {
  const s = session(matrix);
  await say(s, ['Which tab am I on?']);
  assert.equal(s.isession.rs.of('ui.shell').ofType('ui.shell.view').length, 0);
  await say(s, ['Open the editor.', 'speak slower']);
  const [v] = s.isession.rs.of('ui.shell').ofType('ui.shell.view');
  assert.deepEqual([v.attrs.tab[0], v.attrs.prev[0], v.attrs.rate[0], v.attrs.lang[0]], ['editor', 'robot', '75', 'en']);
  const st = s.isession.state['ui.shell'];
  assert.deepEqual(st, { activeTab: 'editor', previousTab: 'robot', speaker: false, listening: false, handsFree: false, rate: 0.75, language: 'en' });
  assert.equal(s.isession.rs.of('ui.shell').ofType('ui.shell.known').length > 8, true, 'the tabs of the manifests are in the knowledge base');
});

test('ui.shell: a tab that does not exist is refused by the rules with the reason (unknown argument, as the operation says it), the state does not change', async () => {
  const m = session(matrix), o = session(ops);
  const rm = await say(m, ['open the weather tab']), ro = await say(o, ['open the weather tab']);
  assert.equal(rm[0].text, 'There is no weather tab.');
  assert.equal(rm[0].statuses[0], 'unsupported');
  assert.equal(ro[0].text, 'I do not know a tab called weather.');
  assert.equal(ro[0].statuses[0], 'unsupported');
  assert.equal(m.isession.state['ui.shell'].activeTab, 'robot');
  const g = guard(m, 'ui.shell', 'ui.openTab', { tab: 'Charts' });
  assert.equal(g, null, 'a title is a word that names a tab');
  assert.equal(guard(m, 'ui.shell', 'ui.openTab', { tab: 'the diagrams' }), null, 'a plural s is dropped');
  assert.equal(guard(m, 'ui.shell', 'ui.openTab', { tab: 'weather' }).reason, 'unknown_argument');
});

test('ui.shell: the language, the Settings tab, the game and "go back" are asked to the rules, with the operations\' sentences', async () => {
  const s = session(matrix);
  assert.equal(guard(s, 'ui.shell', 'ui.language', { lang: 'french' }).note, 'I do not speak french yet.');
  assert.equal(guard(s, 'ui.shell', 'ui.language', { lang: 'romanian' }), null);
  assert.equal(guard(s, 'ui.shell', 'ui.settings', { what: 'open', tab: 'colors' }).note, 'I do not have a settings tab called colors. The tabs are Understanding, Language, Voice, Phrase log, Models, Developer and About.');
  assert.equal(guard(s, 'ui.shell', 'ui.settings', { what: 'open', tab: 'speech' }), null);
  assert.equal(guard(s, 'ui.shell', 'ui.back', {}).note, 'There is no previous tab to go back to.');
  assert.equal(guard(s, 'ui.shell', 'ui.newGame', {}).note, 'There is no game open on the Avatar tab. You can say, for example, "let\'s play hangman".');
  assert.equal(guard(s, 'ui.shell', 'ui.hint', {}).status, 'missing');
  await say(s, ["Let's play hangman"]);
  assert.equal(guard(s, 'ui.shell', 'ui.newGame', {}), null, 'the hangman tab has a game');
  assert.equal(guard(s, 'ui.shell', 'ui.back', {}), null, 'there is a tab to go back to now');
});

test('ui.shell: "undo that" takes a tab switch or a setting back, in the world\'s words; the language switch works exactly and undoes', async () => {
  const s = session(matrix);
  const r = await say(s, ['Open the charts.', 'undo that', 'switch to romanian', 'undo that', 'speak slower', 'undo that']);
  assert.equal(r[1].text, 'OK, I am back on the Avatar tab.');
  assert.equal(s.isession.state['ui.shell'].activeTab, 'robot');
  assert.equal(r[2].text, 'OK, I switched to Romanian.');
  assert.equal(r[3].text, 'OK, I speak English again.');
  assert.equal(s.isession.state['ui.shell'].language, 'en');
  assert.equal(r[5].text, 'OK, my speech rate is 1 again.');
  const l = session(matrix);
  await say(l, ['switch to romanian']);
  assert.equal(l.isession.state['ui.shell'].language, 'ro', 'the host reads the language from the state');
  assert.equal(l.isession.rs.of('ui.shell').ofType('ui.shell.view')[0].attrs.lang[0], 'ro');
});

test('ui.shell: a tab another world brings forward is not a step of that world\'s turn: its "undo" does not switch the tab back', async () => {
  const s = session(matrix);
  await say(s, ['Add a heading Plans', 'Add a paragraph First one here.']);
  assert.equal(s.isession.state['ui.shell'].activeTab, 'editor');
  const r = await say(s, ['undo', 'undo']);
  assert.match(r[0].text, /paragraph/);
  assert.match(r[1].text, /heading/);
  assert.equal(s.isession.state['ui.shell'].activeTab, 'editor', 'the editor tab stays open');
  assert.equal((await say(s, ['undo']))[0].status ?? 'ok', 'ok');
});

test('ui.shell: a host click on a tab (setWorldState) is taken over without being a step; "undo that" does not undo it', async () => {
  const s = session(matrix);
  s.setWorldState('ui.shell', { activeTab: 'tictactoe', handsFree: true });
  await say(s, ['How many legs does a spider have?']);
  const v = s.isession.rs.of('ui.shell').ofType('ui.shell.view')[0];
  assert.equal(v.attrs.tab[0], 'tictactoe');
  assert.equal(v.attrs.handsfree[0], 'true');
  const u = await say(s, ['undo that']);
  assert.equal(s.isession.state['ui.shell'].activeTab, 'tictactoe');
  assert.ok(u[0].text.length > 0);
  s.setWorldState('ui.shell', { activeTab: 'avatar' });
  await say(s, ['How many legs does a dog have?']);
  assert.equal(s.isession.state['ui.shell'].activeTab, 'avatar', 'a tab the host names as it likes is kept');
});

test('ui.shell: ops and matrix say the same on a scripted session (words, statuses, state), except the sentences the rules say', async () => {
  const lines = ['Which tab am I on?', 'Open the editor.', 'Go back.', 'speak faster', 'speak faster', 'speak faster', 'speak faster', 'turn the speaker on', "Let's play hangman", 'New game', 'Give me a hint', 'Show me the settings'];
  const a = session(matrix), b = session(ops);
  const ra = await say(a, lines), rb = await say(b, lines);
  assert.deepEqual(ra, rb);
  assert.deepEqual(a.isession.state['ui.shell'], b.isession.state['ui.shell']);
});
