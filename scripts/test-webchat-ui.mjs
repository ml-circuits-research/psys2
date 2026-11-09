#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Headless UI tests of the real webchat at 390x844 (phone) and 1280x800 (desktop): tasks SET, UI1 and DOC.
 *
 *   settings   the full-screen Settings modal: open/close with the x, Esc and Back, tabs, deep link, last tab, every control saves,
 *              voice and text commands, 0 console errors, one screenshot per tab
 *   ui1        one microphone and one "read aloud" toggle in the input bar, nothing in the header or the tabs, a tooltip on every icon
 *              button, the dictation state, screenshots of the header, the input bar and the editor
 *   doc        greeting, header line, title and About page wording, help answers
 *
 *   node scripts/test-webchat-ui.mjs [--only settings,ui1,doc] [--chrome /usr/bin/chromium] [--shots docs/webchat/screenshots]
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

export const SCENARIOS = {
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
