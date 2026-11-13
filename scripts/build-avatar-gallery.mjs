#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Pre-renders the thumbnails of the gallery in the Avatar tab (task AV).
//
//   node scripts/build-avatar-gallery.mjs            writes docs/webchat/vendor/dicebear-styles/gallery.json
//   node scripts/build-avatar-gallery.mjs --check    exits 1 when the file on disk differs from what would be generated
//
// One SVG per character in its start look, and one per preset the character offers (man, woman, girl, boy, old man, old woman).
// The looks are the real ones: the ui.avatar world is asked ("become a portrait", "make the avatar a woman") and its state is
// drawn with the vendored DiceBear core, so a thumbnail always shows what the same words do in the tab. The browser fetches
// this one small file when it is idle (lazy: the style definitions themselves load only when a character is chosen).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { avatarOptions, CHARACTER_LIST, CHARACTER_SAY, KIND_SAY } from '../docs/webchat/ui/avatar.mjs';
import * as core from '../docs/webchat/vendor/dicebear-core.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const VENDOR = path.join(REPO, 'docs/webchat/vendor/dicebear-styles');
const OUT = path.join(VENDOR, 'gallery.json');
const STYLE = { robot: 'voxel-bot', person: 'open-peeps', emoji: 'moods', portrait: 'lorelei', cartoon: 'micah', kid: 'big-smile', pixel: 'pixel-art', pixelbot: 'pixelbot', funemoji: 'fun-emoji' };

export async function buildGallery() {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const styles = {};
  const draw = async (st, ch) => {
    styles[ch] ??= new core.Style(JSON.parse(await readFile(path.join(VENDOR, `${STYLE[ch]}.json`), 'utf8')));
    // a fixed seed: only what the world's state does not fix is drawn from it
    return new core.Avatar(styles[ch], avatarOptions({ ...st, seed: 'psys2' })).toString();
  };
  const out = {};
  for (const ch of CHARACTER_LIST) {
    const session = engine.createSession({});
    session.setWorldState('ui.avatar', { face: { ...session.state('ui.avatar').face, active: false } });   // the thumbnails are the classic DiceBear looks; the drawn face is the start state
    let r = await session.send(`become ${CHARACTER_SAY[ch]}`);
    if (ch === 'robot') r = await session.send('hello');
    const st = session.state()['ui.avatar'] ?? r.state?.['ui.avatar'];
    if (!st || st.character !== ch) throw new Error(`gallery: could not become ${ch} (${r.text})`);
    out[ch] = await draw(st, ch);
    for (const kind of st.chips?.kinds ?? []) {
      const s2 = engine.createSession({});
      await s2.send(`become ${CHARACTER_SAY[ch]}`);
      const r2 = await s2.send(KIND_SAY[kind]);
      const st2 = s2.state()['ui.avatar'] ?? r2.state?.['ui.avatar'];
      if (st2?.character !== ch) continue; // this character cannot show it (it would turn into another one): no thumbnail
      out[`${ch}:${kind}`] = await draw(st2, ch);
    }
  }
  return JSON.stringify(out) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = await buildGallery();
  if (process.argv.includes('--check')) {
    const cur = await readFile(OUT, 'utf8').catch(() => '');
    if (cur !== text) { console.error('gallery.json is out of date: run node scripts/build-avatar-gallery.mjs'); process.exit(1); }
  } else {
    await writeFile(OUT, text);
    const keys = Object.keys(JSON.parse(text));
    console.log(`avatar gallery: ${keys.length} thumbnails (${Math.round(text.length / 1024)} KB): ${keys.join(', ')}`);
  }
}
