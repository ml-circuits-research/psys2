#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Matrix reasoner in the real webchat (SOPWORLD-1, spec 15): headless Chrome, 390x844, CPU throttling (default 4x), rules formalizer.
 *
 *   default   no saved Reasoner: the default is `matrix` (user decision 2026-11-11): "add to my list" asks, and a saved `ops` of an older settings version is migrated once.
 *   ops       the explicit `ops` fallback: "add to my list" still reads as before and nothing of the matrix shows.
 *   ask       matrix: "add to my list" asks "What shall I put on the list?" and "bread" completes it.
 *   revise    matrix: "I buy a ball" then "three of them" revises the purchase; the money follows.
 *   undo      matrix: "undo that" takes the purchase back and the money is back.
 *   why       matrix: "why?" after a shop answer says what the answer rests on (the library's `explain`).
 *   abduce    matrix: "I got 5 lei back for a book, what did I pay?" answers 17.
 *   setting   Settings > Developer > Reasoner (default matrix) switches the engine to ops (a restart) and the matrix gains disappear.
 *   assume    matrix: "I buy the ball" then "how much money do I have?" says "I assumed 1 ball." once; the phrase log record carries the assumption.
 *             "why did you play there?" explains, a finished game refuses moves.
 *             free again), a finished game refuses guesses and undo reopens it.
 *   time      matrix (stage 2): the day, the days until a day and the hours between come from the library, an hour the clock does not have is refused with the reason
 *             and the clock keeps its hour, "undo that" says it in the world's words.
 *   animals   matrix (stage 2): a taught fact is answered from the library and "undo that" forgets it in the world's words.
 *   shared    matrix (WORLDS-APART): a name told once is known in the shop, in a game and in arithmetic; "Ana has 3 apples / she eats 1 / how many" is 2.
 *   removed   matrix (UNDO-1): "what is on my shopping list?" after a removal is read as the question it is.
 *   romanian  matrix (RO-MATRIX): a Romanian session: undo quotes the user's own words, a bare yes, a refusal, the shop tab name and the profile answer in Romanian.
 *   geomap    matrix (stage 2, one instance per world): the state of the map is wires of the library: the counts and the length of the lines come from rules, a "No" about a
 *             place has the reason of the denies, "zoom to 15" stays at 12, and the world's own undo and redo take the map back and forth (the tab follows).
 *   charts    matrix (stage 2): the totals are rules, "rename apples to pears" is refused with the reason and the chart on the tab keeps its labels, undo and redo follow.
 *   music     matrix: a tempo, a key or an instrument the rules refuse says why and the tab keeps its setting, the default tempo is assumed and said once, "undo" and "why?" in the world's words.
 *
 *   restart-undo  matrix (RESTORE-1): a watchdog restart of the engine worker (fault hooks) keeps the library timeline, undo walks back across it.
 *
 *   draw, diagram   matrix (art.draw, diagram.sketch): see scripts/test-webchat-draw-matrix.mjs.
 *
 *   node scripts/test-webchat-matrix.mjs [--only default,ops,ask,revise,undo,why,abduce,setting,assume,time,animals,romanian,shared,removed,geomap,charts,music,draw,commonsense,diagram,editor,shell,avatar,help] [--throttle 4] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';
import { docScenarios } from './test-webchat-docs.mjs';
import { drawScenarios } from './test-webchat-draw-matrix.mjs';
import { uiScenarios } from './test-webchat-ui-matrix.mjs';

const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };
const OPS = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'ops', settingsVersion: 4 };   // an explicit choice of the current settings version
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const say = async (c, text) => { const r = await c.say(text); return r.reply; };

