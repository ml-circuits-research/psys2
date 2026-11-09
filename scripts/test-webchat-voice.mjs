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
  window.__srCfg = { startMs: 20, stopMs: 20 };
  class FakeSR {
    constructor() { this.started = false; this.lang = ''; all.push(this); }
    start() { this.started = true; this.dead = false; this.results = []; this.startedAt = performance.now(); const ms = window.__srCfg.startMs; setTimeout(() => { if (this.started && !this.dead) this.onstart?.(); }, ms); }
    stop() { setTimeout(() => this.end(), window.__srCfg.stopMs); }
    abort() { this.dead = true; setTimeout(() => this.end(), 0); }
    end() { if (this.started) { this.started = false; this.onend?.(); } }
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken = (window.__spoken || 0) + 1; setTimeout(() => u.onend?.(), window.__synthMs ?? 400); }, cancel() {}, getVoices: () => [], addEventListener() {} } });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__sr = {
    all,
    live: () => all.filter((r) => r.started).at(-1) ?? null,
    say(texts, { final = false } = {}) { const r = this.live(); if (!r) return false; r.onresult({ resultIndex: 0, results: texts.map((t) => Object.assign([{ transcript: t }], { isFinal: final })) }); return true; },
    t0: 0,
    /** Android: every final stays in the result list (cumulative); `resultIndex` points at the new one. A restart clears the list. */
    final(t) { const r = this.live(); if (!r) return false; r.results.push(Object.assign([{ transcript: t }], { isFinal: true })); r.onresult({ resultIndex: r.results.length - 1, results: r.results }); return true; },
  };
}

