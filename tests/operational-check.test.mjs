import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCase, answerPart, numbersInText, checkState, parseStateItem } from '../scripts/lib/operational-check.mjs';

const ev = (answer, replyText, values = []) => evaluateCase({ world: 'w', expect: { answer: [answer] } }, { before: {}, after: {}, replyText, effects: [], statuses: ['supported'], unparsedAll: false, values })[0].ok;

test('numeric expectations compare complete signed values, not fragments', () => {
  assert.equal(ev('7', '3 minus 10 is -7.'), false);       // the sign is part of the value
  assert.equal(ev('-7', '3 minus 10 is -7.'), true);
  assert.equal(ev('7', '10 minus 3 is 7.'), true);
  assert.equal(ev('45.5', 'The coordinate is -45.5.'), false);
  assert.equal(ev('-45.5', 'The coordinate is -45.5.'), true);
  assert.equal(ev('45.5', 'The coordinate is 45.5.'), true);
  assert.equal(ev('5', 'It is 0.5.'), false);
  assert.equal(ev('0.5', 'It is 0.5.'), true);
  assert.equal(ev('0.5', 'It is 5.'), false);
  assert.equal(ev('5', 'It is 15.'), false);
  assert.equal(ev('5', 'It is 5.5.'), false);
});

test('replies with operands plus a result: each number is checked as a value', () => {
  assert.equal(ev('10', '3 minus 10 is -7.'), true);        // operand
  assert.equal(ev('3', '3 minus 10 is -7.'), true);
  assert.equal(ev('-3', '3 minus 10 is -7.'), false);
  assert.deepEqual(numbersInText('3 minus 10 is -7.'), [3, 10, -7]);
  assert.deepEqual(numbersInText('from -45.5 to 25.3, then 3-5 and 1,500'), [-45.5, 25.3, 3, 5, 1500]);
  assert.equal(ev('-7', 'The result is minus seven.', [-7]), true);   // typed result field of the answer
  assert.equal(ev('7', 'The result is minus seven.', [-7]), false);
});

test('negative coordinates', () => {
  assert.equal(ev('-12.5', 'The point is at -12.5, 30.'), true);
  assert.equal(ev('12.5', 'The point is at -12.5, 30.'), false);
  assert.equal(ev('30', 'The point is at -12.5, 30.'), true);
});

test('empty cells: null and "" are the same', () => {
  const it = parseStateItem('board.4=null', 'games.tictactoe');
  assert.equal(checkState({ 'games.tictactoe': { board: ['', '', '', '', '', '', '', '', ''] } }, it).ok, true);
  assert.equal(checkState({ 'games.tictactoe': { board: [null, null, null, null, null, null, null, null, null] } }, it).ok, true);
  assert.equal(checkState({ 'games.tictactoe': { board: ['', '', '', '', 'X', '', '', '', ''] } }, it).ok, false);
  const ne = parseStateItem('board.4!=null', 'games.tictactoe');
  assert.equal(checkState({ 'games.tictactoe': { board: ['', '', '', '', 'X', '', '', '', ''] } }, ne).ok, true);
  assert.equal(checkState({ 'games.tictactoe': { board: ['', '', '', '', '', '', '', '', ''] } }, ne).ok, false);
});

test('the answer is matched only in the answer part, never in a quoted echo of the user\'s words (mp#021)', () => {
  const message = 'I have 20 lei. I give Ana 10 lei.';
  const reply = 'OK, you have 20 lei. I did not understand "I give Ana 10 lei". For example: "Mom gave me 5 lei." You have 20 lei now.';
  assert.equal(answerPart(reply, message), 'OK, you have 20 lei. I did not understand  . For example: "Mom gave me 5 lei." You have 20 lei now.');
  const run = (want) => evaluateCase({ world: 'w', message, expect: { answer: [want] } }, { before: {}, after: {}, replyText: reply, effects: [], statuses: ['supported'], unparsedAll: false })[0].ok;
  assert.equal(run('10'), false);
  assert.equal(run('20'), true);
  assert.equal(run('Mom gave me 5 lei'), true, 'a quote that is not the user\'s words stays');
  assert.equal(answerPart('He said \u201cthe witch\u201d.', 'And the witch?'), 'He said  .');
});
