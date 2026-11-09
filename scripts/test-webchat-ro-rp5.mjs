#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * RP5b: the Romanian voice session of 2026-11-09 (training/eval/expectations-2026-11-09e.jsonl) in the real webchat (headless Chrome), with the
 * DEFAULT settings (the encoder dispatch path) and language 'ro'. rp5-21 (background talk) belongs to the speech filters and is not tested here.
 * The webchat must be built first (node scripts/build-webchat.mjs).
 *
 *   PUPPETEER_CORE=<scratch puppeteer-core install> node scripts/test-webchat-ro-rp5.mjs [--only rp5-18,rp5-19] [--chrome /usr/bin/chromium] [--throttle 1]
 */
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only')?.split(',');
const ENGLISH = /\b(the|you|your|and|with|could not|did not|Done|There you go|where|should|can say|let's|OK,|I cannot|numbers)\b/;
// [id, tab, context, text, reply must match, state check(state, activeTab)]
const ROWS = [
  ['rp5-01', 'robot', [], 'becoming emoji', /emoji/i],
  ['rp5-02', 'robot', [], 'make the Roboto person', /person|persoan/i],
  ['rp5-03', 'robot', [], 'fii bucuros', /^\S+! Acum arăt/],
  ['rp5-04', 'robot', [], 'fii nervos', /^\S+! Acum arăt/],
  ['rp5-05', 'robot', [], 'încearcă gura următoare', /gur/i],
  ['rp5-06', 'robot', [], 'fii un carton', /desen animat|cartoon|carton/i],
  ['rp5-07', 'robot', [], 'fiind copil', /copil/i],
  ['rp5-08', 'tictactoe', [], 'pornește x și zero', /X/],
  ['rp5-09', 'tictactoe', ['pornește x și zero'], 'joc a unu', /sus în stânga/],
  ['rp5-10', 'draw', [], 'desenează un sare', /soare/],
  ['rp5-11', 'draw', [], 'desenează o maimuță', /pisic/],
  ['rp5-12', 'draw', [], 'desenează liniuță', /linie/],
  ['rp5-13', 'draw', [], 'desenează un pește mic și albastru', /pește mic albastru/],
  ['rp5-14', 'draw', ['desenează apă', 'desenează pește'], 'mută peștele în apă', /în apă/, (s) => !/pământ/.test(s.reply)],
  ['rp5-15', 'draw', ['desenează pește'], 'mută peștele', /Unde/],
  ['rp5-16', 'draw', ['desenează trei pești în apă'], 'șterge peștii', /3 pești/],
  ['rp5-17', 'robot', [], 'Fă o gură mare', /gur/i],
  ['rp5-18', 'diagram', [], 'desenează trei cercuri', /c1.*c3/s, (s) => s.tab === 'diagram' && s.diagram.shapes.length === 3],
  ['rp5-19', 'diagram', [], 'desenează trei cercuri în diagramă', /c1.*c3/s, (s) => s.tab === 'diagram' && s.diagram.shapes.length === 3],
  ['rp5-20', 'draw', ['desenează trei cercuri'], 'Șterge toate cercurile roșii', /cerc/],
  // RP5b item 2: every tab opens by its Romanian name and the usual voice variants
  ...[['desen', 'draw'], ['desenat', 'draw'], ['diagramă', 'diagram'], ['diagrama', 'diagram'], ['grafic', 'charts'], ['grafice', 'charts'], ['hartă', 'map'], ['muzică', 'music'], ['editor', 'editor'],
    ['șah', 'chess'], ['spânzurătoarea', 'hangman'], ['x și zero', 'tictactoe'], ['ghicește animalul', 'guess'], ['documente', 'documents'], ['avatar', 'robot'], ['profil', 'profile']]
    .map(([n, id]) => [`tab-${id}-${n}`, 'robot', [], `deschide tabul ${n}`, /^(Bine, iată fila|Ești deja pe fila)/, (s) => s.tab === id && !/Am înțeles asta|open the/.test(s.reply)]),
  ['wording-avatar-already', 'robot', [], 'deschide tabul avatar', /^Ești deja pe fila Avatar/],
  ['wording-grill', 'robot', [], 'un grătar gură', /o gură grătar/],
];

let bad = 0, n = 0;
for (const [id, tab, ctx, text, want, check] of ROWS) {
  if (only && !only.includes(id)) continue;
  n++;
  const chat = await openChat({ throttle: Number(arg('throttle', 1)), chrome: arg('chrome'), settings: { language: 'ro' }, viewport: { width: 1000, height: 900, deviceScaleFactor: 1 } });
  try {
    await chat.pg.evaluate((t) => document.querySelector(`#p2-tab-${t}`)?.click(), tab);
    for (const c of ctx) await chat.say(c);
    const r = await chat.say(text);
    const st = JSON.parse(await chat.state());
    const shown = await chat.pg.evaluate(() => document.querySelector('.p2-tab[aria-selected="true"]')?.id?.replace('p2-tab-', ''));
    const s = { reply: r.reply, tab: shown, diagram: st['diagram.sketch'] ?? { shapes: [] } };
    const english = ENGLISH.test(r.reply) && !/^(rp5-0[12])$/.test(id);
    const ok = r.ok && want.test(r.reply) && !english && (!check || check(s)) && chat.errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  "${text}"  ->  ${JSON.stringify(r.reply).slice(0, 200)}  [tab ${shown}]${chat.errors.length ? ` errors=${chat.errors}` : ''}`);
  } finally { await chat.close(); }
}
console.log(`${n - bad}/${n} rows pass`);
process.exit(bad ? 1 : 0);
