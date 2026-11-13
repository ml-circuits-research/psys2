#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// One small Chrome check of INPUT-HISTORY (needs PUPPETEER_CORE, see test-webchat-turns.mjs): arrow up / down recall, the draft, the tap on a sent message,
// and the correction flag of a recalled + edited message sent right after a failed turn.
import { openChat } from './test-webchat-turns.mjs';
const chat = await openChat({ throttle: 1 });
const { pg } = chat;
const val = () => pg.$eval('input.p2-text', (e) => e.value);
const key = (k) => pg.keyboard.press(k);
const results = [];
const check = (name, ok, got) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : JSON.stringify(got)); };
await chat.say('draw a house');
await chat.say('zork the plimp');   // a failed turn
await pg.type('input.p2-text', 'half');
await key('ArrowUp'); check('up recalls the last message', (await val()) === 'zork the plimp', await val());
await key('ArrowUp'); check('up again recalls the one before', (await val()) === 'draw a house', await val());
await key('ArrowDown'); await key('ArrowDown'); check('down ends at the draft', (await val()) === 'half', await val());
await pg.$eval('input.p2-text', (e) => { e.value = ''; });
await key('ArrowUp'); await pg.type('input.p2-text', ' house');   // recalled and edited
await key('Enter');
await pg.waitForFunction(() => !window.psys2.busy, { timeout: 20000, polling: 20 });
const rec = await chat.lastPhrase();
check('a recalled + edited message after a failed turn carries the correction flag', rec?.correction === true && rec?.correctionOf === 'zork the plimp', rec && { c: rec.correction, of: rec.correctionOf });
await chat.say('draw a tree');
await pg.type('input.p2-text', 'x'); await key('ArrowUp'); await key('Enter');
await pg.waitForFunction(() => !window.psys2.busy, { timeout: 20000, polling: 20 });
check('no flag after a good turn', (await chat.lastPhrase())?.correction !== true);
// touch: tap on a sent message copies it into the box
await pg.$eval('input.p2-text', (e) => { e.value = ''; });
const first = await pg.$('.p2-msg.is-user[data-said] .p2-bubble');
await first.tap();
check('a tap on a sent message copies it into the box (touch)', (await val()).length > 0 && (await pg.$eval('.p2-msg.is-user[data-said]', (m) => m.dataset.said)) === (await val()), await val());
check('no page errors', chat.errors.length === 0, chat.errors);
await chat.close();
process.exit(results.every(Boolean) ? 0 : 1);
