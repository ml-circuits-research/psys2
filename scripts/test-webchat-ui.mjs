#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Headless UI tests of the real webchat at 390x844 (phone) and 1440x900 (desktop): tasks SET, UI1 and DOC.
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
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
export const SETTINGS_TABS = ['reading', 'languages', 'models', 'privacy', 'developer', 'about'];   // SETTINGS-COHERENT: Reading, Languages and voice, Models, Privacy and history, Developer, About

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
    check(`${tag}: six tabs in order`, JSON.stringify(dlg.tabs) === JSON.stringify(SETTINGS_TABS), dlg.tabs.join(','));
    check(`${tag}: focus is inside, the page behind is inert`, dlg.focusIn && dlg.inertChat);
    // every tab renders its controls
    const expect = { reading: ['#p2-c-helperModel', 'input[type=checkbox]'], languages: ['#p2-f-language', '#p2-f-translation', '#p2-f-languageHint', '#p2-f-voice', '#p2-f-rate', 'input[type=checkbox]'], privacy: ['.p2-plog-list', '.p2-plog-actions', 'select[aria-label="Filter phrases"]', 'input[type=checkbox]'], models: ['.p2-model', '.p2-btn-text', '[data-card=translation]'], developer: ['input[type=checkbox]'], about: ['a[data-source-link=about]', '.p2-credits li'] };
    for (const t of SETTINGS_TABS) {
      await pg.click(`#p2-st-${t}`);
      await sleep(150);
      const miss = await pg.evaluate((sels) => sels.filter((s) => !document.querySelector(`.p2-modal-body ${s}`)), expect[t]);
      check(`${tag}: tab ${t} renders its controls`, miss.length === 0 && (await activeTab(pg)) === t, miss.join(' | '));
      await shot(c, o, `settings-${t}-${name}`);
    }
    check(`${tag}: phrase log tab has Export JSON and Clear, no Copy as text`, await (async () => { await pg.click('#p2-st-privacy'); return pg.evaluate(() => { const t = [...document.querySelectorAll('.p2-plog-actions button')].map((b) => b.textContent); return t.includes('Export JSON') && !t.includes('Copy as text') && t.includes('Clear'); }); })());
    check(`${tag}: Developer tab shows the build`, await (async () => { await pg.click('#p2-st-developer'); await sleep(300); return pg.evaluate(() => /Built:/.test(document.querySelector('.p2-modal-body').innerText)); })());
    check(`${tag}: Models tab shows the dispatcher and the normalizer status`, await (async () => { await pg.click('#p2-st-models'); await sleep(300); return pg.evaluate(() => { const t = document.querySelector('.p2-modal-body').innerText; return /Dispatcher/.test(t) && /Normalizer/.test(t) && /Status/.test(t) && /loads when needed|loaded|loading|not loaded/.test(t); }); })());
    // tabs by keyboard
    await pg.focus('#p2-st-models'); await pg.keyboard.press('ArrowRight');
    check(`${tag}: arrow keys move between tabs`, (await activeTab(pg)) === 'privacy');
    // every checkbox and select saves
    let changed = 0, total = 0, unsaved = [];
    for (const t of ['reading', 'languages', 'privacy', 'developer']) {
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
    await pg.click('#p2-st-languages');
    await pg.select('#p2-f-language', 'ro'); await sleep(100);
    check(`${tag}: the language select saves and the header follows`, (await saved(pg)).language === 'ro' && (await pg.$eval('select[aria-label="Language"]', (s) => s.value)) === 'ro');
    await pg.select('#p2-f-language', 'en');
    await pg.select('#p2-f-translation', 'rules'); await sleep(60);
    check(`${tag}: translation saves`, (await saved(pg)).translation === 'rules');
    await pg.click('#p2-st-reading');
    // defaults by the numbers (2026-11-14): no who-reads-first select; one helper-model switch (on by default), the garbled-sentence download is off
    const rd = await pg.evaluate(() => ({ none: !document.querySelector('#p2-f-reading, #p2-f-formalizer, #p2-f-reading-strategy'), helper: document.querySelector('#p2-c-helperModel')?.checked, label: document.querySelector('label[for=p2-c-helperModel], #p2-c-helperModel')?.parentElement?.textContent ?? '', garbled: document.querySelector('#p2-c-normalizer')?.checked }));
    check(`${tag}: Reading has the helper-model switch (on), no "who reads first" select, the garbled-sentence download is off`, rd.none && rd.helper === true && /Use the helper model for typos and long sentences/.test(rd.label) && rd.garbled === false, JSON.stringify(rd).slice(0, 160));
    await pg.click('#p2-c-helperModel'); await sleep(60);
    check(`${tag}: helper model off saves and reaches the session (rules)`, (await saved(pg)).helperModel === false && (await saved(pg)).formalizer === 'rules' && (await saved(pg)).nxStrategy === 'rules');
    await pg.click('#p2-c-helperModel'); await sleep(60);
    check(`${tag}: helper model on saves (encoder, rules read)`, (await saved(pg)).helperModel === true && (await saved(pg)).formalizer === 'encoder' && (await saved(pg)).nxStrategy === 'rules');
    // SETTINGS-COHERENT 5: every option says what it does and when; no internal name in a label
    const noteProblems = [];
    for (const t of ['reading', 'languages', 'privacy', 'developer']) {
      await pg.click(`#p2-st-${t}`); await sleep(100);
      noteProblems.push(...await pg.evaluate((t) => [...document.querySelectorAll('.p2-modal-body [data-option]')].flatMap((e) => { const l = (e.querySelector('label')?.textContent ?? '').trim(); const bad = []; if (!e.querySelector('.p2-opt-what')?.textContent) bad.push('what'); if (!e.querySelector('.p2-opt-when')?.textContent) bad.push('when'); if (/dispatcher|\bhead\b|\bnx\b|veto|matrix|formalizer|encoder/i.test(l)) bad.push('internal name'); return bad.length ? [`${t}/${e.dataset.option}: ${bad.join(', ')}`] : []; }), t));
    }
    check(`${tag}: every option has what / when and no internal name in its label`, noteProblems.length === 0, noteProblems.join(' | '));
    // SETTINGS-COHERENT 3: the wake word option names no Romanian word
    await pg.click('#p2-st-languages'); await sleep(80);
    const wake = await pg.evaluate(() => document.querySelector('[data-option=wakeWord]')?.innerText ?? '');
    check(`${tag}: the wake word option names the app and the English words only`, /PSys2/.test(wake) && /robot/.test(wake) && !/robotule|asistent|calculator/i.test(wake), wake.replace(/\s+/g, ' ').slice(0, 160));
    // SETTINGS-COHERENT 6: Developer carries the failed experiment with its numbers
    await pg.click('#p2-st-developer'); await sleep(80);
    const dev = await pg.evaluate(() => document.querySelector('[data-option=experiments]')?.innerText ?? '');
    check(`${tag}: Developer shows one Experiments list, each with its last numbers and date, and no edit head`, /Last measured 2026-11-13/.test(dev) && !/reword a part/.test(dev), dev.replace(/\s+/g, ' ').slice(0, 120));
    // SETTINGS-COHERENT 1: the history uses the whole height of its panel (list bottom reaches the buttons, list at least half of the panel)
    await pg.click('#p2-st-privacy'); await sleep(150);
    const hist = await pg.evaluate(() => { const b = document.querySelector('.p2-modal-body').getBoundingClientRect(), l = document.querySelector('.p2-plog-list').getBoundingClientRect(), a = document.querySelector('.p2-plog-actions').getBoundingClientRect(); return { body: [Math.round(b.top), Math.round(b.bottom)], list: [Math.round(l.top), Math.round(l.bottom)], actions: [Math.round(a.top), Math.round(a.bottom)], h: Math.round(l.height), bh: Math.round(b.height) }; });
    check(`${tag}: the history list fills the rest of its panel (list ${hist.h}px of ${hist.bh}px, ends ${hist.actions[0] - hist.list[1]}px above the buttons, buttons end ${hist.body[1] - hist.actions[1]}px above the panel bottom)`, hist.h >= 200 && hist.actions[0] - hist.list[1] <= 24 && hist.body[1] - hist.actions[1] <= 40, JSON.stringify(hist));
    await shot(c, o, `settings-history-${name}`);
    // the models tab: the translation engine
    await pg.click('#p2-st-models'); await sleep(150);
    const mt = await pg.evaluate(() => document.querySelector('[data-card=translation]')?.innerText ?? '');
    check(`${tag}: Models shows the translation engine (browser Translator, selected language)`, /Browser Translator/.test(mt) && /Translation/.test(mt), mt.replace(/\s+/g, ' ').slice(0, 120));
    // spellcheck takes effect at once
    const spell = await pg.evaluate(() => window.psys2.settings.spellcheck);
    check(`${tag}: settings object is live (spellcheck=${spell})`, typeof spell === 'boolean');
    // close with the x
    await pg.click('.p2-modal-close');
    check(`${tag}: x closes the modal and returns focus to the gear`, (await waitModal(pg, false)) && (await pg.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Settings');
    check(`${tag}: the page is usable again (not inert)`, await pg.evaluate(() => !document.querySelector('.p2-chat').inert));
    // Esc
    await pg.click('button[aria-label="Settings"]'); await waitModal(pg, true);
    check(`${tag}: reopening shows the last tab (remembered)`, (await activeTab(pg)) === 'models');
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
    check(`${tag}: deep link #settings/voice (hashchange) opens Languages and voice`, (await activeTab(pg)) === 'languages');
    await pg.evaluate(() => { location.hash = '#settings/about'; }); await sleep(150);
    check(`${tag}: deep link switches tab while open`, (await activeTab(pg)) === 'about');
    await pg.click('.p2-modal-close'); await waitModal(pg, false);
    // voice and text commands
    await c.say('open the voice settings');
    check(`${tag}: "open the voice settings" opens the Languages and voice tab`, (await modalOpen(pg)) && (await activeTab(pg)) === 'languages');
    await pg.evaluate(() => window.psys2.send('close settings')); await sleep(300);
    check(`${tag}: "close settings" closes`, await waitModal(pg, false));
    await c.say('show the phrase log');
    check(`${tag}: "show the phrase log" opens the Privacy and history tab`, (await modalOpen(pg)) && (await activeTab(pg)) === 'privacy');
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
  // SETTINGS-COHERENT 2: a device with nothing saved, and one with an old saved pair, both show Hybrid (default)
  for (const [label, raw] of [['nothing saved', {}], ['old saved rules + neural (v4)', { formalizer: 'rules', nxStrategy: 'neural', settingsVersion: 4 }]]) {
    const f = await openChat({ ...o, throttle: 1, viewport, hash: '#settings/reading', settings: { __raw: raw } });
    try {
      await waitModal(f.pg, true);
      const v = await f.pg.$eval('#p2-c-helperModel', (x) => x.checked).catch(() => null);
      check(`${tag}: ${label}: the helper-model switch is on`, v === true, String(v));
    } finally { await f.close(); }
  }
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
    await pg.click('button[aria-label="Settings"]'); await pg.click('#p2-st-languages'); await sleep(100);
    check(`${tag}: Settings > Voice shows the same switch`, await pg.$eval('#p2-c-speaker', (e) => e.checked));
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


/** FB: thumbs up / down under every answer, the form of the thumbs-down, undo + correction link, history, export, spoken complaint. */
async function feedbackFor(name, viewport, o) {
  const c = await openChat({ ...o, throttle: 1, viewport });
  const pg = c.pg;
  const tag = `fb ${name}`;
  try {
    await pg.evaluate(() => { window.__blobs = []; const orig = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); }; });
    const rec = (i = -1) => pg.evaluate((i) => { const a = JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]'); return a.at(i) ?? null; }, i);
    await pg.evaluate(() => window.psys2.showTab('robot'));
    const before = await c.state();
    await c.say('make the eyes blue');
    const btns = await pg.$$eval('.p2-msg.is-bot:not(.is-typing) .p2-fb-btn', (e) => e.map((b) => [b.dataset.vote, b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]));
    check(`${tag}: up and down buttons under the answer with labels`, btns.length >= 2 && btns.at(-2)[0] === 'up' && btns.at(-1)[0] === 'down' && btns.at(-1)[1] === 'Not what I wanted', JSON.stringify(btns.slice(-2)));
    const clickVote = (vote) => pg.evaluate((v) => [...document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)')].at(-1).querySelector(`.p2-fb-btn[data-vote="${v}"]`).click(), vote);
    await clickVote('up');
    check(`${tag}: up is stored in the phrase log record`, (await rec()).feedback?.vote === 'up', JSON.stringify((await rec()).feedback));
    await clickVote('down');
    const open = await pg.evaluate(() => { const f = [...document.querySelectorAll('.p2-msg.is-bot')].at(-1).querySelector('.p2-fb-form'); return { hidden: f.hidden, chips: f.querySelectorAll('.p2-fb-chip').length, ph: f.querySelector('textarea')?.placeholder, undo: !!f.querySelector('.p2-fb-undo') }; });
    check(`${tag}: the vote changes to down and the form opens (9 reason chips, "What did you want?", undo offered)`, !open.hidden && open.chips === 9 && /What did you want/.test(open.ph) && open.undo, JSON.stringify(open));
    await pg.evaluate(() => { const f = [...document.querySelectorAll('.p2-msg.is-bot')].at(-1).querySelector('.p2-fb-form'); f.querySelector('[data-reason="wrong-value"]').click(); });
    await pg.evaluate(() => { const f = [...document.querySelectorAll('.p2-msg.is-bot')].at(-1).querySelector('.p2-fb-form'); const t = f.querySelector('textarea'); t.value = 'green eyes'; t.dispatchEvent(new Event('change')); });
    const fb1 = (await rec()).feedback;
    check(`${tag}: down stores the reasons and the wanted text`, fb1.vote === 'down' && fb1.reasons.join() === 'wrong-value' && fb1.wanted === 'green eyes' && !!fb1.time, JSON.stringify(fb1));
    const d = (await rec()).detail;
    check(`${tag}: the record has readings, SOP wires and state hashes before / after`, !!d && d.readings?.length >= 1 && /@/.test(d.readings[0].wires ?? '') && /^[0-9a-f]{8}$/.test(d.state?.before ?? '') && /^[0-9a-f]{8}$/.test(d.state?.after ?? '') && d.state.before !== d.state.after, JSON.stringify(d)?.slice(0, 200));
    await shot(c, o, `feedback-form-${name}`);
    await pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1).querySelector('.p2-fb-undo').click());
    check(`${tag}: "Show me the right result" takes the turn back (state as before)`, (await c.state()) === before, '');
    check(`${tag}: the undo is recorded`, (await rec()).feedback?.undone === true);
    await c.say('make the eyes green');
    const r1 = await rec();
    check(`${tag}: the next accepted phrasing is linked as the correction`, !!r1.id && (await rec(-2)).feedback?.correction === r1.id, JSON.stringify((await rec(-2)).feedback));
    await c.say("that's wrong");
    const rated = await rec(-2);
    const formsOpen = await pg.evaluate(() => { const bots = [...document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)')]; const f = bots.at(-2).querySelector('.p2-fb-form'); return f && !f.hidden ? 1 : 0; });
    check(`${tag}: spoken "that's wrong" sets down on the previous answer and opens its form`, rated.feedback?.vote === 'down' && formsOpen === 1, JSON.stringify(rated.feedback));
    check(`${tag}: the complaint itself keeps its flag`, (await rec()).feedback === 'negative', JSON.stringify((await rec()).feedback));
    await pg.select('select.p2-select', 'ro');   // LANG-FIXED: Romanian is read when Română is selected, never by a per-message detection
    await c.say('nu asta am vrut');
    check(`${tag}: Romanian "nu asta am vrut" is the same complaint`, (await rec()).feedback === 'negative', JSON.stringify((await rec()).feedback));
    await pg.select('select.p2-select', 'en');
    await pg.click('button[aria-label="Settings"]'); await pg.click('#p2-st-privacy');
    await pg.waitForSelector('.p2-plog-item');
    await pg.evaluate(() => { const s = document.querySelector('select[aria-label="Filter phrases"]'); s.value = 'down'; s.dispatchEvent(new Event('change')); });
    const hist = await pg.$$eval('.p2-plog-item', (e) => e.map((x) => [x.querySelector('.p2-plog-vote')?.textContent.trim(), x.textContent]));
    check(`${tag}: history shows the down marks and the filter "Not what I wanted" keeps only those`, hist.length >= 1 && hist.every((x) => x[0] === '▼') && /wanted/.test(hist.map((x) => x[1]).join()), JSON.stringify(hist).slice(0, 200));
    const labels = await pg.$$eval('.p2-plog-actions button', (b) => b.map((x) => x.textContent));
    check(`${tag}: "Copy as text" is gone, "Export JSON" is there`, !labels.includes('Copy as text') && labels.includes('Export JSON'), labels.join('|'));
    await pg.evaluate(() => [...document.querySelectorAll('.p2-plog-actions button')].find((b) => b.textContent === 'Export JSON').click());
    const body = JSON.parse(await pg.evaluate(() => window.__blobs.at(-1).text()));
    const downs = body.records.filter((x) => x.feedback?.vote === 'down');
    check(`${tag}: the export is complete (feedback, correction, detail, segments, id, time)`, body.count === body.records.length && downs.length >= 1 && !!downs[0].feedback.correction && !!downs[0].detail?.readings && Array.isArray(downs[0].segments) && !!downs[0].time && !!downs[0].id, JSON.stringify(downs[0]?.feedback));
    check(`${tag}: no horizontal overflow`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${tag}: 0 console errors`, c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
  } finally { await c.close(); }
}


/** DBG: the debug view per tab in developer mode (and its zero cost when off). */
async function debugFor(name, viewport, o) {
  const tag = `dbg ${name}`;
  // off: nothing is loaded, no button
  const off = await openChat({ ...o, throttle: 1, viewport, settings: { formalizer: 'rules', normalizer: false, showTrace: false } });
  try {
    const r = await off.pg.evaluate(() => ({ row: document.querySelector('.p2-dbgrow')?.hidden, loaded: performance.getEntriesByType('resource').some((e) => /ui\/debug\.mjs/.test(e.name)), dbg: !!window.psys2.debug }));
    check(`${tag}: developer mode off: no Debug button, debug.mjs not loaded, nothing recorded`, r.row === true && !r.loaded && !r.dbg, JSON.stringify(r));
    await off.say('make the eyes blue');
    await off.pg.click('button[aria-label="Settings"]'); await off.pg.click('#p2-st-developer');
    await off.pg.evaluate(() => [...document.querySelectorAll('.p2-modal-body label.p2-check')].find((l) => /Developer mode/.test(l.textContent)).querySelector('input').click());
    await off.pg.waitForFunction(() => !!window.psys2.debug, { timeout: 8000 }).catch(() => {});
    const on = await off.pg.evaluate(() => ({ dbg: !!window.psys2.debug, row: document.querySelector('.p2-dbgrow')?.hidden, loaded: performance.getEntriesByType('resource').some((e) => /ui\/debug\.mjs/.test(e.name)), saved: JSON.parse(localStorage.getItem('psys2.webchat.settings')).devMode }));
    check(`${tag}: the Developer mode switch loads the module lazily, shows the button and is remembered`, on.dbg && on.loaded && on.saved === true, JSON.stringify(on));
    check(`${tag}: a turn before the switch is not recorded`, (await off.pg.evaluate(() => window.psys2.debug.ring.length)) === 0);
  } finally { await off.close(); }

  const c = await openChat({ ...o, throttle: 1, viewport, settings: { formalizer: 'rules', normalizer: false, showTrace: false, devMode: true } });
  const pg = c.pg;
  try {
    await pg.waitForFunction(() => !!window.psys2.debug, { timeout: 8000 });
    await pg.evaluate(() => { window.__blobs = []; const orig = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); }; });
    const tabs = await pg.$$eval('.p2-tabs .p2-tab', (b) => b.map((x) => x.id.replace('p2-tab-', '')));
    const dbgOpen = () => pg.evaluate(() => { const m = document.querySelector('.p2-dbg'); return !!m && !m.hidden; });
    const section = (id) => pg.evaluate((id) => document.querySelector(`#p2-dt-${id}`).click(), id);
    let bad = [];
    for (const t of tabs) {
      await pg.evaluate((t) => window.psys2.showTab(t), t);
      const vis = await pg.evaluate(() => { const b = document.querySelector('#p2-dbg-open'); const r = b.getBoundingClientRect(); return { tab: b.dataset.tab, shown: !b.closest('[hidden]') && r.width > 0 }; });
      await pg.click('#p2-dbg-open');
      await pg.waitForSelector('.p2-dbg:not([hidden])');
      const info = await pg.evaluate(() => ({ title: document.querySelector('#p2-dbg-title').textContent, n: Number(document.querySelector('.p2-dbg-sum')?.dataset.count ?? 0), sec: document.querySelector('.p2-dbg-body').dataset.section }));
      if (!(vis.shown && vis.tab === t && info.n > 0 && info.sec === 'commands' && info.title.includes('Debug'))) bad.push(`${t}: ${JSON.stringify({ vis, info })}`);
      await pg.keyboard.press('Escape');
      if (await dbgOpen()) bad.push(`${t}: Esc did not close`);
    }
    check(`${tag}: every tab (${tabs.length}) shows the Debug button, opens the modal, Commands is not empty, Esc closes`, bad.length === 0, bad.join(' | '));

    // Commands: search and Try
    await pg.evaluate(() => window.psys2.showTab('robot'));
    await pg.click('#p2-dbg-open'); await pg.waitForSelector('.p2-dbg:not([hidden])');
    await pg.type('.p2-dbg-search', 'glasses');
    const found = await pg.$$eval('.p2-dbg-pat', (e) => e.length);
    check(`${tag}: the search narrows the commands (${found} patterns for "glasses")`, found > 0 && found < 200);
    await pg.evaluate(() => document.querySelector('.p2-dbg-try').click());
    const tried = await pg.$eval('input.p2-text', (i) => i.value);
    check(`${tag}: "Try" puts the example in the input and closes the view`, tried.length > 3 && !(await dbgOpen()), tried);
    await pg.evaluate(() => { document.querySelector('input.p2-text').value = ''; });

    // dry run executes nothing
    const stateBefore = await c.state();
    await pg.click('#p2-dbg-open'); await pg.waitForSelector('.p2-dbg:not([hidden])'); await section('dry');
    await pg.type('.p2-dbg-dry-in', 'make the eyes blue');
    await pg.click('.p2-dbg-tools [data-act="run"]');
    await pg.waitForSelector('.p2-dbg-dry-out [data-state]', { timeout: 8000 });
    const dry = await pg.evaluate(() => ({ state: document.querySelector('.p2-dbg-dry-out [data-state]').dataset.state, text: document.querySelector('.p2-dbg-dry-out').innerText, wires: !!document.querySelector('.p2-dbg-dry-out .sop-id') }));
    check(`${tag}: the dry run reads the phrase, shows readings and colored wires, and the state hash is unchanged`, dry.state === 'unchanged' && /Complete reading\s*yes/.test(dry.text) && dry.wires && (await c.state()) === stateBefore, dry.text.slice(0, 160));
    await pg.keyboard.press('Escape');

    // last turns with the wires of a command just sent
    await c.say('make the eyes blue');
    await pg.click('#p2-dbg-open'); await pg.waitForSelector('.p2-dbg:not([hidden])'); await section('turns');
    const first = await pg.evaluate(() => { const d = document.querySelector('.p2-dbg-turn'); d.open = true; d.dispatchEvent(new Event('toggle')); return d.querySelector('summary').textContent; });
    await pg.waitForSelector('.p2-dbg-turn .p2-dbg-wires .sop-id', { timeout: 5000 });
    const turn = await pg.evaluate(() => { const d = document.querySelector('.p2-dbg-turn'); return { wires: d.querySelector('.p2-dbg-wires pre').innerText, text: d.innerText }; });
    check(`${tag}: Last turns shows the command just sent with its SOP Lang wires, reading, operations and timing`, /make the eyes blue/.test(first) && /core\.request|action=/.test(turn.wires) && /Readings tried/i.test(turn.text) && /Operations executed/i.test(turn.text) && /Timing/i.test(turn.text), `${first} | ${turn.wires.slice(0, 100)}`);
    await shot(c, o, `debug-turns-${name}`);
    // Copy / Export JSON of the section
    await pg.evaluate(() => document.querySelector('.p2-dbg-tools [data-act="export"]').click());
    const exp = JSON.parse(await pg.evaluate(() => window.__blobs.at(-1).text()));
    check(`${tag}: Export JSON of Last turns carries the turns and the wires`, exp.section === 'turns' && exp.data.length >= 1 && exp.data[0].readings?.[0]?.wires, JSON.stringify(exp).slice(0, 120));

    // state with the diff of the last turn
    await section('state');
    const st = await pg.evaluate(() => ({ changed: Number(document.querySelector('.p2-dbg-sum').dataset.changed), hl: document.querySelectorAll('.p2-jtree[data-view="state"] .is-changed').length, astra: !!document.querySelector('.p2-jtree[data-view="astra"]'), text: document.querySelector('.p2-dbg-sum').textContent }));
    check(`${tag}: State shows the world state as a tree with the last turn's change highlighted, plus the ASTRA view`, st.changed > 0 && st.hl > 0 && st.astra, JSON.stringify(st));
    await section('world');
    await pg.waitForFunction(() => /coverage|Operation/.test(document.querySelector('.p2-dbg-cov')?.innerText ?? ''), { timeout: 8000 }).catch(() => {});
    const wd = await pg.evaluate(() => ({ sections: [...document.querySelectorAll('.p2-dbg-body h4')].map((e) => e.textContent), cov: document.querySelector('.p2-dbg-cov')?.innerText.slice(0, 80) }));
    check(`${tag}: World shows manifest, legend, lexicons, operations, templates and coverage`, ['Manifest (world.sop)', 'Imports', 'Counts', 'Coverage (coverage.md)'].every((x) => wd.sections.includes(x)) && wd.sections.some((x) => /^Lexicons/.test(x)) && wd.sections.some((x) => /^Operations/.test(x)) && /ui\.avatar is a schema world: its coverage is the coverage grid/.test(wd.cov ?? ''), JSON.stringify(wd).slice(0, 200));
    await section('models');
    const md = await pg.evaluate(() => ({ sections: [...document.querySelectorAll('.p2-dbg-body h4')].map((e) => e.textContent) }));
    check(`${tag}: Models shows dispatcher, normalizer and ORT worker status`, ['Dispatcher', 'Normalizer', 'ORT worker (onnxruntime-web)'].every((x) => md.sections.includes(x)), md.sections.join('|'));
    check(`${tag}: no horizontal overflow in the modal`, await pg.evaluate(() => { const b = document.querySelector('.p2-dbg-body'); return b.scrollWidth <= b.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }));
    await pg.keyboard.press('Escape');

    // ring buffer of 200
    const ringLen = await pg.evaluate(() => { const d = window.psys2.debug; for (let i = 0; i < 250; i++) d.record({ text: `t${i}`, mode: 'typed', tab: 'robot' }); return d.ring.length; });
    check(`${tag}: the ring buffer keeps 200 turns`, ringLen === 200, String(ringLen));
    // the phrase log's debug dump link
    await pg.click('button[aria-label="Settings"]'); await pg.click('#p2-st-privacy'); await pg.waitForSelector('.p2-plog-item');
    const dumpLinks = await pg.$$eval('.p2-plog-dump', (e) => e.length);
    check(`${tag}: the phrase log has a debug dump link per message`, dumpLinks >= 1, String(dumpLinks));
    check(`${tag}: 0 console errors`, c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
  } finally { await c.close(); }
}

export const SCENARIOS = {
  async debug(o) { await debugFor('phone', VIEWPORTS.phone, o); await debugFor('desktop', VIEWPORTS.desktop, o); },
  async feedback(o) { await feedbackFor('phone', VIEWPORTS.phone ?? Object.values(VIEWPORTS)[0], o); await feedbackFor('desktop', VIEWPORTS.desktop ?? Object.values(VIEWPORTS).at(-1), o); },
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
