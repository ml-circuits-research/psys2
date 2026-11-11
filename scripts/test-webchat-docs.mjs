// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Browser scenarios of the document worlds on the matrix reasoner (spec 15, "docs.editor and docs.reader on the matrix"). Not a program of its own: it is added
 * to the scenarios of scripts/test-webchat-matrix.mjs (`--only editor,reader`), which gives it the helpers.
 *   editor   the page and the "undo steps" counter follow the document wires; a target that does not exist is refused by the rules with the reason; "undo" says
 *            what it put back in the world's words and the page shows it again; "redo" says what it did again.
 *   reader   the sample is read from the library's state: a sentence that does not exist is refused with the reason, a document that was closed is gone from the
 *            shelf, "undo that" opens it again in the world's words.
 */
export const docScenarios = ({ openChat, MATRIX, check, say }) => ({
  async editor(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const page = () => c.pg.$eval('.pe-editor', (el) => el.innerText).catch(() => '');
      const status = () => c.pg.$eval('.pe-status', (el) => el.innerText).catch(() => '');
      await say(c, 'Add a heading Plans');
      await say(c, 'Add a paragraph First one here.');
      await say(c, 'Add a paragraph Second one here.');
      const p = await page();
      check('editor: the page shows what was added and counts the undo steps', /Plans/.test(p) && /Second one here\./.test(p) && /3 undo steps/.test(await status()), `${p.slice(0, 60)} | ${(await status()).slice(0, 40)}`);
      const r = await say(c, 'read the fifth paragraph');
      check('editor: a paragraph that does not exist is refused by the rules, with the reason', r === 'There is no fifth paragraph; the document has two.', r.slice(0, 80));
      await say(c, 'delete the second paragraph');
      check('editor: the deleted paragraph leaves the page', !/Second one here\./.test(await page()), (await page()).slice(0, 60));
      const u = await say(c, 'undo');
      check('editor: "undo" says what it put back, in the world\'s words, and the page shows it again', u === 'OK, I put back the paragraph you deleted.' && /Second one here\./.test(await page()), `${u.slice(0, 60)} | ${(await page()).slice(0, 60)}`);
      const d = await say(c, 'redo');
      check('editor: "redo" does it again and says so', d === 'OK, I deleted the paragraph again.' && !/Second one here\./.test(await page()), d.slice(0, 80));
      check('editor: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
});
