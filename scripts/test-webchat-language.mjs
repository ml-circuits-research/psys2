#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * LANG-FIXED: the selected language is the only language, in the real webchat (headless Chrome, fake SpeechRecognition, spy LanguageDetector).
 *
 *   ro30      Română selected, 30 voice turns with English-looking finals ("ok", "stop", "play little star", a name, ...), an English typed message, a tab switch,
 *             a hidden/visible browser tab, an engine worker restart and a page reload: the tag of EVERY SpeechRecognition start is ro-RO, the selector stays
 *             Română, no LanguageDetector call happens in a voice turn, every voice phrase record has recLang ro-RO + selectedLang ro.
 *   en10      the same with English selected and Romanian-looking finals: always en-US.
 *   command   the explicit switch commands change the selector, the recognizer tag and the reply says so; the typed-message hint offers a switch (button) and never switches by itself.
 *   voice     the reply voice: a Romanian voice when the device has one; a note in Settings and the default voice (never silence) when it has none.
 *   replay09e the Romanian voice session of 2026-11-09 (training/eval/expectations-2026-11-09e.jsonl) replayed as voice, recLang asserted on every record.
 *
 *   PUPPETEER_CORE=<scratch puppeteer-core install> node scripts/test-webchat-language.mjs [--only ro30,en10,command,voice,replay09e] [--throttle 1] [--chrome /usr/bin/chromium]
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { openChat } from './test-webchat-turns.mjs';
import { fakeSpeech } from './test-webchat-voice.mjs';

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Installed before the page scripts: the fake recognizer of the voice tests, a spy LanguageDetector (counts creates and detects), synthesis that records language and voice. */
function spies() {
  window.__ld = { create: 0, detect: 0, avail: 0 };
  window.LanguageDetector = {
    availability: async () => { window.__ld.avail++; return 'available'; },
    create: async () => { window.__ld.create++; return { detect: async (t) => { window.__ld.detect++; return [{ detectedLanguage: /[ăâîșț]|desen|casa|mare/i.test(t) ? 'ro' : 'en', confidence: 0.95 }]; } }; },
  };
  window.__voices = [];
  window.__utterances = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak(u) { window.__utterances.push({ lang: u.lang, voice: u.voice?.name ?? null }); window.__spoken = (window.__spoken || 0) + 1; setTimeout(() => u.onend?.(), 100); },
    cancel() {}, getVoices: () => window.__voices, addEventListener() {},
  } });
}
/** puppeteer serializes the function: the fake recognizer and the spies are joined into one script string. */
const init = `(${fakeSpeech.toString()})();(${spies.toString()})();`;
const open = (o, settings = {}) => openChat({ ...o, init, settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'ro', ...settings } });
const users = (c) => c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
const idle = (c) => c.pg.waitForFunction(() => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: 60000, polling: 30 });
const waitRec = (c) => c.pg.waitForFunction(() => window.__sr.live(), { timeout: 60000, polling: 20 });
const langs = (c) => c.pg.evaluate(() => window.__srLangs ?? []);
const ld = (c) => c.pg.evaluate(() => ({ ...window.__ld }));
const selector = (c) => c.pg.$eval('select.p2-select', (e) => e.value);
const saved = (c) => c.pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}'));
const phrases = (c) => c.pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]'));
/** One spoken message (a final), sent after the rate guard; resolves when the turn is over. */
async function voiceTurn(c, text) {
  await sleep(2150);   // the rate guard: one voice message in 2 s
  try { await waitRec(c); } catch (e) {
    const why = await c.pg.evaluate(() => JSON.stringify({ busy: window.psys2.busy, veiled: window.psys2.veiled, queue: window.psys2.queue?.length, mic: document.querySelector('button.p2-mic')?.className, starts: window.__sr.starts(), last: (window.__srLangs ?? []).slice(-2), status: document.querySelector('.p2-status')?.innerText }));
    throw new Error(`no live recognizer before "${text}" ${why}`);
  }
  const n = await users(c);
  await c.pg.evaluate((t) => window.__sr.final(t), text);
  await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 20000, polling: 20 }, n).catch(() => {});
  await idle(c);
}
const allTag = (arr, tag) => arr.length > 0 && arr.every((l) => l === tag);

const FINALS_RO = ['ok', 'stop', 'play little star', 'Maria', 'desenează o casă', 'ok', 'fii bucuros', 'show me a map', 'Ion', 'desenează un copac', 'yes', 'what is two plus two', 'fă o gură mare', 'Bern', 'nu', 'make a house', 'desenează trei nori', 'play', 'da', 'hello robot',
  'mută peștele', 'ok thanks', 'desenează un soare', 'next', 'fii trist', 'Paris', 'draw a heart', 'șterge tot', 'ok', 'mulțumesc'];

