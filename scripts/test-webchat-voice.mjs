#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Voice end-of-turn tests in the real webchat (VOICE task, spec 06 "Spoken messages"): headless Chrome with a FAKE SpeechRecognition that streams interim events
 * with timings. Real pause timings (700 ms / 1.8 s / 2.5 s / 300 ms).
 *
 *   node scripts/test-webchat-voice.mjs [--throttle 1] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Installed before the page scripts: a SpeechRecognition that does nothing by itself; the test drives it through window.__sr. */
function fakeSpeech() {
  const all = [];
  class FakeSR {
    constructor() { this.started = false; this.lang = ''; all.push(this); }
    start() { this.started = true; this.startedAt = performance.now(); }
    stop() { setTimeout(() => this.end(), 20); }
    abort() { setTimeout(() => this.end(), 0); }
    end() { if (this.started) { this.started = false; this.onend?.(); } }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__sr = {
    all,
    live: () => all.filter((r) => r.started).at(-1) ?? null,
    say(texts, { final = false } = {}) { const r = this.live(); if (!r) return false; r.onresult({ resultIndex: 0, results: texts.map((t) => Object.assign([{ transcript: t }], { isFinal: final })) }); return true; },
    t0: 0,
  };
}

const open = (o, settings = {}) => openChat({ ...o, init: fakeSpeech, settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'en', ...settings } });
const users = (c) => c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
const waitRec = (c) => c.pg.waitForFunction(() => window.__sr.live(), { timeout: 5000, polling: 20 });
const say = (c, texts, o) => c.pg.evaluate((t, f) => window.__sr.say(t, f), texts, o);
/** Waits (up to `max` ms) for a new user message; resolves with the elapsed ms since `t`, or null. */
const waitUser = (c, n, t, max) => c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: max, polling: 10 }, n).then(() => Date.now() - t).catch(() => null);
const lastPhrase = (c) => c.lastPhrase();
const idle = (c) => c.pg.waitForFunction(() => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: 15000, polling: 30 });

