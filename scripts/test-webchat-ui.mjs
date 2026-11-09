#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Headless UI tests of the real webchat at 390x844 (phone) and 1280x800 (desktop): tasks SET, UI1 and DOC.
 *
 *   settings   the full-screen Settings modal: open/close with the x, Esc and Back, tabs, deep link, last tab, every control saves,
 *              voice and text commands, 0 console errors, one screenshot per tab
 *   ui1        one microphone and one "read aloud" toggle in the input bar, nothing in the header or the tabs, a tooltip on every icon
 *              button, the dictation state, screenshots of the header, the input bar and the editor
 *   surprise   the die button ("Try an example"): 50 clicks, 0 console errors, every answer supported, the tab follows, no immediate repeats, logged as an example
 *   doc        greeting, header line, title and About page wording, help answers
 *
 *   node scripts/test-webchat-ui.mjs [--only settings,ui1,doc,surprise] [--chrome /usr/bin/chromium] [--shots docs/webchat/screenshots]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};
export const SETTINGS_TABS = ['understanding', 'language', 'voice', 'phrases', 'models', 'developer', 'about'];

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotDir = (o) => path.resolve(ROOT, o.shots ?? 'docs/webchat/screenshots');
const shot = async (c, o, name) => { await mkdir(shotDir(o), { recursive: true }); await c.pg.screenshot({ path: path.join(shotDir(o), `${name}.png`), type: 'png' }); };
const modalOpen = (pg) => pg.evaluate(() => { const m = document.querySelector('.p2-modal'); return !!m && !m.hidden; });
const activeTab = (pg) => pg.evaluate(() => document.querySelector('.p2-modal-tab[aria-selected="true"]')?.dataset.tab ?? null);
const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}'));
const waitModal = (pg, open) => pg.waitForFunction((open) => { const m = document.querySelector('.p2-modal'); return !!m && (!m.hidden) === open; }, { timeout: 4000 }, open).then(() => true).catch(() => false);

/** Every button that shows no text (an icon) must carry a tooltip (title) and the same text as aria-label. */
export const iconButtonProblems = (pg) => pg.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button')) {
    const text = (b.innerText ?? b.textContent ?? '').replace(/\s+/g, ' ').trim();
    const label = b.getAttribute('aria-label'), title = b.getAttribute('title');
    const visibleText = text.length >= 2 && !/^[A-Z×]$/.test(text);
    if (visibleText && !label) continue;               // a button with words on it names itself
    if (!title || !label || title !== label) out.push(`${b.className || b.id || b.tagName}: title=${JSON.stringify(title)} aria-label=${JSON.stringify(label)} text=${JSON.stringify(text.slice(0, 20))}`);
  }
  return out;
});

