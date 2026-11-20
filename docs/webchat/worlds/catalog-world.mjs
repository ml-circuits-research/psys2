// SPDX-License-Identifier: AGPL-3.0-only
// Build a World from the knowledge catalog by its own index: the schemas of the named modules and of
// everything they depend on become the World's library, and the shards a caller names are told as facts.
// Generic: no world, type or tab is named here. readText(path) reads a catalog file (index.json, schemas, shards).
import {World} from '../lib/vendor/sopworld/sopworld.mjs?v=47abc4a87a';

const MAX_MODULES = 128;

export async function catalogWorld(readText, { modules, shardsOf = () => [], use = modules, options = {} } = {}) {
  const index = JSON.parse(await readText('index.json'));
  const entries = new Map([...(index.worlds ?? []), ...(index.schemas ?? [])].map((entry) => [entry.id, entry]));
  // Each wave of schemas (the named modules, then what they depend on) and every named shard is read at once: the
  // reads are independent, and a catalog served over the network costs one round trip per wave, not one per file.
  const library = {};
  let wave = [...new Set(modules)];
  while (wave.length) {
    for (const id of wave) if (!entries.get(id)?.schema) throw Error('catalog-module-unavailable:' + id);
    if (Object.keys(library).length + wave.length > MAX_MODULES) throw Error('catalog-module-budget');
    const texts = await Promise.all(wave.map((id) => readText(entries.get(id).schema)));
    wave.forEach((id, n) => { library[id] = texts[n]; });
    wave = [...new Set(wave.flatMap((id) => entries.get(id).depends ?? []))].filter((id) => entries.has(id) && library[id] === undefined);
  }
  // options: World options a caller declares (a derivation depth budget), passed through unchanged.
  const world = new World({ ...options, library });
  const loaded = world.load(use.map((id, n) => `@catalog.use.${n} core.use world=${id}`).join('\n'));
  if (!loaded.ok) throw Error('catalog-load-refused');
  const paths = modules.flatMap((id) => shardsOf(entries.get(id))), shardTexts = await Promise.all(paths.map((path) => readText(path)));
  paths.forEach((path, n) => {
    const told = world.tell(shardTexts[n], { factsOnly: true });
    if (!told.ok) throw Error('catalog-shard-refused:' + path);
  });
  return world;
}
