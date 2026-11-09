#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * DIAG3: the expectations of the user's Diagram session (training/eval/expectations-2026-11-09d.jsonl) in the real webchat (headless Chrome), with
 * screenshots of the ids and the arrows. The webchat must be built first (node scripts/build-webchat.mjs).
 *
 *   PUPPETEER_CORE=<scratch puppeteer-core install> node scripts/test-webchat-diagram3.mjs [--shots dir] [--chrome /usr/bin/chromium]
 */
import { mkdirSync } from 'node:fs';
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('shots', 'diag3-shots');
mkdirSync(dir, { recursive: true });
// [message, reply must match, reply must not match, state check]
const STEPS = [
  ['draw a red circle', /c1/, /did not understand/],
  ['create a diagram', /Keep the current one/i, /Drew/],
  ['keep it', /keep/i, /did not understand/],
  ['add a box', /r1/, null],
  ['add a box', /r2/, null],
  ['connect all elements', /a1.*a2|a1/s, null, (d) => d.edges.length === 2],
  ['label the previous link as label1', /label1/, /Which shape/, (d) => d.edges.at(-1).label === 'label1', 'ids-and-arrows'],
  ['label link', /What should the label of a2/i, null],
  ['label a1 as uses', /uses/, null, (d) => d.edges.find((e) => e.id === 'a1').label === 'uses'],
  ['make a1 thicker and dashed', /dashed/, /Changed the arrow/, (d) => d.edges.find((e) => e.id === 'a1').style === 'dashed'],
  ['make c1 a bit bigger', /c1/, null],
  ['change the layout to a column', /column/i, null, (d) => d.shapes.every((s) => s.x === d.shapes[0].x), 'column'],
  ['select a1', /Selected/, null, null, 'selected'],
  ['delete a1', /Removed/, null, (d) => !d.edges.some((e) => e.id === 'a1')],
];
const chat = await openChat({ throttle: 1, chrome: arg('chrome'), settings: {}, viewport: { width: 900, height: 900, deviceScaleFactor: 1 } });
let bad = 0;
try {
  await chat.say('open the diagram tab');
  for (const [text, want, notWant, check, shot] of STEPS) {
    const r = await chat.say(text);
    const d = JSON.parse(await chat.state())['diagram.sketch'] ?? {};
    const ok = r.ok && want.test(r.reply) && !(notWant && notWant.test(r.reply)) && (!check || check(d));
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  "${text}"  ->  ${JSON.stringify(r.reply).slice(0, 150)}`);
    if (shot) { await new Promise((res) => setTimeout(res, 600)); await chat.pg.screenshot({ path: `${dir}/${shot}.png` }); }
  }
  console.log('page errors:', chat.errors.length);
} finally { await chat.close(); }
process.exit(bad ? 1 : 0);