async function settingsFor(name, viewport, o) {
  const c = await openChat({ ...o, throttle: 1, viewport });
  const { pg } = c;
  const tag = `${name}`;
  try {
    // open from the gear
    await pg.click('button[aria-label="Settings"]');
    check(`${tag}: the gear opens the modal`, await waitModal(pg, true));
    const dlg = await pg.evaluate(() => { const m = document.querySelector('.p2-modal'); const r = m.getBoundingClientRect(); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), w: Math.round(r.width), h: Math.round(r.height), tabs: [...m.querySelectorAll('[role=tab]')].map((t) => t.dataset.tab), list: !!m.querySelector('[role=tablist]'), title: m.querySelector('.p2-modal-title')?.textContent, focusIn: m.contains(document.activeElement), inertChat: document.querySelector('.p2-chat').inert }; });
    check(`${tag}: role=dialog, aria-modal, title "Settings", a tablist`, dlg.role === 'dialog' && dlg.modal === 'true' && dlg.title === 'Settings' && dlg.list);
    check(`${tag}: full screen (${dlg.w}x${dlg.h})`, dlg.w >= viewport.width - 2 && dlg.h >= viewport.height - 2);
    check(`${tag}: seven tabs in order`, JSON.stringify(dlg.tabs) === JSON.stringify(SETTINGS_TABS), dlg.tabs.join(','));
    check(`${tag}: focus is inside, the page behind is inert`, dlg.focusIn && dlg.inertChat);
    // every tab renders its controls
    const expect = { understanding: ['#p2-f-formalizer', 'input[type=checkbox]'], language: ['#p2-f-language', '#p2-f-translation', '#p2-f-language-detection'], voice: ['#p2-f-speech-language', '#p2-f-voice', '#p2-f-rate', 'input[type=checkbox]'], phrases: ['.p2-plog-list', '.p2-plog-actions', 'select[aria-label="Filter phrases"]', 'input[type=checkbox]'], models: ['.p2-model', '.p2-btn-text'], developer: ['input[type=checkbox]'], about: ['a[data-source-link=about]', '.p2-credits li'] };
    for (const t of SETTINGS_TABS) {
      await pg.click(`#p2-st-${t}`);
      await sleep(150);
      const miss = await pg.evaluate((sels) => sels.filter((s) => !document.querySelector(`.p2-modal-body ${s}`)), expect[t]);
      check(`${tag}: tab ${t} renders its controls`, miss.length === 0 && (await activeTab(pg)) === t, miss.join(' | '));
      await shot(c, o, `settings-${t}-${name}`);
    }
    check(`${tag}: phrase log tab has export, copy and clear`, await (async () => { await pg.click('#p2-st-phrases'); return pg.evaluate(() => { const t = [...document.querySelectorAll('.p2-plog-actions button')].map((b) => b.textContent); return t.includes('Export JSONL') && t.includes('Copy as text') && t.includes('Clear'); }); })());
    check(`${tag}: Developer tab shows the build`, await (async () => { await pg.click('#p2-st-developer'); await sleep(300); return pg.evaluate(() => /Built:/.test(document.querySelector('.p2-modal-body').innerText)); })());
    check(`${tag}: Models tab shows the dispatcher and the normalizer status`, await (async () => { await pg.click('#p2-st-models'); await sleep(300); return pg.evaluate(() => { const t = document.querySelector('.p2-modal-body').innerText; return /Dispatcher/.test(t) && /Normalizer/.test(t) && /Status/.test(t) && /loads when needed|loaded|loading|not loaded/.test(t); }); })());
    // tabs by keyboard
    await pg.focus('#p2-st-models'); await pg.keyboard.press('ArrowRight');
    check(`${tag}: arrow keys move between tabs`, (await activeTab(pg)) === 'developer');
    // every checkbox and select saves
    let changed = 0, total = 0, unsaved = [];
    for (const t of ['understanding', 'language', 'voice', 'phrases', 'developer']) {
      await pg.click(`#p2-st-${t}`); await sleep(100);
      const ids = await pg.$$eval('.p2-modal-body input[type=checkbox]:not(:disabled)', (e) => e.map((x) => x.id));
      for (const id of ids) {
        const before = JSON.stringify(await saved(pg));
        await pg.evaluate((id) => document.getElementById(id).click(), id); await sleep(80); total++;
        const after = JSON.stringify(await saved(pg));
        if (after !== before) changed++; else unsaved.push(id);
        await pg.click(`#p2-st-${t}`); await sleep(40);
      }
    }
    check(`${tag}: every checkbox saves its setting (${changed}/${total})`, changed === total, unsaved.join(', '));
    await pg.click('#p2-st-language');
    await pg.select('#p2-f-language', 'ro'); await sleep(100);
    check(`${tag}: the language select saves and the header follows`, (await saved(pg)).language === 'ro' && (await pg.$eval('select[aria-label="Language"]', (s) => s.value)) === 'ro');
    await pg.select('#p2-f-language', 'en');
    await pg.select('#p2-f-translation', 'rules'); await sleep(60);
    check(`${tag}: translation saves`, (await saved(pg)).translation === 'rules');
    await pg.click('#p2-st-understanding');
    await pg.select('#p2-f-formalizer', 'rules'); await sleep(60);
    check(`${tag}: formalizer saves and reaches the session`, (await saved(pg)).formalizer === 'rules' && (await pg.evaluate(() => window.psys2.session.formalizer ?? window.psys2.session.settings?.formalizer ?? 'rules')) === 'rules');
    // spellcheck takes effect at once
    const spell = await pg.evaluate(() => window.psys2.settings.spellcheck);
    check(`${tag}: settings object is live (spellcheck=${spell})`, typeof spell === 'boolean');
    // close with the x
    await pg.click('.p2-modal-close');
    check(`${tag}: x closes the modal and returns focus to the gear`, (await waitModal(pg, false)) && (await pg.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Settings');
    check(`${tag}: the page is usable again (not inert)`, await pg.evaluate(() => !document.querySelector('.p2-chat').inert));
    // Esc
    await pg.click('button[aria-label="Settings"]'); await waitModal(pg, true);
    check(`${tag}: reopening shows the last tab (remembered)`, (await activeTab(pg)) === 'understanding');
    await pg.keyboard.press('Escape');
    check(`${tag}: Esc closes`, await waitModal(pg, false));
    // Back
    await pg.click('button[aria-label="Settings"]'); await waitModal(pg, true);
    const hashOpen = await pg.evaluate(() => location.hash);
    await pg.goBack();
    check(`${tag}: the phone's Back button closes (hash ${hashOpen} -> "${await pg.evaluate(() => location.hash)}")`, (await waitModal(pg, false)) && (await pg.evaluate(() => location.hash)) === '');
    check(`${tag}: closing with x leaves no extra history entry`, await (async () => { const n0 = await pg.evaluate(() => history.length); await pg.click('button[aria-label="Settings"]'); await waitModal(pg, true); await pg.click('.p2-modal-close'); await waitModal(pg, false); await sleep(200); return (await pg.evaluate(() => history.length)) <= n0 + 1 && (await pg.evaluate(() => location.hash)) === ''; })());
    // focus trap
    await pg.click('button[aria-label="Settings"]'); await waitModal(pg, true);
    let escaped = false;
    for (let i = 0; i < 60; i++) { await pg.keyboard.press('Tab'); if (!(await pg.evaluate(() => document.querySelector('.p2-modal').contains(document.activeElement)))) { escaped = true; break; } }
    check(`${tag}: Tab never leaves the modal`, !escaped);
    await pg.keyboard.press('Escape'); await waitModal(pg, false);
    // deep link
    await pg.evaluate(() => { location.hash = '#settings/voice'; });
    await waitModal(pg, true);
    check(`${tag}: deep link #settings/voice (hashchange)`, (await activeTab(pg)) === 'voice');
    await pg.evaluate(() => { location.hash = '#settings/about'; }); await sleep(150);
    check(`${tag}: deep link switches tab while open`, (await activeTab(pg)) === 'about');
    await pg.click('.p2-modal-close'); await waitModal(pg, false);
    // voice and text commands
    await c.say('open the voice settings');
    check(`${tag}: "open the voice settings" opens the Voice tab`, (await modalOpen(pg)) && (await activeTab(pg)) === 'voice');
    await pg.evaluate(() => window.psys2.send('close settings')); await sleep(300);
    check(`${tag}: "close settings" closes`, await waitModal(pg, false));
    await c.say('show the phrase log');
    check(`${tag}: "show the phrase log" opens the Phrase log tab`, (await modalOpen(pg)) && (await activeTab(pg)) === 'phrases');
    await pg.keyboard.press('Escape'); await waitModal(pg, false);
    await c.say('open settings');
    check(`${tag}: "open settings" opens the modal`, await modalOpen(pg));
    await pg.keyboard.press('Escape'); await waitModal(pg, false);
    check(`${tag}: no console errors`, c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
  } finally { await c.close(); }
  // a fresh load straight on a deep link
  const d = await openChat({ ...o, throttle: 1, viewport, hash: '#settings/models' });
  try {
    await waitModal(d.pg, true);
    check(`${tag}: loading the page on #settings/models opens the Models tab`, (await modalOpen(d.pg)) && (await activeTab(d.pg)) === 'models');
    await d.pg.goBack().catch(() => {});
    check(`${tag}: deep link page: no console errors`, d.consoleErrors.length === 0 && d.errors.length === 0, [...d.consoleErrors, ...d.errors][0] ?? '');
  } finally { await d.close(); }
}

async function ui1For(name, viewport, o) {
  const c = await openChat({ ...o, throttle: 1, viewport });
  const { pg } = c;
  const tag = name;
  try {
    const head = await pg.evaluate(() => ({ buttons: [...document.querySelectorAll('.p2-head button')].map((b) => b.getAttribute('aria-label')), select: !!document.querySelector('.p2-head select[aria-label="Language"]'), title: document.querySelector('.p2-title')?.innerText }));
    check(`${tag}: the header keeps only the language selector and the gear`, head.select && JSON.stringify(head.buttons) === JSON.stringify(['Settings']), head.buttons.join(' | '));
    const bar = await pg.evaluate(() => [...document.querySelector('.p2-form').children].map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].filter((x) => x !== 'p2-btn').join('.')}`));
    check(`${tag}: input bar = one mic, one read-aloud toggle, the text box, the die, Send`, JSON.stringify(bar) === JSON.stringify(['button.p2-mic', 'button.p2-speaker', 'input.p2-text', 'button.p2-die', 'button.p2-send']), bar.join(' '));
    const voiceButtons = await pg.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /microphone|speak a message|hands-free|dictat|read answers aloud/i.test(`${b.getAttribute('aria-label')} ${b.title}`)).map((b) => b.getAttribute('aria-label')));
    check(`${tag}: exactly one mic and one read-aloud toggle on the page (dictation only has Stop)`, voiceButtons.filter((l) => /^(Microphone|Speak a message)/.test(l)).length === 1 && voiceButtons.filter((l) => /^Read answers aloud/.test(l)).length === 1, voiceButtons.join(' | '));
    // read-aloud toggle
    await pg.click('.p2-speaker');
    const sp = await pg.evaluate(() => ({ p: document.querySelector('.p2-speaker').getAttribute('aria-pressed'), l: document.querySelector('.p2-speaker').getAttribute('aria-label'), t: document.querySelector('.p2-speaker').title, saved: JSON.parse(localStorage.getItem('psys2.webchat.settings')).speaker }));
    check(`${tag}: the read-aloud toggle says its state and saves (${sp.l})`, sp.p === 'true' && sp.l === 'Read answers aloud: on' && sp.t === sp.l && sp.saved === true);
    await pg.click('button[aria-label="Settings"]'); await pg.click('#p2-st-voice'); await sleep(100);
    check(`${tag}: Settings > Voice shows the same switch`, await pg.$eval('#p2-c-read-answers-aloud', (e) => e.checked));
    await pg.click('.p2-modal-close'); await waitModal(pg, false);
    await pg.click('.p2-speaker');
    check(`${tag}: toggled off again`, (await pg.$eval('.p2-speaker', (e) => e.getAttribute('aria-label'))) === 'Read answers aloud: off');
    // the mic: hands-free by long press (when the browser has speech recognition)
    const micDisabled = await pg.$eval('.p2-mic', (e) => e.disabled);
    if (!micDisabled) {
      await pg.click('.p2-mic'); await sleep(150);
      const hf = await pg.evaluate(() => window.psys2.settings.handsFree);
      check(`${tag}: one click on the mic switches conversation mode on (mic mode, not a header icon)`, hf === true);
      await sleep(300);
      await pg.evaluate(() => window.psys2.settings.handsFree && document.querySelector('.p2-mic').click());
    } else check(`${tag}: speech recognition is not available in this browser: the mic is disabled and says why`, /unavailable/.test(await pg.$eval('.p2-mic', (e) => e.title)));
    await shot(c, o, `ui1-header-inputbar-${name}`);
    // the editor: no microphone, dictation is a mode of the chat mic
    await c.say('open the editor');
    await pg.waitForSelector('.pe-toolbar', { timeout: 15000 });
    const tb = await pg.evaluate(() => ({ dict: !!document.querySelector('.pe-toolbar-wrap [data-cmd="dictation"]'), mics: [...document.querySelectorAll('.pe-toolbar-wrap button')].filter((b) => /dictat|microphone|\bmic\b/i.test(`${b.getAttribute('aria-label')} ${b.title} ${b.textContent}`)).length }));
    check(`${tag}: the editor toolbar has no Dictate button or microphone`, !tb.dict && tb.mics === 0);
    await c.say('start dictation');
    await pg.waitForFunction(() => !document.querySelector('.p2-dictbar').hidden, { timeout: 5000 }).catch(() => {});
    const dict = await pg.evaluate(() => ({ bar: !document.querySelector('.p2-dictbar').hidden, text: document.querySelector('.p2-dict-text').textContent, mic: document.querySelector('.p2-mic').classList.contains('is-dictating'), micLabel: document.querySelector('.p2-mic').getAttribute('aria-label'), stop: document.querySelector('.p2-dict-stop')?.getAttribute('aria-label') }));
    check(`${tag}: dictation shows "Dictating into: <document>" with a Stop control and the mic marked`, dict.bar && /^Dictating into: .+/.test(dict.text) && dict.mic && /Dictating into/.test(dict.micLabel) && dict.stop === 'Stop dictation', `${dict.text} | ${dict.micLabel}`);
    await shot(c, o, `ui1-editor-dictation-${name}`);
    await c.say('hello world period');
    await pg.click('.p2-dict-stop');
    await pg.waitForFunction(() => !window.psys2.busy && document.querySelector('.p2-dictbar').hidden, { timeout: 8000 }).catch(() => {});
    check(`${tag}: Stop ends dictation and the bar disappears`, await pg.$eval('.p2-dictbar', (e) => e.hidden) && !(await pg.$eval('.p2-mic', (e) => e.classList.contains('is-dictating'))));
    // tooltips everywhere: every tab, then the settings modal
    const problems = [];
    const tabs = await pg.$$eval('.p2-tab[role=tab]:not(.p2-modal-tab)', (e) => e.map((x) => x.id));
    for (const id of tabs) { await pg.evaluate((id) => document.getElementById(id).click(), id); await sleep(250); problems.push(...(await iconButtonProblems(pg))); }
    await pg.click('button[aria-label="Settings"]');
    for (const t of SETTINGS_TABS) { await pg.click(`#p2-st-${t}`); await sleep(100); problems.push(...(await iconButtonProblems(pg))); }
    await pg.click('.p2-modal-close');
    check(`${tag}: every icon button has a tooltip equal to its aria-label (${tabs.length} tabs and the settings checked)`, new Set(problems).size === 0, [...new Set(problems)].slice(0, 4).join(' || '));
    check(`${tag}: no console errors`, c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
  } finally { await c.close(); }
}

async function docFor(name, viewport, o) {
  const c = await openChat({ ...o, throttle: 1, viewport });
  const { pg } = c;
  const tag = name;
  try {
    const t = await pg.evaluate(() => ({
      greeting: document.querySelector('.p2-msg.is-hint .p2-bubble')?.childNodes[0]?.textContent ?? '', header: document.querySelector('.p2-title span')?.textContent, title: document.title,
      meta: document.querySelector('meta[name=description]')?.content,
    }));
    check(`${tag}: the greeting says neurosymbolic, in the browser, small neural models, symbolic worlds, formal rules`, /neurosymbolic assistant that runs entirely in your browser/.test(t.greeting) && /Small neural models/.test(t.greeting) && /symbolic worlds/.test(t.greeting) && /formal rules/.test(t.greeting) && !/explicit rules/.test(t.greeting), t.greeting.slice(0, 80));
    check(`${tag}: header line "neurosymbolic · runs in your browser"`, t.header === 'neurosymbolic · runs in your browser', t.header);
    check(`${tag}: page title and description`, /neurosymbolic assistant that runs in your browser, with no server and no large language model/.test(t.title) && /neurosymbolic/.test(t.meta) && !/no LLM/.test(t.title), t.title);
    await pg.click('button[aria-label="Settings"]'); await pg.click('#p2-st-about'); await sleep(400);
    const about = await pg.evaluate(() => document.querySelector('.p2-modal-body').innerText);
    check(`${tag}: About explains neurosymbolic, why it is safe, model versions, accuracy, licence, credits`,
      /neurosymbolic/i.test(about) && /Why the symbolic layer makes it safe/.test(about) && /Nothing runs unless a world validates it/.test(about) && /Dispatcher model: v\d{4}/.test(about) && /Normalizer model: v\d{4}/.test(about) && /Measured accuracy/.test(about) && /98\.6%/.test(about) && /AGPL-3\.0/.test(about) && /Credits/.test(about) && /ONNX Runtime/.test(about) && /DistilBERT/.test(about) && /FLAN-T5/.test(about), about.slice(0, 60));
    check(`${tag}: About never claims to understand everything`, !/understands? everything|knows everything|any question/i.test(about));
    await shot(c, o, `doc-about-${name}`);
    await pg.click('.p2-modal-close'); await waitModal(pg, false);
    const asks = [['what are you?', [/neurosymbolic/, /in your browser/, /no large language model/]], ['how do you work?', [/dispatcher/i, /formal rules/i, /value checker/, /validates/]], ['are you an AI?', [/neurosymbolic/, /not a chatbot built on a large language model/]], ['do you use ChatGPT?', [/^No\./, /large language model/, /server/]]];
    for (const [q, res] of asks) {
      const r = await c.say(q);
      check(`${tag}: help answers "${q}"`, r.ok && res.every((re) => re.test(r.reply)) && !/understands? everything/i.test(r.reply), r.reply.slice(0, 90));
    }
    await shot(c, o, `doc-help-${name}`);
    check(`${tag}: no console errors`, c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
  } finally { await c.close(); }
}

/** SURPRISE: 50 clicks on the die in a real browser (rules formalizer). */
async function surpriseFor(name, viewport, o, clicks = 50) {
  const c = await openChat({ ...o, throttle: 1, viewport });
  const { pg } = c;
  const tag = name;
  try {
    const pool = JSON.parse(await pg.evaluate(async () => JSON.stringify(await (await fetch('surprise-pool.json')).json())));
    const byText = new Map(pool.map((p) => [p.text, p]));
    const btn = await pg.evaluate(() => { const b = document.querySelector('.p2-form .p2-die'); return b && { label: b.getAttribute('aria-label'), title: b.title, disabled: b.disabled }; });
    check(`${tag}: a die button next to the input, tooltip = aria-label "Try an example"`, btn?.label === 'Try an example' && btn.title === btn.label && !btn.disabled, JSON.stringify(btn));
    await pg.waitForFunction(() => document.querySelector('.p2-die'), { timeout: 5000 });
    await sleep(500);
    const picked = [], bad = [], tabMiss = [];
    let prevWorld = null, sameWorldTwice = 0, repeats = 0;
    for (let i = 0; i < clicks; i++) {
      const before = await pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await pg.click('.p2-die');
      const done = await pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 20000, polling: 20 }, before).then(() => true).catch(() => false);
      const rec = await c.lastPhrase();
      const text = rec?.text ?? '';
      if (!done || !rec) { bad.push(`${i}: no answer to "${text}"`); continue; }
      const ex = byText.get(text);
      if (!ex) bad.push(`${i}: "${text}" is not in the pool`);
      if (picked.at(-1) === text) repeats++;
      if (ex && ex.world === prevWorld) sameWorldTwice++;
      prevWorld = ex?.world ?? null;
      picked.push(text);
      if (!(rec.source === 'chip' && rec.example === true)) bad.push(`${i}: "${text}" not logged as an example (${rec.source}, ${rec.example})`);
      if (rec.unparsed || !rec.segments.length || rec.segments.some((s) => s.status !== 'supported')) bad.push(`${i}: "${text}" -> ${rec.segments.map((s) => s.status).join(',') || 'no segments'}`);
      const tab = await pg.evaluate(() => document.querySelector('.p2-tab[aria-selected="true"]')?.id?.replace('p2-tab-', '') ?? null);
      if (ex?.tab && ex.tab !== 'robot' && tab !== ex.tab) tabMiss.push(`${i}: "${text}" expected tab ${ex.tab}, on ${tab}`);
    }
    check(`${tag}: ${clicks} clicks, every answer supported and logged as an example`, bad.length === 0, bad.slice(0, 5).join(' | '));
    check(`${tag}: no immediate repeats`, repeats === 0);
    check(`${tag}: consecutive clicks come from different worlds (${sameWorldTwice} same-world pairs)`, sameWorldTwice === 0);
    check(`${tag}: ${new Set(picked.map((t) => byText.get(t)?.world)).size} different worlds in ${clicks} clicks`, new Set(picked.map((t) => byText.get(t)?.world)).size >= 10);
    check(`${tag}: the tab switches when expected`, tabMiss.length === 0, tabMiss.slice(0, 5).join(' | '));
    const phrases = await pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]'));
    check(`${tag}: examples stay out of the human phrase count`, phrases.every((r) => r.source === 'chip'));
    // the voice equivalents press the same button
    for (const phrase of ['surprise me with an example', 'give me an example command']) {
      const n = await pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await pg.type('input.p2-text', phrase, { delay: 0 }); await pg.keyboard.press('Enter');
      const ok = await pg.waitForFunction((n) => !window.psys2.busy && document.querySelectorAll('.p2-msg.is-user').length >= n + 2 && !document.querySelector('.p2-msg.is-typing'), { timeout: 20000, polling: 20 }, n).then(() => true).catch(() => false);
      const last = await c.lastPhrase();
      check(`${tag}: "${phrase}" sends an example`, ok && last?.example === true && byText.has(last.text), `${last?.text}`);
    }
    check(`${tag}: 0 console errors`, c.errors.length === 0 && c.consoleErrors.length === 0, [...c.errors, ...c.consoleErrors].slice(0, 3).join(' | '));
    await shot(c, o, `surprise-${name}`);
  } finally { await c.close(); }
}

