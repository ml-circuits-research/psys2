// SPDX-License-Identifier: AGPL-3.0-only
// THE PAGE'S OWN CARDS ARE REQUESTS THE PRODUCT READS (reviewer 2026-11-16 10:20 item 2; spec 28 section 29). Every face card ("become a boy") and expression chip ("look sad",
// "wink") the avatar popup offers, enumerated from the page's data (worlds/ui.avatar/default-face.mjs, the set the page draws before the catalog and that the catalog's k.faces
// matches; the card texts are docs/webchat/ui/avatar.mjs presetSay / expressionSay), is sent as the page sends it: over the Drawing tab with the popup open (`view: 'avatar'`).
// Each one is executed by the avatar's domain (the face becomes the preset, takes the expression) or honestly refused by it (nothing changed, the reply claims nothing).
// The saved-face cards ("be Grandma") and the variant cards appear only after the old path's save / options, which the new reading path does not produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { DEFAULT_FACE } from '../worlds/ui.avatar/default-face.mjs';
import { presetSay, expressionSay } from '../docs/webchat/ui/avatar.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const CLAIMS = /\b(?:I (?:added|moved|made|changed|put|removed|drew|took|swapped)|now)\b/i;
const face = (s) => s.state()['ui.avatar']?.face ?? null;
const visible = (f) => JSON.stringify(f ? { slots: f.slots, colours: f.colours, expression: f.expression, base: f.base } : null);

const cards = [
  ...Object.keys(DEFAULT_FACE.presets).map((n) => ({ say: presetSay(n), done: (f) => f?.base === n })),
  ...Object.keys(DEFAULT_FACE.expressions).filter((e) => e !== 'talking').map((e) => ({ say: expressionSay(e), done: (f) => f?.expression === e })),
];

test('the avatar popup offers face cards and expression chips', () => assert.ok(cards.length >= 15, String(cards.length)));

test('every card and chip of the avatar popup is executed or honestly refused by the avatar', async () => {
  const bad = [], executed = [];
  for (const c of cards) {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    if (c.say.startsWith('become')) await s.send('look happy', { view: 'avatar' });   // a face that is not yet the preset: the card has something to do
    const before = visible(face(s));
    const r = await s.send(c.say, { view: 'avatar' });
    const after = face(s);
    const worlds = r.segments.map((x) => x.match?.worldId ?? x.world);
    if (!worlds.includes('ui.avatar')) bad.push(`${c.say}: answered by ${worlds.join(',') || '-'} (${r.text})`);
    else if (r.trace?.legacy) bad.push(`${c.say}: the old path answered (${r.trace.door})`);
    else if (c.done(after)) executed.push(c.say);
    else if (visible(after) !== before || CLAIMS.test(r.text)) bad.push(`${c.say}: neither done nor an honest refusal: ${r.text}`);
    assert.equal(s.state('ui.shell').activeTab, 'draw');
  }
  assert.deepEqual(bad, []);
  assert.ok(executed.length >= cards.length - 2, `executed ${executed.length} of ${cards.length}: ${cards.map((c) => c.say).filter((x) => !executed.includes(x)).join('; ')}`);
});
