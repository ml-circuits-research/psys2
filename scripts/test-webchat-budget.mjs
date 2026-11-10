#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fault-injection tests of the compute budget in the real webchat (COMPUTE-BUDGET item 6, spec 06 "Engine worker"): headless Chrome, 390x844, CPU throttling (default 4x).
 * The page is opened with ?psys2test=1 and `window.__psys2Fault = { <exact text>: 'op' | 'matcher' | 'translator' }`: the engine worker then runs an infinite synchronous
 * loop inside a world operation, in the rules matcher or in the translator when it handles that text (inert without the query parameter).
 *
 * For each fault: the page stays responsive (echo of the typed message < 100 ms, no gap in a 25 ms heartbeat over 500 ms), the turn ends at the watchdog with
 * "That took too long, I stopped it" (a replacement worker starts), the next message works, and the same input is not run again (no new kill, the stored outcome
 * is answered). Also Stop during the loop, and the same with hands-free voice on.
 *
 *   node scripts/test-webchat-budget.mjs [--only op,matcher,translator,stop,voice,repeat,evidence] [--throttle 4] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';
import { fakeSpeech } from './test-webchat-voice.mjs';

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WATCHDOG_MS = 2000;
const FAULTS = { op: 'what is 3 plus 4', matcher: 'make a green house', translator: 'make a red house', stop: 'what is 5 plus 6', voice: 'make a blue house' };

const open = (o, { voice = false, language = 'en' } = {}) => openChat({ ...o, query: '?psys2test=1', ...(voice ? { init: fakeSpeech } : {}), settings: { formalizer: 'rules', normalizer: false, showTrace: false, language, timeLimits: { watchdogMs: WATCHDOG_MS } } });
const arm = (c) => c.pg.evaluate((f) => { window.__psys2Fault = Object.fromEntries(Object.entries(f).map(([k, v]) => [v, k === 'stop' ? 'op' : k === 'voice' ? 'matcher' : k])); }, FAULTS);
const stats = (c) => c.pg.evaluate(() => JSON.parse(JSON.stringify(window.psys2.engineClient.stats)));
const lastBot = (c) => c.pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot:not([data-runaway])')].at(-1)?.querySelector('.p2-bubble')?.innerText ?? '');
/** Page-side probes: the time from Enter to the echo of the message, and the largest gap of a 25 ms heartbeat. */
const probes = (c) => c.pg.evaluate(() => {
  const users = document.querySelectorAll('.p2-msg.is-user').length;
  window.__probe = { echo: null, t0: null, maxGap: 0 };
  document.querySelector('input.p2-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && window.__probe.t0 === null) window.__probe.t0 = performance.now(); }, { capture: true });
  new MutationObserver((_, obs) => { if (window.__probe.echo === null && document.querySelectorAll('.p2-msg.is-user').length > users) { window.__probe.echo = performance.now(); obs.disconnect(); } }).observe(document.querySelector('.p2-log'), { childList: true, subtree: true });
  let last = performance.now();
  window.__probe.timer = setInterval(() => { const n = performance.now(); window.__probe.maxGap = Math.max(window.__probe.maxGap, n - last); last = n; }, 25);
});
const probeResult = (c) => c.pg.evaluate(() => { clearInterval(window.__probe.timer); return { echo: window.__probe.echo !== null && window.__probe.t0 !== null ? Math.round(window.__probe.echo - window.__probe.t0) : null, maxGap: Math.round(window.__probe.maxGap) }; });
const waitIdle = (c, ms) => c.pg.waitForFunction(() => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: ms, polling: 30 });
const typeEnter = async (c, text) => { await c.pg.type('input.p2-text', text, { delay: 0 }); await c.pg.keyboard.press('Enter'); };

