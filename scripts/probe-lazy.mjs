#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Sends messages to the real webchat (headless Chrome, rules formalizer) and reports, per turn: the reply, the time to the answer, the worlds that loaded on demand with the size of their bundles
// (worlds/index.json: raw bytes), and what the PAGE fetched meanwhile (tab modules, vendor assets: resource timing). The worker's own fetches are the bundles and the word buckets (the loaded list).
//   PUPPETEER_CORE=<puppeteer-core> node scripts/probe-lazy.mjs "What is a calf?" "open the map" ...      (no arguments: the 14-turn probe across Avatar, Drawing, Map and Talk)
import { openChat } from './test-webchat-turns.mjs';

const DEFAULT = ['hello', 'put a hat on the avatar', 'open the drawing board', 'draw a house', 'make the house red', 'open the map', 'show me paris', 'zoom in', 'open the talk tab',
  'What does a lighthouse look like?', 'How many legs does a spider have?', 'Which is bigger, Jupiter or Mars?', 'open the avatar tab', 'make the avatar smile'];
const lines = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const c = await openChat({ throttle: 1, settings: { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' }, viewport: { width: 1100, height: 800 } });
c.pg.on('framenavigated', (f) => { if (f === c.pg.mainFrame()) console.log('NAVIGATED', f.url()); });
try {
  const loaded = () => c.pg.evaluate(() => window.psys2.engine?.loaded?.() ?? []);
  const index = await c.pg.evaluate(async () => (await fetch(new URL('worlds/index.json', document.baseURI).href + '?probe=1')).json().catch(() => null));
  const sizeOf = (ids) => ids.reduce((s, id) => s + (index?.worlds?.[id]?.bytes ?? 0), 0);
  const resources = () => c.pg.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ n: r.name.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, ''), b: r.transferSize || r.encodedBodySize || 0 })));
  const boot = await loaded();
  const bootRes = await resources();
  console.log(`boot: ${boot.length} worlds, ${(sizeOf(boot) / 1024).toFixed(0)} KB raw of bundles; page resources ${bootRes.length} (${(bootRes.reduce((s, r) => s + r.b, 0) / 1024).toFixed(0)} KB)`);
  console.log('boot loaded:', boot.join(','));
  let seen = bootRes.length;
  const rows = [];
  for (const l of lines) {
    const before = new Set(await loaded());
    const r = await c.say(l);
    const after = await loaded(), added = after.filter((w) => !before.has(w));
    const res = await resources(), fresh = res.slice(seen); seen = res.length;
    const vendor = fresh.filter((x) => /vendor\/|ui\/tabs\//.test(x.n));
    rows.push({ text: l, ms: r.ms, added, kb: Math.round(sizeOf(added) / 1024), vendorKB: Math.round(vendor.reduce((s, x) => s + x.b, 0) / 1024), vendorFiles: vendor.length });
    console.log(`${r.ok ? 'ok ' : 'LATE'} ${String(r.ms).padStart(5)} ms  ${l.slice(0, 42).padEnd(42)} +${added.length} worlds (${Math.round(sizeOf(added) / 1024)} KB raw) page: ${vendor.length} tab/vendor files (${Math.round(vendor.reduce((s, x) => s + x.b, 0) / 1024)} KB) ${added.length ? '[' + added.join(',') + ']' : ''}  -> ${r.reply.slice(0, 50).replace(/\n/g, ' ')}`);
  }
  console.log('total on demand:', rows.reduce((s, r) => s + r.added.length, 0), 'worlds,', rows.reduce((s, r) => s + r.kb, 0), 'KB raw,', rows.reduce((s, r) => s + r.vendorKB, 0), 'KB of tab and vendor files');
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5));
  if (c.consoleErrors.length) console.log('console errors:', c.consoleErrors.slice(0, 6));
} finally { await c.close(); }
