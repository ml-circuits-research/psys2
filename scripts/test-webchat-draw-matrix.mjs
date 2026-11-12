// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Browser scenarios of art.draw and diagram.sketch on the matrix reasoner (spec 15, "art.draw and diagram.sketch on the matrix"). Not a program of its own: it is
 * added to the scenarios of scripts/test-webchat-matrix.mjs (`--only draw,diagram`), which gives it the helpers.
 *   draw     the scene on the tab (the session state the Drawing tab renders) follows the library's wires: a thing that is not there is refused by the rules with
 *            the reason and nothing changes, the counts are derived, "undo" says what it took back in the board's words and the scene follows, "redo" does it again.
 *   diagram  the diagram on the tab follows the wires: an arrow that is already there is refused with the reason, undo and redo go through the timeline in the
 *            editor's words, the tab keeps its shapes and arrows.
 */
export const drawScenarios = ({ openChat, MATRIX, check, say }) => ({
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
      check('draw: "redo" does it again', x === 'OK, I did it again.' && e.objects[0].color === 'blue', `${x.slice(0, 40)} | ${e.objects?.[0]?.color}`);
      await say(c, 'how many trees are there');
      const w = await say(c, 'why?');
      check('draw: "why?" names the source of the world', /the picture/.test(w), w.slice(0, 120));
      check('draw: no page errors', c.errors.length === 0, c.errors[0] ?? '');
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
        check(`veto ${lang}: "${remove}" says what it cannot find and what the picture has`, (lang === 'en' ? /^I can't find \u201cdragon\u201d in the picture\. In the picture I can see: .*house/.test(d) : /^Nu găsesc \u201edragonul\u201d în imagine\. În imagine văd: .*casă/.test(d)), d.slice(0, 140));
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
      check('diagram: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
});