export const SCENARIOS = {
  async default(o) {
    // no `reasoner` saved; and a saved `ops` from settings version 3 (the old default, not a choice) is migrated to matrix once
    for (const [label, settings] of [['nothing saved', { formalizer: 'rules', normalizer: false, showTrace: false }], ['old saved ops (v3)', { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'ops', settingsVersion: 3 }]]) {
      const c = await openChat({ ...o, settings });
      try {
        const a = await say(c, 'add to my list');
        check(`default (${label}): the reasoner is matrix, "add to my list" asks what to put on the list`, /What shall I put on the list\?/.test(a), a.slice(0, 80));
        const saved = await c.pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}').reasoner);
        check(`default (${label}): the saved setting is matrix or absent`, saved === 'matrix' || saved === undefined, String(saved));
        check(`default (${label}): no page errors`, c.errors.length === 0, c.errors[0] ?? '');
      } finally { await c.close(); }
    }
  },
  async ops(o) {
    const c = await openChat({ ...o, settings: OPS });
    try {
      const a = await say(c, 'add to my list');
      check('ops: the explicit ops setting is respected, "add to my list" is read as it always was (no question asked)', !/What shall I put on the list/.test(a), a.slice(0, 80));
      await say(c, 'I have 20 lei'); await say(c, 'I buy a ball');
      // Since SOPWORLD-1b item 2 the ops rules also revise the last purchase (shop.reviseLast), so both strategies read it.
      const t = await say(c, 'three of them');
      check('ops: "three of them" revises the purchase in ops too (shop.reviseLast)', /3 balls|that makes 3/i.test(t), t.slice(0, 80));
      check('ops: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async ask(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'add to my list');
      check('ask: "add to my list" asks what to put on the list', /What shall I put on the list\?/.test(a), a.slice(0, 80));
      const b = await say(c, 'bread');
      check('ask: the answer completes the command', /added bread/i.test(b), b.slice(0, 80));
      check('ask: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async revise(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      const a = await say(c, 'three of them');
      check('revise: "three of them" revises the purchase', /3 balls/.test(a), a.slice(0, 80));
      const m = await say(c, 'how much money do I have?');
      check('revise: the money follows (20 - 3 x 5 = 5)', /5 lei/.test(m), m.slice(0, 80));
    } finally { await c.close(); }
  },
  async undo(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      check('undo: the purchase spent money', /15 lei/.test(await say(c, 'how much money do I have?')));
      const u = await say(c, 'undo that');
      check('undo: "undo that" takes the purchase back', /took that back/.test(u), u.slice(0, 80));
      const m = await say(c, 'how much money do I have?');
      check('undo: the money is back', /20 lei/.test(m), m.slice(0, 80));
    } finally { await c.close(); }
  },
  async why(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      await say(c, 'how much money do I have?');
      const w = await say(c, 'why?');
      check('why: "why?" says what the answer rests on', /worked that out from/.test(w) && /I have 20 lei/.test(w) && /I buy a ball/.test(w), w.slice(0, 200));
    } finally { await c.close(); }
  },
  async abduce(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'I got 5 lei back for a book, what did I pay?');
      check('abduce: "I got 5 lei back for a book, what did I pay?" answers 17', /17/.test(a), a.slice(0, 120));
    } finally { await c.close(); }
  },
  async setting(o) {
    const c = await openChat({ ...o, settings: { formalizer: 'rules', normalizer: false, showTrace: false } });
    try {
      const pg = c.pg;
      await pg.click('button[aria-label="Settings"]');
      await pg.waitForSelector('#p2-st-developer', { timeout: 5000 });
      await pg.click('#p2-st-developer');
      await pg.waitForSelector('#p2-f-reasoner', { timeout: 5000 });
      check('setting: Settings > Developer has a Reasoner select, default matrix', (await pg.$eval('#p2-f-reasoner', (s) => s.value)) === 'matrix');
      const opts = await pg.$$eval('#p2-f-reasoner option', (os) => os.map((x) => x.value));
      check('setting: the options are matrix and ops', JSON.stringify(opts) === JSON.stringify(['matrix', 'ops']), opts.join(','));
      await pg.select('#p2-f-reasoner', 'ops');
      const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}').reasoner);
      check('setting: the choice is saved', saved === 'ops', String(saved));
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => !document.querySelector('.p2-modal'), { timeout: 5000 }).catch(() => {});
      // the engine restarts: wait until it answers again
      await new Promise((r) => setTimeout(r, 500));
      let a = '';
      for (let i = 0; i < 3 && !a; i++) a = await say(c, 'add to my list');
      check('setting: after the switch to ops "add to my list" no longer asks', a !== '' && !/What shall I put on the list\?/.test(a), a.slice(0, 80));
      check('setting: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async assume(o) {
    const c = await openChat({ ...o, settings: { ...MATRIX, logPhrases: true } });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy the ball');
      const a = await say(c, 'how much money do I have?');
      check('assume: the answer says what it assumed, once', /You have 15 lei left\. I assumed 1 ball\./.test(a) && (a.match(/I assumed/g) ?? []).length === 1, a.slice(0, 120));
      const rec = await c.lastPhrase();
      check('assume: the phrase log record carries the assumption', JSON.stringify(rec?.detail?.assumptions ?? rec?.assumptions ?? '').includes('count=1 (default)'), JSON.stringify(rec?.detail?.assumptions ?? null));
      const b = await say(c, 'how much money do I have?');
      check('assume: asked again, it does not repeat itself', !/I assumed/.test(b), b.slice(0, 80));
      check('assume: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async time(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'What day is tomorrow?');
      check('time: without a told day the answer asks for it', /^I need to know what day it is today\./.test(a), a.slice(0, 80));
      await say(c, 'Today is Friday.');
      const t = await say(c, 'What day is tomorrow?');
      check('time: tomorrow is worked out by the library from the day told', t === 'Tomorrow is Saturday.', t);
      const g = await say(c, 'How many days until Tuesday?');
      check('time: the days until a day', g === 'From today to Tuesday is 4 days.', g);
      const h = await say(c, 'How many hours from 9 to 3?');
      check('time: the hours between two o\'clock times', h === "It is 6 hours from 9 o'clock to 3 o'clock.", h);
      await say(c, "It is 3 o'clock.");
      const r = await say(c, "It is 30 o'clock.");
      check('time: an hour the clock does not have is refused with the reason', r === "That does not add up. That is not an hour on a clock: 30 o'clock.", r);
      const k = await say(c, 'What time is it?');
      check('time: the clock keeps its hour', k === "It is 3 o'clock.", k);
      const u = await say(c, 'undo that');
      check('time: "undo that" says what it took back in the world\'s words', u === 'OK, I forgot what time it is.', u);
      check('time: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async animals(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'A zebra can swim.');
      const q = await say(c, 'Can a zebra swim?');
      check('animals: a taught fact is answered from the library', /remember/.test(a) && q === 'Yes, a zebra can swim.', `${a.slice(0, 50)} | ${q}`);
      const u = await say(c, 'undo that');
      check('animals: "undo that" forgets it in the world\'s words', u === 'OK, I forgot what you taught me about zebras.', u);
      const m = await say(c, 'Can a zebra swim?');
      check('animals: after the undo the question is open again', /^I don't know whether a zebra can swim\./.test(m), m.slice(0, 80));
      const l = await say(c, 'How many legs does a spider have?');
      check('animals: a knowledge base fact comes from the library', l.startsWith('A spider has 8 legs.'), l);
      check('animals: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async shared(o) {
    // WORLDS-APART: the people and names are shared by the instances; the user's name told once is known in the shop, in the game and in arithmetic
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'my name is Ana');
      check('shared: the name is taken', /Nice to meet you, Ana/.test(a), a.slice(0, 60));
      await say(c, 'I have 20 lei');
      await say(c, "Let's play tic tac toe");
      const n = await say(c, 'what is my name?');
      check('shared: after the shop and a game the name is still known', n === 'Your name is Ana.', n);
      await say(c, 'Ana has 3 apples');
      await say(c, 'she eats 1');
      const h = await say(c, 'how many apples does she have?');
      check('shared: "Ana has 3 apples / she eats 1 / how many" is 2 with a game open', /Ana has 2 apples/.test(h), h.slice(0, 60));
      const m = await say(c, 'how much money do I have?');
      check('shared: the money of the shop is still there', /20 lei/.test(m), m.slice(0, 60));
      check('shared: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async removed(o) {
    // UNDO-1 item 3: a removed item leaves nothing that hijacks the next question
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'add milk to my shopping list'); await say(c, 'remove milk from my shopping list');
      const a = await say(c, 'what is on my shopping list?');
      check('removed: "what is on my shopping list?" after a removal says the list is empty', /^Your shopping list is empty/.test(a) && !/understood only part|is is/.test(a), a.slice(0, 100));
      check('removed: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async romanian(o) {
    // RO-MATRIX: a Romanian session on the matrix answers in Romanian, also what the dialogue layer writes itself, and quotes the user's own words
    const c = await openChat({ ...o, settings: { ...MATRIX, language: 'ro' } });
    try {
      const back = await say(c, 'înapoi');   // RO-LEFTOVERS: no previous tab: a Romanian sentence, not "Nu este nicio filă anterioară merge înapoi la."
      check('romanian: "înapoi" with no previous tab is one Romanian sentence', /^Nu există nicio filă anterioară la care să mă întorc\.$/.test(back), back);
      await say(c, 'am 20 de lei'); await say(c, 'cumpăr o minge');
      const u = await say(c, 'anulează');
      check('romanian: undo says what it took back in Romanian, with the user\'s own words', /^Am anulat: .cumpăr o minge.\.$/.test(u), u);
      const n = await say(c, 'da');
      check('romanian: a bare "da" is answered in Romanian', /^Da, la ce\?/.test(n), n.slice(0, 60));
      const t = await say(c, 'e ora 25');
      check('romanian: a refusal comes with its reason in Romanian', /^Nu se potrivește\. .*25/.test(t), t);
      const s = await say(c, 'deschide magazinul');
      check('romanian: "deschide magazinul" is understood', /cumpărături/.test(s), s.slice(0, 80));
      const a = await say(c, 'am 8 ani'); const b = await say(c, 'câți ani am?');
      check('romanian: the profile age is noted and read back in Romanian', /^8 ani, notat/.test(a) && /^Ai 8 ani\./.test(b), `${a} | ${b}`);
      const w = await say(c, 'de ce?');
      check('romanian: "de ce?" quotes the user\'s own words', /„câți ani am”/.test(w) && !/[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+ (the|you|your)\b/.test(w), w.slice(0, 120));
      check('romanian: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
    // RO-LEFTOVERS: the distance reply and the chart answers have Romanian templates (no English word, no fixed fallback line)
    const d = await openChat({ ...o, settings: { ...MATRIX, language: 'ro' } });
    try {
      const dist = await say(d, 'cât de departe este Madridul de Roma?');
      check('romanian: the distance reply is a Romanian template', /^Madrid și Roma sunt la aproximativ [\d.]+ de km \([\d.]+ de mile\) distanță/.test(dist), dist);
      const g = await say(d, 'fă un grafic: mere 5, pere 3, prune 8');
      check('romanian: a chart is made in Romanian and read as a bar chart ("un grafic cu bare")', /grafic cu bare/.test(g) && !/\bbară\b/.test(g), g.slice(0, 100));
      const big = await say(d, 'care e cel mai mare?');
      check('romanian: "care e cel mai mare?" leaves no English word and no fallback line', !/\b(biggest|smallest)\b/.test(big) && !/Nu am încă o formulare/.test(big), big);
      check('romanian: distance/chart session has no page errors', d.errors.length === 0, d.errors[0] ?? '');
    } finally { await d.close(); }
  },

  // ---- stage 2, one instance per world: geo.map and data.charts (a separate block) -----------------------------------------------------------------------------------------
  async geomap(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    const st = async () => JSON.parse(await c.state())['geo.map'] ?? {};
    try {
      await say(c, 'mark Paris'); await say(c, 'mark Rome');
      const d = await say(c, 'how far is Rome from Paris');
      const t = await say(c, 'how long are the lines in total');
      // (the matrix-only totals of the lines and the "why?" naming the kb of the world went with the matrix of geo.map: it is a schema world now, spec 21 section 12)
      const s1 = await st();
      check('geomap: the tab state has both markers and the line', s1.markers?.length === 2 && s1.lines?.length === 1, JSON.stringify([s1.markers?.length, s1.lines?.length]));
      const n = await say(c, 'Is Paris in Germany?');
      check('geomap: a "No" has the reason of the denies', n === 'No, Paris is not in Germany; it is in France.', n.slice(0, 80));
      const w = await say(c, 'why?');
      await say(c, 'street map');
      await say(c, 'zoom to 15');
      const s2 = await st();
      check('geomap: the street map zooms to 15, the library accepts it', s2.layer === 'osm' && s2.zoom === 15, JSON.stringify([s2.layer, s2.zoom]));
      await say(c, 'offline map');
      const s3 = await st();
      check('geomap: back on the offline map the zoom is at most 12 (the library refuses more)', s3.layer === 'offline' && s3.zoom <= 12, JSON.stringify([s3.layer, s3.zoom]));
      const u = await say(c, 'undo');
      const s4 = await st();
      check('geomap: the world\'s own undo takes the last change back and the tab state follows', /undid the last change to the map/.test(u) && s4.layer === 'osm', `${u.slice(0, 50)} | ${s4.layer}`);
      const r = await say(c, 'redo');
      const s5 = await st();
      check('geomap: redo does it again', /did it again/.test(r) && s5.layer === 'offline', `${r.slice(0, 40)} | ${s5.layer}`);
      check('geomap: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async charts(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    const st = async () => JSON.parse(await c.state())['data.charts'] ?? {};
    try {
      const a = await say(c, 'Make a chart: apples 5, pears 3, plums 8');
      check('charts: the chart is built and on the tab state', /bar chart with 3 items/.test(a) && (await st()).charts?.[0]?.labels?.length === 3, a.slice(0, 80));
      const b = await say(c, 'what is the biggest');
      const t = await say(c, 'what is the total');
      check('charts: the biggest and the total come from the rules', b === 'Plums is the biggest, with 8.' && t === 'The total is 16.', `${b} | ${t}`);
      const r = await say(c, 'rename apples to pears');
      check('charts: a label that is already there is refused with the reason, the chart keeps its labels', r === 'That does not add up. Pears is in the chart twice.' && (await st()).charts?.[0]?.labels?.[0] === 'Apples', r.slice(0, 100));
      await say(c, 'add bananas 4');
      const p = await say(c, 'what percent is bananas');
      check('charts: a percentage follows the new number', p === 'Bananas is 20% of the total (4 of 20).', p);
      const u = await say(c, 'undo');
      check('charts: the world\'s own undo takes the number back (the tab state follows)', /undid the last change to the chart/.test(u) && (await st()).charts?.[0]?.labels?.length === 3, u.slice(0, 60));
      const x = await say(c, 'undo the undo');
      check('charts: and does it again', /did it again/.test(x) && (await st()).charts?.[0]?.labels?.length === 4, x.slice(0, 60));
      check('charts: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  // ---- games.chess and media.music on the matrix (user decision 2026-11-11: every world moves to sopworld)
  async music(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'Open the music tab');
      check('music: the tab is open', /Music tab/.test(a), a.slice(0, 60));
      // media.music is a schema world on the acts since 2026-11-14 (no matrix: the refusals, assumptions and why-answers of the rules are gone, spec 21 section 13)
      const f = await say(c, 'Set the tempo to 300');
      check('music: a tempo the player cannot play is refused with the limit', f === 'I can play between 30 and 240 beats per minute.', f.slice(0, 80));
      const s = await say(c, 'What tempo is it?');
      check('music: the tempo is told', s === 'The tempo is 100 beats per minute.', s.slice(0, 120));
      const p = await say(c, 'Play Ode to Joy');
      check('music: a song plays (the host got the sound to play)', /^Playing "Ode to Joy"/.test(p), p.slice(0, 80));
      await say(c, 'Make it 150 beats per minute');
      const u = await say(c, 'undo');
      check('music: "undo" says what it took back, in the world\'s words', /^OK, I undid that: the tempo is 108 beats per minute/.test(u), u.slice(0, 100));
      const st = await c.pg.evaluate(() => JSON.parse(JSON.stringify(window.psys2.session.state()['media.music'])));
      check('music: the state of the tab follows (tempo 108)', st.tempo === 108, String(st.tempo));
      check('music: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
};

// the editor scenario (scripts/test-webchat-docs.mjs)
Object.assign(SCENARIOS, docScenarios({ openChat, MATRIX, check, say }));
// art.draw and diagram.sketch (scripts/test-webchat-draw-matrix.mjs)
Object.assign(SCENARIOS, drawScenarios({ openChat, MATRIX, OPS, check, say }));
// the UI worlds' scenarios (scripts/test-webchat-ui-matrix.mjs)
Object.assign(SCENARIOS, uiScenarios({ openChat, MATRIX, check, say }));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const only = (arg('only', Object.keys(SCENARIOS).join(','))).split(',');
  const o = { throttle: Number(arg('throttle', 4)), chrome: arg('chrome') };
  for (const name of only) await SCENARIOS[name](o);
  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
}
