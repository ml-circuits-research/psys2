// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chrome probe of DRAW-FROM-FACTS (spec 07 section 7): the built webchat draws things that are not in the enum of kinds from the catalog of facts, and the built-in kinds
 * side by side (hand-coded | from facts). Screenshots go to training/results/draw-from-facts/ for the reviewer.
 *   node scripts/build-webchat.mjs && PUPPETEER_CORE=<scratch>/node_modules/puppeteer-core node scripts/test-webchat-draw-from-facts.mjs [--only things,parts,sidebyside]
 * It fails on a page error, on a thing that does not appear on the tab, or on a canvas that stays blank. Not part of `npm test` (it needs Chrome); the matrix scenarios
 * of scripts/test-webchat-matrix.mjs run the same sentences (`--only draw`).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'training/results/draw-from-facts');
mkdirSync(OUT, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? process.argv[process.argv.indexOf('--only') + 1] ?? '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const THINGS = ['castle', 'lighthouse', 'robot', 'snowman', 'plane', 'train', 'bicycle', 'table', 'umbrella', 'apple'];
const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const board = async (c, file) => {
  await settle();
  const el = await c.pg.$('.dr-board');
  if (el) await el.screenshot({ path: path.join(OUT, file) });
  else await c.pg.screenshot({ path: path.join(OUT, file) });
};
/** Fraction of the canvas pixels that are not the paper (read back from the 2d context). */
const inked = (c) => c.pg.evaluate(() => {
  const cv = document.querySelector('.dr-canvas'); if (!cv) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4 * 7) if (Math.abs(d[i] - 255) + Math.abs(d[i + 1] - 250) + Math.abs(d[i + 2] - 240) > 40) n++;
  return n / (d.length / 28);
});
const objects = async (c) => JSON.parse(await c.state())['art.draw']?.objects ?? [];
const open = (o) => openChat({ ...o, settings: MATRIX, throttle: 1, viewport: { width: 1100, height: 900, deviceScaleFactor: 1 } });

async function things(o) {
  const c = await open(o);
  try {
    for (const t of THINGS) {
      const r = await c.say(`draw a ${t}`);
      const objs = await objects(c);
      check(`things: "draw a ${t}" is a composite on the tab`, objs.length === 1 && objs[0].kind === 'composite' && objs[0].thing === t, `${r.reply.slice(0, 50)} | ${JSON.stringify(objs.map((x) => [x.kind, x.thing]))}`);
      await settle(500);
      check(`things: the ${t} is not blank`, (await inked(c)) > 0.004, `${(await inked(c)).toFixed(3)}`);
      await board(c, `thing-${t}.png`);
      await c.say('clear everything');
    }
    const r = await c.say('draw a blorp');
    check('things: a thing with no facts is answered plainly and nothing is drawn', r.reply === "I don't know how to draw a blorp yet." && (await objects(c)).length === 0, r.reply);
    check('things: no page errors', c.errors.length === 0, c.errors[0] ?? '');
  } finally { await c.close(); }
}

async function parts(o) {
  const c = await open(o);
  try {
    await c.say('draw a house');
    await c.say('draw a red castle');
    await c.say('make the roof of the house blue');
    await c.say('add a third window');
    await c.say('remove the chimney');
    const objs = await objects(c);
    const house = objs.find((x) => x.kind === 'house');
    check('parts: the roof is blue, a window was added, the chimney is gone', house?.parts?.roof === 'blue' && house.extra?.windows === 1 && house.hide?.includes('chimney'), JSON.stringify(house));
    await board(c, 'parts-house-edited.png');
    await c.say('make the towers of the castle pink');
    await c.say('make the castle bigger');
    await c.say('flip the castle');
    await board(c, 'parts-castle-edited.png');
    await c.say('how many castles are there');
    await c.say('undo');
    await board(c, 'parts-after-undo.png');
    const r = await c.say('delete the castle');
    check('parts: delete works on a composite', /took away the (pink |red )?castle/.test(r.reply) && (await objects(c)).length === 1, r.reply);
    check('parts: no page errors', c.errors.length === 0, c.errors[0] ?? '');
  } finally { await c.close(); }
}