async function faultCase(o, kind) {
  const c = await open(o, { language: kind === 'translator' ? 'ro' : 'en' });   // LANG-FIXED: an English session never calls the translator; the translator fault needs Română selected
  const text = FAULTS[kind];
  try {
    await arm(c);
    const warm = await c.say('hello');
    check(`${kind}: the chat works before the fault`, warm.ok && /hello|salut|bun[ăa]/i.test(warm.reply), warm.reply.slice(0, 40));
    const s0 = await stats(c);
    await probes(c);
    const t0 = Date.now();
    await typeEnter(c, text);
    await waitIdle(c, WATCHDOG_MS + 15000);
    const ms = Date.now() - t0;
    const pr = await probeResult(c);
    const reply = await lastBot(c);
    check(`${kind}: the echo of the typed message comes in < 100 ms`, pr.echo !== null && pr.echo < 100, `${pr.echo} ms`);
    check(`${kind}: the page never freezes during the loop (largest heartbeat gap < 500 ms)`, pr.maxGap < 500, `${pr.maxGap} ms`);
    check(`${kind}: the watchdog ends the turn`, /took too long, I stopped it/.test(reply) && ms < WATCHDOG_MS + 6000, `${ms} ms, ${JSON.stringify(reply.slice(0, 50))}`);
    await c.pg.waitForFunction((n) => window.psys2.engineClient.stats.kills.length > n, { timeout: 5000, polling: 20 }, s0.kills.length).catch(() => {});
    const s1 = await stats(c);
    check(`${kind}: the engine worker was replaced once`, s1.kills.length === s0.kills.length + 1 && s1.starts === s0.starts + 1, `kills ${s1.kills.length - s0.kills.length}, starts ${s1.starts - s0.starts}, stage ${s1.kills.at(-1)?.stage}`);
    const notice = await c.pg.$eval('.p2-msg[data-runaway]', (e) => e.innerText).catch(() => '');
    check(`${kind}: a visible notice names the stage and offers the details`, /Stopped a runaway computation in stage \S+ after/.test(notice) && /copy details/.test(notice), notice.slice(0, 90));
    const rec = await c.lastPhrase();
    check(`${kind}: the phrase log records timeout and the stage`, rec?.outcome === 'timeout' && !!rec.stage && rec.watchdog?.input === text, JSON.stringify({ outcome: rec?.outcome, stage: rec?.stage, watchdog: rec?.watchdog && Object.keys(rec.watchdog) }));
    const next = await c.say('hello again', { timeout: 30000 });
    check(`${kind}: the next message works (replacement worker)`, next.ok && /hello|bun[ăa]|salut/i.test(next.reply), `${next.ms} ms ${next.reply.slice(0, 40)}`);
    const t1 = Date.now();
    const again = await c.say(text, { timeout: 8000 });
    const s2 = await stats(c);
    check(`${kind}: the same input is not run again (stored outcome, no new kill)`, s2.kills.length === s1.kills.length && s2.refused === s1.refused + 1 && /did not try it again/.test(again.reply) && Date.now() - t1 < 3000, `${Date.now() - t1} ms ${again.reply.slice(0, 60)}`);
    const upper = await c.say(`  ${text.toUpperCase()}  `, { timeout: 8000 });
    check(`${kind}: nor its normalized variants (case, spaces)`, (await stats(c)).kills.length === s1.kills.length && /did not try it again/.test(upper.reply));
    const dry = await c.pg.evaluate((t) => window.psys2.session.dryRead(t, { language: 'en' }), text);
    check(`${kind}: nor a dry run of it (the voice end-of-turn check)`, dry.complete === false && dry.reason === 'known-slow' && (await stats(c)).kills.length === s1.kills.length, JSON.stringify(dry));
    check(`${kind}: no page errors`, c.errors.length === 0, c.errors[0] ?? '');
  } finally { await c.close(); }
}

const openRo = (o, browserApis = {}) => openChat({ ...o, query: '?psys2test=1', browserApis, settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'auto', translation: 'auto', languageDetection: 'auto', timeLimits: { watchdogMs: WATCHDOG_MS } } });
const usageOf = (c) => c.pg.evaluate(() => JSON.parse(JSON.stringify({ tr: window.psys2.engineClient.usage, det: window.psys2.engineClient.detection })));

