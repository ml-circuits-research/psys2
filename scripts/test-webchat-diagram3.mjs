#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * DIAG3: the expectations of the user's Diagram session (training/eval/expectations-2026-11-09d.jsonl) in the real webchat (headless Chrome), with
 * screenshots of the ids and the arrows. The webchat must be built first (node scripts/build-webchat.mjs).
 *
 *   PUPPETEER_CORE=<scratch puppeteer-core install> node scripts/test-webchat-diagram3.mjs [--shots dir] [--chrome /usr/bin/chromium]
 */
import { mkdirSync } from 'node:fs';
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('shots', 'diag3-shots');
mkdirSync(dir, { recursive: true });
// The 15 expectations of training/eval/expectations-2026-11-09d.jsonl, in the user's order, each on a fresh page with the user's own context.
// [id, context, message, reply must match, reply must not match, state check(d), screenshot name]
const EXPECT = [
  ['rp4-01', [], 'draw a red circle', /c1/, /did not understand/, (d) => d.shapes.length === 1 && d.shapes[0].kind === 'circle' && d.shapes[0].id === 'c1'],
  ['rp4-02', ['draw a red circle'], 'create a diagram', /Keep the current one/i, /Drew/, (d) => d.shapes.length === 1],
  ['rp4-03', ['draw a red circle', 'create a diagram'], 'add to the diagram a tree liek shape', /tree|hierarchy/i, /Tree\d|-trunk|did not understand|nothing to confirm/i,
    (d) => d.shapes.length >= 2 && d.shapes.some((s) => s.id === 'c1') && d.shapes.every((s) => /^[a-z]\d+$/.test(s.id)), 'tree'],
  ['rp4-04', ['draw a red circle'], 'add a box', /r1/, null, (d) => d.shapes.some((s) => s.id === 'r1' && s.kind === 'rectangle')],
  ['rp4-05', ['draw a red circle', 'add a box', 'add a box'], 'connect all elements', /a1.*a2/s, null, (d) => d.edges.length === 2 && d.edges[0].from === 'c1' && d.edges[0].to === 'r1' && d.edges[1].to === 'r2'],
  ['rp4-06', ['draw a red circle', 'add a box'], 'connect circle1 and rectangle1', /c1.*r1.*a1/s, null, (d) => d.edges.length === 1 && d.edges[0].id === 'a1' && d.edges[0].from === 'c1' && d.edges[0].to === 'r1'],
  ['rp4-07', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'label the previous link as label1', /label1/, /Which shape/, (d) => d.edges[0].label === 'label1'],
  ['rp4-08', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'label link', /What should the label of a1 \(c1 .* r1\) say/i, null],
  ['rp4-09', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'lable arraw between circle1 and rectangle1', /What should the label of a1/i, /\band\b.*now|"able"/i, (d) => d.shapes.every((s) => !s.label)],
  ['rp4-10', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'label the arraw between circle1 and reactanle1 as "label1"', /label1/, /labeled “and”/, (d) => d.edges[0].label === 'label1' && d.shapes.every((s) => !s.label)],
  ['rp4-11', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'label a1 as uses', /uses/, null, (d) => d.edges[0].label === 'uses'],
  ['rp4-12', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'make a1 thicker and dashed', /dashed/, /Changed the arrow/, (d) => d.edges[0].style === 'dashed' && d.edges[0].width > 2],
  ['rp4-13', ['draw a red circle', 'add a box'], 'make c1 a bit bigger', /c1/, null, (d) => d.shapes.find((s) => s.id === 'c1').size > 1 || /big|large/i.test(String(d.shapes.find((s) => s.id === 'c1').size))],
  ['rp4-14', ['draw a red circle', 'add a box', 'add a box', 'connect all elements'], 'change the layout to a column', /column/i, null, (d) => d.shapes.every((s) => s.x === d.shapes[0].x), 'column'],
  ['rp4-15', ['draw a red circle', 'add a box', 'connect circle1 and rectangle1'], 'delete a1', /Removed/, null, (d) => d.edges.length === 0 && d.shapes.length === 2],
];
let bad = 0;
for (const [id, ctx, text, want, notWant, check, shot] of EXPECT) {
  const chat = await openChat({ throttle: 1, chrome: arg('chrome'), settings: {}, viewport: { width: 900, height: 900, deviceScaleFactor: 1 } });
  try {
    await chat.say('open the diagram tab');
    for (const c of ctx) await chat.say(c);
    const r = await chat.say(text);
    const d = JSON.parse(await chat.state())['diagram.sketch'] ?? {};
    const halos = await chat.pg.$$eval('.halo', (e) => e.length);   // no shape is selected in any row: no shape halo (an arrow just edited keeps its own highlight)
    const ok = halos === 0 && r.ok && want.test(r.reply) && !(notWant && notWant.test(r.reply)) && (!check || check(d)) && chat.errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  "${text}"  ->  ${JSON.stringify(r.reply).slice(0, 170)}${ok ? '' : `  state=${JSON.stringify({ s: d.shapes?.map((x) => `${x.id}:${x.kind}`), e: d.edges?.map((x) => `${x.id}:${x.from}>${x.to}`) }).slice(0, 300)}`}`);
    if (halos) console.log(`  ${halos} halos shown without a selection`);
    if (shot) { await new Promise((res) => setTimeout(res, 600)); await chat.pg.screenshot({ path: `${dir}/${shot}.png` }); }
    if (chat.errors.length) console.log('page errors:', chat.errors);
  } finally { await chat.close(); }
}
console.log(`${EXPECT.length - bad}/${EXPECT.length} rows pass`);
// The reviewer's tree probe (a picture template with the user's shapes around it): a screenshot, and no halos; the geometry is measured by tests/diagram-arrows.test.mjs.
{
  const chat = await openChat({ throttle: 1, chrome: arg('chrome'), settings: {}, viewport: { width: 900, height: 900, deviceScaleFactor: 1 } });
  try {
    await chat.say('open the diagram tab');
    for (const c of ['draw a red circle', 'make a tree', 'add a box', 'add a box', 'draw a circle', 'connect circle1 and rectangle1', 'connect c1 to r1']) { const r = await chat.say(c); if (!r.ok || /-trunk/.test(r.reply)) { bad++; console.log(`FAIL  probe "${c}" -> ${r.reply}`); } }
    const halos = await chat.pg.$$eval('.halo', (e) => e.length);
    if (halos) { bad++; console.log(`FAIL  probe: ${halos} halos`); }
    await new Promise((res) => setTimeout(res, 600)); await chat.pg.screenshot({ path: `${dir}/tree-probe.png` });
    console.log(`probe tree: ${halos ? 'FAIL' : 'ok'} (screenshot ${dir}/tree-probe.png)`);
  } finally { await chat.close(); }
}
process.exit(bad ? 1 : 0);
