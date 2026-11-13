// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Draw time of imported catalog objects on the phone profile (spec 07 section 7): Chrome at 390x844 with a 4x CPU throttle, the real catalog fetched from the
 * sop-knowledge-worlds Pages copy. For each object it reports the first draw (Enter -> the thing is inked on the Drawing tab: lookup fetch + parse in the engine worker,
 * the tab's own fetch + parse, render) and the redraw (the tab's renderer, one `drawScene` of the picture, p50/p95 over many calls).
 *   node scripts/build-webchat.mjs && PUPPETEER_CORE=<scratch>/node_modules/puppeteer-core node scripts/measure-webchat-draw-time.mjs [--redraws 30] [--things a,b,c]
 * Needs Chrome and network access to the catalog. Not part of `npm test`.
 */
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const THINGS = (arg('--things', 'pineapple,melon,parachute,helicopter,banana,lime,grapes,watermelon,tangerine,lemon')).split(',');
const REDRAWS = Number(arg('--redraws', 30));
const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const inked = (c) => c.pg.evaluate(() => {
  const cv = document.querySelector('.dr-canvas'); if (!cv) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 28) if (Math.abs(d[i] - 255) + Math.abs(d[i + 1] - 250) + Math.abs(d[i + 2] - 240) > 40) n++;
  return n / (d.length / 28);
});

const c = await openChat({ settings: MATRIX, throttle: 4, viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
const first = [], turn = [], redraw = [], rows = [];
try {
  for (const t of THINGS) {
    await c.say('clear everything');
    const t0 = Date.now();
    const r = await c.say(`draw a ${t}`);
    const tTurn = Date.now() - t0;
    await c.pg.waitForFunction(() => { const cv = document.querySelector('.dr-canvas'); if (!cv) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 28) if (Math.abs(d[i] - 255) + Math.abs(d[i + 1] - 250) + Math.abs(d[i + 2] - 240) > 40) n++; return n / (d.length / 28) > 0.004; }, { timeout: 20000, polling: 25 }).catch(() => {});
    const tInk = Date.now() - t0;
    const ink = await inked(c);
    const objs = JSON.parse(await c.state())['art.draw']?.objects ?? [];
    const ms = await c.pg.evaluate(async (n) => {
      const [{ createRenderer }, scene, rough] = await Promise.all([import('./ui/tabs/draw/render.mjs'), import('./worlds/art.draw/scene.mjs'), import('./vendor/draw/rough.mjs')]);
      const R = rough.default ?? rough.rough, rend = createRenderer(R, scene);
      const st = window.psys2.session.state()['art.draw'];
      const cv = document.createElement('canvas'); cv.width = 780; cv.height = 546;
      const ctx = cv.getContext('2d'); ctx.setTransform(0.78, 0, 0, 0.78, 0, 0);
      const out = [];
      for (let i = 0; i < n; i++) { const a = performance.now(); rend.drawScene(ctx, R.canvas(cv), st, { selected: null }); out.push(performance.now() - a); }
      return out;
    }, REDRAWS);
    const parts = await c.pg.evaluate(async () => { const s = await import('./worlds/art.draw/scene.mjs'); const st = window.psys2.session.state()['art.draw']; return st.objects[0] ? s.partsOf(st.objects[0]).length : 0; });
    first.push(tInk); turn.push(tTurn); redraw.push(...ms);
    rows.push({ thing: t, drawn: objs[0]?.thing === t, parts, turnMs: tTurn, firstInkMs: tInk, redrawP50: +pct(ms.slice(1), 0.5).toFixed(1), redrawP95: +pct(ms.slice(1), 0.95).toFixed(1), ink: +ink.toFixed(3), reply: r.reply.slice(0, 40) });
  }
  console.table(rows);
  console.log(`first draw (Enter -> inked): p50 ${pct(first, 0.5)} ms, p95 ${pct(first, 0.95)} ms; turn only: p50 ${pct(turn, 0.5)} ms, p95 ${pct(turn, 0.95)} ms`);
  console.log(`redraw (drawScene, ${redraw.length} calls over ${THINGS.length} objects, the cold first call of each object included; the per-object p50/p95 drop it): p50 ${pct(redraw, 0.5).toFixed(1)} ms, p95 ${pct(redraw, 0.95).toFixed(1)} ms, max ${Math.max(...redraw).toFixed(1)} ms`);
  console.log(c.errors.length ? `page errors: ${c.errors.join(' | ')}` : 'no page errors');
} finally { await c.close(); }