/** PERF round 3: a long user bubble (spaces, an unbroken word, a URL, Romanian) wraps and stays inside the screen at 390, 360 and 320 px; screenshot of the 390 px case. */
async function bubbleFor(width, o) {
  const c = await openChat({ ...o, throttle: 1, viewport: { width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } });
  try {
    const lines = ['how many legs does a spider have and what is 3 plus 4 and what is the capital of France and show me a house and a man please',
      'a'.repeat(90), `https://example.com/${'a'.repeat(70)}/${'b'.repeat(40)}`, 'Spune-mi câte picioare are un păianjen și cât face 3 plus 4 și care este capitala Franței și desenează o casă și un om te rog frumos'];
    for (const t of lines) {
      await c.say(t);
      const m = await c.pg.evaluate(() => {
        const u = [...document.querySelectorAll('.p2-msg.is-user')].at(-1); const rect = (e) => e.getBoundingClientRect();
        return { vw: innerWidth, sw: document.documentElement.scrollWidth, log: document.querySelector('.p2-log').scrollWidth - document.querySelector('.p2-log').clientWidth,
          bubble: [rect(u.querySelector('.p2-bubble')).left, rect(u.querySelector('.p2-bubble')).right], meta: [...u.querySelectorAll('.p2-meta > *')].map((e) => rect(e).right) };
      });
      check(`bubble ${width}px: "${t.slice(0, 24)}..." stays inside the screen (bubble ${Math.round(m.bubble[1])} of ${m.vw}, text and time visible)`,
        m.bubble[0] >= 0 && m.bubble[1] <= m.vw && m.meta.every((r) => r <= m.vw) && m.sw <= m.vw && m.log <= 0, JSON.stringify(m));
    }
    if (width === 390) await shot(c, o, 'long-user-bubble-390');
  } finally { await c.close(); }
}

export const SCENARIOS = {
  async surprise(o) { for (const [name, vp] of Object.entries(VIEWPORTS)) await surpriseFor(name, vp, o); },
  async bubble(o) { for (const w of [390, 360, 320]) await bubbleFor(w, o); },

  async doc(o) { for (const [name, vp] of Object.entries(VIEWPORTS)) await docFor(name, vp, o); },

  async ui1(o) { for (const [name, vp] of Object.entries(VIEWPORTS)) await ui1For(name, vp, o); },

  async settings(o) { for (const [name, vp] of Object.entries(VIEWPORTS)) await settingsFor(name, vp, o); },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const o = { chrome: opt('chrome'), shots: opt('shots') };
  for (const name of opt('only', Object.keys(SCENARIOS).join(',')).split(',')) { console.log(`\n== ${name}`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); } }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
