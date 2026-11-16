// SPDX-License-Identifier: AGPL-3.0-only
// One explicit application composition for browser packaging and shipped replay.
import { readFile } from 'node:fs/promises';
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../../src/worlds/index.mjs';
import { buildAll } from '../gen-ui-kb.mjs';
import { buildCards, cardsText } from '../build-world-cards.mjs';

export async function selectWorlds(loader, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Composition requires unique world identifiers');
  const available = new Set(await loader.listWorlds());
  for (const id of ids) if (!available.has(id)) throw new Error(`Composition names missing world ${id}`);
  const selected = new Set(ids);
  return {
    listWorlds: async () => [...selected],
    readFile: (id, file) => selected.has(id) ? loader.readFile(id, file) : Promise.resolve(null),
    loadOps: (id) => selected.has(id) ? loader.loadOps(id) : Promise.resolve(null),
    loadFns: (id) => selected.has(id) ? loader.loadFns(id) : Promise.resolve(null),
  };
}

export function validateDependencies(set) {
  const ids = new Set(set.list().map((w) => w.id));
  for (const w of set.list()) for (const kind of ['imports', 'reads', 'compose']) {
    for (const id of w[kind] ?? []) if (!ids.has(id)) throw new Error(`Composition: ${w.id} ${kind} missing world ${id}`);
  }
}

export async function createDemoLoader({ root = DEFAULT_ROOT } = {}) {
  const composition = JSON.parse(await readFile(new URL('./demo-composition.json', import.meta.url), 'utf8'));
  const loader = await selectWorlds(createFsLoader({ roots: [root] }), composition.worlds);
  const set = await loadWorlds(loader, { reasoner: 'matrix' });
  validateDependencies(set);
  // Generated navigation/help and routing cards must describe this application,
  // not every source fixture that happens to share the checkout.
  const kb = await buildAll({ set });
  kb['meta.worlds'] = cardsText(await buildCards(set));
  return { ...loader, readFile: (id, file) => file === 'kb.sop' && Object.hasOwn(kb, id) ? Promise.resolve(kb[id]) : loader.readFile(id, file) };
}