export const SCENARIOS = {
  /** The discourse memory survives a watchdog restart (COMPUTE-BUDGET D item 2). */
  async memory(o) {
    const c = await open(o);
    try {
      await arm(c);
      await c.say('How far is Paris from Rome?');
      const s0 = await stats(c);
      await typeEnter(c, FAULTS.op);
      await waitIdle(c, WATCHDOG_MS + 15000);
      await c.pg.waitForFunction((n) => window.psys2.engineClient.stats.kills.length > n, { timeout: 5000, polling: 20 }, s0.kills.length).catch(() => {});
      const s1 = await stats(c);
      check('memory: the worker was replaced', s1.starts === s0.starts + 1 && s1.kills.length === s0.kills.length + 1, `starts ${s1.starts - s0.starts}`);
      const r = await c.say('And from Berlin?', { timeout: 30000 });
      check('memory: an ellipsis still resolves against the question asked before the restart', /Paris and Berlin/.test(r.reply), r.reply.slice(0, 80));
    } finally { await c.close(); }
  },
  /** Romanian in the worker: the page's on-device translator and detector are used over a message; a page that does not answer falls back to the rules (item 3). */
  async bridge(o) {
    for (const mode of ['success', 'hang']) {
      const c = await openRo(o, { mode });
      try {
        const t = Date.now();
        const r = await c.say('câte zile are iunie?', { timeout: 30000 });
        const u = await usageOf(c);
        check(`bridge ${mode}: the Romanian question is answered`, r.ok && /30|treizeci|iunie|June/i.test(r.reply), `${Date.now() - t} ms ${r.reply.slice(0, 60)}`);
        const tr = u.tr.find((x) => x.direction === 'ro->en');
        if (mode === 'success') check('bridge success: the translation came from the page\'s browser API (checked in the worker)', tr?.strategy === 'browser-api' && u.det.some((d) => d.strategy === 'browser-api'), JSON.stringify({ tr, det: u.det[0] }));
        else check('bridge hang: no answer from the page within the deadline -> the rules translated, the turn did not stall', tr?.strategy === 'rules' && tr.fallback && /timed out/.test(tr.reason ?? '') && Date.now() - t < 12000, JSON.stringify(tr));
        check(`bridge ${mode}: no page errors, no worker kill`, c.errors.length === 0 && (await stats(c)).kills.length === 0, c.errors[0] ?? '');
      } finally { await c.close(); }
    }
  },
  /**
   * The on-device Translator and LanguageDetector, faked (scripts/lib/fake-browser-apis.mjs), in every mode (COMPUTE-BUDGET F): the code behind them only ran in a real Chrome and
   * froze the page there. Each turn: the echo of the typed message < 100 ms, no gap in the heartbeat, no worker kill, the turn answered. success: the checker ran and accepted
   * (the old trigger "fă o casă verde și una galbenă" is the first row); slow: later than the 700 ms bridge deadline -> the rules; wrong output: the checker rejects it -> the rules.
   */
  async ondevice(o) {
    const turn = async (c, label, text, { timeout = 40000 } = {}) => {
      const s0 = await stats(c);
      await probes(c);
      const t = Date.now();
      await typeEnter(c, text);
      await waitIdle(c, timeout);
      const ms = Date.now() - t;
      const pr = await probeResult(c);
      const reply = await lastBot(c);
      const u = await usageOf(c);
      const s1 = await stats(c);
      check(`${label}: the echo of the typed message comes in < 100 ms`, pr.echo !== null && pr.echo < 100, `${pr.echo} ms`);
      check(`${label}: no freeze (heartbeat gap < 500 ms) and no worker kill`, pr.maxGap < 500 && s1.kills.length === s0.kills.length, `${pr.maxGap} ms, kills ${s1.kills.length - s0.kills.length}`);
      check(`${label}: the turn is answered (not "took too long")`, reply.length > 0 && !/took too long/.test(reply), `${ms} ms ${JSON.stringify(reply.slice(0, 60))}`);
      return { reply, ms, tr: u.tr.filter((x) => x.direction === 'ro->en').at(-1), det: u.det.at(-1) };
    };
    const TRIGGER = 'fă o casă verde și una galbenă';
    // success: the regression row first
    let c = await openRo(o, { mode: 'success' });
    try {
      const r = await turn(c, 'on-device success, the old trigger', TRIGGER);
      check('on-device success: the browser translation passed the checker (it ran, no loop)', r.tr?.strategy === 'browser-api' && !r.tr.fallback, JSON.stringify(r.tr));
      check('on-device success: the language detector of the page was used', r.det?.strategy === 'browser-api' && r.det.detected === 'ro', JSON.stringify(r.det));
      const st = await c.state();
      check('on-device success: both houses were drawn (green and yellow)', /green/.test(st) && /yellow/.test(st), st.slice(0, 80));
      const calls = await c.fake.calls();
      check('on-device success: the page fake was called for the translation', calls.some((x) => x.op === 'translate' && x.text === TRIGGER), `${calls.length} calls`);
      const WRONG = [
        ['empty', 'câte zile are iunie?', /empty translation/],
        ['garbage', 'câte zile are iunie?', /question form not preserved/],
        ['numbers', 'desenează 3 cercuri', /numbers not preserved/],
        ['names', 'mă cheamă Andrei', /names not preserved/],
        ['negation', 'nu vreau o casă', /negation not preserved/],
      ];
      for (const [wrong, text, why] of WRONG) {
        await c.fake.set({ mode: 'wrong', wrong });
        const w = await turn(c, `on-device wrong output (${wrong})`, text);
        check(`on-device wrong output (${wrong}): the checker rejected it and the rules translated`, w.tr?.strategy === 'rules' && w.tr.fallback && why.test(w.tr.reason ?? ''), JSON.stringify(w.tr));
      }
      await c.fake.set({ mode: 'wrong', wrong: 'punct' });
      const p = await turn(c, 'on-device wrong output (starts with punctuation)', TRIGGER);
      check('on-device wrong output (punctuation first): the checker ran to the end (accepted or rejected, never looped)', !!p.tr && (p.tr.strategy === 'browser-api' || p.tr.fallback), JSON.stringify(p.tr));
      check('on-device modes: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
    // slow: later than the bridge deadline
    c = await openRo(o, { mode: 'slow' });
    try {
      const r = await turn(c, 'on-device slow', TRIGGER);
      check('on-device slow: no answer within the 700 ms bridge deadline -> the rules translated', r.tr?.strategy === 'rules' && r.tr.fallback && /timed out/.test(r.tr.reason ?? ''), JSON.stringify(r.tr));
      check('on-device slow: the turn took the deadline, not the delay of the fake', r.ms < 1500 + 4000, `${r.ms} ms`);
    } finally { await c.close(); }
    // the older window.ai shapes
    c = await openRo(o, { mode: 'success', shape: 'ai' });
    try {
      const r = await turn(c, 'on-device older ai.translator shape', TRIGGER);
      check('on-device older ai.* shape: the browser translation passed the checker', r.tr?.strategy === 'browser-api' && !r.tr.fallback, JSON.stringify(r.tr));
    } finally { await c.close(); }
  },
  op: (o) => faultCase(o, 'op'),
  matcher: (o) => faultCase(o, 'matcher'),
  translator: (o) => faultCase(o, 'translator'),
  async stop(o) {
    const c = await open(o);
    try {
      await arm(c);
      await c.say('make a house');
      const before = await c.state();
      await probes(c);
      await typeEnter(c, FAULTS.stop);
      await c.pg.waitForFunction(() => window.psys2.busy && document.querySelector('button.p2-send.is-stop'), { timeout: 5000 });
      await sleep(400);
      const t = Date.now();
      await c.pg.click('button.p2-send');
      await c.pg.waitForFunction(() => !window.psys2.busy && [...document.querySelectorAll('.p2-msg.is-stopped')].at(-1)?.innerText.startsWith('Stopped.'), { timeout: 4000 });
      const ms = Date.now() - t;
      const pr = await probeResult(c);
      check('stop: Stop ends a turn stuck in a synchronous loop quickly', ms < 2000, `${ms} ms`);
      check('stop: the page stayed responsive meanwhile', pr.maxGap < 500, `${pr.maxGap} ms`);
      check('stop: the world state is as before the message', (await c.state()) === before);
      const r = await c.say('hello', { timeout: 30000 });
      check('stop: the chat works afterwards', r.ok && /hello/i.test(r.reply), r.reply.slice(0, 40));
    } finally { await c.close(); }
  },
  /** Restart handling (COMPUTE-BUDGET E): the first message right after a kill waits for the new worker ("restarting…"), then gets a full turn clock; a worker that never starts is a distinct visible error. */
  async restart(o) {
    let c = await open(o);
    try {
      await arm(c);
      await c.say('make a house');
      const s0 = await stats(c);
      await probes(c);
      await typeEnter(c, FAULTS.stop);
      await c.pg.waitForFunction(() => window.psys2.busy && document.querySelector('button.p2-send.is-stop'), { timeout: 5000 });
      await sleep(300);
      await c.pg.click('button.p2-send');
      // the message right behind Stop, while the replacement worker is still starting
      await c.pg.type('input.p2-text', 'hello right away', { delay: 0 });
      await c.pg.keyboard.press('Enter');
      let sawRestarting = false;
      for (let i = 0; i < 400 && !sawRestarting; i++) { sawRestarting = await c.pg.evaluate(() => /restarting/.test(document.querySelector('.p2-thinking-label')?.innerText ?? '')); if (!sawRestarting) await sleep(15); }
      await c.pg.waitForFunction(() => /hello right away/.test([...document.querySelectorAll('.p2-msg.is-user')].at(-1)?.innerText ?? '') && !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: 45000, polling: 30 });
      const reply = await lastBot(c);
      const s1 = await stats(c);
      check('restart: the message sent while the worker restarts is answered (not "took too long")', /hello/i.test(reply) && !/took too long/.test(reply), reply.slice(0, 50));
      check('restart: the page showed "restarting…" meanwhile (or the worker was already warm)', sawRestarting || s1.starts === s0.starts + 1, `seen ${sawRestarting}`);
      check('restart: exactly one replacement worker', s1.starts === s0.starts + 1 && s1.kills.length === s0.kills.length + 1, `starts ${s1.starts - s0.starts}`);
    } finally { await c.close(); }
    c = await openChat({ ...o, query: '?psys2test=1', settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'en', timeLimits: { watchdogMs: WATCHDOG_MS, startMs: 10000 } } });
    try {
      await arm(c);
      await c.say('hello');
      await c.pg.evaluate(() => { window.__psys2StartHang = true; });
      await typeEnter(c, FAULTS.op);
      await c.pg.waitForFunction(() => window.psys2.engineClient.stats.kills.length > 0, { timeout: 15000, polling: 30 });
      await waitIdle(c, 20000);
      const s0 = await stats(c);
      await c.pg.type('input.p2-text', 'hello there', { delay: 0 });
      await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => document.querySelector('.p2-msg[data-engine-down]'), { timeout: 25000, polling: 50 });
      await waitIdle(c, 5000);
      const s1 = await stats(c);
      const msg = await c.pg.$eval('.p2-msg[data-engine-down]', (e) => e.innerText);
      check('restart: a worker that never starts gives a distinct visible error', /could not restart.*reload/i.test(msg) && !/took too long/.test(msg), msg.slice(0, 80));
      check('restart: no chain of kills or starts (one start timeout)', s1.startTimeouts === 1 && s1.starts === s0.starts, JSON.stringify({ starts: s1.starts - s0.starts, to: s1.startTimeouts }));
      const rec = await c.lastPhrase();
      check('restart: the phrase log records the engine error', !!rec?.detail?.engineDown || !!rec?.engineDown, JSON.stringify(rec?.detail ?? null).slice(0, 100));
    } finally { await c.close(); }
  },
  async voice(o) {
    const c = await open(o, { voice: true });
    try {
      await arm(c);
      await c.pg.click('button.p2-mic');
      await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 5000, polling: 20 });
      check('voice: hands-free is on', await c.pg.evaluate(() => !!window.__sr.live()));
      await probes(c);
      const s0 = await stats(c);
      const n = await c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await c.pg.evaluate((t) => { window.__probe.t0 = performance.now(); window.__sr.say([t], { final: true }); }, FAULTS.voice);
      await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 6000, polling: 10 }, n).catch(() => {});
      await c.pg.waitForFunction(() => window.psys2.engineClient.stats.kills.length > 0, { timeout: WATCHDOG_MS + 10000, polling: 50 }).catch(() => {});
      await waitIdle(c, WATCHDOG_MS + 15000).catch(() => {});
      const pr = await probeResult(c);
      const s1 = await stats(c);
      check('voice: the page never freezes while the voice command loops', pr.maxGap < 500, `${pr.maxGap} ms`);
      check('voice: the runaway computation was stopped by a kill (dry run or turn)', s1.kills.length === s0.kills.length + 1, `kills ${s1.kills.length - s0.kills.length} (${s1.kills.map((k) => k.kind).join(',')})`);
      const again = await c.say(FAULTS.voice, { timeout: 8000 });
      const s3 = await stats(c);
      check('voice: the same input typed afterwards is not run again', s3.kills.length === s1.kills.length && /did not try it again/.test(again.reply), again.reply.slice(0, 60));
      await sleep(2300);   // the rate guard of voice messages
      await c.pg.waitForFunction(() => !!window.__sr.live(), { timeout: 15000, polling: 50 }).catch(() => {});
      const n2 = await c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await c.pg.evaluate(() => window.__sr.say(['make a house'], { final: true }));
      await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 30000, polling: 20 }, n2);
      await waitIdle(c, 30000);
      check('voice: the next spoken message works (replacement worker)', /house/i.test(await lastBot(c)), (await lastBot(c)).slice(0, 50));
    } finally { await c.close(); }
  },
  async evidence(o) {
    const c = await open(o);
    try {
      await arm(c);
      await c.say('make a house');
      await c.pg.evaluate(() => { setTimeout(() => { const end = performance.now() + 900; while (performance.now() < end) { /* a deliberate long task on the page thread */ } }, 0); });
      for (let i = 0; i < 4 && !(await c.pg.evaluate(() => window.psys2.longTasks.some((t) => t.ms >= 200))); i++) {   // the observer delivers in batches: wait, and repeat the busy task a few times under load
        await c.pg.waitForFunction(() => window.psys2.longTasks.some((t) => t.ms >= 200), { timeout: 4000, polling: 50 }).catch(() => {});
        if (!(await c.pg.evaluate(() => window.psys2.longTasks.some((t) => t.ms >= 200)))) await c.pg.evaluate(() => { setTimeout(() => { const end = performance.now() + 900; while (performance.now() < end) { /* busy */ } }, 0); });   // a real page task (a CDP evaluate is not reported as a long task)
      }
      const lt = await c.pg.evaluate(() => window.psys2.longTasks.map((t) => ({ ...t })));
      // Chrome withholds longtask entries from a page that is not visible (several headless pages run in parallel in the suite): then the observer is wired but silent
      const wired = await c.pg.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('longtask') && document.visibilityState === 'visible');
      check('evidence: a main-thread task over 200 ms is recorded with its stage', lt.some((t) => t.ms >= 200 && typeof t.stage === 'string') || !wired, JSON.stringify(lt.slice(-2)) + (wired ? '' : ' (page not visible: no entries delivered)'));
      await c.say(FAULTS.op, { timeout: 15000 });
      await c.pg.waitForFunction(() => window.psys2.engineClient.stats.kills.length > 0, { timeout: 5000, polling: 20 });
      const exp = await c.pg.evaluate(async () => { const m = await import('./ui/phrase-log.mjs'); const app = window.psys2; return JSON.parse(m.toJSON(JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]'), { diagnostics: { longTasks: app.longTasks, engine: { ...app.engineClient.stats } } })); });
      check('evidence: the phrase-log export carries diagnostics (long tasks, engine kills)', Array.isArray(exp.diagnostics?.longTasks) && exp.diagnostics.engine.kills.length === 1 && exp.records.some((r) => r.outcome === 'timeout' && r.stage), JSON.stringify(exp.diagnostics?.engine?.kills?.[0] ?? null));
    } finally { await c.close(); }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const only = arg('only', Object.keys(SCENARIOS).join(',')).split(',');
  const o = { throttle: Number(arg('throttle', 4)), chrome: arg('chrome') };
  for (const name of only) { console.log(`== ${name} (cpu ${o.throttle}x)`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran to the end`, false, String(e?.stack ?? e).slice(0, 300)); } console.log(''); }
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
