#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Main-thread cost per turn in the real webchat (COMPUTE-BUDGET E, spec 06 "Main-thread cost"): CDP Performance.getMetrics before/after each message
 * (TaskDuration = all main-thread tasks incl. style, layout, paint; ScriptDuration; LayoutDuration; RecalcStyleDuration), at CPU throttling (default 4x).
 *   node scripts/perf-turn-cost.mjs [--throttle 4] [--reps 2] [--chrome ...]    (needs PUPPETEER_CORE)
 */
import { openChat } from './test-webchat-turns.mjs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const throttle = Number(arg('throttle', 4)), reps = Number(arg('reps', 2));
const LINES = ['what is 12 plus 30', 'desenează un soare', 'fă o casă verde și una galbenă', 'I have two kids'];
const c = await openChat({ throttle, chrome: arg('chrome'), settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'auto', translation: 'auto', languageDetection: 'auto' } });
const cdp = await c.pg.createCDPSession();
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await c.say('hello', { timeout: 60000 });   // warm-up
{ // reference: the same window length with no message (idle animations of the page itself)
  const a = await metrics(); await sleep(3000); const b = await metrics();
  console.log(`idle, 3 s window (no message)       task ${Math.round((b.TaskDuration - a.TaskDuration) * 1000).toString().padStart(5)} ms`);
}
for (const text of LINES) {
  const rows = [];
  for (let i = 0; i < reps; i++) {
    await sleep(1200);
    const a = await metrics();
    const r = await c.say(text, { timeout: 60000 });
    await sleep(1200);   // late layout / paint / idle callbacks that belong to the turn
    const b = await metrics();
    const d = (k) => Math.round((b[k] - a[k]) * 1000);
    rows.push({ task: d('TaskDuration'), script: d('ScriptDuration'), layout: d('LayoutDuration'), style: d('RecalcStyleDuration'), reply: r.reply.slice(0, 30) });
  }
  const avg = (k) => Math.round(rows.reduce((s, x) => s + x[k], 0) / rows.length);
  console.log(`${text.padEnd(34)} task ${String(avg('task')).padStart(5)} ms  script ${String(avg('script')).padStart(5)}  layout ${String(avg('layout')).padStart(5)}  style ${String(avg('style')).padStart(5)}   ${rows.map((x) => x.task).join('/')}  ${rows[0].reply}`);
}
await c.close();
