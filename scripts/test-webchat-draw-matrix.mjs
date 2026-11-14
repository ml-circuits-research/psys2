// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Browser scenarios of art.draw and diagram.sketch on the matrix reasoner (spec 15, "art.draw and diagram.sketch on the matrix"). Not a program of its own: it is
 * added to the scenarios of scripts/test-webchat-matrix.mjs (`--only draw,diagram`), which gives it the helpers.
 *   draw     the scene on the tab (the session state the Drawing tab renders) follows the library's wires: a thing that is not there is refused by the rules with
 *            the reason and nothing changes, the counts are derived, "undo" says what it took back in the board's words and the scene follows, "redo" does it again.
 *   diagram  the diagram on the tab follows the wires: an arrow that is already there is refused with the reason, undo and redo go through the timeline in the
 *            editor's words, the tab keeps its shapes and arrows.
 */
// UNDO-REDO: the Undo and Redo buttons of the Drawing, Chess and Diagram tabs send "undo" / "redo" like the words do. A button is pressed like a user does.
const press = async (c, selector, label) => {
  const n = await c.pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
  const hit = await c.pg.evaluate((sel, lab) => { const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().includes(lab)); if (!b || b.disabled) return false; b.click(); return true; }, selector, label);
  if (!hit) return null;
  await c.pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout: 30000, polling: 20 }, n).catch(() => {});
  return c.pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot:not([data-runaway])')].at(-1)?.querySelector('.p2-bubble')?.innerText ?? '');
};
export const drawScenarios = ({ openChat, MATRIX, OPS, check, say }) => ({
  async undoredo(o) {
    for (const [label, settings] of [['matrix', MATRIX], ['ops', OPS ?? { ...MATRIX, reasoner: 'ops', settingsVersion: 4 }]]) {
      const c = await openChat({ ...o, settings });
      const st = async (w) => JSON.parse(await c.state())[w] ?? {};
      const kinds = async () => (await st('art.draw')).objects?.map((x) => x.kind).join(',') ?? '';
      try {
        await say(c, 'open the drawing tab');
        await say(c, 'draw a house');
        await say(c, 'draw a sky and a sun');
        const a = await press(c, '.dr-act', 'Undo');
        check(`undoredo ${label}: the Undo button of the Drawing tab takes back the last request of the message (the sun), the sky stays`, /drew a yellow sun/.test(a ?? '') && (await kinds()) === 'house' && !!(await st('art.draw')).sky, `${a} | ${await kinds()}`);
        const b = await press(c, '.dr-act', 'Redo');
        check(`undoredo ${label}: the Redo button puts the sun back and says what it did`, /did it again \(drew a yellow sun\)/.test(b ?? '') && (await kinds()) === 'house,sun', `${b} | ${await kinds()}`);
        await press(c, '.dr-act', 'Undo'); await press(c, '.dr-act', 'Undo');
        const d = await press(c, '.dr-act', 'Redo');
        check(`undoredo ${label}: two undos then one redo bring the sky back first`, /did it again \(added the sky\)/.test(d ?? '') && !!(await st('art.draw')).sky && (await kinds()) === 'house', `${d} | ${await kinds()}`);
        await say(c, 'draw a cat');
        const e = await press(c, '.dr-act', 'Redo');
        check(`undoredo ${label}: a new action clears the redo list`, /nothing to redo/i.test(e ?? ''), String(e));
        await say(c, 'open the music tab');
        const f = await say(c, 'undo the house');
        check(`undoredo ${label}: "undo the house" through a tab switch takes the house back alone`, /took back "draw a house"|would also have to take back/.test(f), f.slice(0, 120));
        const w = await say(c, 'undo the whole message');
        check(`undoredo ${label}: "undo the whole message" answers`, /whole message|nothing|took|back/i.test(w), w.slice(0, 100));
        // the chess tab
        await say(c, 'play chess');
        await say(c, 'e2 to e4');
        const g = await press(c, '.cx-btn', 'Undo');
        const h = await press(c, '.cx-btn', 'Redo');
        check(`undoredo ${label}: chess Undo then Redo buttons take the move back and play it again`, /took back your last move/.test(g ?? '') && /did it again: "e2 to e4"/.test(h ?? '') && (await st('games.chess')).history?.length >= 1, `${g} | ${h}`);
        // the diagram tab
        await say(c, 'open the diagram tab');
        await say(c, 'draw a red box called Start');
        const i = await press(c, '.dg-btn', 'Undo');
        const j = await press(c, '.dg-btn', 'Redo');
        check(`undoredo ${label}: diagram Undo then Redo buttons`, !!i && !!j && (await st('diagram.sketch')).shapes?.length === 1, `${i} | ${j}`);
        await c.pg.screenshot({ path: process.env.UNDOREDO_SHOT ?? `/tmp/undoredo-${label}.png` }).catch(() => {});
        check(`undoredo ${label}: no page errors`, c.errors.length === 0, c.errors[0] ?? '');
      } finally { await c.close(); }
    }
  },
  async draw(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    const st = async () => JSON.parse(await c.state())['art.draw'] ?? {};
    try {
      await say(c, 'draw a red house');
      await say(c, 'draw two green trees');
      const a = await st();
      check('draw: the scene on the tab has the house and the trees', a.objects?.length === 3 && a.objects[0].kind === 'house', JSON.stringify(a.objects?.map((x) => x.kind)));
      const r = await say(c, 'move the blue star to the left');
      const b = await st();
      check('draw: a thing that is not there is refused by the rules, with the reason, and the scene is as it was', r === 'I can not find a blue star in your picture.' && JSON.stringify(b.objects) === JSON.stringify(a.objects), r.slice(0, 80));
      const n = await say(c, 'how many trees are there');
      check('draw: the count comes from the derived numbers', n === 'There are 2 trees in your picture.', n);
      await say(c, 'make the house blue');
      const u = await say(c, 'undo');
      const d = await st();
      check('draw: "undo" says what it took back, in the board\'s words, and the house is red again on the tab', /^OK, I undid it \(colored it blue\)\.$/.test(u) && d.objects[0].color === 'red', `${u.slice(0, 60)} | ${d.objects?.[0]?.color}`);
      const x = await say(c, 'redo');
      const e = await st();
      check('draw: "redo" does it again', x === 'OK, I did it again (colored it blue).' && e.objects[0].color === 'blue', `${x.slice(0, 40)} | ${e.objects?.[0]?.color}`);
      await say(c, 'how many trees are there');
      const w = await say(c, 'why?');
      check('draw: "why?" names the source of the world', /the picture/.test(w), w.slice(0, 120));
      check('draw: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async commonsense(o) {
    // COMMON-SENSE (spec 15, "Common sense, advice and defaults"): the action is done, a short friendly warning follows it, said once, never a refusal
    const c = await openChat({ ...o, settings: MATRIX });
    const st = async () => JSON.parse(await c.state())['art.draw'] ?? {};
    try {
      const f = await say(c, 'draw a fish in the sky');
      check('commonsense: a fish in the sky is drawn and warned about, in one sentence in brackets', /I drew an orange fish in the sky\. \(Fish usually live in water, not in the sky\.\)$/.test(f), f);
      const h = await say(c, 'draw a red house');
      check('commonsense: the warning is said once (the next command does not repeat it)', !/usually/.test(h), h);
      await say(c, 'draw a sun');
      const s2 = await say(c, 'draw a second sun');
      check('commonsense: a second sun is drawn and warned about', /\(There is usually only one sun\.\)$/.test(s2), s2);
      const k = await say(c, 'draw a car in the sky');
      check('commonsense: a car in the sky is drawn and warned about', /\(Cars are usually on roads or on the ground, not in the sky\.\)$/.test(k), k);
      const a = await st();
      check('commonsense: nothing was refused, the things are on the tab', a.objects?.filter((x) => x.kind === 'sun').length === 2 && a.objects.some((x) => x.kind === 'car') && a.objects.some((x) => x.kind === 'fish'), JSON.stringify(a.objects?.map((x) => x.kind)));
      const p = await say(c, 'draw a fish');
      check('commonsense: a fish with nobody saying where goes into water made for it, with no warning', /I made a pond for the fish\.$/.test(p) && !/usually/.test(p), p);
      check('commonsense: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async veto(o) {
    // world-aware veto is the default (spec 16): plain-language replies, the user's label in quotes, one short question; English and Romanian (through the translator)
    for (const [lang, connect, remove] of [['en', 'connect Start to End', 'delete the dragon'], ['ro', 'conectează c1 cu End', 'șterge dragonul']]) {
      const c = await openChat({ ...o, settings: { ...MATRIX, language: lang } });
      try {
        if (lang === 'ro') await say(c, 'deschide fila diagramă');
        await say(c, lang === 'en' ? 'draw a red box called Start' : 'desenează un cerc roșu');
        const r = await say(c, connect);
        console.log(`veto ${lang} connect: ${r}`);
        check(`veto ${lang}: "${connect}" names the missing box in plain words and asks once`, lang === 'en' ? r === 'I can\'t find a box called \u201cEnd\u201d. Shall I add it?' : r === 'Nu găsesc nicio cutie numită \u201eEnd\u201d. Să adaug?', r.slice(0, 120));
        const st0 = JSON.parse(await c.state())['diagram.sketch'] ?? {};
        check(`veto ${lang}: nothing was added before the answer`, (st0.shapes?.length ?? 0) <= 1 && (st0.edges?.length ?? 0) === 0, JSON.stringify([st0.shapes?.length, st0.edges?.length]));
        await say(c, lang === 'en' ? 'draw a house' : 'desenează o casă');
        const d = await say(c, remove);
        console.log(`veto ${lang} delete: ${d}`);
        check(`veto ${lang}: "${remove}" says what it cannot find and what the picture has`, (lang === 'en' ? /^I can't find \u201cdragon\u201d in the picture\. In the picture I can see: .*house/.test(d) : /^Nu găsesc \u201edragon(ul)?\u201d în imagine\. În imagine văd: .*casă/.test(d)), d.slice(0, 140));
        check(`veto ${lang}: no page errors`, c.errors.length === 0, c.errors[0] ?? '');
      } finally { await c.close(); }
    }
  },
  async diagram(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    const st = async () => JSON.parse(await c.state())['diagram.sketch'] ?? {};
    try {
      await say(c, 'draw a red circle called A');
      await say(c, 'draw a blue square called B');
      await say(c, 'connect A to B');
      const a = await st();
      check('diagram: the tab has both shapes and the arrow', a.shapes?.length === 2 && a.edges?.length === 1, JSON.stringify([a.shapes?.length, a.edges?.length]));
      const r = await say(c, 'connect A to B');
      check('diagram: an arrow that is already there is refused with the reason', r === 'That arrow already connects A and B.' && (await st()).edges.length === 1, r.slice(0, 80));
      await say(c, 'connect B to A');
      const u = await say(c, 'undo');
      check('diagram: "undo" takes the last arrow back and the tab follows', u === 'Undid the last change.' && (await st()).edges.length === 1, `${u.slice(0, 40)} | ${(await st()).edges?.length}`);
      const x = await say(c, 'redo');
      check('diagram: "redo" puts it back', x === 'Redid it.' && (await st()).edges.length === 2, `${x.slice(0, 40)} | ${(await st()).edges?.length}`);
      await say(c, 'make a tree');
      const t = await st();
      check('diagram: a template adds its shapes and arrows to the tab', t.shapes.length > 4 && t.edges.length > 2, JSON.stringify([t.shapes?.length, t.edges?.length]));
      await say(c, 'undo');
      check('diagram: and one undo takes the whole template back', (await st()).shapes.length === 2, String((await st()).shapes?.length));
      const rd = await say(c, 'make a random diagram');
      check('diagram: "make a random diagram" draws a sample and says so in plain words, no ids', /^I drew a random \w+ diagram with \w+ \w+\.$/.test(rd) && (await st()).shapes.length > 2, rd.slice(0, 80));
      await say(c, 'undo');
      const dc = await say(c, 'draw a star');
      check('diagram: a plain drawing reply names no id', /^Drew a star\.?$/.test(dc) || !/\b[a-z]\d\b/.test(dc), dc.slice(0, 60));
      check('diagram: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
});