const open = (o, settings = {}) => openChat({ ...o, init: fakeSpeech, settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'en', ...settings } });
const users = (c) => c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
const users_ = users;
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
        if (!(await c.pg.evaluate(() => !!window.__sr.live()))) await c.pg.click('button.p2-mic');   // conversation mode: the mic is still on from the first sentence
        await waitRec(c);
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
      await sleep(400);   // clicks within 250 ms of the last flip are debounced
      const t = Date.now();
      await c.pg.click('button.p2-mic');   // stop: the fake recognizer never sends a final
      const ms = await waitUser(c, n, t, 1500);
      check('stopping the mic sends the interim text within ~300 ms', ms !== null && ms <= 1100, `${ms} ms`);
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
      await sleep(3400);   // while a turn runs the dry run declines, so the long pause (2.5 s in conversation mode) applies
      check('a spoken message during a turn waits as a chip above the input', (await users(c)) === n && (await c.pg.$$eval('.p2-queue .p2-qchip', (e) => e.map((x) => x.textContent.replace('×', '')))).join('|') === 'make a tree');
      await c.realSend();
      await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 15000, polling: 50 }, n).catch(() => {});
      check('it is sent when the turn ends', (await users(c)) === n + 1);
    } finally { await c.close(); }
  },
  async stayon(o) {
    const c = await open(o, { speaker: true });
    try {
      const mic = () => c.pg.$eval('button.p2-mic', (b) => ({ s: b.dataset.mic, t: b.title, l: b.getAttribute('aria-label'), p: b.getAttribute('aria-pressed') }));
      const count = () => c.pg.evaluate(() => window.__sr.all.length);
      const live = () => c.pg.evaluate(() => !!window.__sr.live());
      const waitNew = (n, ms = 3000) => c.pg.waitForFunction((n) => window.__sr.all.length > n && window.__sr.live(), { timeout: ms, polling: 20 }, n).then(() => true).catch(() => false);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      let m = await mic();
      check('one click turns the microphone on (conversation mode) with a state tooltip', m.s === 'listening' && m.p === 'true' && m.t === m.l && /stop microphone/.test(m.t), JSON.stringify(m));
      let ok = true;
      for (let i = 0; i < 4; i++) { await sleep(560); const n = await count(); await c.pg.evaluate(() => window.__sr.live().end()); ok = (await waitNew(n)) && ok; }
      check('the recognizer ends by itself four times: it is restarted each time', ok && (await mic()).s === 'listening');
      await sleep(560);
      let n = await count();
      await c.pg.evaluate(() => { const r = window.__sr.live(); r.onerror({ error: 'no-speech' }); r.end(); });
      check('a no-speech error restarts it', await waitNew(n));
      await sleep(560); n = await count();
      await c.pg.evaluate(() => { const r = window.__sr.live(); r.onerror({ error: 'aborted' }); r.end(); });
      check('an aborted error restarts it', await waitNew(n));
      // utterances still go to the chat after restarts
      const u0 = await users(c);
      await say(c, ['make a house'], { final: true });
      await waitUser(c, u0, Date.now(), 4000); await idle(c);
      check('an utterance after the restarts is sent', (await users(c)) === u0 + 1);
      // the answer is read aloud: the recognizer pauses, then resumes by itself
      n = await count();
      await c.pg.waitForFunction(() => (window.__spoken || 0) > 0, { timeout: 6000, polling: 30 }).catch(() => {}); await sleep(1200); await waitRec(c).catch(() => {});
      check('the microphone listens again after the answer was read aloud', (await mic()).s === 'listening' && (await live()) && (await c.pg.evaluate(() => window.__spoken || 0)) > 0);
      // barge-in: a click while the answer is read aloud stops the speech and listens at once (it does not turn the mic off)
      await c.pg.evaluate(() => { window.__synthMs = 5000; window.__spoken = 0; });
      await say(c, ['make a tree'], { final: true });
      await c.pg.waitForFunction(() => window.__spoken > 0 && document.querySelector('button.p2-mic').dataset.mic === 'waiting', { timeout: 15000, polling: 30 }).catch(() => {});
      const waitingState = (await mic()).s;
      await c.pg.click('button.p2-mic');
      const bargeOk = await c.pg.waitForFunction(() => ['listening', 'starting'].includes(document.querySelector('button.p2-mic').dataset.mic) && window.__sr.live(), { timeout: 1500, polling: 30 }).then(() => true).catch(() => false);
      check('a click during read-aloud is a barge-in: listens at once, the mic stays on', waitingState === 'waiting' && bargeOk, waitingState);
      await c.pg.evaluate(() => { window.__synthMs = 400; });
      await idle(c);
      // stop phrases: nothing is sent, the microphone goes off
      for (const phrase of ['stop microphone', 'stop the mic', 'mic off', 'turn off the microphone', 'stop listening', "that's all", 'close the mic', 'stop the microphon', 'oprește microfonul', 'opreste microfonul', 'stop microfon', 'închide microfonul', 'gata cu microfonul', 'nu mai asculta']) {
        if (!(await live())) { await c.pg.click('button.p2-mic'); await waitRec(c); }
        const before = await users(c);
        await say(c, [phrase], { final: true });
        await sleep(300);
        const off = await c.pg.waitForFunction(() => document.querySelector('button.p2-mic').dataset.mic === 'off' && !window.__sr.live(), { timeout: 2500, polling: 30 }).then(() => true).catch(() => false);
        check(`"${phrase}" turns the microphone off and is not sent`, off && (await users(c)) === before);
      }
      // a spoken (not final) stop phrase is recognized after the pause
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const b2 = await users(c);
      await say(c, ['stop the microphone']);
      check('an interim stop phrase turns it off after the pause', await c.pg.waitForFunction(() => document.querySelector('button.p2-mic').dataset.mic === 'off', { timeout: 3000, polling: 30 }).then(() => true).catch(() => false) && (await users(c)) === b2);
      check('"stop microphone" is not left in the field', (await c.pg.$eval('input.p2-text', (e) => e.value)) === '');
      // a second click turns it off
      await c.pg.click('button.p2-mic'); await waitRec(c); await sleep(300);
      await c.pg.click('button.p2-mic'); await sleep(300);
      check('a second click turns the microphone off', (await mic()).s === 'off' && !(await live()));
      // utterances during a turn wait (VOICE) even in conversation mode: covered by the busy scenario; here only the typed command
      await c.pg.click('button.p2-mic'); await waitRec(c);
      await c.pg.type('input.p2-text', 'stop microphone'); await c.pg.keyboard.press('Enter');
      check('typing "stop microphone" turns it off too', await c.pg.waitForFunction(() => document.querySelector('button.p2-mic').dataset.mic === 'off', { timeout: 8000, polling: 50 }).then(() => true).catch(() => false));
    } finally { await c.close(); }
  },
  async paused(o) {
    const c = await open(o);
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      let seen = 0;
      for (let i = 0; i < 6; i++) {
        const n = await c.pg.evaluate(() => window.__sr.all.length);
        await c.pg.evaluate(() => { const r = window.__sr.live(); r.onerror({ error: 'network' }); r.end(); });
        if (i < 5) { await c.pg.waitForFunction((n) => window.__sr.all.length > n && window.__sr.live(), { timeout: 8000, polling: 50 }, n).catch(() => {}); seen++; }
      }
      await sleep(300);
      const m = await c.pg.$eval('button.p2-mic', (b) => ({ s: b.dataset.mic, t: b.title }));
      check('repeated network errors: retried with backoff, then a visible paused state with the reason', seen === 5 && m.s === 'paused' && /tap to resume/.test(m.t) && /network/.test(m.t), JSON.stringify(m));
      const n = await c.pg.evaluate(() => window.__sr.all.length);
      await c.pg.click('button.p2-mic');
      check('a tap on the paused microphone resumes listening', await c.pg.waitForFunction((n) => window.__sr.all.length > n && window.__sr.live(), { timeout: 3000, polling: 30 }, n).then(() => true).catch(() => false) && (await c.pg.$eval('button.p2-mic', (b) => b.dataset.mic)) === 'listening');
    } finally { await c.close(); }
  },
  async queue(o) {
    const c = await open(o);
    try {
      const users = () => users_(c);
      const chips = () => c.pg.$$eval('.p2-queue .p2-qchip .p2-qtext', (e) => e.map((x) => x.textContent));
      await c.slowSend(60000);
      const type = async (t) => { await c.pg.type('input.p2-text', t); await c.pg.keyboard.press('Enter'); };
      await type('make a house');
      await c.pg.waitForFunction(() => window.psys2.busy, { timeout: 5000 });
      const n = await users();
      await type('make a tree'); await type('make a bird'); await type('yes');
      check('three messages wait as chips, in order', (await chips()).join('|') === 'make a tree|make a bird|yes', (await chips()).join('|'));
      const mic = await c.pg.$eval('button.p2-mic', (b) => ({ n: b.querySelector('.p2-mic-count').textContent, t: b.title }));
      check('the mic shows the counter', mic.n === '3' && /3 messages waiting/.test(mic.t), JSON.stringify(mic));
      await c.pg.click('.p2-queue .p2-qchip .p2-qdrop');
      check('the x drops one chip', (await chips()).join('|') === 'make a bird|yes');
      check('typing was never blocked: the input is empty and enabled', await c.pg.$eval('input.p2-text', (e) => e.value === '' && !e.disabled));
      await c.pg.click('button.p2-send');   // Stop
      await c.pg.waitForSelector('.p2-qask', { timeout: 3000 });
      check('Stop asks whether to drop the waiting messages', /Drop the 2 waiting messages too\?/.test(await c.pg.$eval('.p2-qask', (e) => e.textContent)));
      await c.realSend();
      await c.pg.evaluate(() => [...document.querySelectorAll('.p2-qask button')].find((b) => b.textContent === 'Keep').click());
      await c.pg.waitForFunction(() => window.psys2.queue.length === 0 && !window.psys2.busy, { timeout: 20000, polling: 50 });
      const sentTexts = await c.pg.$$eval('.p2-msg.is-user:not(.is-skipped)', (e) => e.map((x) => x.querySelector('.p2-bubble').textContent));
      check('Keep: the waiting messages ran after the turn, in order', sentTexts.slice(-1)[0] === 'make a bird' && !sentTexts.includes('yes'), sentTexts.join('|'));
      check('a bare yes whose question was already closed is shown greyed and skipped', await c.pg.$eval('.p2-msg.is-skipped', (e) => /skipped: the question was already answered/.test(e.textContent)).catch(() => false));
      check('the phrase log keeps the queue wait', (await c.lastPhrase())?.queueMs > 0, JSON.stringify((await c.lastPhrase())?.queueMs));
      void n;
    } finally { await c.close(); }
  },
  async clicks(o) {
    const c = await open(o);
    try {
      await c.pg.evaluate(() => { window.__srCfg.startMs = 1500; window.__srCfg.stopMs = 2000; });
      let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
      for (let i = 0; i < 50; i++) {
        await c.pg.evaluate(() => document.querySelector('button.p2-mic').click());
        await sleep([20, 80, 150, 260, 400, 700][Math.floor(rnd() * 6)]);
      }
      await sleep(700);
      const st = await c.pg.evaluate(() => {
        const log = window.psys2.micLog; const started = window.__sr.all.filter((r) => r.started).length;
        const m = document.querySelector('button.p2-mic');
        return { state: m.dataset.mic, started, pressed: m.getAttribute('aria-pressed'), title: m.title, label: m.getAttribute('aria-label'),
          acted: log.filter((e) => e.action !== 'ignored'), ignored: log.filter((e) => e.action === 'ignored').length, total: log.length };
      });
      const on = st.state === 'listening' || st.state === 'starting';
      check('50 random clicks with slow onstart/onend: the UI state equals the recognizer state after 300 ms', (on ? st.started === 1 : st.state === 'off' && st.started === 0), JSON.stringify({ state: st.state, started: st.started }));
      check('at most one recognizer runs, aria-pressed and title agree with the state', st.started <= 1 && st.pressed === String(on) && st.title === st.label);
      check('no click is lost: every click is in the log, and every click that was not debounced flipped the state', st.total === 50 && st.acted.every((e) => e.before.on !== e.after.on) && st.acted.length + st.ignored === 50, `${st.acted.length} acted, ${st.ignored} debounced`);
      check('the click log is shown in Settings > Developer', await c.pg.evaluate(() => { document.querySelector('button[aria-label="Settings"]').click(); document.getElementById('p2-st-developer').click(); return /Microphone clicks/.test(document.querySelector('.p2-modal-body').textContent) && /click (on|off)/.test(document.querySelector('.p2-miclog').textContent); }));
      // a click while the answer is read aloud is a barge-in: the speech stops and the mic listens at once
    } finally { await c.close(); }
  },
  async eot2(o) {
    const c = await open(o);
    try {
      await c.pg.evaluate(() => window.psys2.showTab?.('music'));
      const rows = [['play', 900], ['play little star', 0]];   // phrase log rows 63-68: "play" cut the sentence after 710 ms
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const n = await users(c);
      await say(c, [rows[0][0]]);
      await sleep(rows[0][1]);
      await say(c, [rows[1][0]]);
      await waitUser(c, n, Date.now(), 5000);
      await sleep(600);
      const texts = await c.pg.$$eval('.p2-msg.is-user', (e) => e.map((x) => x.querySelector('.p2-bubble').textContent));
      check('"play" then "play little star" 900 ms later is one message', (await users(c)) === n + 1 && texts.at(-1) === 'play little star', texts.join('|'));
      check('a lone "play" is not sent after the short pause (waits the long one)', await (async () => {
        const n2 = await users(c);
        await idle(c);
        await say(c, ['play']); await sleep(1200);
        const early = (await users(c)) === n2;
        return early;
      })());
    } finally { await c.close(); }
  },
  async lang(o) {
    const c = await open(o, { language: 'auto', speechLang: 'auto' });
    try {
      await c.pg.click('button.p2-mic');
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
  /** MOBILE-VOICE: Android cumulative finals ("draw", "draw a", "draw a heart" ...) are one message; fragments do nothing; the mic is paused during the turn; no queue. */
  async mobile(o) {
    const c = await open(o);
    try {
      await c.pg.evaluate(() => { window.__mon = { viol: 0, busyAt: 0 }; setInterval(() => { const b = window.psys2.isBusy(); const m = window.__mon; if (!b) { m.busyAt = 0; return; } m.busyAt ||= performance.now(); if (performance.now() - m.busyAt > 80 && window.__sr.live()) m.viol++; }, 5); });
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const tab = () => c.pg.evaluate(() => document.querySelector('.p2-tab[aria-selected="true"]')?.id ?? null);
      const tab0 = await tab();
      const n = await users(c);
      for (const f of ['o', 'asta']) { await c.pg.evaluate((t) => window.__sr.final(t), f); await sleep(500); }
      await sleep(3200);
      check('fragments ("o", "asta") send nothing and switch no tab', (await users(c)) === n && (await tab()) === tab0, `${(await users(c)) - n} messages`);
      for (const f of ['draw', 'a', 'draw a', 'heart', 'draw a heart']) { await c.pg.evaluate((t) => window.__sr.final(t), f); await sleep(250); }
      const ms = await waitUser(c, n, Date.now(), 12000);
      check('growing finals become one message', ms !== null);
      await sleep(300);
      check('exactly one message for the utterance', (await users(c)) === n + 1, `${(await users(c)) - n}`);
      check('no voice queue', (await c.pg.evaluate(() => window.psys2.queue.length)) === 0);
      const msgs = await c.pg.$$eval('.p2-msg.is-user .p2-bubble', (e) => e.map((x) => x.textContent));
      check('the sent text is the whole utterance', /draw a heart/i.test(msgs.at(-1) ?? ''), msgs.at(-1));
      await idle(c);
      await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 8000, polling: 30 }).catch(() => {});
      check('the microphone listens again after the turn', await c.pg.evaluate(() => !!window.__sr.live()));
      check('the microphone was never live during the turn', (await c.pg.evaluate(() => window.__mon.viol)) === 0, String(await c.pg.evaluate(() => window.__mon.viol)));
      const rec = await lastPhrase(c);
      check('the heart request was understood', rec?.status !== 'unparsed' && !rec?.unparsed, JSON.stringify({ status: rec?.status, tab: rec?.tab }));
      check('mobile: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  /** FREEZE: the listening state is never restored on load; a hidden tab stops listening and resumes only if it was on. */
  async persist(o) {
    const c = await open(o, { handsFree: true, keepListening: true });
    try {
      const vis = (v) => c.pg.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
      const live = () => c.pg.evaluate(() => !!window.__sr.live());
      await sleep(1500);
      check('a saved handsFree no longer starts the microphone', !(await live()) && (await c.pg.evaluate(() => window.__sr.all.length)) === 0);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      check('a click turns it on', await live());
      check('the listening state is not saved', JSON.parse(await c.pg.evaluate(() => localStorage.getItem('psys2.webchat.settings'))).handsFree === false);
      await vis('hidden'); await sleep(800);
      check('a hidden tab does not listen', !(await live()));
      await sleep(1500);
      check('and does not restart while hidden', !(await live()));
      await vis('visible');
      await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 5000, polling: 30 }).catch(() => {});
      check('visible again it resumes (it was on)', await live());
      check('one recognizer object for the page', (await c.pg.evaluate(() => window.__sr.all.length)) === 1, String(await c.pg.evaluate(() => window.__sr.all.length)));
      await c.pg.click('button.p2-mic'); await sleep(600);
      await vis('hidden'); await vis('visible'); await sleep(600);
      check('a microphone that was off stays off after hide / show', !(await live()));
    } finally { await c.close(); }
  },
  /** FREEZE: two tabs of the demo: the second does not listen by itself, shows the take-over prompt, and takes over only on a click. */
  async twotabs(o) {
    const c = await open(o);
    let p2 = null;
    try {
      const alwaysVisible = () => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); };   // a background tab would pause itself (FREEZE): both pages stay "visible" here
      await c.pg.evaluate(alwaysVisible);
      await c.pg.click('button.p2-mic'); await waitRec(c);
      p2 = await c.pg.browser().newPage();
      await p2.evaluateOnNewDocument(alwaysVisible);
      await p2.setViewport({ width: 390, height: 844 });
      await p2.evaluateOnNewDocument(fakeSpeech);
      await p2.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify({ settingsVersion: 2, ...s })); } catch { /* ignore */ } }, { formalizer: 'rules', normalizer: false, showTrace: false, language: 'en' });
      await p2.goto(`http://localhost:${c.srvPort}/webchat/index.html`, { waitUntil: 'domcontentloaded' });
      await p2.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
      await p2.click('button.p2-mic');
      await p2.waitForFunction(() => /in use in another tab/.test(document.body.innerText), { timeout: 5000, polling: 50 }).catch(() => {});
      check('the second tab says the microphone is in use in another tab', await p2.evaluate(() => /in use in another tab/.test(document.body.innerText)), await p2.evaluate(() => document.querySelector('.p2-log, .p2-chat')?.innerText?.slice(-200) ?? document.body.innerText.slice(-200)));
      check('and does not listen', !(await p2.evaluate(() => !!window.__sr.live())), await p2.evaluate(() => document.querySelector('button.p2-mic').dataset.mic + ' locks=' + typeof navigator.locks));
      check('the first tab still listens', await c.pg.evaluate(() => !!window.__sr.live()));
      const useHere = await p2.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /Use it here/.test(b.textContent)));
      await useHere.asElement().click();
      await p2.waitForFunction(() => window.__sr.live(), { timeout: 5000, polling: 50 }).catch(() => {});
      check('a click on "Use it here" takes over', await p2.evaluate(() => !!window.__sr.live()));
      await sleep(400);
      check('the first tab stopped listening', !(await c.pg.evaluate(() => !!window.__sr.live())));
    } finally { await p2?.close().catch(() => {}); await c.close(); }
  },
  /** NOISE: room talk in the always-open mic is ignored (greyed, tap to send anyway); real commands run. */
  async noise(o) {
    const c = await open(o, { language: 'ro' });
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const talk = ['să mi spună domnul bujii lui tata', 'Dar cu cine vorbești ce vrei', 'tata ce pot să zic', 'unchiul', 'voi', 'faci tu', 'enervant da', 'scuze'];
      const bots0 = await c.pg.$$eval('.p2-msg.is-bot:not(.is-note)', (e) => e.length);
      for (const t of talk) {
        await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 8000, polling: 30 });
        await sleep(2200);   // the rate guard: one voice message in 2 s
        await say(c, [t], { final: true });
        await sleep(1500);
      }
      const ignored = await c.pg.$$eval('.p2-msg.is-ignored', (e) => e.length);
      const replies = await c.pg.$$eval('.p2-msg.is-bot:not(.is-note)', (e) => e.length);
      const dropped = await c.pg.evaluate(() => (window.__psys2VoiceDrops ?? []).length);
      check('room talk is ignored (greyed or dropped as fragments), never answered', ignored + dropped >= talk.length - 1 && ignored >= 3 && replies === bots0, `${ignored} greyed + ${dropped} fragments of ${talk.length}, ${replies - bots0} replies`);
      const log = await c.pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]').filter((r) => r.status === 'ignored').length);
      check('the phrase log records `ignored`', log >= 3 && log === ignored, String(log));
      check('no busy veil from the talk', await c.pg.evaluate(() => !window.psys2.veiled));
      const n = await users(c);
      await c.pg.evaluate(() => document.querySelector('.p2-msg.is-ignored button')?.click());
      check('"tap to send anyway" sends it', (await waitUser(c, n, Date.now(), 4000)) !== null || (await users(c)) > n);
      await idle(c);
      for (const t of ['desenează o casă', 'desenează trei nori']) {
        await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 8000, polling: 30 });
        await sleep(2200);
        const k = await users(c);
        await say(c, [t], { final: true });
        const got = await waitUser(c, k, Date.now(), 5000);
        await idle(c);
        const last = await c.pg.$$eval('.p2-msg.is-user', (e) => e.at(-1)?.classList.contains('is-ignored'));
        check(`real command executed: ${t}`, got !== null && !last);
      }
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
