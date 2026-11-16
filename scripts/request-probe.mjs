#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE DOOR PROBE (reviewer 2026-11-15 16:40): fresh sentences through `Session.send`, one session per block, printing each reply, whether the turn went through the request door or
 * to the old readers (`trace.legacy`), and a one-line measure of the open tab's world. Ends with the legacy share.
 *
 *   node scripts/request-probe.mjs [file]      file: one sentence per line; `:tab <diagram|draw|editor|charts|map|music>` opens a tab (same session); `:new` starts a fresh
 *                                              session; `# ...` is a comment. Without a file, the reviewer's 16:10 probe sentences.
 */
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const DEFAULT = `
:tab draw
draw a big forest, no birds
less trees
put a house on the left
paint a lake scene without birds
:new
:tab editor
write a long report about volcanoes in 4 chapters
shorter
:new
:tab diagram
make me a diagram of 6 boxes but no diamonds
add arrows
:new
:tab diagram
draw a flowchart with five steps, without rectangles
fewer nodes
anything but circles
`;

const lines = (process.argv[2] && !process.argv[2].startsWith('--') ? readFileSync(process.argv[2], 'utf8') : DEFAULT).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const catInfo = process.argv.includes('--no-catalog') ? null : await (await import('./lib/pinned-knowledge.mjs')).attachPinnedCatalog(engine);   // the page's catalog (reviewer 2026-11-16)
console.log(catInfo ? `catalog ${catInfo.short} loaded, ${catInfo.bases} bases` : 'no catalog (--no-catalog)');
const TABWORLD = { diagram: 'diagram.sketch', draw: 'art.draw', editor: 'docs.editor', charts: 'data.charts', map: 'geo.map', music: 'media.music' };
const measure = (st, tab) => {
  const w = st[TABWORLD[tab]] ?? {};
  if (tab === 'diagram') { const sh = w.shapes ?? []; const k = {}; for (const s of sh) k[s.shape] = (k[s.shape] ?? 0) + 1; return `${sh.length} nodes ${JSON.stringify(k)} ${(w.edges ?? []).length} links`; }
  if (tab === 'draw') { const k = {}; for (const o of w.objects ?? []) k[o.kind] = (k[o.kind] ?? 0) + 1; return `${(w.objects ?? []).length} things ${JSON.stringify(k)}`; }
  if (tab === 'editor') { const bl = w.blocks ?? []; return `"${w.title ?? ''}" ${bl.filter((b) => b.kind === 'heading').length} headings ${bl.reduce((a, b) => a + String(b.text ?? '').split(/\s+/).filter(Boolean).length, 0)} words`; }
  return '';
};
let s = null, tab = null, turns = 0, legacy = 0;
const fresh = () => { s = engine.createSession({ language: 'auto' }); tab = null; };
fresh();
for (const l of lines) {
  if (l === ':new') { fresh(); console.log('---'); continue; }
  if (l.startsWith(':tab ')) { tab = l.slice(5).trim(); s.setWorldState('ui.shell', { activeTab: tab }); console.log(`[tab ${tab}]`); continue; }
  let r;
  try { r = await s.send(l); } catch (e) { r = { text: `ERROR ${e.message}`, trace: {} }; }
  turns++; if (r.trace?.legacy) legacy++;
  console.log(`you> ${l}\npsys2> ${r.text}\n   ${r.trace?.legacy ? 'LEGACY' : 'door'}${r.trace?.door ? ` ${r.trace.door}` : ''} | ${tab ? measure(s.state(), tab) : ''}`);
}
console.log(`legacy share: ${legacy}/${turns}`);