export const SCENARIOS = {
  async plausible(o) {
    const c = await open(o);
    try {
      const snap = () => c.pg.evaluate(() => JSON.stringify([window.psys2.session.state(), window.psys2.session.memory?.(), window.psys2.session._msg, window.psys2.session._sessionLang]));
      const before = await snap();
      const dry = await c.pg.evaluate(async () => [await window.psys2.session.dryRead('make a house', { language: 'en' }), await window.psys2.session.dryRead('fă o casă mare', { language: 'ro' }), await window.psys2.session.dryRead('make a house and', { language: 'en' })]);
      check('dry run: complete readings found, no side effects on the session', dry[0].complete && dry[1].complete && (await snap()) === before, JSON.stringify(dry.map((d) => d.reason)));
      for (const [label, text, settings] of [['English', 'make a house', {}], ['Romanian', 'desenează o casă', { language: 'ro' }]]) {
        if (settings.language) { await c.pg.select('select.p2-select', settings.language); }
        const n = await users(c);
        await c.pg.click('button.p2-mic'); await waitRec(c);
        const words = text.split(' ');
        for (let i = 1; i <= words.length; i++) { await say(c, [words.slice(0, i).join(' ')]); await sleep(120); }
        const t = Date.now() - 120;
        const ms = await waitUser(c, n, t, 3000);
        check(`${label}: a plausible sentence is sent after the short pause (~700 ms)`, ms !== null && ms >= 550 && ms <= 1800, `${ms} ms`);
        await idle(c);
        const rec = await lastPhrase(c);
        check(`${label}: phrase log has endType pause-plausible and the wait`, rec?.mode === 'voice' && rec.endType === 'pause-plausible' && rec.waitMs >= 600, JSON.stringify({ endType: rec?.endType, waitMs: rec?.waitMs }));
      }
      check('plausible: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async waits(o) {
    const c = await open(o);
    try {
      const n = await users(c);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await say(c, ['make a house and']);
      const t = Date.now();
      const early = await waitUser(c, n, t, 1400);
      check('"make a house and" is not sent after 1.4 s', early === null);
      const ms = await waitUser(c, n, t, 2500);
      check('"make a house and" is sent anyway after ~1.8 s', ms !== null && ms >= 1500 && ms <= 3200, `${ms} ms`);
      await idle(c);
      const rec = await lastPhrase(c);
      check('phrase log: pause-timeout', rec?.endType === 'pause-timeout' && rec.waitMs >= 1500, JSON.stringify({ endType: rec?.endType, waitMs: rec?.waitMs }));
    } finally { await c.close(); }
  },
  async micstop(o) {
    const c = await open(o);
    try {
      const n = await users(c);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await say(c, ['make a house and']);
      await sleep(150);
      const t = Date.now();
      await c.pg.click('button.p2-mic');   // stop: the fake recognizer never sends a final
      const ms = await waitUser(c, n, t, 1500);
      check('stopping the mic sends the interim text within ~300 ms', ms !== null && ms <= 900, `${ms} ms`);
      await idle(c);
      const rec = await lastPhrase(c);
      check('phrase log: mic-stop', rec?.endType === 'mic-stop', rec?.endType);
    } finally { await c.close(); }
  },
  async final(o) {
    const c = await open(o);
    try {
      const n = await users(c);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await say(c, ['make a house'], { final: true });
      const ms = await waitUser(c, n, Date.now(), 1500);
      check('isFinal sends at once', ms !== null && ms < 600, `${ms} ms`);
      await idle(c);
      check('phrase log: final', (await lastPhrase(c))?.endType === 'final');
      // a hands-free timer send followed by the browser's own final: one message
      await c.pg.evaluate(() => document.querySelector('button[aria-label="Hands-free mode"]').click());
      await waitRec(c);
      const n2 = await users(c);
      await say(c, ['make a tree']);
      await waitUser(c, n2, Date.now(), 2500);
      await sleep(100);
      await say(c, ['make a tree'], { final: true }).catch(() => {});
      await sleep(1200); await idle(c);
      check('no double send: the late final repeats the sent text', (await users(c)) === n2 + 1, `${(await users(c)) - n2} messages`);
    } finally { await c.close(); }
  },
  async cancel(o) {
    const c = await open(o);
    try {
      const n = await users(c);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await say(c, ['make a house']); await sleep(80);
      await say(c, ['make a house cancel']);
      await sleep(1600);
      check('"cancel" sends nothing', (await users(c)) === n);
      check('"cancel" keeps the text in the field for editing', (await c.pg.$eval('input.p2-text', (e) => e.value)) === 'make a house', await c.pg.$eval('input.p2-text', (e) => e.value));
      // typing cancels a pending send
      await c.pg.evaluate(() => { document.querySelector('input.p2-text').value = ''; });
      await c.pg.click('button.p2-mic').catch(() => {}); await sleep(100);
      await waitRec(c).catch(() => {});
      await say(c, ['make a tree']); await sleep(250);
      check('a countdown ring is shown while a send is pending', await c.pg.$eval('button.p2-mic', (b) => b.classList.contains('is-pending')));
      await c.pg.type('input.p2-text', '!');
      await sleep(1800);
      check('typing cancels the pending send', (await users(c)) === n);
    } finally { await c.close(); }
  },
  async busy(o) {
    const c = await open(o);
    try {
      await c.slowSend(5000);
      await c.pg.type('input.p2-text', 'make a house'); await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => window.psys2.busy, { timeout: 5000 });
      const n = await users(c);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await say(c, ['make a tree']);
      await sleep(2000);
      check('a spoken message during a turn waits in the field', (await users(c)) === n && (await c.pg.$eval('input.p2-text', (e) => e.value)) === 'make a tree');
      await c.realSend();
      await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 15000, polling: 50 }, n).catch(() => {});
      check('it is sent when the turn ends', (await users(c)) === n + 1);
    } finally { await c.close(); }
  },
  async lang(o) {
    const c = await open(o, { language: 'auto', speechLang: 'auto' });
    try {
      await c.pg.evaluate(() => document.querySelector('button[aria-label="Hands-free mode"]').click());
      await waitRec(c);
      check('speech language starts as en-US', (await c.pg.evaluate(() => window.__sr.live().lang)) === 'en-US');
      const n = await users(c);
      await say(c, ['desenează o casă și un copac'], { final: true });
      await waitUser(c, n, Date.now(), 4000); await idle(c);
      await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'ro-RO', { timeout: 4000, polling: 50 }).catch(() => {});
      check('after Romanian input the recognizer restarts with ro-RO', (await c.pg.evaluate(() => window.__sr.live()?.lang)) === 'ro-RO', await c.pg.evaluate(() => window.__sr.live()?.lang));
      const n2 = await users(c);
      await say(c, ['make a house'], { final: true });
      await waitUser(c, n2, Date.now(), 4000); await idle(c);
      await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'en-US', { timeout: 4000, polling: 50 }).catch(() => {});
      check('and back to en-US after English input', (await c.pg.evaluate(() => window.__sr.live()?.lang)) === 'en-US');
    } finally { await c.close(); }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const o = { throttle: Number(opt('throttle', 1)), chrome: opt('chrome') };
  const only = opt('only', Object.keys(SCENARIOS).join(',')).split(',');
  for (const name of only) { console.log(`\n== ${name}`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran`, false, e.message); } }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
