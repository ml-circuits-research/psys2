#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// The tab bar at a phone width: order of the tabs, which are visible without scrolling, which tab is open, which worlds are loaded at start. A saved tab is checked with --saved <tab id>.
//   PUPPETEER_CORE=<puppeteer-core> node scripts/probe-tabs.mjs [--saved draw]
import { openChat } from './test-webchat-turns.mjs';
const i = process.argv.indexOf('--saved'), saved = i > 0 ? process.argv[i + 1] : null;
const c = await openChat({ throttle: 1, settings: { formalizer: 'rules', normalizer: false }, init: saved ? `try { localStorage.setItem('psys2.webchat.tab', ${JSON.stringify(saved)}); } catch (e) {}` : null });
try {
  const r = await c.pg.evaluate(() => {
    const bar = document.querySelector('[role=tablist]'), b = bar.getBoundingClientRect();
    const tabs = [...bar.querySelectorAll('.p2-tab')].map((t) => { const r = t.getBoundingClientRect(); return { label: t.textContent, visible: r.left >= b.left - 1 && r.right <= b.right + 1 && r.width > 0, selected: t.getAttribute('aria-selected') === 'true' }; });
    return { tabs, loaded: window.psys2.engine.loaded(), active: window.psys2.session.state()['ui.shell']?.activeTab, bar: { w: Math.round(b.width), scrolls: bar.scrollWidth > bar.clientWidth } };
  });
  console.log(JSON.stringify(r, null, 1));
} finally { await c.close(); }
