// SPDX-License-Identifier: AGPL-3.0-only
// INPUT-HISTORY: arrow keys recall sent messages, the draft is kept, the caret-line rule, the correction flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputHistory, caretLine, replyFailed } from '../docs/webchat/ui/input-history.mjs';

const fakeInput = (value = '') => {
  const el = { value, selectionStart: value.length, selectionEnd: value.length, dispatchEvent() { return true; }, focus() {}, setSelectionRange(a, b) { el.selectionStart = a; el.selectionEnd = b; } };
  return el;
};
const key = (name, extra = {}) => { const e = { key: name, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, ...extra }; return e; };

test('up walks back through sent messages, down walks forward and ends at the unsent draft', () => {
  const el = fakeInput(); const h = createInputHistory(el);
  for (const t of ['draw a house', 'make it red', 'undo']) h.push(t);
  el.value = 'half typed';
  h.onKeydown(key('ArrowUp')); assert.equal(el.value, 'undo');
  h.onKeydown(key('ArrowUp')); assert.equal(el.value, 'make it red');
  h.onKeydown(key('ArrowUp')); assert.equal(el.value, 'draw a house');
  const e = key('ArrowUp'); h.onKeydown(e); assert.equal(el.value, 'draw a house', 'the oldest stays'); assert.equal(e.defaultPrevented, false);
  h.onKeydown(key('ArrowDown')); assert.equal(el.value, 'make it red');
  h.onKeydown(key('ArrowDown')); h.onKeydown(key('ArrowDown')); assert.equal(el.value, 'half typed', 'the draft comes back');
});

test('the caret rule: up only on the first line, down only on the last line, never with a selection or a modifier', () => {
  const el = fakeInput('line one\nline two'); const h = createInputHistory(el);
  h.push('old');
  el.selectionStart = el.selectionEnd = 12;   // on the second line
  const e1 = key('ArrowUp'); h.onKeydown(e1); assert.equal(e1.defaultPrevented, false); assert.equal(el.value, 'line one\nline two');
  el.selectionStart = el.selectionEnd = 3;    // first line
  h.onKeydown(key('ArrowUp', { shiftKey: true })); assert.equal(el.value, 'line one\nline two');
  el.selectionEnd = 5; assert.deepEqual(caretLine(el), { first: false, last: false });
  el.selectionEnd = 3; h.onKeydown(key('ArrowUp')); assert.equal(el.value, 'old');
});

test('a repeat is not added twice; empty messages are not added', () => {
  const h = createInputHistory(fakeInput());
  h.push('a'); h.push('a'); h.push('  '); h.push('b');
  assert.deepEqual(h.list(), ['a', 'b']);
});

test('a recalled message, edited and sent right after a failed turn, is a correction of that turn; unedited or after a good turn it is not', () => {
  const el = fakeInput(); const h = createInputHistory(el);
  h.push('desen a house'); h.noteOutcome(true);
  h.onKeydown(key('ArrowUp'));
  el.value = 'draw a house';
  assert.deepEqual(h.push('draw a house'), { of: 'desen a house' });
  h.noteOutcome(true); h.onKeydown(key('ArrowUp'));
  assert.equal(h.push('draw a house'), null, 'sent unchanged: a retry');
  h.noteOutcome(false); h.onKeydown(key('ArrowUp')); el.value = 'draw a tree';
  assert.equal(h.push('draw a tree'), null, 'the turn before went well');
  h.noteOutcome(true); assert.equal(h.push('typed fresh'), null, 'not recalled');
});

test('touch: recallText copies a past message into the box and keeps the draft', () => {
  const el = fakeInput('my draft'); const h = createInputHistory(el);
  h.push('earlier'); el.value = 'my draft';
  assert.ok(h.recallText('earlier')); assert.equal(el.value, 'earlier');
  h.onKeydown(key('ArrowDown')); assert.equal(el.value, 'earlier', 'a tap leaves the walk where it was');
});

test('replyFailed: not supported, unparsed or no reply', () => {
  assert.equal(replyFailed(null), true);
  assert.equal(replyFailed({ statuses: ['supported'], segments: [{}] }), false);
  assert.equal(replyFailed({ statuses: ['supported', 'unparsed'], segments: [] }), true);
  assert.equal(replyFailed({ statuses: ['supported'], segments: [{ unparsed: true }] }), true);
});
