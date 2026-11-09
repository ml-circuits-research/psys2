#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * DIAG2: the five Diagram probes in the real webchat (headless Chrome, default settings: dispatcher and normalizer models loaded), with a screenshot.
 *
 *   PUPPETEER_CORE=<scratch puppeteer-core install> node scripts/test-webchat-diagram.mjs [--shot out.png] [--throttle 1] [--chrome /usr/bin/chromium]
 */
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PROBES = [
  ['draw a blue rectangle called Api and a green circle called Db', /Drew|Api/i, /did not understand|where to put/i],
  ['connect Api to Db with a dashed arrow', /connect|arrow|Api/i, /needs two ends/i],
  ['what is connected to Db?', /Api connects to Db/i, /Which shape should I inspect|isn't connected/i],
  ['make a process diagram with Plan, Build, Test, Ship', /Plan|process|Drew|made/i, /took too long|did not understand/i],
  ['rename Api to Gateway', /Gateway/i, /did not understand/i],
];
const chat = await openChat({ throttle: Number(arg('throttle', 1)), chrome: arg('chrome'), settings: {}, viewport: { width: 900, height: 900, deviceScaleFactor: 1 } });
let bad = 0;
try {
  const open = await chat.say('open the diagram tab');
  console.log(`open diagram tab: ${open.ms} ms  ${JSON.stringify(open.reply).slice(0, 120)}`);
  for (const [text, want, notWant] of PROBES) {
    const r = await chat.say(text);
    const ok = r.ok && want.test(r.reply) && !notWant.test(r.reply);
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.ms} ms  "${text}"  ->  ${JSON.stringify(r.reply).slice(0, 160)}`);
  }
  const st = JSON.parse(await chat.state());
  console.log('tab:', st['ui.shell']?.activeTab, ' shapes:', (st['diagram.sketch']?.shapes ?? []).map((s) => `${s.name}:${s.shape}:${s.color}`).join(', '));
  await new Promise((r) => setTimeout(r, 800));
  await chat.pg.screenshot({ path: arg('shot', 'diag2-webchat.png') });
  console.log('screenshot:', arg('shot', 'diag2-webchat.png'), ' page errors:', chat.errors.length);
} finally { await chat.close(); }
process.exit(bad ? 1 : 0);
