#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chrome probe of the Avatar tab (ONE AVATAR): the page loads with no page errors, the header avatar, the stage, the faces of the catalog and the expression chips render, a sheet of
 * 12 faces and a sheet with every optional part added and removed are drawn by the page's own renderer, and three accessories are put on and taken off through the chat.
 * The catalog is served by a local server from tests/fixtures/catalog (no network): the page is pointed at it with the setting `knowledgeUrl`.
 *
 *   PUPPETEER_CORE=... node scripts/test-webchat-avatar.mjs [--chrome /usr/bin/chromium] [--out docs/webchat/screenshots]
 */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const outDir = path.resolve(ROOT, opt('out') ?? 'docs/webchat/screenshots');
const CATALOG = path.join(ROOT, 'tests/fixtures/catalog');
let bad = 0;
const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer(async (q, r) => {
  r.setHeader('access-control-allow-origin', '*');
  try { r.end(await readFile(path.join(CATALOG, decodeURIComponent(q.url.split('?')[0])))); } catch { r.statusCode = 404; r.end(); }
}).listen(0);
const offline = args.includes('--offline');   // the catalog cannot be reached: the bundled default face must show, with no error
const catalogUrl = offline ? 'http://localhost:1' : `http://localhost:${srv.address().port}`;
await mkdir(outDir, { recursive: true });

const c = await openChat({ throttle: 1, viewport: { width: 1000, height: 900, deviceScaleFactor: 1 }, settings: { formalizer: 'rules', normalizer: false, showTrace: false, knowledgeUrl: catalogUrl } });
const { pg } = c;
try {
  await pg.waitForSelector('.p2-avatar-stage svg', { timeout: 20000 });
  check('the Avatar tab draws a face', true);
  await pg.waitForFunction(() => document.querySelectorAll('.p2-avatar-row .p2-avatar-card').length >= 10, { timeout: 20000 }).catch(() => {});
  if (offline) {
    await sleep(2500);
    check('offline: the default face is drawn and the tab shows no error', await pg.evaluate(() => !!document.querySelector('.p2-avatar-stage svg') && !/cannot reach/.test(document.querySelector('.p2-avatar-parts')?.textContent ?? '')));
    check('offline: no page errors', c.errors.length === 0, c.errors.join(' | '));
    await c.close(); srv.close(); process.exit(bad ? 1 : 0);
  }
  const ui = await pg.evaluate(() => ({ head: !!document.querySelector('.p2-head-face svg'), stage: !!document.querySelector('.p2-avatar-stage svg'), cards: document.querySelectorAll('.p2-avatar-row .p2-avatar-card svg').length, chips: document.querySelectorAll('.p2-avatar-chip').length }));
  check('the header avatar is drawn', ui.head);
  check('the faces of the catalog are thumbnails', ui.cards >= 13, `${ui.cards}`);
  check('the expressions are chips', ui.chips >= 6, `${ui.chips}`);
  const face = () => pg.evaluate(() => window.psys2.session.state()['ui.avatar']?.face?.slots ?? null);
  for (const [put, off, slot] of [['put on a hat', 'take off the hat', 'hat'], ['wear glasses', 'take off the glasses', 'glasses'], ['wear earrings', 'take off the earrings', 'earrings']]) {
    await c.say('take off the ' + slot);
    const r1 = await c.say(put);
    const s1 = await face();
    check(`"${put}" puts it on`, s1?.[slot] && s1[slot] !== 'none', r1.reply.slice(0, 60));
    const r2 = await c.say(off);
    const s2 = await face();
    check(`"${off}" takes it off`, s2?.[slot] === 'none', r2.reply.slice(0, 60));
  }
  // the sheets: the page's own modules draw 12 faces and every optional part on and off
  const sheet = await pg.evaluate(async (cat) => {
    const base = new URL('worlds/ui.avatar/', location.href).href, lib = new URL('lib/', location.href).href;
    const [draw, logic, { createFacts }, { createKnowledgeSource }] = await Promise.all([import(`${base}facedraw.mjs`), import(`${base}facelogic.mjs`), import(`${lib}knowledge/facts.mjs`), import(`${lib}loaders/knowledge-source.mjs`)]);
    const data = await createFacts({ source: createKnowledgeSource(cat) }).faces();
    const cell = (svg, label) => `<figure style="margin:6px;width:150px;text-align:center;font:11px sans-serif">${svg.replace('<svg ', '<svg style="width:150px;height:150px;background:#e8edf5;border-radius:10px" ')}<figcaption>${label}</figcaption></figure>`;
    const names = Object.keys(data.presets);
    const twelve = Array.from({ length: 12 }, (_, i) => { const f = logic.newFace(data, names[i % names.length]); if (i >= names.length) { f.expression = ['happy', 'sad', 'wink'][i % 3]; } return cell(draw.renderFace(data, f), `${names[i % names.length]}${i >= names.length ? ` (${f.expression})` : ''}`); });
    const acc = data.slots.filter((s) => s.optional).flatMap((s) => {
      const f = logic.newFace(data, 'child'); f.slots[s.name] = 'none';
      const on = { ...f, slots: { ...f.slots, [s.name]: s.variants[0].name } };
      return [cell(draw.renderFace(data, f), `no ${s.name}`), cell(draw.renderFace(data, on), `${s.name}: ${s.variants[0].name}`)];
    });
    document.body.insertAdjacentHTML('beforeend', `<div id="sheets" style="position:fixed;inset:0;background:#fff;overflow:auto;z-index:99999"><div id="s12" style="display:flex;flex-wrap:wrap;width:1000px">${twelve.join('')}</div><div id="sacc" style="display:flex;flex-wrap:wrap;width:1000px">${acc.join('')}</div></div>`);
    return { faces: twelve.length, parts: acc.length };
  }, catalogUrl).catch((e) => ({ error: String(e).slice(0, 200) }));
  check('the sheets are drawn', !sheet.error && sheet.faces === 12, JSON.stringify(sheet));
  if (!sheet.error) {
    await (await pg.$('#s12'))?.screenshot({ path: path.join(outDir, 'avatar-sheet-12-faces.png') });
    await (await pg.$('#sacc'))?.screenshot({ path: path.join(outDir, 'avatar-sheet-accessories.png') });
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '));
} catch (e) { check('the probe ran', false, String(e).slice(0, 200)); }
console.log(`console errors: ${c.consoleErrors.length}${c.consoleErrors.length ? ` (${c.consoleErrors.slice(0, 3).join(' | ')})` : ''}`);
await c.close();
srv.close();
process.exit(bad ? 1 : 0);
