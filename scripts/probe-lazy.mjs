#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Sends messages to the real webchat (headless Chrome, rules formalizer) and reports, per turn, the reply, the worlds that loaded on demand, the requests that reached the server and the time.
//   PUPPETEER_CORE=<puppeteer-core> node scripts/probe-lazy.mjs "What is a calf?" "open the map" ...
import { openChat } from './test-webchat-turns.mjs';

const lines = process.argv.slice(2);
const c = await openChat({ throttle: 1, settings: { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' }, viewport: { width: 1100, height: 800 } });
c.pg.on('framenavigated', (f) => { if (f === c.pg.mainFrame()) console.log('NAVIGATED', f.url()); });
try {
  const loaded = () => c.pg.evaluate(() => window.psys2.engine?.loaded?.() ?? []);
  console.log('boot loaded:', (await loaded()).join(','));
  for (const l of lines) {
    const before = new Set(await loaded());
    const r = await c.say(l);
    const after = await loaded();
    console.log(`${r.ok ? 'ok ' : 'LATE'} ${r.ms} ms  "${l}" -> ${r.reply.slice(0, 90).replace(/\n/g, ' ')}   [+${after.filter((w) => !before.has(w)).join(',') || 'nothing'}]`);
  }
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5));
  if (c.consoleErrors.length) console.log('console errors:', c.consoleErrors.slice(0, 6));
} finally { await c.close(); }