export const SCENARIOS = {
  async ro30(o) {
    const c = await open(o);
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      // language gate = beta: English and Romanian first, then every engine language; a language under the gate says "beta" (with its number), none is hidden
      const opts = await c.pg.$$eval('select.p2-select option', (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
      check('languages: en and ro first, then the engine languages; the gated ones say beta, none says "not measured"', opts[0]?.v === 'en' && opts[1]?.v === 'ro' && opts.slice(2).every((o) => !/not measured/.test(o.t) && (!/% right/.test(o.t) || /beta/.test(o.t))), JSON.stringify(opts.slice(0, 5)));
      check('ro30: the selector shows Română and the first start is ro-RO', (await selector(c)) === 'ro' && (await langs(c))[0] === 'ro-RO');
      const ld0 = await ld(c);
      let k = 0;
      for (const t of FINALS_RO.slice(0, 10)) { await voiceTurn(c, t); k++; }
      check('ro30: after 10 turns (English-looking finals included) the tag is still ro-RO', allTag(await langs(c), 'ro-RO') && (await selector(c)) === 'ro', JSON.stringify([...new Set(await langs(c))]));
      // a typed English message is read as Romanian, with no switch; the hint may appear (a button), the selector does not move
      await c.say('please make bigger eyes for the robot');
      await sleep(800);
      check('ro30: an English typed message does not change the language', (await selector(c)) === 'ro' && allTag(await langs(c), 'ro-RO'));
      // tab switch (the app's tab) and a hidden/visible browser tab
      await c.pg.evaluate(() => document.querySelector('#p2-tab-draw')?.click());
      for (const t of FINALS_RO.slice(10, 16)) { await voiceTurn(c, t); k++; }
      await c.pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(600);
      await c.pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      // the recognizer resumes by itself when the tab is visible again (a click now would switch it off)
      await c.pg.waitForFunction(() => window.__sr.live(), { timeout: 20000, polling: 50 }).catch(() => {});
      if (!(await c.pg.evaluate(() => !!window.__sr.live()))) await c.pg.click('button.p2-mic');
      await waitRec(c);
      for (const t of FINALS_RO.slice(16, 21)) { await voiceTurn(c, t); k++; }
      check('ro30: after a tab switch and a hidden/visible tab the tag is still ro-RO', allTag(await langs(c), 'ro-RO'), JSON.stringify([...new Set(await langs(c))]));
      // engine worker restart
      const s0 = await c.pg.evaluate(() => window.psys2.engineClient.stats.starts);
      await c.pg.evaluate(() => window.psys2.engineClient.kill('language test'));
      for (const t of FINALS_RO.slice(21, 27)) { await voiceTurn(c, t); k++; }
      const s1 = await c.pg.evaluate(() => window.psys2.engineClient.stats.starts);
      check('ro30: the engine worker was replaced and still reads Romanian', s1 > s0 && allTag(await langs(c), 'ro-RO') && (await selector(c)) === 'ro', `starts ${s0}->${s1}`);
      for (const t of FINALS_RO.slice(27)) { await voiceTurn(c, t); k++; }
      const ld1 = await ld(c);
      const all = await langs(c);
      check(`ro30: ${k} voice turns, ${all.length} recognizer starts, every tag is ro-RO`, k === 30 && allTag(all, 'ro-RO'), JSON.stringify([...new Set(all)]));
      // the spy: the typed message may have caused one detect (the hint); a voice turn never does
      check('ro30: no LanguageDetector call in any voice turn (only the typed-message hint may use it)', ld1.detect - ld0.detect <= 1 && ld1.create - ld0.create <= 1, JSON.stringify({ ld0, ld1 }));
      const recs = (await phrases(c)).filter((r) => r.mode === 'voice');
      check('ro30: every voice record stores recLang ro-RO and selectedLang ro', recs.length >= 20 && recs.every((r) => r.recLang === 'ro-RO' && r.selectedLang === 'ro'), `${recs.length} records; ${JSON.stringify(recs.filter((r) => r.recLang !== 'ro-RO').slice(0, 2).map((r) => [r.text, r.recLang]))}`);
      check('ro30: every reply is Romanian-side (lang ro on all records)', (await phrases(c)).every((r) => r.lang === 'ro' || r.status === 'ignored' || r.mode !== 'voice' && r.lang), JSON.stringify([...new Set((await phrases(c)).map((r) => r.lang))]));
      check('ro30: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
    // page reload: the saved selection is Romanian, the first start is ro-RO
    const c2 = await open(o);
    try {
      const st = await saved(c2);
      check('ro30: the saved settings keep Română and have no speechLang / auto', st.language === 'ro' && !('speechLang' in st) && st.settingsVersion >= 3, JSON.stringify({ l: st.language, v: st.settingsVersion }));
      await c2.pg.click('button.p2-mic'); await waitRec(c2);
      await voiceTurn(c2, 'ok');
      await c2.pg.reload({ waitUntil: 'domcontentloaded' });
      await c2.pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
      await c2.pg.click('button.p2-mic'); await waitRec(c2);
      await voiceTurn(c2, 'stop');
      check('ro30: after a page reload the selector is Română and the tag is ro-RO', (await selector(c2)) === 'ro' && allTag(await langs(c2), 'ro-RO'), JSON.stringify(await langs(c2)));
    } finally { await c2.close(); }
  },

  async en10(o) {
    const c = await open(o, { language: 'en' });
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const ld0 = await ld(c);
      for (const t of ['desenează o casă', 'ok', 'fă o gură mare', 'Maria', 'stop', 'desenează un copac', 'make a house', 'da', 'fii bucuros', 'hello']) await voiceTurn(c, t);
      check('en10: ten turns with Romanian-looking finals: every tag is en-US, the selector stays English', allTag(await langs(c), 'en-US') && (await selector(c)) === 'en', JSON.stringify([...new Set(await langs(c))]));
      await c.say('desenează o casă mare și un copac');
      await sleep(800);
      check('en10: a Romanian typed message does not change the language', (await selector(c)) === 'en' && allTag(await langs(c), 'en-US'));
      const ld1 = await ld(c);
      check('en10: no LanguageDetector call in the voice turns', ld1.detect - ld0.detect <= 1, JSON.stringify({ ld0, ld1 }));
      const recs = (await phrases(c)).filter((r) => r.mode === 'voice');
      check('en10: every voice record stores recLang en-US and selectedLang en', recs.length >= 8 && recs.every((r) => r.recLang === 'en-US' && r.selectedLang === 'en'));
      check('en10: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },

  async command(o) {
    const c = await open(o);
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      // typed hint: an English sentence with Romanian selected offers a switch, never switches by itself
      await c.say('please make bigger eyes for the robot');
      await c.pg.waitForFunction(() => document.querySelector('.p2-lang-hint button, [data-lang-hint]'), { timeout: 6000, polling: 50 }).catch(() => {});
      const hint = await c.pg.evaluate(() => document.querySelector('.p2-lang-hint')?.innerText ?? null);
      check('command: the typed English message gets the one-line hint (in Romanian) with a button', /Pare engleză — schimb limba\?/.test(hint ?? ''), String(hint));
      check('command: the hint did not switch anything', (await selector(c)) === 'ro');
      await c.pg.evaluate(() => document.querySelector('[data-lang-hint]')?.click());
      await sleep(400);
      check('command: the hint button switches to English (selector, and the recognizer restarts as en-US)', (await selector(c)) === 'en' && (await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'en-US', { timeout: 4000, polling: 50 }).then(() => true).catch(() => false)));
      check('command: the hint is gone after the switch', await c.pg.evaluate(() => !document.querySelector('[data-lang-hint]')));
      // explicit commands, in either language, typed and spoken
      const r1 = await c.say('speak Romanian');
      check('command: "speak Romanian" changes the selector and says so', (await selector(c)) === 'ro' && /switched to Romanian|am trecut/i.test(r1.reply), r1.reply.slice(0, 80));
      check('command: the recognizer restarts as ro-RO', await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'ro-RO', { timeout: 4000, polling: 50 }).then(() => true).catch(() => false));
      const r2 = await c.say('vorbește în engleză');
      check('command: "vorbește în engleză" switches to English with a Romanian confirmation', (await selector(c)) === 'en' && /am trecut la engleză/i.test(r2.reply), r2.reply.slice(0, 80));
      check('command: the recognizer restarts as en-US', await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'en-US', { timeout: 4000, polling: 50 }).then(() => true).catch(() => false));
      await voiceTurn(c, 'switch to Romanian');
      check('command: the spoken command switches too', (await selector(c)) === 'ro' && await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'ro-RO', { timeout: 4000, polling: 50 }).then(() => true).catch(() => false));
      // the common variants, in both languages and both directions, from either selected language (LANG-FIXED follow-up: "treci pe engleză")
      const tag = { en: 'en-US', ro: 'ro-RO' };
      for (const [text, want] of [['treci pe engleză', 'en'], ['treci pe română', 'ro'], ['schimbă limba în engleză', 'en'], ['vreau în română', 'ro'], ['vorbește englezește', 'en'], ['treci pe română', 'ro'],
        ['speak English please', 'en'], ['vorbește românește', 'ro'], ['change the language to English', 'en'], ['switch to Romanian', 'ro'], ['vreau în engleză', 'en'], ['schimbă limba în română', 'ro'],
        ['can you speak English?', 'en'], ['speak Romanian please', 'ro']]) {
        const r = await c.say(text);
        await sleep(900);   // a restart of the recognizer settles before the next switch (a burst of restarts pauses the microphone by design)
        const okSel = (await selector(c)) === want;
        // the recognizer follows the selector while it listens (the microphone pauses itself after a burst of restarts: then only the selector is checked)
        const okTag = await c.pg.waitForFunction((t) => { const l = window.__sr.live(); return !l || l.lang === t; }, { timeout: 4000, polling: 50 }, tag[want]).then(() => true).catch(() => false);
        check(`command variant: "${text}" -> ${want} (selector and recognizer tag)`, okSel && okTag, `${await selector(c)} live=${await c.pg.evaluate(() => window.__sr.live()?.lang ?? null)} ${r.reply.slice(0, 50)}`);
      }
      const st = await saved(c);
      check('command: the switch is saved', st.language === 'ro');
      const sel = await c.pg.evaluate(() => { const e = document.querySelector('select.p2-select'); e.value = 'en'; e.dispatchEvent(new Event('change')); return e.value; });
      check('command: the selector itself changes the tag', sel === 'en' && await c.pg.waitForFunction(() => window.__sr.live()?.lang === 'en-US', { timeout: 4000, polling: 50 }).then(() => true).catch(() => false));
      check('command: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },

  async voice(o) {
    const c = await open(o, { speaker: true });
    try {
      await c.say('desenează o casă');
      await sleep(500);
      const u1 = await c.pg.evaluate(() => window.__utterances.slice());
      check('voice: with no Romanian voice installed the answer is still spoken (default voice, ro-RO)', u1.length > 0 && u1.every((u) => u.lang === 'ro-RO' && u.voice === null), JSON.stringify(u1.slice(0, 2)));
      const settingsTab = async (id) => { await c.pg.evaluate((id) => document.querySelector(`#p2-st-${id}`)?.click(), id); await sleep(250); return c.pg.evaluate(() => document.querySelector('.p2-modal-body')?.innerText ?? ''); };
      await c.pg.evaluate(() => { window.__voices = [{ name: 'Test English', lang: 'en-US' }]; });
      await c.pg.click('button[aria-label="Settings"]');
      await sleep(300);
      const note1 = await settingsTab('voice');
      check('voice: Settings > Voice says that no Romanian voice is installed', /No Romanian voice is installed/.test(note1), note1.slice(0, 160));
      await c.pg.evaluate(() => { window.__voices = [{ name: 'Test English', lang: 'en-US' }, { name: 'Test Romana', lang: 'ro-RO' }]; });
      await settingsTab('language');
      const note2 = await settingsTab('voice');
      check('voice: with a Romanian voice the note names it', /Reads Romanian with: Test Romana/.test(note2), note2.slice(0, 160));
      check('voice: Settings > Voice has no "Speech language" / automatic choice any more', !/Speech language|follows the session language/.test(note2));
      await c.pg.click('button[aria-label="Close settings"]');
      const n0 = await c.pg.evaluate(() => window.__utterances.length);
      await c.say('desenează un copac');
      await sleep(500);
      const u2 = await c.pg.evaluate((n) => window.__utterances.slice(n), n0);
      check('voice: the Romanian voice reads the answer', u2.length > 0 && u2.every((u) => u.lang === 'ro-RO' && u.voice === 'Test Romana'), JSON.stringify(u2.slice(0, 2)));
      check('voice: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },

  async replay09e(o) {
    const rows = readFileSync(new URL('../training/eval/expectations-2026-11-09e.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const c = await open(o);
    try {
      await c.pg.click('button.p2-mic'); await waitRec(c);
      const ld0 = await ld(c);
      let n = 0;
      for (const r of rows) {
        const tab = { robot: 'robot', tictactoe: 'tictactoe', draw: 'draw', diagram: 'diagram' }[r.tab];
        if (tab) await c.pg.evaluate((t) => document.querySelector(`#p2-tab-${t}`)?.click(), tab);
        await voiceTurn(c, r.text); n++;
      }
      const all = await langs(c);
      check(`replay09e: ${n} voice records of the Romanian session: every recognizer start is ro-RO`, n === rows.length && allTag(all, 'ro-RO'), JSON.stringify([...new Set(all)]));
      const recs = (await phrases(c)).filter((r) => r.mode === 'voice');
      check('replay09e: every record has recLang ro-RO and selectedLang ro', recs.length >= n - 2 && recs.every((r) => r.recLang === 'ro-RO' && r.selectedLang === 'ro'), `${recs.length} records`);
      const ld1 = await ld(c);
      check('replay09e: no LanguageDetector call', ld1.detect === ld0.detect && ld1.create === ld0.create, JSON.stringify({ ld0, ld1 }));
      check('replay09e: the selector is still Română', (await selector(c)) === 'ro');
      check('replay09e: no page errors', c.errors.length === 0, c.errors[0] ?? '');
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
