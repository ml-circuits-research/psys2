// Shell navigation must not inherit capabilities from another engine composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as shell from '../worlds/ui.shell/ops.mjs';

const context = (worlds) => ({
  worlds: () => worlds, state: shell.initialState(),
  effect() { assert.fail('unexpected view effect'); },
  request() { assert.fail('an unavailable game action must never execute'); },
});
const declared = (id, title, extra = {}) => ({ id: `fixture.${id}`, tab: { id, title, aliases: ['shared area'], ...extra } });

test('alternating engine compositions replaces tabs, aliases and game actions', () => {
  const first = context([declared('alpha', 'Alpha', { new: 'alpha.new', hint: 'alpha.hint', giveUp: 'alpha.stop' })]);
  const second = context([declared('beta', 'Beta')]);
  const references = [shell.TABS, shell.TAB_OF_WORD, shell.GAME_ACTIONS.new];
  try {
    assert.equal(shell.openTab(first, { tab: 'shared area' }).status, 'supported');
    assert.equal(first.state.activeTab, 'alpha');
    assert.equal(shell.GAME_ACTIONS.new.alpha, 'alpha.new');
    assert.equal(shell.openTab(second, { tab: 'shared area' }).status, 'supported');
    assert.equal(second.state.activeTab, 'beta');
    assert.equal(shell.openTab(second, { tab: 'alpha' }).status, 'unsupported');
    assert.equal(shell.playGame(second, { tab: 'alpha' }).status, 'unsupported');
    assert.equal(second.state.activeTab, 'beta');
    for (const actions of Object.values(shell.GAME_ACTIONS)) assert.equal(Object.hasOwn(actions, 'alpha'), false);
    assert.equal(shell.openTab(first, { tab: 'shared area' }).status, 'supported');
    assert.equal(first.state.activeTab, 'alpha');
    assert.equal(Object.hasOwn(shell.TABS, 'beta'), false);
    assert.equal(shell.GAME_ACTIONS.hint.alpha, 'alpha.hint');
    assert.equal(shell.GAME_ACTIONS.giveUp.alpha, 'alpha.stop');
    for (const [i, table] of [shell.TABS, shell.TAB_OF_WORD, shell.GAME_ACTIONS.new].entries()) assert.equal(table, references[i]);
  } finally { shell.refresh(context([])); }
});

test('a reused tab identity gets the current declaration and no stale game actions', () => {
  try {
    shell.refresh(context([declared('tool', 'Earlier', { new: 'earlier.new' })]));
    const current = context([{ id: 'fixture.current', tab: { id: 'tool', title: 'Current', aliases: ['workspace'] } }]);
    assert.equal(shell.openTab(current, { tab: 'earlier' }).status, 'unsupported');
    assert.equal(shell.openTab(current, { tab: 'workspace' }).status, 'supported');
    assert.equal(shell.TABS.tool.world, 'fixture.current');
    assert.equal(shell.playGame(current, { tab: 'tool' }).status, 'supported');
    assert.equal(shell.GAME_ACTIONS.new.tool, undefined);
    shell.refresh(context([]));
    assert.deepEqual(Object.keys(shell.TABS), ['talk', 'editor']);
    assert.equal(shell.TAB_OF_WORD.documents, 'editor');
  } finally { shell.refresh(context([])); }
});
