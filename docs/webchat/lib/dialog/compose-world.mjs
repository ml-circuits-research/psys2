// SPDX-License-Identifier: AGPL-3.0-only
// The language World the host realises frames with (the summary's sentences, the sampler's chips): the generation templates of w.lang.en, its irregular plurals,
// auxiliaries and prepositions, the verbs of k.actions and the joins of the schemas, from the bundled subset of the catalog. Browser-safe: no `node:*`.
import { BUNDLED_COMPOSE } from '../knowledge/bundled-compose.mjs?v=d848a7b4d6';

const langWorlds = new WeakMap();
/** The library World of the language alone: the generation templates of w.lang.en (acts and discourse), its irregular plurals, auxiliaries and prepositions, the verbs of k.actions and the joins of the schemas: what `englishOf` reads (src/lang/en-generate.mjs). Small: the dice and the summary do not need the rest of the knowledge. */
export function languageWorld(lib) {
  if (langWorlds.has(lib)) return langWorlds.get(lib);
  const w = new lib.World();
  for (const [p, text] of Object.entries(BUNDLED_COMPOSE.files)) if (/^w\.lang\.en|^k\.actions$|^joins$/.test(p)) w.tell(text);
  langWorlds.set(lib, w);
  return w;
}
