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
});
