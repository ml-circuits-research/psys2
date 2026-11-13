// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Browser scenarios of the UI worlds on the matrix reasoner (spec 15, "ui.avatar, ui.shell and ui.help on the matrix"). Not a program of its own: it is added to the
 * scenarios of scripts/test-webchat-matrix.mjs (`--only shell,avatar,help`), which gives it the helpers.
 *   shell    the tab buttons follow the shell wire; a tab that does not exist is refused by the rules with the reason; "undo that" takes the tab switch back in the world's
 *            words and the button follows; the language switch works and "undo that" switches the selector back (the language tests: scripts/test-webchat-language.mjs).
 *   avatar   a part that has no color is refused with the reason and the list of what the part can be (the generated face world); "undo" says what it took back and the avatar is drawn as it was.
 *   help     "what can you do in the map?" is answered from the knowledge base; "more examples" is a step "undo that" takes back.
 */
export const uiScenarios = ({ openChat, MATRIX, check, say }) => ({
  async shell(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const selected = () => c.pg.$$eval('.p2-tab[aria-selected="true"]', (els) => els.map((e) => e.id)).catch(() => []);
      await say(c, 'Open the charts.');
      check('shell: the charts tab is shown', (await selected()).includes('p2-tab-charts'), (await selected()).join());
      const u = await say(c, 'undo that');
      check('shell: "undo that" says what it took back and the avatar tab is shown again', u === 'OK, I am back on the Avatar tab.' && (await selected()).includes('p2-tab-robot'), `${u} | ${(await selected()).join()}`);
      const r = await say(c, 'open the weather tab');
      check('shell: a tab that does not exist is refused by the rules, with the reason', r === 'There is no weather tab.', r.slice(0, 80));
      const l = await say(c, 'switch to romanian');
      const sel = () => c.pg.$eval('select.p2-select', (e) => e.value).catch(() => '');
      check('shell: the language switch changes the selector', /Romanian/.test(l) && (await sel()) === 'ro', `${l} | ${await sel()}`);
      const back = await say(c, 'undo that');
      check('shell: "undo that" speaks the language again and the selector follows', /engleza/.test(back) && (await sel()) === 'en', `${back} | ${await sel()}`);
      check('shell: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async avatar(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const caption = () => c.pg.$eval('.p2-avatar-caption', (el) => el.innerText).catch(() => '');
      const a = await say(c, 'make your mouth purple');
      check('avatar: a part that has no color is refused with the reason and what the part can be', /^I have no purple mouth\. It can be /.test(a), a.slice(0, 100));
      const before = await caption();
      const m = await say(c, 'make your hair blue');
      check('avatar: a colour is applied and said in the avatar\'s words', m === 'My hair is blue now.', m.slice(0, 100));
      const u = await say(c, 'undo');
      check('avatar: "undo" says what it took back', u === 'I went back to how I was before.', u.slice(0, 100));
      check('avatar: the avatar is drawn as it was before the change', (await caption()) === before, (await caption()).slice(0, 80));
      check('avatar: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async help(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'what can you do in the map?');
      check('help: "what can you do in the map?" is answered from the knowledge base', /^To show places on a map, you can say, for example: "/.test(a), a.slice(0, 100));
      const m = await say(c, 'more examples');
      check('help: "more examples" gives other examples', /Here are more things you can say/.test(m), m.slice(0, 80));
      const u = await say(c, 'undo that');
      check('help: "undo that" takes the step back in the world\'s words', /examples/.test(u), u.slice(0, 80));
      check('help: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
});
