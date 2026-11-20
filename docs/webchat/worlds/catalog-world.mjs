// SPDX-License-Identifier: AGPL-3.0-only
// Build a World from the knowledge catalog by its own index: the schemas of the named modules and of
// everything they depend on become the World's library, and the shards a caller names are told as facts.
// Generic: no world, type or tab is named here. readText(path) reads a catalog file (index.json, schemas, shards).
import {World} from '../lib/vendor/sopworld/sopworld.mjs?v=22a3f6e48e';

const MAX_MODULES = 128;

export async function catalogWorld(readText, { modules, shardsOf = () => [], use = modules, options = {} } = {}) {
  const index = JSON.parse(await readText('index.json'));
  const entries = new Map([...(index.worlds ?? []), ...(index.schemas ?? [])].map((entry) => [entry.id, entry]));
  const library = {}, pending = [...modules];
  while (pending.length) {
    const id = pending.pop();
    if (library[id] !== undefined) continue;
    const entry = entries.get(id);
    if (!entry?.schema) throw Error('catalog-module-unavailable:' + id);
    if (Object.keys(library).length >= MAX_MODULES) throw Error('catalog-module-budget');
    library[id] = await readText(entry.schema);
    for (const dependency of entry.depends ?? []) if (entries.has(dependency)) pending.push(dependency);
  }
  // options: World options a caller declares (a derivation depth budget), passed through unchanged.
  const world = new World({ ...options, library });
  const loaded = world.load(use.map((id, n) => `@catalog.use.${n} core.use world=${id}`).join('\n'));
  if (!loaded.ok) throw Error('catalog-load-refused');
  for (const id of modules) for (const path of shardsOf(entries.get(id))) {
    const told = world.tell(await readText(path), { factsOnly: true });
    if (!told.ok) throw Error('catalog-shard-refused:' + path);
  }
  return world;
}