async function diagram(o) {
  const c = await open(o);
  try {
    const r = await c.say('make a diagram shaped like a house');
    check('diagram: shaped like a house', /one box for each of its 6 parts/.test(r.reply), r.reply);
    await c.pg.evaluate(() => document.querySelector('.p2-tab[data-tab="diagram"], [data-tab="diagram"]')?.click?.());
    await settle(1200);
    await c.pg.screenshot({ path: path.join(OUT, 'diagram-shaped-like-a-house.png') });
    check('diagram: no page errors', c.errors.length === 0, c.errors[0] ?? '');
  } finally { await c.close(); }
}

/** The 26 built-in kinds, hand-coded | from facts, drawn by the page's own renderer. */
async function sidebyside(o) {
  const c = await open(o);
  try {
    const base = `http://localhost:${c.srvPort}/webchat`;
    const res = await c.pg.evaluate(async (base) => {
      const [{ createRenderer }, scene, rough] = await Promise.all([import(`${base}/ui/tabs/draw/render.mjs`), import(`${base}/worlds/art.draw/scene.mjs`), import(`${base}/vendor/draw/rough.mjs`)]);
      const R = rough.default ?? rough.rough;
      const mk = (partsOf) => createRenderer(R, { ...scene, partsOf });
      const hand = mk(scene.partsOfHand), facts = mk(scene.partsOfFacts);
      const kinds = scene.KIND_ORDER, cols = 4, cell = 300, rows = Math.ceil(kinds.length / cols);
      const cv = document.createElement('canvas'); cv.width = cols * cell * 2; cv.height = rows * (cell + 30) * 2;
      document.body.append(cv);
      const ctx = cv.getContext('2d'), rc = R.canvas(cv);
      ctx.scale(2, 2); ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.font = '14px sans-serif'; ctx.fillStyle = '#333';
      const stats = {};
      kinds.forEach((k, i) => {
        const x0 = (i % cols) * cell, y0 = Math.floor(i / cols) * (cell + 30), d = scene.KINDS[k], size = Math.min(130, 120 / Math.max(1, d.aspect));
        for (const [j, r] of [hand, facts].entries()) {
          ctx.save(); ctx.translate(x0 + 75 + j * 150, y0 + 100);
          ctx.scale(size / d.size, size / d.size);
          r.drawObject(ctx, rc, { id: `x${k}${j}`, kind: k, x: 0, y: 0, size: d.size, color: null, fill: 'crayon', rotation: 0, flip: false, parts: {} }, { x: 0, y: 0, size: d.size });
          ctx.restore();
        }
        ctx.fillText(`${k}${scene.KINDS_FROM_FACTS.includes(k) ? '  (from facts)' : '  (hand-coded)'}`, x0 + 10, y0 + 200);
        stats[k] = { hand: scene.partsOfHand({ kind: k, size: 100, parts: {} }).length, facts: scene.partsOfFacts({ kind: k, size: 100, parts: {} }).length };
      });
      return { stats, png: cv.toDataURL('image/png') };
    }, base);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(OUT, 'builtin-hand-vs-facts.png'), Buffer.from(res.png.split(',')[1], 'base64'));
    check('sidebyside: every built-in kind has facts that build parts', Object.values(res.stats).every((s) => s.facts >= s.hand), JSON.stringify(res.stats).slice(0, 200));
    check('sidebyside: no page errors', c.errors.length === 0, c.errors[0] ?? '');
  } finally { await c.close(); }
}

const o = {};
try {
  if (want('things')) await things(o);
  if (want('parts')) await parts(o);
  if (want('diagram')) await diagram(o);
  if (want('sidebyside')) await sidebyside(o);
} catch (e) { failed++; console.log(`FAIL  probe crashed: ${e?.stack ?? e}`); }
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
