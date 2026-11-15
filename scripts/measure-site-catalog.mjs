#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the page reads of the catalog in a typical session (questions.md Q33: the site's own copy of the pinned catalog): files, bytes on the wire and unpacked, by source
 * (the site's copy catalog/<commit>/, raw.githubusercontent.com, jsDelivr), after each turn of a short multi-tab session. Real page (docs/webchat, served locally), phone viewport.
 *
 *   PUPPETEER_CORE=... node scripts/measure-site-catalog.mjs [--throttle 1]
 */
import { openChat } from './test-webchat-turns.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const got = [];
const c = await openChat({
  throttle: Number(opt('throttle', 1)), settings: { __raw: {} }, query: '?psys2nosw=1',
  beforeGoto: async (pg) => {
    const cdp = await pg.target().createCDPSession();
    await cdp.send('Network.enable');
    const reqs = new Map();
    cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, e.request.url));
    cdp.on('Network.loadingFinished', (e) => { const u = reqs.get(e.requestId); if (u && /\/catalog\/[0-9a-f]{40}\/|githubusercontent|jsdelivr/.test(u)) got.push({ u, wire: e.encodedDataLength }); });
    // the engine worker's requests: CDP of the page does not see a dedicated worker's network; attach to it
    pg.on('workercreated', async (w) => {
      try {
        const s = w.client ?? w._client?.();
        await s.send('Network.enable');
        const wr = new Map();
        s.on('Network.requestWillBeSent', (e) => wr.set(e.requestId, e.request.url));
        s.on('Network.loadingFinished', (e) => { const u = wr.get(e.requestId); if (u && /\/catalog\/[0-9a-f]{40}\/|githubusercontent|jsdelivr/.test(u)) got.push({ u, wire: e.encodedDataLength }); });
      } catch (e) { console.error('worker network not attached:', e.message); }
    });
  },
});
if (process.env.SHOW_RAW) process.on('exit', () => console.log(got.filter((g) => !/\/catalog\//.test(g.u)).map((g) => g.u).join('\n')));
const src = (u) => (/githubusercontent/.test(u) ? 'raw' : /jsdelivr/.test(u) ? 'jsdelivr' : 'site');
const report = (label) => {
  const by = {};
  for (const g of got) { const k = src(g.u); by[k] ??= { files: 0, wire: 0 }; by[k].files++; by[k].wire += g.wire; }
  console.log(`${label}: ${Object.entries(by).map(([k, v]) => `${k} ${v.files} files ${(v.wire / 1e6).toFixed(2)} MB on the wire`).join('; ') || 'nothing'}`);
};
try {
  report('boot');
  for (const [tab, t] of [['robot', 'put on a hat'], ['draw', 'draw a house and a tree'], ['draw', 'I like cats, dogs and horses'], ['map', 'show Paris on the map']]) {
    await c.pg.evaluate((id) => window.psys2?.openTab?.(id), tab).catch(() => {});
    const r = await c.say(t, { timeout: 60000 });
    report(`${tab} "${t}" (${r.ms} ms)`);
  }
} finally { await c.close(); }
